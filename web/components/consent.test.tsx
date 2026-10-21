import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { ConsentBanner } from "./ConsentBanner";
import { SiteFooter } from "./SiteFooter";
import { DevDebugMenu } from "./DevDebugMenu";
import { UserMonProvider } from "../app/UserMonProvider";
import { CONSENT_COOKIE, readConsentChoice, setConsentChoice } from "../lib/consent";
import { usermon } from "../lib/usermon";

function clearAllCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

function setGpc(on: boolean) {
  Object.defineProperty(navigator, "globalPrivacyControl", { value: on, configurable: true });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearAllCookies();
  localStorage.clear();
  setGpc(false);
  Object.defineProperty(navigator, "doNotTrack", { value: null, configurable: true });
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
  vi.unstubAllEnvs();
});

const ingestCalls = () => fetchSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes("/v1/ingest"));

describe("ConsentBanner", () => {
  test("shows on first visit as a labelled region with two equal choices, without stealing focus", () => {
    render(<ConsentBanner />);
    const region = screen.getByRole("region", { name: "Privacy choices" });
    expect(region).toHaveAccessibleDescription(/essential cookies/i);
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Essential only" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cookie details" })).toHaveAttribute("href", "/privacy#cookies");
    expect(document.activeElement).toBe(document.body);
  });

  test("Essential only is remembered in a first-party cookie and hides the banner", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(readConsentChoice()).toBe("essential");
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=essential`);
    expect(screen.queryByRole("region", { name: "Privacy choices" })).not.toBeInTheDocument();
  });

  test("is not shown once a choice exists", () => {
    document.cookie = `${CONSENT_COOKIE}=essential; path=/`;
    render(<ConsentBanner />);
    expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
  });

  test("footer 'Privacy choices' reopens it, focuses the heading, Escape closes and restores focus", () => {
    document.cookie = `${CONSENT_COOKIE}=analytics; path=/`;
    render(
      <>
        <SiteFooter />
        <ConsentBanner />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Privacy choices" });
    trigger.focus();
    fireEvent.click(trigger);
    const heading = screen.getByRole("heading", { name: "Privacy choices" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Current choice: analytics allowed.")).toBeInTheDocument();

    fireEvent.keyDown(heading, { key: "Escape" });
    expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  test("with Global Privacy Control: no first-visit prompt, and Accept is disabled with an explanation", () => {
    setGpc(true);
    render(
      <>
        <SiteFooter />
        <ConsentBanner />
      </>,
    );
    expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Privacy choices" }));
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/Global Privacy Control/);
  });
});

describe("UserMonProvider", () => {
  test("registers nothing and sends nothing before consent", async () => {
    render(<UserMonProvider><p>app</p></UserMonProvider>);
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await act(async () => {
      await usermon.flush();
    });
    expect(ingestCalls()).toHaveLength(0);
    expect(document.cookie).not.toContain("easycv_telemetry_session");
  });

  test("starts only after the visitor accepts analytics", async () => {
    render(<UserMonProvider><p>app</p></UserMonProvider>);
    await act(async () => {
      setConsentChoice("analytics");
    });
    await act(async () => {
      await usermon.flush();
    });
    expect(ingestCalls()).toHaveLength(1);
    const body = JSON.parse(String(ingestCalls()[0][1]?.body));
    expect(body.sessions).toHaveLength(1);
  });

  test("GPC blocks it even after clicking Accept", async () => {
    setGpc(true);
    render(<UserMonProvider><p>app</p></UserMonProvider>);
    await act(async () => {
      setConsentChoice("analytics");
    });
    await act(async () => {
      await usermon.flush();
    });
    expect(ingestCalls()).toHaveLength(0);
  });
});

describe("DevDebugMenu", () => {
  test("renders nothing and makes no network probes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<DevDebugMenu />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
