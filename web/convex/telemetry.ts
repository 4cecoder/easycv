import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordDeviceTelemetry = mutation({
  args: {
    sessionId: v.string(),
    uploadId: v.optional(v.id("uploads")),
    browser: v.string(),
    browserVersion: v.string(),
    os: v.string(),
    osVersion: v.string(),
    language: v.string(),
    timezone: v.string(),
    cores: v.number(),
    memoryGb: v.number(),
    gpuRenderer: v.string(),
    platform: v.string(),
    screenWidth: v.number(),
    screenHeight: v.number(),
    pixelRatio: v.number(),
    touchSupport: v.boolean(),
    webgl: v.boolean(),
    webgpu: v.boolean(),
    tier: v.string(),
    connectionType: v.string(),
    downlink: v.number(),
    processingTimeMs: v.optional(v.number()),
    fileCount: v.optional(v.number()),
    fileTypes: v.optional(v.array(v.string())),
    totalSizeKb: v.optional(v.number()),
    reachedPreview: v.optional(v.boolean()),
    reachedCheckout: v.optional(v.boolean()),
    paid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deviceTelemetry", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const getSessionTelemetry = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    if (!sessionId) return [];
    return await ctx.db
      .query("deviceTelemetry")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(10);
  },
});
