"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Lock, 
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
  const [actionLoading, setActionLoading] = useState<string | null>(null);


  const uploads = useQuery(api.admin.listAllUploads, { passcode: isAuthorized ? password : "" }) || [];
  const bypassPaymentMutation = useMutation(api.admin.bypassPayment);
  const deleteUploadMutation = useMutation(api.admin.deleteUpload);
  const retryUploadMutation = useMutation(api.admin.retryUpload);

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

  async function handleBypassPayment(uploadId: Id<"uploads">) {
    setActionLoading(`bypass-${uploadId}`);
    try {
      await bypassPaymentMutation({ passcode: password, uploadId });
      alert("Payment bypassed successfully!");
    } catch (err) {
      alert(`Bypass failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetry(uploadId: Id<"uploads">) {
    setActionLoading(`retry-${uploadId}`);
    try {
      await retryUploadMutation({ passcode: password, uploadId });
      alert("Upload status reset to queued!");
    } catch (err) {
      alert(`Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(uploadId: Id<"uploads">) {
    if (!confirm("Are you sure you want to delete this upload and all associated records?")) return;
    setActionLoading(`delete-${uploadId}`);
    try {
      await deleteUploadMutation({ passcode: password, uploadId });
      alert("Upload deleted successfully!");
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
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

      {/* Uploads and Workers Queue Manager */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Active CV Uploads & Jobs Queue</h2>
            <p className="text-xs text-muted-foreground">Manage processing pipeline, bypass payments, or delete records.</p>
          </div>
          <span className="rounded bg-muted px-2.5 py-1 text-xs font-semibold">{uploads.length} uploads found</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                <th className="py-3 px-2">Created</th>
                <th className="py-3 px-2">Upload ID</th>
                <th className="py-3 px-2">Files</th>
                <th className="py-3 px-2">Worker Status</th>
                <th className="py-3 px-2">Attempts</th>
                <th className="py-3 px-2">Quality</th>
                <th className="py-3 px-2">Payment Status</th>
                <th className="py-3 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.length > 0 ? (
                uploads.map((u: any) => {
                  const hasPaid = u.payments?.some((p: any) => p.status === "paid");
                  const activePayment = u.payments?.find((p: any) => p.status === "paid") || u.payments?.[0];
                  return (
                    <tr key={u._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 whitespace-nowrap text-muted-foreground">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-2 font-mono text-muted-foreground">
                        <Link href={`/preview/${u._id}`} target="_blank" className="hover:underline text-primary">
                          {u._id.substring(0, 8)}...
                        </Link>
                      </td>
                      <td className="py-3 px-2 max-w-[150px] truncate" title={u.resumeFiles?.map((f: any) => f.filename).join(", ")}>
                        {u.resumeFiles && u.resumeFiles.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {u.resumeFiles.map((f: any, idx: number) => (
                              <span key={idx} className="block truncate text-foreground/80 font-medium">
                                📄 {f.filename} ({f.sizeKb}kb)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">No files</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          u.status === "ready" ? "bg-green-500/10 text-green-500" :
                          u.status === "processing" ? "bg-blue-500/10 text-blue-500 animate-pulse" :
                          u.status === "error" ? "bg-red-500/10 text-red-500" :
                          u.status === "queued" ? "bg-amber-500/10 text-amber-500" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {u.status}
                        </span>
                        {u.errorMessage && (
                          <p className="text-[10px] text-red-400 mt-1 max-w-[150px] truncate" title={u.errorMessage}>
                            Err: {u.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-2 font-mono">{u.attempts}</td>
                      <td className="py-3 px-2">
                        {u.structuredProfile ? (
                          <span className={`font-semibold ${u.structuredProfile.qualityCritical ? "text-red-500" : "text-foreground"}`}>
                            {u.structuredProfile.qualityScore}/{u.structuredProfile.qualityMaxScore}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">&mdash;</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium ${
                          hasPaid ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {hasPaid ? "Paid" : activePayment ? activePayment.status : "Unpaid"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {!hasPaid && (
                            <button
                              disabled={actionLoading !== null}
                              onClick={() => handleBypassPayment(u._id)}
                              className="rounded bg-green-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === `bypass-${u._id}` ? "Bypassing..." : "Bypass Pay"}
                            </button>
                          )}
                          {(u.status === "error" || u.status === "processing") && (
                            <button
                              disabled={actionLoading !== null}
                              onClick={() => handleRetry(u._id)}
                              className="rounded border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                            >
                              {actionLoading === `retry-${u._id}` ? "Retrying..." : "Retry"}
                            </button>
                          )}
                          <button
                            disabled={actionLoading !== null}
                            onClick={() => handleDelete(u._id)}
                            className="rounded bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground hover:opacity-95 disabled:opacity-50"
                          >
                            {actionLoading === `delete-${u._id}` ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No uploads in system or incorrect admin password.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

