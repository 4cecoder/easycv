"use client";

import Link from "next/link";

import { openPrivacyChoices } from "@/lib/consent";
import { SUPPORT_EMAIL } from "@/lib/legal";

/** Site-wide footer: legal links, the "Privacy choices" control, and contact. */
export function SiteFooter() {
  const linkClass = "underline underline-offset-2 hover:text-foreground transition-colors";
  return (
    <footer className="border-t border-border py-4 px-6 text-center">
      <nav aria-label="Legal" className="text-[11px] text-muted-foreground">
        <Link href="/privacy" className={linkClass}>Privacy</Link>
        {" · "}
        <Link href="/terms" className={linkClass}>Terms</Link>
        {" · "}
        <button type="button" onClick={openPrivacyChoices} className={linkClass}>
          Privacy choices
        </button>
        {" · "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>Contact</a>
      </nav>
    </footer>
  );
}
