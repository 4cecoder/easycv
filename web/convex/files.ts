import { mutation } from "./_generated/server";

// Convex's standard pattern for uploading bytes from a server that isn't
// itself a Convex function (here: the Next.js API routes in
// app/api/upload/route.ts): call this mutation to mint a short-lived signed
// URL, POST the raw bytes to it, then use the `storageId` from that
// response's JSON body in a follow-up mutation (addResumeFile/setProfilePdf).
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
