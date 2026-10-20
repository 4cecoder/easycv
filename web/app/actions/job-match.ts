"use server";

import { cookies } from "next/headers";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authenticatedConvexFromCookie, AuthenticationRequiredError } from "../../lib/seridian-convex";
import { SESSION_COOKIE } from "../../lib/seridian-oidc";
import { runHostedJobMatch } from "../../lib/hosted-job-match";
import { sanitizeTextForLLM } from "../../lib/sanitizer";
import { jobMatchSchema } from "./schemas";

export type JobMatchResult = { success: boolean; result?: Record<string, unknown>; error?: string };

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
