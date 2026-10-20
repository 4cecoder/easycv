import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";

import { api } from "../convex/_generated/api";
import { decryptSession, SESSION_COOKIE } from "./seridian-oidc";

export interface AuthenticatedConvex {
  convex: ConvexHttpClient;
  ownerSessionKey: string;
}

export class AuthenticationRequiredError extends Error {
  constructor() { super("Authentication required"); }
}

/** Create a request-scoped authenticated Convex client from the Seridian ID token. */
export async function authenticatedConvexFromCookie(cookieValue: string | undefined): Promise<AuthenticatedConvex> {
  if (!cookieValue) throw new AuthenticationRequiredError();
  let session;
  try {
    session = await decryptSession(cookieValue);
  } catch {
    throw new AuthenticationRequiredError();
  }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Server is not configured with NEXT_PUBLIC_CONVEX_URL");

  // Never cache this client: ConvexHttpClient.setAuth mutates client state.
  const convex = new ConvexHttpClient(url);
  convex.setAuth(session.idToken);
  const ownerSessionKey = await convex.query(api.identity.getOwnerSessionKey, {});
  if (typeof ownerSessionKey !== "string" || !ownerSessionKey) {
    throw new Error("Authenticated identity could not be resolved");
  }
  return { convex, ownerSessionKey };
}

export function authenticatedConvexFromRequest(request: NextRequest) {
  return authenticatedConvexFromCookie(request.cookies.get(SESSION_COOKIE)?.value);
}
