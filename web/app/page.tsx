"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Plain HTML upload form -- no visual design system here on purpose (that's
// web-frontend-scaffold's job). Accepts only the extensions pipeline.py's
// extract_text() can actually read (SUPPORTED_EXTRACT_EXT, pipeline.py:70):
// .pdf, .txt, .md. Notably NOT .docx/.doc/.pages -- those are in pipeline.py's
// broader VALID_EXT but extract_text() silently returns None for them today.
const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md";

export default function UploadPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main>
      <h1>easyCV</h1>
      <p>
        Upload your CV, resume, and/or LinkedIn export. We&apos;ll consolidate
        them into one clean resume -- free to preview, pay once to download
        the PDF.
      </p>
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="files">Resume file(s)</label>
          <br />
          <input
            id="files"
            type="file"
            name="files"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            required
          />
        </p>
        <button type="submit" disabled={pending}>
          {pending ? "Consolidating..." : "Consolidate my resume"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
