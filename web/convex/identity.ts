import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload, ownerSessionKey, requireOwnerSession } from "./authz";

export const getOwnerSessionKey = query({
  args: {},
  handler: async (ctx) => ownerSessionKey(ctx),
});

/**
 * Bind the current Seridian subject to its exact pre-cutover owner key. The
 * browser-held legacy session is a bearer credential: possession must match
 * the verified account row's current sessionId exactly. Email alone never
 * locates or authorizes a legacy record. Convex mutation serialization makes
 * competing first binds atomic; an existing subject binding is immutable.
 */
export const bindLegacyAccount = mutation({
  args: { legacySessionId: v.string() },
  handler: async (ctx, { legacySessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const claims = identity as typeof identity & { email_verified?: boolean };
    const subject = identity.subject.trim();
    const email = identity.email?.trim().toLowerCase();
    if (!subject || claims.email_verified !== true || !email) {
      throw new Error("A verified Seridian identity is required");
    }
    // The retired OTP endpoint used this shared fallback when callers omitted
    // the browser cookie. It is not proof of possession of a unique owner key.
    if (!legacySessionId.trim() || legacySessionId === "default_session") {
      throw new Error("Legacy session proof is invalid");
    }

    const existingForSubject = await ctx.db
      .query("userAccounts")
      .withIndex("by_seridianSubject", (q) => q.eq("seridianSubject", subject))
      .unique();
    if (existingForSubject) {
      if (!existingForSubject.verified) throw new Error("Legacy account is not verified");
      return existingForSubject.sessionId;
    }

    const account = await ctx.db
      .query("userAccounts")
      .withIndex("by_session", (q) => q.eq("sessionId", legacySessionId))
      .unique();
    if (!account || !account.verified || account.email.trim().toLowerCase() !== email) {
      throw new Error("Legacy session proof does not match a verified account");
    }
    if (account.seridianSubject && account.seridianSubject !== subject) {
      throw new Error("Legacy account is already bound to another Seridian identity");
    }

    await ctx.db.patch(account._id, { seridianSubject: subject });
    return account.sessionId;
  },
});

/**
 * Bind a legacy account to the current Seridian subject. The caller must know
 * the legacy session key and present a provider-asserted verified email that
 * matches the legacy account. Convex mutations are serializable, so concurrent
 * first binds cannot replace this subject or bind one subject to two accounts.
 */
/**
 * Silent identity resolution — links devices to a single person.
 *
 * Every row represents a device. The identityId groups all devices
 * belonging to the same person. We never expose this to the user.
 */
export const linkDevice = mutation({
  args: {
    deviceHash: v.string(),
    sessionId: v.string(),
    // Device metadata for cross-device analytics
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    tier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionId);
    const identity = await ctx.auth.getUserIdentity();
    const claims = identity as (NonNullable<typeof identity> & { email_verified?: boolean }) | null;
    const verifiedEmail = identity?.email && claims?.email_verified === true
      ? identity.email.trim().toLowerCase()
      : undefined;
    // Upsert by deviceHash — one row per device
    const existing = await ctx.db
      .query("deviceIdentities")
      .withIndex("by_device", (q) => q.eq("deviceHash", args.deviceHash))
      .first();

    if (existing) {
      if (existing.sessionId !== owner) throw new Error("Unauthorized");
      await ctx.db.patch(existing._id, {
        identityId: owner,
        sessionId: owner,
        email: verifiedEmail,
        lastSeenAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("deviceIdentities", {
      deviceHash: args.deviceHash,
      sessionId: owner,
      identityId: owner,
      email: verifiedEmail,
      browser: args.browser,
      os: args.os,
      tier: args.tier,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  },
});

/**
 * Get all devices belonging to one person (for cross-device analytics).
 */
export const getDevicesForIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identityId = await ownerSessionKey(ctx);
    return await ctx.db
      .query("deviceIdentities")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .collect();
  },
});

/**
 * Record a silent identity event (upload, preview, checkout, etc.)
 */
export const recordIdentityEvent = mutation({
  args: {
    sessionId: v.string(),
    deviceHash: v.string(),
    event: v.string(),
    uploadId: v.optional(v.id("uploads")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, uploadId, ...args }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    if (uploadId && !(await ownedUpload(ctx.db, uploadId, owner))) throw new Error("Unauthorized");
    return await ctx.db.insert("identityEvents", {
      ...args,
      identityId: owner,
      uploadId,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get all events for a device (for building user journey timeline).
 */
export const getEventsForDevice = query({
  args: {},
  handler: async (ctx) => {
    const identityId = await ownerSessionKey(ctx);
    return await ctx.db
      .query("identityEvents")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .order("desc")
      .take(50);
  },
});

/**
 * Get all events for an identity (cross-device journey).
 */
export const getEventsForIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identityId = await ownerSessionKey(ctx);
    return await ctx.db
      .query("identityEvents")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .order("desc")
      .take(50);
  },
});
