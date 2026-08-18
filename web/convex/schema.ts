import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Mirrors pipeline.py's structured-profile JSON shape (LLM_CONSOLIDATE_SYSTEM,
// pipeline.py:476-512) and the score_structured_data() return shape
// (pipeline.py:663-750). Python remains the single source of truth for both
// consolidation and scoring — this schema only stores what the caller computed.

// Exported so convex/profiles.ts can reuse the exact same validators for its
// mutation args instead of duplicating (and risking drift from) this shape.
export const contact = v.object({
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  location: v.optional(v.string()),
  linkedin: v.optional(v.string()),
  website: v.optional(v.string()),
});

export const skills = v.object({
  languages: v.array(v.string()),
  frameworks: v.array(v.string()),
  cloud_devops: v.array(v.string()),
  databases: v.array(v.string()),
  tools: v.array(v.string()),
});

export const experienceEntry = v.object({
  title: v.optional(v.string()),
  company: v.optional(v.string()),
  start: v.optional(v.string()),
  end: v.optional(v.string()),
  location: v.optional(v.string()),
  bullets: v.array(v.string()),
});

export const educationEntry = v.object({
  degree: v.optional(v.string()),
  school: v.optional(v.string()),
  years: v.optional(v.string()),
});

export default defineSchema({
  // Opaque per-visitor upload session. sessionId is the ONLY identity concept
  // for now (a random token handed to the browser) — no userId/auth here.
  // Auth (google-oauth) is a separate, deferred item.
  uploads: defineTable({
    sessionId: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    attempts: v.number(),
    processingStartedAt: v.optional(v.number()),
    createdAt: v.number(),
    jobDescription: v.optional(v.string()),
    jobLink: v.optional(v.string()),
    consolidationMetadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_session", ["sessionId", "createdAt"]),

  // Mirrors pipeline.py's FoundFile dataclass (pipeline.py:77-84). Raw bytes
  // live in Convex file storage (storageId); this row is metadata only.
  resumeFiles: defineTable({
    uploadId: v.id("uploads"),
    filename: v.string(),
    storageId: v.id("_storage"),
    ext: v.string(),
    sizeKb: v.number(),
    // mirrors classify() at pipeline.py:101:
    // "cv" | "resume" | "linkedin" | "profile" | "cover-letter" | "other"
    category: v.string(),
    extractedText: v.optional(v.string()),
    year: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    isHistorical: v.optional(v.boolean()),
  }).index("by_upload", ["uploadId"]),

  // One row per upload. Mirrors the JSON shape llm_consolidate() returns
  // (pipeline.py:559) plus the score_structured_data() fields
  // (pipeline.py:663-750), which the caller computes in Python and stores
  // here as-is — no scoring logic is reimplemented in TypeScript.
  structuredProfiles: defineTable({
    uploadId: v.id("uploads"),
    name: v.optional(v.string()),
    contact: v.optional(contact),
    titles: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    skills: v.optional(skills),
    experience: v.optional(v.array(experienceEntry)),
    education: v.optional(v.array(educationEntry)),
    certifications: v.optional(v.array(v.string())),
    languagesSpoken: v.optional(v.array(v.string())),
    // Holds the `_raw` unparsed-LLM-output case (pipeline.py:584/587).
    rawFallback: v.optional(v.string()),
    // Mirrors score_structured_data()'s return dict (pipeline.py:663-750).
    qualityScore: v.number(),
    qualityMaxScore: v.number(),
    qualityWarnings: v.array(v.string()),
    qualityCritical: v.boolean(),
    // Set once a PDF has been compiled — the download gate serves this.
    pdfStorageId: v.optional(v.id("_storage")),
  }).index("by_upload", ["uploadId"]),

  jobMatches: defineTable({
    uploadId: v.id("uploads"),
    matchScore: v.number(),
    matchedKeywords: v.array(v.string()),
    missingKeywords: v.array(v.string()),
    gapAnalysis: v.string(),
    tailoredBullets: v.array(v.string()),
  }).index("by_upload", ["uploadId"]),

  payments: defineTable({
    uploadId: v.id("uploads"),
    stripeSessionId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    // "pending" | "paid" | "failed" | "expired"
    status: v.string(),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    downloadToken: v.optional(v.string()),
    downloadCount: v.number(),
  })
    .index("by_stripe_session", ["stripeSessionId"])
    .index("by_download_token", ["downloadToken"])
    .index("by_upload", ["uploadId"]),

  candidateInsights: defineTable({
    sessionId: v.string(),
    uploadId: v.optional(v.id("uploads")),
    targetRole: v.optional(v.string()),
    targetSeniority: v.optional(v.string()),
    targetSalaryRange: v.optional(v.string()),
    targetCompanies: v.optional(v.array(v.string())),
    workPreference: v.optional(v.string()),
    yearsExperience: v.optional(v.number()),
    primaryIndustry: v.optional(v.string()),
    activelyLooking: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_upload", ["uploadId"]),

  // Silent device telemetry — collected on every upload and page view.
  // Pairs browser fingerprint with resume processing data.
  deviceTelemetry: defineTable({
    sessionId: v.string(),
    uploadId: v.optional(v.id("uploads")),
    // Browser
    browser: v.string(),
    browserVersion: v.string(),
    os: v.string(),
    osVersion: v.string(),
    language: v.string(),
    timezone: v.string(),
    // Hardware
    cores: v.number(),
    memoryGb: v.number(),
    gpuRenderer: v.string(),
    platform: v.string(),
    // Display
    screenWidth: v.number(),
    screenHeight: v.number(),
    pixelRatio: v.number(),
    // Capabilities
    touchSupport: v.boolean(),
    webgl: v.boolean(),
    webgpu: v.boolean(),
    tier: v.string(), // "budget" | "mid" | "high" | "unknown"
    // Connection
    connectionType: v.string(),
    downlink: v.number(),
    // Upload context
    processingTimeMs: v.optional(v.number()),
    fileCount: v.optional(v.number()),
    fileTypes: v.optional(v.array(v.string())),
    totalSizeKb: v.optional(v.number()),
    // Funnel position
    reachedPreview: v.optional(v.boolean()),
    reachedCheckout: v.optional(v.boolean()),
    paid: v.optional(v.boolean()),
    timestamp: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_upload", ["uploadId"])
    .index("by_tier", ["tier", "timestamp"]),

  deviceIdentities: defineTable({
    deviceHash: v.string(),
    sessionId: v.string(),
    identityId: v.string(),
    email: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    tier: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_device", ["deviceHash"])
    .index("by_identity", ["identityId"])
    .index("by_email", ["email"]),

  identityEvents: defineTable({
    deviceHash: v.string(),
    identityId: v.optional(v.string()),
    event: v.string(),
    uploadId: v.optional(v.id("uploads")),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_device", ["deviceHash", "timestamp"])
    .index("by_identity", ["identityId"])
    .index("by_event", ["event", "timestamp"]),

  // Silent audit log — every user action, paired with identity.
  // Used for abuse detection, benchmarking, and bad actor tracking.
  auditLog: defineTable({
    sessionId: v.string(),
    deviceHash: v.string(),
    identityId: v.optional(v.string()),
    uploadId: v.optional(v.id("uploads")),
    // What happened
    action: v.string(),         // "page_view" | "file_upload" | "file_remove" | "job_paste" | "preview_open" | "tab_switch" | "copy_text" | "export_html" | "checkout_start" | "checkout_done" | "checkout_fail" | "download" | "wizard_step" | "sample_load" | "bullet_edit"
    target: v.optional(v.string()),  // specific target (tab name, file name, etc.)
    // Payload
    meta: v.optional(v.any()),  // file sizes, durations, scores, errors
    // Timing
    clientTimestamp: v.number(), // when the user did it
    serverTimestamp: v.number(), // when we recorded it
    // Risk signals (computed client-side, stored for correlation)
    rapidFire: v.optional(v.boolean()),  // <2s between actions
    suspicious: v.optional(v.boolean()), // heuristic flag
  })
    .index("by_session", ["sessionId", "serverTimestamp"])
    .index("by_device", ["deviceHash", "serverTimestamp"])
    .index("by_identity", ["identityId", "serverTimestamp"])
    .index("by_action", ["action", "serverTimestamp"])
    .index("by_upload", ["uploadId"]),

  // Per-user behavior score — updated silently, never shown to user.
  // Determines trust level, rate limits, and abuse flags.
  userBehaviorScore: defineTable({
    sessionId: v.string(),
    deviceHash: v.string(),
    identityId: v.optional(v.string()),
    // Scores (0-100, higher = more trustworthy)
    trustScore: v.number(),       // overall trust
    contentScore: v.number(),     // quality of uploaded content
    engagementScore: v.number(),  // how deeply they use the product
    // Abuse signals
    totalUploads: v.number(),
    totalDownloads: v.number(),
    rapidActionCount: v.number(),     // actions <2s apart
    suspiciousActionCount: v.number(), // flagged actions
    averageUploadQuality: v.number(), // avg content score of uploads
    // Flags
    flagged: v.optional(v.boolean()),
    flagReason: v.optional(v.string()),
    // Lifetime
    firstSeenAt: v.number(),
    lastActiveAt: v.number(),
    totalSessionDuration: v.number(), // ms
  })
    .index("by_session", ["sessionId"])
    .index("by_device", ["deviceHash"])
    .index("by_identity", ["identityId"])
    .index("by_trust", ["trustScore"]),

  // Usage quotas for anti-abuse and free tier gating (e.g. 2 auto-improves per fingerprint)
  usageQuotas: defineTable({
    sessionId: v.string(),
    autoImproveCount: v.number(),
    sampleViewCount: v.optional(v.number()),
    lastUsedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // FAQ Chatbot interactions and user feedback tracking
  faqQueries: defineTable({
    sessionId: v.string(),
    question: v.string(),
    answer: v.string(),
    category: v.optional(v.string()),
    feedback: v.optional(v.string()), // "helpful" | "unhelpful"
    timestamp: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_category", ["category"]),

  // User account signup & email verification (via Resend)
  userAccounts: defineTable({
    email: v.string(),
    sessionId: v.string(),
    verified: v.boolean(),
    verificationCode: v.optional(v.string()),
    codeExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    lastLoginAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_session", ["sessionId"]),
});
