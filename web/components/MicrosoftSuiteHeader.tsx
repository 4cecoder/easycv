"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Command, 
  Cpu, 
  FileText, 
  Zap, 
  Keyboard,
  X,
  Sparkles
} from "lucide-react";

export function MicrosoftSuiteHeader() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if (e.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/80 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-3 sm:px-6">
          
          {/* Left: Microsoft 4-Color Brand & Title */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group transition-transform active:scale-95">
              {/* Microsoft Quad-Tile Brand Glyph */}
              <div className="grid grid-cols-2 gap-0.5 size-4.5 p-0.5 rounded-[3px] bg-foreground/5 ring-1 ring-border group-hover:ring-primary/40 transition-all">
                <div className="size-1.5 rounded-[1px] bg-[#F25022]" />
                <div className="size-1.5 rounded-[1px] bg-[#7FBA00]" />
                <div className="size-1.5 rounded-[1px] bg-[#00A4EF]" />
                <div className="size-1.5 rounded-[1px] bg-[#FFB900]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-foreground">easyCV</span>
                <span className="rounded-[3px] bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary tracking-wide uppercase border border-primary/20">
                  365 Suite
                </span>
              </div>
            </Link>

            {/* Breadcrumb Separator */}
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border/60">
              <span>Studio</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-foreground font-medium">Resume Intelligence & ATS Engine</span>
            </div>
          </div>

          {/* Center / Right: Engine Status & Fast Command Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Ultra-Fast Engine Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Neural Engine</span>
            </div>

            {/* Quick Command Palette Button */}
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-all"
              title="Keyboard Shortcuts (Press ? or ⌘K)"
            >
              <Keyboard className="size-3.5" />
              <span className="hidden lg:inline text-[11px]">Shortcuts</span>
              <kbd className="hidden sm:inline-flex rounded bg-background px-1.5 py-0.2 text-[10px] font-mono font-medium text-muted-foreground border border-border">
                ⌘K
              </kbd>
            </button>

            {/* Quick Upload CTA */}
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 text-xs font-semibold shadow-xs transition-all active:scale-95"
            >
              <Zap className="size-3.5" />
              <span>New Analysis</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Command className="size-4 text-primary" />
                <span>Command Shortcuts & Power Controls</span>
              </div>
              <button 
                onClick={() => setShowShortcuts(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-3 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Toggle Shortcuts Palette</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] border border-border">⌘K or ?</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Submit / Generate Resume</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] border border-border">Enter ↵</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Switch Resume Preview Tabs</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] border border-border">1, 2, 3, 4, 5</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Export Clean HTML</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] border border-border">Instant (Free)</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">LaTeX Single-Column Engine</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">ASD-STE100 Validated</span>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                onClick={() => setShowShortcuts(false)}
                className="rounded-md bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
