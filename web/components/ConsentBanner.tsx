"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  hasPrivacySignal,
  OPEN_PRIVACY_CHOICES_EVENT,
  readConsentChoice,
  setConsentChoice,
  type ConsentChoice,
} from "@/lib/consent";

/**
 * Small, non-modal consent banner.
 *
 * Shown on first visit when no choice is stored. "Accept analytics" and
 * "Essential only" have equal weight. It never steals focus on page load;
 * when reopened from the footer's "Privacy choices" link it moves focus to
 * its heading, closes on Escape, and returns focus to the link afterwards.
 * With Global Privacy Control / Do Not Track on, analytics stays off and the
 * banner only explains that (no first-visit prompt).
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [signal, setSignal] = useState(false);
  const [current, setCurrent] = useState<ConsentChoice | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const gpc = hasPrivacySignal();
    const choice = readConsentChoice();
    setSignal(gpc);
    setCurrent(choice);
    if (!choice && !gpc) setOpen(true);

    const handleOpen = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSignal(hasPrivacySignal());
      setCurrent(readConsentChoice());
      setReopened(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (open && reopened) headingRef.current?.focus();
  }, [open, reopened]);

  const close = useCallback(() => {
    setOpen(false);
    setReopened(false);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target && document.contains(target)) target.focus();
  }, []);

  const choose = useCallback(
    (choice: ConsentChoice) => {
      setConsentChoice(choice);
      setCurrent(choice);
      close();
    },
    [close],
  );

  if (!open) return null;

  const statusText = signal
    ? "Your browser sends a Global Privacy Control or Do Not Track signal, so analytics stays off."
    : current === "analytics"
      ? "Current choice: analytics allowed."
      : current === "essential"
        ? "Current choice: essential only."
        : null;

  return (
    <section
      role="region"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-description"
      data-testid="consent-banner"
      onKeyDown={(event) => {
        if (event.key === "Escape" && (reopened || current || signal)) {
          event.stopPropagation();
          close();
        }
      }}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg sm:left-4 sm:right-auto sm:mx-0"
    >
      <h2
        id="consent-banner-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        Privacy choices
      </h2>
      <p id="consent-banner-description" className="mt-1 text-xs leading-relaxed text-muted-foreground">
        We use essential cookies to sign you in and remember your settings. With your permission we also
        collect anonymous usage and performance data to improve easyCV. No advertising, no device
        fingerprinting. You can change this any time from &ldquo;Privacy choices&rdquo; in the footer.{" "}
        <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-foreground">
          Cookie details
        </Link>
      </p>
      {statusText && (
        <p className="mt-2 text-xs font-medium text-foreground" role="status">
          {statusText}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose("essential")}
          className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => choose("analytics")}
          disabled={signal}
          aria-describedby={signal ? "consent-banner-description" : undefined}
          className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          Accept analytics
        </button>
        {(reopened || signal) && (
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </button>
        )}
      </div>
    </section>
  );
}
