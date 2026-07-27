"use client";

import { useState, useEffect } from "react";
import { 
  BarChart3, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Lock, 
  Loader2, 
  RefreshCw,
  CheckCircle2,
  FileDown
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type StripeMetrics = {
  grossVolume: number;
  netRevenue: number;
  activeCustomers: number;
  payouts: Array<{ id: string; amount: number; status: string; date: string }>;
  sales: Array<{
    id: string;
    email: string;
    amount: number;
    status: string;
    date: string;
    uploadId: string;
  }>;
};

export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [metrics, setMetrics] = useState<StripeMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");

    fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then(async (res) => {
        if (res.ok) {
          setIsAuthorized(true);
          fetchMetrics();
        } else {
          const body = await res.json().catch(() => ({}));
          setAuthError(body.error ?? "Invalid passcode");
        }
      })
      .catch(() => setAuthError("Auth verification failed"));
  }

  function fetchMetrics() {
    setLoadingMetrics(true);
    fetch("/api/admin/metrics")
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data);
        setLoadingMetrics(false);
      })
      .catch(() => setLoadingMetrics(false));
  }

  if (!isAuthorized) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Gate</h1>
          <p className="text-sm text-muted-foreground">
            Enter your passcode to manage easyCV and view Stripe metrics.
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="passcode" className="text-xs font-semibold text-muted-foreground uppercase">
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
          >
            Unlock Dashboard
          </button>

          {authError && (
            <p className="text-center text-xs font-medium text-destructive">{authError}</p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">easyCV Admin Hub</h1>
          <p className="text-sm text-muted-foreground">
            Real-time Stripe volume, payouts, and conversions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID || "ca_12345";
              const origin = window.location.origin;
              window.location.href = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${origin}/api/admin/stripe/callback`;
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Connect Stripe
          </button>
          <button
            onClick={fetchMetrics}
            disabled={loadingMetrics}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCw className={`size-3.5 ${loadingMetrics ? "animate-spin" : ""}`} />
            Sync metrics
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1: Gross Sales */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Sales</span>
            <DollarSign className="size-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">
            {metrics ? `$${(metrics.grossVolume / 100).toFixed(2)}` : <div className="h-7 w-20 animate-pulse bg-muted rounded" />}
          </div>
          <p className="text-xs text-muted-foreground pt-1">Total revenue collected</p>
        </div>

        {/* Metric 2: Net Volume */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Volume</span>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">
            {metrics ? `$${(metrics.netRevenue / 100).toFixed(2)}` : <div className="h-7 w-20 animate-pulse bg-muted rounded" />}
          </div>
          <p className="text-xs text-muted-foreground pt-1">Revenue after processing fees</p>
        </div>

        {/* Metric 3: Paid Customers */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversion Ratio</span>
            <Users className="size-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">
            {metrics ? `${metrics.activeCustomers} paid` : <div className="h-7 w-20 animate-pulse bg-muted rounded" />}
          </div>
          <p className="text-xs text-muted-foreground pt-1">Validation client target: 3 sales</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Stripe Transactions */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight uppercase pb-4">Recent Stripe Payments</h2>
          <div className="flex flex-col gap-3">
            {metrics?.sales && metrics.sales.length > 0 ? (
              metrics.sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">{sale.email}</p>
                    <p className="text-xs text-muted-foreground">{new Date(sale.date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">${(sale.amount / 100).toFixed(2)}</span>
                    <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-500">Paid</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No recent Stripe sales records found.</p>
            )}
          </div>
        </div>

        {/* Next Payouts */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight uppercase pb-4">Pending Payouts to Bank</h2>
          <div className="flex flex-col gap-3">
            {metrics?.payouts && metrics.payouts.length > 0 ? (
              metrics.payouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">Stripe Transfer</p>
                    <p className="text-xs text-muted-foreground">{new Date(payout.date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">${(payout.amount / 100).toFixed(2)}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{payout.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No pending bank payouts listed.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
