"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { usePostHog } from "posthog-js/react";

import { Alert, AlertDescription, Button } from "@bytecats/ui-kit";

// Its own small client component (PreviewClient, which renders this, is
// also a client component now -- kept split out anyway since this is a
// self-contained bit of interactivity/local state).
export function CheckoutButton({ uploadId }: { uploadId: string }) {
  const posthog = usePostHog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    posthog.capture("checkout_initiated", { upload_id: uploadId });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        posthog.capture("checkout_failed", { upload_id: uploadId, error: body.error });
        throw new Error(body.error ?? `Checkout failed (${res.status})`);
      }
      posthog.capture("checkout_redirect", { upload_id: uploadId });
      // Stripe Checkout is a hosted page -- navigate the whole browser there,
      // don't fetch it. Stripe redirects back to success_url/cancel_url,
      // both of which point at this same /preview/[uploadId] page.
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
      {/* Price itself is NOT hardcoded here -- it's whatever STRIPE_PRICE_ID
          resolves to in the Stripe dashboard, so it can be tuned without a
          redeploy (per rf-2). */}
      <Button onClick={handleClick} disabled={pending} size="lg" className="w-full sm:w-auto">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Redirecting to checkout&hellip;
          </>
        ) : (
          "Download PDF"
        )}
      </Button>
      {error && (
        <Alert variant="destructive" role="alert" className="text-left">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
