import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { daysBetween, isoDay } from "./lib/dates";
import { firstName } from "./lib/functions";

const OVERDUE_BATCH = 500;
const OVERDUE_HEARTBEAT = "overdue-reminders";
// A daily job plus some slack for a slow or rescheduled run.
const MAX_SILENCE_MS = 26 * 60 * 60 * 1000;

export function reminderKey(loanId: string, date: string) {
  return `${loanId}:${date}`;
}

async function recordFailureOnce(
  ctx: MutationCtx,
  row: { key: string; source: "n8n" | "watchdog"; workflow: string; node?: string; message: string; occurredAt: number },
) {
  const existing = await ctx.db
    .query("workflowFailures")
    .withIndex("by_key", (q) => q.eq("key", row.key))
    .unique();
  if (existing) return "noop" as const;
  await ctx.db.insert("workflowFailures", row);
  return "created" as const;
}

/**
 * Loans still owing a reminder today. Convex issues the idempotency key, so a run that retries
 * across midnight, or a second run on the same day, can't invent a duplicate. Reading this list is
 * also the heartbeat that tells the watchdog the schedule is alive.
 */
export const fetchOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = isoDay(now);

    const heartbeat = await ctx.db
      .query("automationHeartbeats")
      .withIndex("by_name", (q) => q.eq("name", OVERDUE_HEARTBEAT))
      .unique();
    if (heartbeat) await ctx.db.patch(heartbeat._id, { lastSeenAt: now });
    else await ctx.db.insert("automationHeartbeats", { name: OVERDUE_HEARTBEAT, lastSeenAt: now });

    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(OVERDUE_BATCH);

    const loans = [];
    for (const loan of overdue) {
      const key = reminderKey(loan._id, today);
      const reminder = await ctx.db
        .query("reminders")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (reminder?.status === "sent") continue;

      const borrower = await ctx.db.get(loan.borrowerId);
      if (!borrower?.email) continue;

      // Data minimization: only what the reminder says, and nothing about the lender.
      loans.push({
        reminderKey: key,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        recipient: { email: borrower.email, firstName: firstName(borrower.name) },
      });
    }
    return { date: today, loans };
  },
});

/**
 * Upserts on the reminder key, so retrying a write-back changes nothing. "sent" is final: a late
 * or out-of-order "failed" can't overwrite it, which would otherwise trigger a second reminder.
 */
export const recordReminderResults = internalMutation({
  args: {
    executionId: v.optional(v.string()),
    results: v.array(
      v.object({
        reminderKey: v.string(),
        status: v.union(v.literal("sent"), v.literal("failed")),
        error: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { executionId, results }) => {
    const counts = { created: 0, updated: 0, noop: 0, unknown: 0 };
    const now = Date.now();

    for (const result of results) {
      const [rawLoanId, date] = result.reminderKey.split(":");
      const loanId = ctx.db.normalizeId("loans", rawLoanId ?? "");
      if (!loanId || !date || !(await ctx.db.get(loanId))) {
        counts.unknown++;
        continue;
      }

      const existing = await ctx.db
        .query("reminders")
        .withIndex("by_key", (q) => q.eq("key", result.reminderKey))
        .unique();

      if (!existing) {
        await ctx.db.insert("reminders", {
          key: result.reminderKey,
          loanId,
          date,
          status: result.status,
          lastError: result.error,
          executionId,
          updatedAt: now,
        });
        counts.created++;
      } else if (existing.status === "sent" || existing.status === result.status) {
        counts.noop++;
      } else {
        await ctx.db.patch(existing._id, {
          status: result.status,
          lastError: result.error,
          executionId,
          updatedAt: now,
        });
        counts.updated++;
      }
    }
    return counts;
  },
});

/** Called by the n8n error workflow. Keyed on the execution, so a retried report is a no-op. */
export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, { executionId, workflow, node, message }) => {
    return recordFailureOnce(ctx, {
      key: `n8n:${executionId}`,
      source: "n8n",
      workflow,
      node,
      message,
      occurredAt: Date.now(),
    });
  },
});

/**
 * The n8n error workflow can't report a run that never started (n8n down, workflow deactivated),
 * so this cron checks from the other side: if the daily fetch has gone quiet, raise a failure.
 */
export const checkOverdueRunWatchdog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const heartbeat = await ctx.db
      .query("automationHeartbeats")
      .withIndex("by_name", (q) => q.eq("name", OVERDUE_HEARTBEAT))
      .unique();
    if (heartbeat && now - heartbeat.lastSeenAt <= MAX_SILENCE_MS) return "healthy" as const;

    return recordFailureOnce(ctx, {
      key: `watchdog:${OVERDUE_HEARTBEAT}:${isoDay(now)}`,
      source: "watchdog",
      workflow: "LendLoop - Overdue Reminders",
      message: heartbeat
        ? "The overdue reminder workflow has not run in over 26 hours."
        : "The overdue reminder workflow has never run.",
      occurredAt: now,
    });
  },
});
