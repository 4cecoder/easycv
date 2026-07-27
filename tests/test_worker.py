#!/usr/bin/env python3
"""
Tests for worker.py's profile field mapping.

worker.py's profile_fields_from() mirrors web/lib/profileMapping.ts's
profileFieldsFrom() by hand (Python vs TypeScript, no shared implementation
-- see backlog.json's async-job-queue-architecture "known_gaps"). The two
must produce equivalent shapes for the SAME reason the TS version has its
own defensive coercion: Convex's saveStructuredProfile mutation validates
strictly against convex/schema.ts, and LLM output is untrusted/loosely
typed.

This suite exists because of a real bug caught only by actually running
the worker against a live LLM response, not by code review: Python's None
serializes to JSON null, but Convex's v.optional(v.string()) accepts a
missing key or a string -- NOT an explicit null. JavaScript's undefined
(which the TS mapper relies on) gets silently dropped by JSON.stringify
before reaching Convex; Python's None does not get dropped the same way
unless the mapping code explicitly omits the key. Every test below that
checks a key is "not in" the output (rather than "is None") is guarding
against that exact class of bug recurring.

Run with:
    python -m unittest test_worker.py -v
"""

import unittest

from worker import profile_fields_from


class TestProfileFieldsFrom(unittest.TestCase):
    def test_raw_fallback_shape(self):
        result = profile_fields_from({"_raw": "not valid json"})
        self.assertEqual(result, {"rawFallback": "not valid json"})

    def test_raw_fallback_non_string_value_is_stringified(self):
        result = profile_fields_from({"_raw": {"nested": True}})
        self.assertIn("rawFallback", result)
        self.assertIsInstance(result["rawFallback"], str)

    def test_invalid_payload_shapes(self):
        for bad in (None, "oops", 42, ["a", "list"]):
            with self.subTest(bad=bad):
                self.assertEqual(
                    profile_fields_from(bad), {"rawFallback": "invalid profile payload"}
                )

    def test_full_profile_maps_every_field(self):
        profile = {
            "name": "Alice Smith",
            "contact": {"email": "alice@example.com", "phone": "555-1234"},
            "titles": ["Software Engineer"],
            "summary": "Builds things.",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["FastAPI"],
                "cloud_devops": [],
                "databases": [],
                "tools": [],
            },
            "experience": [
                {
                    "title": "Engineer",
                    "company": "Acme",
                    "start": "2020",
                    "end": "2023",
                    "bullets": ["Built X"],
                }
            ],
            "education": [{"degree": "BS", "school": "State U", "years": "2019"}],
            "certifications": ["AWS Certified"],
            "languages_spoken": ["English", "French"],
        }
        result = profile_fields_from(profile)
        self.assertEqual(result["name"], "Alice Smith")
        self.assertEqual(result["contact"], {"email": "alice@example.com", "phone": "555-1234"})
        self.assertEqual(result["titles"], ["Software Engineer"])
        self.assertEqual(result["skills"]["languages"], ["Python", "Go"])
        self.assertEqual(result["experience"][0]["title"], "Engineer")
        self.assertEqual(result["education"][0]["degree"], "BS")
        # languages_spoken -> languagesSpoken rename, matching the TS mapper.
        self.assertEqual(result["languagesSpoken"], ["English", "French"])
        self.assertNotIn("languages_spoken", result)

    def test_missing_optional_fields_are_omitted_not_null(self):
        # Regression test for the actual bug caught live: a null-valued
        # optional field is rejected by Convex's v.optional(v.string())
        # validator (ArgumentValidationError: value does not match
        # validator). Every assertion here checks the key is ABSENT, not
        # that it equals None -- an explicit None/null would still fail
        # exactly the way this did in production before the fix.
        profile = {
            "name": "Bob",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "bullets": []}],  # company/start/end/location missing
            "education": [{"degree": "BS"}],  # school/years missing
        }
        result = profile_fields_from(profile)

        exp_entry = result["experience"][0]
        self.assertEqual(exp_entry["title"], "Engineer")
        for key in ("company", "start", "end", "location"):
            self.assertNotIn(key, exp_entry, f"{key!r} must be omitted, not null")

        edu_entry = result["education"][0]
        self.assertEqual(edu_entry["degree"], "BS")
        for key in ("school", "years"):
            self.assertNotIn(key, edu_entry, f"{key!r} must be omitted, not null")

    def test_explicit_null_values_in_llm_response_are_omitted(self):
        # Same bug, different entry point: the LLM response itself can
        # contain explicit JSON nulls (LLM_CONSOLIDATE_SYSTEM's own
        # instructions say "output null ... if a field is not found"),
        # not just missing keys.
        profile = {
            "name": "Carol",
            "skills": {"languages": []},
            "experience": [
                {"title": None, "company": None, "start": None, "end": None, "bullets": []}
            ],
            "education": [{"degree": None, "school": None, "years": None}],
        }
        result = profile_fields_from(profile)

        exp_entry = result["experience"][0]
        for key in ("title", "company", "start", "end"):
            self.assertNotIn(key, exp_entry)
        self.assertEqual(exp_entry["bullets"], [])

        edu_entry = result["education"][0]
        for key in ("degree", "school", "years"):
            self.assertNotIn(key, edu_entry)

    def test_top_level_missing_fields_are_omitted(self):
        result = profile_fields_from({"skills": {}, "experience": []})
        for key in ("name", "contact", "titles", "summary", "certifications", "languagesSpoken"):
            self.assertNotIn(key, result)

    def test_non_dict_entries_in_lists_are_skipped(self):
        profile = {
            "skills": {},
            "experience": ["not a dict", {"title": "Real Entry", "bullets": []}, None],
            "education": [42, {"degree": "BS"}],
        }
        result = profile_fields_from(profile)
        self.assertEqual(len(result["experience"]), 1)
        self.assertEqual(result["experience"][0]["title"], "Real Entry")
        self.assertEqual(len(result["education"]), 1)
        self.assertEqual(result["education"][0]["degree"], "BS")

    def test_contact_drops_empty_and_null_subfields(self):
        profile = {
            "skills": {},
            "contact": {"email": "a@b.com", "phone": None, "location": "", "linkedin": None},
        }
        result = profile_fields_from(profile)
        self.assertEqual(result["contact"], {"email": "a@b.com"})

    def test_malformed_skills_shape_does_not_crash(self):
        result = profile_fields_from({"skills": "not a dict"})
        self.assertNotIn("skills", result)


