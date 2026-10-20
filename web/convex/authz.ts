import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

/** Resolve the stable app owner key from a verified Seridian identity. */
export async function ownerSessionKey(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  // Legacy ownership is available only after the account has been explicitly
  // bound to this immutable Seridian subject. Email is deliberately not an
  // ownership key: addresses can be recycled or reassigned.
  const account = await ctx.db
    .query("userAccounts")
    .withIndex("by_seridianSubject", (q) => q.eq("seridianSubject", identity.subject))
    .unique();
  return account?.sessionId ?? identity.tokenIdentifier;
}

/** Require auth and reject stale or caller-forged legacy session arguments. */
export async function requireOwnerSession(ctx: AuthCtx, sessionId: string): Promise<string> {
  const owner = await ownerSessionKey(ctx);
  if (sessionId !== owner) throw new Error("Unauthorized");
  return owner;
}

/** Admin access is a server-configured verified-email allowlist, never a JWT role or client passcode. */
export async function requireAdmin(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  const claims = identity as (NonNullable<typeof identity> & { email_verified?: boolean }) | null;
  if (!identity || claims?.email_verified !== true || !identity.email) {
    throw new Error("Unauthorized");
  }
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const email = identity.email.trim().toLowerCase();
  if (allowed.length === 0 || !allowed.includes(email)) throw new Error("Unauthorized");
  return email;
}

// Every uploadId-scoped read must also check the authenticated caller's
// canonical owner key against the sessionId stored on that upload --
// The public handlers additionally verify that the caller-provided legacy
// session argument equals ownerSessionKey(ctx). Otherwise any client holding another user's uploadId (visible in the
// /preview/[uploadId] URL, referrer headers, browser history, etc.) could
// read that user's data directly through the public Convex deployment URL
// (NEXT_PUBLIC_CONVEX_URL is public, so Convex functions are reachable
// straight from browser devtools), bypassing whatever gating the Next.js
// routes do.
//
// Returns null for both "no such upload" and "wrong owner" so callers
// can't use the response shape to probe for the existence of an uploadId
// they don't own.
export async function ownedUpload(
  db: GenericDatabaseReader<DataModel>,
  uploadId: Id<"uploads">,
  sessionId: string,
): Promise<Doc<"uploads"> | null> {
  const upload = await db.get(uploadId);
  if (!upload || upload.sessionId !== sessionId) return null;
  return upload;
}
