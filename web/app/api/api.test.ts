import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mock variables (must be declared before vi.mock factories reference them) ───
const queryMock = vi.fn();
const mutationMock = vi.fn();
const createSessionMock = vi.fn();
const retrievePriceMock = vi.fn();

// ─── All vi.mock calls at top level (Vitest hoists them anyway) ─────────────
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: createSessionMock } },
      prices: { retrieve: retrievePriceMock },
    });
  }),
}));

vi.mock("../../lib/convexServer", () => ({
  getConvexClient: () => ({ query: queryMock, mutation: mutationMock }),
}));

vi.mock("../../lib/sanitizer", () => ({
  validateMagicBytes: vi.fn().mockReturnValue({ valid: true }),
  sanitizePdfBuffer: vi.fn().mockImplementation((buf: Buffer) => ({
    buffer: buf,
    sanitized: false,
    warnings: [],
  })),
  sanitizeTextForLLM: vi.fn().mockImplementation((t: string) => t),
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_TOTAL_PAYLOAD_BYTES: 25 * 1024 * 1024,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    uploads: {
      createUpload: "uploads:createUpload",
      finalizeUpload: "uploads:finalizeUpload",
      getUpload: "uploads:getUpload",
    },
    resumeFiles: {
      addResumeFile: "resumeFiles:addResumeFile",
    },
    files: {
      generateUploadUrl: "files:generateUploadUrl",
    },
    payments: {
      createPaymentRecord: "payments:createPaymentRecord",
      getByDownloadToken: "payments:getByDownloadToken",
      incrementDownloadCount: "payments:incrementDownloadCount",
    },
    profiles: {
      getStructuredProfile: "profiles:getStructuredProfile",
    },
  },
}));

// ─── Top-level dynamic imports (after mocks are registered) ─────────────────
const { POST: uploadPost } = await import("./upload/route");
const { POST: checkoutPost } = await import("./checkout/route");
const { GET: downloadGet } = await import("./download/[token]/route");
const { POST: jobMatchPost } = await import("./job-match/route");

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/upload
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://fake.convex.cloud";
  });

  function makeUploadRequest(formData: FormData, cookies?: Record<string, string>) {
    const headers: Record<string, string> = {};
    if (cookies) {
      headers.cookie = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    return new NextRequest("http://localhost/api/upload", {
      method: "POST",
      headers,
      body: formData,
    });
  }

  test("returns 400 when no files are uploaded (empty form data)", async () => {
    const formData = new FormData();
    // Intentionally no "files" entry
    const res = await uploadPost(makeUploadRequest(formData));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no files/i);
  });

  test("rejects non-allowed file extensions (.exe)", async () => {
    const formData = new FormData();
    const fakeFile = new File(["content"], "resume.exe", {
      type: "application/octet-stream",
    });
    formData.append("files", fakeFile);

    const res = await uploadPost(makeUploadRequest(formData));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported file type/i);
    expect(json.error).toContain("resume.exe");
  });

  test("rejects non-allowed file extensions (.docx)", async () => {
    const formData = new FormData();
    const fakeFile = new File(["content"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("files", fakeFile);

    const res = await uploadPost(makeUploadRequest(formData));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported file type/i);
  });

  test("returns uploadId for a valid .pdf upload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ storageId: "storage_123" }), { status: 200 }),
    );

    mutationMock
      .mockResolvedValueOnce("upload_id_abc") // createUpload
      .mockResolvedValueOnce(undefined) // addResumeFile
      .mockResolvedValueOnce(undefined); // finalizeUpload

    const formData = new FormData();
    const pdfBytes = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]); // %PDF-1.4
    const fakeFile = new File([pdfBytes], "resume.pdf", {
      type: "application/pdf",
    });
    formData.append("files", fakeFile);

    const res = await uploadPost(makeUploadRequest(formData));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.uploadId).toBe("upload_id_abc");

    fetchSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/checkout
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_PRICE_ID = "price_test";
    process.env.APP_URL = "https://trusted.example.com";
    retrievePriceMock.mockResolvedValue({ unit_amount: 1500, currency: "usd" });
    createSessionMock.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/cs_test_123",
    });
  });

  function makeCheckoutRequest(
    body: unknown,
    { withSession = true }: { withSession?: boolean } = {},
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (withSession) {
      headers.cookie = "cv_session=session1";
    }
    return new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  test("returns 400 when uploadId is missing from body", async () => {
    const res = await checkoutPost(makeCheckoutRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/uploadId is required/i);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  test("returns 400 when body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "cv_session=session1",
      },
      body: "not-json",
    });
    const res = await checkoutPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  test("returns 401 without session cookie", async () => {
    const res = await checkoutPost(
      makeCheckoutRequest({ uploadId: "upload1" }, { withSession: false }),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/missing session/i);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/download/[token]
// ═══════════════════════════════════════════════════════════════════════════════
describe("GET /api/download/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function ctx(token: string) {
    return { params: Promise.resolve({ token }) };
  }

  test("returns 404 for an invalid/unknown token", async () => {
    queryMock.mockResolvedValueOnce(null);
    const res = await downloadGet(
      new NextRequest("http://localhost/api/download/bogus"),
      ctx("bogus"),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("returns 404 when token exists but has no upload", async () => {
    queryMock.mockResolvedValueOnce({
      payment: { status: "paid" },
      upload: null,
      pdfUrl: "https://storage.example/resume.pdf",
    });
    const res = await downloadGet(
      new NextRequest("http://localhost/api/download/token1"),
      ctx("token1"),
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 when token is valid but PDF not yet available", async () => {
    queryMock.mockResolvedValueOnce({
      payment: { status: "paid" },
      upload: { _id: "up1" },
      pdfUrl: null,
    });
    const res = await downloadGet(
      new NextRequest("http://localhost/api/download/token2"),
      ctx("token2"),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/pdf not available/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/job-match
// ═══════════════════════════════════════════════════════════════════════════════
describe("POST /api/job-match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeJobMatchRequest(
    body: unknown,
    { withSession = true }: { withSession?: boolean } = {},
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (withSession) {
      headers.cookie = "cv_session=session1";
    }
    return new NextRequest("http://localhost/api/job-match", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  test("returns 400 when uploadId and jobDescription are both missing", async () => {
    const res = await jobMatchPost(makeJobMatchRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/uploadId and jobDescription are required/i);
  });

  test("returns 400 when uploadId is present but jobDescription is missing", async () => {
    const res = await jobMatchPost(
      makeJobMatchRequest({ uploadId: "upload1" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/uploadId and jobDescription are required/i);
  });

  test("returns 400 when jobDescription is present but uploadId is missing", async () => {
    const res = await jobMatchPost(
      makeJobMatchRequest({ jobDescription: "Looking for a senior dev" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/uploadId and jobDescription are required/i);
  });

  test("returns 401 without session cookie even with valid body", async () => {
    const res = await jobMatchPost(
      makeJobMatchRequest(
        { uploadId: "upload1", jobDescription: "Senior engineer role" },
        { withSession: false },
      ),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/missing session/i);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
