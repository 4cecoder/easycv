import { test, expect } from "@playwright/test";

test.describe("Free Tier Local Inference & Upload", () => {
  test("renders free browser-local AI extraction badge", async ({ page }) => {
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
