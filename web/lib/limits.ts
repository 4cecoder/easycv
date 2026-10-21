/**
 * Fair-use limits and the friendly messages shown when one is hit.
 *
 * The limits themselves are enforced server-side (convex/rateLimits.ts,
 * lib/server-rate-limit.ts, convex/quotas.ts, convex/faq.ts). This module
 * only mirrors their public contract so the UI can explain a refusal:
 *   - /api/job-match, /api/upload: HTTP 429 + Retry-After, body
 *     { error: "rate_limited", reason, retryAfter } (seconds); 503 when the
 *     limiter is unavailable.
 *   - job-match / upload Server Actions: { success: false, error: "rate_limited", retryAfter }.
 *   - quotas.consumeAutoImproveQuota, faq.consumeSampleQuota:
 *     ConvexError({ code: "quota_exhausted" }).
 * Keep the numbers in sync with convex/rateLimits.ts.
 */

import { ConvexError } from "convex/values";

/** Published fair-use limits (per signed-in account unless noted). */
export const FAIR_USE_LIMITS = {
  jobMatchPerHour: 10,
  jobMatchPerDay: 30,
  uploadsPerDay: 20,
  /** Shared across all users for AI features. */
  globalAiRequestsPerDay: 2000,
} as const;

/** Why the server refused (mirrors lib/server-rate-limit.ts). */
export type RateLimitReason = "user_hourly" | "user_daily" | "global_budget";

/** A refusal the UI can describe. */
export interface RateLimitRefusal {
  retryAfterSeconds: number | null;
  reason: RateLimitReason | null;
}

/** Features that can be limited. */
export type LimitedFeature = "job_match" | "upload" | "auto_improve" | "sample";

const FEATURE_NOUN: Record<LimitedFeature, string> = {
  job_match: "job matches",
  upload: "uploads",
  auto_improve: "free Auto-Improve passes",
  sample: "free samples",
};

/** "about a minute", "about 12 minutes", "about 3 hours". */
export function formatRetryAfter(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return "about a minute";
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "about an hour" : `about ${hours} hours`;
}

/** Friendly sentence for a rate-limit refusal. */
export function rateLimitMessage(feature: LimitedFeature, refusal: RateLimitRefusal): string {
  const when = refusal.retryAfterSeconds ? ` — try again in ${formatRetryAfter(refusal.retryAfterSeconds)}` : " — please try again later";
  const noun = FEATURE_NOUN[feature];
  if (refusal.reason === "global_budget") {
    return `easyCV's AI features have reached their daily capacity${when}.`;
  }
  if (refusal.reason === "user_hourly") {
    const cap = feature === "job_match" ? ` (${FAIR_USE_LIMITS.jobMatchPerHour} per hour)` : "";
    return `You've reached this hour's limit for ${noun}${cap}${when}.`;
  }
  const cap =
    feature === "job_match"
      ? ` (${FAIR_USE_LIMITS.jobMatchPerDay} per day)`
      : feature === "upload"
        ? ` (${FAIR_USE_LIMITS.uploadsPerDay} per day)`
        : "";
  return `You've reached today's limit for ${noun}${cap}${when}.`;
}

/** One-sentence fair-use summary for the pricing page and Terms. */
export const FAIR_USE_SUMMARY =
  `Fair use applies on every plan: up to ${FAIR_USE_LIMITS.jobMatchPerHour} AI job matches per hour and ` +
  `${FAIR_USE_LIMITS.jobMatchPerDay} per day, and ${FAIR_USE_LIMITS.uploadsPerDay} uploads per day, per account. ` +
  `AI features may pause for everyone if the service reaches its daily capacity.`;

/** Message when the limiter itself is unavailable (HTTP 503). */
export const LIMITER_UNAVAILABLE_MESSAGE = "easyCV is busy right now. Please try again in a few seconds.";

function parseReason(value: unknown): RateLimitReason | null {
  return value === "user_hourly" || value === "user_daily" || value === "global_budget" ? value : null;
}

/**
 * Read a 429 response (status, Retry-After header, JSON body). Returns null
 * for any other status.
 */
export function refusalFromResponse(
  res: { status: number; headers: { get(name: string): string | null } },
  body: unknown,
): RateLimitRefusal | null {
  if (res.status !== 429) return null;
  const data = (body ?? {}) as { retryAfter?: unknown; reason?: unknown };
  const header = Number(res.headers.get("Retry-After"));
  const fromBody = typeof data.retryAfter === "number" && Number.isFinite(data.retryAfter) ? data.retryAfter : null;
  const retryAfterSeconds = fromBody ?? (Number.isFinite(header) && header > 0 ? header : null);
  return { retryAfterSeconds, reason: parseReason(data.reason) };
}

/** Read a Server Action result `{ success: false, error: "rate_limited", retryAfter }`. */
export function refusalFromActionResult(result: unknown): RateLimitRefusal | null {
  const r = (result ?? {}) as { success?: unknown; error?: unknown; retryAfter?: unknown; reason?: unknown };
  if (r.success !== false || r.error !== "rate_limited") return null;
  return {
    retryAfterSeconds: typeof r.retryAfter === "number" && Number.isFinite(r.retryAfter) ? r.retryAfter : null,
    reason: parseReason(r.reason),
  };
}

/** True for ConvexError({ code: "quota_exhausted" }) from a quota mutation. */
export function isQuotaExhaustedError(error: unknown): boolean {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | null;
    return data?.code === "quota_exhausted";
  }
  return false;
}

/**
 * Turn a failed fetch to a limited API route into a user message, or null if
 * the failure is not limit-related (caller shows its normal error).
 */
export function limitMessageForResponse(
  feature: LimitedFeature,
  res: { status: number; headers: { get(name: string): string | null } },
  body: unknown,
): string | null {
  const refusal = refusalFromResponse(res, body);
  if (refusal) return rateLimitMessage(feature, refusal);
  const data = (body ?? {}) as { error?: unknown };
  if (res.status === 503 && typeof data.error === "string" && /temporarily unavailable/i.test(data.error)) {
    return LIMITER_UNAVAILABLE_MESSAGE;
  }
  return null;
}
