import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed data mutation for easy testing and E2E preview demonstrations.
 * Populates sample uploads, resume files, structured profiles, and job matches.
 */
export const seedSampleData = mutation({
  args: {
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const targetSessionId = args.sessionId ?? "seed-demo-session-123";
    const now = Date.now();

    // 1. Create completed upload row
    const uploadId = await ctx.db.insert("uploads", {
      sessionId: targetSessionId,
      status: "ready",
      attempts: 1,
      createdAt: now,
      jobDescription: "Senior Full Stack Engineer specializing in TypeScript, Next.js, Python, and LLM automation pipelines.",
      jobLink: "https://www.indeed.com/viewjob?jk=demo123456789",
    });

    // 2. Insert sample structured profile (STE-100 validated)
    await ctx.db.insert("structuredProfiles", {
      uploadId,
      name: "Alex Mercer",
      contact: {
        email: "alex.mercer@example.com",
        phone: "+1 (555) 019-2834",
        location: "San Francisco, CA",
        linkedin: "https://linkedin.com/in/alexmercer-dev",
        website: "https://alexmercer.dev",
      },
      titles: ["Senior Full Stack Engineer", "LLM Systems Architect"],
      summary: "Full stack engineer with 7+ years of experience building resilient cloud services, TypeScript frontends, and autonomous Python pipelines.",
      skills: {
        languages: ["TypeScript", "Python", "Go", "SQL"],
        frameworks: ["Next.js", "React", "Node.js", "FastAPI"],
        cloud_devops: ["AWS", "Docker", "Kubernetes", "GitHub Actions"],
        databases: ["PostgreSQL", "Convex", "Redis"],
        tools: ["Git", "PyMuPDF", "Playwright", "Vitest"],
      },
      experience: [
        {
          title: "Lead Platform Engineer",
          company: "Bytecats Automation Inc.",
          start: "2023-01",
          end: "Present",
          location: "San Francisco, CA",
          bullets: [
            "Designed and deployed autonomous Python test and refactoring pipelines serving over 10,000 daily jobs.",
            "Built Next.js and Convex real-time web UI, reducing candidate resume processing latency by 45%.",
            "Implemented STE-100 Simplified Technical English validation rules to optimize candidate ATS score matching.",
          ],
        },
        {
          title: "Senior Full Stack Engineer",
          company: "Apex Cloud Systems",
          start: "2020-03",
          end: "2022-12",
          location: "San Jose, CA",
          bullets: [
            "Architected distributed REST and GraphQL microservices supporting 2M+ active monthly requests.",
            "Automated PDF document processing using PyMuPDF and OCR bounding-box extraction routines.",
          ],
        },
      ],
      education: [
        {
          degree: "B.S. Computer Science",
          school: "University of California, Berkeley",
          years: "2016 - 2020",
        },
      ],
      certifications: ["AWS Certified Solutions Architect", "Certified Kubernetes Administrator (CKA)"],
      languagesSpoken: ["English (Native)", "Spanish (Professional)"],
      qualityScore: 94,
      qualityMaxScore: 100,
      qualityWarnings: [],
      qualityCritical: false,
    });

    // 3. Insert sample job match output
    await ctx.db.insert("resumeMatches", {
      uploadId,
      matchScore: 92,
      matchedKeywords: ["TypeScript", "Python", "Next.js", "Convex", "Docker", "LLM"],
      missingKeywords: ["GraphQL"],
      gapAnalysis: "Strong alignment across core languages, frameworks, and deployment tools. Minor gap in GraphQL experience.",
      tailoredBullets: [
        "Architected autonomous Python LLM pipelines and Next.js interfaces directly matching Senior Full Stack requirements.",
        "Streamlined resume ingestion workflows using Docker and real-time Convex state synchronization.",
      ],
    });

    return {
      success: true,
      uploadId,
      sessionId: targetSessionId,
    };
  },
});
