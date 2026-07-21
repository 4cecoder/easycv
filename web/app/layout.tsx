import type { ReactNode } from "react";
import "./globals.css";
import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";

// Figtree is Astryx's own documented font stack (--font-family-body /
// --font-family-heading in @astryxdesign/core) -- used here as the same
// visual-identity token, loaded normally via next/font (no astryx package).
const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "easyCV",
  description:
    "Upload your CV, resume, and LinkedIn export -- get one consolidated resume back, free to preview, pay once to download the PDF.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
