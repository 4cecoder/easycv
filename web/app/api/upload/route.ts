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

import {
  validateMagicBytes,
  sanitizePdfBuffer,
  sanitizeTextForLLM,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_PAYLOAD_BYTES,
} from "../../../lib/sanitizer";

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

    // 1. Enforce Total Upload Payload Limit (25MB)
    let totalPayloadBytes = 0;
    for (const file of files) {
      totalPayloadBytes += file.size;
    }
    if (totalPayloadBytes > MAX_TOTAL_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Total upload size exceeds 25MB limit (${(totalPayloadBytes / (1024 * 1024)).toFixed(1)}MB). Please upload smaller documents.`,
        },
        { status: 400 },
      );
    }

    // 2. Validate Extensions & Individual File Size Limits (10MB)
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}. Only .pdf, .txt, .md are accepted.` },
          { status: 400 },
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            error: `File '${file.name}' exceeds maximum permitted size of 10MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
          },
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

    // 3. Process, Verify Magic Bytes, and Sanitize Files
    const preparedFiles: {
      name: string;
      ext: string;
      bytes: Buffer;
      category: string;
    }[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      let bytes: Buffer = Buffer.from(await file.arrayBuffer());

      // Magic Byte & Extension Verification
      const validation = validateMagicBytes(bytes, ext, file.name);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // PDF Sanitization (strip /JavaScript, /Launch, /EmbeddedFiles)
      if (ext === ".pdf") {
        const sanitized = sanitizePdfBuffer(bytes);
        bytes = Buffer.from(sanitized.buffer);
      } else if (ext === ".txt" || ext === ".md") {
        // Text / Prompt Injection Sanitization
        const text = bytes.toString("utf-8");
        const sanitizedText = sanitizeTextForLLM(text);
        bytes = Buffer.from(sanitizedText, "utf-8");
      }

      preparedFiles.push({
        name: file.name,
        ext,
        bytes,
        category: classifyFilename(file.name),
      });
    }

    const jobDescription = (formData.get("jobDescription") as string) || undefined;
    const sanitizedJobDesc = jobDescription ? sanitizeTextForLLM(jobDescription) : undefined;
    const jobLink = (formData.get("jobLink") as string) || undefined;
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? randomUUID();
    const convex = getConvexClient();
    const uploadId = await convex.mutation(api.uploads.createUpload, {
      sessionId,
      jobDescription: sanitizedJobDesc,
      jobLink,
    });

    for (const item of preparedFiles) {
      const storageId = await uploadBytesToConvexStorage(item.bytes, contentTypeFor(item.ext));
      await convex.mutation(api.resumeFiles.addResumeFile, {
        uploadId,
        filename: item.name,
        storageId: storageId as Id<"_storage">,
        ext: item.ext,
        sizeKb: Math.max(1, Math.round(item.bytes.byteLength / 1024)),
        category: item.category,
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
