"use server";

/**
 * Server Action – File Upload
 *
 * Converts the previous POST /api/upload route into a Next.js Server Action.
 * All inputs are validated with Zod before any side effects occur.
 *
 * Security guarantees:
 *   • File-type allowlist enforced server-side (.pdf, .txt, .md only).
 *   • Per-file (10 MB) and total-payload (25 MB) size limits checked.
 *   • Magic-byte validation prevents extension spoofing.
 *   • PDFs are sanitised (strip /JavaScript, /Launch, /EmbeddedFiles).
 *   • Text is stripped of prompt-injection payloads before LLM processing.
 *   • Filenames are never interpolated into shell commands.
 *   • Error messages never leak internal stack traces or env details.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "../../lib/convexServer";
import {
  validateMagicBytes,
  sanitizePdfBuffer,
  sanitizeTextForLLM,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_PAYLOAD_BYTES,
} from "../../lib/sanitizer";
import { uploadFileArraySchema, uploadMetaSchema } from "./schemas";

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Allowed file extensions – mirrors pipeline.py SUPPORTED_EXTRACT_EXT. */
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);

/** MIME type map for Convex storage uploads. */
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

/** Simple keyword-based filename classifier (matches pipeline.py classify). */
function classifyFilename(filename: string): string {
  const low = filename.toLowerCase();
  if (low.includes("linkedin")) return "linkedin";
  if (low.includes("profile")) return "profile";
  if (low.includes("resume")) return "resume";
  if (/\bcv\b/i.test(low)) return "cv";
  if (low.includes("cover") && low.includes("letter")) return "cover-letter";
  return "other";
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Upload a raw byte buffer to Convex file storage and return its storageId. */
async function uploadBytesToConvexStorage(
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const convex = getConvexClient();
  const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Blob([new Uint8Array(bytes)]),
  });
  if (!res.ok) {
    throw new Error("File storage upload failed");
  }
  const body = (await res.json()) as { storageId: string };
  return body.storageId;
}

/** Classify + validate a single uploaded file. Returns sanitised bytes. */
async function prepareFile(
  file: File,
): Promise<{ name: string; ext: string; bytes: Buffer; category: string }> {
  const ext = path.extname(file.name).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File '${file.name}' exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    );
  }

  let bytes = Buffer.from(await file.arrayBuffer());

  // Magic-byte + extension verification
  const validation = validateMagicBytes(bytes, ext, file.name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Sanitise PDFs and text files
  if (ext === ".pdf") {
    const sanitised = sanitizePdfBuffer(bytes);
    bytes = Buffer.from(sanitised.buffer);
  } else if (ext === ".txt" || ext === ".md") {
    const text = bytes.toString("utf-8");
    const sanitisedText = sanitizeTextForLLM(text);
    bytes = Buffer.from(sanitisedText, "utf-8");
  }

  return { name: file.name, ext, bytes, category: classifyFilename(file.name) };
}

// ─── Action Result Types ────────────────────────────────────────────────────────

export type UploadActionResult =
  | { success: true; uploadId: string }
  | { success: false; error: string };

// ─── Action ─────────────────────────────────────────────────────────────────────

/**
 * Upload one or more CV/cover-letter files.
 *
 * Expects a `FormData` containing:
 *   • `files` – 1–10 File entries (.pdf / .txt / .md, ≤10 MB each)
 *   • `jobDescription` – optional plain-text
 *   • `jobLink` – optional URL
 *
 * Returns `{ uploadId }` on success or `{ error }` on failure.
 */
export async function uploadFiles(formData: FormData): Promise<UploadActionResult> {
  try {
    // ── 1. Extract and validate file metadata via Zod ────────────────────────
    const rawFiles = formData.getAll("files").filter((f): f is File => f instanceof File);

    const parsedFiles = rawFiles.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));

    const fileValidation = uploadFileArraySchema.safeParse(parsedFiles);
    if (!fileValidation.success) {
      const msg = fileValidation.error.issues[0]?.message ?? "Invalid file input";
      return { success: false, error: msg };
    }

    // ── 2. Validate optional metadata ─────────────────────────────────────────
    const metaValidation = uploadMetaSchema.safeParse({
      jobDescription: (formData.get("jobDescription") as string) || undefined,
      jobLink: (formData.get("jobLink") as string) || undefined,
    });
    if (!metaValidation.success) {
      const msg = metaValidation.error.issues[0]?.message ?? "Invalid metadata";
      return { success: false, error: msg };
    }

    const { jobDescription: rawJobDesc, jobLink } = metaValidation.data;

    // ── 3. Enforce total payload size ─────────────────────────────────────────
    const totalPayloadBytes = rawFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalPayloadBytes > MAX_TOTAL_PAYLOAD_BYTES) {
      const mb = (totalPayloadBytes / (1024 * 1024)).toFixed(1);
      return {
        success: false,
        error: `Total upload size exceeds 25 MB limit (${mb} MB). Please upload smaller documents.`,
      };
    }

    // ── 4. Prepare (validate magic bytes, sanitise) each file ─────────────────
    const preparedFiles = await Promise.all(rawFiles.map(prepareFile));

    // ── 5. Create upload record in Convex ─────────────────────────────────────
    const convex = getConvexClient();

    // Session management: use existing cookie if present, else generate new.
    // NOTE: Server Actions run in a server-only context; we cannot access
    // cookies directly here. The client must supply the session cookie via
    // a wrapper or we rely on Convex's built-in session tracking.
    // For now we generate a fresh session for each upload (matches prior
    // fallback behaviour in the API route).
    const sessionId = randomUUID();

    const uploadId = await convex.mutation(api.uploads.createUpload, {
      sessionId,
      jobDescription: rawJobDesc ? sanitizeTextForLLM(rawJobDesc) : undefined,
      jobLink: jobLink || undefined,
    });

    // ── 6. Upload each file to Convex storage and attach to the upload ────────
    for (const item of preparedFiles) {
      const storageId = await uploadBytesToConvexStorage(
        item.bytes,
        contentTypeFor(item.ext),
      );
      await convex.mutation(api.resumeFiles.addResumeFile, {
        uploadId,
        filename: item.name,
        storageId: storageId as Id<"_storage">,
        ext: item.ext,
        sizeKb: Math.max(1, Math.round(item.bytes.byteLength / 1024)),
        category: item.category,
      });
    }

    // ── 7. Finalise the upload (makes it visible to the worker) ───────────────
    await convex.mutation(api.uploads.finalizeUpload, { uploadId, sessionId });

    return { success: true, uploadId };
  } catch (err) {
    console.error("[upload action] failed", err);
    // Never leak internals – return a generic message.
    return { success: false, error: "Upload failed. Please try again." };
  }
}
