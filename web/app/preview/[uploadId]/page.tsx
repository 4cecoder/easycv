import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { SESSION_COOKIE } from "../../../lib/session";
import { CheckoutButton } from "./CheckoutButton";

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

  return (
    <main>
      <h1>{profile.name ?? "Your consolidated resume"}</h1>

      {profile.rawFallback && (
        <p role="alert">
          We couldn&apos;t fully structure this resume automatically. Raw
          extracted content is preserved, but some sections below may be
          incomplete.
        </p>
      )}

      {profile.titles && profile.titles.length > 0 && <p>{profile.titles.join(" / ")}</p>}
      {profile.summary && <p>{profile.summary}</p>}

      {skills && (
        <section>
          <h2>Skills</h2>
          <ul>
            {SKILL_LABELS.map(([key, label]) => {
              const items = (skills as Record<string, string[]>)[key];
              if (!items || items.length === 0) return null;
              return (
                <li key={key}>
                  <strong>{label}:</strong> {items.join(", ")}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {profile.experience && profile.experience.length > 0 && (
        <section>
          <h2>Experience</h2>
          {profile.experience.map((entry, i) => (
            <article key={i}>
              <h3>
                {entry.title ?? "Role"}
                {entry.company ? ` -- ${entry.company}` : ""}
              </h3>
              <p>
                {[entry.start, entry.end].filter(Boolean).join(" - ")}
                {entry.location ? ` (${entry.location})` : ""}
              </p>
              {entry.bullets.length > 0 && (
                <ul>
                  {entry.bullets.map((bullet, j) => (
                    <li key={j}>{bullet}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}

      {profile.education && profile.education.length > 0 && (
        <section>
          <h2>Education</h2>
          <ul>
            {profile.education.map((entry, i) => (
              <li key={i}>
                {entry.degree ?? ""}
                {entry.school ? ` -- ${entry.school}` : ""}
                {entry.years ? ` (${entry.years})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.certifications && profile.certifications.length > 0 && (
        <section>
          <h2>Certifications</h2>
          <ul>
            {profile.certifications.map((cert, i) => (
              <li key={i}>{cert}</li>
            ))}
          </ul>
        </section>
      )}

      <hr />

      {paymentStatus?.paid && paymentStatus.downloadToken ? (
        <a href={`/api/download/${paymentStatus.downloadToken}`}>Download PDF</a>
      ) : (
        <CheckoutButton uploadId={uploadIdParam} />
      )}
    </main>
  );
}
