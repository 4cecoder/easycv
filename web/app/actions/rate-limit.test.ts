// @vitest-environment node
//
// EASYC-6: server actions bypass the /api middleware entirely, so they must
// consume the durable Convex token themselves, BEFORE any expensive work.
import { beforeEach, describe, expect, test, vi } from "vitest";

const queryMock = vi.fn();
const mutationMock = vi.fn();
const authenticatedConvexFromCookieMock = vi.fn();
const cookieGet = vi.fn();
const fetchMock = vi.fn();
class AuthenticationRequiredError extends Error {}

vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("../../lib/seridian-convex", () => ({
  AuthenticationRequiredError,
  authenticatedConvexFromCookie: authenticatedConvexFromCookieMock,
}));
vi.mock("../../convex/_generated/api", () => ({
  api: {
    profiles: { getStructuredProfile: "profiles:getStructuredProfile" },
    uploads: { createUpload: "uploads:createUpload", finalizeUpload: "uploads:finalizeUpload" },
    resumeFiles: { addResumeFile: "resumeFiles:addResumeFile" },
    files: { generateUploadUrl: "files:generateUploadUrl" },
    rateLimits: { consumeJobMatch: "rateLimits:consumeJobMatch", consumeUpload: "rateLimits:consumeUpload" },
  },
}));

const { matchJob } = await import("./job-match");
const { uploadFiles } = await import("./upload");

const llmOk = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
  matchScore: 70, matchedKeywords: [], missingKeywords: [], gapAnalysis: "ok", tailoredBullets: [],
}) } }] }), { status: 200 });

function pdfForm() {
  const form = new FormData();
  form.append("files", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], "resume.pdf", { type: "application/pdf" }));
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.LLM_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-dummy";
  cookieGet.mockReturnValue({ value: "encrypted-session" });
  authenticatedConvexFromCookieMock.mockImplementation(async (value: string | undefined) => {
    if (!value) throw new AuthenticationRequiredError();
    return { convex: { query: queryMock, mutation: mutationMock }, ownerSessionKey: "seridian-owner-key" };
  });
  queryMock.mockResolvedValue({ name: "Ada", skills: {}, experience: [] });
  fetchMock.mockImplementation(async () => llmOk());
});

describe("matchJob server action", () => {
  test("allowed: calls the LLM once after consuming a token", async () => {
    mutationMock.mockResolvedValue({ ok: true, retryAfterMs: 0 });
    const res = await matchJob({ uploadId: "upload1", jobDescription: "Senior engineer" });
    expect(res.success).toBe(true);
    expect(mutationMock).toHaveBeenCalledWith("rateLimits:consumeJobMatch", {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("@regression EASYC-6 refused matchJob returns typed rate_limited and never calls the LLM", async () => {
    mutationMock.mockResolvedValue({ ok: false, retryAfterMs: 1_500, reason: "user_daily" });
    const res = await matchJob({ uploadId: "upload1", jobDescription: "Senior engineer" });
    expect(res).toEqual({ success: false, error: "rate_limited", retryAfter: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("limiter unreachable fails closed and never calls the LLM", async () => {
    mutationMock.mockRejectedValue(new Error("network down"));
    const res = await matchJob({ uploadId: "upload1", jobDescription: "Senior engineer" });
    expect(res.success).toBe(false);
    expect(res.error).not.toBe("rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("@regression EASYC-6 anonymous matchJob is rejected before any limiter or LLM call", async () => {
    cookieGet.mockReturnValue(undefined);
    const res = await matchJob({ uploadId: "upload1", jobDescription: "Senior engineer" });
    expect(res).toEqual({ success: false, error: "Authentication required" });
    expect(mutationMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("uploadFiles server action", () => {
  test("@regression EASYC-6 refused upload returns typed rate_limited and creates nothing", async () => {
    mutationMock.mockResolvedValue({ ok: false, retryAfterMs: 60_000, reason: "user_daily" });
    const res = await uploadFiles(pdfForm());
    expect(res).toEqual({ success: false, error: "rate_limited", retryAfter: 60 });
    expect(mutationMock).toHaveBeenCalledTimes(1);
    expect(mutationMock).toHaveBeenCalledWith("rateLimits:consumeUpload", {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("allowed: consumes a token first, then creates and finalizes the upload", async () => {
    mutationMock.mockImplementation(async (ref: string) => {
      if (ref === "rateLimits:consumeUpload") return { ok: true, retryAfterMs: 0 };
      if (ref === "uploads:createUpload") return "upload_abc";
      if (ref === "files:generateUploadUrl") return "https://upload.example.test";
      return null;
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ storageId: "storage_1" }), { status: 200 }));
    const res = await uploadFiles(pdfForm());
    expect(res).toEqual({ success: true, uploadId: "upload_abc" });
    expect(mutationMock.mock.calls[0][0]).toBe("rateLimits:consumeUpload");
  });

  test("createUpload's rolling backstop surfaces as rate_limited", async () => {
    const { ConvexError } = await import("convex/values");
    mutationMock.mockImplementation(async (ref: string) => {
      if (ref === "rateLimits:consumeUpload") return { ok: true, retryAfterMs: 0 };
      if (ref === "uploads:createUpload") throw new ConvexError({ code: "rate_limited", reason: "user_daily", retryAfterMs: 10_000 });
      return null;
    });
    const res = await uploadFiles(pdfForm());
    expect(res).toEqual({ success: false, error: "rate_limited", retryAfter: 10 });
  });

  test("anonymous upload is rejected before the limiter", async () => {
    cookieGet.mockReturnValue(undefined);
    const res = await uploadFiles(pdfForm());
    expect(res).toEqual({ success: false, error: "Authentication required" });
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
