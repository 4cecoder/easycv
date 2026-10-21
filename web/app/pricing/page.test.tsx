import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { getFunctionName } from "convex/server";

const portalAction = vi.fn(async () => ({ url: "https://billing.stripe.com/p/session" }));
const checkoutAction = vi.fn(async () => ({ url: "https://checkout.stripe.com/c" }));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: (ref: any) => getFunctionName(ref).endsWith("hasSubscriptionRecord"),
  useAction: (ref: any) => (getFunctionName(ref).endsWith("createCustomerPortalSession") ? portalAction : checkoutAction),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

import PricingPage from "./page";
import { formatPrice, PRO_MONTHLY, RESUME_UNLOCK } from "../../lib/catalog";

afterEach(cleanup);

describe("pricing page", () => {
  test("every price shown comes from the catalog", () => {
    render(<PricingPage />);
    const shown = document.body.textContent!.match(/\$\d+(?:\.\d{2})?/g) ?? [];
    const allowed = new Set(["$0", formatPrice(RESUME_UNLOCK), formatPrice(PRO_MONTHLY)]);
    expect(shown.length).toBeGreaterThan(0);
    for (const price of shown) expect(allowed).toContain(price);
  });

  test("shows the one-time unlock and the monthly subscription as separate products", () => {
    render(<PricingPage />);
    expect(screen.getByTestId("product-resume-unlock")).toHaveTextContent(RESUME_UNLOCK.name);
    expect(screen.getByTestId("product-resume-unlock")).toHaveTextContent("one-time");
    expect(screen.getByTestId("product-pro-monthly")).toHaveTextContent("/month");
  });

  test("auto-renewal disclosure sits next to and describes the subscribe button", () => {
    render(<PricingPage />);
    const button = screen.getByRole("button", { name: `Subscribe for ${formatPrice(PRO_MONTHLY)}/month` });
    expect(button).toHaveAccessibleDescription(/until you cancel/);
    expect(screen.getByTestId("auto-renewal-disclosure")).toHaveTextContent(/every month/);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByTestId("fair-use")).toHaveTextContent(/10 AI job matches per hour/);
  });

  test("subscribers can open the Stripe Customer Portal to manage or cancel", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, set href(v: string) { assign(v); } }, configurable: true });
    render(<PricingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Manage or cancel subscription" }));
    await waitFor(() => expect(portalAction).toHaveBeenCalledWith({}));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session"));
  });
});
