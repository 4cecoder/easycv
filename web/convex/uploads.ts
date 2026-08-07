import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload } from "./authz";
import { requireWorkerSecret } from "./workerAuth";

export const createUpload = mutation({
  args: {
    sessionId: v.string(),
    jobDescription: v.optional(v.string()),
    jobLink: v.optional(v.string()),
    consolidationMetadata: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, jobDescription, jobLink, consolidationMetadata }) => {
    // Deliberately NOT "queued" yet -- the upload route creates this row
    // before it has finished attaching resumeFiles (each is its own
    // mutation + a Convex storage upload in between). "queued" is what
    // claimNextQueued's by_status index scan makes claimable; without this
    // intermediate state, a worker polling every few seconds can and did
    // (caught live, not hypothetically) claim an upload with zero
    // resumeFiles attached yet, wasting a real attempt out of the bounded
    // retry budget on a race rather than an actual failure. finalizeUpload
    // flips this to "queued" once the route is done attaching files.
    const uploadId = await ctx.db.insert("uploads", {
      sessionId,
      status: "uploading",
      attempts: 0,
      createdAt: Date.now(),
      jobDescription,
      jobLink,
      consolidationMetadata,
    });
    return uploadId;
  },
});

// Called once by the upload route after every resumeFiles row has been
// attached -- flips "uploading" to "queued", making it eligible for
// claimNextQueued for the first time. Session-owned (not worker-secret
// gated): this is the client's own upload finishing, not a worker
// operation.
export const finalizeUpload = mutation({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) throw new Error("Upload not found or not owned by this session");
    await ctx.db.patch(uploadId, { status: "queued" });
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
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();

    const structuredProfile = await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    const payment = await ctx.db
      .query("payments")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    return {
      ...upload,
      resumeFiles,
      structuredProfile: structuredProfile ?? null,
      payment: payment ?? null,
    };
  },
});

// --- Worker-facing mutations ------------------------------------------
// See convex/workerAuth.ts for why these are public-but-secret-gated
// rather than internalMutation.

// How many times the worker will attempt a given upload (across possibly
// multiple worker process lifetimes -- attempts lives on the row, not in
// worker memory, specifically so a crashed/restarted worker doesn't reset
// the count and retry forever) before giving up and marking it "error".
// This IS the "loop until successful without tailspinning out of control"
// ceiling -- bounded, persisted, and enforced server-side rather than
// trusted to whatever the worker process happens to remember.
export const MAX_ATTEMPTS = 3;

// Claims the oldest queued (or stale-processing -- see below) upload and
// marks it "processing". Returns null if there's nothing to do.
//
// A job stuck in "processing" past STALE_PROCESSING_MS is treated as
// abandoned (a crashed worker, a killed process, whatever) and becomes
// reclaimable again -- this also means the same shared-secret abuse case
// (claim-and-never-finish) is self-healing rather than a permanent stuck
// state, without needing anything fancier than a timestamp comparison.
const STALE_PROCESSING_MS = 10 * 60 * 1000; // 10 minutes

export const claimNextQueued = mutation({
  args: { workerSecret: v.string() },
  handler: async (ctx, { workerSecret }) => {
    requireWorkerSecret(workerSecret);

    const queued = await ctx.db
      .query("uploads")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .first();

    let claim = queued;
    if (!claim) {
      const staleCutoff = Date.now() - STALE_PROCESSING_MS;
      const processing = await ctx.db
        .query("uploads")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .collect();
      // processingStartedAt, NOT createdAt -- a job claimed shortly after
      // creation would look immediately stale measured from createdAt,
      // letting a second worker claim and process the same job at once.
      claim =
        processing.find(
          (u) => (u.processingStartedAt ?? 0) < staleCutoff,
        ) ?? null;
    }
    if (!claim) return null;

    if (claim.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(claim._id, {
        status: "error",
        errorMessage: "Exceeded maximum processing attempts.",
      });
      return null;
    }

    await ctx.db.patch(claim._id, {
      status: "processing",
      attempts: claim.attempts + 1,
      processingStartedAt: Date.now(),
    });
    return claim._id;
  },
});

export const markReady = mutation({
  args: { uploadId: v.id("uploads"), workerSecret: v.string() },
  handler: async (ctx, { uploadId, workerSecret }) => {
    requireWorkerSecret(workerSecret);
    await ctx.db.patch(uploadId, { status: "ready", errorMessage: undefined });
  },
});

// Called on a failed attempt. Requeues for another try if under
// MAX_ATTEMPTS (claimNextQueued will pick it up again on a future poll --
// that gap is a free, simple form of backoff), otherwise marks it a
// terminal "error" with a short, user-facing reason.
export const markAttemptFailed = mutation({
  args: {
    uploadId: v.id("uploads"),
    workerSecret: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { uploadId, workerSecret, reason }) => {
    requireWorkerSecret(workerSecret);
    const upload = await ctx.db.get(uploadId);
    if (!upload) return;

    if (upload.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(uploadId, { status: "error", errorMessage: reason });
    } else {
      await ctx.db.patch(uploadId, { status: "queued", errorMessage: reason });
    }
  },
});

export const getUploadForWorker = query({
  args: { uploadId: v.id("uploads"), workerSecret: v.string() },
  handler: async (ctx, { uploadId, workerSecret }) => {
    requireWorkerSecret(workerSecret);
    return await ctx.db.get(uploadId);
  },
});
