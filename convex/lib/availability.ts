import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type Availability = "available" | "on_loan";

export async function approvedLoans(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

/** A tool is out once an approved loan has started, and stays out until returned, even if overdue. */
export function availabilityOf(approved: Doc<"loans">[], today: string): Availability {
  return approved.some((loan) => loan.startDate <= today) ? "on_loan" : "available";
}
