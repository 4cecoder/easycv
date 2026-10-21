"use client";

import { useEffect, useState } from "react";
import { hasAnalyticsConsent, onConsentChange } from "./consent";

/**
 * React hook: whether client analytics may run. Starts false (also during SSR
 * and the first client render) and flips only after an explicit opt-in.
 */
export function useAnalyticsConsent(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(hasAnalyticsConsent());
    return onConsentChange(() => setAllowed(hasAnalyticsConsent()));
  }, []);
  return allowed;
}
