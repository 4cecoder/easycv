import { type DeviceProfile, getBrowserSessionId } from "./fingerprint";

export interface UploadStartedPayload {
  fileCount: number;
  fileTypes: string[];
  totalSizeKb: number;
  hasJobDescription: boolean;
  hasJobUrl: boolean;
  device?: DeviceProfile;
}

export interface UploadCompletePayload {
  uploadId?: string;
  processingTimeMs: number;
  fileCount: number;
  device?: DeviceProfile;
}

export function trackUploadStarted(payload: UploadStartedPayload): void {
  if (typeof window === "undefined") return;

  const sessionId = getBrowserSessionId();
  const body = {
    event: "upload_started",
    sessionId,
    ...payload,
    timestamp: Date.now(),
  };

  try {
    fetch("/api/dev/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

export function trackUploadComplete(payload: UploadCompletePayload): void {
  if (typeof window === "undefined") return;

  const sessionId = getBrowserSessionId();
  const body = {
    event: "upload_completed",
    sessionId,
    ...payload,
    timestamp: Date.now(),
  };

  try {
    fetch("/api/dev/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

export function trackEvent(name: string, properties?: Record<string, any>): void {
  if (typeof window === "undefined") return;
  const sessionId = getBrowserSessionId();

  try {
    fetch("/api/dev/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: name,
        sessionId,
        properties,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}
