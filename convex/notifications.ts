import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { firstName } from "./lib/functions";
import { SIGNATURE_HEADER, signRequest } from "./lib/signature";

/**
 * Delivers the outbox to the n8n webhook, at-least-once:
 *
 *  claim    -> atomically takes a lease, so the retry timer and the sweeper can't both send a row
 *  deliver  -> signed POST. n8n only answers 2xx after it has actually sent the notification
 *  outcome  -> delivered, or back to pending with a backoff, or failed once attempts run out
 *
 * Convex scheduled actions don't retry on their own, so a crash mid-attempt would strand a row.
 * The sweeper cron picks those up once their lease lapses.
 */

export const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const LEASE_MS = 60_000;
const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
const SWEEP_BATCH = 50;

export const claim = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.db.get(notificationId);
    const now = Date.now();
    if (!row || row.status !== "pending" || row.nextAttemptAt > now) return null;

    const [loan, recipient] = await Promise.all([ctx.db.get(row.loanId), ctx.db.get(row.recipientId)]);
    if (!loan || !recipient) return null;

    await ctx.db.patch(notificationId, {
      attempts: row.attempts + 1,
      nextAttemptAt: now + LEASE_MS,
      updatedAt: now,
    });

    if (!recipient.email) return { payload: null };

    // Data minimization: this is everything n8n ever learns about a loan event.
    return {
      payload: {
        eventId: row.eventId,
        event: row.event,
        toolName: loan.toolName,
        startDate: loan.startDate,
        endDate: loan.endDate,
        recipient: { email: recipient.email, firstName: firstName(recipient.name) },
      },
    };
  },
});

export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const claimed = await ctx.runMutation(internal.notifications.claim, { notificationId });
    if (!claimed) return;

    const error = claimed.payload ? await postToN8n(claimed.payload) : "Recipient has no email address";
    if (error) {
      await ctx.runMutation(internal.notifications.recordFailure, { notificationId, error });
    } else {
      await ctx.runMutation(internal.notifications.markDelivered, { notificationId });
    }
  },
});

/** Returns a short description of what went wrong, or null on success. */
async function postToN8n(payload: unknown): Promise<string | null> {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) return "N8N_WEBHOOK_URL or N8N_WEBHOOK_SECRET is not set";

  const body = JSON.stringify(payload);
  try {
    const signature = await signRequest({
      secret,
      method: "POST",
      path: new URL(url).pathname,
      body,
      nowMs: Date.now(),
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? null : `n8n responded with HTTP ${response.status}`;
  } catch (err) {
    return err instanceof Error && err.name === "TimeoutError"
      ? "Timed out waiting for n8n"
      : "Could not reach n8n";
  }
}

export const recordFailure = internalMutation({
  args: { notificationId: v.id("notifications"), error: v.string() },
  handler: async (ctx, { notificationId, error }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status !== "pending") return;

    const now = Date.now();
    if (row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(notificationId, { status: "failed", lastError: error, updatedAt: now });
      return;
    }
    const delay = BACKOFF_MS[Math.min(row.attempts - 1, BACKOFF_MS.length - 1)];
    await ctx.db.patch(notificationId, { nextAttemptAt: now + delay, lastError: error, updatedAt: now });
    await ctx.scheduler.runAfter(delay, internal.notifications.deliver, { notificationId });
  },
});

export const markDelivered = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row || row.status === "delivered") return;
    const now = Date.now();
    await ctx.db.patch(notificationId, {
      status: "delivered",
      deliveredAt: now,
      lastError: undefined,
      updatedAt: now,
    });
  },
});

/**
 * n8n's write-back, sent right after the notification goes out. If Convex's request timed out but
 * n8n finished anyway, this marks the row delivered so the retry finds nothing to do and the
 * recipient isn't notified twice. Safe to call repeatedly.
 */
export const acknowledge = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db
      .query("notifications")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .unique();
    if (!row) return "unknown" as const;
    if (row.status === "delivered") return "noop" as const;
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "delivered", deliveredAt: now, lastError: undefined, updatedAt: now });
    return "updated" as const;
  },
});

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("notifications")
      .withIndex("by_status_next", (q) => q.eq("status", "pending").lte("nextAttemptAt", Date.now()))
      .take(SWEEP_BATCH);
    for (const row of due) {
      await ctx.scheduler.runAfter(0, internal.notifications.deliver, { notificationId: row._id });
    }
    return due.length;
  },
});
