import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LoanEvent } from "./domain";

/**
 * Records a notification in the caller's transaction and schedules its delivery. Scheduling is
 * transactional too, so a state change and its notification either both happen or neither does.
 */
export async function enqueueNotification(
  ctx: MutationCtx,
  args: { loanId: Id<"loans">; event: LoanEvent; recipientId: Id<"users"> },
): Promise<void> {
  const now = Date.now();
  const notificationId = await ctx.db.insert("notifications", {
    ...args,
    eventId: crypto.randomUUID(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { notificationId });
}
