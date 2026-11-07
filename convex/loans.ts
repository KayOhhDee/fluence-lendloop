import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { loanActivity } from "./lib/activity";
import { approvedLoans } from "./lib/availability";
import { addDays, daysBetween, isoDay, isValidIsoDate, rangesOverlap } from "./lib/dates";
import { LIMITS } from "./lib/domain";
import { appError } from "./lib/errors";
import { firstName, userMutation, userQuery } from "./lib/functions";
import { enqueueNotification } from "./lib/outbox";

const LIST_LIMIT = 100;

function validateDateRange(startDate: string, endDate: string, today: string) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    throw appError("INVALID_INPUT", "Please choose valid dates.");
  }
  if (endDate < startDate) throw appError("INVALID_INPUT", "The end date must be on or after the start date.");
  // One day of grace: "today" is UTC on the server, but a person west of UTC may still be on yesterday.
  if (startDate < addDays(today, -1)) throw appError("INVALID_INPUT", "The start date cannot be in the past.");
  if (daysBetween(today, startDate) > LIMITS.maxBookingLeadDays) {
    throw appError("INVALID_INPUT", "Loans can be booked up to a year ahead.");
  }
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    throw appError("INVALID_INPUT", `Loans can last up to ${LIMITS.maxLoanDays} days.`);
  }
}

export const request = userMutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const range = { startDate, endDate };
    validateDateRange(startDate, endDate, isoDay(Date.now()));

    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "That listing no longer exists.");
    if (tool.ownerId === ctx.user._id) throw appError("FORBIDDEN", "You can't borrow your own tool.");

    if ((await approvedLoans(ctx, toolId)).some((loan) => rangesOverlap(loan, range))) {
      throw appError("CONFLICT", "This tool is already booked for those dates.");
    }

    const myLoans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.user._id))
      .collect();
    const myPending = myLoans.filter((loan) => loan.status === "pending");
    if (myPending.length >= LIMITS.maxPendingRequestsPerBorrower) {
      throw appError("CONFLICT", "You have too many open requests. Cancel one or wait for a reply.");
    }
    if (myPending.some((loan) => loan.toolId === toolId && rangesOverlap(loan, range))) {
      throw appError("CONFLICT", "You already have an open request for those dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      lenderId: tool.ownerId,
      borrowerId: ctx.user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await enqueueNotification(ctx, { loanId, event: "loan.requested", recipientId: tool.ownerId });
    return loanId;
  },
});

async function getLoan(ctx: MutationCtx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "That loan no longer exists.");
  return loan;
}

function assertLender(loan: Doc<"loans">, userId: Id<"users">) {
  if (loan.lenderId !== userId) throw appError("FORBIDDEN", "Only the tool's owner can do that.");
}

function assertStatus(loan: Doc<"loans">, expected: Doc<"loans">["status"]) {
  if (loan.status !== expected) throw appError("CONFLICT", `This loan is already ${loan.status}.`);
}

export const approve = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "pending");

    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt !== undefined) throw appError("CONFLICT", "That listing has been removed.");
    if (loan.endDate < isoDay(Date.now())) {
      throw appError("CONFLICT", "The requested dates have passed. Decline this one instead.");
    }
    // Convex mutations are serializable, so two concurrent approvals cannot both pass this check.
    if ((await approvedLoans(ctx, loan.toolId)).some((other) => rangesOverlap(other, loan))) {
      throw appError("CONFLICT", "You've already approved another loan for those dates.");
    }

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueNotification(ctx, { loanId, event: "loan.approved", recipientId: loan.borrowerId });

    // Anyone else asking for those dates can now only be told no, so tell them straight away.
    const competing = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "pending"))
      .collect();
    for (const other of competing) {
      if (other._id !== loanId && rangesOverlap(other, loan)) {
        await ctx.db.patch(other._id, { status: "declined", decidedAt: now });
        await enqueueNotification(ctx, { loanId: other._id, event: "loan.declined", recipientId: other.borrowerId });
      }
    }
  },
});

export const decline = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "pending");
    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await enqueueNotification(ctx, { loanId, event: "loan.declined", recipientId: loan.borrowerId });
  },
});

/**
 * Lender only. The borrower has every incentive to say it's back, and doing so would also silence
 * their overdue reminders, so the person who receives the tool is the one who confirms it.
 */
export const markReturned = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "approved");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueNotification(ctx, { loanId, event: "loan.returned", recipientId: loan.borrowerId });
  },
});

/** Either party may back out, up until an approved loan has started. */
export const cancel = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    const isBorrower = loan.borrowerId === ctx.user._id;
    const isLender = loan.lenderId === ctx.user._id;
    if (!isBorrower && !isLender) throw appError("FORBIDDEN", "This isn't your loan.");

    if (loan.status === "pending") {
      if (!isBorrower) throw appError("FORBIDDEN", "Decline the request instead.");
    } else if (loan.status === "approved") {
      if (loan.startDate <= isoDay(Date.now())) {
        throw appError("CONFLICT", "This loan has already started.");
      }
    } else {
      throw appError("CONFLICT", `This loan is already ${loan.status}.`);
    }

    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueNotification(ctx, {
      loanId,
      event: "loan.cancelled",
      recipientId: isBorrower ? loan.lenderId : loan.borrowerId,
    });
  },
});

/** Shared loan row for the UI. The other party is shown by first name only, never by address. */
export async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
  const [lender, borrower] = await Promise.all([ctx.db.get(loan.lenderId), ctx.db.get(loan.borrowerId)]);
  return {
    id: loan._id,
    toolName: loan.toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    isOverdue: loan.status === "approved" && loan.endDate < today,
    hasStarted: loan.startDate <= today,
    lenderName: lender ? firstName(lender.name) : "Neighbor",
    lenderTrusted: lender?.trustedLender ?? false,
    borrowerName: borrower ? firstName(borrower.name) : "Neighbor",
    activity: await loanActivity(ctx, loan),
  };
}

export const myRequests = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = isoDay(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.user._id))
      .order("desc")
      .take(LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan, today)));
  },
});

export const incoming = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = isoDay(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", ctx.user._id))
      .order("desc")
      .take(LIST_LIMIT);
    return Promise.all(loans.map((loan) => toLoanView(ctx, loan, today)));
  },
});
