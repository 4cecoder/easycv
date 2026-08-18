import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
// IP extraction
// ---------------------------------------------------------------------------

/**
 * Derive a stable client IP. Vercel / Netlify / Cloudflare inject
 * `X-Forwarded-For`; fall back to `x-real-ip`, then to a sentinel.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // Should never hit this in production behind a reverse proxy, but keeps
  // the type happy and makes local dev work without spoofing headers.
  return "127.0.0.1";
}

// ---------------------------------------------------------------------------
// Middleware entry-point
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes — static assets and pages are not touched.
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const label = resolveLabel(pathname);
  const config: RateLimitConfig = RATE_LIMITS[label];

  const ip = getClientIp(request);
  const sessionId = request.cookies.get("cv_session")?.value;

  const result = checkRateLimit(label, config, ip, sessionId);

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
