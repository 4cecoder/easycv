/**
 * Admin session management.
 *
 * Admin sessions use a signed cookie separate from the user session.
 * The password is exchanged once for a short-lived session token.
 * All admin API routes MUST call requireAdmin() to verify.
 */

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "cv_admin_session";
export const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

// In-memory session store (resets on cold start — acceptable for single-admin)
const adminSessions = new Map<string, { createdAt: number; ip?: string }>();

function signToken(token: string): string {
  const secret = process.env.ADMIN_PASSWORD || "admin123";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Create an admin session after password verification.
 * Returns the session token to set as a cookie.
 */
export function createAdminSession(clientIp?: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const signature = signToken(token);
  adminSessions.set(signature, { createdAt: Date.now(), ip: clientIp });
  return signature;
}

/**
 * Verify an admin session token.
 * Returns true if the session is valid and not expired.
 */
export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const session = adminSessions.get(token);
  if (!session) return false;
  const ageMs = Date.now() - session.createdAt;
  if (ageMs > ADMIN_SESSION_MAX_AGE * 1000) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * Build the Set-Cookie header for the admin session.
 */
export function buildAdminCookie(token: string): string {
  return [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    `Path=/`,
    `Max-Age=${ADMIN_SESSION_MAX_AGE}`,
    `SameSite=lax`,
    `HttpOnly`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Extract admin session from request cookies.
 */
export function extractAdminSession(request: NextRequest): string | null {
  return request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

/**
 * Require a valid admin session. Returns null on success, or a NextResponse on failure.
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const { NextResponse } = await import("next/server");
  const token = extractAdminSession(request);
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // null = OK, continue
}
