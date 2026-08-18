import { test, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Shared fixtures – mock Convex API responses so every preview page  */
/*  test can render a "ready" upload with a pre-computed job match.    */
/* ------------------------------------------------------------------ */

const MOCK_UPLOAD = {
  _id: "seed-demo-upload-id",
  status: "ready",
  structuredProfile: {
    name: "Alex Mercer",
    titles: ["Senior Software Engineer"],
    summary:
      "Results-driven software engineer with 8+ years building scalable distributed systems.",
    contact: {
      email: "alex@example.com",
      phone: "555-0100",
      linkedin: "linkedin.com/in/alexmercer",
    },
    skills: {
      languages: ["TypeScript", "Python", "Go"],
      frameworks: ["React", "Next.js", "Node.js"],
      cloud_devops: ["AWS", "Docker", "Kubernetes", "CI/CD"],
      databases: ["PostgreSQL", "MongoDB", "Redis"],
      tools: ["Git", "Jira", "Datadog"],
    },
    experience: [
      {
        title: "Senior Software Engineer",
        company: "Acme Corp",
        start: "2021-01",
        end: "Present",
        location: "Remote",
        bullets: [
          "Architected a microservices platform that handles 2M+ daily API requests with 99.99% uptime.",
          "Led a cross-functional team of 5 engineers to deliver a real-time analytics dashboard.",
          "Reduced average API latency by 40% through query optimization and caching strategies.",
        ],
      },
    ],
    education: [
      {
        degree: "B.S. Computer Science",
        school: "MIT",
        years: "2012 – 2016",
      },
    ],
    certifications: ["AWS Solutions Architect – Associate"],
    qualityScore: 92,
    qualityMaxScore: 100,
    qualityCritical: false,
    qualityWarnings: [],
  },
  files: [],
};

const MOCK_JOB_MATCH_RESULT = {
  matchScore: 78,
  matchedKeywords: [
    "TypeScript",
    "React",
    "AWS",
    "microservices",
    "REST API",
    "CI/CD",
    "PostgreSQL",
  ],
  missingKeywords: [
    "Kafka",
    "GraphQL",
    "Terraform",
    "system design",
  ],
  gapAnalysis:
    "Your profile demonstrates strong backend and cloud competency. To close the gap, highlight direct experience with event-driven architectures (Kafka) and infrastructure-as-code (Terraform). Consider adding examples of GraphQL API design and large-scale system design sessions.",
  tailoredBullets: [
    "Architected and deployed a microservices platform on AWS using TypeScript and Docker, serving 2M+ daily requests with 99.99% uptime via CI/CD pipelines.",
    "Optimized PostgreSQL query performance by 40%, implementing Redis caching layers to reduce API latency across production workloads.",
    "Led a cross-functional team of 5 engineers to deliver a React-based real-time analytics dashboard integrated with REST APIs and PostgreSQL data stores.",
  ],
};

const MOCK_PAYMENT_STATUS = {
  paid: false,
  downloadToken: null,
};

/**
 * Intercept Convex query calls and return canned data so preview page
 * tests are deterministic and do not require a running Convex backend.
 *
 * Convex React client sends POST requests to the Convex deployment URL
 * (e.g. https://<project>.convex.cloud/api/query). We intercept any POST
 * whose body contains the function path we care about and return the
 * matching mock payload.
 */
function mockConvexQueries(page: import("@playwright/test").Page) {
  // Intercept Convex HTTP actions used by PreviewClient
  page.on("request", () => {});

  // The Convex client sends POST requests with a JSON body like:
  // { "path": "uploads:getUpload", "args": { ... }, ... }
  // We match on the URL containing the Convex deployment host.
  page.route("**/api/query**", async (route) => {
    const request = route.request();
    const body = request.postData();
    if (!body) {
      return route.fallback();
    }

    try {
      const parsed = JSON.parse(body);
      const path: string = parsed.path ?? parsed[0]?.path ?? "";

      if (path.includes("uploads:getUpload")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ value: MOCK_UPLOAD }),
        });
      }

      if (path.includes("payments:getPaymentStatus")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ value: MOCK_PAYMENT_STATUS }),
        });
      }

      if (path.includes("profiles:getJobMatch")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ value: MOCK_JOB_MATCH_RESULT }),
        });
      }
    } catch {
      // Not JSON or unrecognised shape – fall through
    }

    return route.fallback();
  });

  // Also intercept the Convex "api/mutation" and "api/action" paths
  page.route("**/api/mutation**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ value: null }),
    });
  });

  page.route("**/api/action**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ value: null }),
    });
  });
}

