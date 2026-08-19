import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin-session";

export async function GET(request: NextRequest) {
  // Gate: only authenticated admins can connect Stripe
  const deny = await requireAdmin(request);
  if (deny) return deny;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe is not configured on this server" }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2026-07-29.dahlia",
    });

    const response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const connectedAccountId = response.stripe_user_id;

    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/admin?connected=1&account=${connectedAccountId}`);
  } catch (err) {
    console.error("Stripe Connect OAuth exchange failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connect OAuth failed" },
      { status: 500 }
    );
  }
}
