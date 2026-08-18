import { test, expect } from "@playwright/test";

const UPLOAD_ID = "test-upload-id";

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

    await expect(page.getByRole("alert")).toBeVisible();
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

    await expect(page.getByRole("alert")).toBeVisible();
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

    // Intercept the navigation so we don't actually leave the page
    const navigationPromise = page.waitForURL((url) =>
      url.href.includes(stripeUrl)
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    const navigatedUrl = await navigationPromise;
    expect(navigatedUrl.href).toBe(stripeUrl);
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

    const navigationPromise = page.waitForURL((url) =>
      url.href.includes("checkout.stripe.com")
    );

    await page.goto(`/preview/${UPLOAD_ID}`);
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();

    const navigatedUrl = await navigationPromise;
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

    await page.goto(`/preview/${UPLOAD_ID}`);

    // First attempt fails
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();
    await expect(page.getByText("Temporary failure")).toBeVisible();

    // Retry succeeds
    await page.getByRole("button", { name: "Download PDF ($14)" }).click();
    await expect(page.getByRole("alert")).not.toBeVisible();
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
