"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label="Toggle light and dark theme"
      className={`flex size-8 items-center justify-center rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 ${className}`}
      title={`Switch to ${resolvedTheme === "dark" ? "Light" : "Dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="size-4 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="size-4 text-slate-700 transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}
