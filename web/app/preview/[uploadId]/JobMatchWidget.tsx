"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Button, Card, CardContent, CardHeader, Badge, Alert, AlertDescription } from "@bytecats/ui-kit";

type MatchResult = {
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  gapAnalysis: string;
  tailoredBullets: string[];
};

export function JobMatchWidget({ uploadId, initialMatch }: { uploadId: string; initialMatch?: MatchResult }) {
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
    if (score >= 80) return "text-green-500 border-green-500/30 bg-green-500/10";
    if (score >= 50) return "text-amber-500 border-amber-500/30 bg-amber-500/10";
    return "text-red-500 border-red-500/30 bg-red-500/10";
  };

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-1 pb-4">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          Job Description Keyword Matcher
        </h2>
        <p className="text-xs text-muted-foreground">
          Paste the target job description to analyze skills alignment and get tailored resume bullets.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here..."
          rows={5}
          className="w-full rounded-md border border-border bg-card p-3 text-sm focus:border-primary focus:outline-none"
        />

        <div className="flex justify-between items-center">
          <Button onClick={handleAnalyze} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Analyzing Compatibility...
              </>
            ) : (
              "Analyze CV-Job Alignment"
            )}
          </Button>
          {result && (
            <Button variant="outline" onClick={() => { setResult(null); setJobDescription(""); }} className="text-xs">
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
            {/* Score & Summary */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className={`size-20 shrink-0 rounded-full border-2 flex flex-col items-center justify-center font-bold text-2xl ${getScoreColor(result.matchScore)}`}>
                {result.matchScore}%
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider -mt-1">Match</span>
              </div>
              <div className="flex-1 text-sm">
                <h4 className="font-semibold text-foreground pb-1">Compatibility Analysis</h4>
                <p className="text-muted-foreground leading-relaxed">{result.gapAnalysis}</p>
              </div>
            </div>

            {/* Keywords Analysis */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <h4 className="text-xs font-semibold text-green-500 uppercase tracking-wider pb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Matched Keywords
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.matchedKeywords && result.matchedKeywords.length > 0 ? (
                    result.matchedKeywords.map((word, idx) => (
                      <Badge key={idx} variant="outline" className="border-green-500/20 text-green-600 bg-green-500/[0.02]">
                        {word}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No matching keywords found.</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-4">
                <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wider pb-2 flex items-center gap-1.5">
                  <HelpCircle className="size-4" /> Missing Keywords / Gaps
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingKeywords && result.missingKeywords.length > 0 ? (
                    result.missingKeywords.map((word, idx) => (
                      <Badge key={idx} variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/[0.02]">
                        {word}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No key missing items identified.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Tailored Bullet Suggestions */}
            {result.tailoredBullets && result.tailoredBullets.length > 0 && (
              <div className="rounded-lg border border-border bg-primary/[0.01] p-4">
                <h4 className="text-sm font-semibold text-foreground pb-2">Targeted Suggestions for CV Bullets</h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-2 leading-relaxed">
                  {result.tailoredBullets.map((bullet, idx) => (
                    <li key={idx} className="marker:text-primary">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
