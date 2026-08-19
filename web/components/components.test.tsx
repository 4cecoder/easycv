import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ─── Global Mocks (vi.mock is hoisted above imports) ───────────────────────

// Mock convex/react
vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => null),
  useMutation: vi.fn(() => vi.fn()),
}));

// Mock posthog-js/react
vi.mock("posthog-js/react", () => ({
  usePostHog: vi.fn(() => ({ capture: vi.fn() })),
}));

// Mock @bytecats/ui-kit
vi.mock("@bytecats/ui-kit", () => ({
  Button: ({ children, onClick, disabled, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-size={size} className={className} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children, variant, className, ...props }: any) => (
    <span data-variant={variant} className={className} {...props}>{children}</span>
  ),
  Alert: ({ children, variant, role, className, ...props }: any) => (
    <div role={role} data-variant={variant} className={className} {...props}>{children}</div>
  ),
  AlertDescription: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

// Mock hardwareDetection
vi.mock("../lib/hardwareDetection", () => ({
  detectHardwareProfile: vi.fn(() =>
    Promise.resolve({
      hasWebGPU: false,
      gpuRenderer: "Integrated Graphics",
      gpuVendor: "Generic",
      cpuCores: 8,
      deviceMemoryGb: 16,
      networkType: "4G",
      hardwareTier: "high",
      estimatedPipelineDurationMs: 3800,
      engineName: "AI Neural Core",
    })
  ),
}));

// Mock fingerprint
vi.mock("../lib/fingerprint", () => ({
  getBrowserSessionId: vi.fn(() => "test-session-id"),
  collectDeviceProfile: vi.fn(() => Promise.resolve({})),
}));

// Mock tracker (using @ alias since CheckoutButton imports from @/lib/tracker)
vi.mock("@/lib/tracker", () => ({
  trackCheckoutStart: vi.fn(),
  trackCheckoutDone: vi.fn(),
  trackCheckoutFail: vi.fn(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => {
  const icon = (name: string) =>
    React.forwardRef<HTMLSpanElement, any>((props, ref) => (
      <span data-testid={`icon-${name}`} ref={ref} {...props} />
    ));
  return {
    Cpu: icon("cpu"), ShieldCheck: icon("shield-check"), Zap: icon("zap"),
    Sparkles: icon("sparkles"), CheckCircle2: icon("check-circle-2"), Layers: icon("layers"),
    Command: icon("command"), FileText: icon("file-text"), Keyboard: icon("keyboard"),
    X: icon("x"), User: icon("user"), Lock: icon("lock"), MessageSquare: icon("message-square"),
    Send: icon("send"), Bot: icon("bot"), ThumbsUp: icon("thumbs-up"),
    ThumbsDown: icon("thumbs-down"), HelpCircle: icon("help-circle"),
    Sun: icon("sun"), Moon: icon("moon"), AlertCircle: icon("alert-circle"), Loader2: icon("loader2"),
    Crown: icon("crown"),
  };
});

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

// ─── Imports AFTER mocks so they pick up mocked modules ────────────────────

import { LoadingSplashScreen } from "./LoadingSplashScreen";
import { AppHeader } from "./AppHeader";
import { FAQAssistantChat } from "./FAQAssistantChat";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { CheckoutButton } from "../app/preview/[uploadId]/CheckoutButton";

// ─── Cleanup after each test ────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function advanceTimers(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

// ─── LoadingSplashScreen Tests ──────────────────────────────────────────────

describe("LoadingSplashScreen", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders with progress bar and brand badge", () => {
    render(<LoadingSplashScreen />);
    expect(screen.getByText("easyCV AI Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Neural Engine Active")).toBeInTheDocument();
    expect(screen.getByText("5% Complete")).toBeInTheDocument();
  });

  it("renders all four pipeline steps in the checklist", () => {
    render(<LoadingSplashScreen />);
    // Each step text appears twice: once in center status, once in checklist
    expect(screen.getAllByText("Scanning document layout & historical structure").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Synthesizing career trajectory & technical skills").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Auditing action verbs & ATS compliance metrics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Compiling high-density executive resume").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the telemetry bar with elapsed time", () => {
    render(<LoadingSplashScreen />);
    expect(screen.getByText("Autonomous Synthesis")).toBeInTheDocument();
    expect(screen.getByText("0s elapsed")).toBeInTheDocument();
  });

  it("cycles through messages as progress advances", () => {
    render(<LoadingSplashScreen />);

    // Initially on step 0 — the center status text should be the first step
    const centerStatus = screen.getByText("Scanning document layout & historical structure", {
      selector: "p",
    });
    expect(centerStatus).toHaveClass("font-semibold");

    // Advance timers enough for progress to pass 25%
    // With estimatedPipelineDurationMs=3800: progressPerInterval = (50/3800)*92 ≈ 1.21
    // To reach >=25% from 5%: (25-5)/1.21 ≈ 16.5 ticks => 850ms
    advanceTimers(1200);

    // Now the center status should show the second step
    const secondStep = screen.getByText("Synthesizing career trajectory & technical skills", {
      selector: "p",
    });
    expect(secondStep).toHaveClass("font-semibold");
  });

  it("updates elapsed time counter", () => {
    render(<LoadingSplashScreen />);
    expect(screen.getByText("0s elapsed")).toBeInTheDocument();
    advanceTimers(3000);
    expect(screen.getByText("3s elapsed")).toBeInTheDocument();
  });

  it("increments progress over time", () => {
    render(<LoadingSplashScreen />);
    expect(screen.getByText("5% Complete")).toBeInTheDocument();
    advanceTimers(2000);
    // After 2s of advancing, progress should be higher than 5
    const el = screen.getByText(/% Complete/);
    const val = parseInt(el.textContent!.replace(/[^0-9]/g, ""), 10);
    expect(val).toBeGreaterThan(5);
  });

  it("shows remaining seconds estimate", () => {
    render(<LoadingSplashScreen />);
    const remaining = screen.getByText(/remaining/);
    expect(remaining).toBeInTheDocument();
    const val = parseInt(remaining.textContent!.replace(/[^0-9]/g, ""), 10);
    expect(val).toBeGreaterThan(0);
  });

  it("caps progress at 95%", () => {
    render(<LoadingSplashScreen />);
    advanceTimers(6000);
    expect(screen.getByText("95% Complete")).toBeInTheDocument();
  });
});

// ─── AppHeader Tests ────────────────────────────────────────────────────────

describe("AppHeader", () => {
  // AppHeader renders ThemeToggle which needs ThemeProvider
  const renderHeader = () =>
    render(
      <ThemeProvider>
        <AppHeader />
      </ThemeProvider>
    );

  it("renders easyCV branding", () => {
    renderHeader();
    expect(screen.getByText("easyCV")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Resume Intelligence")).toBeInTheDocument();
  });

  it("renders the New CV link pointing to /", () => {
    renderHeader();
    const link = screen.getByText("New CV").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders the sign in button when no account", () => {
    renderHeader();
    expect(screen.getByText("Sign In / Sync")).toBeInTheDocument();
  });

  it("renders shortcuts button", () => {
    renderHeader();
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
  });

  it("opens shortcuts modal on Cmd+K", async () => {
    renderHeader();
    expect(screen.queryByText("Command Shortcuts & Controls")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("Command Shortcuts & Controls")).toBeInTheDocument();
    });
  });

  it("closes shortcuts modal on Escape", async () => {
    renderHeader();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => {
      expect(screen.getByText("Command Shortcuts & Controls")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Command Shortcuts & Controls")).not.toBeInTheDocument();
    });
  });
});

// ─── FAQAssistantChat Tests ─────────────────────────────────────────────────

describe("FAQAssistantChat", () => {
  it("renders the Help & Support toggle button", () => {
    render(<FAQAssistantChat />);
    const btn = screen.getByText("Help & Support");
    expect(btn).toBeInTheDocument();
    expect(btn.closest("button")).toBeTruthy();
  });

  it("opens chat modal when toggle button is clicked", async () => {
    render(<FAQAssistantChat />);
    fireEvent.click(screen.getByText("Help & Support"));

    await waitFor(() => {
      expect(screen.getByText("easyCV Support")).toBeInTheDocument();
    });
    expect(screen.getByText(/Hello! I am your easyCV Assistant/)).toBeInTheDocument();
  });

  it("displays quick FAQ chips when open", async () => {
    render(<FAQAssistantChat />);
    fireEvent.click(screen.getByText("Help & Support"));

    await waitFor(() => {
      expect(screen.getByText("How to edit text?")).toBeInTheDocument();
    });
    expect(screen.getByText("How to download?")).toBeInTheDocument();
    expect(screen.getByText("Fit on 1 page")).toBeInTheDocument();
    expect(screen.getByText("What is Pro ($14)?")).toBeInTheDocument();
  });

  it("has an input field for typing questions", async () => {
    render(<FAQAssistantChat />);
    fireEvent.click(screen.getByText("Help & Support"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Ask any simple question...")).toBeInTheDocument();
    });
  });

  it("closes chat when close button is clicked", async () => {
    render(<FAQAssistantChat />);
    fireEvent.click(screen.getByText("Help & Support"));

    await waitFor(() => {
      expect(screen.getByText("easyCV Support")).toBeInTheDocument();
    });

    // Find the close button in the chat header
    const closeButtons = screen.getAllByTestId("icon-x");
    const headerClose = closeButtons.find((el) =>
      el.closest("button")?.className.includes("rounded-md")
    );
    fireEvent.click(headerClose!.closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Help & Support")).toBeInTheDocument();
    });
  });
});

// ─── ThemeProvider Tests ────────────────────────────────────────────────────

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("defaults to dark theme", async () => {
    function Consumer() {
      const { resolvedTheme } = useTheme();
      return <span data-testid="tp-theme">{resolvedTheme}</span>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("dark");
    });
  });

  it("applies dark class to document root", async () => {
    function Consumer() {
      const { resolvedTheme } = useTheme();
      return <span>{resolvedTheme}</span>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("switches to light theme via setTheme", async () => {
    function Consumer() {
      const { resolvedTheme, setTheme } = useTheme();
      return (
        <>
          <span data-testid="tp-theme">{resolvedTheme}</span>
          <button onClick={() => setTheme("light")}>Switch to light</button>
        </>
      );
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("dark");
    });

    fireEvent.click(screen.getByText("Switch to light"));

    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("persists theme to localStorage", async () => {
    function Consumer() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme("light")}>Set light</button>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Set light"));

    await waitFor(() => {
      expect(localStorage.getItem("easycv_theme")).toBe("light");
    });
  });

  it("toggleTheme switches between dark and light", async () => {
    function Consumer() {
      const { resolvedTheme, toggleTheme } = useTheme();
      return (
        <>
          <span data-testid="tp-theme">{resolvedTheme}</span>
          <button onClick={toggleTheme}>Toggle</button>
        </>
      );
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("dark");
    });

    fireEvent.click(screen.getByText("Toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("light");
    });

    fireEvent.click(screen.getByText("Toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("dark");
    });
  });

  it("reads saved theme from localStorage on mount", async () => {
    localStorage.setItem("easycv_theme", "light");

    function Consumer() {
      const { resolvedTheme } = useTheme();
      return <span data-testid="tp-theme">{resolvedTheme}</span>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("tp-theme")).toHaveTextContent("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});

// ─── CheckoutButton Tests ───────────────────────────────────────────────────

describe("CheckoutButton", () => {
  const defaultProps = { uploadId: "test-upload-123" };

  it("renders with default label", () => {
    render(<CheckoutButton {...defaultProps} />);
    expect(screen.getByText("Download PDF ($14)")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<CheckoutButton {...defaultProps} label="Get Pro Now" />);
    expect(screen.getByText("Get Pro Now")).toBeInTheDocument();
  });

  it("shows loading state when clicked (pending)", async () => {
    // Mock fetch to never resolve
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise(() => {}));

    render(<CheckoutButton {...defaultProps} />);
    fireEvent.click(screen.getByText("Download PDF ($14)"));

    await waitFor(() => {
      expect(screen.getByText("Redirecting...")).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: /Redirecting/ });
    expect(button).toBeDisabled();

    globalThis.fetch = originalFetch;
  });

  it("renders the Button component with correct size", () => {
    render(<CheckoutButton {...defaultProps} size="lg" />);
    const btn = screen.getByText("Download PDF ($14)").closest("button");
    expect(btn).toHaveAttribute("data-size", "lg");
  });

  it("applies custom className", () => {
    render(<CheckoutButton {...defaultProps} className="my-custom-class" />);
    const btn = screen.getByText("Download PDF ($14)").closest("button");
    expect(btn?.className).toContain("my-custom-class");
  });

  it("displays error message on checkout failure", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      })
    );

    render(<CheckoutButton {...defaultProps} />);
    fireEvent.click(screen.getByText("Download PDF ($14)"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});
