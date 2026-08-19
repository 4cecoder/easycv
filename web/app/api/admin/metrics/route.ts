import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "../../../../lib/admin-session";

export async function GET(request: NextRequest) {
  // Gate: only authenticated admins can view metrics
  const deny = await requireAdmin(request);
  if (deny) return deny;

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }
    const stripe = new Stripe(key);

    const balance = await stripe.balance.retrieve();
    const grossVolume = balance.available.reduce((sum, item) => sum + item.amount, 0) +
                        balance.pending.reduce((sum, item) => sum + item.amount, 0);

    const sessions = await stripe.checkout.sessions.list({ limit: 10 });
    const sales = sessions.data.map((session) => ({
      id: session.id,
      email: session.customer_details?.email ?? "unknown@customer.com",
      amount: session.amount_total ?? 0,
      status: session.payment_status,
      date: new Date((session.created ?? Date.now() / 1000) * 1000).toISOString(),
      uploadId: session.metadata?.uploadId ?? "",
    }));

    const payoutsList = await stripe.payouts.list({ limit: 5 });
    const payouts = payoutsList.data.map((po) => ({
      id: po.id,
      amount: po.amount,
      status: po.status,
      date: new Date(po.arrival_date * 1000).toISOString(),
    }));

    return NextResponse.json({
      grossVolume,
      netRevenue: Math.round(grossVolume * 0.971 - 30 * sales.length),
      activeCustomers: sales.filter(s => s.status === "paid").length,
      sales,
      payouts,
    });
  } catch (err) {
    console.error("Failed to fetch Stripe metrics", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Stripe metrics" },
      { status: 500 }
    );
  }
}
