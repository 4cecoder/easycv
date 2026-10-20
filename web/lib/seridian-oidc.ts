import { createRemoteJWKSet, jwtVerify } from "jose";

export const SESSION_COOKIE = "easycv_seridian_session";

export interface OidcSession { idToken: string; refreshToken: string | null; sub: string }

/** Read and validate the Seridian OIDC relying-party settings from the environment. */
export function oidcEnv() {
  const issuer = (process.env.SERIDIAN_AUTH_ISSUER ?? "").trim().replace(/\/+$/, "");
  const clientId = (process.env.SERIDIAN_AUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.SERIDIAN_AUTH_CLIENT_SECRET ?? "").trim();
  const appUrl = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!issuer || !clientId || !clientSecret || !appUrl) throw new Error("Seridian Auth is not configured");
  const parsed = new URL(issuer);
  const app = new URL(appUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Issuer must use HTTPS");
  if (app.protocol !== "https:" && app.hostname !== "localhost") throw new Error("APP_URL must use HTTPS");
  return { issuer, clientId, clientSecret, appUrl, redirectUri: `${appUrl}/api/auth/callback` };
}

/** 32 random bytes, base64url-encoded, for state, nonce and PKCE verifiers. */
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/** Fetch the issuer's OIDC discovery document and check it names the expected issuer. */
export async function discover(issuer: string) {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
  const doc = await response.json() as Record<string, unknown>;
  if (doc.issuer !== issuer) throw new Error("OIDC issuer does not exactly match configured issuer");
  const origin = new URL(issuer).origin;
  for (const key of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri"] as const) {
    if (typeof doc[key] !== "string" || new URL(doc[key]).origin !== origin) throw new Error(`Invalid OIDC ${key}`);
  }
  return doc as { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint: string; jwks_uri: string };
}

/** Verify an ES256 ID token's signature, issuer, audience and (optionally) nonce. */
export async function verifyIdToken(idToken: string, issuer: string, clientId: string, jwksUri: string, nonce?: string) {
  const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(jwksUri)), {
    algorithms: ["ES256"], issuer, audience: clientId,
    requiredClaims: nonce ? ["iss", "sub", "aud", "exp", "nonce"] : ["iss", "sub", "aud", "exp"],
    ...(nonce ? { nonce } : {}),
  });
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("ID token has no subject");
  return payload;
}

/** HTTP Basic client authentication header for the token and revocation endpoints. */
export function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
}

async function sessionKey() {
  const secret = process.env.SERIDIAN_AUTH_CLIENT_SECRET;
  if (!secret) throw new Error("Missing session encryption key source");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`easycv-session:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt the session with AES-GCM for storage in an HttpOnly cookie. */
export async function encryptSession(session: OidcSession) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sessionKey(), new TextEncoder().encode(JSON.stringify(session)));
  return Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)]).toString("base64url");
}

/** Decrypt and parse a session cookie produced by encryptSession. */
export async function decryptSession(value: string): Promise<OidcSession> {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29) throw new Error("Invalid session cookie");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, await sessionKey(), bytes.subarray(12));
  const session = JSON.parse(new TextDecoder().decode(plaintext)) as OidcSession;
  if (typeof session.idToken !== "string" || typeof session.sub !== "string") throw new Error("Invalid session payload");
  return session;
}
