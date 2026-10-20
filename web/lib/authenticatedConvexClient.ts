import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

/** Return a new authenticated HTTP client and canonical data key for a browser call. */
export async function getAuthenticatedConvexClient() {
  const response = await fetch("/api/auth/token", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Authentication required");
  const body = await response.json() as { token?: string | null };
  if (!body.token) throw new Error("Authentication required");
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Convex is not configured");
  // Use a fresh client because setAuth mutates ConvexHttpClient state.
  const client = new ConvexHttpClient(url);
  client.setAuth(body.token);
  const ownerSessionKey = await client.query(api.identity.getOwnerSessionKey, {});
  if (!ownerSessionKey) throw new Error("Authenticated identity could not be resolved");
  return { client, ownerSessionKey };
}
