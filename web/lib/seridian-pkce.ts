/** RFC 7636 S256 code challenge for a PKCE verifier. */
export async function deriveCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}
