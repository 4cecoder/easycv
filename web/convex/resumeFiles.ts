import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addResumeFile = mutation({
  args: {
    uploadId: v.id("uploads"),
    filename: v.string(),
    storageId: v.id("_storage"),
    ext: v.string(),
    sizeKb: v.number(),
    category: v.string(),
    extractedText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("resumeFiles", args);
  },
});

export const listResumeFiles = query({
  args: {
    uploadId: v.id("uploads"),
  },
  handler: async (ctx, { uploadId }) => {
    return await ctx.db
      .query("resumeFiles")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .collect();
  },
});
