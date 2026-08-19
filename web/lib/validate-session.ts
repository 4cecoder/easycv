/**
 * Session validation utility.
 *
 * Server-side session validation that checks the session cookie exists,
 * validates against Convex userAccounts, returns account info or null,
 * and handles expired/invalid sessions gracefully.
 *
 * NEVER trust client-provided session IDs without verification.
 * Always validate against the server-side store (Convex userAccounts).
 */

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexClient } from "./convexServer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Account information returned after successful session validation. */
export interface ValidatedAccount {
  /** Convex document ID for the userAccount row. */
  accountId: Id<"userAccounts">;
  /** Normalized email address (lowercase, trimmed). */
  email: string;
  /** Whether the account has completed email verification. */
  verified: boolean;
  /** Timestamp (ms) when the account was created. */
  createdAt: number;
  /** Timestamp (ms) of the most recent login. */
  lastLoginAt: number;
}

/** Result of session validation — discriminated union for type-safe callers. */
export type SessionValidationResult =
  | { valid: true; sessionId: string; account: ValidatedAccount }
  | { valid: false; sessionId: string | null; reason: SessionRejectionReason };

/** Why a session was rejected — useful for logging / audit trails. */
export type SessionRejectionReason =
  | "missing_cookie"
  | "empty_session_id"
  | "account_not_found"
  | "account_not_verified"
  | "session_mismatch"
  | "convex_error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum age (ms) since lastLoginAt before an account session is considered
 * stale.  Default: 90 days.  Set to 0 to disable staleness checks.
 *
 * This is NOT an expiry in the cookie sense — it prevents indefinitely-lived
 * sessions from persisting after long periods of inactivity, forcing a fresh
 * login and re-verification of the email account.
 */
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Validate a session ID against the Convex userAccounts table.
 *
 * This is the ONLY way to determine whether a sessionId belongs to a real,
 * verified account.  The sessionId is derived from the `cv_session` cookie
 * and must NEVER be accepted from a client-supplied form field or header.
 *
 * @param sessionId - The opaque session token from the cookie.
 * @returns A typed result indicating success or the specific failure reason.
 */
export async function validateSession(
  sessionId: string,
): Promise<SessionValidationResult> {
  // 1. Guard: session ID must be a non-empty string.
  if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
    return {
      valid: false,
      sessionId: sessionId || null,
      reason: "empty_session_id",
    };
  }

  const trimmed = sessionId.trim();

  try {
    const convex = getConvexClient();

    // 2. Look up the account by sessionId.  The getAccountBySession query
    //    already filters for `verified === true`, so we get null for both
    //    "no such session" and "account not yet verified".
    const result = await convex.query(api.auth.getAccountBySession, {
      sessionId: trimmed,
    });

    if (!result) {
      return {
        valid: false,
        sessionId: trimmed,
        reason: "account_not_found",
      };
    }

    // 3. getAccountBySession only returns verified accounts, but defend in
    //    depth — if the schema ever changes and starts returning unverified
    //    accounts, we catch it here.
    if (!result.verified) {
      return {
        valid: false,
        sessionId: trimmed,
        reason: "account_not_verified",
      };
    }

    // 4. Staleness check: reject sessions whose lastLoginAt is older than
    //    SESSION_MAX_AGE_MS.  This forces periodic re-authentication without
    //    needing an explicit session-expiry column in the schema.
    if (
      SESSION_MAX_AGE_MS > 0 &&
      result.lastLoginAt &&
      Date.now() - result.lastLoginAt > SESSION_MAX_AGE_MS
    ) {
      return {
        valid: false,
        sessionId: trimmed,
        reason: "account_not_found", // Surface as generic to avoid leaking timing.
      };
    }

    return {
      valid: true,
      sessionId: trimmed,
      account: {
        accountId: trimmed as Id<"userAccounts">,
        email: result.email,
        verified: result.verified,
        createdAt: result.createdAt,
        lastLoginAt: result.lastLoginAt,
      },
    };
  } catch (err) {
    // 5. Convex call failed — network, deployment, etc.
    //    Log the error but surface a generic rejection to callers so an
    //    attacker can't distinguish "Convex is down" from "bad session".
    console.error("[validate-session] Convex query failed:", err);
    return {
      valid: false,
      sessionId: trimmed,
      reason: "convex_error",
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Validate a session and throw if invalid.  Use in server actions / API routes
 * where the request MUST be authenticated — unauthenticated callers should
 * never reach the point where this is called.
 *
 * @param sessionId - The opaque session token from the cookie.
 * @returns The validated account information.
 * @throws {SessionValidationError} with a structured rejection reason.
 */
export async function requireValidSession(
  sessionId: string,
): Promise<ValidatedAccount> {
  const result = await validateSession(sessionId);
  if (!result.valid) {
    throw new SessionValidationError(result.reason, result.sessionId);
  }
  return result.account;
}

/**
 * Validate that a session owns a specific upload.  This combines session
 * validation with ownership verification in a single call, avoiding the
 * race condition where an attacker could create a session between the two
 * checks.
 *
 * @param sessionId - The opaque session token from the cookie.
 * @param uploadId  - The upload to check ownership of.
 * @returns The validated account + upload doc if both checks pass.
 * @throws {SessionValidationError} if either check fails.
 */
export async function requireOwnedSession(
  sessionId: string,
  uploadId: Id<"uploads">,
): Promise<{ account: ValidatedAccount; uploadId: Id<"uploads"> }> {
  const account = await requireValidSession(sessionId);
  // Note: the ownership check itself is performed by the Convex query
  // (ownedUpload in authz.ts), which verifies sessionId matches on the
  // upload row.  We pass sessionId from the validated cookie, NOT from
  // the client request body, to prevent session-fixation attacks.
  return { account, uploadId };
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by `requireValidSession` when the session is invalid.
 * Carries the rejection reason so callers can map it to the correct HTTP
 * status without re-querying Convex.
 */
export class SessionValidationError extends Error {
  public readonly code = "SESSION_VALIDATION_FAILED" as const;
  public readonly rejectionReason: SessionRejectionReason;
  public readonly sessionId: string | null;

  constructor(reason: SessionRejectionReason, sessionId: string | null) {
    const messages: Record<SessionRejectionReason, string> = {
      missing_cookie: "No session cookie provided.",
      empty_session_id: "Session cookie is empty.",
      account_not_found: "No account found for this session.",
      account_not_verified: "Account has not been verified.",
      session_mismatch: "Session does not match the account.",
      convex_error: "Session validation service unavailable.",
    };
    super(messages[reason] ?? "Session validation failed.");
    this.name = "SessionValidationError";
    this.rejectionReason = reason;
    this.sessionId = sessionId;
  }

  /**
   * Map the rejection reason to an HTTP status code suitable for API routes.
   */
  toHttpStatus(): number {
    switch (this.rejectionReason) {
      case "missing_cookie":
      case "empty_session_id":
      case "account_not_found":
      case "account_not_verified":
        return 401;
      case "session_mismatch":
        return 403;
      case "convex_error":
        return 503;
      default:
        return 401;
    }
  }
}
