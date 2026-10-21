import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAdmin, requireOwnerSession } from "./authz";

export const recordFaqQuery = mutation({
  args: {
    sessionId: v.string(),
    question: v.string(),
    answer: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionId);
    return await ctx.db.insert("faqQueries", {
      ...args,
      sessionId: owner,
      timestamp: Date.now(),
    });
  },
});

export const rateFaqQuery = mutation({
  args: {
    sessionId: v.string(),
    queryId: v.id("faqQueries"),
    feedback: v.string(), // "helpful" | "unhelpful"
  },
  handler: async (ctx, { sessionId, queryId, feedback }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    const entry = await ctx.db.get(queryId);
    if (!entry || entry.sessionId !== owner) throw new Error("Unauthorized");
    await ctx.db.patch(queryId, { feedback });
    return { success: true };
  },
});

export const listRecentFaqFeedback = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("faqQueries")
      .order("desc")
      .take(limit);
  },
});

/** Free FAQ sample views per owner (lifetime). */
export const MAX_FREE_SAMPLES = 2;

export const getSampleQuota = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const owner = await requireOwnerSession(ctx, sessionId);

    const record = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
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
    const owner = await requireOwnerSession(ctx, sessionId);

    const existing = await ctx.db
      .query("usageQuotas")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();

    // Server-enforced (EASYC-6): refuse once the free samples are spent
    // instead of counting past it. The success shape below is unchanged.
    if ((existing?.sampleViewCount ?? 0) >= MAX_FREE_SAMPLES) {
      throw new ConvexError({ code: "quota_exhausted", quota: "sample", remaining: 0 });
    }

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
      sessionId: owner,
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
