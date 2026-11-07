import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { addUser, day, setup, TOOL } from "./helpers";

async function board() {
  const t = setup();
  const lender = await addUser(t, "lender");
  const borrower = await addUser(t, "borrower");
  const other = await addUser(t, "other");
  const toolId = await lender.as.mutation(api.tools.create, TOOL);
  return { t, lender, borrower, other, toolId };
}

describe("requesting", () => {
  test("rejects bad date ranges", async () => {
    const { borrower, toolId } = await board();
    const request = (startDate: string, endDate: string) =>
      borrower.as.mutation(api.loans.request, { toolId, startDate, endDate });

    await expect(request("not-a-date", day(1))).rejects.toThrow(/valid dates/);
    await expect(request("2030-02-31", "2030-03-01")).rejects.toThrow(/valid dates/);
    await expect(request(day(3), day(1))).rejects.toThrow(/on or after/);
    await expect(request(day(-5), day(1))).rejects.toThrow(/past/);
    await expect(request(day(1), day(120))).rejects.toThrow(/up to 90 days/);
  });

  test("rejects dates overlapping an approved loan, and allows the days after it", async () => {
    const { lender, borrower, other, toolId } = await board();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    await lender.as.mutation(api.loans.approve, { loanId });

    await expect(
      other.as.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(5) }),
    ).rejects.toThrow(/already booked/);
    await expect(
      other.as.mutation(api.loans.request, { toolId, startDate: day(4), endDate: day(5) }),
    ).resolves.toBeTruthy();
  });

  test("rejects a duplicate open request from the same person", async () => {
    const { borrower, toolId } = await board();
    await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    await expect(
      borrower.as.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) }),
    ).rejects.toThrow(/open request/);
  });
});

describe("state transitions", () => {
  test("approving declines competing requests for the same dates only", async () => {
    const { t, lender, borrower, other, toolId } = await board();
    const winner = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    const clash = await other.as.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    const later = await other.as.mutation(api.loans.request, { toolId, startDate: day(10), endDate: day(11) });

    await lender.as.mutation(api.loans.approve, { loanId: winner });

    expect((await t.run((ctx) => ctx.db.get(clash)))?.status).toBe("declined");
    expect((await t.run((ctx) => ctx.db.get(later)))?.status).toBe("pending");
  });

  test("finished loans cannot be acted on again", async () => {
    const { lender, borrower, toolId } = await board();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });

    await expect(lender.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/already pending/);
    await lender.as.mutation(api.loans.approve, { loanId });
    await expect(lender.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/already approved/);
    await lender.as.mutation(api.loans.markReturned, { loanId });
    await expect(lender.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/already returned/);
    await expect(borrower.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/already returned/);
  });

  test("a started loan cannot be cancelled, an upcoming one can", async () => {
    const { lender, borrower, other, toolId } = await board();
    const started = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });
    await lender.as.mutation(api.loans.approve, { loanId: started });
    await expect(borrower.as.mutation(api.loans.cancel, { loanId: started })).rejects.toThrow(/already started/);

    const upcoming = await other.as.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(6) });
    await lender.as.mutation(api.loans.approve, { loanId: upcoming });
    await expect(lender.as.mutation(api.loans.cancel, { loanId: upcoming })).resolves.toBeNull();
  });

  test("returning a tool makes it available again", async () => {
    const { lender, borrower, toolId } = await board();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });
    await lender.as.mutation(api.loans.approve, { loanId });
    expect((await borrower.as.query(api.tools.list, {}))[0].availability).toBe("on_loan");
    await lender.as.mutation(api.loans.markReturned, { loanId });
    expect((await borrower.as.query(api.tools.list, {}))[0].availability).toBe("available");
  });
});

describe("removing listings", () => {
  test("owners can't remove a tool with an agreed loan", async () => {
    const { lender, borrower, toolId } = await board();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await lender.as.mutation(api.loans.approve, { loanId });
    await expect(lender.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/agreed loan/);
  });

  test("an admin removal leaves a loan in progress open so it can still be returned", async () => {
    const { t, lender, borrower, toolId } = await board();
    const admin = await addUser(t, "boss", { role: "admin" });
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });
    await lender.as.mutation(api.loans.approve, { loanId });

    await admin.as.mutation(api.admin.removeListing, { toolId });
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("approved");
    await lender.as.mutation(api.loans.markReturned, { loanId });
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("returned");
  });

  test("history survives removal and shows the original name", async () => {
    const { lender, borrower, toolId } = await board();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await lender.as.mutation(api.loans.decline, { loanId });
    await lender.as.mutation(api.tools.remove, { toolId });
    expect((await borrower.as.query(api.loans.myRequests, {}))[0].toolName).toBe(TOOL.name);
  });
});
