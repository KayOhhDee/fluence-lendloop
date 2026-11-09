import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { roleValidator } from "./lib/domain";
import { appError } from "./lib/errors";

/**
 * Creates or refreshes the signed-in person's record from their verified Clerk token. Takes no
 * arguments, so a client cannot influence the identity or role that gets stored.
 */
export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");

    const name =
      identity.name?.trim() ||
      [identity.givenName?.trim(), identity.familyName?.trim()].filter(Boolean).join(" ") ||
      undefined;
    const email = identity.email;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!existing) {
      return ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name: name ?? "Neighbor",
        email,
        role: "user",
        trustedLender: false,
      });
    }
    // A token without these claims says nothing about them, so it must not erase what's stored.
    const nextName = name ?? existing.name;
    const nextEmail = email ?? existing.email;
    if (existing.name !== nextName || existing.email !== nextEmail) {
      await ctx.db.patch(existing._id, { name: nextName, email: nextEmail });
    }
    return existing._id;
  },
});

/** The caller's own profile. Returns null until signed in and set up, so the UI can wait for it. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;
    return { id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

/**
 * Role changes are internal-only: not callable from any client, only with a deploy key.
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error("No user with that email. They must sign in once first.");
    await ctx.db.patch(user._id, { role });
    await ctx.db.insert("auditLog", {
      actorId: user._id,
      action: "role.set_via_cli",
      targetId: user._id,
      detail: role,
    });
    return { userId: user._id, role };
  },
});
