/**
 * Shared session constants and utilities.
 *
 * The `cv_session` cookie is the ONLY identity concept for anonymous visitors
 * (schema.ts:43-45).  It doubles as the authenticated session token when a
 * user has verified their email via the magic-link flow — the same cookie
 * value is stored on the userAccounts.row.sessionId column.
 *
 * SECURITY INVARIANT: The sessionId in this cookie is the sole authority for
 * ownership checks.  Client-supplied sessionId values from form fields, query
 * params, or headers MUST be rejected.  Always validate against Convex
 * server-side (see validate-session.ts / auth-context.ts).
 *
 * Every reader/writer of the cookie (app/api/upload/route.ts,
 * app/preview/[uploadId]/page.tsx, app/api/checkout/route.ts, ...) imports
 * this constant to stay in sync.
 */

// ---------------------------------------------------------------------------
// Cookie name
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "cv_session";

// ---------------------------------------------------------------------------
// Cookie options
// ---------------------------------------------------------------------------

/** Options for setting the session cookie on a response. */
export interface SessionCookieOptions {
  /** Max age in seconds.  Default: 90 days. */
  maxAge?: number;
  /** Whether the cookie is HttpOnly (not accessible to JavaScript).  Default: true. */
  httpOnly?: boolean;
  /** SameSite policy.  Default: "lax". */
  sameSite?: "strict" | "lax" | "none";
  /** Cookie path.  Default: "/". */
  path?: string;
  /** Whether to set Secure (HTTPS-only).  Default: true in production. */
  secure?: boolean;
}

const DEFAULT_COOKIE_OPTIONS: Required<SessionCookieOptions> = {
  maxAge: 90 * 24 * 60 * 60, // 90 days in seconds
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

/**
 * Build the Set-Cookie header value for the session cookie.
 *
 * @param sessionId  - The opaque session token.
 * @param overrides  - Optional overrides for cookie attributes.
 * @returns A string suitable for a Set-Cookie header.
 */
export function buildSessionCookieHeader(
  sessionId: string,
  overrides?: SessionCookieOptions,
): string {
  const opts = { ...DEFAULT_COOKIE_OPTIONS, ...overrides };
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite}`,
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Session expiry
// ---------------------------------------------------------------------------

/**
 * Maximum session age in milliseconds.  After this duration since the
 * account's `lastLoginAt`, the session is considered stale and should be
 * re-authenticated.
 *
 * Set to 0 to disable staleness checks (not recommended in production).
 */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Check whether a session is expired based on lastLoginAt.
 *
 * This is a pure utility — it does NOT validate the session against Convex.
 * Use validate-session.ts for full validation that includes this check.
 *
 * @param lastLoginAt - The account's lastLoginAt timestamp (ms).
 * @param now         - Current timestamp (ms).  Defaults to Date.now().
 * @returns true if the session should be considered expired.
 */
export function isSessionExpired(lastLoginAt: number, now?: number): boolean {
  if (SESSION_MAX_AGE_MS <= 0) return false;
  const currentTime = now ?? Date.now();
  return currentTime - lastLoginAt > SESSION_MAX_AGE_MS;
}

/**
 * Compute the remaining session lifetime in milliseconds.
 *
 * @param lastLoginAt - The account's lastLoginAt timestamp (ms).
 * @param now         - Current timestamp (ms).  Defaults to Date.now().
 * @returns Milliseconds remaining, or 0 if already expired.
 */
export function sessionRemainingMs(lastLoginAt: number, now?: number): number {
  if (SESSION_MAX_AGE_MS <= 0) return Infinity;
  const elapsed = (now ?? Date.now()) - lastLoginAt;
  return Math.max(0, SESSION_MAX_AGE_MS - elapsed);
}

// ---------------------------------------------------------------------------
// Account linking verification
// ---------------------------------------------------------------------------

/**
 * Verify that a sessionId belongs to a verified, active account.
 *
 * This is the LOW-LEVEL check.  Prefer createAuthContext() or
 * requireAuthContext() from auth-context.ts which bundle this with error
 * handling and typed context.
 *
 * @param sessionId - The opaque session token from the cookie.
 * @returns The account row if valid, or null.
 */
export async function verifyAccountLinkage(
  sessionId: string,
): Promise<{
  linked: boolean;
  verified: boolean;
  email: string | null;
  lastLoginAt: number | null;
}> {
  if (!sessionId || typeof sessionId !== "string") {
    return { linked: false, verified: false, email: null, lastLoginAt: null };
  }

  try {
    const { api } = await import("../convex/_generated/api");
    const { getConvexClient } = await import("./convexServer");
    const convex = getConvexClient();

    // getAccountBySession returns null for both "no account" and "not verified".
    const result = await convex.query(api.auth.getAccountBySession, {
      sessionId: sessionId.trim(),
    });

    if (!result) {
      return { linked: false, verified: false, email: null, lastLoginAt: null };
    }

    return {
      linked: true,
      verified: result.verified,
      email: result.email,
      lastLoginAt: result.lastLoginAt,
    };
  } catch (err) {
    console.error("[session] verifyAccountLinkage failed:", err);
    return { linked: false, verified: false, email: null, lastLoginAt: null };
  }
}

/**
 * Check whether a sessionId is linked to ANY account (verified or not).
 *
 * Useful for detecting partially-completed sign-ups (e.g., user started
 * the magic-link flow but hasn't entered the code yet).
 *
 * NOTE: This requires a separate Convex query — verifyAccountLinkage is
 * preferred for most use-cases because it also checks `verified`.
 */
export async function isSessionLinked(sessionId: string): Promise<boolean> {
  const { linked } = await verifyAccountLinkage(sessionId);
  return linked;
}

// ---------------------------------------------------------------------------
// Cookie extraction (safe)
// ---------------------------------------------------------------------------

/**
 * Safely extract the session ID from a NextRequest-like object.
 *
 * Returns null if the cookie is absent or empty — never throws.
 * This is the ONLY correct way to obtain a sessionId server-side.
 *
 * @param request - Any object with a `cookies.get()` method.
 * @returns The session ID string, or null.
 */
export function extractSessionId(
  request: Pick<{ cookies: { get: (name: string) => { value: string } | undefined } }, "cookies">,
): string | null {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  if (!value || typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value.trim();
}
