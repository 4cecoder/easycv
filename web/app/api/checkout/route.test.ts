import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const createSessionMock = vi.fn();
const retrievePriceMock = vi.fn();
const mutationMock = vi.fn();
const queryMock = vi.fn();
const authenticatedConvexFromRequestMock = vi.fn();
class AuthenticationRequiredError extends Error {}

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: createSessionMock } },
      prices: { retrieve: retrievePriceMock },
    });
  }),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: { 
    payments: { createPaymentRecord: "payments:createPaymentRecord" },
    uploads: { getUpload: "uploads:getUpload" },
    identity: { getOwnerSessionKey: "identity:getOwnerSessionKey" },
  },
}));

vi.mock("../../../lib/seridian-convex", () => ({
  AuthenticationRequiredError,
  authenticatedConvexFromRequest: authenticatedConvexFromRequestMock,
}));

const { POST } = await import("./route");
const { RESUME_UNLOCK } = await import("../../../lib/catalog");

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
  { withSession = true }: { withSession?: boolean } = {},
) {
  const allHeaders = { ...headers };
  if (withSession) {
    allHeaders.cookie = "easycv_seridian_session=encrypted-session";
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
    authenticatedConvexFromRequestMock.mockImplementation(async (request: NextRequest) => {
      if (!request.cookies.get("easycv_seridian_session")?.value) throw new AuthenticationRequiredError();
      return { convex: { query: queryMock, mutation: mutationMock }, ownerSessionKey: "seridian-owner-key" };
    });
    queryMock.mockResolvedValue({ _id: "upload1" });
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_PRICE_ID = "price_test";
    process.env.APP_URL = "https://trusted.example.com";
    retrievePriceMock.mockResolvedValue({ unit_amount: RESUME_UNLOCK.priceCents, currency: "usd", recurring: null });
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

  test("401s without the Seridian session cookie -- uploadId alone is not authorization", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }, {}, { withSession: false }));
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("uses the identity-derived owner key for authorization and payment ownership", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith(
      "payments:createPaymentRecord",
      expect.objectContaining({ uploadId: "upload1", sessionId: "seridian-owner-key" }),
    );
    expect(queryMock).toHaveBeenCalledWith("uploads:getUpload", { uploadId: "upload1", sessionId: "seridian-owner-key" });
  });

  test("403s when the authenticated Seridian identity does not own the upload", async () => {
    queryMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(403);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("does not accept the removed legacy cv_session cookie", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }, { cookie: "cv_session=legacy-session" }, { withSession: false }));
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  test("always sells the one-time unlock: client-supplied subscription mode/plan is ignored", async () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_14";
    process.env.STRIPE_CHECKOUT_MODE = "subscription";
    for (const extra of [{ mode: "subscription" }, { plan: "pro" }, { isSubscription: true }, {}]) {
      createSessionMock.mockClear();
      retrievePriceMock.mockClear();
      const res = await POST(makeRequest({ uploadId: "upload1", ...extra }));
      expect(res.status).toBe(200);
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          line_items: [{ price: "price_test", quantity: 1 }],
          metadata: { uploadId: "upload1", mode: "payment" },
        }),
      );
      expect(retrievePriceMock).toHaveBeenCalledWith("price_test");
    }
    delete process.env.STRIPE_CHECKOUT_MODE;
    delete process.env.STRIPE_PRO_PRICE_ID;
  });

  test("records the catalog amount for the payment", async () => {
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith(
      "payments:createPaymentRecord",
      expect.objectContaining({ amountCents: RESUME_UNLOCK.priceCents, currency: "usd" }),
    );
  });

  test("refuses (503) when the Stripe price amount drifts from the catalog -- never charges a different amount", async () => {
    retrievePriceMock.mockResolvedValueOnce({ unit_amount: RESUME_UNLOCK.priceCents + 100, currency: "usd", recurring: null });
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(503);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("refuses when STRIPE_PRICE_ID points at a recurring price", async () => {
    retrievePriceMock.mockResolvedValueOnce({ unit_amount: RESUME_UNLOCK.priceCents, currency: "usd", recurring: { interval: "month" } });
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(503);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  test("returns 500 when no one-time price ID is configured", async () => {
    delete process.env.STRIPE_PRICE_ID;
    const res = await POST(makeRequest({ uploadId: "upload1" }));
    expect(res.status).toBe(500);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
