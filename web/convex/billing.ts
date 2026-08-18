import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { components } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";

// sessionId (the same opaque `cv_session` cookie value used everywhere else
// in this app -- schema.ts:43-45) is the only identity concept this app has,
// so it doubles as the Stripe component's `userId` key. There is no real
// auth provider here, so ctx.auth.getUserIdentity() is not usable.
const stripeClient = new StripeSubscriptions(components.stripe, {});

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export const createSubscriptionCheckout = action({
  args: { sessionId: v.string(), email: v.optional(v.string()) },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx, { sessionId, email }) => {
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      throw new Error("Server is not configured with STRIPE_PRO_PRICE_ID");
    }
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: sessionId,
      email,
    });

    const { url } = await stripeClient.createCheckoutSession(ctx, {
      priceId,
      customerId: customer.customerId,
      mode: "subscription",
      successUrl: `${appUrl}/pricing?success=1`,
      cancelUrl: `${appUrl}/pricing?canceled=1`,
      // Keyed "userId" (not "sessionId") because the component's webhook
      // sync reads metadata.userId specifically to populate the
      // subscriptions row's userId field (node_modules/@convex-dev/stripe/
      // src/component/private.ts:handleSubscriptionCreated) -- that's what
      // listSubscriptionsByUserId below then looks up by.
      subscriptionMetadata: { userId: sessionId },
    });

    return { url };
  },
});

export const isSubscribed = query({
  args: { sessionId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { sessionId }) => {
    const subscriptions = await ctx.runQuery(
      components.stripe.public.listSubscriptionsByUserId,
      { userId: sessionId },
    );
    return subscriptions.some((s) => ACTIVE_STATUSES.has(s.status));
  },
});
