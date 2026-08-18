import { test, expect } from "@playwright/test";

test.describe("Upload Flow E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with all expected elements", async ({ page }) => {
    // Hero heading
    await expect(page.locator("h1")).toContainText("Build your resume");

    // File input dropzone text
    await expect(page.getByText("Drop your resume documents here")).toBeVisible();

    // Sample resume buttons (all three profiles)
    await expect(page.getByText("Alex Mercer").first()).toBeVisible();
    await expect(page.getByText("Dr. Elena Rostova").first()).toBeVisible();
    await expect(page.getByText("Jordan Blake").first()).toBeVisible();

    // Job description textarea
    await expect(page.locator("#jobDescription")).toBeVisible();

    // Generate button
    await expect(page.getByRole("button", { name: /Generate Resume/i })).toBeVisible();
  });

  test("clicking a sample resume loads it and auto-submits", async ({ page }) => {
    // Intercept the upload API so we can observe the request without needing a real backend
    const uploadRequestPromise = page.waitForRequest("/api/upload", { timeout: 5000 });

    // Click the first sample resume (Alex Mercer)
    await page.getByText("Alex Mercer").first().click();

    // The component calls formRef.requestSubmit() after a 50ms timeout,
    // which triggers handleSubmit → fetch("/api/upload").
    // Verify the upload request fires.
    const uploadRequest = await uploadRequestPromise;
    expect(uploadRequest).toBeDefined();
    expect(uploadRequest.method()).toBe("POST");
  });

  test("file input accepts .pdf, .txt, and .md files", async ({ page }) => {
    const fileInput = page.locator("#files");

    // The input element has accept=".pdf,.txt,.md"
    await expect(fileInput).toHaveAttribute("accept", ".pdf,.txt,.md");

    // Upload a .txt file and verify it appears in the file queue
    const txtBuffer = Buffer.from("Sample resume content");
    await fileInput.setInputFiles({
      name: "resume.txt",
      mimeType: "text/plain",
      buffer: txtBuffer,
    });

    await expect(page.getByText("resume.txt")).toBeVisible();

    // Upload a .md file alongside
    const mdBuffer = Buffer.from("# Markdown Resume");
    await fileInput.setInputFiles([
      { name: "resume.txt", mimeType: "text/plain", buffer: txtBuffer },
      { name: "resume.md", mimeType: "text/markdown", buffer: mdBuffer },
    ]);

    await expect(page.getByText("resume.md")).toBeVisible();
  });

  test("generate button is disabled when no files are selected", async ({ page }) => {
    const generateBtn = page.getByRole("button", { name: /Generate Resume/i });

    // Initially disabled because files.length === 0
    await expect(generateBtn).toBeDisabled();
  });

  test("generate button shows loading state when clicked", async ({ page }) => {
    // Stub the API to hang so we can observe the loading UI
    await page.route("/api/upload", async (route) => {
      // Never resolve — keep the request pending
      await new Promise(() => {});
    });

    // Upload a file so the button becomes enabled
    const fileInput = page.locator("#files");
    await fileInput.setInputFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("test"),
    });

    const generateBtn = page.getByRole("button", { name: /Generate Resume/i });

    // Button should now be enabled
    await expect(generateBtn).toBeEnabled();

    // Click to trigger loading state
    await generateBtn.click();

    // Verify the loading text appears
    await expect(page.getByText("Consolidating Master Resume...")).toBeVisible();
  });

  test("error state displays when upload fails", async ({ page }) => {
    // Return a 500 error from the upload endpoint
    await page.route("/api/upload", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server error occurred" }),
      });
    });

    // Upload a file so the button is enabled
    const fileInput = page.locator("#files");
    await fileInput.setInputFiles({
      name: "fail.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("test"),
    });

    const generateBtn = page.getByRole("button", { name: /Generate Resume/i });
    await expect(generateBtn).toBeEnabled();

    await generateBtn.click();

    // The error alert should appear with the server's error message
    await expect(page.getByText("Upload Failed")).toBeVisible();
    await expect(page.getByText("Server error occurred")).toBeVisible();
  });

  test("footer has Privacy and Terms links", async ({ page }) => {
    const footer = page.locator("footer");

    const privacyLink = footer.getByRole("link", { name: "Privacy" });
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute("href", "/privacy");

    const termsLink = footer.getByRole("link", { name: "Terms" });
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute("href", "/terms");
  });
});
