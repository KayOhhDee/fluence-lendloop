import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isoDay } from "./lib/dates";
import { loanStatusValidator } from "./lib/domain";
import { appError } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";
import { toLoanView } from "./loans";
import { softDeleteListing } from "./tools";

const LIST_LIMIT = 200;

export const allLoans = adminQuery({
  args: { status: v.optional(loanStatusValidator) },
  handler: async (ctx, { status }) => {
    const today = isoDay(Date.now());
    const loans = await (status
      ? ctx.db.query("loans").withIndex("by_status_end", (q) => q.eq("status", status))
      : ctx.db.query("loans")
    )
      .order("desc")
      .take(LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan, today)));
  },
});

export const allListings = adminQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_active", (q) => q.eq("removedAt", undefined))
      .order("desc")
      .take(LIST_LIMIT);
    return Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          id: tool._id,
          name: tool.name,
          category: tool.category,
          ownerName: owner?.name ?? "Unknown",
        };
      }),
    );
  },
});

/** Everyone with at least one listing. Addresses are left out: the trust decision doesn't need them. */
export const lenders = adminQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_active", (q) => q.eq("removedAt", undefined))
      .collect();
    const counts = new Map<Id<"users">, number>();
    for (const tool of tools) counts.set(tool.ownerId, (counts.get(tool.ownerId) ?? 0) + 1);

    const rows = await Promise.all(
      [...counts.entries()].map(async ([ownerId, listings]) => {
        const owner = await ctx.db.get(ownerId);
        return owner && { id: owner._id, name: owner.name, trustedLender: owner.trustedLender, listings };
      }),
    );
    return rows.filter((row) => row !== null).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const removeListing = adminMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "That listing no longer exists.");
    await softDeleteListing(ctx, tool);
    await ctx.db.insert("auditLog", {
      actorId: ctx.user._id,
      action: "listing.removed",
      targetId: toolId,
      detail: tool.name,
    });
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const target = await ctx.db.get(userId);
    if (!target) throw appError("NOT_FOUND", "That person no longer exists.");
    await ctx.db.patch(userId, { trustedLender: trusted });
    await ctx.db.insert("auditLog", {
      actorId: ctx.user._id,
      action: trusted ? "lender.trusted" : "lender.untrusted",
      targetId: userId,
    });
  },
});

export const automationHealth = adminQuery({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("notifications")
      .withIndex("by_status_next", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(25);
    const pending = await ctx.db
      .query("notifications")
      .withIndex("by_status_next", (q) => q.eq("status", "pending"))
      .take(101);
    const heartbeat = await ctx.db
      .query("automationHeartbeats")
      .withIndex("by_name", (q) => q.eq("name", "overdue-reminders"))
      .unique();
    const failures = await ctx.db
      .query("workflowFailures")
      .withIndex("by_occurred")
      .order("desc")
      .take(25);

    return {
      lastOverdueRunAt: heartbeat?.lastSeenAt ?? null,
      pendingCount: pending.length,
      failedNotifications: await Promise.all(
        failed.map(async (row) => {
          const loan = await ctx.db.get(row.loanId);
          return {
            id: row._id,
            event: row.event,
            toolName: loan?.toolName ?? "Unknown",
            attempts: row.attempts,
            lastError: row.lastError ?? null,
            at: row.updatedAt,
          };
        }),
      ),
      workflowFailures: failures.map((row) => ({
        id: row._id,
        source: row.source,
        workflow: row.workflow,
        node: row.node ?? null,
        message: row.message,
        at: row.occurredAt,
      })),
    };
  },
});

export const retryNotification = adminMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row) throw appError("NOT_FOUND", "That notification no longer exists.");
    if (row.status !== "failed") throw appError("CONFLICT", "Only failed notifications can be retried.");
    const now = Date.now();
    await ctx.db.patch(notificationId, { status: "pending", attempts: 0, nextAttemptAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { notificationId });
    await ctx.db.insert("auditLog", {
      actorId: ctx.user._id,
      action: "notification.retried",
      targetId: notificationId,
    });
  },
});

export const recentAudit = adminQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("auditLog").order("desc").take(25);
    return Promise.all(
      rows.map(async (row) => {
        const actor = await ctx.db.get(row.actorId);
        return {
          id: row._id,
          action: row.action,
          detail: row.detail ?? null,
          actorName: actor?.name ?? "Unknown",
          at: row._creationTime,
        };
      }),
    );
  },
});
