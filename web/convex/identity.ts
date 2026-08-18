import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    identityId: v.string(),
    email: v.optional(v.string()),
    // Device metadata for cross-device analytics
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    tier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Upsert by deviceHash — one row per device
    const existing = await ctx.db
      .query("deviceIdentities")
      .withIndex("by_device", (q) => q.eq("deviceHash", args.deviceHash))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        identityId: args.identityId,
        email: args.email ?? existing.email,
        lastSeenAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("deviceIdentities", {
      ...args,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  },
});

/**
 * Get all devices belonging to one person (for cross-device analytics).
 */
export const getDevicesForIdentity = query({
  args: { identityId: v.string() },
  handler: async (ctx, { identityId }) => {
    return await ctx.db
      .query("deviceIdentities")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .collect();
  },
});

/**
 * Look up identity by email (silently, for cross-device linking).
 */
export const getIdentityByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.toLowerCase().trim();
    return await ctx.db
      .query("deviceIdentities")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
  },
});

/**
 * Record a silent identity event (upload, preview, checkout, etc.)
 */
export const recordIdentityEvent = mutation({
  args: {
    deviceHash: v.string(),
    event: v.string(),
    uploadId: v.optional(v.id("uploads")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("identityEvents", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get all events for a device (for building user journey timeline).
 */
export const getEventsForDevice = query({
  args: { deviceHash: v.string() },
  handler: async (ctx, { deviceHash }) => {
    return await ctx.db
      .query("identityEvents")
      .withIndex("by_device", (q) => q.eq("deviceHash", deviceHash))
      .order("desc")
      .take(50);
  },
});

/**
 * Get all events for an identity (cross-device journey).
 */
export const getEventsForIdentity = query({
  args: { identityId: v.string() },
  handler: async (ctx, { identityId }) => {
    // First find all devices for this identity
    const devices = await ctx.db
      .query("deviceIdentities")
      .withIndex("by_identity", (q) => q.eq("identityId", identityId))
      .collect();

    const deviceHashes = devices.map((d) => d.deviceHash);
    const allEvents = [];

    for (const hash of deviceHashes) {
      const events = await ctx.db
        .query("identityEvents")
        .withIndex("by_device", (q) => q.eq("deviceHash", hash))
        .order("desc")
        .take(20);
      allEvents.push(...events);
    }

    // Sort by timestamp descending
    return allEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  },
});
