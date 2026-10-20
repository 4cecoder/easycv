import { NextRequest, NextResponse } from "next/server";
import { basicAuth, decryptSession, oidcEnv, SESSION_COOKIE } from "@/lib/seridian-oidc";

export async function POST(request: NextRequest) {
  // Best-effort provider revocation. Local logout always succeeds even if Auth
  // is unreachable; refresh tokens are rotated and become unusable after revoke.
  try {
    const env = oidcEnv();
    const value = request.cookies.get(SESSION_COOKIE)?.value;
    if (value) {
      const session = await decryptSession(value);
      if (session.refreshToken) {
        await fetch(`${env.issuer}/revoke`, {
          method: "POST", cache: "no-store",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(env.clientId, env.clientSecret) },
          body: new URLSearchParams({ token: session.refreshToken, token_type_hint: "refresh_token" }),
        });
      }
    }
  } catch {
    // Clear this app's session regardless of provider availability.
  }
  const response = NextResponse.json({ ok: true });
  for (const name of [SESSION_COOKIE, "easycv_oidc_state", "easycv_oidc_nonce", "easycv_oidc_verifier"]) {
    response.cookies.set(name, "", { path: name === SESSION_COOKIE ? "/" : "/api/auth", httpOnly: true, secure: process.env.APP_URL?.startsWith("https://"), sameSite: "lax", maxAge: 0 });
  }
  return response;
}
