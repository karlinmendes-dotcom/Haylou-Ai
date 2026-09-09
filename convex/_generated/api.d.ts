/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as ai from "../ai.js";
import type * as biometrics from "../biometrics.js";
import type * as devices from "../devices.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as intentParser from "../intentParser.js";
import type * as notifications from "../notifications.js";
import type * as seed from "../seed.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  ai: typeof ai;
  biometrics: typeof biometrics;
  devices: typeof devices;
  health: typeof health;
  http: typeof http;
  intentParser: typeof intentParser;
  notifications: typeof notifications;
  seed: typeof seed;
  whatsapp: typeof whatsapp;
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
