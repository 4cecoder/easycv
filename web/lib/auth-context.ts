/**
 * Server-side auth context system.
 *
 * Provides a typed, validated authentication context for every server-side
 * request (API routes, server actions, middleware).  The context is derived
 * SOLELY from the `cv_session` cookie — never from client-supplied form
 * fields, query params, or headers that could be forged.
 *
 * Usage:
 *   const ctx = await createAuthContext(request);
 *   if (!ctx.authenticated) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *   // ctx.account is now typed and validated.
 */

import type { NextRequest } from "next/server";

import type { Id } from "../convex/_generated/dataModel";
import {
  validateSession,
  requireValidSession,
  SessionValidationError,
  type ValidatedAccount,
  type SessionRejectionReason,
} from "./validate-session";
import { SESSION_COOKIE } from "./session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Base context available on ALL server-side requests, whether authenticated
 * or not.  Carries the raw sessionId for logging / audit even when the
 * session is invalid (useful for abuse detection).
 */
export interface BaseAuthContext {
  /** Raw sessionId from the cookie, or null if no cookie was present. */
  sessionId: string | null;
  /** Whether this context passed validation. */
  authenticated: boolean;
}

/**
 * Authenticated context — extends BaseAuthContext with validated account
 * information.  This is the type you get when `authenticated === true`.
 */
export interface AuthenticatedContext extends BaseAuthContext {
  authenticated: true;
  /** The validated account — guaranteed non-null when authenticated is true. */
  account: ValidatedAccount;
  /**
   * Convenience accessor for the account's Convex ID.
   * Avoids null-checks at every call site.
   */
  accountId: Id<"userAccounts">;
  /** Convenience accessor for the account's email. */
  email: string;
}

/**
 * Unauthenticated context — the session failed validation or was absent.
 * Carries the rejection reason for logging / error mapping.
 */
export interface UnauthenticatedContext extends BaseAuthContext {
  authenticated: false;
  /** Why validation failed — null if no cookie was present at all. */
  rejectionReason: SessionRejectionReason | null;
}

/**
 * Union type: narrow on `authenticated` to access account fields safely.
 *
 * if (ctx.authenticated) { ctx.account.email } // ok
 */
export type AuthContext = AuthenticatedContext | UnauthenticatedContext;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Create an auth context from a Next.js request.
 *
 * This is the primary entry point for server-side auth.  It:
 *   1. Extracts the session cookie from the request.
 *   2. Validates it against the Convex userAccounts table.
 *   3. Returns a typed context suitable for passing to server actions.
 *
 * Does NOT throw — returns an UnauthenticatedContext on failure so callers
 * can decide how to handle it (401, redirect, etc.).
 *
 * @param request - The incoming NextRequest (or any object with a `cookies` getter).
 * @returns A discriminated union AuthContext.
 */
export async function createAuthContext(
  request: Pick<NextRequest, "cookies">,
): Promise<AuthContext> {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? null;

  if (!sessionId) {
    return {
      sessionId: null,
      authenticated: false,
      rejectionReason: "missing_cookie",
    };
  }

  const result = await validateSession(sessionId);

  if (result.valid) {
    return {
      sessionId: result.sessionId,
      authenticated: true,
      account: result.account,
      accountId: result.account.accountId,
      email: result.account.email,
    };
  }

  return {
    sessionId: result.sessionId,
    authenticated: false,
    rejectionReason: result.reason,
  };
}

/**
 * Create an auth context that MUST be authenticated.  Throws if validation
 * fails, making it ideal for API routes where every request must be
 * authenticated (e.g., checkout, profile mutations).
 *
 * @param request - The incoming NextRequest.
 * @returns A fully validated AuthenticatedContext.
 * @throws {SessionValidationError} with structured rejection info.
 */
export async function requireAuthContext(
  request: Pick<NextRequest, "cookies">,
): Promise<AuthenticatedContext> {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    throw new SessionValidationError("missing_cookie", null);
  }

  const account = await requireValidSession(sessionId);
  return {
    sessionId,
    authenticated: true,
    account,
    accountId: account.accountId,
    email: account.email,
  };
}

// ---------------------------------------------------------------------------
// Auth-aware fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Create a Convex query/mutation caller that automatically includes the
 * validated sessionId.  This eliminates the pattern of passing `sessionId`
 * from client → server action → Convex, where each hop could be tampered
 * with.
 *
 * Usage:
 *   const ctx = await requireAuthContext(request);
 *   const caller = createAuthenticatedCaller(ctx);
 *   const uploads = await caller(api.uploads.listSessionUploads);
 *
 * The sessionId is injected from the VALIDATED context — never from the
 * client request directly.
 */
export function createAuthenticatedCaller(ctx: AuthenticatedContext) {
  return {
    /**
     * The validated sessionId — safe to pass to Convex queries/mutations
     * that require session-based ownership checks.
     */
    sessionId: ctx.sessionId,
    /** Convenience: the account's Convex ID. */
    accountId: ctx.accountId,
    /** Convenience: the account's email. */
    email: ctx.email,
  };
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map a SessionValidationError to a user-friendly JSON response shape
 * suitable for Next.js API routes.
 *
 * @param error - The caught SessionValidationError.
 * @returns A { error, status } tuple for NextResponse.json.
 */
export function sessionErrorToResponse(error: SessionValidationError): {
  error: string;
  status: number;
} {
  return {
    error: error.message,
    status: error.toHttpStatus(),
  };
}

/**
 * Map an UnauthenticatedContext to a response tuple.  Use when the context
 * indicates the request is not authenticated.
 *
 * @param ctx - An UnauthenticatedContext.
 * @returns A { error, status } tuple for NextResponse.json.
 */
export function unauthenticatedResponse(ctx: UnauthenticatedContext): {
  error: string;
  status: number;
} {
  const messages: Record<SessionRejectionReason, string> = {
    missing_cookie: "No session cookie provided. Please log in.",
    empty_session_id: "Invalid session. Please log in again.",
    account_not_found: "Session expired or account not found. Please log in.",
    account_not_verified:
      "Account not verified. Please check your email for a verification code.",
    session_mismatch: "Session mismatch. Please log in again.",
    convex_error:
      "Authentication service temporarily unavailable. Please try again.",
  };
  const reason = ctx.rejectionReason ?? "account_not_found";
  return {
    error: messages[reason],
    status: reason === "convex_error" ? 503 : 401,
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Type guard: narrows AuthContext to AuthenticatedContext.
 *
 * Usage:
 *   const ctx = await createAuthContext(request);
 *   if (isAuthenticated(ctx)) {
 *     console.log(ctx.account.email); // safe
 *   }
 */
export function isAuthenticated(
  ctx: AuthContext,
): ctx is AuthenticatedContext {
  return ctx.authenticated;
}

/**
 * Type guard: narrows AuthContext to UnauthenticatedContext.
 */
export function isUnauthenticated(
  ctx: AuthContext,
): ctx is UnauthenticatedContext {
  return !ctx.authenticated;
}
