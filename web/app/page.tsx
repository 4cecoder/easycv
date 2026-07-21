"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { AlertCircle, FileText, Loader2, Sparkles, UploadCloud, X } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from "@bytecats/ui-kit";

// Plain HTML upload form under the hood -- styling only (see
// web-frontend-scaffold). Accepts only the extensions pipeline.py's
// extract_text() can actually read (SUPPORTED_EXTRACT_EXT, pipeline.py:70):
// .pdf, .txt, .md. Notably NOT .docx/.doc/.pages -- those are in pipeline.py's
// broader VALID_EXT but extract_text() silently returns None for them today.
const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md";

export default function UploadPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    </main>
  );
}
