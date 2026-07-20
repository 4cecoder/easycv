import { ConvexHttpClient } from "convex/browser";

// A single shared HTTP client for server-side (Node) callers -- API routes
// and server components -- to talk to Convex. This is deliberately NOT the
// React `useQuery`/`useMutation` hooks (those need a client-side provider);
// ConvexHttpClient is the plain request/response client meant for exactly
// this kind of server-to-Convex call.
let cachedClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!cachedClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_URL is not set -- see web/.env.example",
      );
    }
    cachedClient = new ConvexHttpClient(url);
  }
  return cachedClient;
}
