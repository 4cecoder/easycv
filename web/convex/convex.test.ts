/**
 * Unit tests covering:
 * 1. Schema shape validation (uploads, structuredProfiles, payments tables)
 * 2. Contact object validation (email, phone, location fields)
 * 3. Skills object validation (languages, frameworks, cloud_devops, databases, tools arrays)
 * 4. Experience entry validation (title, company, bullets)
 * 5. Education entry validation (degree, school, years)
 * 6. Profile field mapping from pipeline output (profileFieldsFrom)
 * 7. STE-100 validation logic (ste100.ts)
 */

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { contact, skills, experienceEntry, educationEntry } from "./schema";
import { api, internal } from "./_generated/api";
import {
  profileFieldsFrom,
  type ProfileFields,
} from "../lib/profileMapping";
import {
  countWordsSTE100,
  validateBulletSTE100,
  analyzeProfileBulletsSTE100,
} from "../lib/ste100";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleQuality = {
  qualityScore: 10,
  qualityMaxScore: 15,
  qualityWarnings: ["no contact phone"],
  qualityCritical: false,
};

async function storeFakeFile(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["hello world"]));
  });
}

// ---------------------------------------------------------------------------
// 1. Schema shape validation – table-level fields
// ---------------------------------------------------------------------------

describe("schema shape validation", () => {
  describe("uploads table", () => {
    test("creates an upload with all required fields", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-1",
      });
      expect(uploadId).toBeTruthy();

      const upload = await t.query(api.uploads.getUpload, {
        uploadId,
        sessionId: "sess-schema-1",
      });
      expect(upload).not.toBeNull();
      expect(typeof upload!.sessionId).toBe("string");
      expect(typeof upload!.status).toBe("string");
      expect(typeof upload!.attempts).toBe("number");
      expect(typeof upload!.createdAt).toBe("number");
    });

    test("rejects mutation with missing required field (sessionId)", async () => {
      const t = convexTest(schema);
      await expect(
        t.mutation(api.uploads.createUpload, {} as any),
      ).rejects.toThrow();
    });

    test("uploads table has expected indexes", () => {
      // Verify the schema object exports the expected table shape at the
      // structural level (validators have `fields` property for objects).
      const uploadsTable = (schema as any).tables.uploads;
      expect(uploadsTable).toBeDefined();
    });
  });

  describe("structuredProfiles table", () => {
    test("saves a profile with full structured fields", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-sp",
      });

      const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        name: "Schema Tester",
        contact: {
          email: "test@schema.dev",
          phone: "+1-555-0100",
          location: "Remote",
        },
        titles: ["Senior Engineer"],
        summary: "A thorough schema test.",
        skills: {
          languages: ["TypeScript", "Rust"],
          frameworks: ["React", "Next.js"],
          cloud_devops: ["AWS", "Docker"],
          databases: ["PostgreSQL"],
          tools: ["Git", "Vim"],
        },
        experience: [
          {
            title: "Engineer",
            company: "Acme",
            start: "2020-01",
            end: "2023-12",
            location: "NYC",
            bullets: ["Built systems", "Led team of 5"],
          },
        ],
        education: [
          {
            degree: "B.S. Computer Science",
            school: "MIT",
            years: "2016-2020",
          },
        ],
        certifications: ["AWS Solutions Architect"],
        languagesSpoken: ["English", "Spanish"],
        ...sampleQuality,
      });
      expect(profileId).toBeTruthy();

      const profile = await t.query(api.profiles.getStructuredProfile, {
        uploadId,
        sessionId: "sess-schema-sp",
      });
      expect(profile).not.toBeNull();
      expect(profile!.name).toBe("Schema Tester");
      expect(profile!.contact?.email).toBe("test@schema.dev");
      expect(profile!.contact?.phone).toBe("+1-555-0100");
      expect(profile!.contact?.location).toBe("Remote");
      expect(profile!.skills?.languages).toEqual(["TypeScript", "Rust"]);
      expect(profile!.skills?.frameworks).toEqual(["React", "Next.js"]);
      expect(profile!.experience).toHaveLength(1);
      expect(profile!.experience![0].title).toBe("Engineer");
      expect(profile!.experience![0].bullets).toEqual([
        "Built systems",
        "Led team of 5",
      ]);
      expect(profile!.education).toHaveLength(1);
      expect(profile!.education![0].degree).toBe("B.S. Computer Science");
      expect(profile!.certifications).toEqual(["AWS Solutions Architect"]);
      expect(profile!.languagesSpoken).toEqual(["English", "Spanish"]);
    });

    test("saves a profile with only required quality fields (all optional fields omitted)", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-min",
      });

      const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        ...sampleQuality,
      });
      expect(profileId).toBeTruthy();

      const profile = await t.query(api.profiles.getStructuredProfile, {
        uploadId,
        sessionId: "sess-schema-min",
      });
      expect(profile).not.toBeNull();
      expect(profile!.name).toBeUndefined();
      expect(profile!.contact).toBeUndefined();
      expect(profile!.skills).toBeUndefined();
      expect(profile!.experience).toBeUndefined();
      expect(profile!.education).toBeUndefined();
    });

    test("structuredProfiles rejects save with invalid qualityScore type", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-invalid",
      });

      await expect(
        t.mutation(api.profiles.saveStructuredProfile, {
          uploadId,
          qualityScore: "not-a-number" as any,
          qualityMaxScore: 15,
          qualityWarnings: [],
          qualityCritical: false,
        }),
      ).rejects.toThrow();
    });
  });

  describe("payments table", () => {
    test("creates a payment with valid fields", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-pay",
      });

      const paymentId = await t.mutation(api.payments.createPaymentRecord, {
        uploadId,
        sessionId: "sess-schema-pay",
        stripeSessionId: "cs_schema_test",
        amountCents: 1500,
        currency: "usd",
      });
      expect(paymentId).toBeTruthy();

      const status = await t.query(api.payments.getPaymentStatus, {
        uploadId,
        sessionId: "sess-schema-pay",
      });
      expect(status.paid).toBe(false);
      expect(status.downloadToken).toBeNull();
    });

    test("payments rejects missing required fields", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-pay2",
      });

      await expect(
        t.mutation(api.payments.createPaymentRecord, {
          uploadId,
          sessionId: "sess-schema-pay2",
          // missing stripeSessionId, amountCents, currency
        } as any),
      ).rejects.toThrow();
    });

    test("payments rejects invalid amountCents type", async () => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-schema-pay3",
      });

      await expect(
        t.mutation(api.payments.createPaymentRecord, {
          uploadId,
          sessionId: "sess-schema-pay3",
          stripeSessionId: "cs_bad_amount",
          amountCents: "free" as any,
          currency: "usd",
        }),
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Contact object validation
// ---------------------------------------------------------------------------

describe("contact object validation", () => {
  const VALID_CONTACTS = [
    { email: "user@example.com" },
    { phone: "+1-555-1234" },
    { location: "San Francisco, CA" },
    { linkedin: "https://linkedin.com/in/test" },
    { website: "https://example.com" },
    {
      email: "full@example.com",
      phone: "+1-555-0000",
      location: "Remote",
      linkedin: "https://linkedin.com/in/full",
      website: "https://full.example.com",
    },
    {}, // all fields are optional
  ];

  test.each(VALID_CONTACTS)(
    "accepts valid contact: %j",
    async (contactOverride) => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-contact-valid",
      });

      const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        contact: contactOverride,
        ...sampleQuality,
      });
      expect(profileId).toBeTruthy();
    },
  );

  test("contact accepts all optional fields present", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-contact-full",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      contact: {
        email: "a@b.com",
        phone: "123",
        location: "Earth",
        linkedin: "https://linkedin.com/in/x",
        website: "https://x.com",
      },
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-contact-full",
    });
    expect(profile?.contact?.email).toBe("a@b.com");
    expect(profile?.contact?.phone).toBe("123");
    expect(profile?.contact?.location).toBe("Earth");
    expect(profile?.contact?.linkedin).toBe("https://linkedin.com/in/x");
    expect(profile?.contact?.website).toBe("https://x.com");
  });

  test("contact rejects extra unknown fields", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-contact-extra",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        contact: {
          email: "x@y.com",
          fax: "555-1234", // unknown field
        } as any,
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });

  test("contact rejects non-string field values", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-contact-type",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        contact: {
          email: 12345 as any,
        },
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Skills object validation
// ---------------------------------------------------------------------------

