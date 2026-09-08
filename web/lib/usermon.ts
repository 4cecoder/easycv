/**
 * UserMon Custom Telemetry Client
 *
 * Provides batching, flush management, and payload delivery for UserMon
 * telemetry ingesting sessions, RUM events (e.g. Web Vitals), API spans,
 * and exceptions.
 */

export const USERMON_ENDPOINT =
  process.env.NEXT_PUBLIC_USERMON_ENDPOINT ||
  "https://quirky-seal-916.convex.site/v1/ingest";

export const USERMON_KEY =
  process.env.NEXT_PUBLIC_USERMON_KEY ||
  "um_15cd8c8aeb43eb64e8f5fc6ed301281ae4d2ec4cbae16f6827a97d8cb68e8456131067c8";

export const USERMON_RELEASE = "1.0.0";

export interface UserMonSession {
  sessionKey: string;
  platform: string;
  release: string;
  startedAt: number;
}

export interface UserMonRumEvent {
  type: string;
  name: string;
  value: number;
  platform: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface UserMonApiSpan {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  platform: string;
  timestamp: number;
}

export interface UserMonException {
  message: string;
  stack?: string;
  platform: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface UserMonBatch {
  sessions?: UserMonSession[];
  rumEvents?: UserMonRumEvent[];
  apiSpans?: UserMonApiSpan[];
  exceptions?: UserMonException[];
}

/**
 * Low-level track function sending a telemetry batch to UserMon endpoint.
 *
 * @param batch - Telemetry batch payload containing sessions, events, spans, or exceptions.
 * @returns Promise resolving to the fetch Response.
 */
export function usermonTrack(batch: UserMonBatch): Promise<Response> {
  const payload: Required<UserMonBatch> = {
    sessions: batch.sessions ?? [],
    rumEvents: batch.rumEvents ?? [],
    apiSpans: batch.apiSpans ?? [],
    exceptions: batch.exceptions ?? [],
  };

  return fetch(USERMON_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${USERMON_KEY}`,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

// ---------------------------------------------------------------------------
// Telemetry Queue & Buffering (Client & Server)
// ---------------------------------------------------------------------------

class UserMonQueue {
  private sessions: UserMonSession[] = [];
  private rumEvents: UserMonRumEvent[] = [];
  private apiSpans: UserMonApiSpan[] = [];
  private exceptions: UserMonException[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxBatchSize = 20;
  private readonly flushIntervalMs = 2000;

  /**
   * Enqueue a session event.
   */
  trackSession(session: UserMonSession): void {
    this.sessions.push(session);
    this.checkFlush();
  }

  /**
   * Enqueue a RUM event (e.g. Web Vital, page view, client timing).
   */
  trackRumEvent(event: UserMonRumEvent): void {
    this.rumEvents.push(event);
    this.checkFlush();
  }

  /**
   * Enqueue an API route span.
   */
  trackApiSpan(span: UserMonApiSpan): void {
    this.apiSpans.push(span);
    this.checkFlush();
  }

  /**
   * Enqueue an exception.
   */
  trackException(exception: UserMonException): void {
    this.exceptions.push(exception);
    this.checkFlush();
  }

  private checkFlush(): void {
    const totalCount =
      this.sessions.length +
      this.rumEvents.length +
      this.apiSpans.length +
      this.exceptions.length;

    if (totalCount >= this.maxBatchSize) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.flushIntervalMs);
      const timer = this.flushTimer as unknown as { unref?: () => void };
      if (timer?.unref) timer.unref();
    }
  }

  /**
   * Immediately flush all queued telemetry items.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (
      this.sessions.length === 0 &&
      this.rumEvents.length === 0 &&
      this.apiSpans.length === 0 &&
      this.exceptions.length === 0
    ) {
      return;
    }

    const batch: Required<UserMonBatch> = {
      sessions: this.sessions.splice(0, this.sessions.length),
      rumEvents: this.rumEvents.splice(0, this.rumEvents.length),
      apiSpans: this.apiSpans.splice(0, this.apiSpans.length),
      exceptions: this.exceptions.splice(0, this.exceptions.length),
    };

    try {
      await usermonTrack(batch);
    } catch {
      // Telemetry failures must be fail-safe and never bubble up
    }
  }
}

/** Shared singleton telemetry queue */
export const usermon = new UserMonQueue();
