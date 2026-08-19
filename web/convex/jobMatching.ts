/**
 * Automatic Job Matching Engine
 * =============================
 * Pairs job postings with user profiles using keyword overlap scoring,
 * weighted by recency, salary alignment, and location compatibility.
 *
 * Runs as internal mutations — called by cron or worker, not exposed to
 * the public API.
 *
 * Matching algorithm:
 *   1. Extract keywords from user's structured profile (skills, titles, experience)
 *   2. Extract keywords from job posting (pre-stored or extracted on match)
 *   3. Score overlap: matchedKeywords / totalUniqueKeywords
 *   4. Weight by recency (newer jobs score higher)
 *   5. Weight by salary match (if both sides provide salary info)
 *   6. Weight by location match (remote = matches everything)
 *   7. Store results in jobMatchResults table
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ── Keyword extraction ────────────────────────────────────────────

/**
 * Stop words to exclude from keyword extraction.
 * Common English words that carry no signal for matching.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "dare",
  "ought", "used", "this", "that", "these", "those", "i", "me", "my",
  "we", "our", "you", "your", "he", "him", "his", "she", "her", "it",
  "its", "they", "them", "their", "what", "which", "who", "whom",
  "when", "where", "why", "how", "all", "each", "every", "both", "few",
  "more", "most", "other", "some", "such", "no", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "because", "if", "then",
  "about", "above", "after", "again", "also", "am", "any",
  "before", "being", "between", "during", "further", "get", "got",
  "here", "into", "itself", "let", "like", "make", "many", "much",
  "must", "now", "often", "one", "out", "over", "per", "put", "re",
  "see", "since", "still", "take", "through", "under", "until", "up",
  "upon", "us",   "using", "well", "while", "within", "without",
]);

/**
 * Extract keywords from a structured profile.
 * Pulls from: titles, skills (all categories), experience titles + bullets,
 * certifications, and summary.
 */
export function extractProfileKeywords(profile: {
  titles?: string[] | null;
  skills?: {
    languages?: string[];
    frameworks?: string[];
    cloud_devops?: string[];
    databases?: string[];
    tools?: string[];
  } | null;
  experience?: Array<{
    title?: string | null;
    bullets?: string[];
  }> | null;
  certifications?: string[] | null;
  summary?: string | null;
}): string[] {
  const tokens: string[] = [];

  // Titles
  if (profile.titles) {
    for (const title of profile.titles) {
      tokens.push(...tokenize(title));
    }
  }

  // Skills — each is a known technology term, lowercased directly
  if (profile.skills) {
    for (const category of [
      profile.skills.languages,
      profile.skills.frameworks,
      profile.skills.cloud_devops,
      profile.skills.databases,
      profile.skills.tools,
    ]) {
      if (category) {
        for (const skill of category) {
          tokens.push(...tokenize(skill));
        }
      }
    }
  }

  // Experience titles and bullets
  if (profile.experience) {
    for (const entry of profile.experience) {
      if (entry.title) {
        tokens.push(...tokenize(entry.title));
      }
      if (entry.bullets) {
        for (const bullet of entry.bullets) {
          tokens.push(...tokenize(bullet));
        }
      }
    }
  }

  // Certifications
  if (profile.certifications) {
    for (const cert of profile.certifications) {
      tokens.push(...tokenize(cert));
    }
  }

  // Summary (last, lower priority — but still contributes)
  if (profile.summary) {
    tokens.push(...tokenize(profile.summary));
  }

  return deduplicateKeywords(tokens);
}

/**
 * Extract keywords from a job description string.
 */
export function extractJobKeywords(description: string): string[] {
  const tokens = tokenize(description);
  return deduplicateKeywords(tokens);
}

/**
 * Tokenize a string into normalized keyword tokens.
 * Splits on non-alphanumeric, lowercases, filters stop words and short tokens.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\+\#\.]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Deduplicate keywords while preserving order.
 */
function deduplicateKeywords(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
}

// ── Scoring ───────────────────────────────────────────────────────

/** Weight constants for the composite score */
const WEIGHT_KEYWORD = 0.50;
const WEIGHT_RECENCY = 0.15;
const WEIGHT_SALARY = 0.20;
const WEIGHT_LOCATION = 0.15;

