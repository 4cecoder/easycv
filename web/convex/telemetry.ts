import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload, requireOwnerSession } from "./authz";

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
    const owner = await requireOwnerSession(ctx, args.sessionId);
    if (args.uploadId && !(await ownedUpload(ctx.db, args.uploadId, owner))) throw new Error("Unauthorized");
    return await ctx.db.insert("deviceTelemetry", {
      ...args,
      sessionId: owner,
      timestamp: Date.now(),
    });
  },
});

export const getSessionTelemetry = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    return await ctx.db
      .query("deviceTelemetry")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .order("desc")
      .take(10);
  },
});
