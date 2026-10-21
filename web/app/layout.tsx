import type { ReactNode } from "react";
import "./globals.css";
import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { UserMonProvider } from "./UserMonProvider";

// Figtree is Astryx's own documented font stack (--font-family-body /
// --font-family-heading in @astryxdesign/core) -- used here as the same
// visual-identity token, loaded normally via next/font (no astryx package).
import { AppHeader } from "@/components/AppHeader";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { DevDebugMenu } from "@/components/DevDebugMenu";
import { FAQAssistantChat } from "@/components/FAQAssistantChat";
import { ThemeProvider } from "@/components/ThemeProvider";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "easyCV | Build Your Resume",
  description:
    "Upload your CVs and get one clean, professional résumé.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", figtree.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary transition-colors duration-150">
        <UserMonProvider>
          <ConvexClientProvider>
            <ThemeProvider>
              <div className="flex min-h-screen flex-col">
                {/* First in DOM order so keyboard users reach it right away; it is visually fixed to the bottom. */}
                <ConsentBanner />
                <AppHeader />
                <div className="flex-1">{children}</div>
                <SiteFooter />
                <FAQAssistantChat />
                <DevDebugMenu />
              </div>
            </ThemeProvider>
          </ConvexClientProvider>
        </UserMonProvider>
      </body>
    </html>
  );
}
