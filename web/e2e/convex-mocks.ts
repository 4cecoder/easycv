import type { Page } from "@playwright/test";

export const MOCK_E2E_TOKEN = "test-only.e2e.jwt";

/** Stub /api/auth/token so E2E pages run as a signed-in test user. */
export function mockTestAuth(page: Page) {
  page.route("**/api/auth/token", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ token: MOCK_E2E_TOKEN }),
    })
  );
}

/** Stub Convex HTTP API responses for E2E specs with optional upload/payment/job-match fixtures. */
export function mockConvexApi(
  page: Page,
  values: { upload?: unknown; payment?: unknown; jobMatch?: unknown } = {}
) {
  mockTestAuth(page);

  page.route("**/api/query**", async (route) => {
    const body = route.request().postData();
    let path = "";
    try {
      const parsed = JSON.parse(body ?? "{}");
      path = parsed.path ?? parsed[0]?.path ?? "";
    } catch {
      // Unrecognized Convex requests receive a deterministic empty result.
    }

    let value: unknown = null;
    if (path.includes("uploads:getUpload")) value = values.upload ?? null;
    else if (path.includes("payments:getPaymentStatus")) value = values.payment ?? null;
    else if (path.includes("profiles:getJobMatch")) value = values.jobMatch ?? null;
    else if (path.includes("identity:getOwnerSessionKey")) value = "e2e-test-subject";

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ value }),
    });
  });

  for (const operation of ["mutation", "action"]) {
    page.route(`**/api/${operation}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ value: null }),
      })
    );
  }
}
