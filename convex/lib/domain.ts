import { v } from "convex/values";

/** Shared vocabulary. Imported by both Convex functions and the UI so they cannot drift. */

export const CATEGORIES = [
  { value: "power_tools", label: "Power tools" },
  { value: "hand_tools", label: "Hand tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "other", label: "Other" },
] as const;

export const CONDITIONS = [
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "worn", label: "Well used" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Condition = (typeof CONDITIONS)[number]["value"];

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const roleValidator = v.union(v.literal("admin"), v.literal("user"));

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const loanEventValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

export type LoanEvent =
  | "loan.requested"
  | "loan.approved"
  | "loan.declined"
  | "loan.cancelled"
  | "loan.returned";

export const LIMITS = {
  toolName: 80,
  toolDescription: 500,
  maxLoanDays: 90,
  maxBookingLeadDays: 365,
  maxPendingRequestsPerBorrower: 20,
  maxListingsPerOwner: 50,
} as const;
