import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

// Mirrors pipeline.py's score_structured_data() output shape — the caller
// (Python) computes these, TS just stores them as-is.
const sampleQuality = {
  qualityScore: 10,
  qualityMaxScore: 15,
  qualityWarnings: ["no contact phone"],
  qualityCritical: false,
};

async function storeFakeFile(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["hello world"]));
  });
}

describe("resume bundle lifecycle", () => {
  test("create upload -> add file -> save profile -> pay -> download", async () => {
    const t = convexTest(schema);

    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-abc123",
    });
    expect(uploadId).toBeTruthy();

    const storageId = await storeFakeFile(t);
    const fileId = await t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      filename: "resume.pdf",
      storageId,
      ext: "pdf",
      sizeKb: 42,
      category: "resume",
      extractedText: "Some extracted text",
    });
    expect(fileId).toBeTruthy();

    const files = await t.query(api.resumeFiles.listResumeFiles, {
      uploadId,
    });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("resume.pdf");
    expect(files[0].category).toBe("resume");

    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Jane Doe",
      contact: { email: "jane@example.com" },
      titles: ["Software Engineer"],
      summary: "Backend engineer.",
      skills: {
        languages: ["Python", "TypeScript"],
        frameworks: [],
        cloud_devops: [],
        databases: [],
        tools: [],
      },
      experience: [],
      education: [],
      certifications: [],
      languagesSpoken: [],
      ...sampleQuality,
    });
    expect(profileId).toBeTruthy();

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
    });
    expect(profile?.name).toBe("Jane Doe");
    expect(profile?.qualityScore).toBe(10);

    // Upsert semantics: saving again for the same uploadId patches, not inserts.
    const profileId2 = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Jane A. Doe",
      ...sampleQuality,
    });
    expect(profileId2).toBe(profileId);
    const patched = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
    });
    expect(patched?.name).toBe("Jane A. Doe");

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, pdfStorageId });
    const withPdf = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
    });
    expect(withPdf?.pdfStorageId).toBe(pdfStorageId);

    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      stripeSessionId: "cs_test_123",
      amountCents: 1500,
      currency: "usd",
    });

    // Before payment: not paid, no download token yet.
    const statusBefore = await t.query(api.payments.getPaymentStatus, {
      uploadId,
    });
    expect(statusBefore).toEqual({ paid: false, downloadToken: null });

    const downloadToken = await t.mutation(api.payments.markPaymentPaid, {
      stripeSessionId: "cs_test_123",
    });
    expect(typeof downloadToken).toBe("string");
    expect(downloadToken.length).toBeGreaterThan(0);

    const statusAfter = await t.query(api.payments.getPaymentStatus, {
      uploadId,
    });
    expect(statusAfter).toEqual({ paid: true, downloadToken });

    const gated = await t.query(api.payments.getByDownloadToken, {
      downloadToken,
    });
    expect(gated).not.toBeNull();
    expect(gated?.payment.status).toBe("paid");
    expect(gated?.payment.downloadCount).toBe(0);
    expect(gated?.upload?._id).toBe(uploadId);

    const newCount = await t.mutation(api.payments.incrementDownloadCount, {
      downloadToken,
    });
    expect(newCount).toBe(1);

    const gatedAgain = await t.query(api.payments.getByDownloadToken, {
      downloadToken,
    });
    expect(gatedAgain?.payment.downloadCount).toBe(1);
  });

  test("getUpload joins files, profile, and payment (null-safe)", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-lonely",
    });

    const bare = await t.query(api.uploads.getUpload, { uploadId });
    expect(bare?.status).toBe("scanning");
    expect(bare?.resumeFiles).toEqual([]);
    expect(bare?.structuredProfile).toBeNull();
    expect(bare?.payment).toBeNull();
  });

  test("getUpload returns null for a nonexistent upload id", async () => {
    const t = convexTest(schema);
    const uploadIdA = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-a",
    });
    // Delete it to get a well-formed but nonexistent id.
    await t.run(async (ctx) => {
      await ctx.db.delete(uploadIdA);
    });
    const result = await t.query(api.uploads.getUpload, {
      uploadId: uploadIdA,
    });
    expect(result).toBeNull();
  });
});

describe("download gate", () => {
  test("getByDownloadToken returns null for a pending (unpaid) payment", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-pending",
    });
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      stripeSessionId: "cs_test_pending",
      amountCents: 1500,
      currency: "usd",
    });

    // A pending payment never has a downloadToken (only markPaymentPaid sets
    // one), so there is no legitimate token to look up. Simulate an attacker
    // guessing/forging a token value against the gate.
    const guessed = await t.query(api.payments.getByDownloadToken, {
      downloadToken: "forged-token-that-was-never-issued",
    });
    expect(guessed).toBeNull();

    const status = await t.query(api.payments.getPaymentStatus, {
      uploadId,
    });
    expect(status.downloadToken).toBeNull();
    expect(status.paid).toBe(false);
  });

  test("markPaymentPaid throws for an unknown stripeSessionId", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.payments.markPaymentPaid, {
        stripeSessionId: "cs_does_not_exist",
      }),
    ).rejects.toThrow();
  });
});

describe("file storage helpers", () => {
  test("generateUploadUrl returns a URL usable to upload bytes", async () => {
    const t = convexTest(schema);
    const url = await t.mutation(api.files.generateUploadUrl, {});
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  test("getProfilePdfUrl is null before a PDF is set, then resolves after setProfilePdf", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-pdf",
    });
    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Jane Doe",
      ...sampleQuality,
    });

    const before = await t.query(api.profiles.getProfilePdfUrl, { uploadId });
    expect(before).toBeNull();

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, pdfStorageId });

    const after = await t.query(api.profiles.getProfilePdfUrl, { uploadId });
    expect(typeof after).toBe("string");
  });

  test("getProfilePdfUrl is null when there is no structuredProfile at all", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-no-profile",
    });
    const url = await t.query(api.profiles.getProfilePdfUrl, { uploadId });
    expect(url).toBeNull();
  });
});
