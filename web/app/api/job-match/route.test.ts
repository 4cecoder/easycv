// @vitest-environment node
//
// EASYC-6: the job-match route must consume a durable Convex rate-limit token
// BEFORE the hosted LLM call, and never call the LLM when refused.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const queryMock = vi.fn();
const mutationMock = vi.fn();
const authenticatedConvexFromRequestMock = vi.fn();
class AuthenticationRequiredError extends Error {}

vi.mock("../../../lib/seridian-convex", () => ({
  AuthenticationRequiredError,
  authenticatedConvexFromRequest: authenticatedConvexFromRequestMock,
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    profiles: { getStructuredProfile: "profiles:getStructuredProfile" },
    rateLimits: { consumeJobMatch: "rateLimits:consumeJobMatch", consumeUpload: "rateLimits:consumeUpload" },
  },
}));

const { POST } = await import("./route");

const fetchMock = vi.fn();

function request(withSession = true) {
  return new NextRequest("http://localhost/api/job-match", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withSession ? { cookie: "easycv_seridian_session=encrypted-session" } : {}),
    },
    body: JSON.stringify({ uploadId: "upload1", jobDescription: "Senior TypeScript engineer" }),
  });
}

const llmOk = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
  matchScore: 80, matchedKeywords: ["ts"], missingKeywords: [], gapAnalysis: "ok", tailoredBullets: [],
}) } }] }), { status: 200 });

describe("POST /api/job-match rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-dummy";
    authenticatedConvexFromRequestMock.mockImplementation(async (req: NextRequest) => {
      if (!req.cookies.get("easycv_seridian_session")?.value) throw new AuthenticationRequiredError();
      return { convex: { query: queryMock, mutation: mutationMock }, ownerSessionKey: "seridian-owner-key" };
    });
    queryMock.mockResolvedValue({ name: "Ada", skills: {}, experience: [] });
    fetchMock.mockImplementation(async () => llmOk());
  });

  test("allowed: consumes the token before calling the LLM", async () => {
    const order: string[] = [];
    mutationMock.mockImplementation(async (ref: string) => { order.push(ref); return { ok: true, retryAfterMs: 0 }; });
    fetchMock.mockImplementation(async () => { order.push("llm"); return llmOk(); });

    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith("rateLimits:consumeJobMatch", {});
    expect(order).toEqual(["rateLimits:consumeJobMatch", "llm"]);
  });

  test("@regression EASYC-6 refused job match returns 429 + Retry-After and never calls the LLM", async () => {
    mutationMock.mockResolvedValue({ ok: false, retryAfterMs: 125_400, reason: "user_hourly" });

    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("126");
    expect(await res.json()).toMatchObject({ error: "rate_limited", reason: "user_hourly", retryAfter: 126 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("@regression EASYC-6 tripped global LLM budget returns 429 and never calls the LLM", async () => {
    mutationMock.mockResolvedValue({ ok: false, retryAfterMs: 3_600_000, reason: "global_budget" });

    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect((await res.json()).reason).toBe("global_budget");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("limiter unreachable fails closed with 503 and never calls the LLM", async () => {
    mutationMock.mockRejectedValue(new Error("network down"));

    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("@regression EASYC-6 anonymous job match is rejected before any limiter or LLM call", async () => {
    const res = await POST(request(false));
    expect(res.status).toBe(401);
    expect(mutationMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a profile the caller doesn't own 404s without burning a token", async () => {
    queryMock.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(mutationMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
