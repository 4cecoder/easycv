"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

/** Canonical legacy data key resolved from the authenticated Seridian identity. */
export function useOwnerSessionKey() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.identity.getOwnerSessionKey, isAuthenticated ? {} : "skip");
}
