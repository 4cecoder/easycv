"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { usePostHog } from "posthog-js/react";

import { Alert, AlertDescription, Button } from "@bytecats/ui-kit";
import { trackCheckoutStart, trackCheckoutDone, trackCheckoutFail } from "@/lib/tracker";

// Its own small client component (PreviewClient, which renders this, is
// also a client component now -- kept split out anyway since this is a
// self-contained bit of interactivity/local state).
export function CheckoutButton({
  uploadId,
  label = "Download PDF ($14)",
  size = "default",
  className = "",
}: {
  uploadId: string;
  label?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const posthog = usePostHog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    trackCheckoutStart(uploadId, "payment");
    posthog.capture("checkout_initiated", { upload_id: uploadId });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        trackCheckoutFail(uploadId, body.error);
        posthog.capture("checkout_failed", { upload_id: uploadId, error: body.error });
        throw new Error(body.error ?? `Checkout failed (${res.status})`);
      }
      trackCheckoutDone(uploadId, 1400);
      posthog.capture("checkout_redirect", { upload_id: uploadId });
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-1 sm:w-auto">
      <Button
        onClick={handleClick}
        disabled={pending}
        size={size}
        className={`w-full sm:w-auto font-bold shadow-xs active:scale-95 transition-all ${className}`}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin mr-1.5" />
            Redirecting...
          </>
        ) : (
          label
        )}
      </Button>
      {error && (
        <Alert variant="destructive" role="alert" className="text-left text-xs py-1.5">
          <AlertCircle className="size-3.5" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
