import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload } from "./authz";

export const createUpload = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const uploadId = await ctx.db.insert("uploads", {
      sessionId,
      status: "scanning",
      createdAt: Date.now(),
    });
    return uploadId;
  },
});

export const getUpload = query({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return null;

    const resumeFiles = await ctx.db
      .query("resumeFiles")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .collect();

    const structuredProfile = await ctx.db
      .query("structuredProfiles")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .first();

    const payment = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .first();

    return {
      ...upload,
      resumeFiles,
      structuredProfile: structuredProfile ?? null,
      payment: payment ?? null,
    };
  },
});
