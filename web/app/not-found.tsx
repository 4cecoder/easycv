"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Home, Zap, FileText } from "lucide-react";
import { Button } from "@bytecats/ui-kit";

export default function NotFound() {
  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full fluent-subtle-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg flex flex-col items-center text-center">
        
        {/* Clean Brand Glyph Accent */}
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <FileText className="size-5" />
        </div>

        <span className="text-xs font-mono font-bold uppercase tracking-widest text-primary">
          Error 404 &bull; Resource Not Found
        </span>
        
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2 mb-2">
          Page or Resume Not Found
        </h1>
        
        <p className="text-xs text-muted-foreground leading-relaxed mb-6">
          The requested document or path is unavailable, has expired, or belongs to a different browser session.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-2.5 w-full justify-center">
          <Button asChild variant="default" size="sm" className="h-9 text-xs font-semibold rounded-md shadow-xs">
            <Link href="/" className="flex items-center gap-1.5 justify-center">
              <Zap className="size-3.5" />
              <span>Start New Analysis</span>
            </Link>
          </Button>
          
          <Button asChild variant="outline" size="sm" className="h-9 text-xs font-medium rounded-md border-border">
            <Link href="/" className="flex items-center gap-1.5 justify-center">
              <ArrowLeft className="size-3.5" />
              <span>Return Home</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

