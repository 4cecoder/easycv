"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FileText, ArrowUp, ArrowDown, Settings, Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Alert,
  AlertDescription,
} from "@bytecats/ui-kit";

export function CareerVaultWidget({
  uploadId,
  sessionId,
  profile,
}: {
  uploadId: string;
  sessionId: string;
  profile: any;
}) {
  const files = useQuery(api.resumeFiles.listResumeFiles, {
    uploadId: uploadId as Id<"uploads">,
    sessionId,
  });

  const saveProfile = useMutation(api.profiles.saveStructuredProfile);
  
  const [experience, setExperience] = useState(profile?.experience || []);
  const [latexTemplate, setLatexTemplate] = useState<"academic" | "industry" | "executive">("industry");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.experience) {
      setExperience(profile.experience);
    }
  }, [profile?.experience]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newExp = [...experience];
    const temp = newExp[index - 1];
    newExp[index - 1] = newExp[index];
    newExp[index] = temp;
    setExperience(newExp);
  };

  const moveDown = (index: number) => {
    if (index === experience.length - 1) return;
    const newExp = [...experience];
    const temp = newExp[index + 1];
    newExp[index + 1] = newExp[index];
    newExp[index] = temp;
    setExperience(newExp);
  };

  const saveOrder = async () => {
    setSaving(true);
    try {
      await saveProfile({
        uploadId: uploadId as Id<"uploads">,
        name: profile.name,
        contact: profile.contact,
        titles: profile.titles,
        summary: profile.summary,
        skills: profile.skills,
        education: profile.education,
        certifications: profile.certifications,
        languagesSpoken: profile.languagesSpoken,
        rawFallback: profile.rawFallback,
        qualityScore: profile.qualityScore,
        qualityMaxScore: profile.qualityMaxScore,
        qualityWarnings: profile.qualityWarnings,
        qualityCritical: profile.qualityCritical,
        experience: experience,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="my-6" id="career-vault-widget">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Historical Career Vault</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          View your ingested source documents, reorganize your career history, and configure LaTeX export options.
        </p>
      </CardHeader>
      
      <CardContent className="flex flex-col gap-6 pt-6">
        {/* Ingested Files */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-tight">Ingested Source Documents</h3>
          {files === undefined ? (
            <p className="text-sm text-muted-foreground">Loading files...</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No source documents found.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {files.map((f: any) => (
                <div key={f._id} className="flex items-center gap-2 rounded-md border bg-muted/20 p-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{f.filename}</span>
                  <Badge variant="outline">{f.category}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Experience Reordering */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Consolidated Experience</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={saveOrder}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Order"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {experience.map((exp: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm">{exp.title}</span>
                  <span className="text-xs text-muted-foreground">{exp.company}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveDown(index)}
                    disabled={index === experience.length - 1}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LaTeX Template Customization */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-tight">LaTeX Output Customization</h3>
          <div className="flex gap-2">
            {(["industry", "academic", "executive"] as const).map((t) => (
              <Button
                key={t}
                variant={latexTemplate === t ? "default" : "outline"}
                size="sm"
                onClick={() => setLatexTemplate(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
          <Alert className="bg-primary/5 border-primary/20 mt-2">
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                Ready to generate the <strong>{latexTemplate}</strong> LaTeX template?
              </span>
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="size-4" />
                Export .tex
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
}
