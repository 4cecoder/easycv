/**
 * Browser Session & Device Fingerprint Utility
 *
 * Zero-login identifier + silent device telemetry collection.
 * Pairs every upload with rich device/browser data for product analytics.
 */

const SESSION_STORAGE_KEY = "easycv_browser_session";
const COOKIE_NAME = "cv_session";
const DEVICE_CACHE_KEY = "easycv_device_profile";
const DEVICE_CACHE_TTL = 86400000; // 24h

export interface DeviceProfile {
  sessionId: string;
  // Browser
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  language: string;
  languages: string[];
  timezone: string;
  // Hardware
  cores: number;
  memoryGb: number;
  gpuRenderer: string;
  platform: string;
  // Display
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelRatio: number;
  // Capabilities
  touchSupport: boolean;
  webgl: boolean;
  webgpu: boolean;
  serviceWorker: boolean;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
  // Connection
  connectionType: string;
  downlink: number;
  // Derived
  tier: "budget" | "mid" | "high" | "unknown";
  timestamp: number;
}

function parseUA(ua: string) {
  const browser = (() => {
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("Chrome/")) return "Chrome";
    if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
    return "Other";
  })();

  const version = (() => {
    const patterns: Record<string, RegExp> = {
      Firefox: /Firefox\/([\d.]+)/,
      Edge: /Edg\/([\d.]+)/,
      Chrome: /Chrome\/([\d.]+)/,
      Safari: /Version\/([\d.]+)/,
    };
    return patterns[browser]?.exec(ua)?.[1] ?? "unknown";
  })();

  const os = (() => {
    if (ua.includes("Mac OS X")) return "macOS";
    if (ua.includes("Windows NT 10")) return "Windows 10";
    if (ua.includes("Windows NT 11") || (ua.includes("Windows") && ua.includes("11"))) return "Windows 11";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    return "Unknown";
  })();

  const osVersion = (() => {
    const m = ua.match(/(?:Mac OS X|Windows NT|Android|CPU iPhone OS)[ _]([\d_.]+)/);
    return m ? m[1].replace(/_/g, ".") : "unknown";
  })();

  return { browser, browserVersion: version, os, osVersion };
}

function detectGPU(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "webgl";
    const info = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return info || "unknown";
  } catch {
    return "unknown";
  }
}

function detectWebGPU(): boolean {
  try {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  } catch {
    return false;
  }
}

function classifyTier(cores: number, memoryGb: number, gpu: string): DeviceProfile["tier"] {
  const hasHighEndGpu = /RTX|GTX|Apple|Metal|Radeon|Adreno 7|Xclipse/.test(gpu);
  if (cores >= 8 && memoryGb >= 8 && hasHighEndGpu) return "high";
  if (cores >= 4 && memoryGb >= 4) return "mid";
  if (cores >= 2) return "budget";
  return "unknown";
}

export function getBrowserSessionId(): string {
  if (typeof window === "undefined") return "";

  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
    if (match) sessionId = match.split("=")[1];
  }
  if (!sessionId) {
    sessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "sess_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${COOKIE_NAME}=${sessionId}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

  return sessionId;
}

/**
 * Collect full device profile. Cached for 24h to avoid repeated detection.
 * Silent — no user interaction required.
 */
export async function collectDeviceProfile(): Promise<DeviceProfile> {
  if (typeof window === "undefined") {
    return emptyProfile("");
  }

  const cached = localStorage.getItem(DEVICE_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as DeviceProfile;
      if (Date.now() - parsed.timestamp < DEVICE_CACHE_TTL) return parsed;
    } catch { /* ignore corrupt cache */ }
  }

  const sessionId = getBrowserSessionId();
  const ua = navigator.userAgent;
  const { browser, browserVersion, os, osVersion } = parseUA(ua);

  const cores = navigator.hardwareConcurrency || 0;
  const memoryGb = (navigator as any).deviceMemory || 0;
  const gpu = detectGPU();
  const tier = classifyTier(cores, memoryGb, gpu);

  const profile: DeviceProfile = {
    sessionId,
    browser, browserVersion, os, osVersion,
    language: navigator.language,
    languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cores, memoryGb,
    gpuRenderer: gpu,
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
    touchSupport: "ontouchstart" in window,
    webgl: !!document.createElement("canvas").getContext("webgl"),
    webgpu: detectWebGPU(),
    serviceWorker: "serviceWorker" in navigator,
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack === "1",
    connectionType: (navigator as any).connection?.effectiveType || "unknown",
    downlink: (navigator as any).connection?.downlink || 0,
    tier,
    timestamp: Date.now(),
  };

  try { localStorage.setItem(DEVICE_CACHE_KEY, JSON.stringify(profile)); } catch { /* quota */ }

  return profile;
}

function emptyProfile(sessionId: string): DeviceProfile {
  return {
    sessionId,
    browser: "unknown", browserVersion: "unknown",
    os: "unknown", osVersion: "unknown",
    language: "en", languages: ["en"],
    timezone: "UTC",
    cores: 0, memoryGb: 0, gpuRenderer: "unknown", platform: "unknown",
    screenWidth: 0, screenHeight: 0, colorDepth: 0, pixelRatio: 1,
    touchSupport: false, webgl: false, webgpu: false,
    serviceWorker: false, cookiesEnabled: false, doNotTrack: false,
    connectionType: "unknown", downlink: 0,
    tier: "unknown", timestamp: Date.now(),
  };
}
