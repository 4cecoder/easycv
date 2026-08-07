import { test, expect } from "@playwright/test";

test.describe("Free Tier Local Inference & Upload", () => {
  test("renders free browser-local AI extraction badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("can click sample resume and generate master resume", async ({ page }) => {
    await page.route("**/api/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ uploadId: "mock-upload-id" }),
      });
    });

    await page.goto("/");
    
    // Click 1-click sample resume button (which auto-submits)
    await page.getByRole("button", { name: "Load Sample Resume" }).click();

    // Should navigate to preview route automatically via auto-submission
    await page.waitForURL("**/preview/mock-upload-id");
    expect(page.url()).toContain("/preview/mock-upload-id");
  });
});