/**
 * Compute the composite match score between a profile and a job posting.
 */
export function computeMatchScore(
  profileKeywords: string[],
  jobKeywords: string[],
  jobCreatedAt: number,
  profileSalaryRange?: string | null,
  jobSalaryMin?: number | null,
  jobSalaryMax?: number | null,
  profileLocation?: string | null,
  jobLocation?: string | null,
  jobWorkArrangement?: string | null,
): {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  gapAnalysis: string;
  keywordScore: number;
  recencyScore: number;
  salaryScore: number;
  locationScore: number;
} {
  const jobSet = new Set(jobKeywords);
  const profileSet = new Set(profileKeywords);

  // 1. Keyword overlap (Jaccard-like: intersection / union)
  const matchedKeywords: string[] = [];
  for (const kw of profileSet) {
    if (jobSet.has(kw)) {
      matchedKeywords.push(kw);
    }
  }

  // Also find keywords in job that user is missing (gap analysis)
  const missingKeywords: string[] = [];
  for (const kw of jobSet) {
    if (!profileSet.has(kw)) {
      missingKeywords.push(kw);
    }
  }

  const totalUnique = new Set([...profileSet, ...jobSet]).size;
  const keywordScore = totalUnique > 0
    ? matchedKeywords.length / totalUnique
    : 0;

  // 2. Recency score — exponential decay, half-life of 30 days
  const now = Date.now();
  const ageMs = now - jobCreatedAt;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const recencyScore = Math.exp(-0.693 * ageMs / THIRTY_DAYS_MS);

  // 3. Salary match score
  const salaryScore = computeSalaryScore(
    profileSalaryRange,
    jobSalaryMin,
    jobSalaryMax,
  );

  // 4. Location match score
  const locationScore = computeLocationScore(
    profileLocation,
    jobLocation,
    jobWorkArrangement,
  );

  // Composite weighted score (0–100)
  const raw = (keywordScore * WEIGHT_KEYWORD)
    + (recencyScore * WEIGHT_RECENCY)
    + (salaryScore * WEIGHT_SALARY)
    + (locationScore * WEIGHT_LOCATION);
  const score = Math.round(Math.min(100, Math.max(0, raw * 100)));

  const gapAnalysis = missingKeywords.length > 0
    ? `Missing ${missingKeywords.length} key skills: ${missingKeywords.slice(0, 5).join(", ")}${missingKeywords.length > 5 ? "..." : ""}`
    : "Strong alignment with job requirements";

  return {
    score,
    matchedKeywords,
    missingKeywords,
    gapAnalysis,
    keywordScore: Math.round(keywordScore * 100) / 100,
    recencyScore: Math.round(recencyScore * 100) / 100,
    salaryScore: Math.round(salaryScore * 100) / 100,
    locationScore: Math.round(locationScore * 100) / 100,
  };
}

/**
 * Parse a salary range string like "$120k-$150k" or "120000-150000" into
 * [min, max] in annual terms. Returns null if unparseable.
 */
export function parseSalaryRange(range: string): [number, number] | null {
  if (!range) return null;

  // Detect k/M notation before stripping
  const hasK = /\d+[kK]/.test(range);

  // Normalize en-dash to hyphen BEFORE stripping
  const normalized = range.replace(/\u2013/g, "-");

  // Strip everything except digits, dashes, spaces
  const cleaned = normalized.replace(/[^0-9\-\s]/g, "").trim();

  // Match patterns like "120-150" or "120000-150000"
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*[-]\s*(\d+(?:\.\d+)?)/);

  let low: number;
  let high: number;

  if (match) {
    low = parseFloat(match[1]);
    high = parseFloat(match[2]);
  } else {
    // Try single value
    const single = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (!single) return null;
    low = parseFloat(single[1]);
    high = low;
  }

  // Expand k/M notation
  if (hasK) {
    low *= 1000;
    high *= 1000;
  }

  return [low, high];
}

function expandSalaryNumber(n: number): number {
  // If < 1000, assume it's in thousands (e.g. 120 → 120000)
  if (n < 1000) return n * 1000;
  return n;
}

