"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useAction } from "convex/react";
import { Check, Crown, Loader2, Sparkles } from "lucide-react";

import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@bytecats/ui-kit";

import { api } from "../../convex/_generated/api";
import { getBrowserSessionId } from "../../lib/fingerprint";

const FREE_FEATURES = [
  "Upload & parse one resume at a time",
  "ATS quality score & improvement tips",
  "2 free AI auto-improve passes",
];

const PRO_FEATURES = [
  "Unlimited AI auto-improve passes",
  "Official PDF & LaTeX export for every resume",
  "Unlimited job-match scoring & tailored bullets",
  "Full career vault across all your uploads",
];

export default function PricingPage() {
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(getBrowserSessionId());
  }, []);

  const isPro = useQuery(api.billing.isSubscribed, sessionId ? { sessionId } : "skip");
  const createCheckout = useAction(api.billing.createSubscriptionCheckout);

  async function handleSubscribe() {
    setPending(true);
    setError(null);
    try {
      const { url } = await createCheckout({ sessionId });
      if (!url) throw new Error("Stripe did not return a checkout URL");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full fluent-subtle-grid pb-16">
      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 px-4 pt-10 sm:px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Badge className="rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-semibold">
            Simple pricing
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Go Pro in under a minute
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            No demo required. Subscribe now, and unlock every upload you make from here on.
          </p>
        </div>

        {isPro && (
          <Alert className="w-full max-w-2xl border-emerald-500/30 bg-emerald-500/10">
            <Crown className="size-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              You&apos;re already on easyCV Pro. Upload a resume to use it.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-border shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Free</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">$0</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" asChild className="mt-auto">
                <Link href="/">Try it free</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/40 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 rounded-bl-lg bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              Most popular
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-bold text-primary uppercase tracking-wide">
                <Sparkles className="size-4" />
                Pro
              </CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">$14</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={handleSubscribe}
                disabled={pending || !sessionId || isPro === true}
                className="mt-auto font-bold shadow-xs active:scale-95 transition-all"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                    Redirecting...
                  </>
                ) : isPro ? (
                  "Already subscribed"
                ) : (
                  "Subscribe — $14/mo"
                )}
              </Button>
              {error && (
                <Alert variant="destructive" role="alert" className="text-xs py-1.5">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <p className="text-[11px] text-muted-foreground text-center">
                Cancel anytime. Billed monthly via Stripe.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
