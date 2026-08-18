import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Silent behavior scorer — updates trust score after each meaningful action.
 * Never shown to user. Used for rate limiting and abuse detection.
 */
export const updateBehaviorScore = mutation({
  args: {
    sessionId: v.string(),
    deviceHash: v.string(),
    identityId: v.optional(v.string()),
    action: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find or create score row
    let score = await ctx.db
      .query("userBehaviorScore")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!score) {
      const id = await ctx.db.insert("userBehaviorScore", {
        sessionId: args.sessionId,
        deviceHash: args.deviceHash,
        identityId: args.identityId,
        trustScore: 50, // start neutral
        contentScore: 50,
        engagementScore: 10,
        totalUploads: 0,
        totalDownloads: 0,
        rapidActionCount: 0,
        suspiciousActionCount: 0,
        averageUploadQuality: 0,
        flagged: false,
        firstSeenAt: now,
        lastActiveAt: now,
        totalSessionDuration: 0,
      });
      score = (await ctx.db.get(id))!;
    }

    const patch: Record<string, any> = { lastActiveAt: now };

    // Score adjustments per action type
    switch (args.action) {
      case "file_upload": {
        patch.totalUploads = (score.totalUploads || 0) + 1;
        // Good content boosts trust
        const quality = args.meta?.qualityScore ?? 50;
        const avg = score.averageUploadQuality || 0;
        const count = score.totalUploads || 0;
        patch.averageUploadQuality = (avg * count + quality) / (count + 1);
        patch.contentScore = Math.min(100, (score.contentScore || 50) + 2);
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 5);
        break;
      }
      case "download":
        patch.totalDownloads = (score.totalDownloads || 0) + 1;
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 3);
        break;
      case "checkout_done":
        // Paying users get a big trust boost
        patch.trustScore = Math.min(100, (score.trustScore || 50) + 20);
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 10);
        break;
      case "preview_open":
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 1);
        break;
      case "wizard_step":
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 2);
        break;
      case "sample_load":
        // Loading samples is normal exploration
        patch.engagementScore = Math.min(100, (score.engagementScore || 10) + 1);
        break;
    }

    // Detect rapid-fire abuse
    if (args.meta?.rapidFire) {
      patch.rapidActionCount = (score.rapidActionCount || 0) + 1;
      patch.trustScore = Math.max(0, (score.trustScore || 50) - 5);
    }

    // Detect suspicious patterns
    if (args.meta?.suspicious) {
      patch.suspiciousActionCount = (score.suspiciousActionCount || 0) + 1;
      patch.trustScore = Math.max(0, (score.trustScore || 50) - 10);

      // Auto-flag after 3 suspicious actions
      if ((score.suspiciousActionCount || 0) + 1 >= 3) {
        patch.flagged = true;
        patch.flagReason = "multiple_suspicious_actions";
      }
    }

    // Decay trust for inactive users (normalizes over time)
    const hoursSinceFirst = (now - (score.firstSeenAt || now)) / 3600000;
    if (hoursSinceFirst > 24 && (score.totalUploads || 0) === 0) {
      patch.trustScore = Math.max(20, (score.trustScore || 50) - 1);
    }

    // Compute composite trust from components
    const trust = patch.trustScore ?? score.trustScore ?? 50;
    const content = patch.contentScore ?? score.contentScore ?? 50;
    const engagement = patch.engagementScore ?? score.engagementScore ?? 10;
    patch.trustScore = Math.round(trust * 0.6 + content * 0.3 + engagement * 0.1);

    await ctx.db.patch(score._id, patch);
    return score._id;
  },
});

/**
 * Get trust score for a session (for rate limiting / abuse checks).
 */
export const getTrustScore = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("userBehaviorScore")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});

/**
 * Get all flagged users (for abuse dashboard).
 */
export const getFlaggedUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("userBehaviorScore")
      .withIndex("by_trust", (q) => q.lt("trustScore", 30))
      .collect();
  },
});

/**
 * Get top trusted users (for priority handling).
 */
export const getTrustedUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("userBehaviorScore")
      .withIndex("by_trust", (q) => q.gte("trustScore", 80))
      .order("desc")
      .take(50);
  },
});
