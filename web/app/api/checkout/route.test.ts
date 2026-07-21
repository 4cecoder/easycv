import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const createSessionMock = vi.fn();
const retrievePriceMock = vi.fn();
const mutationMock = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: createSessionMock } },
      prices: { retrieve: retrievePriceMock },
    });
  }),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: { payments: { createPaymentRecord: "payments:createPaymentRecord" } },
}));

vi.mock("../../../lib/convexServer", () => ({
  getConvexClient: () => ({ mutation: mutationMock, query: vi.fn() }),
}));

const { POST } = await import("./route");

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
  { withSession = true }: { withSession?: boolean } = {},
) {
  const allHeaders = { ...headers };
  if (withSession) {
    allHeaders.cookie = "cv_session=session1";
  }
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: allHeaders,
    body: JSON.stringify(body),
  });
}

describe("checkout", () => {
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

  test("builds success_url/cancel_url from APP_URL, never the client Origin header", async () => {
    const res = await POST(
      makeRequest({ uploadId: "upload1" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://trusted.example.com/preview/upload1?paid=1",
        cancel_url: "https://trusted.example.com/preview/upload1",
      }),
    );
  });

  test("500s if APP_URL is not configured, even with a valid Origin header", async () => {
    delete process.env.APP_URL;
    const res = await POST(
      makeRequest({ uploadId: "upload1" }, { origin: "https://trusted.example.com" }),
    );
    expect(res.status).toBe(500);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  test("400s when uploadId is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  test("401s when there is no session cookie -- uploadId alone is not authorization", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }, {}, { withSession: false }));
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("passes the session cookie's sessionId to createPaymentRecord, not the uploadId alone", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith(
      "payments:createPaymentRecord",
      expect.objectContaining({ uploadId: "upload1", sessionId: "session1" }),
    );
  });
});
