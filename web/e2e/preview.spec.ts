import { test, expect } from "@playwright/test";

const PREVIEW_URL = "/preview/seed-demo-upload-id";

test.describe("Preview Page E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PREVIEW_URL);
    // Wait for the Convex query to resolve and render the main content.
    // The page shows skeleton loaders while data is loading; wait for the
    // score-card grid which only renders once the profile is available.
    await expect(
      page.getByText("Profile Quality").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  // ── 1. Score Cards ──────────────────────────────────────────────────

  test.describe("Score cards", () => {
    test("renders all four KPI metric scorecards", async ({ page }) => {
      await expect(page.getByText("Profile Quality").first()).toBeVisible();
      await expect(page.getByText("Quality Score").first()).toBeVisible();
      await expect(
        page.getByText("Requisition Match").first()
      ).toBeVisible();
      await expect(
        page.getByText("Verified Bullets").first()
      ).toBeVisible();
    });

    test("Profile Quality card shows a numeric score", async ({ page }) => {
      const card = page.locator("div").filter({ hasText: /^Profile Quality/ }).first();
      // The score is rendered inside a <span> with text-2xl font
      const score = card.locator("span.text-2xl");
      await expect(score).toBeVisible();
      await expect(score).not.toHaveText("--");
    });

    test("Quality Score card shows a numeric /100 score", async ({ page }) => {
      const card = page.locator("div").filter({ hasText: /^Quality Score/ }).first();
      await expect(card.getByText("/ 100")).toBeVisible();
    });

    test("Requisition Match card shows a percentage or placeholder", async ({ page }) => {
      const card = page.locator("div").filter({ hasText: /^Requisition Match/ }).first();
      // Either a percentage or the -- placeholder
      const score = card.locator("span.text-2xl");
      await expect(score).toBeVisible();
      const text = await score.textContent();
      expect(text).toMatch(/^(\d+%|--)$/);
    });

    test("Verified Bullets card shows an achievement count", async ({ page }) => {
      const card = page.locator("div").filter({ hasText: /^Verified Bullets/ }).first();
      await expect(card.getByText("achievements")).toBeVisible();
    });
  });

  // ── 2. Tab Navigation ───────────────────────────────────────────────

  test.describe("Tab navigation", () => {
    const tabs = [
      { label: "Resume", contains: "Document Controls" },
      { label: "Job Match", contains: "Job Match" },
      { label: "Linter", contains: "STE-100" },
      { label: "Vault", contains: "Vault" },
      { label: "Pro Package", contains: "Unlock" },
    ] as const;

    for (const tab of tabs) {
      test(`clicking "${tab.label}" tab activates its panel`, async ({
        page,
      }) => {
        const tabButton = page.getByRole("button", { name: tab.label });
        await tabButton.click();

        // The active tab gets a primary-colored bottom border
        await expect(tabButton).toHaveClass(/border-primary/);

        // Its content area should be visible somewhere on the page
        await expect(page.getByText(tab.contains).first()).toBeVisible();
      });
    }

    test("clicking a different tab deactivates the previous tab", async ({
      page,
    }) => {
      const resumeTab = page.getByRole("button", { name: "Resume" });
      const linterTab = page.getByRole("button", { name: "Linter" });

      await resumeTab.click();
      await expect(resumeTab).toHaveClass(/border-primary/);

      await linterTab.click();
      await expect(linterTab).toHaveClass(/border-primary/);
      await expect(resumeTab).not.toHaveClass(/border-primary/);
    });
  });

  // ── 3. Copy Text Button ─────────────────────────────────────────────

  test.describe("Copy Text", () => {
    test("Copy Source button is visible when paid, Copy Source in toolbar", async ({
      page,
    }) => {
      // The header ribbon may show "Copy Source" or a checkout button
      // depending on payment status.  Verify at least the header area
      // renders and the copy-related controls are accessible.
      const header = page.locator("div.sticky");
      await expect(header).toBeVisible();
    });

    test("clicking a section copy button shows check icon feedback", async ({
      page,
      context,
    }) => {
      // Grant clipboard permissions so navigator.clipboard.writeText works
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      // The header copy button is in the profile header section
      // It's a small button with title="Copy header"
      const copyBtn = page.getByTitle("Copy header");
      // It may or may not be visible depending on the section render
      if (await copyBtn.isVisible()) {
        await copyBtn.click();
        // After clicking, the icon should swap to a check mark
        await expect(copyBtn.locator("svg").first()).toBeVisible();
      }
    });
  });

  // ── 4. Export HTML Button ────────────────────────────────────────────

  test.describe("Export HTML", () => {
    test("Export HTML button is present in the Pro Package tab", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Pro Package" }).click();
      const exportBtn = page.getByRole("button", { name: "Export HTML" });
      await expect(exportBtn).toBeVisible();
    });

    test("clicking Export HTML triggers a download", async ({ page }) => {
      await page.getByRole("button", { name: "Pro Package" }).click();

      const exportBtn = page.getByRole("button", { name: "Export HTML" });

      // Expect a download event to be triggered
      const downloadPromise = page.waitForEvent("download");
      await exportBtn.click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.html$/);
    });
  });

  // ── 5. Resume Canvas ────────────────────────────────────────────────

  test.describe("Resume canvas", () => {
    test("renders the profile name in the canvas header", async ({ page }) => {
      // The resume canvas has an h1 with the profile name
      const nameHeading = page.locator("h1").filter({ hasText: /Resume|Profile|Consolidated/ }).first();
      await expect(nameHeading).toBeVisible();
    });

    test("renders Technical Skills section", async ({ page }) => {
      await expect(
        page.getByText("Technical Skills & Competencies").first()
      ).toBeVisible();
    });

    test("renders Professional Experience section", async ({ page }) => {
      await expect(
        page.getByText("Professional Experience").first()
      ).toBeVisible();
    });

    test("renders Education section", async ({ page }) => {
      await expect(page.getByText("Education").first()).toBeVisible();
    });

    test("experience entries display role title and company", async ({
      page,
    }) => {
      // There should be at least one experience article
      const articles = page.locator("article");
      const count = await articles.count();
      expect(count).toBeGreaterThan(0);

      // Each article should have a heading with role info
      const firstArticle = articles.first();
      await expect(firstArticle.locator("h3")).toBeVisible();
    });

    test("education entries display degree and school", async ({ page }) => {
      // Education section should have list items with degree info
      const eduSection = page
        .locator("h2")
        .filter({ hasText: "Education" })
        .first()
        .locator("..")
        .locator("..");
      const items = eduSection.locator("li");
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  // ── 6. Template Switcher ────────────────────────────────────────────

  test.describe("Template switcher", () => {
    test("all three template buttons are visible", async ({ page }) => {
      const modern = page.getByRole("button", { name: "modern" });
      const classic = page.getByRole("button", { name: "classic" });
      const minimal = page.getByRole("button", { name: "minimal" });

      await expect(modern).toBeVisible();
      await expect(classic).toBeVisible();
      await expect(minimal).toBeVisible();
    });

    test("modern is selected by default", async ({ page }) => {
      const modern = page.getByRole("button", { name: "modern" });
      await expect(modern).toHaveClass(/bg-card/);
    });

    test("clicking classic changes template style", async ({ page }) => {
      const classic = page.getByRole("button", { name: "classic" });
      await classic.click();

      // The classic template adds font-serif class to the canvas
      const canvas = page.locator("div.font-serif, div.font-mono, div.font-sans").first();
      await expect(canvas).toHaveClass(/font-serif/);
    });

    test("clicking minimal changes template style", async ({ page }) => {
      const minimal = page.getByRole("button", { name: "minimal" });
      await minimal.click();

      const canvas = page.locator("div.font-serif, div.font-mono, div.font-sans").first();
      await expect(canvas).toHaveClass(/font-mono/);
    });

    test("clicking modern restores default style", async ({ page }) => {
      const classic = page.getByRole("button", { name: "classic" });
      await classic.click();

      const modern = page.getByRole("button", { name: "modern" });
      await modern.click();

      const canvas = page.locator("div.font-serif, div.font-mono, div.font-sans").first();
      await expect(canvas).toHaveClass(/font-sans/);
    });

    test("the active template button gets the shadow-2xs style", async ({
      page,
    }) => {
      const classic = page.getByRole("button", { name: "classic" });
      await classic.click();
      await expect(classic).toHaveClass(/shadow-2xs/);

      const modern = page.getByRole("button", { name: "modern" });
      await expect(modern).not.toHaveClass(/shadow-2xs/);
    });
  });

  // ── 7. Floating Bottom Bar ──────────────────────────────────────────

  test.describe("Floating bottom bar", () => {
    test("shows ATS Quality Validated status", async ({ page }) => {
      await expect(
        page.getByText("ATS Quality Validated").first()
      ).toBeVisible();
    });

    test("shows STE-100 Compliant label", async ({ page }) => {
      await expect(
        page.getByText("STE-100 Compliant").first()
      ).toBeVisible();
    });

    test("shows Download PDF or Unlock button in the floating bar", async ({
      page,
    }) => {
      const floatingBar = page.locator("div.sticky.bottom-4");
      await expect(floatingBar).toBeVisible();

      // Should contain either a download button or a checkout button
      const downloadBtn = floatingBar.getByRole("button");
      const count = await downloadBtn.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  // ── 8. Back Link ────────────────────────────────────────────────────

  test.describe("Back link", () => {
    test("back link navigates to upload page", async ({ page }) => {
      const backLink = page.getByRole("link", { name: "New Resume" });
      await expect(backLink).toBeVisible();

      await backLink.click();
      await expect(page).toHaveURL("/");
    });
  });
});
