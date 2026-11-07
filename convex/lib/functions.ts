import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError } from "./errors";

/**
 * Every client-callable function that touches private data is built from these wrappers, so
 * authentication and role checks run before the handler and cannot be forgotten in one.
 * Resource ownership is still checked per function, using the helpers below.
 */

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw appError("UNAUTHENTICATED", "Your account is still being set up.");
  return user;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
  return user;
}

export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);
export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);
export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })),
);
export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })),
);

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Neighbor";
}
