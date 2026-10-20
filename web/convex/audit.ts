import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload, ownerSessionKey, requireAdmin, requireOwnerSession } from "./authz";

/**
 * Silent audit logger — records every user action.
 * Called from client-side analytics. No user-visible effects.
 */
export const logAction = mutation({
  args: {
    sessionId: v.string(),
    deviceHash: v.string(),
    identityId: v.optional(v.string()),
    uploadId: v.optional(v.id("uploads")),
    action: v.string(),
    target: v.optional(v.string()),
    meta: v.optional(v.any()),
    clientTimestamp: v.number(),
    rapidFire: v.optional(v.boolean()),
    suspicious: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionId);
    if (args.uploadId && !(await ownedUpload(ctx.db, args.uploadId, owner))) throw new Error("Unauthorized");
    return await ctx.db.insert("auditLog", {
      ...args,
      sessionId: owner,
      identityId: owner,
      serverTimestamp: Date.now(),
    });
  },
});

/**
 * Batch log — multiple actions in one call (for queued events on page unload).
 */
export const logActions = mutation({
  args: {
    actions: v.array(v.object({
      sessionId: v.string(),
      deviceHash: v.string(),
      identityId: v.optional(v.string()),
      uploadId: v.optional(v.id("uploads")),
      action: v.string(),
      target: v.optional(v.string()),
      meta: v.optional(v.any()),
      clientTimestamp: v.number(),
      rapidFire: v.optional(v.boolean()),
      suspicious: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, { actions }) => {
    const owner = await ownerSessionKey(ctx);
    const now = Date.now();
    const ids = [];
    for (const a of actions) {
      if (a.sessionId !== owner) throw new Error("Unauthorized");
      if (a.uploadId && !(await ownedUpload(ctx.db, a.uploadId, owner))) throw new Error("Unauthorized");
      ids.push(await ctx.db.insert("auditLog", { ...a, sessionId: owner, identityId: owner, serverTimestamp: now }));
    }
    return ids;
  },
});

/**
 * Get full audit trail for a session.
 */
export const getSessionAudit = query({
  args: { sessionId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { sessionId, limit }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    return await ctx.db
      .query("auditLog")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .order("desc")
      .take(limit ?? 100);
  },
});

/**
 * Get all activity for an identity across all devices.
 */
export const getIdentityAudit = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const identityId = await ownerSessionKey(ctx);
    return await ctx.db
      .query("auditLog")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .order("desc")
      .take(limit ?? 200);
  },
});

/**
 * Get suspicious actions across all users (for abuse dashboard).
 */
export const getSuspiciousActions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const recent = await ctx.db
      .query("auditLog")
      .withIndex("by_action", (q) => q.gte("action", "a"))
      .order("desc")
      .take(limit ?? 500);

    return recent.filter((r) => r.suspicious || r.rapidFire);
  },
});

/**
 * Count actions per session in a time window (for rate limiting).
 */
export const countRecentActions = query({
  args: { sessionId: v.string(), windowMs: v.number() },
  handler: async (ctx, { sessionId, windowMs }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    const cutoff = Date.now() - windowMs;
    const actions = await ctx.db
      .query("auditLog")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .collect();

    return actions.filter((a) => a.serverTimestamp > cutoff).length;
  },
});
