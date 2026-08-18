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
import { FAQAssistantChat } from "@/components/FAQAssistantChat";
import { ThemeProvider } from "@/components/ThemeProvider";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "easyCV | Build Your Resume",
  description:
    "Upload your CVs. Get a clean, professional resume in seconds.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", figtree.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary transition-colors duration-150">
        <PostHogProvider>
          <ConvexClientProvider>
            <ThemeProvider>
              <div className="flex min-h-screen flex-col">
                <AppHeader />
                <div className="flex-1">{children}</div>
                <footer className="border-t border-border py-4 px-6 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    easyCV uses analytics to improve our service.{" "}
                    <a href="/privacy" className="underline hover:text-foreground transition-colors">Privacy</a>{" "}
                    · <a href="/terms" className="underline hover:text-foreground transition-colors">Terms</a>
                  </p>
                </footer>
                <FAQAssistantChat />
                <DevDebugMenu />
              </div>
            </ThemeProvider>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
