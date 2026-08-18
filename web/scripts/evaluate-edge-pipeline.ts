/**
 * Bun TypeScript Edge Pipeline Evaluation & Benchmark Suite.
 * Evaluates profile mapping, STE-100 scoring, and hardware profile throughput.
 *
 * Usage:
 *   bun run scripts/evaluate-edge-pipeline.ts
 */

import { validateBulletSTE100, analyzeProfileBulletsSTE100 } from "../lib/ste100";
import { profileFieldsFrom } from "../lib/profileMapping";
import { detectHardwareProfile } from "../lib/hardwareDetection";

const SAMPLE_PROFILE_JSON = {
  name: "Sarah Connor",
  contact: {
    email: "sarah.connor@cyberdyne.org",
    phone: "(415) 890-1234",
    location: "Los Angeles, CA",
    linkedin: "linkedin.com/in/sarahconnor",
    website: "github.com/sconnor"
  },
  titles: ["Lead Cloud Native Architect"],
  summary: "Cloud Native architect with 10+ years engineering distributed systems and high-throughput Rust microservices.",
  skills: {
    languages: ["Rust", "Python", "Go", "TypeScript", "SQL"],
    cloud_devops: ["Kubernetes", "Docker", "Terraform", "AWS", "GCP"],
    databases: ["PostgreSQL", "Redis", "Convex", "SQLite"],
    frameworks: ["Next.js", "PyTorch", "FastAPI"]
  },
  experience: [
    {
      title: "Lead Infrastructure Architect",
      company: "TechCorp Systems",
      start: "2021",
      end: "Present",
      location: "Los Angeles, CA",
      bullets: [
        "Architected multi-region Kubernetes clusters serving 150k RPS with zero downtime.",
        "Engineered async telemetry pipeline reducing event processing latency by 72%."
      ]
    }
  ],
  education: [
    {
      degree: "B.S. in Computer Engineering",
      school: "California Institute of Technology",
      years: "2012 - 2016"
    }
  ]
};

async function runEvaluation() {
  console.log("\n============================================================");
  console.log("  ⚡ easyCV Edge Pipeline — Results-Driven Product Benchmark");
  console.log("============================================================\n");

  // 1. Benchmark Profile Mapping & Coercion
  const t0 = performance.now();
  const iterations = 1000;
  for (let i = 0; i < iterations; i++) {
    profileFieldsFrom(SAMPLE_PROFILE_JSON);
  }
  const tMapping = (performance.now() - t0) / iterations;
  console.log(`  ✔ Profile Coercion Benchmark:  ${(tMapping * 1000).toFixed(2)} µs/op (${iterations} ops)`);

  // 2. Benchmark STE-100 Linting Engine
  const testBullets = [
    "Architected multi-region Kubernetes clusters serving 150k RPS with zero downtime.",
    "Engineered async telemetry pipeline reducing event processing latency by 72%."
  ];

  const t1 = performance.now();
  let totalViolations = 0;
  for (let i = 0; i < iterations; i++) {
    for (const bullet of testBullets) {
      const lint = validateBulletSTE100(bullet);
      totalViolations += lint.violations.length;
    }
  }
  const tLint = (performance.now() - t1) / (iterations * testBullets.length);
  console.log(`  ✔ STE-100 Linter Throughput:    ${(tLint * 1000).toFixed(2)} µs/bullet`);

  // 3. Score Structured Profile Bullets
  const scoreResult = analyzeProfileBulletsSTE100(testBullets);
  console.log(`  ✔ STE-100 Compliance Score:    ${scoreResult.overallScore}/100 (${scoreResult.compliantBullets}/${scoreResult.totalBullets} compliant)`);

  // 4. Hardware Detection Profile
  const hw = await detectHardwareProfile();
  console.log(`\n  [Detected Hardware Telemetry]`);
  console.log(`  • CPU Cores:        ${hw.cpuCores}`);
  console.log(`  • GPU Renderer:     ${hw.gpuRenderer}`);
  console.log(`  • WebGPU Active:    ${hw.hasWebGPU ? "YES ⚡" : "NO (Edge CPU fallback)"}`);
  console.log(`  • Hardware Tier:    ${hw.hardwareTier.toUpperCase()}`);
  console.log(`  • Estimated Pipeline: ${(hw.estimatedPipelineDurationMs / 1000).toFixed(1)}s`);
  console.log(`  • Engine Name:      ${hw.engineName}`);

  console.log("\n============================================================\n");
}

runEvaluation().catch(console.error);
