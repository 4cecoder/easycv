import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveCandidateInsights = mutation({
  args: {
    sessionId: v.string(),
    uploadId: v.optional(v.id("uploads")),
    targetRole: v.optional(v.string()),
    targetSeniority: v.optional(v.string()),
    targetSalaryRange: v.optional(v.string()),
    targetCompanies: v.optional(v.array(v.string())),
    workPreference: v.optional(v.string()),
    yearsExperience: v.optional(v.number()),
    primaryIndustry: v.optional(v.string()),
    activelyLooking: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, uploadId, ...fields }) => {
    const existing = await ctx.db
      .query("candidateInsights")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        uploadId: uploadId ?? existing.uploadId,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("candidateInsights", {
      sessionId,
      uploadId,
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

export const getCandidateInsights = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    if (!sessionId) return null;
    return await ctx.db
      .query("candidateInsights")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});
