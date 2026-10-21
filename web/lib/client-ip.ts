/**
 * Trusted client-IP extraction for anonymous / unauthenticated endpoints.
 *
 * On Netlify, `x-nf-client-connection-ip` is set by Netlify's edge from the
 * actual TCP connection and overwrites any client-sent value, so it is the
 * only trustworthy source. `x-real-ip` is the fallback for other trusted
 * reverse proxies (and local dev behind one).
 *
 * We deliberately NEVER read the first `X-Forwarded-For` entry: clients can
 * prepend arbitrary values to that header, so keying on it lets an attacker
 * rotate "IPs" per request and bypass any per-IP limit.
 */

/** Sentinel bucket for requests with no trusted IP header (e.g. local dev). */
export const UNKNOWN_CLIENT_IP = "unknown";

/** Minimal header accessor (Headers / NextRequest.headers both satisfy it). */
export interface HeaderSource {
  get(name: string): string | null;
}

/** Return the trusted client IP, or UNKNOWN_CLIENT_IP when none is present. */
export function getTrustedClientIp(headers: HeaderSource): string {
  for (const name of ["x-nf-client-connection-ip", "x-real-ip"]) {
    const value = headers.get(name)?.trim();
    // Bound length so a hostile proxy-less request can't bloat limiter keys.
    if (value && value.length <= 64) return value;
  }
  return UNKNOWN_CLIENT_IP;
}
