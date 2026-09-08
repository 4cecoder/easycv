// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";
import { usermon, usermonTrack, USERMON_ENDPOINT, USERMON_KEY } from "./usermon";
import { withUserMonSpan } from "./usermon-server";
import { NextRequest, NextResponse } from "next/server";

describe("UserMon Telemetry Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("usermonTrack makes a POST request with the expected auth header and payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, sessions: 1 }), { status: 200 })
    );

    const res = await usermonTrack({
      sessions: [
        {
          sessionKey: "test-sess-1",
          platform: "web",
          release: "1.0.0",
          startedAt: 123456789,
        },
      ],
      rumEvents: [
        {
          type: "vital",
          name: "LCP",
          value: 2100,
          platform: "web",
          timestamp: 123456789,
        },
      ],
      apiSpans: [
        {
          method: "GET",
          route: "/api/test",
          status: 200,
          durationMs: 42,
          platform: "web",
          timestamp: 123456789,
        },
      ],
      exceptions: [],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      USERMON_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${USERMON_KEY}`,
        },
      })
    );

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.sessions).toHaveLength(1);
    expect(callBody.sessions[0].sessionKey).toBe("test-sess-1");
    expect(callBody.rumEvents[0].name).toBe("LCP");
    expect(callBody.apiSpans[0].route).toBe("/api/test");

    fetchSpy.mockRestore();
  });

  test("UserMonQueue buffers events and flushes correctly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    usermon.trackSession({
      sessionKey: "session-queue-test",
      platform: "web",
      release: "1.0.0",
      startedAt: Date.now(),
    });

    usermon.trackRumEvent({
      type: "vital",
      name: "CLS",
      value: 10,
      platform: "web",
      timestamp: Date.now(),
    });

    await usermon.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sent.sessions.some((s: any) => s.sessionKey === "session-queue-test")).toBe(true);
    expect(sent.rumEvents.some((r: any) => r.name === "CLS")).toBe(true);

    fetchSpy.mockRestore();
  });

  test("withUserMonSpan measures execution time and records api span", async () => {
    const spanSpy = vi.spyOn(usermon, "trackApiSpan");

    const handler = withUserMonSpan("/api/mock-test", async (req: NextRequest) => {
      return NextResponse.json({ success: true }, { status: 201 });
    });

    const mockReq = new NextRequest("http://localhost/api/mock-test", {
      method: "POST",
    });

    const res = await handler(mockReq);
    expect(res.status).toBe(201);
    expect(spanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        route: "/api/mock-test",
        status: 201,
        platform: "web",
      })
    );
  });

  test("withUserMonSpan catches errors, logs span and exception, and rethrows", async () => {
    const spanSpy = vi.spyOn(usermon, "trackApiSpan");
    const excSpy = vi.spyOn(usermon, "trackException");

    const failingHandler = withUserMonSpan("/api/fail-test", async (req: NextRequest) => {
      throw new Error("Simulated API Error");
    });

    const mockReq = new NextRequest("http://localhost/api/fail-test", {
      method: "GET",
    });

    await expect(failingHandler(mockReq)).rejects.toThrow("Simulated API Error");

    expect(spanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        route: "/api/fail-test",
        status: 500,
      })
    );

    expect(excSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Simulated API Error",
        platform: "web",
        context: { route: "/api/fail-test", method: "GET" },
      })
    );
  });
});
