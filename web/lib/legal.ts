/**
 * Facts shared by the Privacy Policy, Terms, footer, and checkout copy.
 *
 * Keep this file the single source of truth for contact details,
 * subprocessors, and the cookie/storage inventory so the legal pages cannot
 * drift from what the app actually does (lib/legal.test.ts checks the cookie
 * table against lib/consent.ts and lib/seridian-oidc.ts).
 */

import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS } from "./consent";

// Mirrors SESSION_COOKIE in lib/seridian-oidc.ts (not imported, to keep the
// server-only OIDC module out of client bundles; lib/legal.test.ts asserts
// they match).
const SESSION_COOKIE_NAME = "easycv_seridian_session";

/** Date shown in the "Last updated" banner on /privacy and /terms. */
export const LEGAL_LAST_UPDATED = "October 20, 2026";

// TODO(founder): replace with a monitored inbox before launch.
/** Address for privacy requests (access, export, deletion). */
export const PRIVACY_EMAIL = "privacy@easycv.app";

// TODO(founder): split into a dedicated support inbox if desired.
/** Address for billing / cancellation / general support. */
export const SUPPORT_EMAIL = PRIVACY_EMAIL;

/** A third party that processes personal data on easyCV's behalf. */
export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
}

/** Subprocessors listed in the Privacy Policy. */
export const SUBPROCESSORS: readonly Subprocessor[] = [
  {
    name: "OpenAI",
    purpose: "AI job matching, and résumé consolidation when it runs on a hosted model",
    data: "Résumé content and job descriptions you submit. For job matching we send your name and résumé sections but not your email, phone or address.",
    location: "United States",
  },
  {
    name: "Our database and file storage provider",
    purpose: "Storing your account data, uploaded files and generated résumés",
    data: "Everything listed under “What we collect”",
    location: "United States",
  },
  {
    name: "Seridian Auth (auth.seridian.dev)",
    purpose: "Sign-in",
    data: "Email address and sign-in identifiers",
    location: "United States",
  },
  {
    name: "Stripe",
    purpose: "Payments and subscription billing (Stripe Checkout and Customer Portal)",
    data: "Email, payment details (entered directly with Stripe; we never see your card number), purchase history",
    location: "United States",
  },
  {
    name: "Netlify",
    purpose: "Website hosting",
    data: "Standard web request data such as IP address and browser user agent",
    location: "United States",
  },
  {
    name: "In-house monitoring service (UserMon)",
    purpose: "Error and performance monitoring",
    data: "Server request timings and errors. Browser usage and performance events only if you accept analytics.",
    location: "United States",
  },
];

/** Whether a cookie / storage entry is always on or needs analytics consent. */
export type StorageCategory = "essential" | "analytics";

/** One row of the cookie and browser-storage table on /privacy. */
export interface StorageEntry {
  name: string;
  kind: "cookie" | "localStorage";
  category: StorageCategory;
  purpose: string;
  duration: string;
}

/** Every cookie and localStorage key easyCV sets, by category. */
export const STORAGE_ENTRIES: readonly StorageEntry[] = [
  {
    name: SESSION_COOKIE_NAME,
    kind: "cookie",
    category: "essential",
    purpose: "Keeps you signed in (encrypted, HttpOnly)",
    duration: "30 days",
  },
  {
    name: "easycv_oidc_state, easycv_oidc_nonce, easycv_oidc_verifier",
    kind: "cookie",
    category: "essential",
    purpose: "Protects the sign-in redirect against forgery",
    duration: "10 minutes",
  },
  {
    name: CONSENT_COOKIE,
    kind: "cookie",
    category: "essential",
    purpose: "Remembers your privacy choice",
    duration: `${Math.round(CONSENT_MAX_AGE_SECONDS / 86400)} days`,
  },
  {
    name: "easycv_theme",
    kind: "localStorage",
    category: "essential",
    purpose: "Remembers light or dark mode",
    duration: "Until you clear site data",
  },
  {
    name: "easycv_telemetry_session",
    kind: "cookie",
    category: "analytics",
    purpose: "Random id that groups anonymous usage and performance events (also kept in localStorage)",
    duration: "1 year, deleted if you choose Essential only",
  },
  {
    name: "easycv_dh",
    kind: "localStorage",
    category: "analytics",
    purpose: "Random id that groups product-usage actions (not derived from your device)",
    duration: "Until deleted; removed if you choose Essential only",
  },
  {
    name: "easycv_device_profile",
    kind: "localStorage",
    category: "analytics",
    purpose: "Coarse browser details (browser, OS, screen size) cached for analytics",
    duration: "24 hours",
  },
];
