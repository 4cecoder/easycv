/**
 * Tracking consent.
 *
 * Default is "essential only": nothing analytics- or telemetry-related runs in
 * the browser (no UserMon events, no action tracker, no analytics identifiers
 * in cookies or localStorage) until the visitor explicitly opts in through the
 * consent banner. A browser Global Privacy Control or Do Not Track signal is
 * treated as an opt-out that overrides any stored choice.
 *
 * The choice itself lives in a first-party cookie (`easycv_consent`) so it is
 * remembered across visits and can be changed from the footer's
 * "Privacy choices" link.
 */

/** The two choices a visitor can make in the consent banner. */
export type ConsentChoice = "analytics" | "essential";

/** First-party cookie that remembers the visitor's consent choice. */
export const CONSENT_COOKIE = "easycv_consent";

/** How long the consent choice is remembered before we ask again. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

/** Window event fired whenever the stored consent choice changes. */
export const CONSENT_CHANGE_EVENT = "easycv:consent-change";

/** Window event that asks the consent banner to reopen (footer link). */
export const OPEN_PRIVACY_CHOICES_EVENT = "easycv:open-privacy-choices";

/**
 * Browser storage keys that only exist for analytics/telemetry. They are
 * removed when the visitor chooses "Essential only" (including legacy keys
 * written by older builds before consent existed).
 */
export const TRACKING_LOCAL_STORAGE_KEYS = [
  "easycv_telemetry_session",
  "easycv_device_profile",
  "easycv_dh",
  "easycv_id",
] as const;

/** Analytics cookies removed on "Essential only" (including legacy ones). */
export const TRACKING_COOKIES = ["easycv_telemetry_session", "easycv_dh", "cv_id"] as const;

type NavigatorWithPrivacySignals = Navigator & {
  globalPrivacyControl?: boolean;
  msDoNotTrack?: string;
};

/**
 * True when the browser sends Global Privacy Control or Do Not Track.
 * Either signal is honoured as an opt-out of analytics.
 */
export function hasPrivacySignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithPrivacySignals;
  if (nav.globalPrivacyControl === true) return true;
  const dnt =
    nav.doNotTrack ??
    nav.msDoNotTrack ??
    (typeof window !== "undefined" ? (window as unknown as { doNotTrack?: string }).doNotTrack : undefined);
  return dnt === "1" || dnt === "yes";
}

/** The stored consent choice, or null if the visitor has not chosen yet. */
export function readConsentChoice(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = row?.slice(CONSENT_COOKIE.length + 1);
  return value === "analytics" || value === "essential" ? value : null;
}

/**
 * Whether client-side analytics/telemetry may run right now.
 *
 * Always false on the server (callers decide separately what server-side
 * operational monitoring does), before a choice is made, after "Essential
 * only", and whenever GPC / DNT is on.
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  if (hasPrivacySignal()) return false;
  return readConsentChoice() === "analytics";
}

function expireCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

/** Remove every analytics identifier from cookies and localStorage. */
export function clearTrackingStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of TRACKING_LOCAL_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage may be blocked; nothing to clear then.
    }
  }
  for (const name of TRACKING_COOKIES) expireCookie(name);
}

/**
 * Persist the visitor's choice. Choosing "essential" also wipes any analytics
 * identifiers that were stored earlier.
 */
export function setConsentChoice(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  if (choice === "essential" || hasPrivacySignal()) clearTrackingStorage();
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice }));
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function onConsentChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGE_EVENT, listener);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, listener);
}

/** Ask the consent banner to reopen so the visitor can change their choice. */
export function openPrivacyChoices(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_PRIVACY_CHOICES_EVENT));
}
