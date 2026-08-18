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
import type * as authz from "../authz.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as insights from "../insights.js";
import type * as payments from "../payments.js";
import type * as profiles from "../profiles.js";
import type * as resumeFiles from "../resumeFiles.js";
import type * as seed from "../seed.js";
import type * as telemetry from "../telemetry.js";
import type * as uploads from "../uploads.js";
import type * as workerAuth from "../workerAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  authz: typeof authz;
  files: typeof files;
  http: typeof http;
  identity: typeof identity;
  insights: typeof insights;
  payments: typeof payments;
  profiles: typeof profiles;
  resumeFiles: typeof resumeFiles;
  seed: typeof seed;
  telemetry: typeof telemetry;
  uploads: typeof uploads;
  workerAuth: typeof workerAuth;
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
