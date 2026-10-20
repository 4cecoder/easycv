/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedLegacyAccount(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ctx.db.insert("userAccounts", {
    email: "member@example.com",
    sessionId: "legacy-session-secret",
    verified: true,
    createdAt: 1,
    lastLoginAt: 1,
  }));
}

function identity(subject: string, emailVerified = true) {
  return {
    subject,
    tokenIdentifier: `https://auth.seridian.dev|${subject}`,
    email: "member@example.com",
    email_verified: emailVerified,
  };
}

describe("legacy account Seridian subject binding", () => {
  test("verified email alone never grants legacy ownership", async () => {
    const t = convexTest(schema, modules);
    await seedLegacyAccount(t);

    const recycledEmail = t.withIdentity(identity("new-account"));
    expect(await recycledEmail.query(api.identity.getOwnerSessionKey, {}))
      .toBe("https://auth.seridian.dev|new-account");
    await expect(recycledEmail.mutation(api.identity.bindLegacyAccount, {
      legacySessionId: "not-the-legacy-session",
    })).rejects.toThrow("Legacy session proof does not match");
    expect(await recycledEmail.query(api.identity.getOwnerSessionKey, {}))
      .toBe("https://auth.seridian.dev|new-account");
  });

  test("binds once with legacy session proof and rejects a later subject", async () => {
    const t = convexTest(schema, modules);
    const accountId = await seedLegacyAccount(t);
    const original = t.withIdentity(identity("original-subject"));

    await expect(original.mutation(api.identity.bindLegacyAccount, {
      legacySessionId: "legacy-session-secret",
    })).resolves.toBe("legacy-session-secret");
    expect(await original.query(api.identity.getOwnerSessionKey, {})).toBe("legacy-session-secret");

    const recycled = t.withIdentity(identity("recycled-email-subject"));
    await expect(recycled.mutation(api.identity.bindLegacyAccount, {
      legacySessionId: "legacy-session-secret",
    })).rejects.toThrow("already bound to another Seridian identity");
    expect(await recycled.query(api.identity.getOwnerSessionKey, {}))
      .toBe("https://auth.seridian.dev|recycled-email-subject");

    const stored = await t.run((ctx) => ctx.db.get(accountId));
    expect(stored?.seridianSubject).toBe("original-subject");
  });

  test("requires provider-asserted verified email", async () => {
    const t = convexTest(schema, modules);
    await seedLegacyAccount(t);
    const unverified = t.withIdentity(identity("unverified-subject", false));

    await expect(unverified.mutation(api.identity.bindLegacyAccount, {
      legacySessionId: "legacy-session-secret",
    })).rejects.toThrow("verified Seridian identity is required");
  });

  test("rejects the retired shared session fallback", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => ctx.db.insert("userAccounts", {
      email: "member@example.com",
      sessionId: "default_session",
      verified: true,
      createdAt: 1,
      lastLoginAt: 1,
    }));
    const caller = t.withIdentity(identity("recycled-email-subject"));

    await expect(caller.mutation(api.identity.bindLegacyAccount, {
      legacySessionId: "default_session",
    })).rejects.toThrow("Legacy session proof is invalid");
  });

  test("concurrent first binds cannot reassign one legacy account", async () => {
    const t = convexTest(schema, modules);
    await seedLegacyAccount(t);
    const first = t.withIdentity(identity("first-subject"));
    const second = t.withIdentity(identity("second-subject"));
    const outcomes = await Promise.allSettled([
      first.mutation(api.identity.bindLegacyAccount, { legacySessionId: "legacy-session-secret" }),
      second.mutation(api.identity.bindLegacyAccount, { legacySessionId: "legacy-session-secret" }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const bound = await t.run(async (ctx) => (await ctx.db.query("userAccounts")
      .withIndex("by_session", (q) => q.eq("sessionId", "legacy-session-secret"))
      .unique())?.seridianSubject);
    expect(["first-subject", "second-subject"]).toContain(bound);
  });
});
