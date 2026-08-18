import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordFaqQuery = mutation({
  args: {
    sessionId: v.string(),
    question: v.string(),
    answer: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("faqQueries", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const rateFaqQuery = mutation({
  args: {
    queryId: v.id("faqQueries"),
    feedback: v.string(), // "helpful" | "unhelpful"
  },
  handler: async (ctx, { queryId, feedback }) => {
    await ctx.db.patch(queryId, { feedback });
    return { success: true };
  },
});

export const listRecentFaqFeedback = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    return await ctx.db
      .query("faqQueries")
      .order("desc")
      .take(limit);
  },
});

const MAX_FREE_SAMPLES = 2;

export const getSampleQuota = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    if (!sessionId) {
      return { count: 0, maxFree: MAX_FREE_SAMPLES, remaining: MAX_FREE_SAMPLES, isExhausted: false };
    }

    const record = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    const count = record?.sampleViewCount ?? 0;
    const remaining = Math.max(0, MAX_FREE_SAMPLES - count);

    return {
      count,
      maxFree: MAX_FREE_SAMPLES,
      remaining,
      isExhausted: remaining <= 0,
    };
  },
});

export const consumeSampleQuota = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    if (!sessionId) return { success: false, remaining: 0 };

    const existing = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing) {
      const newCount = (existing.sampleViewCount ?? 0) + 1;
      await ctx.db.patch(existing._id, {
        sampleViewCount: newCount,
        lastUsedAt: Date.now(),
      });
      return {
        success: true,
        count: newCount,
        remaining: Math.max(0, MAX_FREE_SAMPLES - newCount),
      };
    }

    await ctx.db.insert("usageQuotas", {
      sessionId,
      autoImproveCount: 0,
      sampleViewCount: 1,
      lastUsedAt: Date.now(),
    });

    return {
      success: true,
      count: 1,
      remaining: MAX_FREE_SAMPLES - 1,
    };
  },
});
