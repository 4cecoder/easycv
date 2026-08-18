"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { getBrowserSessionId } from "../lib/fingerprint";
import { 
  Command, 
  FileText, 
  Zap, 
  Keyboard, 
  X, 
  User, 
  CheckCircle2, 
  Lock 
} from "lucide-react";
import { AccountSignupModal } from "./AccountSignupModal";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(getBrowserSessionId());
  }, []);

  const account = useQuery(api.auth.getAccountBySession, sessionId ? { sessionId } : "skip");

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
          
          {/* Left: easyCV Brand & Title */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group transition-transform active:scale-95">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs group-hover:bg-primary/90 transition-colors">
                <FileText className="size-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-foreground">easyCV</span>
                <span className="rounded-[4px] bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary tracking-wide uppercase border border-primary/20">
                  AI
                </span>
              </div>
            </Link>

            {/* Breadcrumb Separator */}
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border/60">
              <span>Resume Intelligence</span>
            </div>
          </div>

          {/* Center / Right: Engine Status & Account Action */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* User Account / Sync Button */}
            {account?.verified ? (
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="size-3 text-emerald-400" />
                <span className="max-w-[120px] truncate">{account.email}</span>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <User className="size-3.5" />
                <span className="text-[11px] font-medium">Sign In / Sync</span>
              </button>
            )}

            {/* Quick Command Palette Button */}
            <button
              onClick={() => setShowShortcuts(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-all"
              title="Keyboard Shortcuts (Press ? or ⌘K)"
            >
              <Keyboard className="size-3.5" />
              <span className="hidden lg:inline text-[11px]">Shortcuts</span>
              <kbd className="hidden sm:inline-flex rounded bg-background px-1.5 py-0.2 text-[10px] font-mono font-medium text-muted-foreground border border-border">
                ⌘K
              </kbd>
            </button>

            {/* Light / Dark Mode Toggle */}
            <ThemeToggle />

            {/* Quick Upload CTA */}
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 text-xs font-semibold shadow-xs transition-all active:scale-95"
            >
              <Zap className="size-3.5" />
              <span>New CV</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Account Signup / Sync Modal */}
      <AccountSignupModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Command className="size-4 text-primary" />
                <span>Command Shortcuts & Controls</span>
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
                <span className="text-muted-foreground">Open Document Preview</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">1</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Job Match Scoring</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">2</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Grammar & Impact Linter</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">3</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Multi-Doc Career Vault</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">4</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Export Documents</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">5</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Show Keyboard Shortcuts</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K or ?</kbd>
              </div>
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                onClick={() => setShowShortcuts(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-muted hover:bg-muted/80 text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
