import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
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

// Accepts the base test instance or a withIdentity() wrapper; both share one store.
async function storeFakeFile(t: { run: (fn: (ctx: any) => Promise<any>) => Promise<any> }) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["hello world"]));
  });
}

// Seridian identity as Convex receives it after JWT verification. authz.ts and
// identity.ts read the OIDC claim `email_verified`, so that claim is what the
// app actually checks; `emailVerified` is mirrored to match the test contract.
const SERIDIAN_ISSUER = "https://auth.seridian.dev";

function seridianIdentity(
  subject: string,
  { email = `${subject}@example.com`, emailVerified = true }: { email?: string; emailVerified?: boolean } = {},
) {
  return {
    subject,
    tokenIdentifier: `${SERIDIAN_ISSUER}|${subject}`,
    email,
    emailVerified,
    email_verified: emailVerified,
  };
}

/**
 * Signs `t` in as a Seridian user. `owner` is the canonical owner key passed
 * through legacy-named `sessionId` arguments: without a verified legacy
 * binding, it resolves to the identity's tokenIdentifier.
 */
function signedInAs<T extends { withIdentity(identity: Partial<UserIdentity>): unknown }>(
  t: T,
  subject: string,
  opts: { email?: string; emailVerified?: boolean } = {},
) {
  const identity = seridianIdentity(subject, opts);
  return {
    t: t.withIdentity(identity) as ReturnType<T["withIdentity"]>,
    owner: identity.tokenIdentifier,
  };
}

describe("resume bundle lifecycle", () => {
  test("create upload -> add file -> save profile -> pay -> download", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");

    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });
    expect(uploadId).toBeTruthy();

    const storageId = await storeFakeFile(t);
    const fileId = await t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      sessionId: owner,
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
      sessionId: owner,
    });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("resume.pdf");
    expect(files[0].category).toBe("resume");

    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: owner,
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
      sessionId: owner,
    });
    expect(profile?.name).toBe("Jane Doe");
    expect(profile?.qualityScore).toBe(10);

    // Upsert semantics: saving again for the same uploadId patches, not inserts.
    const profileId2 = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: owner,
      name: "Jane A. Doe",
      ...sampleQuality,
    });
    expect(profileId2).toBe(profileId);
    const patched = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: owner,
    });
    expect(patched?.name).toBe("Jane A. Doe");

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, sessionId: owner, pdfStorageId });
    const withPdf = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: owner,
    });
    expect(withPdf?.pdfStorageId).toBe(pdfStorageId);

    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: owner,
      stripeSessionId: "cs_test_123",
      amountCents: 1500,
      currency: "usd",
    });

    // Before payment: not paid, no download token yet.
    const statusBefore = await t.query(api.payments.getPaymentStatus, {
      uploadId,
      sessionId: owner,
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
      sessionId: owner,
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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: owner,
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
      sessionId: owner,
    });
    expect(firstSave?.skills?.languages).toEqual(["Python"]);

    // Re-consolidation that couldn't extract skills this time -- `skills`
    // is simply absent from the payload, exactly as profileFieldsFrom()
    // would produce after undefined-dropping JSON serialization.
    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: owner,
      name: "Jane Doe",
      qualityScore: 5,
      qualityMaxScore: 15,
      qualityWarnings: ["skills missing"],
      qualityCritical: false,
    });

    const secondSave = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: owner,
    });
    expect(secondSave?.skills).toBeUndefined();
    expect(secondSave?.qualityWarnings).toEqual(["skills missing"]);
  });

  test("getUpload joins files, profile, and payment (null-safe)", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });

    const bare = await t.query(api.uploads.getUpload, {
      uploadId,
      sessionId: owner,
    });
    expect(bare?.status).toBe("uploading");
    expect(bare?.resumeFiles).toEqual([]);
    expect(bare?.structuredProfile).toBeNull();
    expect(bare?.payment).toBeNull();
  });

  test("getUpload returns null for a nonexistent upload id", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadIdA = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });
    // Delete it to get a well-formed but nonexistent id.
    await t.run(async (ctx) => {
      await ctx.db.delete(uploadIdA);
    });
    const result = await t.query(api.uploads.getUpload, {
      uploadId: uploadIdA,
      sessionId: owner,
    });
    expect(result).toBeNull();
  });
});

