/// <reference types="vite/client" />
// @vitest-environment node
//
// EASYC-6: durable, server-side rate limits. Every test pins the clock with
// fake timers (vi.setSystemTime) so window boundaries are deterministic.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";

import { api, components } from "./_generated/api";
import schema from "./schema";
import {
  GLOBAL_LLM_CALLS_PER_DAY,
  JOB_MATCH_PER_DAY,
  JOB_MATCH_PER_HOUR,
  RATE_LIMIT_CONFIG,
  UPLOAD_HARD_CAP_PER_24H,
  UPLOADS_PER_DAY,
} from "./rateLimits";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 2026-10-20T00:00:00Z -- a UTC day (and hour) boundary.
const DAY_START = Date.UTC(2026, 9, 20);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

function as(t: ReturnType<typeof setup>, subject: string) {
  return t.withIdentity({ subject, tokenIdentifier: `https://auth.seridian.dev|${subject}` });
}

async function consumeJobMatchTimes(user: ReturnType<typeof as>, n: number) {
  for (let i = 0; i < n; i++) {
    const r = await user.mutation(api.rateLimits.consumeJobMatch, {});
    expect(r.ok, `call ${i + 1} of ${n}`).toBe(true);
  }
}

/** Assert a ConvexError with the given `data.code` (direct or via message JSON). */
async function expectConvexCode(promise: Promise<unknown>, code: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err, "expected the call to be refused").not.toBeNull();
  const data = err instanceof ConvexError ? (err.data as { code?: string }) : undefined;
  const text = data?.code ?? String((err as Error).message);
  expect(text).toContain(code);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DAY_START + 5 * 60 * 1000); // 00:05 UTC
});
afterEach(() => {
  vi.useRealTimers();
});

