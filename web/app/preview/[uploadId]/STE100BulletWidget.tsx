"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Info,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
} from "@bytecats/ui-kit";
import {
  analyzeProfileBulletsSTE100,
  validateBulletSTE100,
  type BulletSTE100Result,
  type ProfileSTE100Summary,
} from "../../../lib/ste100";

type ExperienceEntry = {
  title?: string;
  company?: string;
  bullets: string[];
};

export function STE100BulletWidget({
  experience,
}: {
  experience?: ExperienceEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeBulletIndex, setActiveBulletIndex] = useState<number | null>(null);

  const allBullets = (experience || []).flatMap((e) => e.bullets || []);
  const summary: ProfileSTE100Summary = analyzeProfileBulletsSTE100(allBullets);

  if (allBullets.length === 0) return null;

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-600 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 65) return "text-amber-600 border-amber-500/30 bg-amber-500/10";
    return "text-red-600 border-red-500/30 bg-red-500/10";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 85) return "outline";
    if (score >= 65) return "warning";
    return "destructive";
  };

  return (
    <Card className="border-border/80 shadow-xs transition-all">
      <CardHeader className="flex flex-col gap-2 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
            <FileCheck className="size-5 text-primary" />
            STE-100 ATS Bullet Quality Analysis
          </h2>
          <div className="flex items-center gap-2">
            <Badge
              variant={getScoreBadgeVariant(summary.overallScore)}
              className="text-xs font-semibold px-2.5 py-1 flex items-center gap-1"
            >
              <Sparkles className="size-3.5" />
              STE-100 Score: {summary.overallScore}/100
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Evaluates resume bullets against ASD-STE100 technical writing guidelines and ATS optimization benchmarks (word count, active voice, spelling, contractions, metrics).
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Score & Summary Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
            <div className={`size-12 shrink-0 rounded-full border-2 flex items-center justify-center font-bold text-lg ${getScoreColor(summary.overallScore)}`}>
              {summary.overallScore}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Overall ATS Score</p>
              <p className="text-xs font-medium text-foreground">
                {summary.overallScore >= 85
                  ? "High Compliance"
                  : summary.overallScore >= 65
                  ? "Needs Editing"
                  : "Action Recommended"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
            <div className="size-12 shrink-0 rounded-full border-2 border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-bold text-base">
              {summary.compliantBullets}/{summary.totalBullets}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Compliant Bullets</p>
              <p className="text-xs font-medium text-foreground">
                {summary.compliantBullets === summary.totalBullets
                  ? "100% STE-100 Compliant"
                  : `${summary.totalBullets - summary.compliantBullets} need optimization`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
            <div className="size-12 shrink-0 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
              {summary.topTips.length}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actionable Tips</p>
              <p className="text-xs font-medium text-foreground">Guidelines & Suggestions</p>
            </div>
          </div>
        </div>

        {/* Top STE-100 Improvement Tips */}
        {summary.topTips.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-4 flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Lightbulb className="size-4 text-amber-500" />
              STE-100 ATS Improvement Tips
            </h3>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              {summary.topTips.map((tip, idx) => (
                <li key={idx} className="marker:text-amber-500">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interactive Bullet Breakdown Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            Inspect Bullet-by-Bullet STE-100 Analysis ({summary.totalBullets} bullets)
          </span>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {expanded && (
          <div className="flex flex-col gap-3 pt-1 border-t animate-fadeIn">
            {allBullets.map((bullet, idx) => {
              const res: BulletSTE100Result = validateBulletSTE100(bullet);
              const isActive = activeBulletIndex === idx;

              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 text-xs transition-all ${
                    res.isCompliant
                      ? "border-emerald-500/30 bg-emerald-500/[0.02]"
                      : "border-amber-500/30 bg-amber-500/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground leading-relaxed flex-1">
                      &bull; {bullet}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          res.wordCount <= 20
                            ? "border-emerald-500/30 text-emerald-600"
                            : "border-amber-500/30 text-amber-600"
                        }`}
                      >
                        {res.wordCount} words
                      </Badge>
                      <Badge
                        variant={res.isCompliant ? "outline" : "warning"}
                        className={`text-[10px] ${
                          res.isCompliant
                            ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                            : "border-amber-500/30 text-amber-600 bg-amber-500/10"
                        }`}
                      >
                        {res.isCompliant ? "STE-100 OK" : `${res.violations.length} Flags`}
                      </Badge>
                      {res.violations.length > 0 && (
                        <button
                          onClick={() => setActiveBulletIndex(isActive ? null : idx)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Toggle details"
                        >
                          {isActive ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {(isActive || (!res.isCompliant && allBullets.length <= 5)) && res.violations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-col gap-1.5">
                      {res.violations.map((v, vIdx) => (
                        <div key={vIdx} className="flex items-start gap-1.5 text-[11px]">
                          {v.severity === "error" ? (
                            <ShieldAlert className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                          ) : v.severity === "warning" ? (
                            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="size-3.5 text-blue-500 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-semibold text-foreground">{v.message}</span>
                            {v.suggestion && (
                              <span className="text-muted-foreground ml-1">
                                &mdash; {v.suggestion}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
