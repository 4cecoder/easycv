import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const { convexMutation, setAuth, env, discover, verifyIdToken, encryptSession } = vi.hoisted(() => ({
  convexMutation: vi.fn(),
  setAuth: vi.fn(),
  env: { issuer: "https://auth.example", clientId: "easycv", clientSecret: "secret", redirectUri: "https://easycv.example/api/auth/callback", appUrl: "https://easycv.example" },
  discover: vi.fn(),
  verifyIdToken: vi.fn(),
  encryptSession: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = setAuth;
    mutation = convexMutation;
  },
}));
vi.mock("@/convex/_generated/api", () => ({
  api: { identity: { bindLegacyAccount: "identity:bindLegacyAccount" } },
}));
vi.mock("@/lib/seridian-oidc", () => ({
  basicAuth: () => "Basic test",
  discover,
  encryptSession,
  oidcEnv: () => env,
  SESSION_COOKIE: "easycv_seridian_session",
  verifyIdToken,
}));

import { GET } from "./route";

function callbackRequest(includeLegacyCookie: boolean) {
  const cookies = ["easycv_oidc_state=state", "easycv_oidc_nonce=nonce", "easycv_oidc_verifier=verifier"];
  if (includeLegacyCookie) cookies.push("cv_session=legacy-session-proof");
  return new NextRequest("https://easycv.example/api/auth/callback?code=code&state=state", {
    headers: { cookie: cookies.join("; ") },
  });
}

describe("OIDC callback legacy ownership bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://convex.example";
    discover.mockResolvedValue({ token_endpoint: "https://auth.example/token", jwks_uri: "https://auth.example/jwks" });
    verifyIdToken.mockResolvedValue({ sub: "seridian-subject" });
    encryptSession.mockResolvedValue("encrypted-session");
    convexMutation.mockResolvedValue("legacy-session-proof");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: "verified-id-token" }),
    }));
  });

  test("passes the exact pre-cutover cookie only when present", async () => {
    const response = await GET(callbackRequest(true));

    expect(response.status).toBe(307);
    expect(setAuth).toHaveBeenCalledWith("verified-id-token");
    expect(convexMutation).toHaveBeenCalledOnce();
    expect(convexMutation).toHaveBeenCalledWith("identity:bindLegacyAccount", {
      legacySessionId: "legacy-session-proof",
    });
  });

  test("skips migration when the legacy cookie is absent", async () => {
    const response = await GET(callbackRequest(false));

    expect(response.status).toBe(307);
    expect(convexMutation).not.toHaveBeenCalled();
  });
});
