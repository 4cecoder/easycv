import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Stripe instance is instantiated dynamically inside the GET request handler
// to prevent the Next.js static build check from failing when STRIPE_SECRET_KEY
// is not set in the build-time environment.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "mock-key", {
      apiVersion: "2026-06-24.dahlia",
    });

    // Exchange Connect OAuth code for connected account credentials
    const response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const connectedAccountId = response.stripe_user_id;

    // Direct redirection back to the admin dashboard with connected signal
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
