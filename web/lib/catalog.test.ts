// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  autoRenewalDisclosure,
  formatPrice,
  formatPriceWithInterval,
  PRO_MONTHLY,
  RESUME_UNLOCK,
  stripePriceMatchesCatalog,
} from "./catalog";

const WEB_ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("catalog", () => {
  test("one-time unlock and Pro subscription are distinct products", () => {
    expect(RESUME_UNLOCK.interval).toBe("one_time");
    expect(PRO_MONTHLY.interval).toBe("month");
    expect(RESUME_UNLOCK.stripePriceEnv).toBe("STRIPE_PRICE_ID");
    expect(PRO_MONTHLY.stripePriceEnv).toBe("STRIPE_PRO_PRICE_ID");
    expect(RESUME_UNLOCK.name).not.toBe(PRO_MONTHLY.name);
  });

  test("formats prices", () => {
    expect(formatPrice({ priceCents: 1400 })).toBe("$14");
    expect(formatPrice({ priceCents: 999 })).toBe("$9.99");
    expect(formatPriceWithInterval(RESUME_UNLOCK)).toBe(`${formatPrice(RESUME_UNLOCK)} one-time`);
    expect(formatPriceWithInterval(PRO_MONTHLY)).toBe(`${formatPrice(PRO_MONTHLY)}/month`);
  });

  test("auto-renewal disclosure states price, monthly renewal until cancelled, and how to cancel", () => {
    const text = autoRenewalDisclosure();
    expect(text).toContain(formatPrice(PRO_MONTHLY));
    expect(text).toMatch(/every month/);
    expect(text).toMatch(/until you cancel/);
    expect(text).toMatch(/Manage or cancel subscription/);
  });

  test("Stripe price guard matches amount, currency and one-time vs recurring", () => {
    const oneTime = { unit_amount: RESUME_UNLOCK.priceCents, currency: "usd", recurring: null };
    expect(stripePriceMatchesCatalog(RESUME_UNLOCK, oneTime)).toBe(true);
    expect(stripePriceMatchesCatalog(RESUME_UNLOCK, { ...oneTime, unit_amount: 1500 })).toBe(false);
    expect(stripePriceMatchesCatalog(RESUME_UNLOCK, { ...oneTime, currency: "eur" })).toBe(false);
    expect(stripePriceMatchesCatalog(RESUME_UNLOCK, { ...oneTime, recurring: { interval: "month" } })).toBe(false);
    expect(
      stripePriceMatchesCatalog(PRO_MONTHLY, { unit_amount: PRO_MONTHLY.priceCents, currency: "usd", recurring: { interval: "month" } }),
    ).toBe(true);
    expect(stripePriceMatchesCatalog(PRO_MONTHLY, { unit_amount: PRO_MONTHLY.priceCents, currency: "usd", recurring: null })).toBe(false);
  });

  // Every rendered price must come from lib/catalog.ts. Dollar amounts like
  // "$14" or "$15/mo" (but not résumé sample text such as "$4M" ARR or "$160k"
  // salary bands) and cent literals 1400/1500 are not allowed anywhere else.
  test("no component hard-codes a product price", () => {
    const offenders: string[] = [];
    const dollar = /\$\d+(?:\.\d{2})?(?![\d.,kKmMbB])/g;
    const cents = /\b(?:amountCents|priceCents|value)\s*:\s*1[0-9]00\b|track\w+\([^)]*\b1[45]00\b/g;
    for (const dir of SCANNED_DIRS) {
      for (const file of sourceFiles(path.join(WEB_ROOT, dir))) {
        if (file.endsWith(path.join("lib", "catalog.ts"))) continue;
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(dollar)) offenders.push(`${path.relative(WEB_ROOT, file)}: ${m[0]}`);
        for (const m of text.matchAll(cents)) offenders.push(`${path.relative(WEB_ROOT, file)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
