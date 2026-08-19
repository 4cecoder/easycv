import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Admin-only mutation to save/update a third-party integration.
 * Called from the superadmin dashboard when connecting services.
 */
export const setIntegration = mutation({
  args: {
    passcode: v.string(),
    provider: v.string(),
    config: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { passcode, provider, config }) => {
    const correct = process.env.ADMIN_PASSWORD || "admin123";
    if (passcode !== correct) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        config,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("integrations", {
        provider,
        config,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Read an integration config (admin-only).
 */
export const getIntegration = query({
  args: {
    passcode: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, { passcode, provider }) => {
    const correct = process.env.ADMIN_PASSWORD || "admin123";
    if (passcode !== correct) return null;

    return await ctx.db
      .query("integrations")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .first();
  },
});

/**
 * List all configured integrations (admin-only).
 */
export const listIntegrations = query({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }) => {
    const correct = process.env.ADMIN_PASSWORD || "admin123";
    if (passcode !== correct) return [];

    return await ctx.db.query("integrations").collect();
  },
});
