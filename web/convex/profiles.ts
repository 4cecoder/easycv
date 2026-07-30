import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { contact, skills, experienceEntry, educationEntry } from "./schema";
import { ownedUpload } from "./authz";

// All structuredProfiles fields except uploadId (the lookup key) and
// pdfStorageId (set separately by setProfilePdf once a PDF has been compiled).
const profileFields = {
  name: v.optional(v.string()),
  contact: v.optional(contact),
  titles: v.optional(v.array(v.string())),
  summary: v.optional(v.string()),
  skills: v.optional(skills),
  experience: v.optional(v.array(experienceEntry)),
  education: v.optional(v.array(educationEntry)),
  certifications: v.optional(v.array(v.string())),
  languagesSpoken: v.optional(v.array(v.string())),
  rawFallback: v.optional(v.string()),
  qualityScore: v.number(),
  qualityMaxScore: v.number(),
  qualityWarnings: v.array(v.string()),
  qualityCritical: v.boolean(),
};

export const saveStructuredProfile = mutation({
  args: {
    uploadId: v.id("uploads"),
    ...profileFields,
  },
  handler: async (ctx, { uploadId, ...fields }) => {
    const existing = await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    if (existing) {
      // Full replace, not patch: `fields` comes from the caller's spread of
      // profileFieldsFrom() (lib/profileMapping.ts), which returns `undefined`
      // for any field it couldn't extract this time around. Over the real
      // HTTP path (app/api/upload/route.ts -> Convex client), those
      // undefined-valued keys are dropped entirely by JSON serialization
      // before reaching this handler -- so a `patch` (shallow merge, only
      // clears keys explicitly present with value `undefined`) would leave
      // whatever was saved for that field on a *previous* consolidation,
      // silently stale and inconsistent with the freshly computed quality
      // warnings/score. `replace` overwrites the whole document instead, so
      // a re-consolidation always reflects exactly what this call provided.
      // pdfStorageId is excluded from `profileFields` on purpose (it's set
      // later by setProfilePdf once a PDF has been compiled) -- carry the
      // existing value forward explicitly so replace() doesn't drop it.
      await ctx.db.replace(existing._id, {
        uploadId,
        pdfStorageId: existing.pdfStorageId,
        ...fields,
      });
      return existing._id;
    }

    return await ctx.db.insert("structuredProfiles", { uploadId, ...fields });
  },
});

export const setProfilePdf = mutation({
  args: {
    uploadId: v.id("uploads"),
    pdfStorageId: v.id("_storage"),
  },
  handler: async (ctx, { uploadId, pdfStorageId }) => {
    const existing = await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();
    if (!existing) {
      throw new Error(`No structuredProfile found for uploadId ${uploadId}`);
    }
    await ctx.db.patch(existing._id, { pdfStorageId });
    return existing._id;
  },
});

export const getStructuredProfile = query({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return null;

    return await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();
  },
});

// Convex file storage is fetched via a signed URL, never returned as raw
// bytes from a query. Requires the caller's sessionId to own the upload --
// the payment-gated download path (app/api/download/[token]/route.ts) does
// NOT use this; it gets its PDF URL from payments.getByDownloadToken instead,
// which is authorized by a paid downloadToken rather than a sessionId. This
// export exists for session-scoped callers (e.g. a future "my uploads" page)
// and defense in depth. Returns null if there's no profile yet, no PDF has
// been compiled for it, or the caller doesn't own the upload.
export const getProfilePdfUrl = query({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return null;

    const profile = await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();
    if (!profile?.pdfStorageId) return null;
    return await ctx.storage.getUrl(profile.pdfStorageId);
  },
});

export const saveJobMatch = mutation({
  args: {
    uploadId: v.id("uploads"),
    matchScore: v.number(),
    matchedKeywords: v.array(v.string()),
    missingKeywords: v.array(v.string()),
    gapAnalysis: v.string(),
    tailoredBullets: v.array(v.string()),
    workerSecret: v.string(),
  },
  handler: async (ctx, { uploadId, workerSecret, ...fields }) => {
    // Require worker secret verification
    const validSecret = process.env.WORKER_SECRET;
    if (!validSecret || workerSecret !== validSecret) {
      throw new Error("Unauthorized: Invalid worker secret");
    }

    const existing = await ctx.db
      .query("jobMatches")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    if (existing) {
      await ctx.db.replace(existing._id, { uploadId, ...fields });
      return existing._id;
    }

    return await ctx.db.insert("jobMatches", { uploadId, ...fields });
  },
});

export const getJobMatch = query({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return null;

    return await ctx.db
      .query("jobMatches")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();
  },
});
