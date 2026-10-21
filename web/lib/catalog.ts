/**
 * Product catalog: the single source of truth for every price shown in the UI.
 *
 * Stripe holds the actual Price objects (env STRIPE_PRICE_ID for the one-time
 * unlock, STRIPE_PRO_PRICE_ID for the subscription). The checkout route
 * refuses to start a one-time checkout if the Stripe price does not match the
 * amount below, so what customers see is what they are charged.
 * lib/catalog.test.ts fails if any component hard-codes a price string.
 *
 * TODO(founder): confirm these amounts match the live Stripe Price objects.
 */

/** Billing interval for a catalog product. */
export type BillingInterval = "one_time" | "month";

/** A purchasable product. */
export interface CatalogProduct {
  id: "resume_unlock" | "pro_monthly";
  name: string;
  priceCents: number;
  currency: "usd";
  interval: BillingInterval;
  /** One-line summary shown next to the price. */
  summary: string;
  /** What the purchase unlocks, as shown on the pricing page. */
  unlocks: readonly string[];
  /** Server env var holding the matching Stripe Price id. */
  stripePriceEnv: "STRIPE_PRICE_ID" | "STRIPE_PRO_PRICE_ID";
}

/** One-time payment that unlocks a single résumé (upload). */
export const RESUME_UNLOCK: CatalogProduct = {
  id: "resume_unlock",
  name: "Single résumé unlock",
  priceCents: 1400,
  currency: "usd",
  interval: "one_time",
  summary: "One-time payment for one résumé. No subscription.",
  unlocks: [
    "PDF download of this résumé",
    "Plain-text and HTML exports of this résumé",
    "Unlimited Auto-Improve passes on this résumé",
  ],
  stripePriceEnv: "STRIPE_PRICE_ID",
};

/** Monthly subscription that unlocks every résumé while active. */
export const PRO_MONTHLY: CatalogProduct = {
  id: "pro_monthly",
  name: "easyCV Pro",
  priceCents: 1400,
  currency: "usd",
  interval: "month",
  summary: "Monthly subscription. Renews automatically until you cancel.",
  unlocks: [
    "Everything in a single unlock, for every résumé you open while subscribed",
    "Unlimited Auto-Improve passes",
    "Cancel any time from the pricing page (Manage subscription)",
  ],
  stripePriceEnv: "STRIPE_PRO_PRICE_ID",
};

/** What signed-in users get without paying. */
export const FREE_FEATURES: readonly string[] = [
  "Upload résumés and preview the consolidated result",
  "Quality score and improvement tips",
  "AI job matching (fair-use limits apply)",
  "2 free Auto-Improve passes",
];

/** Free Auto-Improve passes per account (mirrors convex/quotas.ts). */
export const FREE_AUTO_IMPROVE_PASSES = 2;

/** "$14" — whole-dollar amounts drop the cents. */
export function formatPrice(product: Pick<CatalogProduct, "priceCents">): string {
  const dollars = product.priceCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** "$14 one-time" or "$14/month". */
export function formatPriceWithInterval(product: CatalogProduct): string {
  return product.interval === "month" ? `${formatPrice(product)}/month` : `${formatPrice(product)} one-time`;
}

/**
 * Auto-renewal disclosure shown next to the subscribe button: price,
 * interval, that it renews until cancelled, and how to cancel.
 */
export function autoRenewalDisclosure(product: CatalogProduct = PRO_MONTHLY): string {
  return (
    `${product.name} costs ${formatPrice(product)} per month, charged today and then every month ` +
    `on the same date until you cancel. Cancel any time from the pricing page ` +
    `(“Manage or cancel subscription”); cancelling stops future charges and Pro stays active ` +
    `until the end of the period you already paid for.`
  );
}

/**
 * True when a Stripe Price object matches the catalog product (amount,
 * currency, and one-time vs recurring). Used server-side before checkout.
 */
export function stripePriceMatchesCatalog(
  product: CatalogProduct,
  price: { unit_amount: number | null; currency: string; recurring?: { interval: string } | null },
): boolean {
  if (price.unit_amount !== product.priceCents) return false;
  if (price.currency.toLowerCase() !== product.currency) return false;
  const isRecurring = Boolean(price.recurring);
  if (product.interval === "one_time") return !isRecurring;
  return isRecurring && price.recurring?.interval === product.interval;
}
