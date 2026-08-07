"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from "@bytecats/ui-kit";

import { detectJobUrls } from "@/lib/jobUrlDetector";

// Plain HTML upload form under the hood -- styling only (see
// web-frontend-scaffold). Accepts only the extensions pipeline.py's
// extract_text() can actually read (SUPPORTED_EXTRACT_EXT, pipeline.py:70):
// .pdf, .txt, .md. Notably NOT .docx/.doc/.pages -- those are in pipeline.py's
// broader VALID_EXT but extract_text() silently returns None for them today.
const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md";

export default function UploadPage() {
  const router = useRouter();
  const posthog = usePostHog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedJobInfo = detectJobUrls(jobDescription);

  function syncInputFiles(next: File[]) {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    for (const file of next) dt.items.add(file);
    fileInputRef.current.files = dt.files;
    setFiles(next);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length > 0) syncInputFiles(dropped);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function removeFile(index: number) {
    syncInputFiles(files.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      posthog.capture("cv_uploaded", {
        file_count: files.length,
        upload_id: body.uploadId,
        has_job_description: Boolean(jobDescription.trim()),
        has_job_url: detectedJobInfo.hasUrl,
        detected_platforms: detectedJobInfo.detectedPlatforms.map((p) => p.id),
      });
      router.push(`/preview/${body.uploadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" />
          Free preview, pay once to download
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          easyCV
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Drop your messy resume history &mdash; every old CV, resume, and
          LinkedIn export &mdash; and get back one clean, consolidated resume.
        </p>
      </div>

      <Card>
        <CardHeader>
          <label htmlFor="files" className="text-sm font-medium">
            Resume file(s)
          </label>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  const sampleContent = `# Alex Mercer\nSenior Full Stack Engineer\n\n## Experience\n\n**Senior Frontend Engineer**, TechCorp\n- Built scalable Next.js applications\n- Improved performance by 40%\n\n**Software Engineer**, StartupInc\n- Developed REST APIs in Node.js\n- Implemented responsive UI with React`;
                  const file = new File([sampleContent], "alex_mercer_sample_resume.md", { type: "text/markdown" });
                  syncInputFiles([...files, file]);
                }}
              >
                Try Sample Tech Resume (Alex Mercer)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setJobDescription("https://www.indeed.com/viewjob?jk=sample12345");
                }}
              >
                Try Sample Indeed Job URL
              </Button>
            </div>

            <label
              htmlFor="files"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/40 hover:bg-muted/60"
              }`}
            >
              <UploadCloud
                className={`size-8 ${dragActive ? "text-primary" : "text-muted-foreground"}`}
              />
              <p className="text-sm">
                <span className="font-medium text-foreground">
                  Drag & drop files
                </span>{" "}
                <span className="text-muted-foreground">or click to browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, TXT, or Markdown &middot; multiple files supported
              </p>
              <input
                id="files"
                ref={fileInputRef}
                type="file"
                name="files"
                accept={ACCEPTED_EXTENSIONS}
                multiple
                required
                className="sr-only"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>

            <div className="flex flex-col gap-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="jobDescription"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <Sparkles className="size-4 text-primary animate-pulse" />
                  Target Job Description (Optional)
                </label>

                {jobDescription.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setJobDescription("")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    aria-label="Clear job description"
                  >
                    <X className="size-3" />
                    Clear
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground pb-1">
                Paste the target job description or job posting link (Indeed, LinkedIn, etc.) to automatically analyze compatibility and tailor experience bullets on upload.
              </p>

              {/* Auto-detected platform badges */}
              {detectedJobInfo.hasUrl && (
                <div
                  className="flex flex-wrap items-center gap-2 py-1"
                  role="status"
                  aria-live="polite"
                >
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <LinkIcon className="size-3.5 text-primary" />
                    Auto-detected:
                  </span>
                  {detectedJobInfo.detectedPlatforms.map((platform) => {
                    if (platform.id === "indeed") {
                      return (
                        <Badge
                          key="indeed"
                          variant="secondary"
                          className="gap-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 font-medium text-xs px-2.5 py-0.5"
                        >
                          <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
                          Indeed Job Link
                        </Badge>
                      );
                    }
                    if (platform.id === "linkedin") {
                      return (
                        <Badge
                          key="linkedin"
                          variant="secondary"
                          className="gap-1.5 bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 font-medium text-xs px-2.5 py-0.5"
                        >
                          <span className="size-1.5 rounded-full bg-sky-500 animate-pulse" />
                          LinkedIn Job Link
                        </Badge>
                      );
                    }
                    return (
                      <Badge
                        key="other"
                        variant="secondary"
                        className="gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-medium text-xs px-2.5 py-0.5"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Job Posting Link
                      </Badge>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <textarea
                  id="jobDescription"
                  name="jobDescription"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste job post text or Indeed/LinkedIn link here..."
                  rows={4}
                  className={`w-full rounded-md border p-3 text-xs transition-colors focus:outline-none ${
                    detectedJobInfo.hasUrl
                      ? "border-primary/60 bg-primary/[0.02] focus:border-primary ring-1 ring-primary/20"
                      : "border-border bg-card focus:border-primary"
                  }`}
                />
                {detectedJobInfo.primaryUrl && (
                  <input type="hidden" name="jobLink" value={detectedJobInfo.primaryUrl} />
                )}
              </div>

              {detectedJobInfo.hasUrl && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>
                    URL detected! We will auto-extract and match job requirements during resume consolidation.
                  </span>
                </p>
              )}
            </div>

            {files.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {files.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${file.name}`}
                      className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Consolidating&hellip;
                </>
              ) : (
                "Consolidate my resume"
              )}
            </Button>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertCircle />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {pending && (
        <Card aria-live="polite" aria-busy="true">
          <CardHeader className="gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Extracting text and consolidating your resume&hellip;
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3.5 w-1/3" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="mt-2 h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </CardContent>
        </Card>
      )}

      {/* Product Feature Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 bg-muted/20 border-border flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            ⚡ Free Browser-Local AI Extraction (MiniCPM-5)
          </h3>
          <p className="text-xs text-muted-foreground">
            Recursively scans all old PDFs, Markdown files, & LinkedIn exports to extract your complete employment timeline automatically directly in your browser.
          </p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            🛡️ STE-100 ATS Verification
          </h3>
          <p className="text-xs text-muted-foreground">
            Validates sentence length & action verb structures against Simplified Technical English rules for guaranteed parser readability.
          </p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            🎯 Tailored Matching
          </h3>
          <p className="text-xs text-muted-foreground">
            Optional job description match scoring highlights key technical alignment and customizes experience bullets in real-time.
          </p>
        </Card>
      </div>

      {/* Trust & Conversion Optimization Panel */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              🛡️ 30-Day Call-Back Guarantee
            </h3>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Our STE-100 ATS format check guarantees standard parsing compatibility across major hiring platforms.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              🔒 Private & Token-Free
            </h3>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Uses local fallback options & strict privacy boundaries so your career history stays under your control.
          </CardContent>
        </Card>
      </div>

      <div className="border-t pt-8 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} easyCV. All rights reserved. Powered by local & cloud LLMs.</p>
      </div>
    </main>
  );
}