/**
 * Compute salary match score (0–1).
 * Returns 1 if ranges overlap, partial credit if close, 0 if far apart.
 */
function computeSalaryScore(
  profileRange?: string | null,
  jobMin?: number | null,
  jobMax?: number | null,
): number {
  if (!profileRange || (jobMin == null && jobMax == null)) {
    // No salary info available — neutral score (slightly below average
    // to slightly penalize jobs without salary transparency)
    return 0.5;
  }

  const parsed = parseSalaryRange(profileRange);
  if (!parsed) return 0.5;

  const [pMin, pMax] = parsed;
  const jMin = jobMin ?? jobMax ?? 0;
  const jMax = jobMax ?? jobMin ?? Infinity;

  // Check for overlap
  if (pMin <= jMax && pMax >= jMin) {
    return 1.0; // Full overlap
  }

  // Compute gap as percentage of the higher range
  if (pMax < jMin) {
    // User expects less than job pays — great match
    const gap = (jMin - pMax) / jMax;
    return Math.max(0, 1 - gap);
  } else {
    // User expects more than job pays
    const gap = (pMin - jMax) / pMax;
    return Math.max(0, 1 - gap * 2); // Penalize more heavily
  }
}

/**
 * Compute location match score (0–1).
 * Remote jobs match everything. Same city = 1.0. Same country = 0.7.
 */
function computeLocationScore(
  profileLocation?: string | null,
  jobLocation?: string | null,
  jobWorkArrangement?: string | null,
): number {
  // Remote jobs match everything
  if (jobWorkArrangement === "remote") return 1.0;

  // No location info — neutral
  if (!profileLocation && !jobLocation) return 0.5;
  if (!profileLocation || !jobLocation) return 0.6;

  const pLoc = profileLocation.toLowerCase().trim();
  const jLoc = jobLocation.toLowerCase().trim();

  // Exact match
  if (pLoc === jLoc) return 1.0;

  // Check if one contains the other (e.g. "San Francisco, CA" vs "San Francisco")
  if (pLoc.includes(jLoc) || jLoc.includes(pLoc)) return 0.95;

  // Check shared city (first comma-separated part)
  const pCity = pLoc.split(",")[0].trim();
  const jCity = jLoc.split(",")[0].trim();
  if (pCity === jCity) return 0.9;

  // Check shared country (last comma-separated part)
  const pCountry = pLoc.split(",").pop()?.trim() ?? "";
  const jCountry = jLoc.split(",").pop()?.trim() ?? "";
  if (pCountry && jCountry && pCountry === jCountry) return 0.7;

  // Different locations, hybrid still gives partial credit
  if (jobWorkArrangement === "hybrid") return 0.4;

  return 0.2;
}

// ── Internal queries ──────────────────────────────────────────────

/** Fetch all active job postings, ordered by most recent first */
export const getActiveJobPostings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(100);
  },
});

/** Fetch a single structured profile by uploadId */
export const getProfileForMatching = internalQuery({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => {
    return await ctx.db
      .query("structuredProfiles")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .first();
  },
});

/** Fetch candidate insights for a session */
export const getInsightsForMatching = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("candidateInsights")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});

/** Fetch the upload record (to get sessionId for insights lookup) */
export const getUploadForMatching = internalQuery({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => {
    return await ctx.db.get(uploadId);
  },
});

// ── Internal mutations ────────────────────────────────────────────

/**
 * Match a single user profile against all active job postings.
 * Scores each job and stores the top 10 results.
 */