class TestProfileFieldsFromEdgeCases(unittest.TestCase):
    """Edge cases: empty dicts/lists, all-fields-present vs all-missing."""

    def test_skills_empty_sublists(self):
        profile = {
            "skills": {
                "languages": [],
                "frameworks": [],
                "cloud_devops": [],
                "databases": [],
                "tools": [],
            },
            "experience": [],
        }
        result = profile_fields_from(profile)
        self.assertEqual(result["skills"]["languages"], [])
        self.assertEqual(result["skills"]["frameworks"], [])

    def test_experience_all_fields_present(self):
        profile = {
            "skills": {},
            "experience": [
                {
                    "title": "Senior Engineer",
                    "company": "BigCorp",
                    "start": "2018",
                    "end": "2024",
                    "location": "Remote",
                    "bullets": ["Led team"],
                }
            ],
        }
        result = profile_fields_from(profile)
        exp = result["experience"][0]
        self.assertEqual(exp["title"], "Senior Engineer")
        self.assertEqual(exp["company"], "BigCorp")
        self.assertEqual(exp["start"], "2018")
        self.assertEqual(exp["end"], "2024")
        self.assertEqual(exp["location"], "Remote")
        self.assertEqual(exp["bullets"], ["Led team"])

    def test_experience_all_fields_missing(self):
        profile = {
            "skills": {},
            "experience": [{"bullets": []}],
        }
        result = profile_fields_from(profile)
        exp = result["experience"][0]
        self.assertEqual(exp["bullets"], [])
        for key in ("title", "company", "start", "end", "location"):
            self.assertNotIn(key, exp)

    def test_education_all_fields_present(self):
        profile = {
            "skills": {},
            "education": [
                {"degree": "PhD", "school": "MIT", "years": "2015-2020"}
            ],
        }
        result = profile_fields_from(profile)
        edu = result["education"][0]
        self.assertEqual(edu["degree"], "PhD")
        self.assertEqual(edu["school"], "MIT")
        self.assertEqual(edu["years"], "2015-2020")

    def test_education_all_fields_missing(self):
        profile = {
            "skills": {},
            "education": [{}],
        }
        result = profile_fields_from(profile)
        edu = result["education"][0]
        for key in ("degree", "school", "years"):
            self.assertNotIn(key, edu)

    def test_certifications_empty_list(self):
        profile = {
            "skills": {},
            "experience": [],
            "certifications": [],
        }
        result = profile_fields_from(profile)
        # Empty list passes _as_str_list (returns []), which is not None,
        # so it IS present in the output (unlike None-valued optional fields).
        self.assertIn("certifications", result)
        self.assertEqual(result["certifications"], [])

    def test_languages_spoken_empty_list(self):
        profile = {
            "skills": {},
            "experience": [],
            "languages_spoken": [],
        }
        result = profile_fields_from(profile)
        # Same logic: [] is not None, so it IS present.
        self.assertIn("languagesSpoken", result)
        self.assertEqual(result["languagesSpoken"], [])

    def test_empty_dict_input(self):
        result = profile_fields_from({})
        self.assertEqual(result, {})

    def test_empty_lists_for_experience_and_education(self):
        profile = {
            "skills": {},
            "experience": [],
            "education": [],
        }
        result = profile_fields_from(profile)
        self.assertEqual(result["experience"], [])
        self.assertEqual(result["education"], [])


if __name__ == "__main__":
    unittest.main()
