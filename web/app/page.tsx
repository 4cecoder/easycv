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
  Crown
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

const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md";

// Ambient background simulating WebGL fluid/aurora effect
function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-background">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] mix-blend-screen animate-pulse duration-10000" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] mix-blend-screen animate-pulse duration-7000 delay-1000" />
      <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-purple-500/10 blur-[100px] mix-blend-screen animate-pulse duration-5000 delay-700" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
    </div>
  );
}

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
    <>
      <AmbientBackground />
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-12 sm:px-6 font-sans">
        
        {/* Pro Tier Conversion Banner */}
        <div className="w-full flex items-center justify-between rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Crown className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">Pro Membership ($14/mo)</span>
              <span className="text-xs text-muted-foreground">Unlimited ATS exports, matching, & cover letters vs Free Instant Preview</span>
            </div>
          </div>
          <Button variant="default" size="sm" className="h-8 text-xs font-semibold rounded-full shadow-sm">
            Upgrade Now
          </Button>
        </div>

        <div className="flex w-full flex-col items-center gap-2 text-center mt-2">
          <h1 className="text-4xl font-bold tracking-tighter text-balance sm:text-5xl bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
            Intelligent Resume Consolidation
          </h1>
          <p className="max-w-xl text-balance text-sm text-muted-foreground">
            Drop your messy work history below. We'll automatically build one unified, ATS-optimized master resume in seconds.
          </p>
        </div>

        <Card className="w-full border-border/50 bg-card/60 backdrop-blur-xl shadow-xl shadow-primary/5 rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              
              {/* Highlighted 1-Click Samples */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Try it Instantly</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all flex justify-start gap-3 px-4 rounded-xl group"
                    onClick={() => {
                      const sampleContent = `# Alex Mercer\nSenior Full Stack Engineer\n\n## Experience\n\n**Senior Frontend Engineer**, TechCorp\n- Built scalable Next.js applications\n- Improved performance by 40%\n\n**Software Engineer**, StartupInc\n- Developed REST APIs in Node.js\n- Implemented responsive UI with React`;
                      const file = new File([sampleContent], "alex_mercer_sample_resume.md", { type: "text/markdown" });
                      syncInputFiles([...files, file]);
                    }}
                  >
                    <div className="rounded-full bg-primary/20 p-1.5 group-hover:scale-110 transition-transform">
                      <Zap className="size-3.5 text-primary" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-xs font-semibold">Load Sample Resume</span>
                      <span className="text-[10px] text-muted-foreground">Alex Mercer, SWE</span>
                    </div>
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all flex justify-start gap-3 px-4 rounded-xl group"
                    onClick={() => {
                      setJobDescription("https://www.indeed.com/viewjob?jk=sample12345");
                    }}
                  >
                    <div className="rounded-full bg-emerald-500/20 p-1.5 group-hover:scale-110 transition-transform">
                      <LinkIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-xs font-semibold">Load Sample Job</span>
                      <span className="text-[10px] text-muted-foreground">Indeed JD Link</span>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Upload Area */}
              <label
                htmlFor="files"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border"
                }`}
              >
                <div className="rounded-full bg-background/80 p-3 shadow-sm ring-1 ring-border/50 group-hover:ring-primary/30 transition-all">
                  <UploadCloud className={`size-6 ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    Drag & drop files or <span className="text-primary group-hover:underline">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, TXT, or Markdown supported
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

              {files.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm backdrop-blur-sm"
                    >
                      <div className="rounded bg-primary/10 p-1.5">
                        <FileText className="size-3.5 text-primary" />
                      </div>
                      <span className="min-w-0 flex-1 truncate font-medium text-xs">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Job Target */}
              <div className="flex flex-col gap-3 rounded-xl bg-muted/30 p-4 border border-border/40">
                <div className="flex items-center justify-between">
                  <label htmlFor="jobDescription" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    Target Job Context (Optional)
                  </label>
                  {jobDescription.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setJobDescription("")}
                      className="text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
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
                    placeholder="Paste job posting text or URL to tailor output..."
                    rows={2}
                    className={`w-full rounded-lg border p-3 text-sm transition-all focus:outline-none resize-none min-h-[60px] ${
                      detectedJobInfo.hasUrl
                        ? "border-primary/50 bg-primary/[0.02] focus:border-primary focus:ring-1 focus:ring-primary/30"
                        : "border-border/50 bg-background focus:border-primary"
                    }`}
                  />
                  {detectedJobInfo.primaryUrl && (
                    <input type="hidden" name="jobLink" value={detectedJobInfo.primaryUrl} />
                  )}
                </div>

                {detectedJobInfo.hasUrl && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] px-2 py-0">
                      <CheckCircle2 className="size-3 mr-1 inline" /> Valid URL
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">Will extract requirements automatically</span>
                  </div>
                )}
              </div>

              <Button 
                type="submit" 
                disabled={pending || files.length === 0} 
                className="w-full h-12 text-sm font-bold rounded-xl shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Consolidating Profile...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Generate Master Resume
                  </>
                )}
              </Button>

              {error && (
                <Alert variant="destructive" className="rounded-xl border-destructive/30">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-sm font-semibold">Upload Failed</AlertTitle>
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {pending && (
          <div className="w-full rounded-xl border border-border/50 bg-card/60 p-6 backdrop-blur-sm shadow-sm animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="size-5 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Extracting & analyzing history...</p>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
