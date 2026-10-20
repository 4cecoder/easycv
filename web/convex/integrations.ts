import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./authz";

/**
 * Admin-only mutation to save/update a third-party integration.
 * Called from the superadmin dashboard when connecting services.
 */
export const setIntegration = mutation({
  args: {
    provider: v.string(),
    config: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { provider, config }) => {
    const adminEmail = await requireAdmin(ctx);

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        config,
        updatedBy: adminEmail,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("integrations", {
        provider,
        config,
        updatedBy: adminEmail,
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
    provider: v.string(),
  },
  handler: async (ctx, { provider }) => {
    await requireAdmin(ctx);

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
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db.query("integrations").collect();
  },
});
