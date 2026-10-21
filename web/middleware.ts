import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getTrustedClientIp, UNKNOWN_CLIENT_IP } from "./lib/client-ip";
import {
  checkRateLimit,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitLabel,
} from "./lib/rate-limit";

// ---------------------------------------------------------------------------
// Route → rate-limit bucket mapping
// ---------------------------------------------------------------------------

/**
 * Maps pathname prefixes to their rate-limit label. Order matters: more
 * specific prefixes are checked first.
 */
const ROUTE_MAP: [pattern: RegExp, label: RateLimitLabel][] = [
  [/^\/api\/upload\b/, "upload"],
  [/^\/api\/checkout\b/, "checkout"],
  [/^\/api\/job-match\b/, "jobMatch"],
  [/^\/api\/download\b/, "download"],
  // Everything else under /api gets the general bucket.
  [/^\/api\b/, "general"],
];

function resolveLabel(pathname: string): RateLimitLabel {
  for (const [pattern, label] of ROUTE_MAP) {
    if (pattern.test(pathname)) return label;
  }
  return "general";
}

// ---------------------------------------------------------------------------
// IP extraction -- see lib/client-ip.ts. Uses Netlify's
// x-nf-client-connection-ip (then x-real-ip), never the spoofable first
// X-Forwarded-For entry.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Middleware entry-point
// ---------------------------------------------------------------------------

/**
 * BEST-EFFORT FIRST LINE ONLY. This limiter is an in-memory Map, so on
 * Netlify (serverless) every function instance has its own counters that
 * vanish on cold start; it merely blunts naive floods per instance. The
 * authoritative, durable limits are server-side in Convex
 * (convex/rateLimits.ts), keyed on the authenticated owner and enforced by
 * the job-match/upload routes AND server actions (which this middleware
 * never sees, since it only matches /api/*).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes — static assets and pages are not touched.
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const label = resolveLabel(pathname);
  const config: RateLimitConfig = RATE_LIMITS[label];

  // Keyed on the trusted IP only. The old key also mixed in a client-set
  // telemetry cookie, which let a caller mint a fresh bucket per request.
  const ip = getTrustedClientIp(request.headers);
  // No trusted IP header (local dev, or a host that isn't Netlify): don't
  // lump every visitor into one shared bucket and 429 them all -- the
  // durable Convex limits still apply.
  if (ip === UNKNOWN_CLIENT_IP) return NextResponse.next();
  const result = checkRateLimit(label, config, ip, undefined);

  if (!result.allowed) {
    const response = NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter: result.retryAfterSeconds,
      },
      { status: 429 },
    );

    response.headers.set("Retry-After", String(result.retryAfterSeconds));
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Reset", String(result.retryAfterSeconds));

    return response;
  }

  // Attach informational headers so well-behaved clients can self-throttle.
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
