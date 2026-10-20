import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload, requireOwnerSession } from "./authz";

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
    const owner = await requireOwnerSession(ctx, sessionId);
    if (uploadId && !(await ownedUpload(ctx.db, uploadId, owner))) {
      throw new Error("Upload not found or not owned by this session");
    }
    const existing = await ctx.db
      .query("candidateInsights")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        sessionId: owner,
        uploadId: uploadId ?? existing.uploadId,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("candidateInsights", {
      sessionId: owner,
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
    const owner = await requireOwnerSession(ctx, sessionId);
    return await ctx.db
      .query("candidateInsights")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();
  },
});
