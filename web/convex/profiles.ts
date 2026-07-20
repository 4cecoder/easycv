import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { contact, skills, experienceEntry, educationEntry } from "./schema";

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
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
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
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
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
  },
  handler: async (ctx, { uploadId }) => {
    return await ctx.db
      .query("structuredProfiles")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .first();
  },
});
