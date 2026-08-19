"use server";

/**
 * Server Action – Job Match
 *
 * Converts the previous POST /api/job-match route into a Next.js Server Action.
 * All inputs are validated with Zod before any side effects occur.
 *
 * Security guarantees:
 *   • uploadId format is validated with a strict regex.
 *   • jobDescription length is bounded (50 KB max).
 *   • Session cookie is read server-side from next/headers – never trusted
 *     from client-supplied input (prevents session spoofing).
 *   • File paths for temp files use random UUIDs (no user input in paths).
 *   • Shell command is never constructed from user-supplied strings.
 *   • Temp files are cleaned up in a finally block.
 *   • Error messages never leak internal paths, env vars, or stack traces.
 */

import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { cookies } from "next/headers";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "../../lib/convexServer";
import { SESSION_COOKIE } from "../../lib/session";
import { sanitizeTextForLLM } from "../../lib/sanitizer";
import { jobMatchSchema } from "./schemas";

const execAsync = promisify(exec);

// ─── Action Result Types ────────────────────────────────────────────────────────

export type JobMatchResult = {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

// ─── Action ─────────────────────────────────────────────────────────────────────

/**
 * Run job-match analysis against an uploaded structured profile.
 *
 * Input:
 *   • uploadId        – Convex upload document ID
 *   • jobDescription  – plain-text job description (10–50 000 chars)
 *
 * Session identity is read from the cv_session cookie server-side.
 *
 * Returns `{ success: true, result }` or `{ success: false, error }`.
 */
export async function matchJob(input: {
  uploadId: string;
  jobDescription: string;
}): Promise<JobMatchResult> {
  // ── 1. Validate input with Zod ─────────────────────────────────────────────
  const parsed = jobMatchSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    return { success: false, error: msg };
  }

  const { uploadId, jobDescription } = parsed.data;

  // ── 2. Session identity from cookie ─────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return { success: false, error: "Authentication required" };
  }

  // ── 3. Verify profile ownership via Convex ──────────────────────────────────
  let profile;
  try {
    const convex = getConvexClient();
    profile = await convex.query(api.profiles.getStructuredProfile, {
      uploadId: uploadId as Id<"uploads">,
      sessionId,
    });
  } catch {
    return { success: false, error: "Profile not found or access denied" };
  }

  if (!profile) {
    return { success: false, error: "Profile not found or access denied" };
  }

  // ── 4. Prepare temp files with sanitised content ────────────────────────────
  const tempDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tempDir, { recursive: true });

  // Use random UUIDs for temp filenames – no user input in paths.
  const profilePath = path.join(tempDir, `profile-${randomUUID()}.json`);
  const jdPath = path.join(tempDir, `jd-${randomUUID()}.txt`);

  // Strip metadata fields to pass clean resume JSON to the LLM.
  const cleanProfile = {
    name: profile.name,
    titles: profile.titles,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience,
    education: profile.education,
    certifications: profile.certifications,
    languagesSpoken: profile.languagesSpoken,
  };

  // Sanitise the job description text before writing.
  const sanitisedJobDesc = sanitizeTextForLLM(jobDescription);

  let matchResult: Record<string, unknown> | undefined;

  try {
    await fs.writeFile(profilePath, JSON.stringify(cleanProfile));
    await fs.writeFile(jdPath, sanitisedJobDesc);

    // ── 5. Execute the Python matching CLI ────────────────────────────────────
    const provider = process.env.LLM_PROVIDER || "openai";
    const model = process.env.LLM_MODEL || "";
    const modelArg = model ? ` --model "${model.replace(/"/g, '\\"')}"` : "";

    // Paths are fully server-controlled; no user input is interpolated.
    const rootDir = path.resolve(process.cwd(), "..");
    const command = [
      "uv run python pipeline.py match-job",
      `--profile "${profilePath}"`,
      `--job-desc "${jdPath}"`,
      `--llm "${provider}"`,
      modelArg,
    ].join(" ");

    const { stdout } = await execAsync(command, {
      cwd: rootDir,
      env: {
        ...process.env,
        OLLAMA_API_BASE: process.env.OLLAMA_API_BASE || "",
      },
    });

    // The CLI prints log messages followed by JSON; extract the JSON part.
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error("No JSON found in analysis output");
    }

    matchResult = JSON.parse(stdout.substring(jsonStart));
  } finally {
    // Always clean up temp files – even on error.
    await fs.unlink(profilePath).catch(() => {});
    await fs.unlink(jdPath).catch(() => {});
  }

  if (!matchResult) {
    return { success: false, error: "Analysis failed to produce a result" };
  }

  return { success: true, result: matchResult };
}
