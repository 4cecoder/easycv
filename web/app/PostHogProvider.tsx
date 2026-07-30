"use client";

import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { useEffect } from "react";

if (typeof window !== "undefined") {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (token) {
    posthog.init(token, {
      api_host: host,
      person_profiles: "identified_only",
      capture_pageview: true, // Automatically captures pageviews
    });
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <Provider client={posthog}>{children}</Provider>;
}
