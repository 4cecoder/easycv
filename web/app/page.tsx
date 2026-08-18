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
  Zap,
  Crown,
  Shield,
  Clock,
  Cpu,
  Layers,
  ArrowRight,
  FileCheck
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
} from "@bytecats/ui-kit";

import { detectJobUrls } from "@/lib/jobUrlDetector";
import { LoadingSplashScreen } from "@/components/LoadingSplashScreen";
import { RecentUploadsList } from "@/components/RecentUploadsList";
import { collectDeviceProfile } from "@/lib/fingerprint";
import { trackUploadStarted, trackUploadComplete } from "@/lib/analytics";
import { trackSampleLoad, trackFileRemove } from "@/lib/tracker";

const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md";

const SAMPLE_PROFILES = [
  {
    role: "Senior Full Stack Engineer",
    person: "Alex Mercer",
    badge: "Staff SWE",
    content: `# Alex Mercer
Senior Full Stack Engineer
alex.mercer@example.com | (555) 234-5678 | San Francisco, CA | github.com/alexmercer

## Professional Summary
High-impact Full Stack Engineer with 7+ years architecting fault-tolerant web applications, distributed systems, and real-time data pipelines. Proven record of reducing API latency by 45% and leading cross-functional teams of 12 engineers.

## Skills
- Languages: TypeScript, JavaScript, Python, Go, SQL
- Frameworks: Next.js, React, Node.js, Express, TailwindCSS
- Cloud & DevOps: AWS (ECS, Lambda, S3, RDS), Docker, Kubernetes, GitHub Actions, Terraform
- Databases: PostgreSQL, Redis, DynamoDB

## Experience
**Senior Frontend Engineer**, TechCorp Solutions (2022 - Present)
- Architected enterprise Next.js micro-frontend platform serving 2.5M daily active users with 99.99% uptime.
- Reduced core web vitals LCP from 2.4s to 0.8s, increasing checkout conversion by 18%.
- Mentored 6 junior/mid engineers and standardized engineering testing practices achieving 94% coverage.

**Software Engineer**, StartupInc (2019 - 2022)
- Built distributed REST and GraphQL microservices in Node.js handling 15,000 requests/sec.
- Implemented real-time collaboration canvas using WebSockets and Redis Pub/Sub with sub-20ms latency.

## Education
**B.S. in Computer Science**, University of Washington (2015 - 2019)`
  },
  {
    role: "Lead AI / ML Systems Architect",
    person: "Dr. Elena Rostova",
    badge: "AI Systems",
    content: `# Dr. Elena Rostova
Lead AI / ML Systems Architect
elena.rostova@example.com | Seattle, WA | linkedin.com/in/elenarostova

## Professional Summary
Staff AI Engineer & Researcher with PhD in Machine Learning. Specialist in local inference pipelines, transformer model distillation, and low-latency embeddings on constrained hardware.

## Skills
- Languages: Python, C++, Rust, CUDA
- AI / ML: PyTorch, Hugging Face, TensorRT, ONNX, vLLM, LangChain
- Infrastructure: Ray, Kubernetes, Triton Inference Server, AWS SageMaker

## Experience
**Principal Machine Learning Engineer**, NeuralScale AI (2021 - Present)
- Optimized 7B parameter LLM inference throughput by 320% using TensorRT-LLM and custom FP8 quantization.
- Built low-latency vector retrieval index processing 100M+ document chunks with sub-15ms p99 latency.

## Education
**Ph.D. in Computer Science (Machine Learning)**, Stanford University (2017 - 2021)`
  },
  {
    role: "Principal Product Director",
    person: "Jordan Blake",
    badge: "Product Lead",
    content: `# Jordan Blake
Principal Product Director
jordan.blake@example.com | New York, NY | linkedin.com/in/jordanblake

## Professional Summary
Strategic Product Leader with 10+ years driving 0-to-1 and growth-stage B2B SaaS platforms. Scaled enterprise ARR from $4M to $38M while leading cross-functional teams of 30+ product managers and designers.

## Skills
- Product Strategy: OKRs, Roadmap Prioritization, Unit Economics, GTM Strategy
- Analytics & Tools: Amplitude, PostHog, SQL, Tableau, Figma, Jira

## Experience
**Principal Product Director**, CloudScale Enterprise (2020 - Present)
- Spearheaded enterprise developer platform expansion, delivering $18.4M new ARR in first 18 months.
- Reduced customer onboarding friction by 62% through streamlined self-serve telemetry workflows.

## Education
**MBA**, Harvard Business School (2016 - 2018)
**B.A. in Economics**, Yale University (2010 - 2014)`
  }
];

