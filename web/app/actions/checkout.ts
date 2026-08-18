"use server";

/**
 * Server Action – Checkout
 *
 * Converts the previous POST /api/checkout route into a Next.js Server Action.
 * All inputs are validated with Zod before any side effects occur.
 *
 * Security guarantees:
 *   • uploadId format is validated with a strict regex.
 *   • Session ownership is verified via Convex before creating a payment.
 *   • Session cookie is read server-side from next/headers – never trusted
 *     from client-supplied input (prevents session spoofing).
 *   • success_url / cancel_url are derived from a trusted server-side env var,
 *     never from the client-supplied Origin header (prevents open-redirect).
 *   • Error messages never leak Stripe keys, env names, or stack traces.
 */

import { cookies } from "next/headers";
import Stripe from "stripe";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "../../lib/convexServer";
import { SESSION_COOKIE } from "../../lib/session";
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
 * Create a Stripe checkout session for a given upload.
 *
 * The caller must have an active session cookie that owns the upload.
 *
 * Input:
 *   • uploadId  – Convex upload document ID (validated format)
 *   • plan      – "single" | "pro" | "subscription" (optional)
 *   • isSubscription – boolean shortcut (optional)
 *
 * Returns `{ url }` on success or `{ error }` on failure.
 */
export async function createCheckout(input: {
  uploadId: string;
  plan?: string;
  isSubscription?: boolean;
}): Promise<CheckoutActionResult> {
  try {
    // ── 1. Validate input with Zod ───────────────────────────────────────────
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: msg };
    }

    const { uploadId, plan, isSubscription: subFlag } = parsed.data;

    // ── 2. Session ownership verification ─────────────────────────────────────
    // Read the session cookie server-side – this is the authoritative identity.
    // The client never supplies the sessionId; it comes from the HTTP cookie
    // jar which is not modifiable by JavaScript in the browser.
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return { success: false, error: "Authentication required" };
    }

    const convex = getConvexClient();

    try {
      await convex.query(api.uploads.getUpload, {
        uploadId: uploadId as Id<"uploads">,
        sessionId,
      });
    } catch {
      return { success: false, error: "Upload not found or access denied" };
    }

    // ── 3. Determine checkout mode ───────────────────────────────────────────
    const isSubscription =
      plan === "pro" ||
      plan === "subscription" ||
      subFlag === true ||
      (plan === undefined &&
        subFlag === undefined &&
        process.env.STRIPE_CHECKOUT_MODE === "subscription");

    const checkoutMode: Stripe.Checkout.SessionCreateParams.Mode = isSubscription
      ? "subscription"
      : "payment";

    const priceId = isSubscription
      ? (process.env.STRIPE_PRO_PRICE_ID ||
          process.env.STRIPE_SUBSCRIPTION_PRICE_ID ||
          process.env.STRIPE_PRICE_ID)
      : (process.env.STRIPE_PRICE_ID || process.env.STRIPE_SINGLE_PRICE_ID);

    if (!priceId) {
      return { success: false, error: "Payment service is not configured" };
    }

    // ── 4. Create Stripe checkout session ────────────────────────────────────
    const stripe = getStripe();
    const origin = getAppOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/preview/${uploadId}?paid=1`,
      cancel_url: `${origin}/preview/${uploadId}`,
      metadata: { uploadId, mode: checkoutMode },
    });

    if (!session.url) {
      return { success: false, error: "Could not create checkout session" };
    }

    // ── 5. Record the payment in Convex ──────────────────────────────────────
    const price = await stripe.prices.retrieve(priceId);

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
