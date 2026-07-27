import { ConvexReactClient } from "convex/react";

// Client-side counterpart to lib/convexServer.ts's ConvexHttpClient --
// this one is for React components that need live, reactive subscriptions
// (useQuery), not one-shot request/response calls. Used by
// ConvexClientProvider (app root) to power the preview page's live
// queued -> processing -> ready | error status updates with zero polling:
// Convex pushes the update the moment the worker's mutation lands.
let cachedClient: ConvexReactClient | null = null;

export function getConvexReactClient(): ConvexReactClient {
  if (!cachedClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_URL is not set -- see web/.env.example",
      );
    }
    cachedClient = new ConvexReactClient(url);
  }
  return cachedClient;
}
