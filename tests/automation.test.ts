import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { SIGNATURE_HEADER, signRequest, verifyRequest } from "../convex/lib/signature";
import { MAX_ATTEMPTS } from "../convex/notifications";
import { addUser, day, setup, TOOL, type T } from "./helpers";

const WEBHOOK_URL = "https://n8n.test/webhook/lendloop-loan-events";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK_URL);
  vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
  vi.stubEnv("CONVEX_INBOUND_SECRET", "inbound-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const drain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function requestedLoan(t: T) {
  const lender = await addUser(t, "lender", { name: "Lena Lender" });
  const borrower = await addUser(t, "borrower", { name: "Bo Borrower" });
  const toolId = await lender.as.mutation(api.tools.create, TOOL);
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
  return { lender, borrower, toolId, loanId };
}

async function notifications(t: T) {
  return t.run((ctx) => ctx.db.query("notifications").collect());
}

async function overdueLoan(t: T) {
  const lender = await addUser(t, "lender", { name: "Lena Lender" });
  const borrower = await addUser(t, "borrower", { name: "Bo Borrower" });
  const toolId = await lender.as.mutation(api.tools.create, TOOL);
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId,
      toolName: TOOL.name,
      lenderId: lender.id,
      borrowerId: borrower.id,
      startDate: day(-10),
      endDate: day(-2),
      status: "approved",
    }),
  );
  return { lender, borrower, loanId };
}

async function signedFetch(t: T, method: "GET" | "POST", path: string, payload?: unknown) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const signature = await signRequest({ secret: "inbound-secret", method, path, body, nowMs: Date.now() });
  return t.fetch(path, {
    method,
    headers: { [SIGNATURE_HEADER]: signature, "Content-Type": "application/json" },
    ...(method === "POST" ? { body } : {}),
  });
}

describe("signature scheme", () => {
  const base = { secret: "s", method: "POST", path: "/x", body: '{"a":1}', nowMs: 1_700_000_000_000 };

  test("accepts a valid signature", async () => {
    const header = await signRequest(base);
    expect(await verifyRequest({ ...base, header })).toBe(true);
  });

  test.each([
    ["a tampered body", { body: '{"a":2}' }],
    ["a different path", { path: "/y" }],
    ["a different method", { method: "GET" }],
    ["the wrong secret", { secret: "other" }],
    ["an expired timestamp", { nowMs: base.nowMs + 301_000 }],
  ])("rejects %s", async (_name, change) => {
    const header = await signRequest(base);
    expect(await verifyRequest({ ...base, ...change, header })).toBe(false);
  });

  test.each([[null], ["garbage"], ["t=1,v1=abc"]])("rejects the malformed header %s", async (header) => {
    expect(await verifyRequest({ ...base, header })).toBe(false);
  });
});

