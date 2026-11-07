import { v } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { approvedLoans, availabilityOf } from "./lib/availability";
import { isoDay } from "./lib/dates";
import { categoryValidator, conditionValidator, LIMITS } from "./lib/domain";
import { appError } from "./lib/errors";
import { firstName, userMutation, userQuery } from "./lib/functions";
import { enqueueNotification } from "./lib/outbox";

const LIST_LIMIT = 200;

/**
 * Public, unauthenticated. The `returns` validator is a hard guarantee: a response carrying any
 * field beyond id, name and category (an owner, say) fails rather than reaching a visitor.
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ id: v.id("tools"), name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const today = isoDay(Date.now());
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_active", (q) => q.eq("removedAt", undefined))
      .order("desc")
      .take(LIST_LIMIT);
    const rows = await Promise.all(
      tools.map(async (tool) => ({
        tool,
        availability: availabilityOf(await approvedLoans(ctx, tool._id), today),
      })),
    );
    return rows
      .filter((row) => row.availability === "available")
      .map(({ tool }) => ({ id: tool._id, name: tool.name, category: tool.category }));
  },
});

/** The signed-in board: every active tool with availability. Owners appear by first name only. */
export const list = userQuery({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const today = isoDay(Date.now());
    const tools = await (category
      ? ctx.db
          .query("tools")
          .withIndex("by_active_category", (q) => q.eq("removedAt", undefined).eq("category", category))
      : ctx.db.query("tools").withIndex("by_active", (q) => q.eq("removedAt", undefined))
    )
      .order("desc")
      .take(LIST_LIMIT);

    return Promise.all(
      tools.map(async (tool) => {
        const approved = await approvedLoans(ctx, tool._id);
        const owner = await ctx.db.get(tool.ownerId);
        return {
          id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          availability: availabilityOf(approved, today),
          // Dates only, so borrowers can pick a free range without learning who has it.
          bookedRanges: approved.map((loan) => ({ startDate: loan.startDate, endDate: loan.endDate })),
          ownerName: owner ? firstName(owner.name) : "Neighbor",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: tool.ownerId === ctx.user._id,
        };
      }),
    );
  },
});

export const listMine = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = isoDay(Date.now());
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id).eq("removedAt", undefined))
      .order("desc")
      .collect();
    return Promise.all(
      tools.map(async (tool) => ({
        id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: availabilityOf(await approvedLoans(ctx, tool._id), today),
      })),
    );
  },
});

function cleanToolFields(args: { name: string; description: string }) {
  const name = args.name.trim();
  const description = args.description.trim();
  if (!name || name.length > LIMITS.toolName) {
    throw appError("INVALID_INPUT", `Name must be 1-${LIMITS.toolName} characters.`);
  }
  if (!description || description.length > LIMITS.toolDescription) {
    throw appError("INVALID_INPUT", `Description must be 1-${LIMITS.toolDescription} characters.`);
  }
  return { name, description };
}

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

export const create = userMutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id).eq("removedAt", undefined))
      .take(LIMITS.maxListingsPerOwner);
    if (mine.length >= LIMITS.maxListingsPerOwner) {
      throw appError("CONFLICT", `You can have up to ${LIMITS.maxListingsPerOwner} listings.`);
    }
    return ctx.db.insert("tools", {
      ...args,
      ...cleanToolFields(args),
      ownerId: ctx.user._id,
    });
  },
});

async function getOwnActiveTool(ctx: MutationCtx, toolId: Doc<"tools">["_id"], userId: Doc<"users">["_id"]) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "That listing no longer exists.");
  if (tool.ownerId !== userId) throw appError("FORBIDDEN", "You can only change your own listings.");
  return tool;
}

export const update = userMutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    await getOwnActiveTool(ctx, toolId, ctx.user._id);
    await ctx.db.patch(toolId, { ...fields, ...cleanToolFields(fields) });
  },
});

/** Owners cannot pull a tool out from under an agreed loan; they must cancel or close it first. */
export const remove = userMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await getOwnActiveTool(ctx, toolId, ctx.user._id);
    if ((await approvedLoans(ctx, toolId)).length > 0) {
      throw appError("CONFLICT", "This tool has an agreed loan. Close or cancel it before removing the listing.");
    }
    await softDeleteListing(ctx, tool);
  },
});

/**
 * Removes a listing and closes whatever depends on it. Open requests are declined and upcoming
 * loans cancelled, with both parties notified. A loan already under way stays open, because the
 * item is physically out and still has to come back.
 */
export async function softDeleteListing(ctx: MutationCtx, tool: Doc<"tools">) {
  const today = isoDay(Date.now());
  const now = Date.now();

  const pending = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
    .collect();
  for (const loan of pending) {
    await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
    await enqueueNotification(ctx, { loanId: loan._id, event: "loan.declined", recipientId: loan.borrowerId });
  }

  for (const loan of await approvedLoans(ctx, tool._id)) {
    if (loan.startDate > today) {
      await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: now });
      await enqueueNotification(ctx, { loanId: loan._id, event: "loan.cancelled", recipientId: loan.borrowerId });
    }
  }

  await ctx.db.patch(tool._id, { removedAt: now });
}