// Regression coverage for the IDOR fix: every uploadId-scoped read must reject a
// caller whose verified identity does not own the upload (convex/authz.ts's
// ownedUpload), returning the same null/empty/unpaid shape as "doesn't exist"
// rather than leaking data to a caller who merely knows another user's uploadId.
describe("cross-session authorization", () => {
  test("owner's identity can read; a different identity gets nothing", async () => {
    const base = convexTest(schema);
    const victim = signedInAs(base, "victim-user");
    const attacker = signedInAs(base, "attacker-user");

    const uploadId = await victim.t.mutation(api.uploads.createUpload, {
      sessionId: victim.owner,
    });
    const storageId = await storeFakeFile(base);
    await victim.t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      sessionId: victim.owner,
      filename: "resume.pdf",
      storageId,
      ext: "pdf",
      sizeKb: 10,
      category: "resume",
    });
    await victim.t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: victim.owner,
      name: "Victim Name",
      ...sampleQuality,
    });
    await victim.t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: victim.owner,
      stripeSessionId: "cs_victim_test",
      amountCents: 1500,
      currency: "usd",
    });

    // Regression coverage for the IDOR fix on the write side: an attacker
    // holding only the victim's uploadId must not be able to attach their own
    // Stripe payment (and thus a downloadToken that unlocks the victim's PDF)
    // to that uploadId, even when presenting their own valid owner key.
    await expect(
      attacker.t.mutation(api.payments.createPaymentRecord, {
        uploadId,
        sessionId: attacker.owner,
        stripeSessionId: "cs_attacker_hijack",
        amountCents: 1500,
        currency: "usd",
      }),
    ).rejects.toThrow();

    // Owner sees real data.
    expect(
      (await victim.t.query(api.uploads.getUpload, { uploadId, sessionId: victim.owner }))?.status,
    ).toBe("uploading");
    expect(
      (await victim.t.query(api.profiles.getStructuredProfile, { uploadId, sessionId: victim.owner }))
        ?.name,
    ).toBe("Victim Name");

    // Attacker, holding only the uploadId, gets nothing back for any of the
    // uploadId-scoped reads -- not an error, not a distinguishable shape.
    expect(
      await attacker.t.query(api.uploads.getUpload, { uploadId, sessionId: attacker.owner }),
    ).toBeNull();
    expect(
      await attacker.t.query(api.profiles.getStructuredProfile, { uploadId, sessionId: attacker.owner }),
    ).toBeNull();
    expect(
      await attacker.t.query(api.resumeFiles.listResumeFiles, { uploadId, sessionId: attacker.owner }),
    ).toEqual([]);
    expect(
      await attacker.t.query(api.payments.getPaymentStatus, { uploadId, sessionId: attacker.owner }),
    ).toEqual({ paid: false, downloadToken: null });
    expect(
      await attacker.t.query(api.profiles.getProfilePdfUrl, { uploadId, sessionId: attacker.owner }),
    ).toBeNull();
  });
});

describe("download gate", () => {
  test("getByDownloadToken returns null for a pending (unpaid) payment", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: owner,
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
      sessionId: owner,
    });
    expect(status.downloadToken).toBeNull();
    expect(status.paid).toBe(false);
  });

  test("markPaymentPaid throws for an unknown stripeSessionId", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });

    // First (abandoned) checkout attempt.
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: owner,
      stripeSessionId: "cs_abandoned",
      amountCents: 1500,
      currency: "usd",
    });

    // Second checkout attempt, which the customer actually completes.
    await t.mutation(api.payments.createPaymentRecord, {
      uploadId,
      sessionId: owner,
      stripeSessionId: "cs_completed",
      amountCents: 1500,
      currency: "usd",
    });
    const downloadToken = await t.mutation(internal.payments.markPaymentPaid, {
      stripeSessionId: "cs_completed",
    });

    const status = await t.query(api.payments.getPaymentStatus, {
      uploadId,
      sessionId: owner,
    });
    expect(status).toEqual({ paid: true, downloadToken });
  });
});

describe("file storage helpers", () => {
  test("generateUploadUrl returns a URL usable to upload bytes", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const url = await t.mutation(api.files.generateUploadUrl, {});
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  test("getProfilePdfUrl is null before a PDF is set, then resolves after setProfilePdf", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });
    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      sessionId: owner,
      name: "Jane Doe",
      ...sampleQuality,
    });

    const before = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: owner,
    });
    expect(before).toBeNull();

    const pdfStorageId = await storeFakeFile(t);
    await t.mutation(api.profiles.setProfilePdf, { uploadId, sessionId: owner, pdfStorageId });

    const after = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: owner,
    });
    expect(typeof after).toBe("string");
  });

  test("getProfilePdfUrl is null when there is no structuredProfile at all", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: owner,
    });
    const url = await t.query(api.profiles.getProfilePdfUrl, {
      uploadId,
      sessionId: owner,
    });
    expect(url).toBeNull();
  });
});

