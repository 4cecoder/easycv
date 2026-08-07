import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Free Tier Local Inference & Upload", () => {
  test("renders free browser-local AI extraction badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("⚡ Free Browser-Local AI Extraction (MiniCPM-5)")).toBeVisible();
  });

  test("can upload a file and start consolidation", async ({ page }) => {
    // Intercept the /api/upload request to prevent actual upload
    await page.route("**/api/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ uploadId: "mock-upload-id" }),
      });
    });

    await page.goto("/");
    
    // Set up file chooser to upload a dummy file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[for="files"]').nth(1).click();
    const fileChooser = await fileChooserPromise;
    
    // Use an empty buffer for testing
    await fileChooser.setFiles({
      name: "test-resume.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Mock resume content"),
    });

    await expect(page.getByText("test-resume.txt")).toBeVisible();

    await page.getByRole("button", { name: "Consolidate my resume" }).click();
    
    // Should navigate to preview route
    await page.waitForURL("**/preview/mock-upload-id");
    expect(page.url()).toContain("/preview/mock-upload-id");
  });
});
