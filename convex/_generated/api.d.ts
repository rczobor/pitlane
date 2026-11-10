/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as board from "../board.js";
import type * as crons from "../crons.js";
import type * as errors from "../errors.js";
import type * as extension from "../extension.js";
import type * as fixtures from "../fixtures.js";
import type * as geo from "../geo.js";
import type * as http from "../http.js";
import type * as keySpecs from "../keySpecs.js";
import type * as listings from "../listings.js";
import type * as mcp from "../mcp.js";
import type * as photos from "../photos.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  board: typeof board;
  crons: typeof crons;
  errors: typeof errors;
  extension: typeof extension;
  fixtures: typeof fixtures;
  geo: typeof geo;
  http: typeof http;
  keySpecs: typeof keySpecs;
  listings: typeof listings;
  mcp: typeof mcp;
  photos: typeof photos;
  users: typeof users;
  validators: typeof validators;
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