export const matchJobsForUser = internalMutation({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => {
    const profile = await ctx.runQuery(
      internal.jobMatching.getProfileForMatching,
      { uploadId },
    );
    if (!profile) return { matched: 0, matches: [] };

    const upload = await ctx.runQuery(
      internal.jobMatching.getUploadForMatching,
      { uploadId },
    );
    const sessionId = upload?.sessionId;

    // Get candidate insights for salary/location preferences
    let insights = null;
    if (sessionId) {
      insights = await ctx.runQuery(
        internal.jobMatching.getInsightsForMatching,
        { sessionId },
      );
    }

    // Extract profile keywords
    const profileKeywords = extractProfileKeywords({
      titles: profile.titles,
      skills: profile.skills,
      experience: profile.experience,
      certifications: profile.certifications,
      summary: profile.summary,
    });

    // Fetch all active job postings
    const jobPostings = await ctx.runQuery(
      internal.jobMatching.getActiveJobPostings,
      {},
    );

    const results: Array<{
      jobPostingId: Id<"jobPostings">;
      score: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      gapAnalysis: string;
      keywordScore: number;
      recencyScore: number;
      salaryScore: number;
      locationScore: number;
    }> = [];

    for (const job of jobPostings) {
      const jobKeywords = job.keywords.length > 0
        ? job.keywords
        : extractJobKeywords(job.description || "");

      const matchResult = computeMatchScore(
        profileKeywords,
        jobKeywords,
        job.createdAt,
        insights?.targetSalaryRange,
        job.salaryMin,
        job.salaryMax,
        profile.contact?.location,
        job.location,
        job.workArrangement,
      );

      results.push({
        jobPostingId: job._id,
        ...matchResult,
      });
    }

    // Sort by score descending, take top 10
    results.sort((a, b) => b.score - a.score);
    const top10 = results.slice(0, 10);

    // Delete existing matches for this upload before inserting new ones
    const existingMatches = await ctx.db
      .query("jobMatchResults")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .collect();
    for (const existing of existingMatches) {
      await ctx.db.delete(existing._id);
    }

    // Store new matches
    const now = Date.now();
    const matchIds: Id<"jobMatchResults">[] = [];
    for (const result of top10) {
      const id = await ctx.db.insert("jobMatchResults", {
        uploadId,
        jobPostingId: result.jobPostingId,
        matchScore: result.score,
        matchedKeywords: result.matchedKeywords,
        missingKeywords: result.missingKeywords,
          gapAnalysis: result.gapAnalysis,
        keywordScore: result.keywordScore,
        recencyScore: result.recencyScore,
        salaryScore: result.salaryScore,
        locationScore: result.locationScore,
        notified: false,
        createdAt: now,
      });
      matchIds.push(id);
    }

    return { matched: top10.length, matches: top10 };
  },
});

/**
 * Match a single job posting against all user profiles.
 * Scores each profile and stores results.
 */
export const matchUsersForJob = internalMutation({
  args: { jobPostingId: v.id("jobPostings") },
  handler: async (ctx, { jobPostingId }) => {
    const job = await ctx.db.get(jobPostingId);
    if (!job) return { matched: 0, matches: [] };

    const jobKeywords = job.keywords.length > 0
      ? job.keywords
      : extractJobKeywords(job.description || "");

    // Find all structured profiles
    const profiles = await ctx.db.query("structuredProfiles").take(200);

    const results: Array<{
      uploadId: Id<"uploads">;
      score: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      gapAnalysis: string;
      keywordScore: number;
      recencyScore: number;
      salaryScore: number;
      locationScore: number;
    }> = [];

    for (const profile of profiles) {
      const profileKeywords = extractProfileKeywords({
        titles: profile.titles,
        skills: profile.skills,
        experience: profile.experience,
        certifications: profile.certifications,
        summary: profile.summary,
      });

      // Get insights for this profile's session
      const upload = await ctx.db.get(profile.uploadId);
      let insights = null;
      if (upload?.sessionId) {
        insights = await ctx.runQuery(
          internal.jobMatching.getInsightsForMatching,
          { sessionId: upload.sessionId },
        );
      }

      const matchResult = computeMatchScore(
        profileKeywords,
        jobKeywords,
        job.createdAt,
        insights?.targetSalaryRange,
        job.salaryMin,
        job.salaryMax,
        profile.contact?.location,
        job.location,
        job.workArrangement,
      );

      // Only include matches above threshold
      if (matchResult.score > 20) {
        results.push({
          uploadId: profile.uploadId,
          ...matchResult,
        });
      }
    }

    // Sort by score descending, take top 50
    results.sort((a, b) => b.score - a.score);
    const top50 = results.slice(0, 50);

    // Store results (upsert per upload+job pair)
    const now = Date.now();
    for (const result of top50) {
      const existing = await ctx.db
        .query("jobMatchResults")
        .withIndex("by_job", (q) => q.eq("jobPostingId", jobPostingId))
        .collect()
        .then((rows) =>
          rows.find((r) => r.uploadId === result.uploadId)
        );

      if (existing) {
        await ctx.db.patch(existing._id, {
          matchScore: result.score,
          matchedKeywords: result.matchedKeywords,
          missingKeywords: result.missingKeywords,
          gapAnalysis: result.gapAnalysis,
          keywordScore: result.keywordScore,
          recencyScore: result.recencyScore,
          salaryScore: result.salaryScore,
          locationScore: result.locationScore,
          notified: false,
        });
      } else {
        await ctx.db.insert("jobMatchResults", {
          uploadId: result.uploadId,
          jobPostingId,
          matchScore: result.score,
          matchedKeywords: result.matchedKeywords,
          missingKeywords: result.missingKeywords,
          gapAnalysis: result.gapAnalysis,
          keywordScore: result.keywordScore,
          recencyScore: result.recencyScore,
          salaryScore: result.salaryScore,
          locationScore: result.locationScore,
          notified: false,
          createdAt: now,
        });
      }
    }

    return { matched: top50.length, matches: top50 };
  },
});

