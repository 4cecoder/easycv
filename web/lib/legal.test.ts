// @vitest-environment node
import { describe, expect, test } from "vitest";

import { CONSENT_COOKIE, TRACKING_COOKIES, TRACKING_LOCAL_STORAGE_KEYS } from "./consent";
import { STORAGE_ENTRIES, SUBPROCESSORS } from "./legal";
import { SESSION_COOKIE } from "./seridian-oidc";

const names = (category: "essential" | "analytics") =>
  STORAGE_ENTRIES.filter((e) => e.category === category).flatMap((e) => e.name.split(",").map((n) => n.trim()));

describe("privacy policy cookie table matches the code", () => {
  test("essential entries cover the session, OIDC, consent and theme storage", () => {
    const essential = names("essential");
    expect(essential).toContain(SESSION_COOKIE);
    expect(essential).toEqual(expect.arrayContaining(["easycv_oidc_state", "easycv_oidc_nonce", "easycv_oidc_verifier"]));
    expect(essential).toContain(CONSENT_COOKIE);
    expect(essential).toContain("easycv_theme");
  });

  test("every analytics cookie/key the app can set is listed as opt-in analytics", () => {
    const analytics = names("analytics");
    // Legacy keys (cv_id, easycv_id) are only ever deleted, never set, so they need no row.
    const setByApp = [...TRACKING_COOKIES, ...TRACKING_LOCAL_STORAGE_KEYS].filter((n) => n !== "cv_id" && n !== "easycv_id");
    for (const name of setByApp) expect(analytics).toContain(name);
  });

  test("subprocessors include the providers we actually use", () => {
    const providers = SUBPROCESSORS.map((s) => s.name).join(" | ");
    for (const p of ["OpenAI", "Stripe", "Netlify", "Seridian Auth", "database and file storage"]) {
      expect(providers).toContain(p);
    }
  });
});
