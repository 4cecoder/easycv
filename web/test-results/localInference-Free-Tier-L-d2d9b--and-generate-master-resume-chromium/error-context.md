# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: localInference.spec.ts >> Free Tier Local Inference & Upload >> can click sample resume and generate master resume
- Location: e2e/localInference.spec.ts:9:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/preview/mock-upload-id" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - link "easyCV AI" [ref=e6] [cursor=pointer]:
            - /url: /
            - generic [ref=e11]:
              - generic [ref=e12]: easyCV
              - generic [ref=e13]: AI
          - generic [ref=e14]: Resume Intelligence
        - generic [ref=e16]:
          - generic [ref=e17]: AI Engine Active
          - button "Shortcuts ⌘K" [ref=e20]:
            - generic [ref=e23]: Shortcuts
            - generic [ref=e24]: ⌘K
          - link "New Analysis" [ref=e25] [cursor=pointer]:
            - /url: /
    - main [ref=e31]:
      - generic [ref=e32]:
        - generic [ref=e37]:
          - generic [ref=e38]:
            - generic [ref=e39]: easyCV Pro
            - generic [ref=e40]: $14/mo
          - generic [ref=e41]: Unlimited exports, scoring, and job matching.
        - button "Instant Free Preview" [ref=e42]
      - generic [ref=e43]:
        - generic [ref=e44]: Professional Format
        - heading "Build your resume" [level=1] [ref=e47]
        - paragraph [ref=e48]: Upload your CVs. Get a clean, professional resume in seconds.
      - generic [ref=e49]:
        - generic [ref=e50]:
          - generic [ref=e51]: 1-Click Sample Resumes
          - generic [ref=e55]: Pre-compiled for instant testing
        - generic [ref=e56]:
          - button "Alex Mercer Staff SWE Senior Full Stack Engineer" [active] [ref=e57]:
            - generic [ref=e62]:
              - generic [ref=e63]:
                - generic [ref=e64]: Alex Mercer
                - generic [ref=e65]: Staff SWE
              - generic [ref=e66]: Senior Full Stack Engineer
          - button "Dr. Elena Rostova AI Systems Lead AI / ML Systems Architect" [ref=e67]:
            - generic [ref=e72]:
              - generic [ref=e73]:
                - generic [ref=e74]: Dr. Elena Rostova
                - generic [ref=e75]: AI Systems
              - generic [ref=e76]: Lead AI / ML Systems Architect
          - button "Jordan Blake Product Lead Principal Product Director" [ref=e77]:
            - generic [ref=e82]:
              - generic [ref=e83]:
                - generic [ref=e84]: Jordan Blake
                - generic [ref=e85]: Product Lead
              - generic [ref=e86]: Principal Product Director
      - generic [ref=e89]:
        - generic [ref=e90] [cursor=pointer]:
          - generic [ref=e95]:
            - paragraph [ref=e96]: Drop your resume documents here or browse files
            - paragraph [ref=e97]: Accepts PDF, Markdown, and TXT files • Multi-file consolidation supported
          - button "Drop your resume documents here or browse files Accepts PDF, Markdown, and TXT files • Multi-file consolidation supported" [ref=e98]
        - generic [ref=e99]:
          - generic [ref=e100]:
            - generic [ref=e101]: Selected Document Queue (1)
            - button "Clear All" [ref=e102]
          - list [ref=e103]:
            - listitem [ref=e104]:
              - generic [ref=e105]:
                - generic [ref=e109]: alex_mercer_resume.md
                - generic [ref=e110]: 1.3 KB
              - button "Remove file" [ref=e111]
        - generic [ref=e115]:
          - generic [ref=e116]: Target Job Requisition (Optional Context for Keyword Optimization)
          - textbox "Target Job Requisition (Optional Context for Keyword Optimization)" [ref=e122]:
            - /placeholder: Paste job posting text or URL (Indeed, LinkedIn, Greenhouse, Lever, Workday) to tailor output...
        - generic [ref=e123]:
          - button "Consolidating Master Resume..." [disabled]
      - generic [ref=e124]:
        - generic [ref=e125]:
          - generic [ref=e126]: Private
          - paragraph [ref=e130]: Deleted after processing.
        - generic [ref=e131]:
          - generic [ref=e132]: Professional
          - paragraph [ref=e138]: Clean, recruiter-ready format.
        - generic [ref=e139]:
          - generic [ref=e140]: Fast
          - paragraph [ref=e145]: Done in under a minute.
        - generic [ref=e146]:
          - generic [ref=e147]: PDF Export
          - paragraph [ref=e153]: Download or share instantly.
      - generic [ref=e155]:
        - generic [ref=e156]:
          - generic [ref=e157]: easyCV AI Pipeline
          - generic [ref=e162]: Neural Engine Active
        - generic [ref=e167]:
          - paragraph [ref=e175]: Compiling high-density executive resume
          - paragraph [ref=e176]: Optimizing ATS keywords & impact metrics...
        - generic [ref=e180]:
          - generic [ref=e181]: 95% Complete
          - generic [ref=e182]: ~1s remaining
        - generic [ref=e183]:
          - generic [ref=e184]: Scanning document layout & historical structure
          - generic [ref=e189]: Synthesizing career trajectory & technical skills
          - generic [ref=e194]: Auditing action verbs & ATS compliance metrics
          - generic [ref=e199]: Compiling high-density executive resume
        - generic [ref=e202]:
          - generic [ref=e203]: Autonomous Synthesis
          - generic [ref=e206]: 27s elapsed
    - contentinfo [ref=e207]:
      - paragraph [ref=e208]:
        - text: easyCV uses analytics to improve our service.
        - link "Privacy" [ref=e209] [cursor=pointer]:
          - /url: /privacy
        - text: ·
        - link "Terms" [ref=e210] [cursor=pointer]:
          - /url: /terms
    - button "DEV TOOLS 192.168.1.107" [ref=e212]:
      - generic [ref=e216]: DEV TOOLS
      - generic [ref=e217]: 192.168.1.107
  - generic [ref=e228] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e229]
    - generic [ref=e233]:
      - button "Open issues overlay" [ref=e234]:
        - generic [ref=e235]:
          - generic [ref=e236]: "0"
          - generic [ref=e237]: "1"
        - generic [ref=e238]: Issue
      - button "Collapse issues badge" [ref=e239]
  - alert [ref=e242]
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
  20 |     // Click 1-click sample resume button (which auto-submits)
  21 |     await page.getByText("Alex Mercer").first().click();
  22 | 
  23 |     // Should navigate to preview route automatically via auto-submission
> 24 |     await page.waitForURL("**/preview/mock-upload-id");
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  25 |     expect(page.url()).toContain("/preview/mock-upload-id");
  26 |   });
  27 | });
  28 | 
```