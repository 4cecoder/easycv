import type { AuthConfig } from "convex/server";

// Seridian Auth signs ID tokens with ES256. Convex's `oidc` provider does not
// accept ES256, so trust it through the customJwt provider.
const issuer = process.env.SERIDIAN_AUTH_ISSUER;
const clientId = process.env.SERIDIAN_AUTH_CLIENT_ID;
if (!issuer || !clientId) {
  throw new Error("SERIDIAN_AUTH_ISSUER and SERIDIAN_AUTH_CLIENT_ID must be set on this Convex deployment");
}

export default {
  providers: [{
    type: "customJwt",
    issuer,
    jwks: `${issuer}/jwks.json`,
    algorithm: "ES256",
    applicationID: clientId,
  }],
} satisfies AuthConfig;
