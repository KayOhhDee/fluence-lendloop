import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, verifyRequest } from "./lib/signature";

const MAX_BODY_BYTES = 256 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Wraps an n8n-facing route. Fails closed: with no secret configured nothing is accepted, and the
 * signature is checked against the raw bytes before the body is parsed or any data is touched.
 */
function signedRoute<T>(
  schema: z.ZodType<T>,
  handler: (ctx: ActionCtx, body: T) => Promise<unknown>,
) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.CONVEX_INBOUND_SECRET;
    if (!secret) {
      console.error("CONVEX_INBOUND_SECRET is not set; rejecting n8n request");
      return json(503, { error: "not_configured" });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

    const valid = await verifyRequest({
      secret,
      header: request.headers.get(SIGNATURE_HEADER),
      method: request.method,
      path: new URL(request.url).pathname,
      body: raw,
      nowMs: Date.now(),
    });
    if (!valid) return json(401, { error: "invalid_signature" });

    let parsed: T;
    try {
      parsed = schema.parse(raw ? JSON.parse(raw) : {});
    } catch {
      return json(400, { error: "invalid_body" });
    }
    return json(200, await handler(ctx, parsed));
  });
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signedRoute(z.object({}), (ctx) => ctx.runMutation(internal.automation.fetchOverdue, {})),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedRoute(
    z.object({
      executionId: z.string().max(100).optional(),
      results: z
        .array(
          z.object({
            reminderKey: z.string().max(100),
            status: z.enum(["sent", "failed"]),
            error: z.string().max(500).optional(),
          }),
        )
        .max(500),
    }),
    (ctx, body) => ctx.runMutation(internal.automation.recordReminderResults, body),
  ),
});

http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signedRoute(z.object({ eventId: z.string().max(100) }), async (ctx, { eventId }) => ({
    outcome: await ctx.runMutation(internal.notifications.acknowledge, { eventId }),
  })),
});

http.route({
  path: "/n8n/workflow-failures",
  method: "POST",
  handler: signedRoute(
    z.object({
      executionId: z.string().max(100),
      workflow: z.string().max(200),
      node: z.string().max(200).optional(),
      message: z.string().max(500),
    }),
    async (ctx, body) => ({
      outcome: await ctx.runMutation(internal.automation.recordWorkflowFailure, body),
    }),
  ),
});

export default http;
