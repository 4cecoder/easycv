import { randomUUID } from "node:crypto";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { SESSION_COOKIE } from "../../../lib/session";

// Mirrors pipeline.py's SUPPORTED_EXTRACT_EXT (pipeline.py:70) -- the actual
// extractable subset of VALID_EXT. Deliberately NOT .docx/.doc/.pages:
// extract_text() silently returns None for those today.
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);

// Mirrors pipeline.py's classify() (pipeline.py:101) -- kept in sync by hand
// since this route never shells out to Python just to categorize a filename.
function classifyFilename(filename: string): string {
  const low = filename.toLowerCase();
  if (low.includes("linkedin")) return "linkedin";
  if (low.includes("profile")) return "profile";
  if (low.includes("resume")) return "resume";
  if (/\bcv\b/i.test(low)) return "cv";
  if (low.includes("cover") && low.includes("letter")) return "cover-letter";
  return "other";
}

function contentTypeFor(ext: string): string {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function uploadBytesToConvexStorage(bytes: Buffer, contentType: string): Promise<string> {
  const convex = getConvexClient();
  const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    // Buffer's backing ArrayBufferLike can widen to SharedArrayBuffer, which
    // BlobPart's typing rejects -- copy into a plain Uint8Array first.
    body: new Blob([new Uint8Array(bytes)]),
  });
  if (!res.ok) {
    throw new Error(`Convex storage upload failed with status ${res.status}`);
  }
  const body = (await res.json()) as { storageId: string };
  return body.storageId;
}

// This route ONLY saves files and queues the upload -- it does not run any
// LLM consolidation itself. That work happens in a separate, long-lived
// process (worker.py), which polls Convex for "queued" uploads. Why: this
// route runs as a serverless function once deployed, and standard Netlify
// Functions time out at 10-26s -- consolidation routinely takes 90-300+s.
// Blocking this request on it would simply fail in production regardless of
// which LLM backend is configured. Callers get an uploadId back immediately
// and the /preview/[uploadId] page shows live status (queued -> processing
// -> ready | error) via a reactive Convex query -- see worker.py's own
// module docstring for the full rationale.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}. Only .pdf, .txt, .md are accepted.` },
          { status: 400 },
        );
      }
    }
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      return NextResponse.json(
        { error: "Server is not configured with NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? randomUUID();
    const convex = getConvexClient();
    const uploadId = await convex.mutation(api.uploads.createUpload, { sessionId });

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const bytes = Buffer.from(await file.arrayBuffer());
      const storageId = await uploadBytesToConvexStorage(bytes, contentTypeFor(ext));
      await convex.mutation(api.resumeFiles.addResumeFile, {
        uploadId,
        filename: file.name,
        storageId: storageId as Id<"_storage">,
        ext,
        sizeKb: Math.round(bytes.byteLength / 1024),
        category: classifyFilename(file.name),
      });
    }

    // Only NOW does the worker's claimNextQueued consider this upload --
    // see convex/uploads.ts's createUpload comment. Doing this before every
    // resumeFiles row above is attached let a fast-polling worker claim a
    // job with zero files yet (caught live, not hypothetically), wasting a
    // real attempt out of the bounded retry budget on a race rather than
    // an actual failure.
    await convex.mutation(api.uploads.finalizeUpload, { uploadId, sessionId });

    const response = NextResponse.json({ uploadId });
    if (!request.cookies.get(SESSION_COOKIE)) {
      response.cookies.set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (err) {
    console.error("upload failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
