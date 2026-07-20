// Maps the loosely-typed JSON produced by `pipeline.py consolidate-stdin`
// (LLM output, validated only by json.loads + score_structured_data on the
// Python side) onto the strict Convex validators in convex/schema.ts. Python
// remains the single source of truth for the *shape* of a resume profile --
// this file only defends against a field being missing, null, or the wrong
// type so a single malformed LLM response can't crash saveStructuredProfile.
//
// One deliberate renaming: pipeline.py's LLM_CONSOLIDATE_SYSTEM prompt (and
// therefore llm_consolidate()'s output, pipeline.py:476-512) uses the
// snake_case key "languages_spoken"; convex/schema.ts stores it as the
// camelCase field "languagesSpoken" to match the rest of the TS schema.
// Every other key is passed through unchanged (including nested skills.*
// categories, which stay snake_case on both sides).

export type ProfileFields = {
  name?: string;
  contact?: Record<string, string>;
  titles?: string[];
  summary?: string;
  skills?: {
    languages: string[];
    frameworks: string[];
    cloud_devops: string[];
    databases: string[];
    tools: string[];
  };
  experience?: {
    title?: string;
    company?: string;
    start?: string;
    end?: string;
    location?: string;
    bullets: string[];
  }[];
  education?: { degree?: string; school?: string; years?: string }[];
  certifications?: string[];
  languagesSpoken?: string[];
  rawFallback?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function asStringArrayRequired(value: unknown): string[] {
  return asStringArray(value) ?? [];
}

function asContact(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["email", "phone", "location", "linkedin", "website"]) {
    const v = asString(source[key]);
    if (v) out[key] = v;
  }
  return out;
}

function asSkills(value: unknown): ProfileFields["skills"] {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  return {
    languages: asStringArrayRequired(source.languages),
    frameworks: asStringArrayRequired(source.frameworks),
    cloud_devops: asStringArrayRequired(source.cloud_devops),
    databases: asStringArrayRequired(source.databases),
    tools: asStringArrayRequired(source.tools),
  };
}

function asExperience(value: unknown): ProfileFields["experience"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      title: asString(entry.title),
      company: asString(entry.company),
      start: asString(entry.start),
      end: asString(entry.end),
      location: asString(entry.location),
      bullets: asStringArrayRequired(entry.bullets),
    }));
}

function asEducation(value: unknown): ProfileFields["education"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      degree: asString(entry.degree),
      school: asString(entry.school),
      years: asString(entry.years),
    }));
}

/**
 * Convert the `profile` object from consolidate-stdin's JSON output into the
 * field set `saveStructuredProfile` expects. Handles the `{"_raw": "..."}`
 * fallback shape (pipeline.py's llm_consolidate()/score_structured_data()
 * emit this when the LLM's response wasn't parseable JSON) by storing it as
 * `rawFallback` instead of attempting to map nonexistent fields.
 */
export function profileFieldsFrom(profile: unknown): ProfileFields {
  if (!profile || typeof profile !== "object") {
    return { rawFallback: "invalid profile payload" };
  }
  const source = profile as Record<string, unknown>;
  if ("_raw" in source) {
    const raw = source._raw;
    return { rawFallback: typeof raw === "string" ? raw : JSON.stringify(raw) };
  }

  return {
    name: asString(source.name),
    contact: asContact(source.contact),
    titles: asStringArray(source.titles),
    summary: asString(source.summary),
    skills: asSkills(source.skills),
    experience: asExperience(source.experience),
    education: asEducation(source.education),
    certifications: asStringArray(source.certifications),
    languagesSpoken: asStringArray(source.languages_spoken),
  };
}
