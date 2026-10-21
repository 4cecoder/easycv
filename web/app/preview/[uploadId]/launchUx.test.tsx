import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

import { UploadStatusPanel } from "./PreviewClient";
import { JobMatchWidget } from "./JobMatchWidget";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("launch without the processing worker", () => {
  test("a queued upload says so plainly: no spinner, progress bar or countdown", () => {
    const { container } = render(<UploadStatusPanel status="queued" />);
    expect(screen.getByRole("status")).toHaveTextContent("Queued — processing will start soon");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.textContent).not.toMatch(/remaining|%|Compilation Progress/i);
  });

  test("processing shows an indeterminate indicator without fake stages or ETA", () => {
    const { container } = render(<UploadStatusPanel status="processing" />);
    expect(screen.getByRole("status")).toHaveTextContent("Processing your résumé");
    expect(container.textContent).not.toMatch(/remaining|Building PDF|%/i);
  });
});

describe("job match rate limits", () => {
  test("a 429 shows a friendly, announced message with the wait time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited", reason: "user_daily", retryAfter: 3 * 3600 }), {
        status: 429,
        headers: { "Retry-After": String(3 * 3600), "Content-Type": "application/json" },
      }),
    );
    render(<JobMatchWidget uploadId="u1" />);
    fireEvent.change(screen.getByPlaceholderText(/Paste job description/), { target: { value: "Senior engineer" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Job Alignment/ }));
    await waitFor(() =>
      expect(screen.getByTestId("job-match-limit")).toHaveTextContent(
        "You've reached today's limit for job matches (30 per day) — try again in about 3 hours.",
      ),
    );
    expect(screen.getByTestId("job-match-limit").closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
