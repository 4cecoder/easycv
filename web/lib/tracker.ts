/**
 * Silent Action Tracker
 *
 * Hooks into every user interaction silently.
 * Logs actions, detects rapid-fire abuse, pairs with identity.
 * Never shown to user. Never blocks UI.
 */
import { getBrowserSessionId } from "./fingerprint";
import { getDeviceHash, getLinkedIdentity } from "./identity";

let lastActionTime = 0;
const RAPID_FIRE_THRESHOLD = 2000; // ms

interface TrackedAction {
  sessionId: string;
  deviceHash: string;
  identityId?: string;
  uploadId?: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  clientTimestamp: number;
  rapidFire?: boolean;
  suspicious?: boolean;
}

const actionQueue: TrackedAction[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function isRapidFire(): boolean {
  const now = Date.now();
  const rapid = now - lastActionTime < RAPID_FIRE_THRESHOLD;
  lastActionTime = now;
  return rapid;
}

/**
 * Track a silent action. Queued and flushed in batches.
 * Call this from any component. No return value. No UI effect.
 */
export async function trackAction(
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
  uploadId?: string,
) {
  try {
    const sessionId = getBrowserSessionId();
    const deviceHash = await getDeviceHash();
    const identityId = getLinkedIdentity() ?? undefined;
    const rapidFire = isRapidFire();

    const entry: TrackedAction = {
      sessionId,
      deviceHash,
      identityId,
      uploadId,
      action,
      target,
      meta: { ...meta, userAgent: navigator.userAgent },
      clientTimestamp: Date.now(),
      rapidFire,
      // Flag if extremely rapid (<500ms) or too many rapid actions
      suspicious: rapidFire && (typeof meta?.intervalMs === "number" ? meta.intervalMs < 500 : false),
    };

    actionQueue.push(entry);

    // Flush every 5 actions or after 10s
    if (actionQueue.length >= 5) {
      flushActions();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flushActions, 10000);
    }
  } catch { /* tracking must never break anything */ }
}

/**
 * Flush queued actions to Convex.
 */
async function flushActions() {
  if (actionQueue.length === 0) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

  const batch = actionQueue.splice(0, 50);
  try {
    const { api } = await import("../convex/_generated/api");
    const { getConvexReactClient } = await import("./convexClient");
    const client = getConvexReactClient();
    // Fire and forget — batch insert
    client.mutation(api.audit.logActions, { actions: batch as any });
  } catch { /* best effort */ }
}

// ── Convenience wrappers for common actions ────────────────────────────

export function trackPageView(path: string) {
  trackAction("page_view", path);
}

export function trackFileUpload(uploadId: string, fileCount: number, fileTypes: string[], totalSizeKb: number) {
  trackAction("file_upload", undefined, { fileCount, fileTypes, totalSizeKb }, uploadId);
}

export function trackFileRemove(fileName: string) {
  trackAction("file_remove", fileName);
}

export function trackJobPaste(uploadId: string, hasUrl: boolean) {
  trackAction("job_paste", undefined, { hasUrl }, uploadId);
}

export function trackPreviewOpen(uploadId: string) {
  trackAction("preview_open", undefined, undefined, uploadId);
}

export function trackTabSwitch(uploadId: string, tab: string) {
  trackAction("tab_switch", tab, undefined, uploadId);
}

export function trackCopyText(uploadId: string, section: string) {
  trackAction("copy_text", section, undefined, uploadId);
}

export function trackExportHtml(uploadId: string, template: string) {
  trackAction("export_html", template, undefined, uploadId);
}

export function trackCheckoutStart(uploadId: string, mode: string) {
  trackAction("checkout_start", mode, undefined, uploadId);
}

export function trackCheckoutDone(uploadId: string, amountCents: number) {
  trackAction("checkout_done", undefined, { amountCents }, uploadId);
}

export function trackCheckoutFail(uploadId: string, error: string) {
  trackAction("checkout_fail", undefined, { error }, uploadId);
}

export function trackDownload(uploadId: string) {
  trackAction("download", undefined, undefined, uploadId);
}

export function trackWizardStep(step: number, stepName: string) {
  trackAction("wizard_step", stepName, { step });
}

export function trackSampleLoad(sampleName: string) {
  trackAction("sample_load", sampleName);
}

export function trackBulletEdit(uploadId: string, bulletIndex: number) {
  trackAction("bullet_edit", undefined, { bulletIndex }, uploadId);
}

/**
 * Flush on page unload (capture remaining actions).
 */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushActions();
  });
  // Also flush when tab becomes hidden
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushActions();
    }
  });
}
