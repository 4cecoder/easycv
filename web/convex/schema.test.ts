import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

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
      sessionId: "sess-abc123",
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
      sessionId: "sess-abc123",
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
      sessionId: "sess-abc123",
    });
    expect(patched?.name).toBe("Jane A. Doe");

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, pdfStorageId });
    const withPdf = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-abc123",
    });
    expect(withPdf?.pdfStorageId).toBe(pdfStorageId);

    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: "sess-abc123",
      stripeSessionId: "cs_test_123",
      amountCents: 1500,
      currency: "usd",
    });

    // Before payment: not paid, no download token yet.
    const statusBefore = await t.query(api.payments.getPaymentStatus, {
      uploadId,
      sessionId: "sess-abc123",
    });
    expect(statusBefore).toEqual({ paid: false, downloadToken: null });

    // markPaymentPaid is internalMutation-only (see convex/payments.ts) --
    // only reachable via internal.payments, never api.payments, since it's
    // only meant to be called from convex/http.ts's Stripe webhook handler
    // after signature verification.
    const downloadToken = await t.mutation(internal.payments.markPaymentPaid, {
      stripeSessionId: "cs_test_123",
    });
    expect(typeof downloadToken).toBe("string");
    expect(downloadToken.length).toBeGreaterThan(0);

    const statusAfter = await t.query(api.payments.getPaymentStatus, {
      uploadId,
      sessionId: "sess-abc123",
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

  // Regression coverage for the stale-field bug: a re-consolidation whose
  // caller-supplied fields omit a previously-set field (as profileFieldsFrom()
  // does whenever it can't extract that section this time -- see
  // lib/profileMapping.ts) must not leave the old value in place. The real
  // HTTP path (app/api/upload/route.ts) sends this over JSON, which drops
  // `undefined`-valued keys entirely before they reach the mutation --
  // convexTest's in-process transport does the same key-dropping for a
  // plain object spread, so omitting the key here is the faithful
  // reproduction of that path (unlike explicitly passing `skills: undefined`,
  // which convex would reject as a validator mismatch anyway).
  test("saveStructuredProfile clears a field omitted on re-save, not just patches", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-restale",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Jane Doe",
      skills: {
        languages: ["Python"],
        frameworks: [],
        cloud_devops: [],
        databases: [],
        tools: [],
      },
      qualityScore: 12,
      qualityMaxScore: 15,
      qualityWarnings: [],
      qualityCritical: false,
    });

    const firstSave = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-restale",
    });
    expect(firstSave?.skills?.languages).toEqual(["Python"]);

    // Re-consolidation that couldn't extract skills this time -- `skills`
    // is simply absent from the payload, exactly as profileFieldsFrom()
    // would produce after undefined-dropping JSON serialization.
    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Jane Doe",
      qualityScore: 5,
      qualityMaxScore: 15,
      qualityWarnings: ["skills missing"],
      qualityCritical: false,
    });

    const secondSave = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-restale",
    });
    expect(secondSave?.skills).toBeUndefined();
    expect(secondSave?.qualityWarnings).toEqual(["skills missing"]);
  });

  test("getUpload joins files, profile, and payment (null-safe)", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-lonely",
    });

    const bare = await t.query(api.uploads.getUpload, {
      uploadId,
      sessionId: "sess-lonely",
    });
    expect(bare?.status).toBe("queued");
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
      sessionId: "sess-a",
    });
    expect(result).toBeNull();
  });
});

