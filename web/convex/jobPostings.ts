import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Upsert a job posting by (source, sourceId).  If a posting from the same
 * source with the same external ID already exists it is patched in place;
 * otherwise a new row is inserted.
 */
export const saveJobPosting = mutation({
  args: {
    source: v.string(),
    sourceId: v.string(),
    url: v.string(),
    title: v.string(),
    company: v.string(),
    location: v.string(),
    description: v.string(),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    jobType: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("jobPostings")
      .withIndex("by_source", (q) =>
        q.eq("source", args.source).eq("sourceId", args.sourceId),
      )
      .first();

    const payload = {
      source: args.source,
      sourceId: args.sourceId,
      url: args.url,
      title: args.title,
      company: args.company,
      location: args.location,
      description: args.description,
      salaryMin: args.salaryMin,
      salaryMax: args.salaryMax,
      salaryCurrency: args.salaryCurrency,
      jobType: args.jobType,
      postedAt: args.postedAt,
      expiresAt: args.expiresAt,
      fetchedAt: now,
      // Preserve matched metadata on upsert
      matchedUsers: existing?.matchedUsers,
      matchCount: existing?.matchCount ?? 0,
      status: existing?.status ?? "active",
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("jobPostings", payload);
  },
});

/**
 * Mark a single job posting as expired.
 */
export const markJobExpired = mutation({
  args: { jobPostingId: v.id("jobPostings") },
  handler: async (ctx, { jobPostingId }) => {
    await ctx.db.patch(jobPostingId, { status: "expired" });
    return jobPostingId;
  },
});

/**
 * Save (upsert) a user's job search preferences.
 */
export const saveJobPreferences = mutation({
  args: {
    sessionId: v.string(),
    targetTitles: v.array(v.string()),
    targetCompanies: v.optional(v.array(v.string())),
    targetLocations: v.optional(v.array(v.string())),
    minSalary: v.optional(v.number()),
    jobTypes: v.optional(v.array(v.string())),
    keywords: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("jobPreferences")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        targetTitles: args.targetTitles,
        targetCompanies: args.targetCompanies,
        targetLocations: args.targetLocations,
        minSalary: args.minSalary,
        jobTypes: args.jobTypes,
        keywords: args.keywords,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("jobPreferences", {
      sessionId: args.sessionId,
      targetTitles: args.targetTitles,
      targetCompanies: args.targetCompanies,
      targetLocations: args.targetLocations,
      minSalary: args.minSalary,
      jobTypes: args.jobTypes,
      keywords: args.keywords,
      updatedAt: now,
    });
  },
});

/**
 * Save an external job match result (computed by the matching pipeline).
 * Upserts by (sessionId, jobPostingId).
 */
export const saveExternalJobMatch = mutation({
  args: {
    sessionId: v.string(),
    jobPostingId: v.id("jobPostings"),
    matchScore: v.number(),
    matchedKeywords: v.array(v.string()),
    missingKeywords: v.array(v.string()),
    gapAnalysis: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing match for this user+job pair
    const existing = await ctx.db
      .query("externalJobMatches")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect()
      .then((rows) => rows.find((r) => r.jobPostingId === args.jobPostingId));

    if (existing) {
      await ctx.db.patch(existing._id, {
        matchScore: args.matchScore,
        matchedKeywords: args.matchedKeywords,
        missingKeywords: args.missingKeywords,
        gapAnalysis: args.gapAnalysis,
      });
      return existing._id;
    }

    // Update the posting's matchedUsers and matchCount
    const posting = await ctx.db.get(args.jobPostingId);
    if (posting) {
      const matchedUsers = posting.matchedUsers ?? [];
      if (!matchedUsers.includes(args.sessionId)) {
        matchedUsers.push(args.sessionId);
      }
      await ctx.db.patch(args.jobPostingId, {
        matchedUsers,
        matchCount: matchedUsers.length,
      });
    }

    return await ctx.db.insert("externalJobMatches", {
      sessionId: args.sessionId,
      jobPostingId: args.jobPostingId,
      matchScore: args.matchScore,
      matchedKeywords: args.matchedKeywords,
      missingKeywords: args.missingKeywords,
      gapAnalysis: args.gapAnalysis,
      notified: false,
      createdAt: now,
    });
  },
});

/**
 * Bulk-expire job postings that have passed their expiresAt timestamp.
 * Returns the number of postings expired.
 */
export const expireStaleJobs = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let expired = 0;

    const staleJobs = await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const job of staleJobs) {
      if (job.expiresAt && job.expiresAt <= now) {
        await ctx.db.patch(job._id, { status: "expired" });
        expired++;
      }
    }

    return expired;
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Paginated list of active job postings, optionally filtered by company
 * or location. Ordered by fetchedAt descending (newest first).
 */
export const getActiveJobs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    company: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, company, location }) => {
    // Use the most selective index available
    if (company) {
      return await ctx.db
        .query("jobPostings")
        .withIndex("by_company", (q) => q.eq("company", company))
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .paginate(paginationOpts);
    }

    if (location) {
      return await ctx.db
        .query("jobPostings")
        .withIndex("by_location", (q) => q.eq("location", location))
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/**
 * Return active job postings that match a user's saved preferences.
 * Performs a simple keyword/title/location overlap — no LLM scoring here,
 * that's the job of the external matching pipeline.
 */
export const getJobsForUser = query({
  args: {
    sessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { sessionId, paginationOpts }) => {
    const prefs = await ctx.db
      .query("jobPreferences")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!prefs) {
      // No preferences saved — return empty
      return { page: [], isDone: true, continueCursor: "" };
    }

    const activeJobs = await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate(paginationOpts);

    // Client-side filtering against preferences (small result set from page)
    const filtered = activeJobs.page.filter((job) => {
      // Title match: any target title substring in job title (case-insensitive)
      const titleMatch =
        prefs.targetTitles.length === 0 ||
        prefs.targetTitles.some((t) =>
          job.title.toLowerCase().includes(t.toLowerCase()),
        );

      // Location match
      const locationMatch =
        !prefs.targetLocations?.length ||
        prefs.targetLocations.some((loc) =>
          job.location.toLowerCase().includes(loc.toLowerCase()),
        );

      // Company match
      const companyMatch =
        !prefs.targetCompanies?.length ||
        prefs.targetCompanies.some((c) =>
          job.company.toLowerCase().includes(c.toLowerCase()),
        );

      // Salary floor
      const salaryMatch =
        prefs.minSalary == null ||
        job.salaryMax == null ||
        job.salaryMax >= prefs.minSalary;

      // Job type match
      const typeMatch =
        !prefs.jobTypes?.length ||
        (job.jobType != null && prefs.jobTypes.includes(job.jobType));

      return titleMatch && locationMatch && companyMatch && salaryMatch && typeMatch;
    });

    return { ...activeJobs, page: filtered };
  },
});

/**
 * Get all external job matches for a user, ordered by score descending.
 */
export const getMatchesForUser = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("externalJobMatches")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a single job posting by ID.
 */
export const getJobPosting = query({
  args: { jobPostingId: v.id("jobPostings") },
  handler: async (ctx, { jobPostingId }) => {
    return await ctx.db.get(jobPostingId);
  },
});

/**
 * Get the user's saved job preferences.
 */
export const getJobPreferences = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("jobPreferences")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});
