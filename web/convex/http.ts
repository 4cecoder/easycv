import { httpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/stripe";
import type Stripe from "stripe";

import { components, internal } from "./_generated/api";

const http = httpRouter();

// Single Stripe webhook endpoint for the whole app, handled by the
// @convex-dev/stripe component (it verifies the signature, and syncs its
// own customers/subscriptions/invoices tables for the new Pro subscription
// flow). The `events` handler below runs IN ADDITION to that default
// processing -- it's how the pre-existing one-time-$14-unlock flow
// (web/convex/payments.ts, unrelated to the component's own tables) keeps
// working: only `mode === "payment"` checkout sessions reach
// internal.payments.markPaymentPaid; `mode === "subscription"` completions
// are fully handled by the component itself.
registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "checkout.session.completed": async (ctx, event) => {
      const session = (event as Stripe.CheckoutSessionCompletedEvent).data.object;
      if (session.mode === "payment") {
        await ctx.runMutation(internal.payments.markPaymentPaid, {
          stripeSessionId: session.id,
        });
      }
    },
  },
});

export default http;
