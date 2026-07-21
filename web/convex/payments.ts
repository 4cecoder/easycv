import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ownedUpload } from "./authz";

// uploadId is visible in the /preview/[uploadId] URL (see convex/authz.ts),
// so -- like every other uploadId-scoped write/read in this codebase --
// this must take the caller's sessionId and verify ownership via
// ownedUpload before attaching a payment (and eventually a downloadToken)
// to that upload. Without this, anyone who obtains another user's uploadId
// could pay Stripe themselves but attach the payment to the VICTIM's
// uploadId, and the resulting downloadToken would unlock the victim's PDF
// for the attacker.
export const createPaymentRecord = mutation({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
    stripeSessionId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, { sessionId, ...args }) => {
    const upload = await ownedUpload(ctx.db, args.uploadId, sessionId);
    if (!upload) {
      throw new Error("Upload not found or not owned by this session");
    }
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
//
// internalMutation, NOT mutation: this is only ever called from
// convex/http.ts's Stripe webhook handler, after that handler has verified
// the request really came from Stripe via stripe.webhooks.constructEvent.
// A public mutation here would let any client holding the public
// NEXT_PUBLIC_CONVEX_URL call convex.mutation(api.payments.markPaymentPaid,
// {stripeSessionId}) directly -- e.g. with their own real-but-unpaid
// Checkout session id, visible in the Stripe-hosted checkout page's URL bar
// -- and mark themselves "paid" for free, completely bypassing Stripe and
// the webhook signature check.
export const markPaymentPaid = internalMutation({
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

// Unauthorized callers (wrong/missing sessionId) get the exact same shape as
// "no payment found yet" — never a distinguishable response — so the
// response can't be used to probe whether an uploadId exists or is paid.
export const getPaymentStatus = query({
  args: {
    uploadId: v.id("uploads"),
    sessionId: v.string(),
  },
  handler: async (ctx, { uploadId, sessionId }) => {
    const upload = await ownedUpload(ctx.db, uploadId, sessionId);
    if (!upload) return { paid: false, downloadToken: null };

    // An upload can end up with more than one payments row — e.g. a customer
    // abandons an earlier Checkout session (left "pending") and then
    // completes a later one. An unindexed `.first()` has no recency
    // guarantee, so it could return the abandoned row forever and never
    // surface the real, paid one. Collect every row for this upload and
    // explicitly prefer a paid one over any pending/failed/expired rows.
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();
    const paid = payments.find((p) => p.status === "paid");
    if (paid) {
      return { paid: true, downloadToken: paid.downloadToken ?? null };
    }
    return { paid: false, downloadToken: null };
  },
});

// The download gate: returns null unless the payment backing this token is
// actually "paid". Callers (web-mvp-payment-gate) must treat null as a hard
// 404/402 — never trust a client-supplied "paid" flag instead of this lookup.
//
// Also resolves the signed PDF URL here (rather than making the caller do a
// second, separately-authorized lookup via profiles.getProfilePdfUrl): a
// downloadToken is the authorization for this whole flow, and there is no
// sessionId available to the download route to check ownership with instead
// (see app/api/download/[token]/route.ts) — so the PDF URL for a given
// upload must only ever be handed out from behind this same paid-status gate.
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
    if (!upload) return { payment, upload: null, pdfUrl: null };

    const profile = await ctx.db
      .query("structuredProfiles")
      .filter((q) => q.eq(q.field("uploadId"), payment.uploadId))
      .first();
    const pdfUrl = profile?.pdfStorageId
      ? await ctx.storage.getUrl(profile.pdfStorageId)
      : null;

    return { payment, upload, pdfUrl };
  },
});
