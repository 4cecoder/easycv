"use client";

import { openPrivacyChoices } from "@/lib/consent";

/** Inline link-styled button that reopens the consent banner. */
export function PrivacyChoicesButton({ children = "Privacy choices" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={openPrivacyChoices} className="underline underline-offset-2 hover:text-foreground">
      {children}
    </button>
  );
}