describe("finalizeUpload (uploading -> queued transition)", () => {
  // Same literal value as the "worker job queue" describe block below --
  // both assign process.env.WORKER_SECRET at describe-body (collection
  // time, not test-run time) scope, so whichever runs last during
  // collection would otherwise silently win for both blocks' tests.
  const WORKER_SECRET = "test-worker-secret";
  process.env.WORKER_SECRET = WORKER_SECRET;

  test("a fresh upload is 'uploading', not yet claimable by the worker", async () => {
    // Regression test for a real race caught live: claimNextQueued must
    // NOT be able to claim an upload before finalizeUpload has run, or a
    // fast-polling worker can grab a job with zero resumeFiles attached
    // yet, burning a real attempt out of the bounded retry budget on a
    // race instead of an actual failure.
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("uploading");

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBeNull();
  });

  test("finalizeUpload flips uploading to queued, making it claimable", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });

    await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("queued");

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBe(uploadId);
  });

  test("finalizeUpload rejects a session that doesn't own the upload", async () => {
    const base = convexTest(schema);
    const owner = signedInAs(base, "owner-s9");
    const attacker = signedInAs(base, "attacker-s9");
    const uploadId = await owner.t.mutation(api.uploads.createUpload, { sessionId: owner.owner });

    await expect(
      attacker.t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: attacker.owner }),
    ).rejects.toThrow();

    const upload = await owner.t.query(api.uploads.getUpload, { uploadId, sessionId: owner.owner });
    expect(upload?.status).toBe("uploading");
  });
});

describe("worker job queue (uploads.claimNextQueued / markReady / markAttemptFailed)", () => {
  // Must match the "finalizeUpload" describe block's value above -- see its comment.
  const WORKER_SECRET = "test-worker-secret";
  process.env.WORKER_SECRET = WORKER_SECRET;

  test("worker mutations reject a missing or wrong secret", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });

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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
    const storageId = await storeFakeFile(t);
    await t.mutation(api.resumeFiles.addResumeFile, {
      uploadId,
      sessionId: owner,
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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
    await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });

    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBe(uploadId);

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("processing");
    expect(upload?.attempts).toBe(1);
  });

  test("a freshly-claimed job is NOT immediately reclaimable as stale", async () => {
    // Regression test: staleness must be measured from processingStartedAt,
    // not createdAt. A job claimed right after creation has an "old-ish"
    // createdAt relative to a naive check but a brand-new
    // processingStartedAt -- claiming it a second time immediately after
    // must return null, not the same uploadId again.
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
    await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });

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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const claimed = await t.mutation(api.uploads.claimNextQueued, {
      workerSecret: WORKER_SECRET,
    });
    expect(claimed).toBeNull();
  });

  test("markReady flips status to ready and clears any prior error", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
    await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });
    await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
    await t.mutation(api.uploads.markAttemptFailed, {
      uploadId,
      workerSecret: WORKER_SECRET,
      reason: "transient failure",
    });

    await t.mutation(api.uploads.markReady, { uploadId, workerSecret: WORKER_SECRET });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("ready");
    expect(upload?.errorMessage).toBeUndefined();
  });

  test("markAttemptFailed requeues under the attempts ceiling, errors once it's hit", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
    await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });

    // MAX_ATTEMPTS is 3: claim+fail three times should requeue twice, then
    // the third claim pushes attempts to 3, and that failure is terminal.
    for (let i = 0; i < 2; i++) {
      await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
      await t.mutation(api.uploads.markAttemptFailed, {
        uploadId,
        workerSecret: WORKER_SECRET,
        reason: `attempt ${i + 1} failed`,
      });
      const mid = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
      expect(mid?.status).toBe("queued");
    }

    await t.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
    await t.mutation(api.uploads.markAttemptFailed, {
      uploadId,
      workerSecret: WORKER_SECRET,
      reason: "final failure",
    });

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("error");
    expect(upload?.errorMessage).toBe("final failure");
  });

  test("claimNextQueued refuses to claim an upload already at the attempts ceiling", async () => {
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
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
    const { t, owner } = signedInAs(convexTest(schema), "schema-user");
    const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
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

    const upload = await t.query(api.uploads.getUpload, { uploadId, sessionId: owner });
    expect(upload?.status).toBe("processing");
    expect(upload?.attempts).toBe(2);
  });
});

