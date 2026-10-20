import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "./authz";

const MAX_FREE_AUTO_IMPROVES = 2;

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
