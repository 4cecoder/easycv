// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { getTrustedClientIp, UNKNOWN_CLIENT_IP } from "./client-ip";
import { middleware } from "../middleware";

describe("getTrustedClientIp", () => {
  test("@regression EASYC-6 prefers Netlify's x-nf-client-connection-ip and ignores spoofed X-Forwarded-For", () => {
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
      "x-nf-client-connection-ip": "203.0.113.9",
      "x-real-ip": "198.51.100.1",
    });
    expect(getTrustedClientIp(headers)).toBe("203.0.113.9");
  });

  test("falls back to x-real-ip, then a sentinel -- never X-Forwarded-For", () => {
    expect(getTrustedClientIp(new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(getTrustedClientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toBe(UNKNOWN_CLIENT_IP);
  });
});

describe("middleware (best-effort in-memory first line)", () => {
  const hit = (headers: Record<string, string>) =>
    middleware(new NextRequest("http://localhost/api/checkout", { method: "POST", headers }));

  test("@regression EASYC-6 rotating X-Forwarded-For or the telemetry cookie does not mint new buckets", () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(hit({
        "x-nf-client-connection-ip": "203.0.113.50",
        "x-forwarded-for": `10.0.0.${i}`,
        cookie: `easycv_telemetry_session=rotated-${i}`,
      }).status);
    }
    // checkout bucket allows 3/min per trusted IP.
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  test("requests without a trusted IP header aren't lumped into one shared bucket", () => {
    for (let i = 0; i < 5; i++) expect(hit({ "x-forwarded-for": "6.6.6.6" }).status).not.toBe(429);
  });
});