// Seridian Auth contract: protected functions derive the owner from verified
// Convex auth (ctx.auth.getUserIdentity), and a legacy anonymous session is
// only reachable through an explicit, verified-email-matched binding.
describe("Seridian identity ownership contract", () => {
  const LEGACY_SESSION = "legacy-session-abc";
  const LEGACY_EMAIL = "member@example.com";

  // A pre-cutover account with one upload owned by its legacy session key.
  async function seedLegacyAccountWithUpload(base: ReturnType<typeof convexTest>) {
    return await base.run(async (ctx) => {
      await ctx.db.insert("userAccounts", {
        email: LEGACY_EMAIL,
        sessionId: LEGACY_SESSION,
        verified: true,
        createdAt: 1,
        lastLoginAt: 1,
      });
      return await ctx.db.insert("uploads", {
        sessionId: LEGACY_SESSION,
        status: "uploading",
        attempts: 0,
        createdAt: 1,
      });
    });
  }

  test("anonymous callers are rejected by protected functions", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.uploads.createUpload, { sessionId: "anonymous" }),
    ).rejects.toThrow("Unauthenticated");
    await expect(t.mutation(api.files.generateUploadUrl, {})).rejects.toThrow("Unauthenticated");
  });

  test("another identity cannot read or finalize someone else's upload", async () => {
    const base = convexTest(schema);
    const alice = signedInAs(base, "alice-user");
    const bob = signedInAs(base, "bob-user");
    const uploadId = await alice.t.mutation(api.uploads.createUpload, { sessionId: alice.owner });

    // Presenting Alice's owner key as Bob is rejected by requireOwnerSession.
    await expect(
      bob.t.query(api.uploads.getUpload, { uploadId, sessionId: alice.owner }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      bob.t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: alice.owner }),
    ).rejects.toThrow("Unauthorized");

    // Bob using his own owner key sees nothing and cannot modify the upload.
    expect(await bob.t.query(api.uploads.getUpload, { uploadId, sessionId: bob.owner })).toBeNull();
    await expect(
      bob.t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: bob.owner }),
    ).rejects.toThrow();

    const upload = await alice.t.query(api.uploads.getUpload, { uploadId, sessionId: alice.owner });
    expect(upload?.status).toBe("uploading");
  });

  test("matching verified identity and legacy owner proof grant the legacy upload", async () => {
    const base = convexTest(schema);
    const uploadId = await seedLegacyAccountWithUpload(base);
    const member = signedInAs(base, "member-subject", { email: LEGACY_EMAIL });

    // Before linking, the identity's owner key is its own tokenIdentifier, so
    // the legacy upload is not visible to it.
    expect(
      await member.t.query(api.uploads.getUpload, { uploadId, sessionId: member.owner }),
    ).toBeNull();

    await expect(
      member.t.mutation(api.identity.bindLegacyAccount, { legacySessionId: LEGACY_SESSION }),
    ).resolves.toBe(LEGACY_SESSION);
    expect(await member.t.query(api.identity.getOwnerSessionKey, {})).toBe(LEGACY_SESSION);

    const upload = await member.t.query(api.uploads.getUpload, { uploadId, sessionId: LEGACY_SESSION });
    expect(upload?._id).toBe(uploadId);
  });

  test("unverified email does not link the legacy account", async () => {
    const base = convexTest(schema);
    const uploadId = await seedLegacyAccountWithUpload(base);
    const unverified = signedInAs(base, "member-subject", {
      email: LEGACY_EMAIL,
      emailVerified: false,
    });

    await expect(
      unverified.t.mutation(api.identity.bindLegacyAccount, { legacySessionId: LEGACY_SESSION }),
    ).rejects.toThrow("A verified Seridian identity is required");

    // Still bound to its own key; presenting the legacy key is unauthorized.
    expect(await unverified.t.query(api.identity.getOwnerSessionKey, {})).toBe(unverified.owner);
    await expect(
      unverified.t.query(api.uploads.getUpload, { uploadId, sessionId: LEGACY_SESSION }),
    ).rejects.toThrow("Unauthorized");

    const account = await base.run(async (ctx) =>
      await ctx.db.query("userAccounts")
        .withIndex("by_session", (q) => q.eq("sessionId", LEGACY_SESSION))
        .unique(),
    );
    expect(account?.seridianSubject).toBeUndefined();
  });

  test("a verified identity with a different email does not link the legacy account", async () => {
    const base = convexTest(schema);
    await seedLegacyAccountWithUpload(base);
    const stranger = signedInAs(base, "stranger-subject", { email: "stranger@example.com" });

    await expect(
      stranger.t.mutation(api.identity.bindLegacyAccount, { legacySessionId: LEGACY_SESSION }),
    ).rejects.toThrow("Legacy session proof does not match a verified account");
    expect(await stranger.t.query(api.identity.getOwnerSessionKey, {})).toBe(stranger.owner);
  });

  test("a recycled email without the legacy owner proof cannot link the account", async () => {
    const base = convexTest(schema);
    await seedLegacyAccountWithUpload(base);
    const recycledEmailHolder = signedInAs(base, "recycled-email-subject", {
      email: LEGACY_EMAIL,
    });

    await expect(
      recycledEmailHolder.t.mutation(api.identity.bindLegacyAccount, {
        legacySessionId: "different-session-known-to-caller",
      }),
    ).rejects.toThrow("Legacy session proof does not match a verified account");
    expect(
      await recycledEmailHolder.t.query(api.identity.getOwnerSessionKey, {}),
    ).toBe(recycledEmailHolder.owner);
  });
});
