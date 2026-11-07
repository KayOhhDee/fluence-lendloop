// @vitest-environment node
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { signRequest, verifyRequest } from "../convex/lib/signature";

/** Static and behavioural checks on the exported workflow files that reviewers will import. */

type Node = {
  name: string;
  type: string;
  parameters: Record<string, unknown> & { jsCode?: string };
  retryOnFail?: boolean;
  maxTries?: number;
};
type Workflow = { id: string; name: string; nodes: Node[]; settings: Record<string, unknown> };

const load = (file: string) => {
  const raw = readFileSync(join(__dirname, "../n8n/workflows", file), "utf8");
  return { raw, workflow: JSON.parse(raw) as Workflow };
};

const notifications = load("loan-notifications.json");
const overdue = load("overdue-reminders.json");
const errorHandler = load("error-handler.json");
const all = [notifications, overdue, errorHandler];

function node(workflow: Workflow, name: string): Node {
  const found = workflow.nodes.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No node named ${name}`);
  return found;
}

/** Runs a Code node's exported source the way n8n does, with its globals supplied. */
async function runCode(source: string, globals: Record<string, unknown>, self: unknown = {}) {
  const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
  const names = Object.keys(globals);
  const fn = new AsyncFunction("require", ...names, source);
  return fn.call(self, (await import("node:module")).createRequire(__filename), ...names.map((name) => globals[name]));
}

afterEach(() => vi.useRealTimers());

describe("exported workflows", () => {
  test.each(all.map(({ raw, workflow }) => [workflow.name, raw] as const))(
    "%s holds no secrets or credentials",
    (_name, raw) => {
      expect(raw).not.toMatch(/[0-9a-f]{32,}/i);
      expect(raw).not.toMatch(/"credentials"\s*:/);
      expect(raw).not.toMatch(/Bearer\s+\w/);
      // Secrets are only ever read from the environment.
      expect(raw).not.toMatch(/(SECRET|secret)\s*[:=]\s*['"][^'"$]/);
    },
  );

  test("every workflow avoids keeping successful execution data", () => {
    for (const { workflow } of all) {
      expect(workflow.settings.saveDataSuccessExecution).toBe("none");
      expect(workflow.settings.saveDataErrorExecution).toBe("all");
    }
  });

  test("failure-prone workflows point at the error workflow", () => {
    expect(notifications.workflow.settings.errorWorkflow).toBe(errorHandler.workflow.id);
    expect(overdue.workflow.settings.errorWorkflow).toBe(errorHandler.workflow.id);
  });

  test("every network call retries", () => {
    for (const { workflow } of all) {
      for (const candidate of workflow.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest")) {
        expect(candidate.retryOnFail, candidate.name).toBe(true);
        expect(candidate.maxTries, candidate.name).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("Verify Signature node", () => {
  const SECRET = "test-webhook-secret";
  const PATH = "/webhook/lendloop-loan-events";
  const payload = {
    eventId: "e1",
    event: "loan.approved",
    toolName: "Drill",
    startDate: "2030-01-01",
    endDate: "2030-01-02",
    recipient: { email: "a@example.test", firstName: "A" },
  };

  async function verify(raw: string, header: string | undefined, secret: string | undefined = SECRET) {
    const output = (await runCode(
      node(notifications.workflow, "Verify Signature").parameters.jsCode!,
      {
        $env: { LENDLOOP_WEBHOOK_SECRET: secret },
        $input: { first: () => ({ json: { headers: { "x-lendloop-signature": header } } }) },
      },
      { helpers: { getBinaryDataBuffer: async () => Buffer.from(raw) } },
    )) as { json: Record<string, unknown> }[];
    return output[0].json;
  }

  const signed = (body: string, nowMs = Date.now(), secret = SECRET) =>
    signRequest({ secret, method: "POST", path: PATH, body, nowMs });

  test("accepts what Convex signs, and passes on only the allowlisted fields", async () => {
    const body = JSON.stringify({ ...payload, injected: "should not survive" });
    const result = await verify(body, await signed(body));
    expect(result).toEqual({ valid: true, ...payload });
  });

  test.each([
    ["a missing header", async () => undefined],
    ["a malformed header", async () => "t=1,v1=zz"],
    ["the wrong secret", async (body: string) => signed(body, Date.now(), "other")],
    ["a stale timestamp", async (body: string) => signed(body, Date.now() - 301_000)],
  ])("rejects %s", async (_name, makeHeader) => {
    const body = JSON.stringify(payload);
    expect(await verify(body, await makeHeader(body))).toEqual({ valid: false });
  });

  test("rejects a tampered body", async () => {
    const header = await signed(JSON.stringify(payload));
    expect(await verify(JSON.stringify({ ...payload, toolName: "Other" }), header)).toEqual({ valid: false });
  });

  test("refuses to run without a secret rather than accepting everything", async () => {
    const source = node(notifications.workflow, "Verify Signature").parameters.jsCode!;
    await expect(
      runCode(source, { $env: {}, $input: { first: () => ({ json: { headers: {} } }) } }),
    ).rejects.toThrow(/not set/);
  });
});

describe("signing nodes match Convex", () => {
  const SECRET = "test-inbound-secret";

  test.each([
    ["Sign Write-back", notifications, "POST", "/n8n/notification-status"],
    ["Sign Fetch", overdue, "GET", "/n8n/overdue-loans"],
  ] as const)("%s", async (name, { workflow }, method, path) => {
    const [{ json }] = (await runCode(node(workflow, name).parameters.jsCode!, {
      $env: { LENDLOOP_INBOUND_SECRET: SECRET },
      $input: { first: () => ({ json: { eventId: "e1" } }) },
    })) as { json: { signature: string; body?: string } }[];

    expect(
      await verifyRequest({
        secret: SECRET,
        header: json.signature,
        method,
        path,
        body: json.body ?? "",
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  test("the scheme is plain HMAC-SHA256 over the documented string", async () => {
    const header = await signRequest({ secret: "s", method: "POST", path: "/p", body: "b", nowMs: 1_000_000 });
    const mac = createHmac("sha256", "s").update("1000.POST./p.b").digest("hex");
    expect(header).toBe(`t=1000,v1=${mac}`);
  });
});

describe("error handler", () => {
  test("reports metadata only, with addresses scrubbed", async () => {
    const [{ json }] = (await runCode(node(errorHandler.workflow, "Build Failure Report").parameters.jsCode!, {
      $env: { LENDLOOP_INBOUND_SECRET: "s" },
      $input: {
        first: () => ({
          json: {
            execution: {
              id: "9",
              lastNodeExecuted: "Send",
              error: { message: "Rejected recipient jane@example.test" },
              data: { secret: "payload must not be forwarded" },
            },
            workflow: { id: "w", name: "Flow" },
          },
        }),
      },
    })) as { json: { body: string } }[];

    expect(JSON.parse(json.body)).toEqual({
      executionId: "9",
      workflow: "Flow",
      node: "Send",
      message: "Rejected recipient [redacted]",
    });
  });
});
