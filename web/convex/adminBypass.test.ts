import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const ISSUER = "https://auth.seridian.dev";

function identity(subject: string, email: string) {
  return {
    subject,
    tokenIdentifier: `${ISSUER}|${subject}`,
    email,
    emailVerified: true,
    email_verified: true,
  };
}

describe("admin.bypassPayment", () => {
  const previousAdmins = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@example.com";
  });
  afterEach(() => {
    process.env.ADMIN_EMAILS = previousAdmins;
  });

  test("records a $0 payment because nothing was charged", async () => {
    const t = convexTest(schema);
    const user = identity("bypass-user", "user@example.com");
    const uploadId = await t.withIdentity(user).mutation(api.uploads.createUpload, {
      sessionId: user.tokenIdentifier,
    });

    const result = await t
      .withIdentity(identity("bypass-admin", "admin@example.com"))
      .mutation(api.admin.bypassPayment, { uploadId });
    expect(result.success).toBe(true);

    const payment = await t.run(async (ctx) =>
      ctx.db.query("payments").withIndex("by_upload", (q) => q.eq("uploadId", uploadId)).first(),
    );
    expect(payment?.status).toBe("paid");
    expect(payment?.amountCents).toBe(0);
  });
});
