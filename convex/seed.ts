import { internalMutation } from "./_generated/server";
import { addDays, isoDay } from "./lib/dates";
import { enqueueNotification } from "./lib/outbox";

/**
 * Demo data, including one overdue loan so the reminder workflow has something to do.
 * Internal, so only someone holding a deploy key can run it:  npx convex run seed:demo
 * The addresses use the reserved .invalid domain and can never receive mail.
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const marker = "demo|ada";
    const seeded = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", marker))
      .unique();
    if (seeded) return "already seeded";

    const addUser = (slug: string, name: string) =>
      ctx.db.insert("users", {
        tokenIdentifier: `demo|${slug}`,
        name,
        email: `${slug}@lendloop.invalid`,
        role: "user",
        trustedLender: false,
      });
    const ada = await addUser("ada", "Ada Mensah");
    const ben = await addUser("ben", "Ben Osei");
    await ctx.db.patch(ada, { trustedLender: true });

    const addTool = (
      ownerId: typeof ada,
      name: string,
      category: "power_tools" | "garden" | "camping" | "kitchen" | "hand_tools",
      condition: "like_new" | "good" | "fair",
      description: string,
    ) => ctx.db.insert("tools", { ownerId, name, category, condition, description });

    const drill = await addTool(ada, "Cordless drill", "power_tools", "good", "18V with two batteries and a bit set.");
    await addTool(ada, "Hedge trimmer", "garden", "good", "Electric, comes with a 20m extension lead.");
    await addTool(ada, "Socket set", "hand_tools", "like_new", "Metric, 40 pieces, in the original case.");
    await addTool(ben, "4-person tent", "camping", "fair", "Waterproof. One zip is stiff but works fine.");
    const mixer = await addTool(ben, "Stand mixer", "kitchen", "like_new", "5 litre bowl with whisk and dough hook.");

    const today = isoDay(Date.now());
    await ctx.db.insert("loans", {
      toolId: drill,
      toolName: "Cordless drill",
      lenderId: ada,
      borrowerId: ben,
      startDate: addDays(today, -10),
      endDate: addDays(today, -3),
      status: "approved",
      decidedAt: Date.now(),
    });
    const requested = await ctx.db.insert("loans", {
      toolId: mixer,
      toolName: "Stand mixer",
      lenderId: ben,
      borrowerId: ada,
      startDate: addDays(today, 2),
      endDate: addDays(today, 4),
      status: "pending",
    });
    await enqueueNotification(ctx, { loanId: requested, event: "loan.requested", recipientId: ben });
    return "seeded";
  },
});
