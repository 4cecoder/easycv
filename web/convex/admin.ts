import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function verifyAdminPasscode(passcode: string) {
  const correct = process.env.ADMIN_PASSWORD || "admin123";
  if (passcode !== correct) {
    throw new Error("Unauthorized admin passcode");
  }
}

export const listAllUploads = query({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }) => {
    const correct = process.env.ADMIN_PASSWORD || "admin123";
    if (passcode !== correct) {
      return [];
    }

    const uploads = await ctx.db.query("uploads").order("desc").take(100);

    const enriched = await Promise.all(
      uploads.map(async (upload) => {
        const resumeFiles = await ctx.db
          .query("resumeFiles")
          .withIndex("by_upload", (q) => q.eq("uploadId", upload._id))
          .collect();

        const structuredProfile = await ctx.db
          .query("structuredProfiles")
          .withIndex("by_upload", (q) => q.eq("uploadId", upload._id))
          .first();

        const payments = await ctx.db
          .query("payments")
          .withIndex("by_upload", (q) => q.eq("uploadId", upload._id))
          .collect();

        return {
          ...upload,
          resumeFiles,
          structuredProfile: structuredProfile ?? null,
          payments,
        };
      })
    );

    return enriched;
  },
});

export const deleteUpload = mutation({
  args: { passcode: v.string(), uploadId: v.id("uploads") },
  handler: async (ctx, { passcode, uploadId }) => {
    verifyAdminPasscode(passcode);

    // 1. Delete resumeFiles and their storage files
    const resumeFiles = await ctx.db
      .query("resumeFiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();

    for (const rf of resumeFiles) {
      try {
        await ctx.storage.delete(rf.storageId);
      } catch (e) {
        console.error("Storage delete failed for resume file", e);
      }
      await ctx.db.delete(rf._id);
    }

    // 2. Delete structured profile and its compiled PDF
    const profile = await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    if (profile) {
      if (profile.pdfStorageId) {
        try {
          await ctx.storage.delete(profile.pdfStorageId);
        } catch (e) {
          console.error("Storage delete failed for PDF", e);
        }
      }
      await ctx.db.delete(profile._id);
    }

    // 3. Delete payments
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();

    for (const p of payments) {
      await ctx.db.delete(p._id);
    }

    // 4. Delete the upload row itself
    await ctx.db.delete(uploadId);
    return { success: true };
  },
});

export const bypassPayment = mutation({
  args: { passcode: v.string(), uploadId: v.id("uploads") },
  handler: async (ctx, { passcode, uploadId }) => {
    verifyAdminPasscode(passcode);

    const existingPayment = await ctx.db
      .query("payments")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();

    const downloadToken = crypto.randomUUID();

    if (existingPayment) {
      await ctx.db.patch(existingPayment._id, {
        status: "paid",
        paidAt: Date.now(),
        downloadToken,
      });
    } else {
      await ctx.db.insert("payments", {
        uploadId,
        stripeSessionId: `bypass-${crypto.randomUUID()}`,
        amountCents: 1500, // standard price $15
        currency: "usd",
        status: "paid",
        createdAt: Date.now(),
        paidAt: Date.now(),
        downloadToken,
        downloadCount: 0,
      });
    }

    return { success: true, downloadToken };
  },
});

export const retryUpload = mutation({
  args: { passcode: v.string(), uploadId: v.id("uploads") },
  handler: async (ctx, { passcode, uploadId }) => {
    verifyAdminPasscode(passcode);

    await ctx.db.patch(uploadId, {
      status: "queued",
      attempts: 0,
      errorMessage: undefined,
    });

    return { success: true };
  },
});
