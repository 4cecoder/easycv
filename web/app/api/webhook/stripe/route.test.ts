import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const constructEventMock = vi.fn();
const mutationMock = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
    Object.assign(this as object, { webhooks: { constructEvent: constructEventMock } });
  }),
}));

vi.mock("../../../../lib/convexServer", () => ({
  getConvexClient: () => ({ mutation: mutationMock, query: vi.fn() }),
}));

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhook/stripe", {
    method: "POST",
    headers,
    body,
  });
}

describe("stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test";
  });

  test("rejects a request with no stripe-signature header at all", async () => {
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    expect(constructEventMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("rejects a request whose signature fails verification", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const res = await POST(makeRequest("{}", { "stripe-signature": "bad-sig" }));
    expect(res.status).toBe(400);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("400s if the server has no webhook secret configured, even with a header present", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}", { "stripe-signature": "whatever" }));
    expect(res.status).toBe(400);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  test("marks the payment paid on a verified checkout.session.completed event", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    });
    const res = await POST(makeRequest("{}", { "stripe-signature": "good-sig" }));
    expect(res.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith(expect.anything(), {
      stripeSessionId: "cs_test_123",
    });
  });

  test("ignores unrelated verified event types without touching Convex", async () => {
    constructEventMock.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_123" } },
    });
    const res = await POST(makeRequest("{}", { "stripe-signature": "good-sig" }));
    expect(res.status).toBe(200);
    expect(mutationMock).not.toHaveBeenCalled();
  });
});
