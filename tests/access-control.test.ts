import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { addUser, day, setup, TOOL } from "./helpers";

describe("public access", () => {
  test("the public list exposes only id, name and category", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    await owner.as.mutation(api.tools.create, TOOL);

    const rows = await t.query(api.tools.listPublic, {});
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["category", "id", "name"]);
  });

  test("tools out on loan are hidden from the public list", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    const borrower = await addUser(t, "borrower");
    const toolId = await owner.as.mutation(api.tools.create, TOOL);
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });

    expect(await t.query(api.tools.listPublic, {})).toHaveLength(1);
    await owner.as.mutation(api.loans.approve, { loanId });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
  });

  test.each([
    ["tools.list", () => api.tools.list],
    ["tools.listMine", () => api.tools.listMine],
    ["loans.myRequests", () => api.loans.myRequests],
    ["loans.incoming", () => api.loans.incoming],
    ["admin.allLoans", () => api.admin.allLoans],
  ])("%s rejects anonymous callers", async (_name, fn) => {
    await expect(setup().query(fn() as typeof api.tools.listMine, {})).rejects.toThrow(/sign in/i);
  });

  test("anonymous callers cannot create listings", async () => {
    await expect(setup().mutation(api.tools.create, TOOL)).rejects.toThrow(/sign in/i);
  });
});

describe("account setup", () => {
  test("new accounts are always plain users", async () => {
    const t = setup();
    const as = t.withIdentity({ tokenIdentifier: "test|new", name: "New Person", email: "new@example.test" });
    await as.mutation(api.users.ensureCurrent, {});
    expect((await as.query(api.users.me, {}))?.role).toBe("user");
  });

  test("refreshing a profile does not change an existing role", async () => {
    const t = setup();
    const admin = await addUser(t, "boss", { role: "admin" });
    await admin.as.mutation(api.users.ensureCurrent, {});
    expect((await admin.as.query(api.users.me, {}))?.role).toBe("admin");
  });

  test("a token without name or email claims keeps the stored profile", async () => {
    const t = setup();
    const tokenIdentifier = "test|sparse";
    await t.withIdentity({ tokenIdentifier, name: "Real Name", email: "real@example.test" }).mutation(
      api.users.ensureCurrent,
      {},
    );

    await t.withIdentity({ tokenIdentifier }).mutation(api.users.ensureCurrent, {});

    const stored = await t.run((ctx) => ctx.db.query("users").first());
    expect(stored).toMatchObject({ name: "Real Name", email: "real@example.test" });
  });

  test("a token with new claims still updates the stored profile", async () => {
    const t = setup();
    const tokenIdentifier = "test|renamed";
    await t.withIdentity({ tokenIdentifier }).mutation(api.users.ensureCurrent, {});
    expect((await t.run((ctx) => ctx.db.query("users").first()))?.name).toBe("Neighbor");

    await t
      .withIdentity({ tokenIdentifier, givenName: "Ama", familyName: "Boateng", email: "ama@example.test" })
      .mutation(api.users.ensureCurrent, {});

    const stored = await t.run((ctx) => ctx.db.query("users").first());
    expect(stored).toMatchObject({ name: "Ama Boateng", email: "ama@example.test" });
  });

  test("roles change through the internal function", async () => {
    const t = setup();
    const person = await addUser(t, "person");
    await t.mutation(internal.users.setRole, { email: "person@example.test", role: "admin" });
    expect((await person.as.query(api.users.me, {}))?.role).toBe("admin");
  });
});

describe("listing ownership", () => {
  test("users cannot edit or delete someone else's listing", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    const other = await addUser(t, "other");
    const toolId = await owner.as.mutation(api.tools.create, TOOL);

    await expect(other.as.mutation(api.tools.update, { toolId, ...TOOL, name: "Mine now" })).rejects.toThrow(
      /your own listings/,
    );
    await expect(other.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/your own listings/);
  });

  test("admin rights do not extend to editing other people's listings", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    const admin = await addUser(t, "boss", { role: "admin" });
    const toolId = await owner.as.mutation(api.tools.create, TOOL);
    await expect(admin.as.mutation(api.tools.update, { toolId, ...TOOL, name: "Edited" })).rejects.toThrow(
      /your own listings/,
    );
  });

  test("the board never carries owner email", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    const viewer = await addUser(t, "viewer");
    await owner.as.mutation(api.tools.create, TOOL);
    const rows = await viewer.as.query(api.tools.list, {});
    expect(JSON.stringify(rows)).not.toContain("example.test");
    expect(rows[0].ownerName).toBe("owner");
  });

  test("input limits are enforced on the server", async () => {
    const t = setup();
    const owner = await addUser(t, "owner");
    await expect(owner.as.mutation(api.tools.create, { ...TOOL, name: "   " })).rejects.toThrow(/Name must be/);
    await expect(owner.as.mutation(api.tools.create, { ...TOOL, name: "x".repeat(81) })).rejects.toThrow(
      /Name must be/,
    );
  });
});

