/**
 * Browser Session & Fingerprint Utility
 * 
 * Ensures a consistent, zero-login identifier for each visitor so all their uploaded
 * resumes, edits, job matches, and career history persist across page reloads and visits.
 */

const SESSION_STORAGE_KEY = "easycv_browser_session";
const COOKIE_NAME = "cv_session";

export function getBrowserSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  // 1. Try localStorage
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);

  // 2. Try cookie fallback
  if (!sessionId) {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${COOKIE_NAME}=`));
    if (match) {
      sessionId = match.split("=")[1];
    }
  }

  // 3. Generate new persistent ID if neither exists
  if (!sessionId) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = "sess_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  // 4. Ensure cookie is synchronized for 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${COOKIE_NAME}=${sessionId}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

  return sessionId;
}
