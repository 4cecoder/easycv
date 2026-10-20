import { NextResponse } from "next/server";
import { deriveCodeChallenge } from "@/lib/seridian-pkce";
import { discover, oidcEnv, randomToken } from "@/lib/seridian-oidc";

export async function GET() {
  try {
    const env = oidcEnv();
    const provider = await discover(env.issuer);
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken() + randomToken();
    const challenge = await deriveCodeChallenge(verifier);
    const url = new URL(provider.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: env.clientId, redirect_uri: env.redirectUri, response_type: "code",
      scope: "openid profile email offline_access", state, nonce,
      code_challenge: challenge, code_challenge_method: "S256",
    }).toString();
    const response = NextResponse.redirect(url);
    const secure = env.appUrl.startsWith("https://");
    for (const [name, value] of Object.entries({ state, nonce, verifier })) {
      response.cookies.set(`easycv_oidc_${name}`, value, { httpOnly: true, secure, sameSite: "lax", path: "/api/auth", maxAge: 600 });
    }
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start login" }, { status: 503 });
  }
}
