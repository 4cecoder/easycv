"use client";

import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";

// Split out from PreviewClient (same precedent as CheckoutButton.tsx in this
// directory) since it owns its own "show all" toggle state. Deliberately
// NOT built on the shared Alert component -- these are optional polish tips,
// not failures, so they shouldn't share styling (red/amber, alert icons,
// role="alert") with the real error states elsewhere on this page (e.g.
// "Upload not found", "Processing Failed").
const COLLAPSED_COUNT = 3;

export function QualitySuggestions({ suggestions }: { suggestions: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (suggestions.length === 0) return null;

  const visible = expanded ? suggestions : suggestions.slice(0, COLLAPSED_COUNT);
  const hiddenCount = suggestions.length - visible.length;

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Lightbulb className="size-3.5 text-primary" />
        <span>Ways to strengthen this resume</span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
          {suggestions.length}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {visible.map((tip, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/50" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <ChevronDown className="size-3" />
          Show {hiddenCount} more
        </button>
      )}
      {expanded && suggestions.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <ChevronUp className="size-3" />
          Show less
        </button>
      )}
    </div>
  );
}
