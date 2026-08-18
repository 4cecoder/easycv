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
  Copy,
  Check,
  FileText,
  Code,
  Layers,
  Settings2,
  Printer,
  Share2,
  ChevronRight,
  Award,
  Crown
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
  Skeleton,
} from "@bytecats/ui-kit";

const SKILL_LABELS: [string, string][] = [
  ["languages", "Languages"],
  ["frameworks", "Frameworks"],
  ["cloud_devops", "Cloud/DevOps"],
  ["databases", "Databases"],
  ["tools", "Tools"],
];

const ENGAGEMENT_TIPS = [
  "⚡ Instant AI Consolidation: Processing experience history into single-column LaTeX ATS format.",
  "📊 STE-100 ATS Tip: Quantify achievements with concrete engineering metrics (%, scale, latency, ROI).",
  "🎯 Career Fact: Recruiters spend an average of 7.4 seconds on their initial resume scan.",
  "✨ STE-100 ATS Tip: Avoid multi-column layouts and tables for flawless ATS parsing.",
  "🔗 Career Fact: Tailoring bullet points to match target job keywords increases callback rates by 50%.",
  "📐 STE-100 ATS Tip: Start every bullet with strong action verbs ('Spearheaded', 'Architected', 'Optimized').",
  "🚀 AI Pipeline: Your files are processed server-side by GPT-4o and never stored after processing."
];