/**
 * Mock the POST /api/job-match endpoint so the "Analyze Job Alignment"
 * button returns a deterministic result without a running Python CLI.
 */
function mockJobMatchApi(page: import("@playwright/test").Page) {
  page.route("**/api/job-match", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, result: MOCK_JOB_MATCH_RESULT }),
      });
    }
    return route.fallback();
  });
}

/* ================================================================== */
/*  Test Suite                                                         */
/* ================================================================== */

test.describe("Job Match – Landing Page URL Detection", () => {
  test("shows auto-detected badge when pasting an Indeed job URL", async ({
    page,
  }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");
    await textarea.fill(
      "Check out this posting: https://www.indeed.com/viewjob?jk=1234567890abcdef"
    );

    await expect(page.getByText("Valid Job Requisition Link")).toBeVisible();
  });

  test("shows auto-detected badge when pasting a LinkedIn job URL", async ({
    page,
  }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");
    await textarea.fill("https://www.linkedin.com/jobs/view/9876543210");

    await expect(page.getByText("Valid Job Requisition Link")).toBeVisible();
  });

  test("does not show badge when plain text without URL is pasted", async ({
    page,
  }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");
    await textarea.fill(
      "We are looking for a software engineer with experience in TypeScript and React."
    );

    await expect(
      page.getByText("Valid Job Requisition Link")
    ).not.toBeVisible();
  });

  test("clearing the textarea hides the badge", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("#jobDescription");

    // Type a URL to trigger the badge
    await textarea.fill("https://www.indeed.com/viewjob?jk=abc123");
    await expect(page.getByText("Valid Job Requisition Link")).toBeVisible();

    // Clear the textarea
    await textarea.fill("");
    await expect(
      page.getByText("Valid Job Requisition Link")
    ).not.toBeVisible();
  });
});

test.describe("Job Match – Preview Page Tab Access", () => {
  test.beforeEach(async ({ page }) => {
    mockConvexQueries(page);
    mockJobMatchApi(page);
  });

  test("Job Match tab is visible and accessible from the preview page", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    // The "Job Match" tab button should be visible in the navigation strip
    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await expect(jobMatchTab).toBeVisible();
  });

  test("clicking Job Match tab reveals the JobMatchWidget", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    // Click the Job Match tab
    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The widget should render with its heading
    await expect(
      page.getByText("Job Match & Keyword Breakdown")
    ).toBeVisible();

    // The textarea for pasting a job description should be present
    await expect(
      page.getByPlaceholder("Paste job description or requirements here...")
    ).toBeVisible();

    // The analyze button should be present
    await expect(
      page.getByRole("button", { name: /Analyze Job Alignment/i })
    ).toBeVisible();
  });

  test("empty job description submission shows validation error", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    // Navigate to Job Match tab
    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // Click "Analyze Job Alignment" without entering any text
    const analyzeBtn = page.getByRole("button", {
      name: /Analyze Job Alignment/i,
    });
    await analyzeBtn.click();

    // Should show validation error
    await expect(
      page.getByText("Please paste a job description first.")
    ).toBeVisible();
  });
});

