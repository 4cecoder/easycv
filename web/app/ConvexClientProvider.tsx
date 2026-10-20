"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { getConvexReactClient } from "../lib/convexClient";

function useSeridianAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (forceRefreshToken) setIsLoading(true);
    try {
      const response = await fetch("/api/auth/token", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) {
        setIsAuthenticated(false);
        return null;
      }
      const data = await response.json() as { token?: string | null };
      setIsAuthenticated(Boolean(data.token));
      return data.token ?? null;
    } catch {
      setIsAuthenticated(false);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, isAuthenticated, fetchAccessToken };
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProviderWithAuth client={getConvexReactClient()} useAuth={useSeridianAuth}>{children}</ConvexProviderWithAuth>;
}
