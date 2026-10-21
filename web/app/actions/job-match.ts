"use server";

import { cookies } from "next/headers";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authenticatedConvexFromCookie, AuthenticationRequiredError } from "../../lib/seridian-convex";
import { SESSION_COOKIE } from "../../lib/seridian-oidc";
import { runHostedJobMatch } from "../../lib/hosted-job-match";
import { sanitizeTextForLLM } from "../../lib/sanitizer";
import { consumeServerLimit, retryAfterSeconds } from "../../lib/server-rate-limit";
import { jobMatchSchema } from "./schemas";

/**
 * Result of {@link matchJob}. When refused by the durable rate limit,
 * `error` is the literal "rate_limited" and `retryAfter` is in seconds.
 */
export type JobMatchResult = {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  retryAfter?: number;
};

/** Server action: match an owned upload against a job description using the hosted LLM. */
export async function matchJob(input: { uploadId: string; jobDescription: string }): Promise<JobMatchResult> {
  const parsed = jobMatchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const cookieStore = await cookies();
  let auth;
  try { auth = await authenticatedConvexFromCookie(cookieStore.get(SESSION_COOKIE)?.value); }
  catch (error) {
    return { success: false, error: error instanceof AuthenticationRequiredError ? "Authentication required" : "Service is not configured" };
  }

  let profile;
  try {
    profile = await auth.convex.query(api.profiles.getStructuredProfile, {
      uploadId: parsed.data.uploadId as Id<"uploads">,
      sessionId: auth.ownerSessionKey,
    });
  } catch {
    return { success: false, error: "Profile not found or access denied" };
  }
  if (!profile) return { success: false, error: "Profile not found or access denied" };

  // Durable per-user + global LLM budget (EASYC-6): server actions bypass the
  // /api middleware entirely, so this is the only limit on this path. Must
  // run BEFORE the LLM call; refused or unreachable limiter => no LLM call.
  try {
    const limit = await consumeServerLimit(auth.convex, api.rateLimits.consumeJobMatch);
    if (!limit.ok) return { success: false, error: "rate_limited", retryAfter: retryAfterSeconds(limit.retryAfterMs) };
  } catch (error) {
    console.error("[job match action] rate limiter unavailable", error);
    return { success: false, error: "Service temporarily unavailable" };
  }

  const cleanProfile = {
    name: profile.name, titles: profile.titles, summary: profile.summary, skills: profile.skills,
    experience: profile.experience, education: profile.education,
    certifications: profile.certifications, languagesSpoken: profile.languagesSpoken,
  };
  try {
    const result = await runHostedJobMatch(cleanProfile, sanitizeTextForLLM(parsed.data.jobDescription));
    return { success: true, result };
  } catch (error) {
    console.error("[job match action] hosted inference failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Job matching failed" };
  }
}
