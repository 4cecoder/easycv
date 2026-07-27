"use client";

import type { ReactNode } from "react";
import { ConvexProvider } from "convex/react";
import { getConvexReactClient } from "../lib/convexClient";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={getConvexReactClient()}>{children}</ConvexProvider>;
}
