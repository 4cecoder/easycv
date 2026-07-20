import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createPaymentRecord = mutation({
  args: {
    uploadId: v.id("uploads"),
    stripeSessionId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("payments", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
      downloadCount: 0,
    });
  },
});

// Looks up by the by_stripe_session index (the webhook handler's lookup key),
// marks the payment paid, and mints a fresh downloadToken. A downloadToken is
// ONLY ever set here — never on creation — so its mere presence implies paid.
export const markPaymentPaid = mutation({
  args: {
    stripeSessionId: v.string(),
  },
  handler: async (ctx, { stripeSessionId }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_stripe_session", (q) =>
        q.eq("stripeSessionId", stripeSessionId),
      )
      .first();
    if (!payment) {
      throw new Error(
        `No payment found for stripeSessionId ${stripeSessionId}`,
      );
    }

    const downloadToken = crypto.randomUUID();
    await ctx.db.patch(payment._id, {
      status: "paid",
      paidAt: Date.now(),
      downloadToken,
    });
    return downloadToken;
  },
});

export const incrementDownloadCount = mutation({
  args: {
    downloadToken: v.string(),
  },
  handler: async (ctx, { downloadToken }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_download_token", (q) =>
        q.eq("downloadToken", downloadToken),
      )
      .first();
    if (!payment) {
      throw new Error(`No payment found for downloadToken ${downloadToken}`);
    }
    await ctx.db.patch(payment._id, {
      downloadCount: payment.downloadCount + 1,
    });
    return payment.downloadCount + 1;
  },
});

export const getPaymentStatus = query({
  args: {
    uploadId: v.id("uploads"),
  },
  handler: async (ctx, { uploadId }) => {
    const payment = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("uploadId"), uploadId))
      .first();
    if (!payment) return { paid: false, downloadToken: null };
    return {
      paid: payment.status === "paid",
      downloadToken: payment.downloadToken ?? null,
    };
  },
});

// The download gate: returns null unless the payment backing this token is
// actually "paid". Callers (web-mvp-payment-gate) must treat null as a hard
// 404/402 — never trust a client-supplied "paid" flag instead of this lookup.
export const getByDownloadToken = query({
  args: {
    downloadToken: v.string(),
  },
  handler: async (ctx, { downloadToken }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_download_token", (q) =>
        q.eq("downloadToken", downloadToken),
      )
      .first();
    if (!payment || payment.status !== "paid") return null;

    const upload = await ctx.db.get(payment.uploadId);
    return { payment, upload: upload ?? null };
  },
});
