"use server";

/**
 * Server Action – Checkout
 *
 * Converts the previous POST /api/checkout route into a Next.js Server Action.
 * All inputs are validated with Zod before any side effects occur.
 *
 * Security guarantees:
 *   • uploadId format is validated with a strict regex.
 *   • Seridian identity and upload ownership are verified via authenticated Convex before payment.
 *   • The encrypted Seridian session cookie is read server-side; client-supplied IDs are ignored.
 *   • success_url / cancel_url are derived from a trusted server-side env var,
 *     never from the client-supplied Origin header (prevents open-redirect).
 *   • Error messages never leak Stripe keys, env names, or stack traces.
 */

import { cookies } from "next/headers";
import Stripe from "stripe";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authenticatedConvexFromCookie, AuthenticationRequiredError } from "../../lib/seridian-convex";
import { SESSION_COOKIE } from "../../lib/seridian-oidc";
import { RESUME_UNLOCK, stripePriceMatchesCatalog } from "../../lib/catalog";
import { checkoutSchema } from "./schemas";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Payment service is not configured");
  return new Stripe(key);
}

/**
 * Derive the application origin from a trusted server-side env var.
 * NEVER use the client-supplied `Origin` header – it is attacker-controlled.
 */
function getAppOrigin(): string {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("Application URL is not configured");
  return configured.replace(/\/+$/, "");
}

// ─── Action Result Types ────────────────────────────────────────────────────────

export type CheckoutActionResult =
  | { success: true; url: string }
  | { success: false; error: string };

// ─── Action ─────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe checkout session for the one-time per-résumé unlock
 * (lib/catalog.ts RESUME_UNLOCK). The Pro subscription is sold separately via
 * convex/billing.ts createSubscriptionCheckout.
 *
 * The caller must have an active Seridian session whose owner key owns the upload.
 *
 * Input:
 *   • uploadId  – Convex upload document ID (validated format)
 *
 * Returns `{ url }` on success or `{ error }` on failure.
 */
export async function createCheckout(input: {
  uploadId: string;
}): Promise<CheckoutActionResult> {
  try {
    // ── 1. Validate input with Zod ───────────────────────────────────────────
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: msg };
    }

    const { uploadId } = parsed.data;

    // ── 2. Session ownership verification ─────────────────────────────────────
    // Derive the owner key from the verified Seridian identity; never accept it from input.
    const cookieStore = await cookies();
    let auth;
    try { auth = await authenticatedConvexFromCookie(cookieStore.get(SESSION_COOKIE)?.value); }
    catch (error) {
      return { success: false, error: error instanceof AuthenticationRequiredError ? "Authentication required" : "Checkout service is not configured" };
    }
    const { convex, ownerSessionKey: sessionId } = auth;

    try {
      const ownedUpload = await convex.query(api.uploads.getUpload, {
        uploadId: uploadId as Id<"uploads">,
        sessionId,
      });
      if (!ownedUpload) return { success: false, error: "Upload not found or access denied" };
    } catch {
      return { success: false, error: "Upload not found or access denied" };
    }

    // ── 3. One-time unlock price from the catalog ─────────────────────────────
    const priceId = process.env[RESUME_UNLOCK.stripePriceEnv];
    if (!priceId) {
      return { success: false, error: "Payment service is not configured" };
    }

    // ── 4. Create Stripe checkout session ────────────────────────────────────
    const stripe = getStripe();
    const origin = getAppOrigin();

    // Charge exactly what the UI shows (lib/catalog.ts).
    const price = await stripe.prices.retrieve(priceId);
    if (!stripePriceMatchesCatalog(RESUME_UNLOCK, price)) {
      console.error("[checkout action] Stripe price does not match catalog");
      return { success: false, error: "Payment is temporarily unavailable. Please try again later." };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/preview/${uploadId}?paid=1`,
      cancel_url: `${origin}/preview/${uploadId}`,
      metadata: { uploadId, mode: "payment" },
    });

    if (!session.url) {
      return { success: false, error: "Could not create checkout session" };
    }

    // ── 5. Record the payment in Convex ──────────────────────────────────────
    await convex.mutation(api.payments.createPaymentRecord, {
      uploadId: uploadId as Id<"uploads">,
      sessionId,
      stripeSessionId: session.id,
      amountCents: price.unit_amount ?? 0,
      currency: price.currency,
    });

    return { success: true, url: session.url };
  } catch (err) {
    console.error("[checkout action] failed", err);
    return { success: false, error: "Checkout failed. Please try again." };
  }
}
