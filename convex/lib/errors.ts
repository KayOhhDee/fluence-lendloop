import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT";

/** Errors meant for the person using the app. Anything else surfaces as a generic server error. */
export function appError(code: ErrorCode, message: string) {
  return new ConvexError({ code, message });
}
