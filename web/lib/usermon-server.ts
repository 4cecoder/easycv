/**
 * UserMon Server-side helper for tracing Next.js API Routes.
 *
 * Measures duration, captures HTTP status, records exceptions,
 * and tracks the API span in UserMon telemetry.
 */

import { NextRequest, NextResponse } from "next/server";
import { usermon, USERMON_RELEASE } from "./usermon";

/**
 * Wraps a Next.js App Router route handler with UserMon API span telemetry and exception tracking.
 *
 * @param routeName - Logical route identifier (e.g. "/api/upload").
 * @param handler - The async route handler function.
 */
export function withUserMonSpan<T extends (...args: any[]) => Promise<Response>>(
  routeName: string,
  handler: T,
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    const start = Date.now();
    const req = args[0] as NextRequest | Request | undefined;
    const method = req?.method || "GET";

    try {
      const response = await handler(...args);
      const durationMs = Math.max(1, Date.now() - start);

      usermon.trackApiSpan({
        method,
        route: routeName,
        status: response.status,
        durationMs,
        platform: "web",
        timestamp: Date.now(),
      });

      return response;
    } catch (err: unknown) {
      const durationMs = Math.max(1, Date.now() - start);

      usermon.trackApiSpan({
        method,
        route: routeName,
        status: 500,
        durationMs,
        platform: "web",
        timestamp: Date.now(),
      });

      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      usermon.trackException({
        message,
        stack,
        platform: "web",
        timestamp: Date.now(),
        context: { route: routeName, method },
      });

      throw err;
    }
  }) as T;
}
