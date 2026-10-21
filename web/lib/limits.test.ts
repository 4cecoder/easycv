import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";

import {
  FAIR_USE_LIMITS,
  formatRetryAfter,
  isQuotaExhaustedError,
  limitMessageForResponse,
  LIMITER_UNAVAILABLE_MESSAGE,
  rateLimitMessage,
  refusalFromActionResult,
} from "./limits";

const res = (status: number, headers: Record<string, string> = {}) => ({
  status,
  headers: { get: (n: string) => headers[n] ?? null },
});

describe("rate-limit messages", () => {
  test("formats retry times", () => {
    expect(formatRetryAfter(30)).toBe("about a minute");
    expect(formatRetryAfter(12 * 60)).toBe("about 12 minutes");
    expect(formatRetryAfter(3600)).toBe("about an hour");
    expect(formatRetryAfter(3 * 3600)).toBe("about 3 hours");
  });

  test("429 from /api/job-match becomes a friendly message with the limit and wait time", () => {
    const msg = limitMessageForResponse("job_match", res(429, { "Retry-After": "600" }), {
      error: "rate_limited",
      reason: "user_hourly",
      retryAfter: 600,
    });
    expect(msg).toBe(
      `You've reached this hour's limit for job matches (${FAIR_USE_LIMITS.jobMatchPerHour} per hour) — try again in about 10 minutes.`,
    );
  });

  test("falls back to the Retry-After header and daily wording", () => {
    const msg = limitMessageForResponse("upload", res(429, { "Retry-After": "7200" }), {});
    expect(msg).toBe(`You've reached today's limit for uploads (${FAIR_USE_LIMITS.uploadsPerDay} per day) — try again in about 2 hours.`);
  });

  test("global budget wording", () => {
    expect(rateLimitMessage("job_match", { retryAfterSeconds: 60, reason: "global_budget" })).toMatch(/daily capacity/);
  });

  test("503 limiter-unavailable gets a retry message; other errors are left to the caller", () => {
    expect(limitMessageForResponse("upload", res(503), { error: "Service temporarily unavailable. Please try again shortly." })).toBe(
      LIMITER_UNAVAILABLE_MESSAGE,
    );
    expect(limitMessageForResponse("upload", res(400), { error: "bad file" })).toBeNull();
  });

  test("Server Action results and quota errors", () => {
    expect(refusalFromActionResult({ success: false, error: "rate_limited", retryAfter: 5 })).toEqual({ retryAfterSeconds: 5, reason: null });
    expect(refusalFromActionResult({ success: false, error: "other" })).toBeNull();
    expect(isQuotaExhaustedError(new ConvexError({ code: "quota_exhausted", quota: "autoImprove" }))).toBe(true);
    expect(isQuotaExhaustedError(new Error("quota_exhausted"))).toBe(false);
  });
});
