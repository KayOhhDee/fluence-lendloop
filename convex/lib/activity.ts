import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type ActivityItem = {
  id: string;
  label: string;
  at: number;
  state: "ok" | "pending" | "failed";
};

const EVENT_NOUN: Record<Doc<"notifications">["event"], string> = {
  "loan.requested": "Request",
  "loan.approved": "Approval",
  "loan.declined": "Decline",
  "loan.cancelled": "Cancellation",
  "loan.returned": "Return",
};

const ACTIVITY_LIMIT = 5;

/** The automation history shown on a loan. Addresses and raw error text are deliberately left out. */
export async function loanActivity(
  ctx: QueryCtx,
  loan: Doc<"loans">,
): Promise<ActivityItem[]> {
  const [notifications, reminders] = await Promise.all([
    ctx.db
      .query("notifications")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id as Id<"loans">))
      .collect(),
    ctx.db
      .query("reminders")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id as Id<"loans">))
      .collect(),
  ]);

  const items: ActivityItem[] = [
    ...notifications.map((row): ActivityItem => {
      const who = row.recipientId === loan.lenderId ? "lender" : "borrower";
      const noun = EVENT_NOUN[row.event];
      if (row.status === "delivered") {
        return { id: row._id, label: `${noun} notice sent to ${who}`, at: row.deliveredAt ?? row.updatedAt, state: "ok" };
      }
      if (row.status === "failed") {
        return { id: row._id, label: `${noun} notice to ${who} failed`, at: row.updatedAt, state: "failed" };
      }
      return { id: row._id, label: `${noun} notice to ${who} queued`, at: row.updatedAt, state: "pending" };
    }),
    ...reminders.map(
      (row): ActivityItem => ({
        id: row._id,
        label: row.status === "sent" ? "Overdue reminder sent" : "Overdue reminder failed",
        at: row.updatedAt,
        state: row.status === "sent" ? "ok" : "failed",
      }),
    ),
  ];

  return items.sort((a, b) => b.at - a.at).slice(0, ACTIVITY_LIMIT);
}
