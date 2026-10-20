type JsonRecord = Record<string, unknown>;

const SYSTEM_PROMPT = `You are a professional technical recruiter and career coach.
Given a candidate's structured resume JSON profile and a target Job Description, perform a deep alignment analysis.
Produce a structured JSON response with these exact keys:
- "matchScore": an integer from 0 to 100 representing how well the candidate's skills and experience align with the job description.
- "matchedKeywords": a list of keywords/skills/technologies mentioned in both the resume and the job description.
- "missingKeywords": a list of key skills, technologies, or concepts requested in the job description that are missing from the resume.
- "gapAnalysis": a paragraph summarizing the main experience or tech stack gaps.
- "tailoredBullets": a list of specific action points or suggestions on how the candidate can modify their experience bullet points to better match this job description.
Return only valid JSON.`;

function parseResult(text: string): JsonRecord {
  const unwrapped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value: unknown = JSON.parse(unwrapped);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider returned invalid job match JSON");
  const result = value as Record<string, unknown>;
  const isStringList = (entry: unknown): entry is string[] =>
    Array.isArray(entry) && entry.length <= 100 && entry.every((item) => typeof item === "string" && item.length <= 500);
  if (!Number.isInteger(result.matchScore) || (result.matchScore as number) < 0 || (result.matchScore as number) > 100) {
    throw new Error("Provider returned an invalid job match score");
  }
  if (!isStringList(result.matchedKeywords) || !isStringList(result.missingKeywords) || !isStringList(result.tailoredBullets)) {
    throw new Error("Provider returned invalid job match lists");
  }
  if (typeof result.gapAnalysis !== "string" || result.gapAnalysis.length > 10_000) {
    throw new Error("Provider returned invalid job match gap analysis");
  }
  return {
    matchScore: result.matchScore,
    matchedKeywords: result.matchedKeywords,
    missingKeywords: result.missingKeywords,
    gapAnalysis: result.gapAnalysis,
    tailoredBullets: result.tailoredBullets,
  };
}

/** Hosted inference for serverless production. Local Ollama/Tailscale is deliberately unsupported here. */
export async function runHostedJobMatch(profile: JsonRecord, jobDescription: string): Promise<JsonRecord> {
  const provider = (process.env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
  const model = process.env.LLM_MODEL?.trim();
  const userText = `Candidate Profile JSON:\n${JSON.stringify(profile, null, 2)}\n\nTarget Job Description:\n${jobDescription}`;
  const signal = AbortSignal.timeout(60_000);

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Job matching is not configured: set OPENAI_API_KEY for the hosted OpenAI provider");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: model || "gpt-4o", temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userText },
      ] }),
    });
    const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string | null } }> };
    if (!response.ok) throw new Error(`Hosted job matching failed (${response.status}): ${body.error?.message ?? "provider error"}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Hosted job matching returned an empty response");
    return parseResult(content);
  }

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Job matching is not configured: set ANTHROPIC_API_KEY for the hosted Anthropic provider");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 2048, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }] }),
    });
    const body = await response.json() as { error?: { message?: string }; content?: Array<{ type?: string; text?: string }> };
    if (!response.ok) throw new Error(`Hosted job matching failed (${response.status}): ${body.error?.message ?? "provider error"}`);
    const content = body.content?.find((item) => item.type === "text")?.text;
    if (!content) throw new Error("Hosted job matching returned an empty response");
    return parseResult(content);
  }

  if (provider === "ollama" || provider === "local") {
    throw new Error("Serverless job matching requires a hosted provider (openai or anthropic); local Ollama is not supported");
  }
  throw new Error(`Unsupported hosted job matching provider: ${provider || "(empty)"}`);
}
