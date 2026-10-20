import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "./authz";

export const createOrGetAccount = mutation({
  args: {},
  handler: async () => {
    throw new Error("Local OTP authentication is disabled. Sign in with Seridian Auth.");
  },
});

export const verifyCode = mutation({
  args: {},
  handler: async () => {
    throw new Error("Local OTP authentication is disabled. Sign in with Seridian Auth.");
  },
});

export const getAccountBySession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const owner = await requireOwnerSession(ctx, sessionId);
    const account = await ctx.db
      .query("userAccounts")
      .withIndex("by_session", (q) => q.eq("sessionId", owner))
      .first();

    if (!account || !account.verified) return null;
    return {
      email: account.email,
      verified: account.verified,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
    };
  },
});