export default function UploadPage() {
  const router = useRouter();
  const posthog = usePostHog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    trackFileRemove(files[index]?.name ?? "unknown");
    syncInputFiles(files.filter((_, i) => i !== index));
  }

  function loadSampleProfile(sample: typeof SAMPLE_PROFILES[0]) {
    trackSampleLoad(sample.person);
    const file = new File([sample.content], `${sample.person.toLowerCase().replace(/\s+/g, "_")}_resume.md`, {
      type: "text/markdown",
    });
    syncInputFiles([file]);
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 50);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const device = await collectDeviceProfile();
    const fileTypes = files.map((f) => f.name.split(".").pop() || "");
    const totalSizeKb = files.reduce((sum, f) => sum + f.size / 1024, 0);

    trackUploadStarted({
      fileCount: files.length,
      fileTypes,
      totalSizeKb,
      hasJobDescription: Boolean(jobDescription.trim()),
      hasJobUrl: detectedJobInfo.hasUrl,
      device,
    });

    const formData = new FormData(event.currentTarget);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }

      trackUploadComplete({
        uploadId: body.uploadId,
        processingTimeMs: Date.now() - t0,
        fileCount: files.length,
        device,
      });

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
    <div className="relative min-h-[calc(100vh-3rem)] w-full fluent-subtle-grid pb-16">
      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 pt-8 sm:px-6">
        
        {/* Pro Tier Plan Banner */}
        <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
              <Crown className="size-4.5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight text-foreground">easyCV Pro</span>
                  <span className="rounded bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">$14/mo</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Unlimited exports, scoring, and job matching.
              </span>
            </div>
          </div>
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 shrink-0 text-xs font-semibold px-4 rounded-md shadow-xs transition-all active:scale-95"
            onClick={() => {
              const element = document.getElementById("files");
              element?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Instant Free Preview
          </Button>
        </div>

        {/* Hero Header Section */}
        <div className="flex w-full flex-col items-center gap-2 text-center mt-2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="flex size-2 rounded-full bg-emerald-500" />
            <span>Professional Format</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Build your resume
          </h1>
          <p className="max-w-2xl text-balance text-sm text-muted-foreground font-normal">
            Upload your CVs. Get a clean, professional resume in seconds.
          </p>
        </div>

        {/* Quick-Start Template Gallery */}
        <div className="w-full flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" />
              <span>1-Click Sample Resumes</span>
            </span>
            <span className="text-[11px] text-muted-foreground">Pre-compiled for instant testing</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {SAMPLE_PROFILES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => loadSampleProfile(sample)}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-accent/40 hover:shadow-xs active:scale-[0.98] group"
              >
                <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <FileText className="size-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground truncate">{sample.person}</span>
                    <span className="text-[9px] rounded bg-muted px-1.5 py-0.2 font-mono text-muted-foreground">{sample.badge}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate">{sample.role}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Persistent Browser-Fingerprinted Recent Documents */}
        <RecentUploadsList />

        {/* Main Upload / Job Requisition Card */}
        <Card className="w-full border-border bg-card shadow-xs rounded-lg overflow-hidden">
          <CardContent className="p-6">
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6">
              
              {/* OneDrive / Office 365 Drag & Drop Box */}
              <label
                htmlFor="files"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? "border-primary bg-primary/5 scale-[1.005]"
                    : "border-border/80 bg-muted/20 hover:bg-muted/40 hover:border-primary/60"
                }`}
              >
                <div className="rounded-full bg-background p-3.5 shadow-xs ring-1 ring-border group-hover:ring-primary/40 transition-all">
                  <UploadCloud className={`size-6 ${dragActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-foreground">
                    Drop your resume documents here or <span className="text-primary underline underline-offset-2">browse files</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Accepts PDF, Markdown, and TXT files • Multi-file consolidation supported
                  </p>
                </div>
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

              {/* Uploaded Files Manifest Queue */}
              {files.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
                    <span>Selected Document Queue ({files.length})</span>
                    <button
                      type="button"
                      onClick={() => syncInputFiles([])}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {files.map((file, i) => (
                      <li
                        key={`${file.name}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card px-3 py-2 text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="size-4 text-primary shrink-0" />
                          <span className="truncate font-medium text-foreground">{file.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground shrink-0">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove file"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Target Job Requisition Context */}
              <div className="flex flex-col gap-2.5 rounded-lg bg-muted/30 p-4 border border-border">
                <div className="flex items-center justify-between">
                  <label htmlFor="jobDescription" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    Target Job Requisition (Optional Context for Keyword Optimization)
                  </label>
                  {jobDescription.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setJobDescription("")}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <X className="size-3" /> Clear
                    </button>
                  )}
                </div>
                
                <div className="relative">
                  <textarea
                    id="jobDescription"
                    name="jobDescription"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste job posting text or URL (Indeed, LinkedIn, Greenhouse, Lever, Workday) to tailor output..."
                    rows={2}
                    className={`w-full rounded-md border p-3 text-xs sm:text-sm font-sans transition-all focus:outline-none resize-none min-h-[64px] ${
                      detectedJobInfo.hasUrl
                        ? "border-primary bg-primary/[0.02] focus:ring-1 focus:ring-primary/40"
                        : "border-border bg-card focus:border-primary"
                    }`}
                  />
                  {detectedJobInfo.primaryUrl && (
                    <input type="hidden" name="jobLink" value={detectedJobInfo.primaryUrl} />
                  )}
                </div>

                {detectedJobInfo.hasUrl && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] px-2 py-0.5">
                      <CheckCircle2 className="size-3 mr-1 inline" /> Valid Job Requisition Link
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      Keywords matched automatically
                    </span>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Button 
                  type="submit" 
                  disabled={pending || files.length === 0} 
                  className="w-full h-11 text-xs sm:text-sm font-semibold rounded-md bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Consolidating Master Resume...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Generate Resume</span>
                      <ArrowRight className="size-3.5 ml-1 opacity-70" />
                    </>
                  )}
                </Button>
              </div>

              {error && (
                <Alert variant="destructive" className="rounded-md border-destructive/40">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-xs font-semibold">Upload Failed</AlertTitle>
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Microsoft Azure Style Enterprise Compliance & Trust Strip */}
        <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <Shield className="size-3.5" />
              <span>Private</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Deleted after processing.
            </p>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <FileCheck className="size-3.5" />
              <span>Professional</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Clean, recruiter-ready format.
            </p>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <Clock className="size-3.5" />
              <span>Fast</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Done in under a minute.
            </p>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <Layers className="size-3.5" />
              <span>PDF Export</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Download or share instantly.
            </p>
          </div>
        </div>

        {pending && (
          <LoadingSplashScreen />
        )}

      </main>
    </div>
  );
}

