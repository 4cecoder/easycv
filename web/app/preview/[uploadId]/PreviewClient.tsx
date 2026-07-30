"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Briefcase,
  Download,
  GraduationCap,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CheckoutButton } from "./CheckoutButton";
import { JobMatchWidget } from "./JobMatchWidget";
import { exportHtmlResume } from "./exportHtml";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Separator,
  Skeleton,
} from "@bytecats/ui-kit";

const SKILL_LABELS: [string, string][] = [
  ["languages", "Languages"],
  ["frameworks", "Frameworks"],
  ["cloud_devops", "Cloud/DevOps"],
  ["databases", "Databases"],
  ["tools", "Tools"],
];

function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; easyCV
      </Link>
      {children}
    </main>
  );
}

// This is the FREE part per rf-1 ("gate the final download/export, not the
// building/editing"): the consolidated resume renders unconditionally, no
// payment check gates the render itself. Only the PDF download link is
// gated, and that gate lives entirely in Convex's getByDownloadToken (see
// app/api/download/[token]/route.ts).
//
// Reactive by design: consolidation now runs in a separate, long-lived
// worker process (worker.py), not inside this HTTP request (see that
// file's module docstring for why -- serverless function timeouts). This
// component's useQuery subscribes to the upload's live status and
// re-renders automatically the moment the worker's mutation lands --
// queued -> processing -> ready | error -- no polling loop, no manual
// refresh.
export function PreviewClient({
  uploadId,
  sessionId,
}: {
  uploadId: string;
  sessionId: string;
}) {
  const upload = useQuery(api.uploads.getUpload, {
    uploadId: uploadId as Id<"uploads">,
    sessionId,
  });
  const paymentStatus = useQuery(api.payments.getPaymentStatus, {
    uploadId: uploadId as Id<"uploads">,
    sessionId,
  });

  const [template, setTemplate] = useState<"modern" | "classic" | "minimal">("modern");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [primaryColor, setPrimaryColor] = useState<"blue" | "emerald" | "slate" | "violet">("blue");

  // undefined = still loading the first response; null = confirmed
  // nonexistent or not owned by this session (see convex/authz.ts --
  // both cases return the same shape deliberately, so this can't be used
  // to probe for the existence of someone else's uploadId).
  if (upload === undefined) {
    return (
      <PageChrome>
        <Card>
          <CardHeader className="gap-2 border-b pb-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </PageChrome>
    );
  }

  if (upload === null) {
    return (
      <PageChrome>
        <Alert variant="destructive" role="alert">
          <ShieldAlert />
          <AlertTitle>We can&apos;t find that upload</AlertTitle>
          <AlertDescription>
            It may not exist, or it belongs to a different browser session.
          </AlertDescription>
        </Alert>
      </PageChrome>
    );
  }

  if (upload.status === "queued" || upload.status === "processing") {
    return (
      <PageChrome>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {upload.status === "queued"
                  ? "Waiting to start..."
                  : "Consolidating your resume..."}
              </p>
              <p className="text-sm text-muted-foreground">
                This can take a few minutes, especially on a local model. This
                page updates on its own &mdash; no need to refresh.
              </p>
            </div>
          </CardContent>
        </Card>
      </PageChrome>
    );
  }

  if (upload.status === "error") {
    return (
      <PageChrome>
        <Alert variant="destructive" role="alert">
          <ShieldAlert />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {upload.errorMessage ?? "We couldn't process this upload."} Try
            uploading again from the{" "}
            <Link href="/" className="underline underline-offset-2">
              home page
            </Link>
            .
          </AlertDescription>
        </Alert>
      </PageChrome>
    );
  }

  const profile = upload.structuredProfile;
  if (!profile) {
    // status is "ready" but the row isn't there yet -- a brief in-between
    // moment right as the worker's two mutations (saveStructuredProfile,
    // then markReady) land; the next reactive update resolves it.
    return (
      <PageChrome>
        <Skeleton className="h-40 w-full" />
      </PageChrome>
    );
  }

  const skills = profile.skills;
  const hasWarnings = profile.qualityWarnings && profile.qualityWarnings.length > 0;

  return (
    <PageChrome>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={profile.qualityCritical ? "destructive" : hasWarnings ? "warning" : "secondary"}
        >
          Quality score: {profile.qualityScore}/{profile.qualityMaxScore}
        </Badge>
      </div>

      {profile.qualityCritical ? (
        <Alert variant="destructive" role="alert">
          <ShieldAlert />
          <AlertTitle>This resume needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {profile.qualityWarnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        hasWarnings && (
          <Alert variant="warning" role="status">
            <AlertTriangle />
            <AlertTitle>A few minor things to double-check</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {profile.qualityWarnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )
      )}

      {profile.rawFallback && (
        <Alert variant="warning" role="alert">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t fully structure this resume automatically</AlertTitle>
          <AlertDescription>
            Raw extracted content is preserved, but some sections below may be incomplete.
          </AlertDescription>
        </Alert>
      )}

      {/* Dynamic Style Settings Toolbar */}
      <Card className="border-border/50 bg-muted/10 my-4">
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <h2 className="text-sm font-semibold tracking-tight">Customize CV Preview Style</h2>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-background">Live Customization</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Template Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Style Template</label>
              <div className="flex rounded-md border border-border bg-background p-0.5">
                {(["modern", "classic", "minimal"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTemplate(t)}
                    className={`flex-1 rounded py-1 text-xs font-medium capitalize transition-all ${
                      template === t
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Budget Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Font Budget</label>
              <div className="flex rounded-md border border-border bg-background p-0.5">
                {(["sm", "base", "lg"] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setFontSize(sz)}
                    className={`flex-1 rounded py-1 text-xs font-medium transition-all ${
                      fontSize === sz
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sz === "sm" ? "Compact" : sz === "base" ? "Normal" : "Large"}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Accent Color Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Color Accent</label>
              <div className="flex items-center gap-3 h-8">
                {(["blue", "emerald", "slate", "violet"] as const).map((color) => {
                  const colorMap = {
                    blue: "bg-blue-600 border-blue-200",
                    emerald: "bg-emerald-600 border-emerald-200",
                    slate: "bg-slate-800 border-slate-300",
                    violet: "bg-violet-600 border-violet-200",
                  };
                  return (
                    <button
                      key={color}
                      onClick={() => setPrimaryColor(color)}
                      className={`size-6 rounded-full border transition-all ${colorMap[color]} ${
                        primaryColor === color ? "scale-115 ring-2 ring-primary/40" : "hover:scale-105"
                      }`}
                      title={color}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Styled Resume Preview Card */}
      <Card
        className={`transition-all duration-300 ${
          template === "classic" ? "font-serif tracking-normal" : template === "minimal" ? "font-mono tracking-tight" : "font-sans tracking-tight"
        } ${fontSize === "sm" ? "text-xs" : fontSize === "lg" ? "text-base" : "text-sm"}`}
        style={{
          "--primary-color": primaryColor === "blue" ? "#2563eb" : primaryColor === "emerald" ? "#059669" : primaryColor === "violet" ? "#7c3aed" : "#1e293b",
          "--primary-light": primaryColor === "blue" ? "#eff6ff" : primaryColor === "emerald" ? "#ecfdf5" : primaryColor === "violet" ? "#f5f3ff" : "#f1f5f9",
          "--primary-border": primaryColor === "blue" ? "#bfdbfe" : primaryColor === "emerald" ? "#a7f3d0" : primaryColor === "violet" ? "#ddd6fe" : "#cbd5e1",
        } as React.CSSProperties}
      >
        <CardHeader className={`gap-2 border-b pb-6 ${template === "classic" ? "text-center" : ""}`}>
          <h1 className={`font-bold tracking-tight text-balance ${
            template === "classic" ? "text-3xl text-[var(--primary-color)]" : template === "minimal" ? "text-2xl text-slate-900" : "text-2xl text-[var(--primary-color)]"
          }`}>
            {profile.name ?? "Your consolidated resume"}
          </h1>
          {profile.titles && profile.titles.length > 0 && (
            <p className="text-sm text-muted-foreground font-medium">{profile.titles.join(" / ")}</p>
          )}
          {profile.summary && <p className="text-sm text-pretty leading-relaxed text-muted-foreground">{profile.summary}</p>}
        </CardHeader>

        <CardContent className={`flex flex-col ${fontSize === "sm" ? "gap-4 pt-4" : fontSize === "lg" ? "gap-8 pt-8" : "gap-6 pt-6"}`}>
          {skills && (
            <section className="flex flex-col gap-2">
              <h2 className={
                template === "modern" ? "text-[11px] font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                template === "classic" ? "text-[11px] font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                "text-[11px] font-black uppercase tracking-widest text-slate-800"
              }>
                Skills
              </h2>
              <div className="flex flex-col gap-2.5">
                {SKILL_LABELS.map(([key, label]) => {
                  const items = (skills as Record<string, string[]>)[key];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={key} className="flex flex-wrap items-start gap-2 text-sm">
                      <span className="w-24 shrink-0 font-medium text-muted-foreground">
                        {label}
                      </span>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                        {items.map((item, i) => (
                          <Badge key={i} variant="outline" className="border-[var(--primary-border)] text-[var(--primary-color)] bg-[var(--primary-light)]/30 font-medium">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {profile.experience && profile.experience.length > 0 && (
            <>
              <Separator />
              <section className="flex flex-col gap-4">
                <h2 className={
                  template === "modern" ? "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                  template === "classic" ? "flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                  "flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-800"
                }>
                  <Briefcase className="size-4" />
                  Experience
                </h2>
                <div className="flex flex-col gap-5">
                  {profile.experience.map((entry, i) => (
                    <article key={i} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {entry.title ?? "Role"}
                          {entry.company ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              &mdash; {entry.company}
                            </span>
                          ) : null}
                        </h3>
                        <p className="text-xs whitespace-nowrap text-muted-foreground font-medium">
                          {[entry.start, entry.end].filter(Boolean).join(" - ")}
                          {entry.location ? ` (${entry.location})` : ""}
                        </p>
                      </div>
                      {entry.bullets.length > 0 && (
                        <ul className="ml-4 list-outside list-disc text-sm text-pretty leading-relaxed text-muted-foreground">
                          {entry.bullets.map((bullet, j) => (
                            <li key={j}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {profile.education && profile.education.length > 0 && (
            <>
              <Separator />
              <section className="flex flex-col gap-2">
                <h2 className={
                  template === "modern" ? "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                  template === "classic" ? "flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                  "flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-800"
                }>
                  <GraduationCap className="size-4" />
                  Education
                </h2>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {profile.education.map((entry, i) => (
                    <li key={i} className="leading-relaxed">
                      <span className="font-semibold text-slate-800">{entry.degree ?? ""}</span>
                      {entry.school ? ` — ${entry.school}` : ""}
                      {entry.years ? (
                        <span className="text-muted-foreground font-medium"> ({entry.years})</span>
                      ) : (
                        ""
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {profile.certifications && profile.certifications.length > 0 && (
            <>
              <Separator />
              <section className="flex flex-col gap-2">
                <h2 className={
                  template === "modern" ? "text-[11px] font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                  template === "classic" ? "text-[11px] font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                  "text-[11px] font-black uppercase tracking-widest text-slate-800"
                }>
                  Certifications
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {profile.certifications.map((cert, i) => (
                    <Badge key={i} variant="outline" className="border-[var(--primary-border)] text-[var(--primary-color)] bg-[var(--primary-light)]/20 font-medium">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <JobMatchWidget uploadId={uploadId} />

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
          {paymentStatus?.paid && paymentStatus.downloadToken ? (
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center items-center">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={`/api/download/${paymentStatus.downloadToken}`}>
                  <Download />
                  Download PDF
                </a>
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => exportHtmlResume(profile, template, fontSize, primaryColor)}
                className="w-full sm:w-auto border-primary/20 hover:bg-primary/5 text-primary"
              >
                Export Standalone HTML (Free)
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
              <CheckoutButton uploadId={uploadId} />
              <Button
                variant="outline"
                size="lg"
                onClick={() => exportHtmlResume(profile, template, fontSize, primaryColor)}
                className="w-full sm:w-auto border-primary/20 hover:bg-primary/5 text-primary animate-pulse"
              >
                Export Standalone HTML (Free)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageChrome>
  );
}
