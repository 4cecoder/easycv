import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendVerificationCodeEmail,
  sendProPurchaseEmail,
  getResendClient,
} from "./email";

describe("Email Service & Resend Integration", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("gracefully falls back to simulated email when RESEND_API_KEY is not set", async () => {
    const result = await sendVerificationCodeEmail("user@example.com", "123456");
    expect(result.success).toBe(true);
    expect(result.isSimulated).toBe(true);
  });

  it("handles Pro purchase confirmation email delivery in simulated mode", async () => {
    const result = await sendProPurchaseEmail(
      "buyer@example.com",
      "test_download_token_123",
      "http://localhost:3000",
      "Alex"
    );
    expect(result.success).toBe(true);
    expect(result.isSimulated).toBe(true);
  });

  it("initializes Resend client when API key is provided", () => {
    process.env.RESEND_API_KEY = "re_test_123456789";
    const client = getResendClient();
    expect(client).toBeDefined();
  });
});
