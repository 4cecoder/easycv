"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck,
  HelpCircle,
  Loader2,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Alert,
  AlertDescription,
} from "@bytecats/ui-kit";
import { validateBulletSTE100 } from "../../../lib/ste100";

type MatchResult = {
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  gapAnalysis: string;
  tailoredBullets: string[];
};

export function JobMatchWidget({
  uploadId,
  initialMatch,
}: {
  uploadId: string;
  initialMatch?: MatchResult;
}) {
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(initialMatch || null);

  useEffect(() => {
    if (initialMatch) {
      setResult(initialMatch);
    }
  }, [initialMatch]);

  async function handleAnalyze() {
    if (!jobDescription.trim()) {
      setError("Please paste a job description first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/job-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, jobDescription }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to analyze job match");
      }
      setResult(body.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 50) return "text-amber-600 border-amber-500/30 bg-amber-500/10";
    return "text-red-600 border-red-500/30 bg-red-500/10";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "outline";
    if (score >= 50) return "warning";
    return "destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Strong Match";
    if (score >= 50) return "Moderate Match";
    return "Low Match - Optimization Needed";
  };

  const totalKeywords =
    (result?.matchedKeywords?.length || 0) + (result?.missingKeywords?.length || 0);

  return (
    <Card id="job-match-widget" className="border-border shadow-xs">
      <CardHeader className="flex flex-col gap-1 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Job Match & Keyword Breakdown
          </h2>
          {result && (
            <Badge
              variant={getScoreBadgeVariant(result.matchScore)}
              className="text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5"
            >
              <Sparkles className="size-3.5" />
              Job Match: {result.matchScore}%
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Paste the target job description to calculate your ATS match score, view matched vs missing keywords, and receive STE-100 compliant tailored bullet suggestions.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste job description or requirements here..."
          rows={4}
          className="w-full rounded-md border border-border bg-card p-3 text-sm focus:border-primary focus:outline-none transition-colors"
        />

        <div className="flex justify-between items-center flex-wrap gap-2">
          <Button onClick={handleAnalyze} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Analyzing Compatibility...
              </>
            ) : (
              "Analyze Job Alignment"
            )}
          </Button>
          {result && (
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setJobDescription("");
              }}
              className="text-xs"
            >
              Clear Results
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="mt-4 flex flex-col gap-6 border-t pt-4 animate-fadeIn">
            {/* Prominent Match Score Header & Progress */}
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-border bg-card/60 p-4">
              <div
                className={`size-20 shrink-0 rounded-full border-2 flex flex-col items-center justify-center font-bold text-2xl ${getScoreColor(
                  result.matchScore
                )}`}
              >
                {result.matchScore}%
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider -mt-1">
                  Match
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-foreground">Compatibility Score</h4>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    {getScoreLabel(result.matchScore)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {result.gapAnalysis}
                </p>
                {totalKeywords > 0 && (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-1 flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{
                        width: `${Math.round(
                          ((result.matchedKeywords?.length || 0) / totalKeywords) * 100
                        )}%`,
                      }}
                    />
                    <div
                      className="bg-amber-500/60 h-full transition-all duration-500"
                      style={{
                        width: `${Math.round(
                          ((result.missingKeywords?.length || 0) / totalKeywords) * 100
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Matched vs Missing Keywords Breakdown */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.02] p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-emerald-500" /> Matched Keywords
                  </h4>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px] font-bold">
                    {result.matchedKeywords?.length || 0} Matched
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {result.matchedKeywords && result.matchedKeywords.length > 0 ? (
                    result.matchedKeywords.map((word, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 font-medium text-xs py-0.5 px-2"
                      >
                        ✓ {word}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No matching keywords found.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.02] p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="size-4 text-amber-500" /> Missing Keywords / Gaps
                  </h4>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-600 text-[10px] font-bold">
                    {result.missingKeywords?.length || 0} Missing
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {result.missingKeywords && result.missingKeywords.length > 0 ? (
                    result.missingKeywords.map((word, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10 font-medium text-xs py-0.5 px-2"
                      >
                        + {word}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No key missing items identified.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* STE-100 Compliant Tailored Bullet Suggestions */}
            {result.tailoredBullets && result.tailoredBullets.length > 0 && (
              <div className="rounded-lg border border-border bg-card/40 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <FileCheck className="size-4 text-primary" />
                    Targeted STE-100 ATS Bullets
                  </h4>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    STE-100 Validated
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tailored work experience bullet suggestions aligned with job requirements and checked for STE-100 compliance:
                </p>
                <div className="flex flex-col gap-2.5">
                  {result.tailoredBullets.map((bullet, idx) => {
                    const ste = validateBulletSTE100(bullet);
                    return (
                      <div
                        key={idx}
                        className="rounded-md border border-border bg-background p-3 text-xs flex flex-col gap-1.5 group/bullet"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-foreground leading-relaxed flex-1">
                            &bull; {bullet}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(bullet);
                              }}
                              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Copy bullet"
                            >
                              <Sparkles className="size-3 text-primary" />
                            </button>
                            <Badge
                              variant={ste.isCompliant ? "outline" : "warning"}
                              className={`text-[9px] ${
                                ste.isCompliant
                                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                  : "border-amber-500/30 text-amber-600 bg-amber-500/10"
                              }`}
                            >
                              {ste.isCompliant ? "STE-100 OK" : "STE-100 Flagged"}
                            </Badge>
                          </div>
                        </div>
                        {ste.improvementTips.length > 0 && (
                          <div className="text-[10px] text-muted-foreground border-t pt-1.5 flex flex-col gap-0.5">
                            {ste.improvementTips.map((tip, tIdx) => (
                              <span key={tIdx} className="text-amber-600 dark:text-amber-400 font-medium">
                                Tip: {tip}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
