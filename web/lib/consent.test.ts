import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CONSENT_COOKIE,
  hasAnalyticsConsent,
  hasPrivacySignal,
  readConsentChoice,
  setConsentChoice,
  TRACKING_COOKIES,
  TRACKING_LOCAL_STORAGE_KEYS,
} from "./consent";
import { collectDeviceProfile, getTelemetrySessionId } from "./fingerprint";
import { getAnalyticsDeviceId } from "./identity";
import { usermon } from "./usermon";
import { trackEvent, trackUploadStarted } from "./analytics";
import { trackAction } from "./tracker";

const convexMutation = vi.fn();
vi.mock("./authenticatedConvexClient", () => ({
  getAuthenticatedConvexClient: vi.fn(async () => ({
    client: { mutation: convexMutation },
    ownerSessionKey: "owner",
  })),
}));

function clearAllCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

function setPrivacySignals({ gpc, dnt }: { gpc?: boolean; dnt?: string | null }) {
  Object.defineProperty(navigator, "globalPrivacyControl", { value: gpc, configurable: true });
  Object.defineProperty(navigator, "doNotTrack", { value: dnt ?? null, configurable: true });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearAllCookies();
  localStorage.clear();
  setPrivacySignals({ gpc: undefined, dnt: null });
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  convexMutation.mockClear();
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.useRealTimers();
});

function usermonEventCount(): number {
  return fetchSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes("/v1/ingest")).length;
}

describe("default (no choice yet) = essential only", () => {
  test("no consent before the visitor chooses", () => {
    expect(readConsentChoice()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  test("telemetry id, device profile and analytics id are empty and nothing is stored", async () => {
    expect(getTelemetrySessionId()).toBe("");
    expect(getAnalyticsDeviceId()).toBe("");
    const profile = await collectDeviceProfile();
    expect(profile.sessionId).toBe("");
    expect(profile.browser).toBe("unknown");
    expect(document.cookie).toBe("");
    expect(localStorage.length).toBe(0);
  });

  test("no canvas, WebGL or audio probing happens", async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const audio = vi.fn();
    (window as unknown as { AudioContext: unknown }).AudioContext = audio;
    getAnalyticsDeviceId();
    getTelemetrySessionId();
    await collectDeviceProfile();
    expect(getContext).not.toHaveBeenCalled();
    expect(audio).not.toHaveBeenCalled();
    getContext.mockRestore();
  });

  test("UserMon queue sends nothing", async () => {
    usermon.trackSession({ sessionKey: "s", platform: "web", release: "1", startedAt: 1 });
    usermon.trackRumEvent({ type: "vital", name: "LCP", value: 1, platform: "web", timestamp: 1 });
    usermon.trackException({ message: "x", platform: "web", timestamp: 1 });
    await usermon.flush();
    expect(usermonEventCount()).toBe(0);
  });

  test("analytics helpers and the action tracker do nothing", async () => {
    trackEvent("x");
    trackUploadStarted({ fileCount: 1, fileTypes: ["pdf"], totalSizeKb: 1, hasJobDescription: false, hasJobUrl: false });
    for (let i = 0; i < 6; i++) await trackAction("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(convexMutation).not.toHaveBeenCalled();
  });
});

describe("after opting in", () => {
  test("analytics run and ids are created", async () => {
    setConsentChoice("analytics");
    expect(readConsentChoice()).toBe("analytics");
    expect(hasAnalyticsConsent()).toBe(true);
    expect(getTelemetrySessionId()).not.toBe("");
    expect(getAnalyticsDeviceId()).not.toBe("");

    usermon.trackRumEvent({ type: "vital", name: "LCP", value: 1, platform: "web", timestamp: 1 });
    await usermon.flush();
    expect(usermonEventCount()).toBe(1);
  });

  test("choosing Essential only later wipes analytics ids (including legacy keys)", () => {
    setConsentChoice("analytics");
    getTelemetrySessionId();
    getAnalyticsDeviceId();
    localStorage.setItem("easycv_id", "legacy");
    document.cookie = "cv_id=legacy; path=/";
    document.cookie = "easycv_dh=legacy; path=/";

    setConsentChoice("essential");
    for (const key of TRACKING_LOCAL_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    for (const name of TRACKING_COOKIES) expect(document.cookie).not.toContain(`${name}=`);
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=essential`);
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

describe("browser privacy signals override consent", () => {
  test("Global Privacy Control blocks analytics even with a stored opt-in", async () => {
    document.cookie = `${CONSENT_COOKIE}=analytics; path=/`;
    setPrivacySignals({ gpc: true });
    expect(hasPrivacySignal()).toBe(true);
    expect(hasAnalyticsConsent()).toBe(false);
    expect(getTelemetrySessionId()).toBe("");
    usermon.trackRumEvent({ type: "vital", name: "LCP", value: 1, platform: "web", timestamp: 1 });
    await usermon.flush();
    expect(usermonEventCount()).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  test("Do Not Track blocks analytics", () => {
    document.cookie = `${CONSENT_COOKIE}=analytics; path=/`;
    setPrivacySignals({ dnt: "1" });
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
