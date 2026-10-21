import type { ReactNode } from "react";

/**
 * Visible "[FOUNDER: ...]" placeholder for details the business owner must
 * fill in before launch (legal entity, refund policy, governing law, ...).
 * Rendered as a <mark> so it is easy to spot on the draft legal pages.
 */
export function FounderPlaceholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber-200/70 px-1 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100" data-founder-todo="">
      [FOUNDER: {children}]
    </mark>
  );
}
