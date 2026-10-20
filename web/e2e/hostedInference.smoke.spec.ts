import { test, expect } from "@playwright/test";

const provider = (process.env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
const providerKey = provider === "openai"
  ? process.env.OPENAI_API_KEY
  : provider === "anthropic"
    ? process.env.ANTHROPIC_API_KEY
    : undefined;

// This opt-in smoke test sends one real inference request and can incur a
// provider charge. Requiring every value prevents ordinary/local E2E runs
// from accidentally invoking a hosted model.
const enabled = process.env.HOSTED_INFERENCE_E2E === "1"
  && process.env.ALLOW_BILLABLE_HOSTED_INFERENCE_E2E === "1"
  && Boolean(process.env.PLAYWRIGHT_BASE_URL)
  && Boolean(process.env.E2E_SESSION_COOKIE)
  && Boolean(process.env.E2E_UPLOAD_ID)
  && Boolean(providerKey);

test.describe("Hosted inference production smoke", () => {
  test.skip(!enabled, "Set the explicit hosted inference E2E opt-in and credentials to run this billable smoke test.");

  test("returns a structured job-match result from the real endpoint", async ({ request }) => {
    const response = await request.post("/api/job-match", {
      headers: { cookie: `easycv_seridian_session=${process.env.E2E_SESSION_COOKIE}` },
      data: {
        uploadId: process.env.E2E_UPLOAD_ID,
        jobDescription: "Senior software engineer role requiring TypeScript, React, and cloud architecture experience.",
      },
      timeout: 90_000,
    });

    expect(response.status(), await response.text()).toBe(200);
    const body = await response.json() as {
      success?: boolean;
      result?: {
        matchScore?: unknown;
        matchedKeywords?: unknown;
        missingKeywords?: unknown;
        gapAnalysis?: unknown;
        tailoredBullets?: unknown;
      };
    };

    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result?.matchScore).toEqual(expect.any(Number));
    expect(body.result?.matchScore as number).toBeGreaterThanOrEqual(0);
    expect(body.result?.matchScore as number).toBeLessThanOrEqual(100);
    expect(body.result?.matchedKeywords).toEqual(expect.any(Array));
    expect(body.result?.missingKeywords).toEqual(expect.any(Array));
    expect(body.result?.gapAnalysis).toEqual(expect.any(String));
    expect(body.result?.tailoredBullets).toEqual(expect.any(Array));
  });
});
