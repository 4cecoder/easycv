import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { basicAuth, discover, encryptSession, oidcEnv, SESSION_COOKIE, verifyIdToken } from "@/lib/seridian-oidc";

function clearHandshake(response: NextResponse, secure: boolean) {
  for (const name of ["state", "nonce", "verifier"]) response.cookies.set(`easycv_oidc_${name}`, "", {
    httpOnly: true, secure, sameSite: "lax", path: "/api/auth", maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  let env;
  try { env = oidcEnv(); } catch { return NextResponse.redirect(new URL("/?auth_error=misconfigured", request.url)); }
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get("easycv_oidc_state")?.value;
  const nonce = request.cookies.get("easycv_oidc_nonce")?.value;
  const verifier = request.cookies.get("easycv_oidc_verifier")?.value;
  const finish = (error?: string) => {
    const target = new URL("/", env.appUrl);
    if (error) target.searchParams.set("auth_error", error);
    const response = NextResponse.redirect(target);
    clearHandshake(response, env.appUrl.startsWith("https://"));
    return response;
  };
  if (providerError) return finish(providerError.slice(0, 80));
  if (!code || !state || state !== expectedState || !nonce || !verifier) return finish("invalid_state");
  try {
    const provider = await discover(env.issuer);
    const response = await fetch(provider.token_endpoint, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(env.clientId, env.clientSecret) },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.redirectUri, code_verifier: verifier }),
    });
    if (!response.ok) return finish("token_exchange_failed");
    const tokens = await response.json() as { id_token?: string; refresh_token?: string };
    if (!tokens.id_token) return finish("missing_id_token");
    const claims = await verifyIdToken(tokens.id_token, env.issuer, env.clientId, provider.jwks_uri, nonce);
    if (typeof claims.sub !== "string" || !claims.sub) return finish("missing_subject");

    // Preserve legacy ownership only when this browser presents the exact
    // pre-cutover owner key. The Convex mutation checks that it matches the
    // current verified account row and that the JWT email is provider-verified.
    const legacySessionId = request.cookies.get("cv_session")?.value;
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (legacySessionId && convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl);
        convex.setAuth(tokens.id_token);
        await convex.mutation(api.identity.bindLegacyAccount, { legacySessionId });
      } catch {
        // Login remains available; failed/invalid migration leaves this
        // identity on its fresh Seridian owner key. Never fall back to email.
      }
    }

    const sessionValue = await encryptSession({ idToken: tokens.id_token, refreshToken: tokens.refresh_token ?? null, sub: claims.sub });
    const result = NextResponse.redirect(new URL("/", env.appUrl));
    result.cookies.set(SESSION_COOKIE, sessionValue, { httpOnly: true, secure: env.appUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    clearHandshake(result, env.appUrl.startsWith("https://"));
    return result;
  } catch {
    return finish("oidc_callback_failed");
  }
}
