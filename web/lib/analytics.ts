import { type DeviceProfile, getBrowserSessionId } from "./fingerprint";
import { usermon } from "./usermon";

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
    usermon.trackRumEvent({
      type: "action",
      name: "upload_started",
      value: payload.fileCount,
      platform: "web",
      timestamp: Date.now(),
      metadata: {
        totalSizeKb: payload.totalSizeKb,
        fileTypes: payload.fileTypes,
        hasJobDescription: payload.hasJobDescription,
        hasJobUrl: payload.hasJobUrl,
      },
    });

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
    usermon.trackRumEvent({
      type: "action",
      name: "upload_completed",
      value: payload.processingTimeMs,
      platform: "web",
      timestamp: Date.now(),
      metadata: {
        uploadId: payload.uploadId,
        fileCount: payload.fileCount,
      },
    });

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
    usermon.trackRumEvent({
      type: "event",
      name,
      value: 1,
      platform: "web",
      timestamp: Date.now(),
      metadata: properties,
    });

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
