import { NextRequest, NextResponse } from "next/server";
import { decryptSession, discover, oidcEnv, verifyIdToken, SESSION_COOKIE } from "./seridian-oidc";

/** Verify a Seridian session and the same verified-email allowlist used by Convex. */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const session = await decryptSession(cookie);
    const env = oidcEnv();
    const provider = await discover(env.issuer);
    const claims = await verifyIdToken(session.idToken, env.issuer, env.clientId, provider.jwks_uri);
    if (claims.sub !== session.sub) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const allowed = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
    if (claims.email_verified !== true || !email || !allowed.has(email)) {
      return NextResponse.json({ error: "Admin access is not enabled for this account" }, { status: 403 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
}