test.describe("Job Match – Result Display (Pre-seeded Match)", () => {
  test.beforeEach(async ({ page }) => {
    mockConvexQueries(page);
    mockJobMatchApi(page);
  });

  test("match score displays as a percentage in the header badge", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    // Click the Job Match tab
    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The header badge should show "Job Match: 78%"
    await expect(page.getByText("Job Match: 78%")).toBeVisible();
  });

  test("match score percentage circle renders in the result area", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The large score circle should display "78%"
    await expect(page.getByText("78%")).toBeVisible();
    // "Match" label should be near the score
    await expect(page.getByText("Match", { exact: true })).toBeVisible();
    // Compatibility Score heading
    await expect(page.getByText("Compatibility Score")).toBeVisible();
  });

  test("matched keywords are listed with checkmarks", async ({ page }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The matched keywords section should be visible
    await expect(page.getByText("Matched Keywords")).toBeVisible();

    // Verify specific matched keywords appear
    await expect(page.getByText("TypeScript").first()).toBeVisible();
    await expect(page.getByText("React").first()).toBeVisible();
    await expect(page.getByText("AWS").first()).toBeVisible();
    await expect(page.getByText("microservices").first()).toBeVisible();
    await expect(page.getByText("CI/CD").first()).toBeVisible();
    await expect(page.getByText("PostgreSQL").first()).toBeVisible();
  });

  test("missing keywords are listed with plus signs", async ({ page }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The missing keywords section should be visible
    await expect(page.getByText("Missing Keywords / Gaps")).toBeVisible();

    // Verify specific missing keywords appear
    await expect(page.getByText("Kafka").first()).toBeVisible();
    await expect(page.getByText("GraphQL").first()).toBeVisible();
    await expect(page.getByText("Terraform").first()).toBeVisible();
    await expect(page.getByText("system design").first()).toBeVisible();
  });

  test("gap analysis paragraph renders in the score area", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The gap analysis text should appear in the compatibility score section
    await expect(
      page.getByText(
        "Your profile demonstrates strong backend and cloud competency"
      )
    ).toBeVisible();
    await expect(
      page.getByText("event-driven architectures (Kafka)")
    ).toBeVisible();
    await expect(
      page.getByText("infrastructure-as-code (Terraform)")
    ).toBeVisible();
  });

  test("tailored bullets section shows STE-100 suggestions", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // The tailored bullets heading should be visible
    await expect(
      page.getByText("Targeted STE-100 ATS Bullets")
    ).toBeVisible();

    // "STE-100 Validated" badge should be present
    await expect(page.getByText("STE-100 Validated")).toBeVisible();

    // Verify the three tailored bullets render
    await expect(
      page.getByText(
        "Architected and deployed a microservices platform on AWS"
      )
    ).toBeVisible();
    await expect(
      page.getByText("Optimized PostgreSQL query performance by 40%")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Led a cross-functional team of 5 engineers to deliver a React-based"
      )
    ).toBeVisible();
  });

  test("score badge shows correct label for moderate match (50-79%)", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // A 78% score should show "Moderate Match"
    await expect(page.getByText("Moderate Match")).toBeVisible();
  });
});

test.describe("Job Match – Analyze Button Integration", () => {
  test.beforeEach(async ({ page }) => {
    mockConvexQueries(page);
    mockJobMatchApi(page);
  });

  test("pasting text and clicking Analyze shows loading state then results", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // Paste a job description
    const textarea = page.getByPlaceholder(
      "Paste job description or requirements here..."
    );
    await textarea.fill(
      "We are looking for a Senior Software Engineer with TypeScript, React, and AWS experience."
    );

    // Click the analyze button
    const analyzeBtn = page.getByRole("button", {
      name: /Analyze Job Alignment/i,
    });
    await analyzeBtn.click();

    // Should briefly show loading state
    await expect(
      page.getByText("Analyzing Compatibility...")
    ).toBeVisible();

    // After the API responds, results should appear
    await expect(page.getByText("Compatibility Score")).toBeVisible();
    await expect(page.getByText("Matched Keywords")).toBeVisible();
    await expect(page.getByText("Missing Keywords / Gaps")).toBeVisible();
  });

  test("Clear Results button removes result display and resets textarea", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // Paste and analyze
    const textarea = page.getByPlaceholder(
      "Paste job description or requirements here..."
    );
    await textarea.fill("Software engineer role with TypeScript");

    const analyzeBtn = page.getByRole("button", {
      name: /Analyze Job Alignment/i,
    });
    await analyzeBtn.click();

    // Wait for results
    await expect(page.getByText("Compatibility Score")).toBeVisible();

    // Click Clear Results
    const clearBtn = page.getByRole("button", { name: /Clear Results/i });
    await clearBtn.click();

    // Results should be gone
    await expect(
      page.getByText("Compatibility Score")
    ).not.toBeVisible();

    // Textarea should be empty
    await expect(textarea).toHaveValue("");
  });
});

test.describe("Job Match – Keyword Progress Bar", () => {
  test.beforeEach(async ({ page }) => {
    mockConvexQueries(page);
    mockJobMatchApi(page);
  });

  test("matched vs missing count badges reflect keyword totals", async ({
    page,
  }) => {
    await page.goto("/preview/seed-demo-upload-id");

    const jobMatchTab = page.getByRole("button", { name: /Job Match/i });
    await jobMatchTab.click();

    // Matched count badge: "7 Matched"
    await expect(page.getByText("7 Matched")).toBeVisible();

    // Missing count badge: "4 Missing"
    await expect(page.getByText("4 Missing")).toBeVisible();
  });
});
