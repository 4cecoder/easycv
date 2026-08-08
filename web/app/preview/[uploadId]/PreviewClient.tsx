"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Briefcase,
  Download,
  FileCheck,
  GraduationCap,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CheckoutButton } from "./CheckoutButton";
import { JobMatchWidget } from "./JobMatchWidget";
import { STE100BulletWidget } from "./STE100BulletWidget";
import { CareerVaultWidget } from "./CareerVaultWidget";
import { exportHtmlResume } from "./exportHtml";
import { analyzeProfileBulletsSTE100, validateBulletSTE100 } from "../../../lib/ste100";
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

const ENGAGEMENT_TIPS = [
  "⚡ Instant AI Consolidation: Processing experience history into single-column LaTeX ATS format.",
  "📊 STE-100 ATS Tip: Quantify achievements with concrete engineering metrics (%, scale, latency, ROI).",
  "🎯 Career Fact: Recruiters spend an average of 7.4 seconds on their initial resume scan.",
  "✨ STE-100 ATS Tip: Avoid multi-column layouts and tables for flawless ATS parsing.",
  "🔗 Career Fact: Tailoring bullet points to match target job keywords increases callback rates by 50%.",
  "📐 STE-100 ATS Tip: Start every bullet with strong action verbs ('Spearheaded', 'Architected', 'Optimized').",
  "🚀 Private Local AI: 100% private inference with zero third-party data tracking."
];

const STAGE_MESSAGES = [
  "⚡ Initializing AI processing engine & reading documents...",
  "📄 Scanning uploaded resume history & extracting career milestones...",
  "🎯 Extracting technical skills, frameworks & tools...",
  "📊 Calculating ASD-STE100 ATS compliance score...",
  "🔗 Analyzing target job description & keyword alignment...",
  "✨ Generating high-impact engineering bullet points...",
  "📐 Compiling executive LaTeX PDF document structure...",
  "🚀 Finalizing your master career profile..."
];

function LoadingEngagementWidget({ status }: { status: "queued" | "processing" }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % ENGAGEMENT_TIPS.length);
    }, 4000);

    const stageInterval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % STAGE_MESSAGES.length);
    }, 2800);
    
    const timeInterval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    
    return () => {
      clearInterval(tipInterval);
      clearInterval(stageInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const estimatedTotal = 45; // seconds
  const remaining = Math.max(0, estimatedTotal - elapsed);
  const progressPercent = Math.min(96, Math.floor((elapsed / estimatedTotal) * 100));

  return (
    <Card className="overflow-hidden border-primary/30 shadow-xl backdrop-blur-xl bg-card/70 relative">
      {/* Dynamic Animated Pulse Glow */}
      <div className="absolute -top-24 -left-24 size-48 rounded-full bg-primary/20 blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 size-48 rounded-full bg-emerald-500/20 blur-3xl animate-pulse pointer-events-none delay-700" />
      
      <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent pb-6 border-b border-primary/10">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex items-center justify-center p-3">
            <Loader2 className="size-10 animate-spin text-primary relative z-10" />
            <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping opacity-60"></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-bold text-xl tracking-tight text-foreground transition-all duration-300">
              {STAGE_MESSAGES[stageIndex]}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {status === "queued"
                ? "Waiting to start... This page updates on its own — no need to refresh."
                : "Consolidating your resume with private local AI..."}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Processing Pipeline</span>
            {remaining > 0 ? (
              <span className="text-primary font-mono font-bold">~{remaining}s remaining</span>
            ) : (
              <span className="text-emerald-500 animate-pulse font-bold">Finalizing Master Profile...</span>
            )}
          </div>
          <div className="h-3 w-full bg-secondary/80 overflow-hidden rounded-full p-0.5 border border-primary/10">
            <div 
              className="h-full bg-gradient-to-r from-primary via-emerald-500 to-primary transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${status === "queued" ? 8 : Math.max(12, progressPercent)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent p-5 border border-primary/20 min-h-[95px] flex flex-col justify-center gap-2 shadow-inner">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              <span>While you wait — Career Insights</span>
            </div>
            <span className="text-muted-foreground font-normal">Tip {tipIndex + 1}/{ENGAGEMENT_TIPS.length}</span>
          </div>
          <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-medium transition-all duration-500 animate-in fade-in" key={tipIndex}>
            {ENGAGEMENT_TIPS[tipIndex]}
          </p>
        </div>
      </CardContent>
    </Card>
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
  const jobMatch = useQuery(api.profiles.getJobMatch, {
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
        <LoadingEngagementWidget status={upload.status} />
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

  const allBullets = (profile.experience || []).flatMap((e) => e.bullets || []);
  const ste100Summary = analyzeProfileBulletsSTE100(allBullets);

  return (
    <PageChrome>
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border bg-card/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={profile.qualityCritical ? "destructive" : hasWarnings ? "warning" : "secondary"}
            className="text-xs font-semibold px-2.5 py-1"
          >
            Quality score: {profile.qualityScore}/{profile.qualityMaxScore}
          </Badge>

          <Badge
            variant={
              ste100Summary.overallScore >= 85
                ? "outline"
                : ste100Summary.overallScore >= 65
                ? "warning"
                : "destructive"
            }
            className="text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5"
          >
            <FileCheck className="size-3.5 text-primary" />
            STE-100 ATS: {ste100Summary.overallScore}/100
          </Badge>

          {jobMatch ? (
            <Badge
              variant={
                jobMatch.matchScore >= 80
                  ? "outline"
                  : jobMatch.matchScore >= 50
                  ? "warning"
                  : "destructive"
              }
              className="text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5"
            >
              <Sparkles className="size-3.5" />
              Job Match: {jobMatch.matchScore}%
            </Badge>
          ) : (
            <a href="#job-match-widget">
              <Badge
                variant="outline"
                className="text-xs font-semibold px-2.5 py-1 text-primary border-primary/40 hover:bg-primary/5 cursor-pointer flex items-center gap-1.5"
              >
                <Target className="size-3.5" />
                Job Match: Not Analyzed &rarr;
              </Badge>
            </a>
          )}
        </div>
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
                        <ul className="ml-4 list-outside list-disc text-sm text-pretty leading-relaxed text-muted-foreground space-y-1.5">
                          {entry.bullets.map((bullet, j) => {
                            const steRes = validateBulletSTE100(bullet);
                            return (
                              <li key={j} className="group">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="flex-1">{bullet}</span>
                                  <Badge
                                    variant={steRes.isCompliant ? "outline" : "warning"}
                                    className={`text-[9px] shrink-0 font-medium px-1.5 py-0.2 ${
                                      steRes.isCompliant
                                        ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                        : "border-amber-500/30 text-amber-600 bg-amber-500/10"
                                    }`}
                                    title={
                                      steRes.improvementTips.length > 0
                                        ? steRes.improvementTips.join("\n")
                                        : "STE-100 Compliant"
                                    }
                                  >
                                    {steRes.isCompliant ? "STE-100" : `${steRes.violations.length} Tips`}
                                  </Badge>
                                </div>
                              </li>
                            );
                          })}
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

      <STE100BulletWidget experience={profile.experience} />

      <JobMatchWidget uploadId={uploadId} initialMatch={jobMatch ?? undefined} />

      <CareerVaultWidget uploadId={uploadId} sessionId={sessionId} profile={profile} />

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
