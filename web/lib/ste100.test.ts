import { describe, expect, test } from "vitest";
import {
  countWordsSTE100,
  validateBulletSTE100,
  analyzeProfileBulletsSTE100,
} from "./ste100";

describe("STE-100 ATS Bullet Quality Validator", () => {
  describe("countWordsSTE100", () => {
    test("counts hyphenated words as one word (Rule 8.7)", () => {
      expect(countWordsSTE100("cutoff-switch power connection")).toBe(3);
      expect(countWordsSTE100("Main-gear-door retraction-winch handle")).toBe(3);
    });

    test("counts parenthesized phrases as one word (Rule 8.5)", () => {
      expect(
        countWordsSTE100("Make sure switch is released (legend is off).")
      ).toBe(6);
    });

    test("counts numbers and measurement units as one word (Rule 8.6)", () => {
      expect(countWordsSTE100("The unit weighs 20 kg.")).toBe(4);
      expect(
        countWordsSTE100("Make sure that the temperature is 10 °C.")
      ).toBe(7);
      expect(countWordsSTE100("Improved conversion rates by 35%.")).toBe(5);
    });

    test("returns 0 for empty strings", () => {
      expect(countWordsSTE100("")).toBe(0);
      expect(countWordsSTE100("   ")).toBe(0);
    });
  });

  describe("validateBulletSTE100", () => {
    test("flags British English spelling variants (Rule 1.14)", () => {
      const res = validateBulletSTE100("Optimised the backend microservice architecture.");
      expect(res.violations.some((v) => v.ruleId === "RULE_1_14_SPELLING")).toBe(true);
      expect(res.improvementTips.some((t) => t.includes("optimise"))).toBe(true);
    });

    test("flags contractions (Rule 4.2)", () => {
      const res = validateBulletSTE100("If system fails, don't restart immediately.");
      expect(res.violations.some((v) => v.ruleId === "RULE_4_2_CONTRACTIONS")).toBe(true);
      expect(res.improvementTips.some((t) => t.includes("don't"))).toBe(true);
    });

    test("flags passive voice constructions (Rule 3.6)", () => {
      const res = validateBulletSTE100("The software was built by a team of five engineers.");
      expect(res.violations.some((v) => v.ruleId === "RULE_3_6_PASSIVE")).toBe(true);
    });

    test("flags non-permitted semicolons (Rule 8.1)", () => {
      const res = validateBulletSTE100("Maintained core APIs; refactored legacy database queries.");
      expect(res.violations.some((v) => v.ruleId === "RULE_8_1_SEMICOLON")).toBe(true);
    });

    test("flags excessive word count (Rule 5.1)", () => {
      const longBullet =
        "Architected and deployed a highly scalable cloud pipeline that processed over ten million transactions daily across three different geographic availability zones while ensuring continuous uptime and sub-second latency for enterprise clients.";
      const res = validateBulletSTE100(longBullet, true);
      expect(res.violations.some((v) => v.ruleId === "RULE_5_1_LENGTH")).toBe(true);
    });

    test("detects missing quantifiable metrics for ATS guidelines", () => {
      const res = validateBulletSTE100("Developed features for user dashboard.");
      expect(res.violations.some((v) => v.ruleId === "ATS_METRICS")).toBe(true);
    });

    test("passes clean, metric-rich, STE-100 compliant bullet", () => {
      const cleanBullet = "Engineered microservice pipeline processing 50k transactions daily with 99.9% uptime.";
      const res = validateBulletSTE100(cleanBullet);
      expect(res.isCompliant).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(90);
    });
  });

  describe("analyzeProfileBulletsSTE100", () => {
    test("aggregates multiple bullets and calculates overall compliance score", () => {
      const bullets = [
        "Engineered microservice pipeline processing 50k transactions daily with 99.9% uptime.",
        "Optimised database queries; didn't notice performance bottleneck.",
      ];
      const summary = analyzeProfileBulletsSTE100(bullets);
      expect(summary.totalBullets).toBe(2);
      expect(summary.compliantBullets).toBe(1);
      expect(summary.overallScore).toBeLessThan(100);
      expect(summary.topTips.length).toBeGreaterThan(0);
    });

    test("handles empty bullet list gracefully", () => {
      const summary = analyzeProfileBulletsSTE100([]);
      expect(summary.totalBullets).toBe(0);
      expect(summary.overallScore).toBe(100);
    });
  });
});
