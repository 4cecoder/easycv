/**
 * Barrel export for all server actions.
 *
 * Usage:
 *   import { uploadFiles, createCheckout, matchJob } from "@/app/actions";
 */

export { uploadFiles, type UploadActionResult } from "./upload";
export { createCheckout, type CheckoutActionResult } from "./checkout";
export { matchJob, type JobMatchResult } from "./job-match";
