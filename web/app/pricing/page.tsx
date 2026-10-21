"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useAction, useConvexAuth } from "convex/react";
import { Check, Crown, FileText, Loader2, Sparkles } from "lucide-react";

import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@bytecats/ui-kit";

import { api } from "../../convex/_generated/api";
import {
  autoRenewalDisclosure,
  formatPrice,
  FREE_FEATURES,
  PRO_MONTHLY,
  RESUME_UNLOCK,
} from "../../lib/catalog";
import { SUPPORT_EMAIL } from "../../lib/legal";
import { FAIR_USE_SUMMARY } from "../../lib/limits";
import { CheckoutLegalNote } from "../../components/CheckoutLegalNote";

export default function PricingPage() {
  const { isAuthenticated } = useConvexAuth();
  const [pending, setPending] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = useQuery(api.billing.isSubscribed, isAuthenticated ? {} : "skip");
  const hasSubscription = useQuery(api.billing.hasSubscriptionRecord, isAuthenticated ? {} : "skip");
  const createCheckout = useAction(api.billing.createSubscriptionCheckout);
  const createPortal = useAction(api.billing.createCustomerPortalSession);

  async function handleSubscribe() {
    setPending(true);
    setError(null);
    try {
      const { url } = await createCheckout({});
      if (!url) throw new Error("Stripe did not return a checkout URL");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  async function handleManage() {
    setPortalPending(true);
    setError(null);
    try {
      const { url } = await createPortal({});
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open subscription management");
      setPortalPending(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full fluent-subtle-grid pb-16">
      <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-4 pt-10 sm:px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Badge className="rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-semibold">
            Simple pricing
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Pay once per résumé, or go Pro
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            Two separate options: a one-time unlock for a single résumé, or a monthly Pro subscription that
            unlocks every résumé while it&apos;s active.
          </p>
        </div>

        {isPro && (
          <Alert className="w-full max-w-2xl border-emerald-500/30 bg-emerald-500/10">
            <Crown className="size-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              You&apos;re on {PRO_MONTHLY.name}. Upload a résumé to use it.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-border shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Free</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">{formatPrice({ priceCents: 0 })}</span>
              </div>
              <p className="text-xs text-muted-foreground">Sign in required.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" asChild className="mt-auto">
                <Link href="/">Try it free</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-2xs" data-testid="product-resume-unlock">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-bold text-foreground uppercase tracking-wide">
                <FileText className="size-4" aria-hidden="true" />
                {RESUME_UNLOCK.name}
              </CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">{formatPrice(RESUME_UNLOCK)}</span>
                <span className="text-sm text-muted-foreground">one-time</span>
              </div>
              <p className="text-xs text-muted-foreground">{RESUME_UNLOCK.summary}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {RESUME_UNLOCK.unlocks.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" asChild className="mt-auto">
                <Link href="/">Upload a résumé</Link>
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Buy it from the résumé&apos;s preview page once it&apos;s ready.
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/40 shadow-md relative overflow-hidden" data-testid="product-pro-monthly">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-bold text-primary uppercase tracking-wide">
                <Sparkles className="size-4" aria-hidden="true" />
                {PRO_MONTHLY.name}
              </CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">{formatPrice(PRO_MONTHLY)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="text-xs text-muted-foreground">{PRO_MONTHLY.summary}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {PRO_MONTHLY.unlocks.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {isAuthenticated ? (
                <Button
                  onClick={handleSubscribe}
                  disabled={pending || isPro === true}
                  aria-describedby="pro-auto-renewal"
                  className="mt-auto font-bold shadow-xs active:scale-95 transition-all"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1.5" aria-hidden="true" />
                      Redirecting...
                    </>
                  ) : isPro ? (
                    "Already subscribed"
                  ) : (
                    `Subscribe for ${formatPrice(PRO_MONTHLY)}/month`
                  )}
                </Button>
              ) : (
                <Button asChild className="mt-auto font-bold">
                  <a href="/api/auth/login">Sign in to subscribe</a>
                </Button>
              )}
              <p id="pro-auto-renewal" className="text-[11px] leading-relaxed text-muted-foreground" data-testid="auto-renewal-disclosure">
                {autoRenewalDisclosure(PRO_MONTHLY)}
              </p>
              {hasSubscription && (
                <Button variant="outline" size="sm" onClick={handleManage} disabled={portalPending}>
                  {portalPending ? "Opening Stripe…" : "Manage or cancel subscription"}
                </Button>
              )}
              {error && (
                <Alert variant="destructive" role="alert" className="text-xs py-1.5">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <CheckoutLegalNote />
            </CardContent>
          </Card>
        </div>

        <p className="max-w-2xl text-center text-xs text-muted-foreground" data-testid="fair-use">
          {FAIR_USE_SUMMARY}
        </p>
        <p className="max-w-2xl text-center text-xs text-muted-foreground">
          Payments are processed by Stripe. Prices are in US dollars. Can&apos;t
          reach the subscription page? Email{" "}
          <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and
          we&apos;ll cancel for you.
        </p>
      </main>
    </div>
  );
}
