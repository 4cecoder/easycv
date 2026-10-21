/**
 * Durable, shared server-side rate limits (EASYC-6).
 *
 * Why this lives in Convex: production runs on Netlify serverless functions,
 * so an in-memory limiter (see web/lib/rate-limit.ts) is per-instance and
 * resets on every cold start. These limits are stored in the
 * `@convex-dev/rate-limiter` component's tables and checked inside a Convex
 * mutation (a serializable transaction), so they hold across every Netlify
 * instance and can't be raced.
 *
 * Keys come ONLY from the verified identity on the Convex connection
 * (`ownerSessionKey(ctx)`), never from a client-supplied argument, cookie or
 * header -- the mutations below take no arguments at all.
 *
 * All windows are fixed windows aligned to UTC (`start: 0`): the hourly limit
 * resets at the top of each UTC hour and the daily limits at UTC midnight.
 */
import { DAY, HOUR, RateLimiter, type RateLimitConfig } from "@convex-dev/rate-limiter";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { mutation, type MutationCtx } from "./_generated/server";
import { ownerSessionKey } from "./authz";

/** Per-user hosted-LLM job matches allowed per UTC hour. */
export const JOB_MATCH_PER_HOUR = 10;
/** Per-user hosted-LLM job matches allowed per UTC day. */
export const JOB_MATCH_PER_DAY = 30;
/** Per-user résumé uploads (each queues worker LLM consolidation) per UTC day. */
export const UPLOADS_PER_DAY = 20;
/**
 * Hard backstop enforced inside uploads.createUpload itself (rolling 24h),
 * for callers that skip consumeUpload by hitting the public Convex URL
 * directly. 2x the daily limit so it never fires for legitimate use across
 * a UTC-midnight window boundary.
 */
export const UPLOAD_HARD_CAP_PER_24H = UPLOADS_PER_DAY * 2;
/**
 * Global circuit-breaker: hosted LLM calls per UTC day across ALL users.
 * Caps the cost blast radius of many accounts (or a leaked session) hammering
 * the paid provider; once tripped every caller gets a 429 until UTC midnight.
 */
export const GLOBAL_LLM_CALLS_PER_DAY = 2_000;

/** The rate-limit definitions, keyed by name. Exported for tests. */
export const RATE_LIMIT_CONFIG = {
  jobMatchHourly: { kind: "fixed window", rate: JOB_MATCH_PER_HOUR, period: HOUR, start: 0 },
  jobMatchDaily: { kind: "fixed window", rate: JOB_MATCH_PER_DAY, period: DAY, start: 0 },
  uploadDaily: { kind: "fixed window", rate: UPLOADS_PER_DAY, period: DAY, start: 0 },
  // Singleton (no key). Unsharded on purpose: at <= 2,000 writes/day OCC
  // contention is negligible, and sharding would make check-then-consume
  // below non-deterministic across shards.
  llmGlobalDaily: { kind: "fixed window", rate: GLOBAL_LLM_CALLS_PER_DAY, period: DAY, start: 0 },
} as const satisfies Record<string, RateLimitConfig>;

type LimitName = keyof typeof RATE_LIMIT_CONFIG;

const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);

/** Which limit refused the request; lets callers word the error. */
const limitReason = v.union(
  v.literal("user_hourly"),
  v.literal("user_daily"),
  v.literal("global_budget"),
);

/** Return shape of every consume mutation: allowed, or refused with a retry hint. */
export const consumeResult = v.union(
  v.object({ ok: v.literal(true), retryAfterMs: v.literal(0) }),
  v.object({ ok: v.literal(false), retryAfterMs: v.number(), reason: limitReason }),
);

type Reason = "user_hourly" | "user_daily" | "global_budget";
type ConsumeResult =
  | { ok: true; retryAfterMs: 0 }
  | { ok: false; retryAfterMs: number; reason: Reason };

const REASONS: Record<LimitName, Reason> = {
  jobMatchHourly: "user_hourly",
  jobMatchDaily: "user_daily",
  uploadDaily: "user_daily",
  llmGlobalDaily: "global_budget",
};

/**
 * Atomically consume one token from EVERY listed limit, or from none.
 *
 * All limits are checked first (non-consuming), so a refusal by e.g. the daily
 * limit never burns an hourly token. Because this runs inside one mutation the
 * check and the consume are a single transaction.
 */
async function consumeAll(
  ctx: MutationCtx,
  limits: ReadonlyArray<{ name: LimitName; key?: string }>,
): Promise<ConsumeResult> {
  let refused: { retryAfterMs: number; reason: Reason } | null = null;
  for (const { name, key } of limits) {
    const status = await rateLimiter.check(ctx, name, { key });
    if (!status.ok) {
      const retryAfterMs = Math.max(1, Math.ceil(status.retryAfter ?? 0));
      // Report the limit that frees up LAST: retrying earlier is pointless.
      if (!refused || retryAfterMs > refused.retryAfterMs) {
        refused = { retryAfterMs, reason: REASONS[name] };
      }
    }
  }
  if (refused) return { ok: false, ...refused };

  for (const { name, key } of limits) {
    // `throws: true` rolls the whole mutation back if a limit somehow refuses
    // after passing check() above, so we never consume a partial set.
    await rateLimiter.limit(ctx, name, { key, throws: true });
  }
  return { ok: true, retryAfterMs: 0 };
}

/**
 * Consume one hosted-LLM job-match token for the authenticated caller.
 * Call BEFORE invoking the LLM; when `ok` is false, do not call it.
 * Throws "Unauthenticated" for anonymous callers.
 */
export const consumeJobMatch = mutation({
  args: {},
  returns: consumeResult,
  handler: async (ctx): Promise<ConsumeResult> => {
    const owner = await ownerSessionKey(ctx);
    return await consumeAll(ctx, [
      { name: "jobMatchHourly", key: owner },
      { name: "jobMatchDaily", key: owner },
      { name: "llmGlobalDaily" },
    ]);
  },
});

/**
 * Consume one upload token for the authenticated caller.
 * Call BEFORE sanitizing/storing files and creating the upload row.
 * Throws "Unauthenticated" for anonymous callers.
 */
export const consumeUpload = mutation({
  args: {},
  returns: consumeResult,
  handler: async (ctx): Promise<ConsumeResult> => {
    const owner = await ownerSessionKey(ctx);
    return await consumeAll(ctx, [{ name: "uploadDaily", key: owner }]);
  },
});
