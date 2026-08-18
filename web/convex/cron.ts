import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired job postings daily at 3 AM UTC
crons.interval("cleanExpiredJobs", { hours: 24 }, internal.jobPostings.cleanExpiredJobs, {});

// Re-scrape active job postings weekly to check if still available
crons.interval("refreshJobPostings", { hours: 168 }, internal.jobPostings.refreshActiveJobs, {});

export default crons;
