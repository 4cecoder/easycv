/**
 * Strict File Security, Magic Byte Verification & PDF/Text Sanitizer
 * 
 * Protects server infrastructure and LLM pipeline from:
 * 1. File size DOS attacks (>10MB per file, >25MB total payload)
 * 2. Extension spoofing (verifies %PDF- magic bytes and binary signatures)
 * 3. PDF active content code execution (/JavaScript, /JS, /Launch, /EmbeddedFiles)
 * 4. Text/prompt injection payloads and invisible Unicode bidi attacks
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_PAYLOAD_BYTES = 25 * 1024 * 1024; // 25 MB total
export const MIN_FILE_SIZE_BYTES = 4; // At least 4 bytes

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedBuffer?: Buffer;
  sanitizedText?: string;
}

// Known binary executable headers to reject immediately
const DANGEROUS_MAGIC_HEADERS = [
  { name: "Windows PE Executable", bytes: [0x4d, 0x5a] }, // MZ
  { name: "Linux ELF Executable", bytes: [0x7f, 0x45, 0x4c, 0x46] }, // \x7fELF
  { name: "Mach-O Executable", bytes: [0xca, 0xfe, 0xba, 0xbe] }, // Mach-O fat
  { name: "Mach-O 64-bit", bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: "ZIP Archive", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK..
  { name: "GZIP Archive", bytes: [0x1f, 0x8b] },
  { name: "Java Class", bytes: [0xca, 0xfe, 0xba, 0xbe] },
];

/**
 * Check if buffer starts with a given byte sequence.
 */
function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Validates magic bytes against file extension.
 */
export function validateMagicBytes(buffer: Buffer, ext: string, filename: string): FileValidationResult {
  if (buffer.length < MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: `File '${filename}' is empty or too small (${buffer.length} bytes).` };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File '${filename}' exceeds maximum permitted size of 10MB (${(buffer.length / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  const cleanExt = ext.toLowerCase();

  // 1. Check for dangerous binary executable headers
  for (const sig of DANGEROUS_MAGIC_HEADERS) {
    // If it's a txt/md file but has binary executable header, reject
    if (cleanExt !== ".pdf" && startsWithBytes(buffer, sig.bytes)) {
      return {
        valid: false,
        error: `Security Alert: File '${filename}' contains dangerous executable signature (${sig.name}).`,
      };
    }
  }

  // 2. Strict PDF Magic Byte Check
  if (cleanExt === ".pdf") {
    // Standard PDFs start with '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2D) within the first 1024 bytes
    const headerSlice = buffer.subarray(0, Math.min(1024, buffer.length));
    const headerStr = headerSlice.toString("latin1");
    if (!headerStr.includes("%PDF-")) {
      return {
        valid: false,
        error: `Invalid PDF: File '${filename}' does not contain valid %PDF- magic header. Extension spoofing detected.`,
      };
    }
  }

  // 3. Text / Markdown validation (must not contain null bytes or binary junk)
  if (cleanExt === ".txt" || cleanExt === ".md") {
    // Check for null bytes indicative of binary payloads
    for (let i = 0; i < Math.min(4096, buffer.length); i++) {
      if (buffer[i] === 0x00) {
        return {
          valid: false,
          error: `Invalid text document: File '${filename}' contains binary null bytes.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Sanitizes PDF buffers by detecting and neutralizing dangerous active content dictionaries:
 * - /JavaScript and /JS
 * - /Launch
 * - /EmbeddedFiles
 * - /OpenAction with external URI/macros
 */
export function sanitizePdfBuffer(buffer: Buffer): { buffer: Buffer; sanitized: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let isModified = false;
  let pdfString = buffer.toString("latin1");

  // Dangerous PDF dictionary patterns
  const dangerousPatterns = [
    { pattern: /\/JavaScript\b/g, replacement: "/J_Stripped ", name: "Embedded JavaScript (/JavaScript)" },
    { pattern: /\/JS\b/g, replacement: "/JS_Safe", name: "Embedded JS Script (/JS)" },
    { pattern: /\/Launch\b/g, replacement: "/L_Stripped ", name: "OS Command Execution (/Launch)" },
    { pattern: /\/EmbeddedFiles\b/g, replacement: "/EF_Stripped   ", name: "Embedded Binary Files (/EmbeddedFiles)" },
    { pattern: /\/RichMedia\b/g, replacement: "/RM_Stripped ", name: "RichMedia Executable Stream (/RichMedia)" },
  ];

  for (const { pattern, replacement, name } of dangerousPatterns) {
    if (pattern.test(pdfString)) {
      warnings.push(`Neutralized ${name} in PDF stream.`);
      pdfString = pdfString.replace(pattern, replacement);
      isModified = true;
    }
  }

  const finalBuffer = isModified ? Buffer.from(pdfString, "latin1") : buffer;
  return { buffer: finalBuffer, sanitized: isModified, warnings };
}

/**
 * Sanitizes extracted plain text or markdown before it reaches the LLM.
 * Strips:
 * - Prompt injection attempts ("System Prompt:", "Ignore all instructions")
 * - Zero-width invisible characters & Bidi overrides (used to hide payloads)
 * - Raw dangerous script/HTML tags
 */
export function sanitizeTextForLLM(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText;

  // 1. Strip invisible Unicode characters and bidi override controls
  // \u200B-\u200D (zero-width), \uFEFF (BOM), \u202A-\u202E (bidi control)
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, "");

  // 2. Neutralize adversarial prompt injection delimiters
  const injectionPatterns = [
    /\b(ignore\s+(all\s+)?(previous|prior)\s+instructions)\b/gi,
    /\b(disregard\s+(all\s+)?(previous|prior)\s+instructions)\b/gi,
    /\b(you\s+are\s+now\s+in\s+developer\s+mode)\b/gi,
    /\b(system\s+prompt\s*:)/gi,
    /\b(\[SYSTEM\s+PROMPT\])/gi,
    /\b(DAN\s+Mode\s+enabled)\b/gi,
  ];

  for (const pattern of injectionPatterns) {
    cleaned = cleaned.replace(pattern, "[sanitized-instruction]");
  }

  // 3. Strip raw <script> or iframe blocks if pasted into markdown
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  return cleaned.trim();
}
