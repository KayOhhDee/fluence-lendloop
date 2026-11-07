import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  loanEventValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/domain";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    // Held only so automated notices can reach this person. Never returned to other users.
    email: v.optional(v.string()),
    role: roleValidator,
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // Listings are soft-deleted so past loans keep a valid reference.
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId", "removedAt"])
    .index("by_active", ["removedAt"])
    .index("by_active_category", ["removedAt", "category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    // Snapshot, so history still reads correctly after a listing is renamed or removed.
    toolName: v.string(),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD, inclusive
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "endDate"]),

  // Transactional outbox: a row is written in the same transaction as the state change it
  // announces. It stores references only; the webhook payload is built at send time.
  notifications: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    event: loanEventValidator,
    recipientId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    // While pending: earliest time the next attempt may start. Doubles as the in-flight lease.
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_loan", ["loanId"])
    .index("by_status_next", ["status", "nextAttemptAt"]),

  // One row per loan per day: `key` is the idempotency key for overdue reminders.
  reminders: defineTable({
    key: v.string(),
    loanId: v.id("loans"),
    date: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    lastError: v.optional(v.string()),
    executionId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"]),

  // Failures reported by the n8n error workflow and the missed-run watchdog.
  workflowFailures: defineTable({
    key: v.string(),
    source: v.union(v.literal("n8n"), v.literal("watchdog")),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
    occurredAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_occurred", ["occurredAt"]),

  // Dead-man's switch: proves the scheduled workflow actually ran.
  automationHeartbeats: defineTable({
    name: v.string(),
    lastSeenAt: v.number(),
  }).index("by_name", ["name"]),

  // Append-only record of privileged actions.
  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetId: v.string(),
    detail: v.optional(v.string()),
  }),
});
