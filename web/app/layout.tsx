import type { ReactNode } from "react";
import "./globals.css";
import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { PostHogProvider } from "./PostHogProvider";

// Figtree is Astryx's own documented font stack (--font-family-body /
// --font-family-heading in @astryxdesign/core) -- used here as the same
// visual-identity token, loaded normally via next/font (no astryx package).
import { AppHeader } from "@/components/AppHeader";
import { DevDebugMenu } from "@/components/DevDebugMenu";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "easyCV | Build Your Resume",
  description:
    "Upload your CVs. Get a clean, professional resume in seconds.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <PostHogProvider>
          <ConvexClientProvider>
            <div className="flex min-h-screen flex-col">
              <AppHeader />
              <div className="flex-1">{children}</div>
              <DevDebugMenu />
            </div>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
