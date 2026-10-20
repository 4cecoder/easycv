import { NextRequest, NextResponse } from "next/server";
import { basicAuth, decryptSession, discover, encryptSession, oidcEnv, SESSION_COOKIE, verifyIdToken } from "@/lib/seridian-oidc";

// ConvexProviderWithAuth obtains the verified ID token through this same-origin
// endpoint; the browser never reads the httpOnly session cookie directly.
export async function GET(request: NextRequest) {
  try {
    const env = oidcEnv();
    const value = request.cookies.get(SESSION_COOKIE)?.value;
    if (!value) return NextResponse.json({ token: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const session = await decryptSession(value);
    const provider = await discover(env.issuer);
    try {
      await verifyIdToken(session.idToken, env.issuer, env.clientId, provider.jwks_uri);
      return NextResponse.json({ token: session.idToken }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
    } catch {
      if (!session.refreshToken) throw new Error("No refresh token");
      const refresh = await fetch(provider.token_endpoint, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(env.clientId, env.clientSecret) },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
      });
      if (!refresh.ok) throw new Error("Token refresh failed");
      const tokens = await refresh.json() as { id_token?: string; refresh_token?: string };
      if (!tokens.id_token) throw new Error("Refresh response did not include an ID token");
      const claims = await verifyIdToken(tokens.id_token, env.issuer, env.clientId, provider.jwks_uri);
      if (claims.sub !== session.sub) throw new Error("Refreshed token subject changed");
      const response = NextResponse.json({ token: tokens.id_token }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
      response.cookies.set(SESSION_COOKIE, await encryptSession({ idToken: tokens.id_token, refreshToken: tokens.refresh_token ?? session.refreshToken, sub: session.sub }), {
        httpOnly: true, secure: env.appUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }
  } catch {
    // Do not clear the cookie on a refresh failure. Parallel tabs can race a
    // single-use rotating refresh token: one request wins and writes the new
    // cookie while another sees the old token as already consumed. Clearing
    // here would let that losing response log out the winner. A genuinely
    // invalid session remains unusable and can be replaced by a fresh login.
    return NextResponse.json({ token: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