describe("loan permissions", () => {
  async function pendingLoan() {
    const t = setup();
    const lender = await addUser(t, "lender");
    const borrower = await addUser(t, "borrower");
    const stranger = await addUser(t, "stranger");
    const admin = await addUser(t, "boss", { role: "admin" });
    const toolId = await lender.as.mutation(api.tools.create, TOOL);
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    return { t, lender, borrower, stranger, admin, toolId, loanId };
  }

  test("only the lender can approve, decline or mark returned", async () => {
    const { lender, borrower, stranger, admin, loanId } = await pendingLoan();
    for (const caller of [borrower, stranger, admin]) {
      await expect(caller.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/owner/);
      await expect(caller.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/owner/);
    }
    await lender.as.mutation(api.loans.approve, { loanId });
    for (const caller of [borrower, stranger, admin]) {
      await expect(caller.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/owner/);
    }
  });

  test("strangers cannot cancel", async () => {
    const { stranger, loanId } = await pendingLoan();
    await expect(stranger.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/isn't your loan/);
  });

  test("you cannot borrow your own tool", async () => {
    const { lender, toolId } = await pendingLoan();
    await expect(
      lender.as.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(6) }),
    ).rejects.toThrow(/your own tool/);
  });

  test("the request lists are scoped to the caller", async () => {
    const { lender, borrower, stranger } = await pendingLoan();
    expect(await borrower.as.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await borrower.as.query(api.loans.incoming, {})).toHaveLength(0);
    expect(await lender.as.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await lender.as.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await stranger.as.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await stranger.as.query(api.loans.incoming, {})).toHaveLength(0);
  });
});

describe("admin capabilities", () => {
  test("non-admins are refused every admin function", async () => {
    const t = setup();
    const user = await addUser(t, "user");
    const toolId = await user.as.mutation(api.tools.create, TOOL);

    await expect(user.as.query(api.admin.allLoans, {})).rejects.toThrow(/Admins only/);
    await expect(user.as.query(api.admin.allListings, {})).rejects.toThrow(/Admins only/);
    await expect(user.as.query(api.admin.lenders, {})).rejects.toThrow(/Admins only/);
    await expect(user.as.query(api.admin.automationHealth, {})).rejects.toThrow(/Admins only/);
    await expect(user.as.query(api.admin.recentAudit, {})).rejects.toThrow(/Admins only/);
    await expect(user.as.mutation(api.admin.removeListing, { toolId })).rejects.toThrow(/Admins only/);
    await expect(user.as.mutation(api.admin.setTrustedLender, { userId: user.id, trusted: true })).rejects.toThrow(
      /Admins only/,
    );
  });

  test("admins can see all loans, remove any listing and mark a trusted lender", async () => {
    const t = setup();
    const lender = await addUser(t, "lender");
    const borrower = await addUser(t, "borrower");
    const admin = await addUser(t, "boss", { role: "admin" });
    const toolId = await lender.as.mutation(api.tools.create, TOOL);
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });

    expect(await admin.as.query(api.admin.allLoans, {})).toHaveLength(1);

    await admin.as.mutation(api.admin.setTrustedLender, { userId: lender.id, trusted: true });
    expect((await borrower.as.query(api.tools.list, {}))[0].ownerTrusted).toBe(true);

    await admin.as.mutation(api.admin.removeListing, { toolId });
    expect(await borrower.as.query(api.tools.list, {})).toHaveLength(0);
    // Open requests on the removed listing are closed, not orphaned.
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("declined");
    expect((await admin.as.query(api.admin.recentAudit, {})).map((row) => row.action)).toContain("listing.removed");
  });
});
