/**
 * Token-bucket rate limiter using a sliding-window counter.
 *
 * In-memory store — fine for a single Next.js instance. For multi-instance
 * deployments swap the Map for Redis (ioredis / @upstash/redis) or Convex
 * mutations; the interface stays the same.
 *
 * Keys are derived from (IP | session-id) so the same visitor is tracked
 * consistently across requests even when they carry a session cookie.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed inside the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional human label for logs / headers. */
  label?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining tokens (0 when denied). */
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
  /** Total limit for the current window. */
  limit: number;
}

// ---------------------------------------------------------------------------
// Internal store
// ---------------------------------------------------------------------------

interface WindowEntry {
  /** Count of requests in the current window. */
  count: number;
  /** Epoch-ms when the window started. */
  windowStart: number;
}

/**
 * Composite key: `ip|sessionId` when a session is present, IP alone otherwise.
 * Using `|` as separator is safe because neither IPs nor UUIDs contain pipes.
 */
function buildKey(ip: string, sessionId: string | undefined): string {
  return sessionId ? `${ip}|${sessionId}` : ip;
}

// Per-label bucket maps. Separated so different route limits don't collide.
const stores = new Map<string, Map<string, WindowEntry>>();

function getStore(label: string): Map<string, WindowEntry> {
  let store = stores.get(label);
  if (!store) {
    store = new Map();
    stores.set(label, store);
  }
  return store;
}

// ---------------------------------------------------------------------------
// Periodic cleanup — evict stale entries every 60 s to cap memory growth.
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

function scheduleCleanup(): void {
  if (cleanupTimer !== undefined) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [label, store] of stores) {
      for (const [key, entry] of store) {
        if (now - entry.windowStart > CLEANUP_INTERVAL_MS * 2) {
          store.delete(key);
        }
      }
      if (store.size === 0) stores.delete(label);
    }
    // If all stores are empty, stop the timer until the next request.
    if (stores.size === 0 && cleanupTimer !== undefined) {
      clearInterval(cleanupTimer);
      cleanupTimer = undefined;
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow Node.js to exit even if the timer is still running.
  const timer = cleanupTimer as unknown as { unref?: () => void };
  if (timer?.unref) {
    timer.unref();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check (and increment) the rate limit for a given key.
 *
 * Uses a **fixed-window counter** aligned to calendar windows. This is simpler
 * than a true sliding-window log and avoids the O(n) memory cost of storing
 * per-request timestamps. The slight burst bias at window edges is acceptable
 * for the limits in this application.
 *
 * @param label   A unique identifier for the rate-limit bucket (e.g. "upload").
 * @param config  Max requests and window duration.
 * @param ip      Client IP (from X-Forwarded-For or socket).
 * @param sessionId  Optional session cookie value.
 */
export function checkRateLimit(
  label: string,
  config: RateLimitConfig,
  ip: string,
  sessionId: string | undefined,
): RateLimitResult {
  scheduleCleanup();

  const store = getStore(label);
  const key = buildKey(ip, sessionId);
  const now = Date.now();
  const windowStart = now - (now % config.windowMs); // snap to window edge

  let entry = store.get(key);
  if (!entry || entry.windowStart !== windowStart) {
    // New window (or first request) — reset counter.
    entry = { count: 1, windowStart };
    store.set(key, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      retryAfterSeconds: 0,
      limit: config.maxRequests,
    };
  }

  // Same window — check count.
  if (entry.count >= config.maxRequests) {
    const elapsed = now - entry.windowStart;
    const retryAfter = Math.ceil((config.windowMs - elapsed) / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: retryAfter,
      limit: config.maxRequests,
    };
  }

  entry.count += 1;

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterSeconds: 0,
    limit: config.maxRequests,
  };
}

/**
 * Pre-defined route configurations.
 *
 * Upload is expensive (CPU + LLM pipeline), checkout triggers Stripe calls,
 * job-match shells out to Python. Read-heavy endpoints like download and
 * general page loads get more generous limits.
 */
export type RateLimitLabel = "upload" | "checkout" | "jobMatch" | "download" | "general";

export const RATE_LIMITS: Record<RateLimitLabel, RateLimitConfig> = {
  upload: {
    maxRequests: 5,
    windowMs: 60_000,
    label: "upload",
  },

  checkout: {
    maxRequests: 3,
    windowMs: 60_000,
    label: "checkout",
  },

  jobMatch: {
    maxRequests: 10,
    windowMs: 60_000,
    label: "job-match",
  },

  download: {
    maxRequests: 10,
    windowMs: 60_000,
    label: "download",
  },

  /** Catch-all for unmatched API routes. */
  general: {
    maxRequests: 60,
    windowMs: 60_000,
    label: "general",
  },
};
