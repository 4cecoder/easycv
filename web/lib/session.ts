// Shared name for the opaque per-visitor session cookie (schema.ts:43-45
// comment: sessionId is the ONLY identity concept for now). Kept in one
// place so every reader/writer of the cookie (app/api/upload/route.ts,
// app/preview/[uploadId]/page.tsx, ...) agrees on the name.
export const SESSION_COOKIE = "cv_session";