describe("outbound notifications", () => {
  test("sends a signed payload holding only the fields the notification needs", async () => {
    const t = setup();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestedLoan(t);
    await drain(t);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(WEBHOOK_URL);

    const payload = JSON.parse(init.body as string);
    expect(Object.keys(payload).sort()).toEqual(["endDate", "event", "eventId", "recipient", "startDate", "toolName"]);
    expect(payload.recipient).toEqual({ email: "lender@example.test", firstName: "Lena" });
    // The other party's identity never leaves Convex.
    expect(init.body).not.toContain("borrower");
    expect(init.body).not.toContain("Bo");

    expect(
      await verifyRequest({
        secret: "outbound-secret",
        header: init.headers[SIGNATURE_HEADER],
        method: "POST",
        path: "/webhook/lendloop-loan-events",
        body: init.body as string,
        nowMs: Date.now(),
      }),
    ).toBe(true);
    expect((await notifications(t))[0].status).toBe("delivered");
  });

  test("each status change notifies the right person", async () => {
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const { lender, borrower, loanId } = await requestedLoan(t);
    await lender.as.mutation(api.loans.approve, { loanId });
    await lender.as.mutation(api.loans.markReturned, { loanId });
    await drain(t);

    const rows = await notifications(t);
    expect(rows.map((row) => [row.event, row.recipientId])).toEqual([
      ["loan.requested", lender.id],
      ["loan.approved", borrower.id],
      ["loan.returned", borrower.id],
    ]);
  });

  test("retries with the same event id, then succeeds", async () => {
    const t = setup();
    const ids: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      ids.push(JSON.parse(init.body as string).eventId);
      return new Response("{}", { status: ids.length < 3 ? 500 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestedLoan(t);
    await drain(t);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Set(ids).size).toBe(1);
    const [row] = await notifications(t);
    expect(row.status).toBe("delivered");
    expect(row.attempts).toBe(3);
    expect(row.lastError).toBeUndefined();
  });

  test("gives up visibly after the final attempt, and an admin can retry it", async () => {
    const t = setup();
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused to secret-host");
    });
    vi.stubGlobal("fetch", fetchMock);
    const admin = await addUser(t, "boss", { role: "admin" });
    const { borrower } = await requestedLoan(t);
    await drain(t);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const health = await admin.as.query(api.admin.automationHealth, {});
    expect(health.failedNotifications).toHaveLength(1);
    expect(health.failedNotifications[0].lastError).toBe("Could not reach n8n");

    // Visible to the people involved, without the internal error text.
    const [loan] = await borrower.as.query(api.loans.myRequests, {});
    expect(loan.activity[0]).toMatchObject({ label: "Request notice to lender failed", state: "failed" });
    expect(JSON.stringify(loan)).not.toContain("Could not reach");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    await admin.as.mutation(api.admin.retryNotification, { notificationId: health.failedNotifications[0].id });
    await drain(t);
    expect((await notifications(t))[0].status).toBe("delivered");
  });

  test("a missing webhook configuration is recorded as a failure, not swallowed", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const t = setup();
    vi.stubGlobal("fetch", vi.fn());
    await requestedLoan(t);
    await drain(t);
    const [row] = await notifications(t);
    expect(row.status).toBe("failed");
    expect(row.lastError).toMatch(/not set/);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("the lease stops two workers sending the same row", async () => {
    const t = setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    await requestedLoan(t);
    const [row] = await notifications(t);

    const first = await t.mutation(internal.notifications.claim, { notificationId: row._id });
    const second = await t.mutation(internal.notifications.claim, { notificationId: row._id });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  test("the sweeper recovers a row stranded by a crash, once its lease lapses", async () => {
    const t = setup();
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await requestedLoan(t);
    const [row] = await notifications(t);
    // Simulates an action dying straight after claiming.
    await t.mutation(internal.notifications.claim, { notificationId: row._id });

    expect(await t.mutation(internal.notifications.sweep, {})).toBe(0);
    vi.advanceTimersByTime(61_000);
    expect(await t.mutation(internal.notifications.sweep, {})).toBe(1);
    await drain(t);
    expect((await notifications(t))[0].status).toBe("delivered");
  });

  test("an acknowledgement from n8n cancels a pending retry", async () => {
    const t = setup();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 504 }));
    vi.stubGlobal("fetch", fetchMock);
    await requestedLoan(t);
    await t.finishInProgressScheduledFunctions();
    const callsBefore = fetchMock.mock.calls.length;
    const [row] = await notifications(t);

    const response = await signedFetch(t, "POST", "/n8n/notification-status", { eventId: row.eventId });
    expect(await response.json()).toEqual({ outcome: "updated" });
    await drain(t);

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect((await notifications(t))[0].status).toBe("delivered");

    const again = await signedFetch(t, "POST", "/n8n/notification-status", { eventId: row.eventId });
    expect(await again.json()).toEqual({ outcome: "noop" });
  });
});

