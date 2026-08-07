import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { SESSION_COOKIE } from "../../../lib/session";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Server is not configured with STRIPE_SECRET_KEY");
  return new Stripe(key);
}

// The client-supplied `Origin` header is attacker-controlled (this route has
// no CORS/session gate and no ownership check on uploadId), so success_url /
// cancel_url must NEVER be derived from it -- a forged Origin would let an
// attacker redirect a victim's browser to an attacker-controlled domain right
// after a real Stripe payment. Always derive the base URL from a trusted
// server-side env var instead.
function getAppOrigin(): string {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("Server is not configured with APP_URL");
  return configured.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = (await request.json()) as {
        uploadId?: string;
        mode?: "payment" | "subscription" | "single" | "pro";
        plan?: "single" | "pro" | "subscription";
        isSubscription?: boolean;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const uploadId = body.uploadId;
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    // uploadId is visible in the /preview/[uploadId] URL (see
    // convex/authz.ts), so ownership must be proven by the session cookie,
    // not just by knowing the id -- otherwise anyone could pay for and
    // attach a downloadToken to a stranger's upload. No cookie means no
    // checkout, full stop.
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 401 });
    }

    const convex = getConvexClient();
    try {
      await convex.query(api.uploads.getUpload, {
        uploadId: uploadId as Id<"uploads">,
        sessionId,
      });
    } catch (err) {
      return NextResponse.json({ error: "Unauthorized or invalid upload" }, { status: 403 });
    }

    // Determine checkout mode: "subscription" ($14/mo Pro membership) vs "payment" (single unlock)
    const isSubscription =
      body.mode === "subscription" ||
      body.mode === "pro" ||
      body.plan === "pro" ||
      body.plan === "subscription" ||
      body.isSubscription === true ||
      (body.mode === undefined &&
        body.plan === undefined &&
        body.isSubscription === undefined &&
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
      return NextResponse.json(
        {
          error: isSubscription
            ? "Server is not configured with STRIPE_PRO_PRICE_ID or STRIPE_PRICE_ID"
            : "Server is not configured with STRIPE_PRICE_ID",
        },
        { status: 500 },
      );
    }

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
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    // Retrieve the price object to record an accurate amountCents/currency snapshot.
    const price = await stripe.prices.retrieve(priceId);

    await convex.mutation(api.payments.createPaymentRecord, {
      uploadId: uploadId as Id<"uploads">,
      sessionId,
      stripeSessionId: session.id,
      amountCents: price.unit_amount ?? 0,
      currency: price.currency,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
