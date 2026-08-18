import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createOrGetAccount = mutation({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, { email, sessionId }) => {
    const cleanEmail = email.trim().toLowerCase();
    // Generate 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    const existing = await ctx.db
      .query("userAccounts")
      .withIndex("by_email", (q) => q.eq("email", cleanEmail))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId,
        verificationCode,
        codeExpiresAt,
        lastLoginAt: Date.now(),
      });
      return {
        accountId: existing._id,
        email: cleanEmail,
        verificationCode,
        isNew: false,
      };
    }

    const accountId = await ctx.db.insert("userAccounts", {
      email: cleanEmail,
      sessionId,
      verified: false,
      verificationCode,
      codeExpiresAt,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    return {
      accountId,
      email: cleanEmail,
      verificationCode,
      isNew: true,
    };
  },
});

export const verifyCode = mutation({
  args: {
    email: v.string(),
    code: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, { email, code, sessionId }) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const account = await ctx.db
      .query("userAccounts")
      .withIndex("by_email", (q) => q.eq("email", cleanEmail))
      .first();

    if (!account) {
      return { success: false, error: "Account not found with this email." };
    }

    if (!account.verificationCode || account.verificationCode !== cleanCode) {
      return { success: false, error: "Invalid verification code. Please check your inbox." };
    }

    if (account.codeExpiresAt && Date.now() > account.codeExpiresAt) {
      return { success: false, error: "Verification code has expired. Please request a new one." };
    }

    await ctx.db.patch(account._id, {
      verified: true,
      sessionId,
      verificationCode: undefined,
      codeExpiresAt: undefined,
      lastLoginAt: Date.now(),
    });

    return { success: true, email: cleanEmail };
  },
});

export const getAccountBySession = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    if (!sessionId) return null;
    const account = await ctx.db
      .query("userAccounts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!account || !account.verified) return null;
    return {
      email: account.email,
      verified: account.verified,
      createdAt: account.createdAt,
    };
  },
});
