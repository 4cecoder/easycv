import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Server is not configured with STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { uploadId?: string };
    const uploadId = body.uploadId;
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Server is not configured with STRIPE_PRICE_ID" },
        { status: 500 },
      );
    }

    const stripe = getStripe();
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      // One-time purchase per rf-2 ("one-time Stripe pricing, not
      // subscription, is the differentiator") -- never "subscription".
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/preview/${uploadId}?paid=1`,
      cancel_url: `${origin}/preview/${uploadId}`,
      metadata: { uploadId },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    // The price (and thus the $9-19 rf-2 cites) lives entirely in Stripe's
    // dashboard via STRIPE_PRICE_ID -- retrieve it here only to record an
    // accurate amountCents/currency snapshot on the payment row.
    const price = await stripe.prices.retrieve(priceId);

    const convex = getConvexClient();
    await convex.mutation(api.payments.createPaymentRecord, {
      uploadId: uploadId as Id<"uploads">,
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
