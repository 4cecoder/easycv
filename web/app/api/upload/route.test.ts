// @vitest-environment node
//
// EASYC-6: /api/upload consumes a durable Convex token before sanitizing,
// storing, or queueing LLM consolidation.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";

const mutationMock = vi.fn();
const authenticatedConvexFromRequestMock = vi.fn();
const sanitizePdfBufferMock = vi.fn((buf: Buffer) => ({ buffer: buf, sanitized: false, warnings: [] }));
class AuthenticationRequiredError extends Error {}

vi.mock("../../../lib/seridian-convex", () => ({
  AuthenticationRequiredError,
  authenticatedConvexFromRequest: authenticatedConvexFromRequestMock,
}));
vi.mock("../../../lib/sanitizer", () => ({
  validateMagicBytes: vi.fn().mockReturnValue({ valid: true }),
  sanitizePdfBuffer: sanitizePdfBufferMock,
  sanitizeTextForLLM: vi.fn((t: string) => t),
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_TOTAL_PAYLOAD_BYTES: 25 * 1024 * 1024,
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    uploads: { createUpload: "uploads:createUpload", finalizeUpload: "uploads:finalizeUpload" },
    resumeFiles: { addResumeFile: "resumeFiles:addResumeFile" },
    files: { generateUploadUrl: "files:generateUploadUrl" },
    rateLimits: { consumeJobMatch: "rateLimits:consumeJobMatch", consumeUpload: "rateLimits:consumeUpload" },
  },
}));

const { POST } = await import("./route");

function request() {
  const form = new FormData();
  form.append("files", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    headers: { cookie: "easycv_seridian_session=encrypted-session" },
    body: form,
  });
}

describe("POST /api/upload rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://fake.convex.cloud";
    authenticatedConvexFromRequestMock.mockResolvedValue({ convex: { query: vi.fn(), mutation: mutationMock }, ownerSessionKey: "owner" });
  });

  test("@regression EASYC-6 refused upload returns 429 + Retry-After before sanitizing or creating", async () => {
    mutationMock.mockResolvedValue({ ok: false, retryAfterMs: 7_200_000, reason: "user_daily" });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7200");
    expect(await res.json()).toMatchObject({ error: "rate_limited", retryAfter: 7200 });
    expect(mutationMock).toHaveBeenCalledTimes(1);
    expect(mutationMock).toHaveBeenCalledWith("rateLimits:consumeUpload", {});
    expect(sanitizePdfBufferMock).not.toHaveBeenCalled();
  });

  test("createUpload's rolling backstop maps to 429", async () => {
    mutationMock.mockImplementation(async (ref: string) => {
      if (ref === "rateLimits:consumeUpload") return { ok: true, retryAfterMs: 0 };
      throw new ConvexError({ code: "rate_limited", reason: "user_daily", retryAfterMs: 30_000 });
    });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  test("limiter unreachable fails closed with 503", async () => {
    mutationMock.mockRejectedValue(new Error("network down"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(sanitizePdfBufferMock).not.toHaveBeenCalled();
  });
});
