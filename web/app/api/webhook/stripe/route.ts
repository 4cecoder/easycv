import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "../../../../lib/convexServer";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }
  if (!webhookSecret || !stripeKey) {
    return NextResponse.json(
      { error: "Server is not configured with STRIPE_WEBHOOK_SECRET/STRIPE_SECRET_KEY" },
      { status: 400 },
    );
  }

  // Must read the raw body (not request.json()) -- constructEvent verifies
  // the signature over the exact bytes Stripe sent, so any JSON
  // re-serialization would break verification.
  const rawBody = await request.text();
  const stripe = new Stripe(stripeKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const convex = getConvexClient();
    await convex.mutation(api.payments.markPaymentPaid, { stripeSessionId: session.id });
  }

  return NextResponse.json({ received: true });
}
