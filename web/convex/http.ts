import { httpRouter } from "convex/server";
import Stripe from "stripe";

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Stripe's dashboard webhook endpoint for this deployment must point at
// Convex's HTTP Actions URL (CONVEX_SITE_URL), NOT the old Next.js
// /api/webhook/stripe path -- e.g. http://127.0.0.1:3211/stripe/webhook
// locally (see .env.local's CONVEX_SITE_URL) or
// https://<deployment>.convex.site/stripe/webhook once deployed. The
// webhook now runs entirely inside Convex so that the mutation it calls
// (internal.payments.markPaymentPaid) can be internal-only and unreachable
// from any client holding just the public NEXT_PUBLIC_CONVEX_URL.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    // These are read from Convex's own deployment environment variables
    // (set via `npx convex env set KEY value`) -- process.env inside a
    // Convex action reads the Convex deployment's env, NOT the Next.js
    // app's .env.local, which Convex cannot see.
    if (!signature) {
      return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }
    if (!webhookSecret || !stripeKey) {
      return Response.json(
        { error: "Server is not configured with STRIPE_WEBHOOK_SECRET/STRIPE_SECRET_KEY" },
        { status: 400 },
      );
    }

    // Must read the raw body (not request.json()) -- constructEvent(Async)
    // verifies the signature over the exact bytes Stripe sent, so any JSON
    // re-serialization would break verification.
    const rawBody = await request.text();
    const stripe = new Stripe(stripeKey);

    let event: Stripe.Event;
    try {
      // constructEventAsync, not the sync constructEvent: Convex's default
      // (non-Node) runtime only exposes Web Crypto (async), and Stripe's
      // sync signature verification requires Node's synchronous crypto --
      // it throws CryptoProviderOnlySupportsAsyncError here otherwise.
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed", err);
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await ctx.runMutation(internal.payments.markPaymentPaid, {
        stripeSessionId: session.id,
      });
    }

    return Response.json({ received: true });
  }),
});

export default http;