/**
 * Cron entry point: iterates all active job postings, runs matching against
 * every profile with a structured profile.  Updates jobMatchResults table.
 * Marks high-score matches (>= 70) for notification.
 */
export const runDailyMatching = internalMutation({
  args: {},
  handler: async (ctx): Promise<{
    jobsProcessed: number;
    totalMatches: number;
    highScoreMatches: number;
  }> => {
    const jobPostings: Array<{ _id: Id<"jobPostings"> }> = await ctx.runQuery(
      internal.jobMatching.getActiveJobPostings,
      {},
    );

    let totalMatches = 0;
    let highScoreMatches = 0;

    for (const job of jobPostings) {
      const result = await ctx.runMutation(
        internal.jobMatching.matchUsersForJob,
        { jobPostingId: job._id },
      );
      totalMatches += result.matched;

      // Count high-score matches for notification
      highScoreMatches += result.matches.filter(
        (m: { score: number }) => m.score >= 70,
      ).length;
    }

    return {
      jobsProcessed: jobPostings.length,
      totalMatches,
      highScoreMatches,
    };
  },
});

/**
 * Get match results for a specific upload, sorted by score descending.
 */
export const getMatchesForUpload = internalQuery({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => {
    const matches = await ctx.db
      .query("jobMatchResults")
      .withIndex("by_upload", (q) => q.eq("uploadId", uploadId))
      .order("desc")
      .take(20);

    // Hydrate with job posting details
    const hydrated = [];
    for (const match of matches) {
      const job = await ctx.db.get(match.jobPostingId);
      hydrated.push({
        ...match,
        job,
      });
    }
    return hydrated;
  },
});

/**
 * Get unnotified high-score matches (for notification system).
 */
export const getUnnotifiedMatches = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("jobMatchResults")
      .withIndex("by_notified", (q) => q.eq("notified", false))
      .order("desc")
      .take(100);
  },
});

/**
 * Mark a match as notified.
 */
export const markMatchNotified = internalMutation({
  args: { matchId: v.id("jobMatchResults") },
  handler: async (ctx, { matchId }) => {
    await ctx.db.patch(matchId, { notified: true });
  },
});

/**
 * Seed a job posting into the database (for testing and admin use).
 */
export const createJobPosting = internalMutation({
  args: {
    title: v.string(),
    company: v.string(),
    location: v.optional(v.string()),
    description: v.string(),
    keywords: v.array(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    workArrangement: v.optional(v.string()),
    seniorityLevel: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    url: v.string(),
    expiresAt: v.number(),
    scrapedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("jobPostings", {
      title: args.title,
      company: args.company,
      url: args.url,
      description: args.description,
      keywords: args.keywords,
      location: args.location,
      salaryMin: args.salaryMin,
      salaryMax: args.salaryMax,
      salaryCurrency: args.salaryCurrency,
      workArrangement: args.workArrangement,
      status: "active",
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
      scrapedAt: args.scrapedAt,
      expiresAt: args.expiresAt,
    });
  },
});
