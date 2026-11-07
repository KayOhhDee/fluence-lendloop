/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation from "../automation.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_outbox from "../lib/outbox.js";
import type * as lib_signature from "../lib/signature.js";
import type * as loans from "../loans.js";
import type * as notifications from "../notifications.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  automation: typeof automation;
  crons: typeof crons;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/availability": typeof lib_availability;
  "lib/dates": typeof lib_dates;
  "lib/domain": typeof lib_domain;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/outbox": typeof lib_outbox;
  "lib/signature": typeof lib_signature;
  loans: typeof loans;
  notifications: typeof notifications;
  seed: typeof seed;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
