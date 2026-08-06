import { describe, expect, test } from "vitest";
import { detectJobUrls } from "./jobUrlDetector";

describe("detectJobUrls", () => {
  test("returns empty result for empty or whitespace-only text", () => {
    expect(detectJobUrls("")).toEqual({
      hasUrl: false,
      hasIndeed: false,
      hasLinkedIn: false,
      urls: [],
      detectedPlatforms: [],
    });
    expect(detectJobUrls("   \n  ")).toEqual({
      hasUrl: false,
      hasIndeed: false,
      hasLinkedIn: false,
      urls: [],
      detectedPlatforms: [],
    });
  });

  test("returns no URLs for standard job description without links", () => {
    const text = "We are looking for a Senior Frontend Developer proficient in React, TypeScript, and Next.js.";
    const result = detectJobUrls(text);
    expect(result.hasUrl).toBe(false);
    expect(result.hasIndeed).toBe(false);
    expect(result.hasLinkedIn).toBe(false);
    expect(result.urls).toHaveLength(0);
    expect(result.detectedPlatforms).toHaveLength(0);
  });

  test("detects a pasted LinkedIn job URL", () => {
    const text = "https://www.linkedin.com/jobs/view/4123456789/";
    const result = detectJobUrls(text);
    expect(result.hasUrl).toBe(true);
    expect(result.hasLinkedIn).toBe(true);
    expect(result.hasIndeed).toBe(false);
    expect(result.primaryUrl).toBe("https://www.linkedin.com/jobs/view/4123456789/");
    expect(result.detectedPlatforms).toEqual([
      {
        id: "linkedin",
        name: "LinkedIn",
        url: "https://www.linkedin.com/jobs/view/4123456789/",
      },
    ]);
  });

  test("detects a pasted Indeed job URL", () => {
    const text = "Check out this position on Indeed: https://www.indeed.com/viewjob?jk=abc123def456";
    const result = detectJobUrls(text);
    expect(result.hasUrl).toBe(true);
    expect(result.hasIndeed).toBe(true);
    expect(result.hasLinkedIn).toBe(false);
    expect(result.primaryUrl).toBe("https://www.indeed.com/viewjob?jk=abc123def456");
    expect(result.detectedPlatforms).toEqual([
      {
        id: "indeed",
        name: "Indeed",
        url: "https://www.indeed.com/viewjob?jk=abc123def456",
      },
    ]);
  });

  test("detects international subdomains for Indeed and LinkedIn", () => {
    const indeedResult = detectJobUrls("https://ca.indeed.com/job/senior-software-engineer-1234");
    expect(indeedResult.hasIndeed).toBe(true);
    expect(indeedResult.detectedPlatforms[0].name).toBe("Indeed");

    const linkedinResult = detectJobUrls("https://uk.linkedin.com/jobs/view/987654321");
    expect(linkedinResult.hasLinkedIn).toBe(true);
    expect(linkedinResult.detectedPlatforms[0].name).toBe("LinkedIn");
  });

  test("detects both Indeed and LinkedIn URLs when both are present", () => {
    const text = `
      Comparing two job posts:
      1. https://www.linkedin.com/jobs/view/1001
      2. https://www.indeed.com/viewjob?jk=2002
    `;
    const result = detectJobUrls(text);
    expect(result.hasUrl).toBe(true);
    expect(result.hasIndeed).toBe(true);
    expect(result.hasLinkedIn).toBe(true);
    expect(result.detectedPlatforms).toHaveLength(2);
    expect(result.detectedPlatforms.map((p) => p.id)).toContain("indeed");
    expect(result.detectedPlatforms.map((p) => p.id)).toContain("linkedin");
  });

  test("detects bare domain URLs without http scheme", () => {
    const result = detectJobUrls("Check indeed.com/viewjob?jk=555 for details");
    expect(result.hasIndeed).toBe(true);
    expect(result.primaryUrl).toBe("https://indeed.com/viewjob?jk=555");
  });

  test("detects generic job URLs", () => {
    const result = detectJobUrls("https://careers.google.com/jobs/results/123456789/");
    expect(result.hasUrl).toBe(true);
    expect(result.hasIndeed).toBe(false);
    expect(result.hasLinkedIn).toBe(false);
    expect(result.detectedPlatforms).toEqual([
      {
        id: "other",
        name: "Job Link",
        url: "https://careers.google.com/jobs/results/123456789/",
      },
    ]);
  });
});
