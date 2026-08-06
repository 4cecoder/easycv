import { test, expect } from "@playwright/test";

test.describe("Landing Page & Job URL Detection E2E Workflow", () => {
  test("renders heading and dropzone elements cleanly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("easyCV");
    await expect(page.getByText("Drag & drop files")).toBeVisible();
  });

  test("shows auto-detected badge when pasting an Indeed job URL", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");
    await textarea.fill("Check out this posting: https://www.indeed.com/viewjob?jk=1234567890abcdef");
    
    await expect(page.getByText("Auto-detected:")).toBeVisible();
    await expect(page.getByText("Indeed Job Link")).toBeVisible();
    await expect(page.getByText("URL detected! We will auto-extract and match job requirements")).toBeVisible();
  });

  test("shows auto-detected badge when pasting a LinkedIn job URL", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");
    await textarea.fill("https://www.linkedin.com/jobs/view/9876543210");
    
    await expect(page.getByText("Auto-detected:")).toBeVisible();
    await expect(page.getByText("LinkedIn Job Link")).toBeVisible();
  });
});