const STAGE_MESSAGES = [
  "⚡ Initializing AI processing engine & reading documents...",
  "📄 Scanning uploaded resume history & extracting career milestones...",
  "🎯 Extracting technical skills, frameworks & tools...",
  "📊 Calculating ATS Technical Optimization score...",
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
    <Card className="overflow-hidden border-primary/30 shadow-md bg-card/90">
      <CardHeader className="bg-primary/[0.04] pb-6 border-b border-border">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center justify-center p-3 rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-lg tracking-tight text-foreground transition-all duration-300">
              {STAGE_MESSAGES[stageIndex]}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {status === "queued"
                ? "Waiting to start... This page updates on its own — no need to refresh."
                : "Consolidating your resume with AI..."}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Compilation Progress</span>
            {remaining > 0 ? (
              <span className="text-primary font-mono font-bold">~{remaining}s remaining</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Finalizing Master Profile...</span>
            )}
          </div>
          <div className="h-2 w-full bg-muted overflow-hidden rounded-full p-0.5 border border-border">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${status === "queued" ? 8 : Math.max(12, progressPercent)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 border border-border flex flex-col gap-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              <span>ATS Precision Insight</span>
            </div>
            <span className="text-muted-foreground font-normal">Tip {tipIndex + 1}/{ENGAGEMENT_TIPS.length}</span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed font-medium transition-all duration-500 animate-in fade-in" key={tipIndex}>
            {ENGAGEMENT_TIPS[tipIndex]}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

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

  const [activeTab, setActiveTab] = useState<"document" | "match" | "linter" | "vault" | "raw">("document");
  const [template, setTemplate] = useState<"modern" | "classic" | "minimal">("modern");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [primaryColor, setPrimaryColor] = useState<"blue" | "emerald" | "slate" | "violet">("blue");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Keyboard shortcut for switching tabs (1-5)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "1") setActiveTab("document");
      if (e.key === "2") setActiveTab("match");
      if (e.key === "3") setActiveTab("linter");
      if (e.key === "4") setActiveTab("vault");
      if (e.key === "5") setActiveTab("raw");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function handleCopyText(text: string, sectionKey: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  if (upload === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Card className="border-border">
          <CardHeader className="gap-2 border-b pb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (upload === null) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Alert variant="destructive" role="alert">
          <ShieldAlert className="size-4" />
          <AlertTitle className="text-sm font-semibold">Upload not found</AlertTitle>
          <AlertDescription className="text-xs">
            This upload may not exist or belongs to a different browser session.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (upload.status === "queued" || upload.status === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
        <LoadingEngagementWidget status={upload.status} />
      </div>
    );
  }

  if (upload.status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Alert variant="destructive" role="alert">
          <ShieldAlert className="size-4" />
          <AlertTitle className="text-sm font-semibold">Processing Failed</AlertTitle>
          <AlertDescription className="text-xs">
            {upload.errorMessage ?? "We couldn't process this upload."} Try{" "}
            <Link href="/" className="underline underline-offset-2 font-semibold">
              uploading again
            </Link>
            .
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const profile = upload.structuredProfile;
  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const skills = profile.skills;
  const hasWarnings = profile.qualityWarnings && profile.qualityWarnings.length > 0;
  const allBullets = (profile.experience || []).flatMap((e) => e.bullets || []);
  const ste100Summary = analyzeProfileBulletsSTE100(allBullets);

  // Generate plain text version for instant 1-click clipboard
  const plainTextResume = `
${profile.name ?? ""}
${profile.titles?.join(" / ") ?? ""}
${profile.contact ? Object.values(profile.contact).filter(Boolean).join(" | ") : ""}

SUMMARY
${profile.summary ?? ""}

SKILLS
${SKILL_LABELS.map(([key, label]) => {
  const items = (skills as Record<string, string[]> | undefined)?.[key];
  return items && items.length > 0 ? `${label}: ${items.join(", ")}` : null;
}).filter(Boolean).join("\n")}

EXPERIENCE
${(profile.experience || []).map((e) => `
${e.title ?? "Role"} - ${e.company ?? ""} (${[e.start, e.end].filter(Boolean).join(" - ")})
${(e.bullets || []).map((b) => `• ${b}`).join("\n")}
`).join("\n")}

EDUCATION
${(profile.education || []).map((e) => `${e.degree ?? ""} - ${e.school ?? ""} (${e.years ?? ""})`).join("\n")}
`.trim();

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full fluent-subtle-grid pb-20">
      
      {/* Microsoft 365 / Azure Command Ribbon */}
      <div className="sticky top-12 z-30 w-full border-b border-border bg-card/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          
          {/* Left: Navigation & Document Meta */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              &larr; <span className="font-semibold">New Resume</span>
            </Link>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-xs font-bold text-foreground truncate max-w-[180px] sm:max-w-none">
                {profile.name ? `${profile.name} — ATS Master` : "ATS Master Resume"}
              </span>
              <span className="rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold">
                LaTeX Compiled
              </span>
            </div>
          </div>

          {/* Right: Rapid Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyText(plainTextResume, "all")}
              className="h-8 text-xs font-medium border-border hover:bg-muted"
            >
              {copiedSection === "all" ? (
                <>
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 mr-1.5" />
                  <span>Copied Plaintext!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 mr-1.5" />
                  <span>Copy Text</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => exportHtmlResume(profile, template, fontSize, primaryColor)}
              className="h-8 text-xs font-medium border-border hover:bg-muted"
            >
              <Share2 className="size-3.5 mr-1.5" />
              <span>Export HTML (Free)</span>
            </Button>

            {paymentStatus?.paid && paymentStatus.downloadToken ? (
              <Button asChild size="sm" className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs">
                <a href={`/api/download/${paymentStatus.downloadToken}`}>
                  <Download className="size-3.5 mr-1.5" />
                  <span>Download PDF</span>
                </a>
              </Button>
            ) : (
              <div className="scale-90 origin-right">
                <CheckoutButton uploadId={uploadId} />
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6 sm:px-6">
        
        {/* Power BI Style KPI Metric Scorecards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tile 1: Overall Quality Score */}
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Profile Quality</span>
              <Award className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">{profile.qualityScore}</span>
              <span className="text-xs text-muted-foreground font-mono">/ {profile.qualityMaxScore}</span>
            </div>
            <span className={`text-[11px] font-semibold ${profile.qualityCritical ? "text-destructive" : hasWarnings ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {profile.qualityCritical ? "Needs Critical Fixes" : hasWarnings ? "Minor Polish Suggested" : "Optimal Quality"}
            </span>
          </div>

          {/* Tile 2: ASD-STE100 Compliance Score */}
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">ASD-STE100 ATS Index</span>
              <FileCheck className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">{ste100Summary.overallScore}</span>
              <span className="text-xs text-muted-foreground font-mono">/ 100</span>
            </div>
            <span className={`text-[11px] font-semibold ${ste100Summary.overallScore >= 85 ? "text-emerald-600 dark:text-emerald-400" : ste100Summary.overallScore >= 65 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
              {ste100Summary.overallScore >= 85 ? "High ATS Compatibility" : ste100Summary.overallScore >= 65 ? "Moderate Alignment" : "Action Needed"}
            </span>
          </div>

          {/* Tile 3: Job Match Score */}
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Requisition Match</span>
              <Target className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">
                {jobMatch ? `${jobMatch.matchScore}%` : "--"}
              </span>
              {jobMatch && <span className="text-xs text-muted-foreground font-mono">match</span>}
            </div>
            <span className="text-[11px] font-semibold text-primary cursor-pointer hover:underline" onClick={() => setActiveTab("match")}>
              {jobMatch ? "View Keyword Analysis →" : "Run Requisition Match →"}
            </span>
          </div>

          {/* Tile 4: Experience & Skills Breadth */}
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Verified Bullets</span>
              <Layers className="size-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">{allBullets.length}</span>
              <span className="text-xs text-muted-foreground font-mono">achievements</span>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {profile.experience?.length || 0} Career Roles Documented
            </span>
          </div>
        </div>

        {/* Quality Alerts */}
        {profile.qualityCritical ? (
          <Alert variant="destructive" role="alert" className="rounded-lg border-destructive/40">
            <ShieldAlert className="size-4" />
            <AlertTitle className="text-xs font-semibold">Critical Parsing Warnings</AlertTitle>
            <AlertDescription className="text-xs">
              <ul className="list-inside list-disc mt-1 space-y-0.5">
                {profile.qualityWarnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          hasWarnings && (
            <Alert variant="warning" role="status" className="rounded-lg border-warning/40">
              <AlertTriangle className="size-4" />
              <AlertTitle className="text-xs font-semibold">Optimization Opportunities</AlertTitle>
              <AlertDescription className="text-xs">
                <ul className="list-inside list-disc mt-1 space-y-0.5">
                  {profile.qualityWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )
        )}

        {/* Microsoft Fluent Pivot Navigation Tab Strip */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
          {[
            { id: "document", label: "Master Resume Canvas", icon: FileText, num: "1" },
            { id: "match", label: "ATS Keyword & Job Match", icon: Target, num: "2" },
            { id: "linter", label: "ASD-STE100 Linter", icon: FileCheck, num: "3" },
            { id: "vault", label: "Career Vault & Hierarchy", icon: Layers, num: "4" },
            { id: "raw", label: "Raw LaTeX & JSON", icon: Code, num: "5" },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? "border-primary text-primary bg-primary/[0.03]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className="hidden md:inline rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-muted-foreground">
                  {tab.num}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Executive Document Canvas */}
        {activeTab === "document" && (
          <div className="flex flex-col gap-6">
            
            {/* Style Customizer Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Settings2 className="size-4 text-primary" />
                <span>Live Document Customization</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                {/* Template Mode */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Template:</span>
                  <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
                    {(["modern", "classic", "minimal"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTemplate(t)}
                        className={`rounded px-2.5 py-0.5 text-xs font-medium capitalize transition-all ${
                          template === t ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Scaling */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Density:</span>
                  <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
                    {(["sm", "base", "lg"] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setFontSize(sz)}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-all ${
                          fontSize === sz ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {sz === "sm" ? "Compact" : sz === "base" ? "Normal" : "Large"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Accent Color */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Accent:</span>
                  <div className="flex items-center gap-1.5">
                    {(["blue", "emerald", "slate", "violet"] as const).map((color) => {
                      const colorMap = {
                        blue: "bg-[#0F6CBD]",
                        emerald: "bg-[#107C41]",
                        slate: "bg-[#242424]",
                        violet: "bg-[#5C5B9F]",
                      };
                      return (
                        <button
                          key={color}
                          onClick={() => setPrimaryColor(color)}
                          className={`size-5 rounded-full border border-border transition-all ${colorMap[color]} ${
                            primaryColor === color ? "ring-2 ring-primary ring-offset-2" : "hover:scale-110"
                          }`}
                          title={color}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Word Online / LaTeX Executive Canvas */}
            <div className="mx-auto w-full max-w-4xl rounded-lg border border-border bg-card shadow-md">
              <div
                className={`p-8 sm:p-12 transition-all duration-150 ${
                  template === "classic" ? "font-serif" : template === "minimal" ? "font-mono" : "font-sans"
                } ${fontSize === "sm" ? "text-xs" : fontSize === "lg" ? "text-base" : "text-sm"}`}
                style={{
                  "--primary-color": primaryColor === "blue" ? "#0F6CBD" : primaryColor === "emerald" ? "#107C41" : primaryColor === "violet" ? "#5C5B9F" : "#242424",
                  "--primary-light": primaryColor === "blue" ? "#EBF3FC" : primaryColor === "emerald" ? "#E6F4EA" : primaryColor === "violet" ? "#EFEFF9" : "#F3F4F6",
                  "--primary-border": primaryColor === "blue" ? "#B4D6FA" : primaryColor === "emerald" ? "#A8DAB5" : primaryColor === "violet" ? "#CCCBF0" : "#D1D5DB",
                } as React.CSSProperties}
              >
                {/* Header Profile Section */}
                <div className={`pb-6 border-b border-border flex flex-col gap-2 ${template === "classic" ? "text-center items-center" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                    <h1 className={`font-bold tracking-tight ${template === "classic" ? "text-3xl text-[var(--primary-color)]" : "text-2xl text-[var(--primary-color)]"}`}>
                      {profile.name ?? "Your Consolidated Resume"}
                    </h1>
                    <button
                      onClick={() => handleCopyText(`${profile.name}\n${profile.titles?.join(" / ")}\n${profile.summary}`, "header")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 rounded p-1 hover:bg-muted"
                      title="Copy header"
                    >
                      {copiedSection === "header" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    </button>
                  </div>

                  {profile.titles && profile.titles.length > 0 && (
                    <p className="text-sm font-semibold text-foreground/80">{profile.titles.join("  |  ")}</p>
                  )}

                  {profile.contact && (
                    <p className="text-xs text-muted-foreground">
                      {Object.values(profile.contact).filter(Boolean).join("  •  ")}
                    </p>
                  )}

                  {profile.summary && (
                    <p className="text-xs sm:text-sm text-pretty leading-relaxed text-muted-foreground mt-2">
                      {profile.summary}
                    </p>
                  )}
                </div>

                {/* Skills Section */}
                {skills && (
                  <div className="py-6 border-b border-border flex flex-col gap-3">
                    <h2 className={
                      template === "modern" ? "text-xs font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                      template === "classic" ? "text-xs font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                      "text-xs font-bold uppercase tracking-wider text-foreground"
                    }>
                      Technical Skills & Competencies
                    </h2>
                    <div className="flex flex-col gap-2">
                      {SKILL_LABELS.map(([key, label]) => {
                        const items = (skills as Record<string, string[]>)[key];
                        if (!items || items.length === 0) return null;
                        return (
                          <div key={key} className="flex flex-wrap items-baseline gap-2 text-xs sm:text-sm">
                            <span className="w-28 shrink-0 font-semibold text-foreground">{label}:</span>
                            <div className="flex flex-1 flex-wrap gap-1.5">
                              {items.map((item, i) => (
                                <span key={i} className="rounded bg-[var(--primary-light)] text-[var(--primary-color)] border border-[var(--primary-border)] px-2 py-0.5 text-xs font-medium">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Experience Section */}
                {profile.experience && profile.experience.length > 0 && (
                  <div className="py-6 border-b border-border flex flex-col gap-5">
                    <h2 className={
                      template === "modern" ? "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                      template === "classic" ? "flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                      "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
                    }>
                      <Briefcase className="size-3.5" />
                      Professional Experience
                    </h2>

                    <div className="flex flex-col gap-6">
                      {profile.experience.map((entry, i) => (
                        <article key={i} className="flex flex-col gap-1.5 group/entry">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            <h3 className="text-sm font-bold text-foreground">
                              {entry.title ?? "Role"}
                              {entry.company ? (
                                <span className="font-normal text-muted-foreground"> &mdash; {entry.company}</span>
                              ) : null}
                            </h3>
                            <p className="text-xs whitespace-nowrap text-muted-foreground font-mono">
                              {[entry.start, entry.end].filter(Boolean).join(" — ")}
                              {entry.location ? ` | ${entry.location}` : ""}
                            </p>
                          </div>

                          {entry.bullets && entry.bullets.length > 0 && (
                            <ul className="ml-4 list-outside list-disc text-xs sm:text-sm text-pretty leading-relaxed text-muted-foreground space-y-2 pt-1">
                              {entry.bullets.map((bullet, j) => {
                                const steRes = validateBulletSTE100(bullet);
                                return (
                                  <li key={j} className="group/bullet pl-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="flex-1 text-foreground/90">{bullet}</span>
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover/bullet:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => handleCopyText(bullet, `b-${i}-${j}`)}
                                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                                          title="Copy bullet"
                                        >
                                          {copiedSection === `b-${i}-${j}` ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                                        </button>
                                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                          steRes.isCompliant ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                        }`}>
                                          {steRes.isCompliant ? "STE-100 ✓" : `${steRes.violations.length} Tips`}
                                        </span>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education Section */}
                {profile.education && profile.education.length > 0 && (
                  <div className="py-6 border-b border-border flex flex-col gap-3">
                    <h2 className={
                      template === "modern" ? "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                      template === "classic" ? "flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                      "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
                    }>
                      <GraduationCap className="size-3.5" />
                      Education
                    </h2>
                    <ul className="flex flex-col gap-1.5 text-xs sm:text-sm text-muted-foreground">
                      {profile.education.map((entry, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-foreground">{entry.degree ?? ""} {entry.school ? `— ${entry.school}` : ""}</span>
                          {entry.years && <span className="font-mono text-xs text-muted-foreground">{entry.years}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Certifications Section */}
                {profile.certifications && profile.certifications.length > 0 && (
                  <div className="pt-6 flex flex-col gap-3">
                    <h2 className={
                      template === "modern" ? "text-xs font-bold uppercase tracking-wider text-[var(--primary-color)] border-l-2 border-[var(--primary-color)] pl-2" :
                      template === "classic" ? "text-xs font-bold uppercase tracking-wider text-center text-[var(--primary-color)] border-b pb-1 w-full" :
                      "text-xs font-bold uppercase tracking-wider text-foreground"
                    }>
                      Certifications & Credentials
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.certifications.map((cert, i) => (
                        <span key={i} className="rounded bg-muted px-2.5 py-1 text-xs font-medium text-foreground border border-border">
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: ATS Keyword & Job Match */}
        {activeTab === "match" && (
          <JobMatchWidget uploadId={uploadId} initialMatch={jobMatch ?? undefined} />
        )}

        {/* Tab 3: ASD-STE100 Linter Studio */}
        {activeTab === "linter" && (
          <STE100BulletWidget experience={profile.experience} />
        )}

        {/* Tab 4: Career Vault & Role Reordering */}
        {activeTab === "vault" && (
          <CareerVaultWidget uploadId={uploadId} sessionId={sessionId} profile={profile} />
        )}

        {/* Tab 5: Raw LaTeX & JSON */}
        {activeTab === "raw" && (
          <Card className="border-border bg-card">
            <CardHeader className="border-b pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Structured JSON & LaTeX Source</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyText(JSON.stringify(profile, null, 2), "json")}
                className="h-8 text-xs font-medium"
              >
                {copiedSection === "json" ? <Check className="size-3.5 text-emerald-600 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                Copy JSON
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <pre className="rounded-lg bg-muted/60 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-[500px] border border-border">
                {JSON.stringify(profile, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Floating Download & Export Bar at Bottom */}
        <div className="sticky bottom-4 z-20 mx-auto w-full max-w-2xl rounded-lg border border-border bg-card/95 backdrop-blur-md p-3 shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Master Profile Ready</span>
              <span className="text-[10px] text-muted-foreground font-mono">ATS-Optimized • Single Column • LaTeX</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportHtmlResume(profile, template, fontSize, primaryColor)}
              className="h-8 text-xs font-semibold border-border hover:bg-muted"
            >
              Export HTML (Free)
            </Button>

            {paymentStatus?.paid && paymentStatus.downloadToken ? (
              <Button asChild size="sm" className="h-8 text-xs font-semibold bg-primary text-primary-foreground shadow-xs">
                <a href={`/api/download/${paymentStatus.downloadToken}`}>
                  <Download className="size-3.5 mr-1.5" />
                  Download PDF
                </a>
              </Button>
            ) : (
              <CheckoutButton uploadId={uploadId} />
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

