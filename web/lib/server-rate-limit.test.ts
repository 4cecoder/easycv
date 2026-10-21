// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";

import {
  consumeServerLimit,
  rateLimitedResponse,
  RateLimiterUnavailableError,
  refusalFromConvexError,
  retryAfterSeconds,
  type ConsumeMutationRef,
} from "./server-rate-limit";

const ref = "rateLimits:consumeJobMatch" as unknown as ConsumeMutationRef;
const client = (impl: () => Promise<unknown>) => ({ mutation: vi.fn(impl) }) as never;

describe("consumeServerLimit", () => {
  test("passes no client-supplied args to the consume mutation", async () => {
    const c = client(async () => ({ ok: true, retryAfterMs: 0 }));
    await expect(consumeServerLimit(c, ref)).resolves.toEqual({ ok: true });
    expect((c as { mutation: ReturnType<typeof vi.fn> }).mutation).toHaveBeenCalledWith(ref, {});
  });

  test("returns refusals with reason and retry hint", async () => {
    const c = client(async () => ({ ok: false, retryAfterMs: 1234, reason: "global_budget" }));
    await expect(consumeServerLimit(c, ref)).resolves.toEqual({ ok: false, retryAfterMs: 1234, reason: "global_budget" });
  });

  test("fails closed on transport error, malformed response, and timeout", async () => {
    await expect(consumeServerLimit(client(async () => { throw new Error("down"); }), ref)).rejects.toBeInstanceOf(RateLimiterUnavailableError);
    await expect(consumeServerLimit(client(async () => ({ nope: 1 })), ref)).rejects.toBeInstanceOf(RateLimiterUnavailableError);
    vi.useFakeTimers();
    try {
      const pending = consumeServerLimit(client(() => new Promise(() => {})), ref, 100);
      const assertion = expect(pending).rejects.toBeInstanceOf(RateLimiterUnavailableError);
      await vi.advanceTimersByTimeAsync(101);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("429 shape", () => {
  test("@regression EASYC-6 429 carries Retry-After in whole seconds (rounded up, >= 1)", async () => {
    expect(retryAfterSeconds(0)).toBe(1);
    expect(retryAfterSeconds(1001)).toBe(2);
    const res = rateLimitedResponse({ ok: false, retryAfterMs: 59_001, reason: "user_hourly" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({
      error: "rate_limited", reason: "user_hourly", retryAfter: 60,
      message: "Too many requests. Please try again later.",
    });
  });

  test("maps only rate_limited ConvexErrors", () => {
    expect(refusalFromConvexError(new ConvexError({ code: "rate_limited", retryAfterMs: 5, reason: "user_daily" })))
      .toEqual({ ok: false, retryAfterMs: 5, reason: "user_daily" });
    expect(refusalFromConvexError(new ConvexError({ code: "quota_exhausted" }))).toBeNull();
    expect(refusalFromConvexError(new Error("rate_limited"))).toBeNull();
  });
});
