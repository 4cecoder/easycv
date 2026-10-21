import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireOwnerSession } from "./authz";

/** Free auto-improve applications per owner (lifetime). */
export const MAX_FREE_AUTO_IMPROVES = 2;

export const getAutoImproveQuota = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const owner = await requireOwnerSession(ctx, sessionId);

    const quota = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();

    const count = quota?.autoImproveCount ?? 0;
    const remaining = Math.max(0, MAX_FREE_AUTO_IMPROVES - count);

    return {
      count,
      maxFree: MAX_FREE_AUTO_IMPROVES,
      remaining,
      isExhausted: remaining <= 0,
    };
  },
});

export const consumeAutoImproveQuota = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const owner = await requireOwnerSession(ctx, sessionId);

    const existing = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();

    // Server-enforced (EASYC-6): refuse once the free allowance is spent
    // instead of counting past it. Throws so callers' flows stop; the
    // success shape below is unchanged.
    if ((existing?.autoImproveCount ?? 0) >= MAX_FREE_AUTO_IMPROVES) {
      throw new ConvexError({ code: "quota_exhausted", quota: "autoImprove", remaining: 0 });
    }

    if (existing) {
      const newCount = existing.autoImproveCount + 1;
      await ctx.db.patch(existing._id, {
        autoImproveCount: newCount,
        lastUsedAt: Date.now(),
      });
      return {
        success: true,
        count: newCount,
        remaining: Math.max(0, MAX_FREE_AUTO_IMPROVES - newCount),
      };
    }

    await ctx.db.insert("usageQuotas", {
      sessionId: owner,
      autoImproveCount: 1,
      lastUsedAt: Date.now(),
    });

    return {
      success: true,
      count: 1,
      remaining: MAX_FREE_AUTO_IMPROVES - 1,
    };
  },
});
