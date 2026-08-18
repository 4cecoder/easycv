import type { ReactNode } from "react";
import "./globals.css";
import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { PostHogProvider } from "./PostHogProvider";

// Figtree is Astryx's own documented font stack (--font-family-body /
// --font-family-heading in @astryxdesign/core) -- used here as the same
// visual-identity token, loaded normally via next/font (no astryx package).
import { MicrosoftSuiteHeader } from "@/components/MicrosoftSuiteHeader";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "easyCV 365 | Professional Resume Intelligence & ATS Engine",
  description:
    "Instant, private, local AI resume consolidation and ASD-STE100 ATS optimization. Free preview with executive LaTeX single-column exports.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <PostHogProvider>
          <ConvexClientProvider>
            <div className="flex min-h-screen flex-col">
              <MicrosoftSuiteHeader />
              <div className="flex-1">{children}</div>
            </div>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