// Regression coverage for the IDOR fix: every uploadId-scoped read must
// reject a sessionId that doesn't match the sessionId the upload was
// created with (convex/authz.ts's ownedUpload), returning the same
// null/empty/unpaid shape as "doesn't exist" rather than leaking data to a
// caller who merely knows another user's uploadId.
describe("cross-session authorization", () => {
  test("owner's session can read; a different session gets nothing", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "owner-session",
    });
    const storageId = await storeFakeFile(t);
    await t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      filename: "resume.pdf",
      storageId,
      ext: "pdf",
      sizeKb: 10,
      category: "resume",
    });
    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      name: "Victim Name",
      ...sampleQuality,
    });
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: "owner-session",
      stripeSessionId: "cs_attacker_test",
      amountCents: 1500,
      currency: "usd",
    });

    const attackerSession = "attacker-session";

    // Regression coverage for the IDOR fix on the write side: an attacker
    // holding only the victim's uploadId must not be able to attach their
    // own Stripe payment (and thus a downloadToken that unlocks the
    // victim's PDF) to that uploadId by passing their own sessionId.
    await expect(
      t.mutation(api.payments.createPaymentRecord, {
        uploadId,
        sessionId: attackerSession,
        stripeSessionId: "cs_attacker_hijack",
        amountCents: 1500,
        currency: "usd",
      }),
    ).rejects.toThrow();

    // Owner sees real data.
    expect(
      (await t.query(api.uploads.getUpload, { uploadId, sessionId: "owner-session" }))?.status,
    ).toBe("queued");
    expect(
      (await t.query(api.profiles.getStructuredProfile, { uploadId, sessionId: "owner-session" }))
        ?.name,
    ).toBe("Victim Name");

    // Attacker, holding only the uploadId, gets nothing back for any of the
    // uploadId-scoped reads -- not an error, not a distinguishable shape.
    expect(await t.query(api.uploads.getUpload, { uploadId, sessionId: attackerSession })).toBeNull();
    expect(
      await t.query(api.profiles.getStructuredProfile, { uploadId, sessionId: attackerSession }),
    ).toBeNull();
    expect(
      await t.query(api.resumeFiles.listResumeFiles, { uploadId, sessionId: attackerSession }),
    ).toEqual([]);
    expect(
      await t.query(api.payments.getPaymentStatus, { uploadId, sessionId: attackerSession }),
    ).toEqual({ paid: false, downloadToken: null });
    expect(
      await t.query(api.profiles.getProfilePdfUrl, { uploadId, sessionId: attackerSession }),
    ).toBeNull();
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
      sessionId: "sess-pending",
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
      sessionId: "sess-pending",
    });
    expect(status.downloadToken).toBeNull();
    expect(status.paid).toBe(false);
  });

  test("markPaymentPaid throws for an unknown stripeSessionId", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(internal.payments.markPaymentPaid, {
        stripeSessionId: "cs_does_not_exist",
      }),
    ).rejects.toThrow();
  });
});

describe("duplicate payment rows", () => {
  // Regression coverage: a customer can abandon an earlier Checkout session
  // (row stays "pending", no downloadToken) and then complete a later one
  // for the same upload. getPaymentStatus must surface the paid row, not
  // whichever row happens to be returned first.
  test("getPaymentStatus finds the paid row even when an earlier pending row exists", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-retry",
    });

    // First (abandoned) checkout attempt.
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: "sess-retry",
      stripeSessionId: "cs_abandoned",
      amountCents: 1500,
      currency: "usd",
    });

    // Second checkout attempt, which the customer actually completes.
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: "sess-retry",
      stripeSessionId: "cs_completed",
      amountCents: 1500,
      currency: "usd",
    });
    const downloadToken = await t.mutation(internal.payments.markPaymentPaid, {
      stripeSessionId: "cs_completed",
    });

    const status = await t.query(api.payments.getPaymentStatus, {
      uploadId,
      sessionId: "sess-retry",
    });
    expect(status).toEqual({ paid: true, downloadToken });
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

    const before = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: "sess-pdf",
    });
    expect(before).toBeNull();

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, pdfStorageId });

    const after = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: "sess-pdf",
    });
    expect(typeof after).toBe("string");
  });

  test("getProfilePdfUrl is null when there is no structuredProfile at all", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-no-profile",
    });
    const url = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: "sess-no-profile",
    });
    expect(url).toBeNull();
  });
});

