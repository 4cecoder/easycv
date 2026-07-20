import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { Doc, Id } from "./_generated/dataModel";

// Every uploadId-scoped read must also take the caller's sessionId and check
// it against the sessionId stored on that upload (schema.ts:43-45) --
// otherwise any client holding another user's uploadId (visible in the
// /preview/[uploadId] URL, referrer headers, browser history, etc.) could
// read that user's data directly through the public Convex deployment URL
// (NEXT_PUBLIC_CONVEX_URL is public, so Convex functions are reachable
// straight from browser devtools), bypassing whatever gating the Next.js
// routes do.
//
// Returns null for both "no such upload" and "wrong session" so callers
// can't use the response shape to probe for the existence of an uploadId
// they don't own.
export async function ownedUpload(
  db: GenericDatabaseReader<DataModel>,
  uploadId: Id<"uploads">,
  sessionId: string,
): Promise<Doc<"uploads"> | null> {
  const upload = await db.get(uploadId);
  if (!upload || upload.sessionId !== sessionId) return null;
  return upload;
}
