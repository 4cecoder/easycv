import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AlertTriangle, Briefcase, Download, GraduationCap, ShieldAlert } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { SESSION_COOKIE } from "../../../lib/session";
import { CheckoutButton } from "./CheckoutButton";
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
} from "@bytecats/ui-kit";

export const dynamic = "force-dynamic";

const SKILL_LABELS: [string, string][] = [
  ["languages", "Languages"],
  ["frameworks", "Frameworks"],
  ["cloud_devops", "Cloud/DevOps"],
  ["databases", "Databases"],
  ["tools", "Tools"],
];

type PageProps = {
  params: Promise<{ uploadId: string }>;
};

// Server component -- this is the FREE part per rf-1 ("gate the final
// download/export, not the building/editing"): it renders the consolidated
// resume unconditionally, with no payment check gating the render itself.
// Only the PDF download link is gated, and that gate lives entirely in
// Convex's getByDownloadToken (see app/api/download/[token]/route.ts).
export default async function PreviewPage({ params }: PageProps) {
  const { uploadId: uploadIdParam } = await params;
  const uploadId = uploadIdParam as Id<"uploads">;
  const convex = getConvexClient();

  // Ownership check: getStructuredProfile/getPaymentStatus both verify this
  // sessionId against the sessionId stored on the upload (see
  // convex/authz.ts) and return null/unpaid for anyone else's uploadId --
  // no cookie at all is treated the same as the wrong cookie.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  let profile: Awaited<ReturnType<typeof convex.query<typeof api.profiles.getStructuredProfile>>>;
  let paymentStatus: Awaited<ReturnType<typeof convex.query<typeof api.payments.getPaymentStatus>>>;
  try {
    [profile, paymentStatus] = await Promise.all([
      convex.query(api.profiles.getStructuredProfile, { uploadId, sessionId }),
      convex.query(api.payments.getPaymentStatus, { uploadId, sessionId }),
    ]);
  } catch {
    // Malformed/nonexistent uploadId -- Convex throws on a bad Id string.
    notFound();
  }

  if (!profile) {
    notFound();
  }

  const skills = profile.skills;
  const hasWarnings = profile.qualityWarnings && profile.qualityWarnings.length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; easyCV
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            profile.qualityCritical ? "destructive" : hasWarnings ? "warning" : "secondary"
          }
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

      <Card>
        <CardHeader className="gap-2 border-b pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {profile.name ?? "Your consolidated resume"}
          </h1>
          {profile.titles && profile.titles.length > 0 && (
            <p className="text-sm text-muted-foreground">{profile.titles.join(" / ")}</p>
          )}
          {profile.summary && <p className="text-sm text-pretty">{profile.summary}</p>}
        </CardHeader>

        <CardContent className="flex flex-col gap-6 pt-6">
          {skills && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
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
                          <Badge key={i} variant="outline">
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
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <Briefcase className="size-4" />
                  Experience
                </h2>
                <div className="flex flex-col gap-5">
                  {profile.experience.map((entry, i) => (
                    <article key={i} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <h3 className="text-sm font-semibold">
                          {entry.title ?? "Role"}
                          {entry.company ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              &mdash; {entry.company}
                            </span>
                          ) : null}
                        </h3>
                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                          {[entry.start, entry.end].filter(Boolean).join(" - ")}
                          {entry.location ? ` (${entry.location})` : ""}
                        </p>
                      </div>
                      {entry.bullets.length > 0 && (
                        <ul className="ml-4 list-outside list-disc text-sm text-pretty">
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
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <GraduationCap className="size-4" />
                  Education
                </h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {profile.education.map((entry, i) => (
                    <li key={i}>
                      {entry.degree ?? ""}
                      {entry.school ? ` — ${entry.school}` : ""}
                      {entry.years ? (
                        <span className="text-muted-foreground"> ({entry.years})</span>
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
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Certifications
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {profile.certifications.map((cert, i) => (
                    <Badge key={i} variant="outline">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
          {paymentStatus?.paid && paymentStatus.downloadToken ? (
            <>
              <p className="text-sm text-muted-foreground">
                Payment received &mdash; your PDF is ready.
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={`/api/download/${paymentStatus.downloadToken}`}>
                  <Download />
                  Download PDF
                </a>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Like what you see? Pay once to download the polished PDF.
              </p>
              <CheckoutButton uploadId={uploadIdParam} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
