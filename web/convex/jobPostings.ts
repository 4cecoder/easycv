import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Thresholds in milliseconds
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DELETION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Clean up expired job postings.
 *
 * 1. Mark postings older than 30 days as "expired" (if still "active").
 * 2. Delete postings older than 90 days entirely (regardless of status).
 *
 * Returns the number of postings marked expired and the number deleted.
 */
export const cleanExpiredJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiryThreshold = now - EXPIRY_MS;
    const deletionThreshold = now - DELETION_MS;

    let expiredCount = 0;
    let deletedCount = 0;

    // Step 1: Mark active postings past the expiry threshold as expired
    const activeJobs = await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const job of activeJobs) {
      if (job.expiresAt <= now) {
        await ctx.db.patch(job._id, { status: "expired" });
        expiredCount++;
      }
    }

    // Step 2: Delete postings older than the deletion threshold
    // Collect all non-deleted postings and delete those past the threshold
    const allJobs = await ctx.db.query("jobPostings").collect();

    for (const job of allJobs) {
      // Use _creationTime as the ultimate age reference
      const ageMs = now - job._creationTime;
      if (ageMs >= DELETION_MS) {
        await ctx.db.delete(job._id);
        deletedCount++;
      }
    }

    return { expiredCount, deletedCount };
  },
});

/**
 * Re-scrape active job postings to check if they're still available.
 *
 * In production this would call the Indeed scraper action for each URL.
 * For now, this is a placeholder that marks stale postings (not refreshed
 * in 7+ days) as expired. The actual scraping is deferred to an action
 * that the cron will invoke.
 *
 * Returns the number of postings marked expired.
 */
export const refreshActiveJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleThreshold = now - 7 * 24 * 60 * 60 * 1000; // 7 days
    let expiredCount = 0;

    const activeJobs = await ctx.db
      .query("jobPostings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const job of activeJobs) {
      // If the posting was never refreshed, use scrapedAt
      const lastSeen = job.lastRefreshedAt ?? job.scrapedAt;
      if (lastSeen < staleThreshold) {
        await ctx.db.patch(job._id, {
          status: "expired",
          lastRefreshedAt: now,
        });
        expiredCount++;
      }
    }

    return { expiredCount };
  },
});