describe("worker job queue (uploads.claimNextQueued / markReady / markAttemptFailed)", () => {
  const WORKER_SECRET = "test-worker-secret";
  process.env.WORKER_SECRET = WORKER_SECRET;

  test("worker mutations reject a missing or wrong secret", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s1" });

    await expect(
      t.mutation(api.uploads.claimNextQueued, { workerSecret: "wrong" }),
    ).rejects.toThrow(/worker secret/i);
    await expect(
      t.mutation(api.uploads.markReady, { uploadId, workerSecret: "wrong" }),
    ).rejects.toThrow(/worker secret/i);
    await expect(
      t.mutation(api.uploads.markAttemptFailed, {
        uploadId,
        workerSecret: "wrong",
        reason: "boom",
      }),
    ).rejects.toThrow(/worker secret/i);
    await expect(
      t.query(api.resumeFiles.getResumeFilesForWorker, {
        uploadId,
        workerSecret: "wrong",
      }),
    ).rejects.toThrow(/worker secret/i);
  });

  test("getResumeFilesForWorker returns signed URLs regardless of session", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "owner" });
    const storageId = await storeFakeFile(t);
    await t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      filename: "resume.pdf",
      storageId,
      ext: "pdf",
      sizeKb: 12,
      category: "resume",
    });

    const files = await t.query(api.resumeFiles.getResumeFilesForWorker, {
      uploadId,
      workerSecret: WORKER_SECRET,
    });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("resume.pdf");
    expect(typeof files[0].url).toBe("string");
  });

  test("claimNextQueued claims a queued upload, bumps attempts, sets processing", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s2" });

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBe(uploadId);

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: "s2" });
    expect(upload?.status).toBe("processing");
    expect(upload?.attempts).toBe(1);
  });

  test("a freshly-claimed job is NOT immediately reclaimable as stale", async () => {
    // Regression test: staleness must be measured from processingStartedAt,
    // not createdAt. A job claimed right after creation has an "old-ish"
    // createdAt relative to a naive check but a brand-new
    // processingStartedAt -- claiming it a second time immediately after
    // must return null, not the same uploadId again.
    const t = convexTest(schema);
    await t.mutation(api.uploads.createUpload, { sessionId: "s2b" });

    const firstClaim = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(firstClaim).not.toBeNull();

    const secondClaim = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(secondClaim).toBeNull();
  });

  test("claimNextQueued returns null when nothing is queued", async () => {
    const t = convexTest(schema);
    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBeNull();
  });

  test("markReady flips status to ready and clears any prior error", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s3" });
    await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
    await t.mutation(api.uploads.markAttemptFailed, {
      uploadId,
      workerSecret: WORKER_SECRET,
      reason: "transient failure",
    });

    await t.mutation(api.uploads.markReady, { uploadId, workerSecret: WORKER_SECRET });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: "s3" });
    expect(upload?.status).toBe("ready");
    expect(upload?.errorMessage).toBeUndefined();
  });

  test("markAttemptFailed requeues under the attempts ceiling, errors once it's hit", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s4" });

    // MAX_ATTEMPTS is 3: claim+fail three times should requeue twice, then
    // the third claim pushes attempts to 3, and that failure is terminal.
    for (let i = 0; i < 2; i++) {
      await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
      await t.mutation(api.uploads.markAttemptFailed, {
        uploadId,
        workerSecret: WORKER_SECRET,
        reason: `attempt ${i + 1} failed`,
      });
      const mid = await t.query(api.uploads.getUpload, { uploadId, sessionId: "s4" });
      expect(mid?.status).toBe("queued");
    }

    await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
    await t.mutation(api.uploads.markAttemptFailed, {
      uploadId,
      workerSecret: WORKER_SECRET,
      reason: "final failure",
    });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: "s4" });
    expect(upload?.status).toBe("error");
    expect(upload?.errorMessage).toBe("final failure");
  });

  test("claimNextQueued refuses to claim an upload already at the attempts ceiling", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s5" });
    await t.run(async (ctx) => {
      await ctx.db.patch(uploadId, { status: "queued", attempts: 3 });
    });

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBeNull();

    const upload = await t.run(async (ctx) => ctx.db.get(uploadId));
    expect(upload?.status).toBe("error");
  });

  test("claimNextQueued reclaims a processing job stuck past the stale window", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: "s6" });
    await t.run(async (ctx) => {
      // Simulate an abandoned job: "processing" but processingStartedAt is
      // far in the past (older than STALE_PROCESSING_MS), as if a worker
      // claimed it and then crashed before finishing. createdAt is
      // deliberately left recent to prove staleness is measured from
      // processingStartedAt, not createdAt (see uploads.ts's comment on why
      // conflating the two would be a real bug -- a job claimed shortly
      // after creation would look immediately stale).
      await ctx.db.patch(uploadId, {
        status: "processing",
        attempts: 1,
        processingStartedAt: Date.now() - 60 * 60 * 1000,
      });
    });

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBe(uploadId);

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: "s6" });
    expect(upload?.status).toBe("processing");
    expect(upload?.attempts).toBe(2);
  });
});