describe("job match limits (hosted LLM)", () => {
  test("@regression EASYC-6 job match refused after 10/hour with retryAfter to the next hour", async () => {
    const t = setup();
    const alice = as(t, "alice");
    await consumeJobMatchTimes(alice, JOB_MATCH_PER_HOUR);

    const refused = await alice.mutation(api.rateLimits.consumeJobMatch, {});
    expect(refused).toMatchObject({ ok: false, reason: "user_hourly" });
    if (refused.ok) throw new Error("unreachable");
    // Fixed window aligned to UTC: frees up at 01:00, i.e. 55 minutes from 00:05.
    expect(refused.retryAfterMs).toBe(55 * 60 * 1000);
  });

  test("@regression EASYC-6 hourly limit resets after the window", async () => {
    const t = setup();
    const alice = as(t, "alice");
    await consumeJobMatchTimes(alice, JOB_MATCH_PER_HOUR);
    expect((await alice.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(false);

    vi.setSystemTime(DAY_START + HOUR); // 01:00 UTC
    expect((await alice.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(true);
  });

  test("@regression EASYC-6 daily cap of 30 holds across hourly resets, resets at UTC midnight", async () => {
    const t = setup();
    const alice = as(t, "alice");
    const hours = JOB_MATCH_PER_DAY / JOB_MATCH_PER_HOUR; // 3
    for (let h = 0; h < hours; h++) {
      vi.setSystemTime(DAY_START + h * HOUR + 60_000);
      await consumeJobMatchTimes(alice, JOB_MATCH_PER_HOUR);
    }
    vi.setSystemTime(DAY_START + hours * HOUR + 60_000); // fresh hour, but day exhausted
    const refused = await alice.mutation(api.rateLimits.consumeJobMatch, {});
    expect(refused).toMatchObject({ ok: false, reason: "user_daily" });
    if (refused.ok) throw new Error("unreachable");
    expect(refused.retryAfterMs).toBe(DAY - (hours * HOUR + 60_000));

    vi.setSystemTime(DAY_START + DAY); // next UTC midnight
    expect((await alice.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(true);
  });

  test("a daily refusal does not burn an hourly token (all-or-nothing consume)", async () => {
    const t = setup();
    const alice = as(t, "alice");
    // Exhaust the daily window over 3 hours, then confirm the 4th hour's
    // refused attempts left the hourly bucket untouched.
    for (let h = 0; h < 3; h++) {
      vi.setSystemTime(DAY_START + h * HOUR + 60_000);
      await consumeJobMatchTimes(alice, JOB_MATCH_PER_HOUR);
    }
    vi.setSystemTime(DAY_START + 3 * HOUR + 60_000);
    for (let i = 0; i < 3; i++) {
      expect((await alice.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(false);
    }
    const limiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
    // The full hourly allowance is still available in this window.
    const hourly = await t.run((ctx) => limiter.check(ctx, "jobMatchHourly", {
      key: "https://auth.seridian.dev|alice", count: JOB_MATCH_PER_HOUR,
    }));
    expect(hourly.ok).toBe(true);
  });

  test("@regression EASYC-6 limits are per user: A exhausting does not affect B", async () => {
    const t = setup();
    const alice = as(t, "alice");
    const bob = as(t, "bob");
    await consumeJobMatchTimes(alice, JOB_MATCH_PER_HOUR);
    expect((await alice.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(false);

    await consumeJobMatchTimes(bob, JOB_MATCH_PER_HOUR);
    expect((await bob.mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(false);
  });

  test("@regression EASYC-6 global daily LLM budget trips for every user", async () => {
    const t = setup();
    const limiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
    // Pre-spend all but one unit of the global budget (as if many users had).
    await t.run((ctx) => limiter.limit(ctx, "llmGlobalDaily", { count: GLOBAL_LLM_CALLS_PER_DAY - 1, throws: true }));

    expect((await as(t, "alice").mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(true);

    // A brand-new user with full personal allowance is still refused.
    const refused = await as(t, "carol").mutation(api.rateLimits.consumeJobMatch, {});
    expect(refused).toMatchObject({ ok: false, reason: "global_budget" });
    if (refused.ok) throw new Error("unreachable");
    expect(refused.retryAfterMs).toBe(DAY - 5 * 60 * 1000);

    // ...and carol's personal tokens were not consumed by the refusal.
    const carolHourly = await t.run((ctx) => limiter.check(ctx, "jobMatchHourly", {
      key: "https://auth.seridian.dev|carol", count: JOB_MATCH_PER_HOUR,
    }));
    expect(carolHourly.ok).toBe(true);

    vi.setSystemTime(DAY_START + DAY);
    expect((await as(t, "carol").mutation(api.rateLimits.consumeJobMatch, {})).ok).toBe(true);
  });

  test("@regression EASYC-6 anonymous callers are rejected (no client-supplied key)", async () => {
    const t = setup();
    await expect(t.mutation(api.rateLimits.consumeJobMatch, {})).rejects.toThrow(/Unauthenticated/);
    await expect(t.mutation(api.rateLimits.consumeUpload, {})).rejects.toThrow(/Unauthenticated/);
  });

  test("key is the bound legacy owner key, so re-binding identities can't mint fresh buckets", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("userAccounts", {
      email: "member@example.com", sessionId: "legacy-owner", verified: true,
      createdAt: 1, lastLoginAt: 1, seridianSubject: "bound-subject",
    }));
    await consumeJobMatchTimes(as(t, "bound-subject"), JOB_MATCH_PER_HOUR);
    const limiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
    // Tokens were charged to the bound legacy owner key, not the raw subject.
    const legacy = await t.run((ctx) => limiter.check(ctx, "jobMatchHourly", { key: "legacy-owner" }));
    expect(legacy.ok).toBe(false);
    const rawSubject = await t.run((ctx) => limiter.check(ctx, "jobMatchHourly", {
      key: "https://auth.seridian.dev|bound-subject", count: JOB_MATCH_PER_HOUR,
    }));
    expect(rawSubject.ok).toBe(true);
  });
});

describe("upload limits", () => {
  test("@regression EASYC-6 uploads refused after 20/day per user, reset next UTC day", async () => {
    const t = setup();
    const alice = as(t, "alice");
    for (let i = 0; i < UPLOADS_PER_DAY; i++) {
      expect((await alice.mutation(api.rateLimits.consumeUpload, {})).ok).toBe(true);
    }
    const refused = await alice.mutation(api.rateLimits.consumeUpload, {});
    expect(refused).toMatchObject({ ok: false, reason: "user_daily", retryAfterMs: DAY - 5 * 60 * 1000 });
    expect((await as(t, "bob").mutation(api.rateLimits.consumeUpload, {})).ok).toBe(true);

    vi.setSystemTime(DAY_START + DAY);
    expect((await alice.mutation(api.rateLimits.consumeUpload, {})).ok).toBe(true);
  });

  test("@regression EASYC-6 createUpload backstop refuses direct Convex calls past the rolling cap", async () => {
    const t = setup();
    const owner = "https://auth.seridian.dev|alice";
    const alice = as(t, "alice");
    for (let i = 0; i < UPLOAD_HARD_CAP_PER_24H; i++) {
      await alice.mutation(api.uploads.createUpload, { sessionId: owner });
    }
    await expectConvexCode(alice.mutation(api.uploads.createUpload, { sessionId: owner }), "rate_limited");
    // Another owner is unaffected.
    await as(t, "bob").mutation(api.uploads.createUpload, { sessionId: "https://auth.seridian.dev|bob" });

    vi.setSystemTime(DAY_START + 5 * 60 * 1000 + DAY + 1);
    await alice.mutation(api.uploads.createUpload, { sessionId: owner });
  });
});

describe("free quotas are server-enforced", () => {
  test("@regression EASYC-6 consumeAutoImproveQuota refuses once exhausted and stops counting", async () => {
    const t = setup();
    const owner = "https://auth.seridian.dev|alice";
    const alice = as(t, "alice");
    await expect(alice.mutation(api.quotas.consumeAutoImproveQuota, { sessionId: owner }))
      .resolves.toEqual({ success: true, count: 1, remaining: 1 });
    await expect(alice.mutation(api.quotas.consumeAutoImproveQuota, { sessionId: owner }))
      .resolves.toEqual({ success: true, count: 2, remaining: 0 });
    await expectConvexCode(alice.mutation(api.quotas.consumeAutoImproveQuota, { sessionId: owner }), "quota_exhausted");
    expect(await alice.query(api.quotas.getAutoImproveQuota, { sessionId: owner }))
      .toMatchObject({ count: 2, remaining: 0, isExhausted: true });
  });

  test("@regression EASYC-6 consumeSampleQuota refuses once exhausted and stops counting", async () => {
    const t = setup();
    const owner = "https://auth.seridian.dev|alice";
    const alice = as(t, "alice");
    await alice.mutation(api.faq.consumeSampleQuota, { sessionId: owner });
    await alice.mutation(api.faq.consumeSampleQuota, { sessionId: owner });
    await expectConvexCode(alice.mutation(api.faq.consumeSampleQuota, { sessionId: owner }), "quota_exhausted");
    expect(await alice.query(api.faq.getSampleQuota, { sessionId: owner }))
      .toMatchObject({ count: 2, remaining: 0, isExhausted: true });
    // Per user: bob still has his samples.
    await expect(as(t, "bob").mutation(api.faq.consumeSampleQuota, { sessionId: "https://auth.seridian.dev|bob" }))
      .resolves.toMatchObject({ success: true, count: 1 });
  });

  test("quota mutations still reject a forged sessionId", async () => {
    const t = setup();
    await expect(as(t, "alice").mutation(api.quotas.consumeAutoImproveQuota, { sessionId: "https://auth.seridian.dev|bob" }))
      .rejects.toThrow(/Unauthorized/);
  });
});
