import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

// Since the OIDC cutover the owner-gated profile mutations need the end
// user's identity, which backend/worker.py never has. These tests pin the
// worker-only variants: shared secret required, and only for an upload the
// worker has claimed (status "processing").

const WORKER_SECRET = "test-worker-secret";
process.env.WORKER_SECRET = WORKER_SECRET;

const profile = {
  name: "Ada Lovelace",
  qualityScore: 10,
  qualityMaxScore: 15,
  qualityWarnings: [],
  qualityCritical: false,
};

async function claimedUpload() {
  const base = convexTest(schema);
  const subject = "worker-test-user";
  const t = base.withIdentity({
    subject,
    tokenIdentifier: `https://auth.seridian.dev|${subject}`,
    email: `${subject}@example.com`,
    emailVerified: true,
    email_verified: true,
  } as never);
  const owner = `https://auth.seridian.dev|${subject}`;
  const uploadId = await t.mutation(api.uploads.createUpload, { sessionId: owner });
  await t.mutation(api.uploads.finalizeUpload, { uploadId, sessionId: owner });
  const claimed = await base.mutation(api.uploads.claimNextQueued, { workerSecret: WORKER_SECRET });
  expect(claimed).toBe(uploadId);
  return { base, t, owner, uploadId };
}

describe("worker profile writes after the OIDC cutover", () => {
  test("@regression EASYC-5 the worker's old owner-gated call fails without an end-user identity", async () => {
    const { base, owner, uploadId } = await claimedUpload();
    await expect(
      base.mutation(api.profiles.saveStructuredProfile, { sessionId: owner, uploadId, ...profile }),
    ).rejects.toThrow();
  });

  test("@regression EASYC-5 a claimed upload's profile and PDF can be saved with the worker secret", async () => {
    const { base, t, owner, uploadId } = await claimedUpload();
    await base.mutation(api.profiles.workerSaveStructuredProfile, { workerSecret: WORKER_SECRET, uploadId, ...profile });
    const pdfStorageId = await base.run(async (ctx) => ctx.storage.store(new Blob(["%PDF-1.4"])));
    await base.mutation(api.profiles.workerSetProfilePdf, { workerSecret: WORKER_SECRET, uploadId, pdfStorageId });

    const saved = await t.query(api.profiles.getStructuredProfile, { uploadId, sessionId: owner });
    expect(saved?.name, "the owner must see what the worker saved").toBe("Ada Lovelace");
    expect(saved?.pdfStorageId).toBe(pdfStorageId);
  });

  test("a wrong worker secret is refused", async () => {
    const { base, uploadId } = await claimedUpload();
    await expect(
      base.mutation(api.profiles.workerSaveStructuredProfile, { workerSecret: "nope", uploadId, ...profile }),
    ).rejects.toThrow(/worker secret/);
    await expect(base.mutation(api.files.workerGenerateUploadUrl, { workerSecret: "nope" })).rejects.toThrow(/worker secret/);
  });

  test("uploads the worker is not processing cannot be rewritten, even with the secret", async () => {
    const { base, uploadId } = await claimedUpload();
    await base.mutation(api.uploads.markReady, { uploadId, workerSecret: WORKER_SECRET });
    await expect(
      base.mutation(api.profiles.workerSaveStructuredProfile, { workerSecret: WORKER_SECRET, uploadId, ...profile }),
    ).rejects.toThrow(/not being processed/);
  });

  test("the worker can mint a PDF upload URL with the secret", async () => {
    const { base } = await claimedUpload();
    const url = await base.mutation(api.files.workerGenerateUploadUrl, { workerSecret: WORKER_SECRET });
    expect(typeof url).toBe("string");
  });
});
