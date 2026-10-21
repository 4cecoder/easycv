import { NextRequest, NextResponse } from "next/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { authenticatedConvexFromRequest, AuthenticationRequiredError } from "../../../lib/seridian-convex";
import { runHostedJobMatch } from "../../../lib/hosted-job-match";
import {
  consumeServerLimit,
  rateLimitedResponse,
  RateLimiterUnavailableError,
  rateLimiterUnavailableResponse,
} from "../../../lib/server-rate-limit";
import { sanitizeTextForLLM } from "../../../lib/sanitizer";
import { withUserMonSpan } from "../../../lib/usermon-server";

export const POST = withUserMonSpan("/api/job-match", async (request: NextRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      uploadId?: string;
      jobDescription?: string;
    };

    const { uploadId, jobDescription } = body;
    if (typeof uploadId !== "string" || !uploadId || typeof jobDescription !== "string" || !jobDescription.trim()) {
      return NextResponse.json(
        { error: "uploadId and jobDescription are required" },
        { status: 400 }
      );
    }
    if (jobDescription.length > 50_000) {
      return NextResponse.json({ error: "jobDescription exceeds the 50 KB limit" }, { status: 400 });
    }

    // Verify session
    let auth;
    try { auth = await authenticatedConvexFromRequest(request); }
    catch (error) {
      if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      throw error;
    }

    // Query Convex structured profile
    const { convex, ownerSessionKey: sessionId } = auth;
    const profile = await convex.query(api.profiles.getStructuredProfile, {
      uploadId: uploadId as Id<"uploads">,
      sessionId,
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Structured profile not found or not owned by this session" },
        { status: 404 }
      );
    }

    // Durable per-user + global LLM budget (EASYC-6). Consumed only once the
    // request is valid and owned, and strictly BEFORE the paid LLM call;
    // refused or unreachable limiter => no LLM call.
    try {
      const limit = await consumeServerLimit(convex, api.rateLimits.consumeJobMatch);
      if (!limit.ok) return rateLimitedResponse(limit);
    } catch (error) {
      if (error instanceof RateLimiterUnavailableError) {
        console.error("Job match rate limiter unavailable", error.cause);
        return rateLimiterUnavailableResponse();
      }
      throw error;
    }

    // We exclude metadata fields to pass clean resume JSON to the LLM
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

    const matchResult = await runHostedJobMatch(cleanProfile, sanitizeTextForLLM(jobDescription));

    return NextResponse.json({ success: true, result: matchResult });
  } catch (err) {
    console.error("Job match API failed", err);
    const message = err instanceof Error ? err.message : "Failed to analyze job match";
    const status = /not configured|unsupported hosted provider|requires a hosted provider/i.test(message) ? 503 : 502;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
});