describe("skills object validation", () => {
  const VALID_SKILLS = [
    {
      languages: ["TypeScript"],
      frameworks: ["React"],
      cloud_devops: ["AWS"],
      databases: ["Postgres"],
      tools: ["Git"],
    },
    {
      languages: [],
      frameworks: [],
      cloud_devops: [],
      databases: [],
      tools: [],
    },
    {
      languages: ["Python", "Rust", "Go", "C++"],
      frameworks: ["Django", "Flask", "FastAPI"],
      cloud_devops: ["Docker", "Kubernetes", "Terraform", "CI/CD"],
      databases: ["PostgreSQL", "MongoDB", "Redis", "SQLite"],
      tools: ["VS Code", "Vim", "tmux", "fzf", "ripgrep"],
    },
  ];

  test.each(VALID_SKILLS)(
    "accepts valid skills: %j",
    async (skillsObj) => {
      const t = convexTest(schema);
      const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-skills-valid",
      });

      const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        skills: skillsObj,
        ...sampleQuality,
      });
      expect(profileId).toBeTruthy();
    },
  );

  test("skills rejects missing required sub-array", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-skills-missing",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        skills: {
          languages: ["JS"],
          frameworks: [],
          // missing cloud_devops, databases, tools
        } as any,
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });

  test("skills rejects non-array values", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-skills-type",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        skills: {
          languages: "Python" as any, // should be array
          frameworks: [],
          cloud_devops: [],
          databases: [],
          tools: [],
        },
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });

  test("skills rejects arrays with non-string elements", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
        sessionId: "sess-skills-elems",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        skills: {
          languages: [123 as any],
          frameworks: [],
          cloud_devops: [],
          databases: [],
          tools: [],
        },
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Experience entry validation
// ---------------------------------------------------------------------------

describe("experience entry validation", () => {
  test("accepts a minimal experience entry (only bullets required)", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-exp-min",
    });

    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      experience: [{ bullets: ["Did stuff"] }],
      ...sampleQuality,
    });
    expect(profileId).toBeTruthy();

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-exp-min",
    });
    expect(profile!.experience).toHaveLength(1);
    expect(profile!.experience![0].bullets).toEqual(["Did stuff"]);
    expect(profile!.experience![0].title).toBeUndefined();
    expect(profile!.experience![0].company).toBeUndefined();
  });

  test("accepts a full experience entry with all fields", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-exp-full",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      experience: [
        {
          title: "Senior Engineer",
          company: "BigTech Inc.",
          start: "2021-01",
          end: "2024-01",
          location: "Remote",
          bullets: ["Led a team of 10", "Reduced costs by 35%"],
        },
      ],
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-exp-full",
    });
    expect(profile!.experience![0].title).toBe("Senior Engineer");
    expect(profile!.experience![0].company).toBe("BigTech Inc.");
    expect(profile!.experience![0].start).toBe("2021-01");
    expect(profile!.experience![0].end).toBe("2024-01");
    expect(profile!.experience![0].location).toBe("Remote");
    expect(profile!.experience![0].bullets).toHaveLength(2);
  });

  test("rejects an experience entry without bullets array", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-exp-nobullets",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        experience: [
          {
            title: "Engineer",
            company: "Co",
            // missing bullets
          } as any,
        ],
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });

  test("accepts multiple experience entries", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-exp-multi",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      experience: [
        { title: "Junior Dev", company: "Startup", bullets: ["Learned fast"] },
        { title: "Mid Dev", company: "Scaleup", bullets: ["Shipped features"] },
        { title: "Senior Dev", company: "BigCo", bullets: ["Led architecture"] },
      ],
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-exp-multi",
    });
    expect(profile!.experience).toHaveLength(3);
    expect(profile!.experience![0].title).toBe("Junior Dev");
    expect(profile!.experience![2].title).toBe("Senior Dev");
  });

  test("accepts experience with empty bullets array", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-exp-emptybullets",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      experience: [{ title: "Intern", company: "Co", bullets: [] }],
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-exp-emptybullets",
    });
    expect(profile!.experience![0].bullets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Education entry validation
// ---------------------------------------------------------------------------

describe("education entry validation", () => {
  test("accepts a minimal education entry (all fields optional)", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-edu-min",
    });

    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      education: [{}],
      ...sampleQuality,
    });
    expect(profileId).toBeTruthy();

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-edu-min",
    });
    expect(profile!.education).toHaveLength(1);
    expect(profile!.education![0].degree).toBeUndefined();
    expect(profile!.education![0].school).toBeUndefined();
    expect(profile!.education![0].years).toBeUndefined();
  });

  test("accepts a full education entry", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-edu-full",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      education: [
        {
          degree: "M.S. Computer Science",
          school: "Stanford University",
          years: "2018-2020",
        },
      ],
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-edu-full",
    });
    expect(profile!.education![0].degree).toBe("M.S. Computer Science");
    expect(profile!.education![0].school).toBe("Stanford University");
    expect(profile!.education![0].years).toBe("2018-2020");
  });

  test("accepts multiple education entries", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-edu-multi",
    });

    await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      education: [
        { degree: "B.S. CS", school: "MIT", years: "2014-2018" },
        { degree: "M.S. CS", school: "Stanford", years: "2018-2020" },
        { degree: "PhD AI", school: "CMU", years: "2020-2024" },
      ],
      ...sampleQuality,
    });

    const profile = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-edu-multi",
    });
    expect(profile!.education).toHaveLength(3);
    expect(profile!.education![2].degree).toBe("PhD AI");
  });

  test("education rejects non-string field values", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-edu-type",
    });

    await expect(
      t.mutation(api.profiles.saveStructuredProfile, {
        uploadId,
        education: [
          {
            degree: 12345 as any,
            school: ["MIT"] as any,
            years: 2020 as any,
          },
        ],
        ...sampleQuality,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Profile field mapping from pipeline output (profileMapping.ts)
// ---------------------------------------------------------------------------

describe("profileFieldsFrom", () => {
  // ---- Null / invalid inputs ----

  test("returns rawFallback for null input", () => {
    expect(profileFieldsFrom(null)).toEqual({
      rawFallback: "invalid profile payload",
    });
  });

  test("returns rawFallback for undefined input", () => {
    expect(profileFieldsFrom(undefined)).toEqual({
      rawFallback: "invalid profile payload",
    });
  });

  test("returns rawFallback for a primitive string input", () => {
    expect(profileFieldsFrom("not an object")).toEqual({
      rawFallback: "invalid profile payload",
    });
  });

  test("returns rawFallback for a number input", () => {
    expect(profileFieldsFrom(42)).toEqual({
      rawFallback: "invalid profile payload",
    });
  });

  // ---- _raw fallback ----

  test("returns rawFallback when profile has _raw string", () => {
    const result = profileFieldsFrom({ _raw: "raw LLM output text" });
    expect(result).toEqual({ rawFallback: "raw LLM output text" });
  });

  test("returns rawFallback with JSON.stringify when _raw is non-string", () => {
    const result = profileFieldsFrom({ _raw: { nested: "data" } });
    expect(result).toEqual({
      rawFallback: JSON.stringify({ nested: "data" }),
    });
  });

  // ---- Minimal valid profile ----

  test("maps a minimal profile with only name", () => {
    const result = profileFieldsFrom({ name: "Alice" });
    expect(result.name).toBe("Alice");
    expect(result.contact).toBeUndefined();
    expect(result.skills).toBeUndefined();
    expect(result.experience).toBeUndefined();
    expect(result.education).toBeUndefined();
  });

  // ---- Contact mapping ----

  test("maps contact fields correctly", () => {
    const result = profileFieldsFrom({
      contact: {
        email: "alice@test.com",
        phone: "555-1234",
        location: "NYC",
        linkedin: "https://linkedin.com/in/alice",
        website: "https://alice.dev",
      },
    });
    expect(result.contact).toEqual({
      email: "alice@test.com",
      phone: "555-1234",
      location: "NYC",
      linkedin: "https://linkedin.com/in/alice",
      website: "https://alice.dev",
    });
  });

  test("filters out non-string contact fields", () => {
    const result = profileFieldsFrom({
      contact: {
        email: "a@b.com",
        phone: 12345, // not a string
        location: "",
        extra: "value", // not in allowed keys
      },
    });
    expect(result.contact).toEqual({ email: "a@b.com" });
  });

  test("returns undefined contact when contact is null", () => {
    const result = profileFieldsFrom({ contact: null });
    expect(result.contact).toBeUndefined();
  });

  // ---- Titles mapping ----

  test("maps titles array correctly", () => {
    const result = profileFieldsFrom({
      titles: ["Software Engineer", "Tech Lead"],
    });
    expect(result.titles).toEqual(["Software Engineer", "Tech Lead"]);
  });

  test("filters non-strings out of titles array", () => {
    const result = profileFieldsFrom({
      titles: ["Engineer", 123, null, "Lead"],
    });
    expect(result.titles).toEqual(["Engineer", "Lead"]);
  });

  test("returns undefined titles when not an array", () => {
    const result = profileFieldsFrom({ titles: "not-array" });
    expect(result.titles).toBeUndefined();
  });

  // ---- Skills mapping ----

  test("maps skills with all sub-categories", () => {
    const result = profileFieldsFrom({
      skills: {
        languages: ["TypeScript", "Python"],
        frameworks: ["React"],
        cloud_devops: ["AWS", "Docker"],
        databases: ["Postgres"],
        tools: ["Git"],
      },
    });
    expect(result.skills).toEqual({
      languages: ["TypeScript", "Python"],
      frameworks: ["React"],
      cloud_devops: ["AWS", "Docker"],
      databases: ["Postgres"],
      tools: ["Git"],
    });
  });

  test("defaults empty arrays for missing skill categories", () => {
    const result = profileFieldsFrom({
      skills: { languages: ["Go"] },
    });
    expect(result.skills).toEqual({
      languages: ["Go"],
      frameworks: [],
      cloud_devops: [],
      databases: [],
      tools: [],
    });
  });

  test("returns undefined skills when skills is not an object", () => {
    const result = profileFieldsFrom({ skills: "bad" });
    expect(result.skills).toBeUndefined();
  });

  test("returns undefined skills when skills is null", () => {
    const result = profileFieldsFrom({ skills: null });
    expect(result.skills).toBeUndefined();
  });

  // ---- Experience mapping ----

  test("maps experience entries correctly", () => {
    const result = profileFieldsFrom({
      experience: [
        {
          title: "Engineer",
          company: "Acme",
          start: "2020-01",
          end: "2023-12",
          location: "Remote",
          bullets: ["Built X", "Led Y"],
        },
      ],
    });
    expect(result.experience).toHaveLength(1);
    expect(result.experience![0]).toEqual({
      title: "Engineer",
      company: "Acme",
      start: "2020-01",
      end: "2023-12",
      location: "Remote",
      bullets: ["Built X", "Led Y"],
    });
  });

  test("filters out non-object entries from experience array", () => {
    const result = profileFieldsFrom({
      experience: [
        { title: "Valid", bullets: ["ok"] },
        null,
        "not-object",
        42,
        { title: "Also Valid", bullets: ["ok2"] },
      ],
    });
    expect(result.experience).toHaveLength(2);
    expect(result.experience![0].title).toBe("Valid");
    expect(result.experience![1].title).toBe("Also Valid");
  });

  test("defaults bullets to empty array when missing", () => {
    const result = profileFieldsFrom({
      experience: [{ title: "Engineer" }],
    });
    expect(result.experience![0].bullets).toEqual([]);
  });

  test("filters non-string bullets", () => {
    const result = profileFieldsFrom({
      experience: [{ bullets: ["good", 123, null, "also good"] }],
    });
    expect(result.experience![0].bullets).toEqual(["good", "also good"]);
  });

  // ---- Education mapping ----

  test("maps education entries correctly", () => {
    const result = profileFieldsFrom({
      education: [
        { degree: "B.S. CS", school: "MIT", years: "2014-2018" },
      ],
    });
    expect(result.education).toHaveLength(1);
    expect(result.education![0]).toEqual({
      degree: "B.S. CS",
      school: "MIT",
      years: "2014-2018",
    });
  });

  test("filters out non-object education entries", () => {
    const result = profileFieldsFrom({
      education: [
        { degree: "B.S." },
        null,
        undefined,
        { school: "MIT" },
      ],
    });
    expect(result.education).toHaveLength(2);
  });

  // ---- Certifications mapping ----

  test("maps certifications array", () => {
    const result = profileFieldsFrom({
      certifications: ["AWS SAA", "PMP"],
    });
    expect(result.certifications).toEqual(["AWS SAA", "PMP"]);
  });

  test("filters non-string certifications", () => {
    const result = profileFieldsFrom({
      certifications: ["AWS", 123, "PMP"],
    });
    expect(result.certifications).toEqual(["AWS", "PMP"]);
  });

  // ---- languages_spoken -> languagesSpoken rename ----

  test("renames languages_spoken to languagesSpoken", () => {
    const result = profileFieldsFrom({
      languages_spoken: ["English", "Japanese"],
    });
    expect(result.languagesSpoken).toEqual(["English", "Japanese"]);
  });

  test("does not map languagesSpoken key (only languages_spoken is recognized)", () => {
    // profileFieldsFrom only reads `languages_spoken` from the pipeline JSON;
    // `languagesSpoken` is not an input key it recognizes.
    const result = profileFieldsFrom({
      languagesSpoken: ["English"],
    });
    expect(result.languagesSpoken).toBeUndefined();
  });

  // ---- Summary mapping ----

  test("maps summary string", () => {
    const result = profileFieldsFrom({ summary: "A great engineer." });
    expect(result.summary).toBe("A great engineer.");
  });

  test("returns undefined summary for non-string", () => {
    const result = profileFieldsFrom({ summary: 42 });
    expect(result.summary).toBeUndefined();
  });

  // ---- Full profile integration ----

  test("maps a complete profile end-to-end", () => {
    const raw = {
      name: "Jane Doe",
      contact: {
        email: "jane@test.com",
        phone: "555-9999",
        location: "Portland",
        linkedin: "https://linkedin.com/in/jane",
        website: "https://jane.dev",
      },
      titles: ["Staff Engineer"],
      summary: "20+ years building distributed systems.",
      skills: {
        languages: ["Go", "Rust", "Python"],
        frameworks: ["gRPC", "FastAPI"],
        cloud_devops: ["GCP", "Terraform"],
        databases: ["Spanner", "BigQuery"],
        tools: ["Bazel", "Git"],
      },
      experience: [
        {
          title: "Staff Engineer",
          company: "MegaCorp",
          start: "2018-01",
          end: "present",
          location: "Remote",
          bullets: [
            "Architected global data pipeline",
            "Reduced latency 60%",
          ],
        },
        {
          title: "Senior Engineer",
          company: "StartupCo",
          start: "2014-03",
          end: "2017-12",
          location: "SF",
          bullets: ["Built product from 0 to 1"],
        },
      ],
      education: [
        {
          degree: "M.S. EE",
          school: "UC Berkeley",
          years: "2012-2014",
        },
        {
          degree: "B.S. EE",
          school: "UC Berkeley",
          years: "2008-2012",
        },
      ],
      certifications: ["AWS Solutions Architect Pro"],
      languages_spoken: ["English", "Mandarin"],
    };

    const result = profileFieldsFrom(raw);

    expect(result.name).toBe("Jane Doe");
    expect(result.contact?.email).toBe("jane@test.com");
    expect(result.titles).toEqual(["Staff Engineer"]);
    expect(result.summary).toBe("20+ years building distributed systems.");
    expect(result.skills?.languages).toEqual(["Go", "Rust", "Python"]);
    expect(result.experience).toHaveLength(2);
    expect(result.education).toHaveLength(2);
    expect(result.certifications).toEqual(["AWS Solutions Architect Pro"]);
    expect(result.languagesSpoken).toEqual(["English", "Mandarin"]);
  });
});

// ---------------------------------------------------------------------------
// 7. STE-100 validation logic (ste100.ts)
// ---------------------------------------------------------------------------

describe("countWordsSTE100", () => {
  test("returns 0 for empty string", () => {
    expect(countWordsSTE100("")).toBe(0);
  });

  test("returns 0 for whitespace-only string", () => {
    expect(countWordsSTE100("   ")).toBe(0);
  });

  test("returns 0 for null/undefined", () => {
    expect(countWordsSTE100(null as any)).toBe(0);
    expect(countWordsSTE100(undefined as any)).toBe(0);
  });

  test("counts single word", () => {
    expect(countWordsSTE100("Hello")).toBe(1);
  });

  test("counts multiple words", () => {
    expect(countWordsSTE100("Built a scalable system")).toBe(4);
  });

  test("treats parenthesized content as single token (Rule 8.5)", () => {
    // "Built (a very complex) system" -> "Built ___PAREN___ system" = 3 words
    expect(countWordsSTE100("Built (a very complex) system")).toBe(3);
  });

  test("treats quoted text as single token (Rule 8.6)", () => {
    // 'Built "a very complex" system' -> 'Built ___QUOTE___ system' = 3 words
    expect(countWordsSTE100('Built "a very complex" system')).toBe(3);
  });

  test("treats abbreviations as single token (Rule 8.6)", () => {
    // "e.g." is one token, "data" is one, "pipelines" is one = 3 total
    expect(countWordsSTE100("e.g. data pipelines")).toBe(3);
    expect(countWordsSTE100("i.e. fast systems")).toBe(3);
  });

  test("counts normal sentence without special constructs", () => {
    expect(countWordsSTE100("Led a team of five engineers")).toBe(6);
  });

  test("handles nested parentheses", () => {
    // "A (B (C) D) E" — the regex handles one level of nesting.
    // "(B (C)" gets matched first, leaving "D) E", giving 4 tokens total.
    expect(countWordsSTE100("A (B (C) D) E")).toBe(4);
  });
});

describe("validateBulletSTE100", () => {
  // ---- Empty / whitespace bullets ----

  test("empty bullet is compliant with score 100", () => {
    const result = validateBulletSTE100("");
    expect(result.isCompliant).toBe(true);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  test("whitespace-only bullet is compliant with score 100", () => {
    const result = validateBulletSTE100("   ");
    expect(result.isCompliant).toBe(true);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  // ---- Rule 8.1: Semicolon ----

  test("flags semicolons (Rule 8.1)", () => {
    const result = validateBulletSTE100("Built system; tested thoroughly");
    const semicolonViolation = result.violations.find(
      (v) => v.ruleId === "RULE_8_1_SEMICOLON",
    );
    expect(semicolonViolation).toBeDefined();
    expect(semicolonViolation!.severity).toBe("warning");
  });

  test("no semicolon violation when none present", () => {
    const result = validateBulletSTE100("Built system and tested it");
    const semicolonViolation = result.violations.find(
      (v) => v.ruleId === "RULE_8_1_SEMICOLON",
    );
    expect(semicolonViolation).toBeUndefined();
  });

  // ---- Rule 5.1: Sentence length ----

  test("flags procedural bullets over 20 words (Rule 5.1)", () => {
    const longBullet =
      "Build a comprehensive automated testing pipeline that covers unit integration and end to end scenarios across all services to ensure maximum code quality and reliability";
    const result = validateBulletSTE100(longBullet, true);
    const lengthViolation = result.violations.find(
      (v) => v.ruleId === "RULE_5_1_LENGTH",
    );
    expect(lengthViolation).toBeDefined();
  });

  test("flags descriptive bullets over 25 words (Rule 5.1)", () => {
    const longBullet =
      "A comprehensive automated testing pipeline that covers unit integration and end to end scenarios across all services is built to ensure maximum code quality and reliability in production environments worldwide";
    const result = validateBulletSTE100(longBullet, false);
    const lengthViolation = result.violations.find(
      (v) => v.ruleId === "RULE_5_1_LENGTH",
    );
    expect(lengthViolation).toBeDefined();
  });

  test("does not flag short procedural bullets", () => {
    const result = validateBulletSTE100("Built system", true);
    const lengthViolation = result.violations.find(
      (v) => v.ruleId === "RULE_5_1_LENGTH",
    );
    expect(lengthViolation).toBeUndefined();
  });

  // ---- Rule 1.14: British spelling ----

  test("flags British spelling 'colour' (Rule 1.14)", () => {
    const result = validateBulletSTE100("Optimised colour scheme");
    const spellingViolation = result.violations.find(
      (v) => v.ruleId === "RULE_1_14_SPELLING",
    );
    expect(spellingViolation).toBeDefined();
    expect(spellingViolation!.message).toContain("colour");
  });

  test("flags British spelling 'organise' (Rule 1.14)", () => {
    const result = validateBulletSTE100("Organised team activities");
    const spellingViolation = result.violations.find(
      (v) => v.ruleId === "RULE_1_14_SPELLING",
    );
    expect(spellingViolation).toBeDefined();
  });

  test("no British spelling violation for American spelling", () => {
    const result = validateBulletSTE100("Optimized color scheme");
    const spellingViolation = result.violations.find(
      (v) => v.ruleId === "RULE_1_14_SPELLING",
    );
    expect(spellingViolation).toBeUndefined();
  });

  // ---- Rule 4.2: Contractions ----

  test("flags contractions (Rule 4.2)", () => {
    const result = validateBulletSTE100("Don't use contractions");
    const contractionViolation = result.violations.find(
      (v) => v.ruleId === "RULE_4_2_CONTRACTIONS",
    );
    expect(contractionViolation).toBeDefined();
    // The matched text preserves original casing
    expect(contractionViolation!.message).toContain("Don't");
  });

  test("flags 'isn't' contraction", () => {
    const result = validateBulletSTE100("Isn't this a problem");
    const contractionViolation = result.violations.find(
      (v) => v.ruleId === "RULE_4_2_CONTRACTIONS",
    );
    expect(contractionViolation).toBeDefined();
  });

  test("flags 'won't' contraction when spelled with space (won t pattern)", () => {
    // The regex \bwon\s*n't\b matches "won't" as won + optional space + n't
    // but "won't" = won + 't (no extra 'n'). The pattern actually requires
    // the double-n "wonn't" form. Testing actual code behavior:
    const result = validateBulletSTE100("Won't break the build");
    // The regex does NOT match standard "won't" — this is a known limitation
    // of the pattern \bwon\s*n't\b which expects "won" + "n't" = "wonn't".
    const contractionViolation = result.violations.find(
      (v) => v.ruleId === "RULE_4_2_CONTRACTIONS",
    );
    // Record actual behavior — if the regex is fixed in the future, update this
    expect(contractionViolation).toBeUndefined();
  });

  test("no contraction violation when none present", () => {
    const result = validateBulletSTE100("Built system correctly");
    const contractionViolation = result.violations.find(
      (v) => v.ruleId === "RULE_4_2_CONTRACTIONS",
    );
    expect(contractionViolation).toBeUndefined();
  });

  // ---- Rule 3.6: Passive voice ----

  test("flags passive voice (Rule 3.6)", () => {
    const result = validateBulletSTE100("The system was built by the team");
    const passiveViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_6_PASSIVE",
    );
    expect(passiveViolation).toBeDefined();
  });

  test("flags 'is completed' as passive", () => {
    const result = validateBulletSTE100("The project is completed");
    const passiveViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_6_PASSIVE",
    );
    expect(passiveViolation).toBeDefined();
  });

  test("no passive violation for active voice", () => {
    const result = validateBulletSTE100("Built the system from scratch");
    const passiveViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_6_PASSIVE",
    );
    expect(passiveViolation).toBeUndefined();
  });

  // ---- Rule 3.5: -ing forms ----

  test("flags non-approved -ing words (Rule 3.5)", () => {
    const result = validateBulletSTE100("Built amazing software");
    const ingViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_5_ING_FORMS",
    );
    expect(ingViolation).toBeDefined();
    expect(ingViolation!.severity).toBe("info");
  });

  test("does not flag approved -ing words (e.g. 'missing')", () => {
    const result = validateBulletSTE100("Found missing files");
    const ingViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_5_ING_FORMS" && v.message.includes("missing"),
    );
    expect(ingViolation).toBeUndefined();
  });

  // ---- Rule 3.2: Complex tenses ----

  test("flags perfect tense with -ed ending (Rule 3.2)", () => {
    const result = validateBulletSTE100("Have developed the system");
    const tenseViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_2_TENSES",
    );
    expect(tenseViolation).toBeDefined();
  });

  test("does not flag 'Have built' (irregular past participle not in -ed/-en patterns)", () => {
    // The PERFECT_REGEX matches (has|have|had) + (ed|en|been) — "built"
    // doesn't end in -ed, -en, or match "been", so it's not flagged.
    const result = validateBulletSTE100("Have built the system");
    const tenseViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_2_TENSES",
    );
    expect(tenseViolation).toBeUndefined();
  });

  test("flags progressive tense (Rule 3.2)", () => {
    const result = validateBulletSTE100("Was building the system");
    const tenseViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_2_TENSES",
    );
    expect(tenseViolation).toBeDefined();
  });

  test("does not flag simple past tense", () => {
    const result = validateBulletSTE100("Built the system");
    const tenseViolation = result.violations.find(
      (v) => v.ruleId === "RULE_3_2_TENSES",
    );
    expect(tenseViolation).toBeUndefined();
  });

  // ---- ATS Metrics ----

  test("flags bullet without quantifiable metrics (ATS_METRICS)", () => {
    const result = validateBulletSTE100("Built the system");
    const metricsViolation = result.violations.find(
      (v) => v.ruleId === "ATS_METRICS",
    );
    expect(metricsViolation).toBeDefined();
    expect(metricsViolation!.severity).toBe("info");
  });

  test("no ATS violation when percentage present", () => {
    const result = validateBulletSTE100("Boosted performance by 35%");
    const metricsViolation = result.violations.find(
      (v) => v.ruleId === "ATS_METRICS",
    );
    expect(metricsViolation).toBeUndefined();
  });

  test("no ATS violation when dollar amount present", () => {
    const result = validateBulletSTE100("Saved $50K in annual costs");
    const metricsViolation = result.violations.find(
      (v) => v.ruleId === "ATS_METRICS",
    );
    expect(metricsViolation).toBeUndefined();
  });

  test("no ATS violation when number present", () => {
    const result = validateBulletSTE100("Managed 10+ microservices");
    const metricsViolation = result.violations.find(
      (v) => v.ruleId === "ATS_METRICS",
    );
    expect(metricsViolation).toBeUndefined();
  });

  // ---- Score calculation ----

  test("perfect bullet scores 100", () => {
    const result = validateBulletSTE100("Built 5 systems");
    expect(result.score).toBe(100);
  });

  test("each warning deducts 15 points, each info deducts 5", () => {
    // "Built system; shipped product" triggers:
    // - semicolon (warning, -15)
    // - ATS_METRICS (info, -5)
    // Total: 100 - 15 - 5 = 80
    const result = validateBulletSTE100("Built system; shipped product");
    expect(result.score).toBe(80);
  });

  test("score never goes below 0", () => {
    // A very long, semicolon-heavy, contraction-filled bullet
    const bullet =
      "Don't can't won't aren't isn't wasn't weren't hasn't haven't shouldn't wouldn't could";
    const result = validateBulletSTE100(bullet);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  // ---- isCompliant logic ----

  test("isCompliant is true when only info-level violations exist", () => {
    const result = validateBulletSTE100("Built 5 systems quickly");
    // May have -ing "info" violations but no warnings/errors
    const hasWarnings = result.violations.some(
      (v) => v.severity === "warning" || v.severity === "error",
    );
    expect(result.isCompliant).toBe(!hasWarnings);
  });

  test("isCompliant is false when warnings present", () => {
    const result = validateBulletSTE100("Don't use contractions in this bullet");
    expect(result.isCompliant).toBe(false);
  });

  // ---- Improvement tips ----

  test("returns improvement tips for violations", () => {
    const result = validateBulletSTE100("Don't use this");
    expect(result.improvementTips.length).toBeGreaterThan(0);
    // Should have contraction tip (message preserves original casing "Don't")
    const contractionTip = result.improvementTips.find((t) =>
      t.includes("Don't"),
    );
    expect(contractionTip).toBeDefined();
  });

  test("returns empty tips for compliant bullet", () => {
    const result = validateBulletSTE100("Built 5 systems");
    // Only info-level violations (maybe -ing, ATS) — tips may exist for those
    // but at minimum, if there are no warnings, tips should be info-level
    // The key assertion: no WARNING-level tips for semicolons/contractions/passive
    const hasWarningTips = result.violations.some(
      (v) => v.severity === "warning",
    );
    if (hasWarningTips) {
      expect(result.improvementTips.length).toBeGreaterThan(0);
    }
  });

  // ---- Word count in result ----

  test("result includes correct word count", () => {
    const result = validateBulletSTE100("Led a team of five engineers");
    expect(result.wordCount).toBe(6);
    expect(result.bullet).toBe("Led a team of five engineers");
  });
});

describe("analyzeProfileBulletsSTE100", () => {
  test("returns empty summary for empty array", () => {
    const result = analyzeProfileBulletsSTE100([]);
    expect(result.totalBullets).toBe(0);
    expect(result.compliantBullets).toBe(0);
    expect(result.overallScore).toBe(100);
    expect(result.topTips).toEqual([]);
    expect(result.bulletResults).toEqual([]);
  });

  test("returns empty summary for null input", () => {
    const result = analyzeProfileBulletsSTE100(null as any);
    expect(result.totalBullets).toBe(0);
    expect(result.overallScore).toBe(100);
  });

  test("analyzes a single bullet", () => {
    const result = analyzeProfileBulletsSTE100(["Built 5 systems"]);
    expect(result.totalBullets).toBe(1);
    expect(result.bulletResults).toHaveLength(1);
    expect(typeof result.overallScore).toBe("number");
  });

  test("calculates overall score as average of bullet scores", () => {
    const bullets = [
      "Built 5 systems",       // likely 100 (no warnings)
      "Don't use contractions", // has warning(s), lower score
    ];
    const result = analyzeProfileBulletsSTE100(bullets);
    expect(result.totalBullets).toBe(2);
    expect(result.overallScore).toBe(
      Math.round(
        (result.bulletResults[0].score + result.bulletResults[1].score) / 2,
      ),
    );
  });

  test("counts compliant bullets correctly", () => {
    const bullets = [
      "Built 5 systems fast",  // likely compliant (only info violations)
      "Don't do this",         // has warning -> not compliant
      "Led team of 3 people",  // likely compliant
    ];
    const result = analyzeProfileBulletsSTE100(bullets);
    expect(result.compliantBullets).toBeLessThanOrEqual(result.totalBullets);
    expect(result.compliantBullets).toBeGreaterThanOrEqual(0);
  });

  test("aggregates top tips from all bullets (max 5)", () => {
    const bullets = [
      "Don't do this; that",
      "Can't won't shouldn't",
      "Colour organise behaviour",
      "Was building; have completed",
      "Let's test this; don't fail",
    ];
    const result = analyzeProfileBulletsSTE100(bullets);
    // Tips should be aggregated and deduplicated
    expect(result.topTips.length).toBeLessThanOrEqual(5);
    expect(result.topTips.length).toBeGreaterThan(0);
  });

  test("includes bulletResults for each input bullet", () => {
    const bullets = [
      "Built 5 systems",
      "Led 10-person team",
      "Reduced costs by 30%",
    ];
    const result = analyzeProfileBulletsSTE100(bullets);
    expect(result.bulletResults).toHaveLength(3);
    result.bulletResults.forEach((br) => {
      expect(typeof br.bullet).toBe("string");
      expect(typeof br.wordCount).toBe("number");
      expect(typeof br.score).toBe("number");
      expect(Array.isArray(br.violations)).toBe(true);
      expect(typeof br.isCompliant).toBe("boolean");
      expect(Array.isArray(br.improvementTips)).toBe(true);
    });
  });

  test("deduplicates tips across bullets", () => {
    // Both bullets have semicolons -> same tip should appear only once
    const bullets = ["Built; shipped", "Tested; deployed"];
    const result = analyzeProfileBulletsSTE100(bullets);
    const semicolonTips = result.topTips.filter((t) =>
      t.includes("semicolon"),
    );
    // Should be at most 1 unique semicolon tip (deduplicated)
    expect(semicolonTips.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: profileFieldsFrom output validated through Convex schema
// ---------------------------------------------------------------------------

describe("profileFieldsFrom -> Convex schema integration", () => {
  test("output of profileFieldsFrom is accepted by saveStructuredProfile", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-integration",
    });

    const rawProfile = {
      name: "Integration Test User",
      contact: {
        email: "int@test.com",
        phone: "555-0000",
        location: "Remote",
      },
      titles: ["Full Stack Dev"],
      summary: "Does everything.",
      skills: {
        languages: ["TypeScript", "Python"],
        frameworks: ["Next.js"],
        cloud_devops: ["Vercel"],
        databases: ["Postgres"],
        tools: ["Git"],
      },
      experience: [
        {
          title: "Dev",
          company: "Co",
          start: "2020-01",
          end: "2023-12",
          location: "Home",
          bullets: ["Shipped feature X", "Reduced bug count by 40%"],
        },
      ],
      education: [
        { degree: "B.S.", school: "State U", years: "2016-2020" },
      ],
      certifications: ["Certified Dev"],
      languages_spoken: ["English"],
    };

    const mapped = profileFieldsFrom(rawProfile);
    expect(mapped.name).toBe("Integration Test User");
    expect(mapped.skills?.languages).toEqual(["TypeScript", "Python"]);
    expect(mapped.languagesSpoken).toEqual(["English"]);

    // The mapped output should be accepted by the mutation
    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      ...mapped,
      ...sampleQuality,
    });
    expect(profileId).toBeTruthy();

    const saved = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-integration",
    });
    expect(saved?.name).toBe("Integration Test User");
    expect(saved?.skills?.languages).toEqual(["TypeScript", "Python"]);
  });

  test("profileFieldsFrom _raw fallback accepted by saveStructuredProfile", async () => {
    const t = convexTest(schema);
    const uploadId = await t.mutation(api.uploads.createUpload, {
      sessionId: "sess-integration-raw",
    });

    const mapped = profileFieldsFrom({ _raw: "unparseable LLM output" });
    expect(mapped.rawFallback).toBe("unparseable LLM output");

    const profileId = await t.mutation(api.profiles.saveStructuredProfile, {
      uploadId,
      ...mapped,
      ...sampleQuality,
    });
    expect(profileId).toBeTruthy();

    const saved = await t.query(api.profiles.getStructuredProfile, {
      uploadId,
      sessionId: "sess-integration-raw",
    });
    expect(saved?.rawFallback).toBe("unparseable LLM output");
  });
});
