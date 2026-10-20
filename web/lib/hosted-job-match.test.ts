import { afterEach, describe, expect, test, vi } from "vitest";
import { runHostedJobMatch } from "./hosted-job-match";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mockOpenAiContent(content: string) {
  vi.stubEnv("LLM_PROVIDER", "openai");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), { status: 200, headers: { "content-type": "application/json" } })));
}

describe("runHostedJobMatch response validation", () => {
  test("returns only the complete structured job-match contract", async () => {
    mockOpenAiContent(JSON.stringify({
      matchScore: 82,
      matchedKeywords: ["TypeScript"],
      missingKeywords: ["Kubernetes"],
      gapAnalysis: "Some platform experience is missing.",
      tailoredBullets: ["Add an example of cloud deployment work."],
      unexpectedProviderField: "discarded",
    }));

    await expect(runHostedJobMatch({ skills: ["TypeScript"] }, "Engineer role")).resolves.toEqual({
      matchScore: 82,
      matchedKeywords: ["TypeScript"],
      missingKeywords: ["Kubernetes"],
      gapAnalysis: "Some platform experience is missing.",
      tailoredBullets: ["Add an example of cloud deployment work."],
    });
  });

  test("@regression EASYC-5 rejects incomplete provider JSON instead of reporting success", async () => {
    mockOpenAiContent(JSON.stringify({ matchScore: 82 }));

    await expect(runHostedJobMatch({}, "Engineer role")).rejects.toThrow("Provider returned invalid job match lists");
  });

  test("rejects scores outside the displayed percentage range", async () => {
    mockOpenAiContent(JSON.stringify({
      matchScore: 101,
      matchedKeywords: [],
      missingKeywords: [],
      gapAnalysis: "",
      tailoredBullets: [],
    }));

    await expect(runHostedJobMatch({}, "Engineer role")).rejects.toThrow("Provider returned an invalid job match score");
  });
});
