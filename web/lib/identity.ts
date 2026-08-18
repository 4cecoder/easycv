/**
 * Silent Cross-Device Identity Resolution
 *
 * Generates a stable device fingerprint hash that persists across sessions.
 * When a user provides an email (checkout, job match, profile wizard),
 * we silently link all their sessions/devices to a single identity.
 *
 * No user-facing indicators. No consent prompts. Just works.
 */

const DEVICE_HASH_KEY = "easycv_dh";
const LINKED_IDENTITY_KEY = "easycv_id";
const IDENTITY_COOKIE = "cv_id";

// ── Device Hash (stable across sessions on same device) ────────────────

/**
 * Generate a stable device hash from browser signals.
 * Same device = same hash, even in incognito (mostly).
 * Different devices = different hashes.
 */
export async function getDeviceHash(): Promise<string> {
  if (typeof window === "undefined") return "";

  const cached = localStorage.getItem(DEVICE_HASH_KEY);
  if (cached) return cached;

  const signals: string[] = [];

  // Screen fingerprint (stable per monitor setup)
  signals.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  signals.push(`${window.devicePixelRatio}`);

  // Timezone + language (stable per user config)
  signals.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  signals.push(navigator.language);
  signals.push((navigator.languages || []).join(","));

  // Hardware (stable per machine)
  signals.push(`${navigator.hardwareConcurrency}`);
  signals.push(`${(navigator as any).deviceMemory || 0}`);
  signals.push(navigator.platform);

  // Canvas fingerprint (very stable, slightly different per GPU/driver)
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = "#069";
      ctx.fillText("easycv", 2, 15);
      signals.push(canvas.toDataURL().slice(-50));
    }
  } catch { /* canvas blocked */ }

  // WebGL fingerprint (GPU + driver specific)
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        signals.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
        signals.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
      }
      signals.push(`${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);
    }
  } catch { /* webgl blocked */ }

  // Audio context fingerprint (subtle hardware signature)
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ac.createOscillator();
    const analyser = ac.createAnalyser();
    const gain = ac.createGain();
    gain.gain.value = 0; // silent
    osc.connect(analyser);
    analyser.connect(gain);
    gain.connect(ac.destination);
    osc.start(0);
    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    signals.push(data.slice(0, 10).join(","));
    osc.stop();
    ac.close();
  } catch { /* audio blocked */ }

  // Navigator properties (fonts, plugins)
  signals.push(`${navigator.doNotTrack}`);
  signals.push(`${navigator.cookieEnabled}`);
  signals.push(`${navigator.maxTouchPoints}`);

  // Hash all signals into a stable fingerprint
  const raw = signals.join("||");
  const hash = await sha256(raw);

  try { localStorage.setItem(DEVICE_HASH_KEY, hash); } catch { /* quota */ }

  // Sync to cookie for cross-subdomain/refresh persistence
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 2);
  document.cookie = `${DEVICE_HASH_KEY}=${hash}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

  return hash;
}

// ── Linked Identity (cross-device via email) ───────────────────────────

/**
 * Get the linked identity ID. If we've seen this user's email before
 * on any device, all sessions share this ID.
 */
export function getLinkedIdentity(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LINKED_IDENTITY_KEY)
    || getCookie(IDENTITY_COOKIE);
}

/**
 * Silently link current session to an identity when we learn their email.
 * Called from: checkout (Stripe email), profile wizard (email field),
 * job match (email in resume), upload (email in resume text).
 */
export function linkIdentity(email: string): string {
  if (typeof window === "undefined") return "";

  const normalized = email.toLowerCase().trim();
  const identityId = "id_" + hashCode(normalized);

  // Store linked identity
  try { localStorage.setItem(LINKED_IDENTITY_KEY, identityId); } catch { /* quota */ }

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 2);
  document.cookie = `${IDENTITY_COOKIE}=${identityId}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

  return identityId;
}

/**
 * Silently extract email from resume text and link identity.
 * Called automatically after LLM extraction returns structured data.
 */
export function silentlyLinkFromProfile(profile: { contact?: { email?: string } }): string | null {
  const email = profile?.contact?.email;
  if (!email || !email.includes("@")) return null;
  return linkIdentity(email);
}

// ── Full Identity Payload (sent with every telemetry event) ────────────

export interface IdentityPayload {
  deviceHash: string;
  linkedIdentity: string | null;
  sessionId: string;
}

export async function getIdentityPayload(): Promise<IdentityPayload> {
  const deviceHash = await getDeviceHash();
  const linkedIdentity = getLinkedIdentity();
  // Lazy import to avoid circular deps
  const { getBrowserSessionId } = await import("./fingerprint");
  const sessionId = getBrowserSessionId();

  return { deviceHash, linkedIdentity, sessionId };
}

// ── Helpers ────────────────────────────────────────────────────────────

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? match.split("=")[1] : null;
}
