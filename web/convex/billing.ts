import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api, components } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";

const stripeClient = new StripeSubscriptions(components.stripe, {});

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export const createSubscriptionCheckout = action({
  args: {},
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const sessionId: string = await ctx.runQuery(api.identity.getOwnerSessionKey, {});
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      throw new Error("Server is not configured with STRIPE_PRO_PRICE_ID");
    }
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: sessionId,
      email: identity.email,
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
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const sessionId: string = await ctx.runQuery(api.identity.getOwnerSessionKey, {});
    const subscriptions = await ctx.runQuery(
      components.stripe.public.listSubscriptionsByUserId,
      { userId: sessionId },
    );
    return subscriptions.some((s) => ACTIVE_STATUSES.has(s.status));
  },
});
