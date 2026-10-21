import type { ReactNode } from "react";

import { LEGAL_LAST_UPDATED } from "@/lib/legal";

/** Shared shell for /privacy and /terms: draft notice, title, readable prose width. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p
        className="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        data-testid="legal-draft-notice"
      >
        Last updated {LEGAL_LAST_UPDATED} — draft pending legal review
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</div>
      <div className="legal-prose mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground/90">{children}</div>
    </main>
  );
}

/** A titled section with an anchor id for deep links (e.g. /privacy#cookies). */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 scroll-mt-20">
      <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Simple responsive table used for subprocessors and cookies. */
export function LegalTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="border-b border-border px-3 py-2 font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top odd:bg-background even:bg-muted/20">
              {row.map((cell, j) => (
                <td key={j} className="border-b border-border px-3 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
