"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getBrowserSessionId } from "@/lib/fingerprint";
import { usermon, USERMON_RELEASE } from "@/lib/usermon";

/**
 * UserMon Client Provider
 *
 * Injects client-side session registration, route RUM events,
 * unhandled exception / rejection listeners, and Web Vitals (LCP, FID, CLS, INP, TTFB).
 */
export function UserMonProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 1. Register Session on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sessionKey = getBrowserSessionId();
    if (sessionKey) {
      usermon.trackSession({
        sessionKey,
        platform: "web",
        release: USERMON_RELEASE,
        startedAt: Date.now(),
      });
    }

    // Capture global unhandled exceptions
    const handleWindowError = (event: ErrorEvent) => {
      usermon.trackException({
        message: event.message || "Unknown client error",
        stack: event.error?.stack,
        platform: "web",
        timestamp: Date.now(),
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          pathname: window.location.pathname,
        },
      });
    };

    // Capture unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
          ? reason
          : JSON.stringify(reason);

      usermon.trackException({
        message: `Unhandled rejection: ${message}`,
        stack: reason instanceof Error ? reason.stack : undefined,
        platform: "web",
        timestamp: Date.now(),
        context: {
          pathname: window.location.pathname,
        },
      });
    };

    // Capture Core Web Vitals via PerformanceObserver if available
    let observer: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver !== "undefined") {
        observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.entryType === "largest-contentful-paint") {
              usermon.trackRumEvent({
                type: "vital",
                name: "LCP",
                value: Math.round(entry.startTime),
                platform: "web",
                timestamp: Date.now(),
                metadata: { pathname: window.location.pathname },
              });
            } else if (entry.entryType === "first-input") {
              const fidEntry = entry as PerformanceEventTiming;
              usermon.trackRumEvent({
                type: "vital",
                name: "FID",
                value: Math.round(fidEntry.processingStart - fidEntry.startTime),
                platform: "web",
                timestamp: Date.now(),
                metadata: { pathname: window.location.pathname },
              });
            } else if (entry.entryType === "layout-shift") {
              const clsEntry = entry as unknown as { value: number; hadRecentInput: boolean };
              if (!clsEntry.hadRecentInput) {
                usermon.trackRumEvent({
                  type: "vital",
                  name: "CLS",
                  value: Math.round((clsEntry.value || 0) * 1000),
                  platform: "web",
                  timestamp: Date.now(),
                  metadata: { pathname: window.location.pathname },
                });
              }
            }
          }
        });

        // Observe paint & input timings supported by browser
        const supportedTypes = PerformanceObserver.supportedEntryTypes || [];
        const observeTypes = [
          "largest-contentful-paint",
          "first-input",
          "layout-shift",
        ].filter((t) => supportedTypes.includes(t));

        for (const type of observeTypes) {
          try {
            observer.observe({ type, buffered: true });
          } catch {
            // Ignore unsupported entry types
          }
        }
      }
    } catch {
      // Non-blocking
    }

    // Flush on beforeunload / visibility hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void usermon.flush();
      }
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleVisibilityChange);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleVisibilityChange);
      if (observer) {
        observer.disconnect();
      }
      void usermon.flush();
    };
  }, []);

  // 2. Track Route navigation RUM event
  useEffect(() => {
    if (!pathname) return;
    usermon.trackRumEvent({
      type: "navigation",
      name: "route_view",
      value: 1,
      platform: "web",
      timestamp: Date.now(),
      metadata: { pathname },
    });
  }, [pathname]);

  return <>{children}</>;
}
