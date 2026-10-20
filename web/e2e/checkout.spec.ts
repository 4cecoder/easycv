import { test, expect } from "./fixtures";
import { mockConvexApi } from "./convex-mocks";
import { MOCK_PAYMENT_STATUS, MOCK_UPLOAD } from "./mock-data";

const UPLOAD_ID = "test-upload-id";

test.beforeEach(async ({ page }) => {
  await mockConvexApi(page, { upload: MOCK_UPLOAD, payment: MOCK_PAYMENT_STATUS });
});

test.describe("Checkout Flow E2E", () => {
  test("checkout button renders with correct default label", async ({ page }) => {
    await page.goto(`/preview/${UPLOAD_ID}`);
    await expect(
      page.getByRole("button", { name: "Download PDF ($14)" })
    ).toBeVisible();
  });

  test("clicking checkout sends POST to /api/checkout with uploadId", async ({
    page,
  }) => {
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_test_e2e" }),
      })
    );
    const checkoutRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/api/checkout") && req.method() === "POST"
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    const request = await checkoutRequest;
    expect(request.postDataJSON()).toEqual({ uploadId: UPLOAD_ID });
  });

  test("checkout shows loading state while request is in flight", async ({
    page,
  }) => {
    // Slow the API response so we can observe the loading state
    await page.route("**/api/checkout", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_test" }),
      });
    });

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await expect(page.getByText("Redirecting...")).toBeVisible();
    // Button should be disabled during loading
    await expect(
      page.getByRole("button", { name: "Redirecting..." })
    ).toBeDisabled();
  });

  test("checkout error state displays error message", async ({ page }) => {
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Something went wrong" }),
      })
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toBeVisible();
    // Button should be re-enabled after error
    await expect(
      page.getByRole("button", { name: "Download PDF ($14)" })
    ).toBeEnabled();
  });

  test("checkout error shows fallback message for non-JSON responses", async ({
    page,
  }) => {
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Checkout failed (500)" })).toBeVisible();
    await expect(page.getByText("Checkout failed (500)")).toBeVisible();
  });

  test("after successful checkout, Stripe redirect URL is valid", async ({
    page,
  }) => {
    const stripeUrl = "https://checkout.stripe.com/pay/cs_test_abc123";
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: stripeUrl }),
      })
    );
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "E2E Stripe redirect" })
    );

    // Keep the redirect local to Playwright while still verifying the URL.
    const navigationPromise = page.waitForURL(stripeUrl);

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await navigationPromise;
    expect(page.url()).toBe(stripeUrl);
  });

  test("Stripe redirect URL contains valid checkout domain", async ({
    page,
  }) => {
    const stripeUrl = "https://checkout.stripe.com/pay/cs_test_valid";
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: stripeUrl }),
      })
    );
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "E2E Stripe redirect" })
    );

    const navigationPromise = page.waitForURL((url) =>
      url.hostname === "checkout.stripe.com"
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await navigationPromise;
    const navigatedUrl = new URL(page.url());
    expect(navigatedUrl.hostname).toBe("checkout.stripe.com");
    expect(navigatedUrl.pathname).toMatch(/^\/pay\//);
  });

  test("checkout is retryable after an error", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/checkout", (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary failure" }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: "https://checkout.stripe.com/pay/cs_test_retry",
          }),
        });
      }
    });
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "E2E Stripe redirect" })
    );

    await page.goto(`/preview/${UPLOAD_ID}`);

    // First attempt fails
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();
    await expect(page.getByText("Temporary failure")).toBeVisible();

    // Retry succeeds
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Temporary failure" })).toHaveCount(0);
  });

  test("missing uploadId returns 400 error", async ({ page }) => {
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "uploadId is required" }),
      })
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    await expect(page.getByText("uploadId is required")).toBeVisible();
  });
});
