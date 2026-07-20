import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { profileFieldsFrom } from "../../../lib/profileMapping";
import { SESSION_COOKIE } from "../../../lib/session";

const execFileAsync = promisify(execFile);

// Mirrors pipeline.py's SUPPORTED_EXTRACT_EXT (pipeline.py:70) -- the actual
// extractable subset of VALID_EXT. Deliberately NOT .docx/.doc/.pages:
// extract_text() silently returns None for those today.
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);

// pipeline.py lives one directory up from web/ in this monorepo layout.
// Overridable via env for deployments that lay the repo out differently.
const PIPELINE_ROOT = process.env.PIPELINE_ROOT ?? path.resolve(process.cwd(), "..");

type ConsolidateStdinResult = {
  profile: Record<string, unknown>;
  score: { score: number; max_score: number; warnings: string[]; critical: boolean };
  pdf_path: string | null;
};

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

export async function POST(request: NextRequest) {
  let uploadTmpDir: string | null = null;
  let pdfTmpDir: string | null = null;

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Server is not configured with ANTHROPIC_API_KEY" },
        { status: 500 },
      );
    }
    const convexUrlConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
    if (!convexUrlConfigured) {
      return NextResponse.json(
        { error: "Server is not configured with NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    uploadTmpDir = await mkdtemp(path.join(tmpdir(), "cv-upload-"));
    const saved: { path: string; filename: string; ext: string; bytes: Buffer }[] = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name).toLowerCase();
      const safeName = path.basename(file.name).replace(/[^\w.\- ]/g, "_");
      const destPath = path.join(uploadTmpDir, safeName);
      await writeFile(destPath, bytes);
      saved.push({ path: destPath, filename: file.name, ext, bytes });
    }

    const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? randomUUID();
    const convex = getConvexClient();
    const uploadId = await convex.mutation(api.uploads.createUpload, { sessionId });

    for (const file of saved) {
      const storageId = await uploadBytesToConvexStorage(file.bytes, contentTypeFor(file.ext));
      await convex.mutation(api.resumeFiles.addResumeFile, {
        uploadId,
        filename: file.filename,
        storageId: storageId as Id<"_storage">,
        ext: file.ext,
        sizeKb: Math.round(file.bytes.byteLength / 1024),
        category: classifyFilename(file.filename),
      });
    }

    const { stdout } = await execFileAsync(
      "uv",
      [
        "run",
        "python",
        "pipeline.py",
        "consolidate-stdin",
        "--llm",
        "anthropic",
        ...saved.map((f) => f.path),
      ],
      {
        cwd: PIPELINE_ROOT,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
    if (!lastLine) {
      throw new Error("consolidate-stdin produced no output");
    }
    const result = JSON.parse(lastLine) as ConsolidateStdinResult;

    await convex.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      ...profileFieldsFrom(result.profile),
      qualityScore: result.score.score,
      qualityMaxScore: result.score.max_score,
      qualityWarnings: result.score.warnings,
      qualityCritical: result.score.critical,
    });

    if (result.pdf_path) {
      pdfTmpDir = path.dirname(result.pdf_path);
      const pdfBytes = await readFile(result.pdf_path);
      const pdfStorageId = await uploadBytesToConvexStorage(pdfBytes, "application/pdf");
      await convex.mutation(api.profiles.setProfilePdf, {
        uploadId,
        pdfStorageId: pdfStorageId as Id<"_storage">,
      });
    }

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
  } finally {
    if (uploadTmpDir) await rm(uploadTmpDir, { recursive: true, force: true }).catch(() => {});
    if (pdfTmpDir) await rm(pdfTmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