describe("n8n-facing HTTP endpoints", () => {
  test.each([
    ["GET", "/n8n/overdue-loans"],
    ["POST", "/n8n/reminder-status"],
    ["POST", "/n8n/notification-status"],
    ["POST", "/n8n/workflow-failures"],
  ])("%s %s rejects unsigned requests", async (method, path) => {
    const response = await setup().fetch(path, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    expect(response.status).toBe(401);
  });

  test("a signature made for one endpoint is refused on another", async () => {
    const t = setup();
    const signature = await signRequest({
      secret: "inbound-secret",
      method: "POST",
      path: "/n8n/notification-status",
      body: "{}",
      nowMs: Date.now(),
    });
    const response = await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: { [SIGNATURE_HEADER]: signature },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });

  test("the outbound secret is not accepted inbound", async () => {
    const t = setup();
    const signature = await signRequest({
      secret: "outbound-secret",
      method: "GET",
      path: "/n8n/overdue-loans",
      body: "",
      nowMs: Date.now(),
    });
    const response = await t.fetch("/n8n/overdue-loans", { headers: { [SIGNATURE_HEADER]: signature } });
    expect(response.status).toBe(401);
  });

  test("fails closed when no secret is configured", async () => {
    vi.stubEnv("CONVEX_INBOUND_SECRET", "");
    const response = await setup().fetch("/n8n/overdue-loans");
    expect(response.status).toBe(503);
  });

  test("rejects well-signed but malformed bodies", async () => {
    const response = await signedFetch(setup(), "POST", "/n8n/reminder-status", { results: "nope" });
    expect(response.status).toBe(400);
  });
});

describe("overdue reminders", () => {
  test("lists only overdue loans, and only what the reminder needs", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const response = await signedFetch(t, "GET", "/n8n/overdue-loans");
    expect(response.status).toBe(200);

    const { date, loans } = await response.json();
    expect(date).toBe(day(0));
    expect(loans).toEqual([
      {
        reminderKey: `${loanId}:${day(0)}`,
        toolName: TOOL.name,
        endDate: day(-2),
        daysOverdue: 2,
        recipient: { email: "borrower@example.test", firstName: "Bo" },
      },
    ]);
  });

  test("retried write-backs create one record, and a sent loan isn't listed again today", async () => {
    const t = setup();
    const { loanId, borrower } = await overdueLoan(t);
    const key = `${loanId}:${day(0)}`;
    const payload = { executionId: "1", results: [{ reminderKey: key, status: "sent" }] };

    const first = await signedFetch(t, "POST", "/n8n/reminder-status", payload);
    const second = await signedFetch(t, "POST", "/n8n/reminder-status", payload);
    expect(await first.json()).toMatchObject({ created: 1 });
    expect(await second.json()).toMatchObject({ created: 0, noop: 1 });
    expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toHaveLength(1);

    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toEqual([]);

    const [view] = await borrower.as.query(api.loans.myRequests, {});
    expect(view.isOverdue).toBe(true);
    expect(view.activity[0]).toMatchObject({ label: "Overdue reminder sent", state: "ok" });
  });

  test("a late failure can't overwrite a sent reminder", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const reminderKey = `${loanId}:${day(0)}`;
    await signedFetch(t, "POST", "/n8n/reminder-status", { results: [{ reminderKey, status: "sent" }] });
    await signedFetch(t, "POST", "/n8n/reminder-status", { results: [{ reminderKey, status: "failed", error: "x" }] });
    const [row] = await t.run((ctx) => ctx.db.query("reminders").collect());
    expect(row.status).toBe("sent");
  });

  test("a failed reminder is offered again, then upgrades in place", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const reminderKey = `${loanId}:${day(0)}`;
    await signedFetch(t, "POST", "/n8n/reminder-status", { results: [{ reminderKey, status: "failed", error: "smtp" }] });

    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toHaveLength(1);

    await signedFetch(t, "POST", "/n8n/reminder-status", { results: [{ reminderKey, status: "sent" }] });
    const rows = await t.run((ctx) => ctx.db.query("reminders").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
  });

  test("a new day gets a new reminder", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    await signedFetch(t, "POST", "/n8n/reminder-status", {
      results: [{ reminderKey: `${loanId}:${day(0)}`, status: "sent" }],
    });
    vi.advanceTimersByTime(86_400_000);
    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toHaveLength(1);
    expect(loans[0].daysOverdue).toBe(3);
  });

  test("write-backs for unknown loans are counted and ignored", async () => {
    const response = await signedFetch(setup(), "POST", "/n8n/reminder-status", {
      results: [{ reminderKey: "not-a-loan:2030-01-01", status: "sent" }],
    });
    expect(await response.json()).toMatchObject({ unknown: 1, created: 0 });
  });
});

describe("failure visibility", () => {
  test("reports from the error workflow are stored once per execution", async () => {
    const t = setup();
    const admin = await addUser(t, "boss", { role: "admin" });
    const payload = { executionId: "42", workflow: "Overdue", node: "Fetch", message: "boom" };

    const first = await signedFetch(t, "POST", "/n8n/workflow-failures", payload);
    const second = await signedFetch(t, "POST", "/n8n/workflow-failures", payload);
    expect(await first.json()).toEqual({ outcome: "created" });
    expect(await second.json()).toEqual({ outcome: "noop" });
    expect((await admin.as.query(api.admin.automationHealth, {})).workflowFailures).toHaveLength(1);
  });

  test("the watchdog raises one failure a day when the schedule goes quiet", async () => {
    const t = setup();
    expect(await t.mutation(internal.automation.checkOverdueRunWatchdog, {})).toBe("created");
    expect(await t.mutation(internal.automation.checkOverdueRunWatchdog, {})).toBe("noop");

    await signedFetch(t, "GET", "/n8n/overdue-loans");
    expect(await t.mutation(internal.automation.checkOverdueRunWatchdog, {})).toBe("healthy");

    vi.advanceTimersByTime(27 * 60 * 60 * 1000);
    expect(await t.mutation(internal.automation.checkOverdueRunWatchdog, {})).toBe("created");
  });
});
