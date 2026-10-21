/**
 * Next.js-side glue for the durable Convex rate limits (EASYC-6).
 *
 * The authoritative limits live in convex/rateLimits.ts and are keyed on the
 * verified identity of the Convex connection -- this module only calls the
 * consume mutation with the caller's request-scoped authenticated client and
 * shapes refusals into HTTP 429 / typed action errors.
 */
import { NextResponse } from "next/server";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";

/** Outcome of consuming a durable rate-limit token. */
export type ServerLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number; reason: "user_hourly" | "user_daily" | "global_budget" };

/** Minimal surface of ConvexHttpClient this module needs (eases mocking). */
export type MutationClient = Pick<ConvexHttpClient, "mutation">;

/** A public, argument-less consume mutation such as `api.rateLimits.consumeJobMatch`. */
export type ConsumeMutationRef = FunctionReference<"mutation", "public", Record<string, never>>;

/** Thrown when the limiter itself can't be reached; callers fail CLOSED (no LLM call). */
export class RateLimiterUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Rate limiter unavailable");
    this.cause = cause;
  }
}

/** Default upper bound on the limiter round-trip so a slow Convex can't hang the request. */
export const RATE_LIMIT_TIMEOUT_MS = 5_000;

/**
 * Consume one token via a no-arg Convex consume mutation
 * (e.g. `api.rateLimits.consumeJobMatch`). Never trusts client input: the
 * mutation derives the key from the authenticated Convex identity.
 *
 * Throws RateLimiterUnavailableError on transport failure, timeout, or an
 * unexpected response, so callers refuse the expensive work instead of
 * proceeding unmetered.
 */
export async function consumeServerLimit(
  convex: MutationClient,
  ref: ConsumeMutationRef,
  timeoutMs: number = RATE_LIMIT_TIMEOUT_MS,
): Promise<ServerLimitResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raw: unknown;
  try {
    raw = await Promise.race([
      convex.mutation(ref, {}),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    throw new RateLimiterUnavailableError(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const result = raw as { ok?: unknown; retryAfterMs?: unknown; reason?: unknown } | null;
  if (result?.ok === true) return { ok: true };
  if (result?.ok === false && typeof result.retryAfterMs === "number" && Number.isFinite(result.retryAfterMs)) {
    const reason = result.reason === "user_hourly" || result.reason === "global_budget" ? result.reason : "user_daily";
    return { ok: false, retryAfterMs: Math.max(0, result.retryAfterMs), reason };
  }
  throw new RateLimiterUnavailableError(new Error("unexpected rate limiter response"));
}

/** Whole seconds for Retry-After: rounded up, never below 1. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/** Human-readable message for a refusal. */
export function rateLimitMessage(reason: Extract<ServerLimitResult, { ok: false }>["reason"]): string {
  return reason === "global_budget"
    ? "The service is at its daily capacity. Please try again later."
    : "Too many requests. Please try again later.";
}

/** HTTP 429 with a Retry-After header (seconds) and a JSON body mirroring it. */
export function rateLimitedResponse(refusal: Extract<ServerLimitResult, { ok: false }>): NextResponse {
  const retryAfter = retryAfterSeconds(refusal.retryAfterMs);
  return NextResponse.json(
    { error: "rate_limited", message: rateLimitMessage(refusal.reason), reason: refusal.reason, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** HTTP 503 used when the limiter can't be consulted (fail closed). */
export function rateLimiterUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Service temporarily unavailable. Please try again shortly." },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}

/**
 * Map a `ConvexError({ code: "rate_limited", ... })` thrown by a Convex
 * backstop (e.g. uploads.createUpload's rolling cap) to a refusal, or null.
 */
export function refusalFromConvexError(error: unknown): Extract<ServerLimitResult, { ok: false }> | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as { code?: unknown; retryAfterMs?: unknown; reason?: unknown } | null;
  if (!data || data.code !== "rate_limited") return null;
  const retryAfterMs = typeof data.retryAfterMs === "number" && Number.isFinite(data.retryAfterMs) ? data.retryAfterMs : 60_000;
  const reason = data.reason === "user_hourly" || data.reason === "global_budget" ? data.reason : "user_daily";
  return { ok: false, retryAfterMs, reason };
}
