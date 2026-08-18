/**
 * Shared Zod validation schemas for server actions.
 *
 * All user-facing inputs pass through these schemas before touching any
 * server-side logic. Schemas are intentionally strict – extra / unknown
 * keys are stripped by default, preventing mass-assignment attacks.
 */
import { z } from "zod";

// ─── Upload Action ──────────────────────────────────────────────────────────────

/** Allowed file extensions (mirrors pipeline.py SUPPORTED_EXTRACT_EXT). */
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

/** Single file entry inside a FormData submission. */
export const uploadFileSchema = z.object({
  name: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename too long"),
  size: z
    .number()
    .int()
    .positive("File size must be positive"),
  type: z.string().min(1, "MIME type is required"),
});

/** Schema for the file array portion of the upload form. */
export const uploadFileArraySchema = z
  .array(uploadFileSchema)
  .min(1, "At least one file is required")
  .max(10, "Maximum 10 files per upload");

/** Schema for optional text fields that accompany an upload. */
export const uploadMetaSchema = z.object({
  jobDescription: z
    .string()
    .max(50_000, "Job description too long")
    .optional()
    .or(z.literal("")),
  jobLink: z
    .string()
    .url("Invalid URL format")
    .max(2048, "URL too long")
    .optional()
    .or(z.literal("")),
});

// ─── Checkout Action ────────────────────────────────────────────────────────────

/** Valid checkout plan identifiers. */
export const checkoutPlanSchema = z.enum(["single", "pro", "subscription"]);

/** Schema for checkout action input. */
export const checkoutSchema = z.object({
  uploadId: z
    .string()
    .min(1, "uploadId is required")
    .max(128, "uploadId too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid uploadId format"),
  plan: checkoutPlanSchema.optional(),
  isSubscription: z.boolean().optional(),
});

// ─── Job Match Action ───────────────────────────────────────────────────────────

/** Schema for the job-match action input. */
export const jobMatchSchema = z.object({
  uploadId: z
    .string()
    .min(1, "uploadId is required")
    .max(128, "uploadId too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid uploadId format"),
  jobDescription: z
    .string()
    .min(10, "Job description must be at least 10 characters")
    .max(50_000, "Job description too long"),
});

// ─── Derived Types ──────────────────────────────────────────────────────────────

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type UploadMetaInput = z.infer<typeof uploadMetaSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type JobMatchInput = z.infer<typeof jobMatchSchema>;
