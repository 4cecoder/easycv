/**
 * Analytics device id.
 *
 * A random, per-browser identifier used only to group product-analytics
 * actions (lib/tracker.ts). It is opt-in: without analytics consent nothing is
 * generated or stored. It is NOT derived from the device (no canvas, WebGL or
 * audio fingerprinting), is never set as a cookie, and is never linked to an
 * email address. Choosing "Essential only" deletes it (lib/consent.ts).
 */

import { hasAnalyticsConsent } from "./consent";

const ANALYTICS_DEVICE_ID_KEY = "easycv_dh";

/**
 * Return the random analytics id for this browser, creating it on first use.
 * Returns "" without analytics consent.
 */
export function getAnalyticsDeviceId(): string {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return "";
  try {
    const existing = window.localStorage.getItem(ANALYTICS_DEVICE_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(ANALYTICS_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "";
  }
}
