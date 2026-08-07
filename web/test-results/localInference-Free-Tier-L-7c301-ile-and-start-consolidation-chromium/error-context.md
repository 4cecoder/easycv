# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: localInference.spec.ts >> Free Tier Local Inference & Upload >> can upload a file and start consolidation
- Location: e2e/localInference.spec.ts:10:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForEvent: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for event "filechooser"
============================================================
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e8]:
      - generic [ref=e9]: Pro Membership ($14/mo)
      - generic [ref=e10]: Unlimited ATS exports, matching, & cover letters vs Free Instant Preview
    - button "Upgrade Now" [ref=e11]
  - generic [ref=e12]:
    - heading "Intelligent Resume Consolidation" [level=1] [ref=e13]
    - paragraph [ref=e14]: Drop your messy work history below. We'll automatically build one unified, ATS-optimized master resume in seconds.
  - generic [ref=e17]:
    - generic [ref=e18]:
      - generic [ref=e19]: Try it Instantly
      - generic [ref=e20]:
        - button "Load Sample Resume Alex Mercer, SWE" [ref=e21]:
          - generic [ref=e23]:
            - generic [ref=e24]: Load Sample Resume
            - generic [ref=e25]: Alex Mercer, SWE
        - button "Load Sample Job Indeed JD Link" [ref=e26]:
          - generic [ref=e28]:
            - generic [ref=e29]: Load Sample Job
            - generic [ref=e30]: Indeed JD Link
    - generic [ref=e31] [cursor=pointer]:
      - generic [ref=e36]:
        - paragraph [ref=e37]: Drag & drop files or browse
        - paragraph [ref=e38]: PDF, TXT, or Markdown supported
      - button "Drag & drop files or browse PDF, TXT, or Markdown supported" [ref=e39]
    - generic [ref=e40]:
      - generic [ref=e41]: Target Job Context (Optional)
      - textbox "Target Job Context (Optional)" [ref=e47]:
        - /placeholder: Paste job posting text or URL to tailor output...
    - button "Generate Master Resume" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Free Tier Local Inference & Upload", () => {
  4  |   test("renders free browser-local AI extraction badge", async ({ page }) => {
  5  |     await page.goto("/");
  6  |     await expect(page.locator("body")).toBeVisible();
  7  |   });
  8  | 
  9  |   test("can click sample resume and generate master resume", async ({ page }) => {
  10 |     await page.route("**/api/upload", async (route) => {
  11 |       await route.fulfill({
  12 |         status: 200,
  13 |         contentType: "application/json",
  14 |         body: JSON.stringify({ uploadId: "mock-upload-id" }),
  15 |       });
  16 |     });
  17 | 
  18 |     await page.goto("/");
  19 |     
  20 |     // Click 1-click sample resume button
  21 |     await page.getByRole("button", { name: "Load Sample Resume" }).click();
  22 |     await expect(page.getByText("alex_mercer_sample_resume.md")).toBeVisible();
> 23 | 
     |                                     ^ Error: page.waitForEvent: Test timeout of 30000ms exceeded.
  24 |     // Click submit button
  25 |     await page.getByRole("button", { name: "Generate Master Resume" }).click();
  26 |     
  27 |     // Should navigate to preview route
  28 |     await page.waitForURL("**/preview/mock-upload-id");
  29 |     expect(page.url()).toContain("/preview/mock-upload-id");
  30 |   });
  31 | });
  32 | 
```