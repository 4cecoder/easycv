import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload } from "./authz";
import { requireWorkerSecret } from "./workerAuth";

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
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return [];

    return await ctx.db
      .query("resumeFiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();
  },
});

// Worker-facing: the consolidation worker needs a given upload's files
// regardless of which browser session created it -- it's a trusted system
// process, not acting on behalf of any one user. See convex/workerAuth.ts.
// Returns signed, time-limited download URLs (Convex's standard pattern for
// handing file bytes to a caller that isn't itself a Convex function) --
// never raw bytes from a query.
export const getResumeFilesForWorker = query({
  args: {
    uploadId: v.id("uploads"),
    workerSecret: v.string(),
  },
  handler: async (ctx, { uploadId, workerSecret }) => {
    requireWorkerSecret(workerSecret);

    const files = await ctx.db
      .query("resumeFiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();

    return await Promise.all(
      files.map(async (f) => ({
        filename: f.filename,
        ext: f.ext,
        url: await ctx.storage.getUrl(f.storageId),
      })),
    );
  },
});
