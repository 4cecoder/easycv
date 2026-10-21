import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { authenticatedConvexFromRequest, AuthenticationRequiredError } from "../../../lib/seridian-convex";
import { RESUME_UNLOCK, stripePriceMatchesCatalog } from "../../../lib/catalog";
import { withUserMonSpan } from "../../../lib/usermon-server";

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

export const POST = withUserMonSpan("/api/checkout", async (request: NextRequest) => {
  try {
    let body;
    try {
      body = (await request.json()) as { uploadId?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const uploadId = body.uploadId;
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    // uploadId is visible in the /preview/[uploadId] URL (see
    // convex/authz.ts), so ownership must be proven by the Seridian session,
    // not just by knowing the id -- otherwise anyone could pay for and
    // attach a downloadToken to a stranger's upload. No authenticated identity means no
    // checkout, full stop.
    let auth;
    try { auth = await authenticatedConvexFromRequest(request); }
    catch (error) {
      if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      throw error;
    }
    const { convex, ownerSessionKey: sessionId } = auth;
    try {
      const ownedUpload = await convex.query(api.uploads.getUpload, {
        uploadId: uploadId as Id<"uploads">,
        sessionId,
      });
      if (!ownedUpload) return NextResponse.json({ error: "Unauthorized or invalid upload" }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Unauthorized or invalid upload" }, { status: 403 });
    }

    // This route only sells the one-time per-résumé unlock (lib/catalog.ts
    // RESUME_UNLOCK). The Pro subscription is a separate product sold via
    // convex/billing.ts createSubscriptionCheckout, which links the Stripe
    // customer to the account so it can be managed and cancelled; any
    // client-supplied mode/plan is ignored so a one-time checkout can never
    // turn into an unlinked subscription.
    const priceId = process.env[RESUME_UNLOCK.stripePriceEnv];
    if (!priceId) {
      return NextResponse.json(
        { error: "Server is not configured with STRIPE_PRICE_ID" },
        { status: 500 },
      );
    }

    const stripe = getStripe();
    const origin = getAppOrigin();

    // Charge exactly what the UI shows: refuse if the Stripe price drifted
    // from the catalog amount (or is recurring) instead of silently charging
    // a different amount.
    const price = await stripe.prices.retrieve(priceId);
    if (!stripePriceMatchesCatalog(RESUME_UNLOCK, price)) {
      console.error("checkout refused: Stripe price does not match catalog", {
        expectedCents: RESUME_UNLOCK.priceCents,
        actualCents: price.unit_amount,
        currency: price.currency,
        recurring: Boolean(price.recurring),
      });
      return NextResponse.json(
        { error: "Payment is temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/preview/${uploadId}?paid=1`,
      cancel_url: `${origin}/preview/${uploadId}`,
      metadata: { uploadId, mode: "payment" },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

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
});
