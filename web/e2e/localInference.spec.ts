import { test, expect } from "@playwright/test";

test.describe("Inference-independent upload UI", () => {
  // These are presentation checks only. They never start an inference worker,
  // contact Ollama, or require a machine on the developer's tailnet.
  test("renders the upload experience", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("can view and select sample resume", async ({ page }) => {
    await page.goto("/");
    const sample = page.getByText("Alex Mercer").first();
    await expect(sample).toBeVisible();
    await sample.click();
    await expect(page.locator("body")).toBeVisible();
  });
});
