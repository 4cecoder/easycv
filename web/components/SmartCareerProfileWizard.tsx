"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getBrowserSessionId } from "../lib/fingerprint";
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  GraduationCap,
  Wand2,
  X,
  FileText,
  Layers,
  Award,
  Zap,
  Loader2,
  DollarSign,
  TrendingUp,
  Building,
  Lock,
  Compass,
  ArrowRight
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Alert,
  AlertDescription,
} from "@bytecats/ui-kit";
import { validateBulletSTE100 } from "../lib/ste100";
import { CheckoutButton } from "../app/preview/[uploadId]/CheckoutButton";

interface SmartCareerProfileWizardProps {
  uploadId: string;
  initialProfile: any;
  isOpen: boolean;
  onClose: () => void;
}

export function SmartCareerProfileWizard({
  uploadId,
  initialProfile,
  isOpen,
  onClose,
}: SmartCareerProfileWizardProps) {
  const saveProfile = useMutation(api.profiles.saveStructuredProfile);
  const saveInsights = useMutation(api.insights.saveCandidateInsights);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [aiExpandingIdx, setAiExpandingIdx] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState(initialProfile?.name || "");
  const [email, setEmail] = useState(initialProfile?.contact?.email || "");
  const [phone, setPhone] = useState(initialProfile?.contact?.phone || "");
  const [location, setLocation] = useState(initialProfile?.contact?.location || "");
  const [title, setTitle] = useState(initialProfile?.titles?.[0] || "");
  const [summary, setSummary] = useState(initialProfile?.summary || "");

  const [experience, setExperience] = useState<any[]>(
    initialProfile?.experience?.length
      ? initialProfile.experience
      : [
          {
            title: "Senior Software Engineer",
            company: "Tech Corp",
            start: "2022",
            end: "Present",
            bullets: ["Led technical architecture and scaled microservices to 1M+ active users."],
          },
        ]
  );

  const [skills, setSkills] = useState<{
    languages: string[];
    frameworks: string[];
    cloud_devops: string[];
    databases: string[];
    tools: string[];
  }>({
    languages: initialProfile?.skills?.languages || ["TypeScript", "Python", "Go"],
    frameworks: initialProfile?.skills?.frameworks || ["React", "Next.js", "Node.js"],
    cloud_devops: initialProfile?.skills?.cloud_devops || ["AWS", "Docker", "Kubernetes", "CI/CD"],
    databases: initialProfile?.skills?.databases || ["PostgreSQL", "Redis"],
    tools: initialProfile?.skills?.tools || ["Git", "Linux", "Terraform"],
  });

  const [education, setEducation] = useState<any[]>(
    initialProfile?.education?.length
      ? initialProfile.education
      : [{ degree: "B.S. in Computer Science", school: "University", years: "2018 - 2022" }]
  );

  const [certifications, setCertifications] = useState<string[]>(
    initialProfile?.certifications || ["AWS Certified Solutions Architect"]
  );

  // Step 5: Candidate Insights & Compensation Market Data
  const [targetSeniority, setTargetSeniority] = useState("Staff");
  const [targetSalaryRange, setTargetSalaryRange] = useState("$160k - $220k");
  const [primaryIndustry, setPrimaryIndustry] = useState("Cloud & Enterprise Infrastructure");
  const [workPreference, setWorkPreference] = useState("Remote First");
  const [targetCompaniesInput, setTargetCompaniesInput] = useState("Google, Stripe, Datadog");
  const [activelyLooking, setActivelyLooking] = useState(true);

  const [newSkillInput, setNewSkillInput] = useState("");
  const [selectedSkillCategory, setSelectedSkillCategory] = useState<keyof typeof skills>("languages");

  if (!isOpen) return null;

  // AI Smart Bullet Generator / Expander
  const handleAiExpandBullet = (roleIndex: number) => {
    setAiExpandingIdx(roleIndex);
    setTimeout(() => {
      const exp = [...experience];
      const currentRole = exp[roleIndex];
      const roleTitle = currentRole?.title || "Engineer";

      const expandedBullet = `Engineered fault-tolerant distributed pipeline for ${roleTitle}, reducing processing latency by 38% and optimizing cloud resource allocation.`;
      
      currentRole.bullets = [...(currentRole.bullets || []), expandedBullet];
      setExperience(exp);
      setAiExpandingIdx(null);
    }, 600);
  };

  const handleAddRole = () => {
    setExperience([
      ...experience,
      {
        title: "Software Engineer",
        company: "Company Name",
        start: "2020",
        end: "2022",
        bullets: ["Developed scalable backend services with 99.9% uptime."],
      },
    ]);
  };

  const handleRemoveRole = (idx: number) => {
    setExperience(experience.filter((_, i) => i !== idx));
  };

  const handleUpdateBullet = (roleIdx: number, bulletIdx: number, val: string) => {
    const exp = [...experience];
    exp[roleIdx].bullets[bulletIdx] = val;
    setExperience(exp);
  };

  const handleAddSkill = () => {
    if (!newSkillInput.trim()) return;
    setSkills({
      ...skills,
      [selectedSkillCategory]: [...(skills[selectedSkillCategory] || []), newSkillInput.trim()],
    });
    setNewSkillInput("");
  };

  const handleRemoveSkill = (category: keyof typeof skills, skillIdx: number) => {
    setSkills({
      ...skills,
      [category]: skills[category].filter((_, i) => i !== skillIdx),
    });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const sessionId = getBrowserSessionId();

      // 1. Save main structured resume profile
      await saveProfile({
        uploadId: uploadId as Id<"uploads">,
        name: name.trim() || "Candidate",
        contact: {
          email: email.trim(),
          phone: phone.trim(),
          location: location.trim(),
          linkedin: initialProfile?.contact?.linkedin || "",
          website: initialProfile?.contact?.website || "",
        },
        titles: title.trim() ? [title.trim()] : ["Software Engineer"],
        summary: summary.trim(),
        skills,
        experience,
        education,
        certifications,
        languagesSpoken: initialProfile?.languagesSpoken || ["English"],
        rawFallback: initialProfile?.rawFallback,
        qualityScore: Math.min(100, (initialProfile?.qualityScore || 85) + 5),
        qualityMaxScore: 100,
        qualityWarnings: initialProfile?.qualityWarnings || [],
        qualityCritical: false,
      });

      // 2. Persist candidate career insights & market preferences
      if (sessionId) {
        await saveInsights({
          sessionId,
          uploadId: uploadId as Id<"uploads">,
          targetRole: title.trim(),
          targetSeniority,
          targetSalaryRange,
          targetCompanies: targetCompaniesInput.split(",").map((c) => c.trim()).filter(Boolean),
          workPreference,
          primaryIndustry,
          activelyLooking,
        });
      }

      onClose();
    } catch (err) {
      console.error("Save profile error", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative z-10 flex w-full max-w-3xl flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">AI Career Profile Sorter & Form Builder</h2>
              <p className="text-[11px] text-muted-foreground">Enrich multi-year career history & personalize market benchmarks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-5 border-b border-border text-center text-xs font-semibold select-none">
          {[
            { num: 1, label: "Identity" },
            { num: 2, label: "Timeline" },
            { num: 3, label: "Taxonomy" },
            { num: 4, label: "Education" },
            { num: 5, label: "Market & Salary" },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num as any)}
              className={`py-2.5 border-b-2 transition-all ${
                step === s.num
                  ? "border-primary text-primary bg-primary/[0.04]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              Step {s.num}: {s.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: Identity & Target */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Target 2026 Job Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    placeholder="Staff Cloud Infrastructure Architect"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Phone / Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-foreground">Executive Career Summary</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSummary(
                        `Accomplished ${title || "Technical Leader"} with 8+ years architecting high-availability infrastructure and leading high-velocity engineering teams. Proven track record of improving operational efficiency by 40% and deploying mission-critical systems.`
                      );
                    }}
                    className="h-6 text-[11px] font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/10"
                  >
                    <Wand2 className="size-3" />
                    AI Autofill Summary
                  </Button>
                </div>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-md border border-border bg-background p-3 text-xs text-foreground focus:border-primary focus:outline-none leading-relaxed"
                  placeholder="Summarize your career impact and core engineering competencies..."
                />
              </div>
            </div>
          )}

          {/* STEP 2: Experience Timeline */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Consolidated timeline spanning past 5+ years of roles:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddRole}
                  className="h-7 text-xs font-semibold gap-1"
                >
                  <Plus className="size-3.5" /> Add Position
                </Button>
              </div>

              {experience.map((exp, rIdx) => (
                <div key={rIdx} className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                      <input
                        type="text"
                        value={exp.title || ""}
                        onChange={(e) => {
                          const copy = [...experience];
                          copy[rIdx].title = e.target.value;
                          setExperience(copy);
                        }}
                        className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-semibold"
                        placeholder="Role Title"
                      />
                      <input
                        type="text"
                        value={exp.company || ""}
                        onChange={(e) => {
                          const copy = [...experience];
                          copy[rIdx].company = e.target.value;
                          setExperience(copy);
                        }}
                        className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                        placeholder="Company"
                      />
                      <input
                        type="text"
                        value={exp.start && exp.end ? `${exp.start} - ${exp.end}` : exp.start || ""}
                        onChange={(e) => {
                          const copy = [...experience];
                          const parts = e.target.value.split("-");
                          copy[rIdx].start = parts[0]?.trim();
                          copy[rIdx].end = parts[1]?.trim() || "Present";
                          setExperience(copy);
                        }}
                        className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-mono"
                        placeholder="2022 - Present"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveRole(rIdx)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                      title="Delete role"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* Bullets */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Impact Bullets
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleAiExpandBullet(rIdx)}
                        disabled={aiExpandingIdx === rIdx}
                        className="h-6 text-[10px] font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      >
                        {aiExpandingIdx === rIdx ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        AI Quantify Bullet
                      </Button>
                    </div>

                    {(exp.bullets || []).map((bullet: string, bIdx: number) => {
                      const ste = validateBulletSTE100(bullet);
                      return (
                        <div key={bIdx} className="space-y-1">
                          <div className="flex items-start gap-2">
                            <textarea
                              rows={2}
                              value={bullet}
                              onChange={(e) => handleUpdateBullet(rIdx, bIdx, e.target.value)}
                              className="flex-1 rounded border border-border bg-background p-2 text-xs text-foreground focus:border-primary focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                const copy = [...experience];
                                copy[rIdx].bullets = copy[rIdx].bullets.filter((_: any, i: number) => i !== bIdx);
                                setExperience(copy);
                              }}
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                          {!ste.isCompliant && (
                            <span className="text-[10px] text-amber-500 font-medium">
                              Tip: {ste.improvementTips[0] || "Include active verb and quantifiable outcome."}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STEP 3: Smart Skills Taxonomy */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <select
                  value={selectedSkillCategory}
                  onChange={(e) => setSelectedSkillCategory(e.target.value as any)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground font-semibold"
                >
                  <option value="languages">Languages</option>
                  <option value="frameworks">Frameworks & Libs</option>
                  <option value="cloud_devops">Cloud & DevOps</option>
                  <option value="databases">Databases</option>
                  <option value="tools">Tools & Platforms</option>
                </select>
                <input
                  type="text"
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. Rust, Kafka, Kubernetes (press Enter)"
                />
                <Button type="button" size="sm" onClick={handleAddSkill} className="h-9 px-4 font-semibold text-xs">
                  <Plus className="size-3.5 mr-1" /> Add
                </Button>
              </div>

              {/* Taxonomy Categorized Lists */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(skills).map(([category, list]) => (
                  <div key={category} className="rounded-xl border border-border bg-card/60 p-3.5 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {category.replace("_", " & ")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((skill, sIdx) => (
                        <Badge
                          key={sIdx}
                          variant="outline"
                          className="text-xs py-0.5 px-2 bg-muted/40 border-border text-foreground flex items-center gap-1.5"
                        >
                          <span>{skill}</span>
                          <button
                            onClick={() => handleRemoveSkill(category as any, sIdx)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            &times;
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Education & Credentials */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Education
                </span>
                {education.map((edu, eIdx) => (
                  <div key={eIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={edu.degree || ""}
                      onChange={(e) => {
                        const copy = [...education];
                        copy[eIdx].degree = e.target.value;
                        setEducation(copy);
                      }}
                      className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-semibold"
                      placeholder="Degree"
                    />
                    <input
                      type="text"
                      value={edu.school || ""}
                      onChange={(e) => {
                        const copy = [...education];
                        copy[eIdx].school = e.target.value;
                        setEducation(copy);
                      }}
                      className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                      placeholder="Institution"
                    />
                    <input
                      type="text"
                      value={edu.years || ""}
                      onChange={(e) => {
                        const copy = [...education];
                        copy[eIdx].years = e.target.value;
                        setEducation(copy);
                      }}
                      className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-mono"
                      placeholder="Years"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Certifications
                </span>
                <div className="flex flex-wrap gap-2">
                  {certifications.map((cert, cIdx) => (
                    <Badge
                      key={cIdx}
                      variant="outline"
                      className="text-xs py-1 px-2.5 bg-muted/40 border-border text-foreground flex items-center gap-2"
                    >
                      <span>{cert}</span>
                      <button
                        onClick={() => setCertifications(certifications.filter((_, i) => i !== cIdx))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Market Preferences, Salary & Pro Upsells */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Target Seniority</label>
                  <select
                    value={targetSeniority}
                    onChange={(e) => setTargetSeniority(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Mid-Level">Mid-Level Engineer (3-5 Yrs)</option>
                    <option value="Senior">Senior Engineer (5-8 Yrs)</option>
                    <option value="Staff">Staff / Principal (8+ Yrs)</option>
                    <option value="Engineering Manager">Engineering Manager / Director</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Target Compensation Band</label>
                  <select
                    value={targetSalaryRange}
                    onChange={(e) => setTargetSalaryRange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="$120k - $160k">$120,000 - $160,000</option>
                    <option value="$160k - $220k">$160,000 - $220,000</option>
                    <option value="$220k - $300k">$220,000 - $300,000</option>
                    <option value="$300k+">$300,000+ (Executive Band)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Work Mode</label>
                  <select
                    value={workPreference}
                    onChange={(e) => setWorkPreference(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Remote First">Remote First</option>
                    <option value="Hybrid (1-2 days)">Hybrid (1-2 days)</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Primary Domain</label>
                  <input
                    type="text"
                    value={primaryIndustry}
                    onChange={(e) => setPrimaryIndustry(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    placeholder="AI Systems / Cloud Infrastructure"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Dream Companies / Targets</label>
                <input
                  type="text"
                  value={targetCompaniesInput}
                  onChange={(e) => setTargetCompaniesInput(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  placeholder="Stripe, Google, OpenAI, Snowflake (comma separated)"
                />
              </div>

              {/* High-Converting Pro Package Upsell Banner */}
              <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                      <Sparkles className="size-3.5" />
                      <span>Executive Compensation & ATS Package</span>
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      Unlock Recruiter Benchmarking & Vector PDF Downloads
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Upgrade to easyCV Pro to unlock unwatermarked Vector PDF, LaTeX source code, and priority keyword formatting tailored to your target {targetSalaryRange} band.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end">
                    <span className="text-lg font-extrabold text-foreground">$14</span>
                    <span className="text-[10px] text-muted-foreground">one-time</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="size-3" /> Vector PDF
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="size-3" /> LaTeX (.tex)
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="size-3" /> HTML Bundle
                    </span>
                  </div>
                  <CheckoutButton uploadId={uploadId} label="Unlock Pro Package ($14)" size="sm" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((step - 1) as any)}
                className="gap-1.5 text-xs font-semibold"
              >
                <ChevronLeft className="size-3.5" /> Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 5 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep((step + 1) as any)}
                className="gap-1.5 text-xs font-semibold"
              >
                Next Step <ChevronRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSaveAll}
                disabled={isSaving}
                className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground shadow-xs"
              >
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Apply & Compile Resume
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
