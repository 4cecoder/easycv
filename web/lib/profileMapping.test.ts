import { describe, expect, test } from "vitest";
import { profileFieldsFrom } from "./profileMapping";

describe("profileFieldsFrom", () => {
  test("maps a well-formed consolidate-stdin profile, renaming languages_spoken", () => {
    const fields = profileFieldsFrom({
      name: "Jane Doe",
      contact: { email: "jane@example.com", phone: "" },
      titles: ["Software Engineer"],
      summary: "Backend engineer.",
      skills: { languages: ["Python"], frameworks: [], tools: ["git"] },
      experience: [
        { title: "Engineer", company: "Acme", bullets: ["Built X", 42] },
      ],
      education: [{ degree: "BS CS", school: "State U" }],
      certifications: ["AWS SAA"],
      languages_spoken: ["English", "Spanish"],
    });

    expect(fields.name).toBe("Jane Doe");
    expect(fields.contact).toEqual({ email: "jane@example.com" });
    expect(fields.skills).toEqual({
      languages: ["Python"],
      frameworks: [],
      cloud_devops: [],
      databases: [],
      tools: ["git"],
    });
    expect(fields.experience).toEqual([
      { title: "Engineer", company: "Acme", start: undefined, end: undefined, location: undefined, bullets: ["Built X"] },
    ]);
    expect(fields.education).toEqual([{ degree: "BS CS", school: "State U", years: undefined }]);
    expect(fields.certifications).toEqual(["AWS SAA"]);
    expect(fields.languagesSpoken).toEqual(["English", "Spanish"]);
    expect(fields.rawFallback).toBeUndefined();
  });

  test("falls back to rawFallback for the _raw shape without mapping other fields", () => {
    const fields = profileFieldsFrom({ _raw: "not json, sorry" });
    expect(fields).toEqual({ rawFallback: "not json, sorry" });
  });

  test("defaults missing experience bullets/skills categories to empty arrays, not undefined", () => {
    const fields = profileFieldsFrom({
      name: "Bob",
      skills: { languages: ["Go"] },
      experience: [{ title: "Dev" }],
    });
    expect(fields.skills?.frameworks).toEqual([]);
    expect(fields.experience?.[0].bullets).toEqual([]);
  });

  test("handles a completely malformed (non-object) payload", () => {
    expect(profileFieldsFrom(null)).toEqual({ rawFallback: "invalid profile payload" });
    expect(profileFieldsFrom("oops")).toEqual({ rawFallback: "invalid profile payload" });
  });
});
