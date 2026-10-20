"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { getConvexReactClient } from "../lib/convexClient";

function useSeridianAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const fetchAccessToken = useCallback(async () => {
    // Keep the initial session check separate from Convex's token refresh
    // lifecycle. Toggling auth-provider loading during refresh makes Convex
    // clear and recreate its auth connection.
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

  // Convex only asks for a token after this hook reports an authenticated
  // session. Bootstrap the session check ourselves so a valid Seridian
  // browser cookie can transition isAuthenticated from false to true.
  useEffect(() => {
    void fetchAccessToken();
  }, [fetchAccessToken]);

  return { isLoading, isAuthenticated, fetchAccessToken };
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProviderWithAuth client={getConvexReactClient()} useAuth={useSeridianAuth}>{children}</ConvexProviderWithAuth>;
}
