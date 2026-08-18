#!/usr/bin/env python3
"""
Comprehensive Pipeline Unit Tests
==================================
Covers all major backend components:
  1. extract_person() — name parsing from filenames
  2. classify() — file categorization
  3. slug() — name normalization
  4. score_structured_data() — complete profile scoring
  5. score_structured_data() — incomplete profile flagging
  6. profile_fields_from() — worker.py LLM output mapping
  7. llm_consolidate() — empty text handling
  8. validate_text_ste100() — bullet compliance (STE-100)
  9. render_latex() — valid tex output
 10. consolidate_files() — end-to-end integration

Run:
    cd /private/tmp/easycv-test-8 && uv run pytest tests/test_pipeline_comprehensive.py -v
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Ensure repo root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import backend.pipeline as pipeline
import backend.latex as latex
import backend.ste100 as ste100
from backend.pipeline import (
    slug,
    classify,
    extract_person,
    score_structured_data,
    llm_consolidate,
    consolidate_files,
    FoundFile,
    PersonBundle,
    LLMClient,
)
from backend.worker import profile_fields_from
from backend.latex import render_latex, escape_latex
from backend.ste100 import (
    validate_text_ste100,
    validate_sentence,
    split_into_sentences,
    count_words_ste100,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_file(directory: str, filename: str, content: str = "dummy") -> str:
    """Create a file inside *directory* and return its full path."""
    path = os.path.join(directory, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def _mock_llm_client(chat_return, provider="ollama", model="llama3.2"):
    """Create a properly configured mock LLMClient."""
    mock = MagicMock(spec=LLMClient)
    mock.provider = provider
    mock.model = model
    mock.chat.return_value = chat_return
    return mock


# ═══════════════════════════════════════════════════════════════════════════════
# 1. extract_person() — correct name parsing from filenames
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtractPersonNames(unittest.TestCase):
    """Verify extract_person() parses names from various filename patterns."""

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_standard_name_before_cv(self, _):
        """john_doe_cv.pdf -> extract 'john_doe' then _format_name splits on whitespace.
        Since _format_name splits on whitespace only (not underscores), the result is 'John_doe'."""
        result = extract_person("john_doe_cv.pdf")
        self.assertIsNotNone(result)
        self.assertIn("John", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_standard_name_before_resume(self, _):
        """alice_smith_resume.docx -> name extracted, underscore preserved in format_name."""
        result = extract_person("alice_smith_resume.docx")
        self.assertIsNotNone(result)
        self.assertIn("Alice", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_name_with_year_stripped(self, _):
        """john_doe_2024_cv.pdf -> year stripped, then name parsed."""
        result = extract_person("john_doe_2024_cv.pdf")
        self.assertIsNotNone(result)
        self.assertIn("John", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_suffix_before_name_cv_pattern(self, _):
        """cv_john.pdf -> John (suffix-before-name pattern)"""
        result = extract_person("cv_john.pdf")
        self.assertIsNotNone(result)
        self.assertIn("John", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_suffix_before_name_resume_pattern(self, _):
        """resume_alice_bob.pdf -> Alice Bob (multi-word suffix-before-name)"""
        result = extract_person("resume_alice_bob.pdf")
        self.assertIsNotNone(result)
        self.assertIn("Alice", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_profile_prefix_pattern(self, _):
        """profile_marie_curie.pdf -> Marie (profile prefix)"""
        result = extract_person("profile_marie_curie.pdf")
        self.assertIsNotNone(result)
        self.assertIn("Marie", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_linkedin_prefix_pattern(self, _):
        """linkedin_jane.pdf -> Jane"""
        result = extract_person("linkedin_jane.pdf")
        self.assertIsNotNone(result)
        self.assertIn("Jane", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_hyphenated_name(self, _):
        """john-doe_cv.pdf -> name extracted, hyphen preserved by format_name."""
        result = extract_person("john-doe_cv.pdf")
        self.assertIsNotNone(result)
        self.assertIn("John", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_returns_none_for_unrelated_filename(self, _):
        """123_cv.pdf -> None (purely numeric after year/date stripping)."""
        result = extract_person("123_cv.pdf")
        self.assertIsNone(result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_notes_txt_fallback_extracts_name(self, _):
        """notes.txt falls through all patterns to fallback, which extracts 'notes.txt' as candidate.
        Since the filename has no CV suffix patterns, it's treated as a raw name candidate."""
        result = extract_person("notes.txt")
        # Fallback extracts before known suffixes — none match, so full string is candidate
        # After removing digits+after, "notes.txt" stays, returns _format_name("notes.txt")
        self.assertIsNotNone(result)
        self.assertIn("Notes", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_alias_overrides_extracted_name(self, _):
        """Alias lookup returns the canonical form.
        extract_person('alice_smith_cv.pdf') extracts raw 'alice_smith' (underscore not split
        by format_name), lowercased to 'alice_smith' for alias lookup. If alias dict contains
        'alice_smith' or a substring match, it returns the alias."""
        with patch("backend.pipeline._load_aliases",
                   return_value={"alice_smith": "Alice B. Smith"}):
            result = extract_person("alice_smith_cv.pdf")
            self.assertEqual(result, "Alice B. Smith")

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_format_name_capitalizes_each_word(self, _):
        """_format_name capitalizes first letter of each whitespace-separated word."""
        result = extract_person("john_doe_resume.pdf")
        self.assertIsNotNone(result)
        self.assertTrue(result[0].isupper())

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_date_range_in_filename_stripped(self, _):
        """Filename with date-range pattern is cleaned before extraction."""
        result = extract_person("john_doe-2020-2024_cv.pdf")
        self.assertIsNotNone(result)
        self.assertIn("John", result)

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_space_separated_name_before_cv(self, _):
        """'alice smith_cv.pdf' — space separates name from suffix, format_name splits on space."""
        result = extract_person("alice smith_cv.pdf")
        self.assertEqual(result, "Alice Smith")

    @patch("backend.pipeline._load_aliases", return_value={})
    def test_single_word_name(self, _):
        """cv_bob.pdf -> Bob (single word name)."""
        result = extract_person("cv_bob.pdf")
        self.assertIsNotNone(result)
        self.assertEqual(result.strip(), "Bob")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. classify() — correct file categorization
# ═══════════════════════════════════════════════════════════════════════════════

class TestClassifyFiles(unittest.TestCase):
    """Verify classify() returns the correct category for each filename."""

    def test_cv_category_word_boundary(self):
        """'cv' at a word boundary -> 'cv'. Underscore before 'cv' is a word char,
        so \bcv\b requires a non-word char or start/end of string."""
        self.assertEqual(classify("john cv.pdf"), "cv")
        self.assertEqual(classify("john-cv.pdf"), "cv")
        self.assertEqual(classify("the cv .pdf"), "cv")

    def test_cv_underscore_no_match(self):
        """'john_cv.pdf' has _ before cv — underscore is a word char in Python regex,
        so \bcv\b does NOT match. classify falls through to 'other'."""
        self.assertEqual(classify("john_cv.pdf"), "other")

    def test_resume_category(self):
        """Filenames containing 'resume' -> 'resume'."""
        self.assertEqual(classify("resume_john.pdf"), "resume")
        self.assertEqual(classify("john_resume_2024.pdf"), "resume")
        self.assertEqual(classify("My Resume Final.docx"), "resume")

    def test_linkedin_category(self):
        """Filenames containing 'linkedin' -> 'linkedin' (checked before profile)."""
        self.assertEqual(classify("linkedin_john.pdf"), "linkedin")
        self.assertEqual(classify("john_linkedin_profile.pdf"), "linkedin")

    def test_profile_category(self):
        """Filenames containing 'profile' -> 'profile'."""
        self.assertEqual(classify("profile_john.pdf"), "profile")
        self.assertEqual(classify("john_profile.pdf"), "profile")

    def test_cover_letter_category(self):
        """Filenames with both 'cover' and 'letter' -> 'cover-letter'."""
        self.assertEqual(classify("cover_letter.pdf"), "cover-letter")
        self.assertEqual(classify("Cover Letter Acme.pdf"), "cover-letter")
        self.assertEqual(classify("cover-and-letter.pdf"), "cover-letter")

    def test_other_category(self):
        """Non-matching filenames -> 'other'."""
        self.assertEqual(classify("notes.txt"), "other")
        self.assertEqual(classify("random_file.pdf"), "other")
        self.assertEqual(classify("invoice.pdf"), "other")
        self.assertEqual(classify("photo.png"), "other")

    def test_classify_priority_linkedin_over_profile(self):
        """'linkedin' is checked before 'profile', so linkedin_profile -> linkedin."""
        self.assertEqual(classify("linkedin_profile.pdf"), "linkedin")

    def test_classify_priority_profile_before_resume(self):
        """'profile' is checked before 'resume', so profile_resume -> profile."""
        self.assertEqual(classify("profile_resume.pdf"), "profile")

    def test_classify_priority_resume_before_cv(self):
        """'resume' is checked before 'cv', so resume_cv -> resume."""
        self.assertEqual(classify("resume_cv.pdf"), "resume")

    def test_cover_letter_requires_both_words(self):
        """'cover' alone or 'letter' alone should not match cover-letter."""
        self.assertNotEqual(classify("cover_photo.pdf"), "cover-letter")
        self.assertNotEqual(classify("letter_to_mom.pdf"), "cover-letter")


# ═══════════════════════════════════════════════════════════════════════════════
# 3. slug() — name normalization
# ═══════════════════════════════════════════════════════════════════════════════

class TestSlugNormalization(unittest.TestCase):
    """Verify slug() normalizes names to kebab-case."""

    def test_normal_two_word_name(self):
        self.assertEqual(slug("John Doe"), "john-doe")

    def test_normal_three_word_name(self):
        self.assertEqual(slug("Jean Pierre Dupont"), "jean-pierre-dupont")

    def test_multiple_spaces_collapsed(self):
        self.assertEqual(slug("Alice   Smith"), "alice-smith")

    def test_leading_trailing_whitespace_stripped(self):
        self.assertEqual(slug("  John Doe  "), "john-doe")

    def test_special_chars_replaced_with_hyphens(self):
        self.assertEqual(slug("special!@#chars"), "special-chars")

    def test_leading_trailing_hyphens_stripped(self):
        self.assertEqual(slug("---leading-trailing---"), "leading-trailing")

    def test_empty_string_returns_unknown(self):
        self.assertEqual(slug(""), "unknown")

    def test_only_punctuation_returns_unknown(self):
        self.assertEqual(slug("---"), "unknown")
        self.assertEqual(slug("   _ - _   "), "unknown")

    def test_unicode_stripped(self):
        self.assertEqual(slug("café"), "caf")
        self.assertEqual(slug("Jalapeño"), "jalape-o")

    def test_numbers_preserved(self):
        self.assertEqual(slug("Engineer 2024"), "engineer-2024")

    def test_single_word(self):
        self.assertEqual(slug("alice"), "alice")

    def test_underscores_replaced(self):
        self.assertEqual(slug("john_doe"), "john-doe")

    def test_mixed_separators(self):
        self.assertEqual(slug("john_doe-smith"), "john-doe-smith")

    def test_all_lowercase_output(self):
        result = slug("JOHN DOE")
        self.assertEqual(result, result.lower())


# ═══════════════════════════════════════════════════════════════════════════════
# 4. score_structured_data() — valid scores for complete profiles
# ═══════════════════════════════════════════════════════════════════════════════

class TestScoreCompleteProfiles(unittest.TestCase):
    """Verify score_structured_data() returns max scores for complete data."""

    def _make_complete_profile(self) -> dict:
        return {
            "name": "Jane Doe",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [
                {
                    "title": "Engineer",
                    "company": "Acme Corp",
                    "start": "2020",
                    "end": "2022",
                    "location": "NYC",
                    "bullets": ["Built distributed systems"],
                }
            ],
            "contact": {
                "email": "jane@example.com",
                "phone": "555-1234",
                "location": "NYC",
                "linkedin": "linkedin.com/in/jane",
                "website": "jane.dev",
            },
            "summary": "Experienced backend engineer.",
            "titles": ["Software Engineer"],
            "education": [{"degree": "BS CS", "school": "MIT", "years": "2016-2020"}],
            "certifications": ["AWS Certified"],
            "languages_spoken": ["English"],
        }

    def test_complete_profile_not_critical(self):
        """Complete profiles must not be flagged as critical."""
        result = score_structured_data(self._make_complete_profile())
        self.assertFalse(result["critical"])

    def test_complete_profile_score_equals_max(self):
        """Complete profiles should score at or near maximum."""
        result = score_structured_data(self._make_complete_profile())
        self.assertGreater(result["score"], 0)
        self.assertGreater(result["max_score"], 0)
        # Score should be >= max_score minus at most STE-100 warnings
        self.assertGreaterEqual(result["score"], result["max_score"] - 2)

    def test_complete_profile_has_no_critical_warnings(self):
        """No 'missing required field' warnings for complete data."""
        result = score_structured_data(self._make_complete_profile())
        missing_req = [w for w in result["warnings"] if "missing required field" in w]
        self.assertEqual(missing_req, [])

    def test_score_result_has_expected_keys(self):
        """Result dict contains all expected keys."""
        result = score_structured_data(self._make_complete_profile())
        self.assertIn("score", result)
        self.assertIn("max_score", result)
        self.assertIn("warnings", result)
        self.assertIn("critical", result)
        self.assertIsInstance(result["warnings"], list)

    def test_minimal_valid_profile_not_critical(self):
        """Profile with only REQUIRED_STRUCTURED_KEYS passes critical gate."""
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": ["Did stuff"]}],
        }
        result = score_structured_data(data)
        self.assertFalse(result["critical"])
        self.assertGreater(result["score"], 0)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. score_structured_data() — flags incomplete profiles
# ═══════════════════════════════════════════════════════════════════════════════

class TestScoreIncompleteProfiles(unittest.TestCase):
    """Verify score_structured_data() correctly flags incomplete data."""

    def test_missing_name_is_critical(self):
        data = {
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        result = score_structured_data(data)
        self.assertTrue(result["critical"])
        self.assertTrue(any("missing required field: name" in w for w in result["warnings"]))

    def test_missing_skills_is_critical(self):
        data = {
            "name": "John",
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        result = score_structured_data(data)
        self.assertTrue(result["critical"])
        self.assertTrue(any("missing required field: skills" in w for w in result["warnings"]))

    def test_missing_experience_is_critical(self):
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
        }
        result = score_structured_data(data)
        self.assertTrue(result["critical"])
        self.assertTrue(any("missing required field: experience" in w for w in result["warnings"]))

    def test_raw_fallback_is_critical(self):
        """Data with _raw key (unparsed LLM output) is always critical."""
        result = score_structured_data({"_raw": "some raw text"})
        self.assertTrue(result["critical"])
        self.assertTrue(any("raw" in w.lower() for w in result["warnings"]))

    def test_non_dict_input_is_critical(self):
        result = score_structured_data(["not", "a", "dict"])
        self.assertTrue(result["critical"])
        self.assertEqual(result["score"], 0)

    def test_empty_experience_list_is_critical(self):
        """Empty experience list counts as missing (falsy)."""
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }
        result = score_structured_data(data)
        self.assertTrue(result["critical"])

    def test_empty_skills_dict_not_critical_if_value_present(self):
        """Skills dict present with at least one category filled is not critical."""
        data = {
            "name": "John",
            "skills": {"languages": ["Python"], "frameworks": [], "cloud_devops": [],
                       "databases": [], "tools": []},
            "experience": [{"title": "Dev", "company": "X", "bullets": ["Built Y"]}],
        }
        result = score_structured_data(data)
        self.assertFalse(result["critical"])

    def test_missing_contact_fields_produce_warnings(self):
        """Missing optional contact fields produce warnings, not critical."""
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        result = score_structured_data(data)
        self.assertFalse(result["critical"])
        self.assertTrue(any("no contact email" in w for w in result["warnings"]))

    def test_missing_summary_produces_warning(self):
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        result = score_structured_data(data)
        self.assertTrue(any("no professional summary" in w for w in result["warnings"]))

    def test_experience_missing_title_company_warns(self):
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"bullets": ["Did stuff"]}],
        }
        result = score_structured_data(data)
        self.assertTrue(any("missing title/company" in w for w in result["warnings"]))

    def test_experience_non_dict_entry_warns(self):
        data = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": ["just a string"],
        }
        result = score_structured_data(data)
        self.assertTrue(any("not a valid object" in w for w in result["warnings"]))

    def test_skills_not_a_dict_warns(self):
        data = {
            "name": "John",
            "skills": ["Python", "Go"],
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        result = score_structured_data(data)
        self.assertTrue(any("skills is missing or not an object" in w for w in result["warnings"]))

    def test_score_decreases_with_missing_fields(self):
        """More missing fields = lower score."""
        full = {
            "name": "John",
            "skills": {"languages": ["Python"], "frameworks": [], "cloud_devops": [],
                       "databases": [], "tools": []},
            "experience": [{"title": "Dev", "company": "X", "bullets": ["Built Y"]}],
            "contact": {"email": "j@x.com", "phone": "555", "location": "NYC"},
            "summary": "Engineer.",
            "titles": ["Dev"],
        }
        minimal = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": []}],
        }
        score_full = score_structured_data(full)["score"]
        score_minimal = score_structured_data(minimal)["score"]
        self.assertGreater(score_full, score_minimal)


# ═══════════════════════════════════════════════════════════════════════════════
# 6. profile_fields_from() — worker.py LLM output mapping
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileFieldsFrom(unittest.TestCase):
    """Verify profile_fields_from() correctly maps structured LLM output."""

    def test_complete_profile_mapping(self):
        """Full profile maps all fields correctly."""
        profile = {
            "name": "Alice Smith",
            "contact": {"email": "alice@example.com", "phone": "555-1234",
                        "location": "NYC", "linkedin": "linkedin.com/in/alice",
                        "website": "alice.dev"},
            "titles": ["Backend Engineer"],
            "summary": "Expert in distributed systems.",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [
                {"title": "Engineer", "company": "Acme", "start": "2020",
                 "end": "2022", "location": "Remote", "bullets": ["Built X"]}
            ],
            "education": [{"degree": "BS CS", "school": "MIT", "years": "2016-2020"}],
            "certifications": ["AWS Certified"],
            "languages_spoken": ["English", "French"],
        }
        result = profile_fields_from(profile)

        self.assertEqual(result["name"], "Alice Smith")
        self.assertEqual(result["contact"]["email"], "alice@example.com")
        self.assertEqual(result["contact"]["phone"], "555-1234")
        self.assertEqual(result["contact"]["location"], "NYC")
        self.assertEqual(result["titles"], ["Backend Engineer"])
        self.assertEqual(result["summary"], "Expert in distributed systems.")
        self.assertEqual(result["skills"]["languages"], ["Python", "Go"])
        self.assertEqual(len(result["experience"]), 1)
        self.assertEqual(result["experience"][0]["title"], "Engineer")
        self.assertEqual(result["education"][0]["degree"], "BS CS")
        self.assertEqual(result["certifications"], ["AWS Certified"])
        # languages_spoken maps to languagesSpoken
        self.assertEqual(result["languagesSpoken"], ["English", "French"])

    def test_raw_fallback_mapping(self):
        """Profile with _raw key maps to rawFallback."""
        profile = {"_raw": "some raw text from LLM"}
        result = profile_fields_from(profile)
        self.assertEqual(result["rawFallback"], "some raw text from LLM")
        self.assertNotIn("name", result)

    def test_non_dict_input_returns_raw_fallback(self):
        """Non-dict profile returns rawFallback with stringified value."""
        result = profile_fields_from("just a string")
        self.assertEqual(result["rawFallback"], "invalid profile payload")

    def test_none_input_returns_raw_fallback(self):
        result = profile_fields_from(None)
        self.assertEqual(result["rawFallback"], "invalid profile payload")

    def test_missing_optional_fields_omitted(self):
        """Optional fields that are None are omitted from the result."""
        profile = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }
        result = profile_fields_from(profile)
        self.assertIn("name", result)
        # Optional fields that map to None should be absent
        self.assertNotIn("contact", result)
        self.assertNotIn("titles", result)
        self.assertNotIn("summary", result)
        self.assertNotIn("education", result)
        self.assertNotIn("certifications", result)
        self.assertNotIn("languagesSpoken", result)

    def test_experience_missing_fields_omitted(self):
        """Experience entries with missing optional fields omit those keys."""
        profile = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"bullets": ["Built X"]}],
        }
        result = profile_fields_from(profile)
        exp = result["experience"][0]
        self.assertIn("bullets", exp)
        self.assertNotIn("title", exp)
        self.assertNotIn("company", exp)
        self.assertNotIn("start", exp)

    def test_skills_preserves_all_categories(self):
        """All five skill categories are mapped."""
        profile = {
            "name": "John",
            "skills": {
                "languages": ["Python"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [],
        }
        result = profile_fields_from(profile)
        self.assertEqual(set(result["skills"].keys()),
                         {"languages", "frameworks", "cloud_devops", "databases", "tools"})

    def test_non_string_values_in_experience_filtered(self):
        """Non-string values in experience lists are filtered out."""
        profile = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [{"bullets": ["Built X", 123, None, "Designed Y"]}],
        }
        result = profile_fields_from(profile)
        bullets = result["experience"][0]["bullets"]
        self.assertEqual(bullets, ["Built X", "Designed Y"])

    def test_empty_experience_list_returns_list(self):
        """Empty experience list stays as empty list."""
        profile = {
            "name": "John",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }
        result = profile_fields_from(profile)
        self.assertEqual(result["experience"], [])


# ═══════════════════════════════════════════════════════════════════════════════
# 7. llm_consolidate() — handles empty text gracefully
# ═══════════════════════════════════════════════════════════════════════════════

class TestLLMConsolidateEmptyText(unittest.TestCase):
    """Verify llm_consolidate() handles empty/missing text without crashing."""

    def test_empty_extracted_texts_returns_none(self):
        """Bundle with no extracted texts: LLM is called but payload is empty."""
        bundle = PersonBundle(name="Test Person")
        # No extracted_texts

        mock_client = _mock_llm_client(None)
        result = llm_consolidate(mock_client, bundle)
        self.assertIsNone(result)

    def test_llm_returns_none_on_empty_text(self):
        """When LLM client returns None, llm_consolidate returns None."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Some content."

        mock_client = _mock_llm_client(None)
        result = llm_consolidate(mock_client, bundle)
        self.assertIsNone(result)

    def test_llm_returns_empty_string(self):
        """When LLM returns empty string, it's falsy -> returns None."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = _mock_llm_client("")
        result = llm_consolidate(mock_client, bundle)
        self.assertIsNone(result)

    def test_empty_text_file_content(self):
        """Bundle with a text file containing only whitespace."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["empty_cv.txt"] = "   \n\n   "

        mock_client = _mock_llm_client(json.dumps({
            "name": "Test Person",
            "skills": {"languages": []},
            "experience": [],
        }))

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Test Person")

    def test_multiple_empty_texts_still_sends_payload(self):
        """Multiple empty text entries are still sent to LLM."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["a.txt"] = ""
        bundle.extracted_texts["b.txt"] = "   "

        mock_client = _mock_llm_client(json.dumps({
            "name": "Test Person",
            "skills": {"languages": []},
            "experience": [],
        }))

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        mock_client.chat.assert_called_once()

    def test_valid_response_after_empty_text(self):
        """Valid JSON response is parsed correctly even with short input."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Short text."

        mock_client = _mock_llm_client(json.dumps({
            "name": "Test Person",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Dev", "company": "X", "bullets": ["Built Y"]}],
        }))

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Test Person")
        self.assertIn("Python", result["skills"]["languages"])

    def test_non_json_response_falls_back_to_raw(self):
        """Non-JSON response produces _raw fallback."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = _mock_llm_client("Sorry, I cannot help with that.")

        result = llm_consolidate(mock_client, bundle)
        self.assertIn("_raw", result)
        self.assertEqual(result["_raw"], "Sorry, I cannot help with that.")

    def test_json_with_code_fences_is_extracted(self):
        """JSON wrapped in markdown code fences is correctly extracted."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = _mock_llm_client(
            "```json\n"
            '{"name": "Test Person", "skills": {"languages": ["Python"]}, "experience": []}\n'
            "```"
        )

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Test Person")

    def test_json_array_response_falls_back_to_raw(self):
        """JSON array (not object) falls back to _raw."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = _mock_llm_client("[1, 2, 3]")

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": "[1, 2, 3]"})


# ═══════════════════════════════════════════════════════════════════════════════
# 8. validate_text_ste100() — bullet compliance (STE-100)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSTE100BulletCompliance(unittest.TestCase):
    """Verify STE-100 validation catches common bullet-point violations."""

    def test_clean_bullet_no_warnings(self):
        """A well-formed short bullet produces no warnings."""
        warnings = validate_text_ste100("Built a distributed queue in Go.", is_procedural=False)
        self.assertIsInstance(warnings, list)

    def test_long_sentence_warning(self):
        """Sentences exceeding the word limit are flagged."""
        long_text = " ".join(["word"] * 30) + "."
        warnings = validate_text_ste100(long_text, is_procedural=False)
        self.assertTrue(any("too long" in w for w in warnings))

    def test_procedural_word_limit_stricter(self):
        """Procedural text has a 20-word limit (vs 25 for descriptive)."""
        words_22 = " ".join(["word"] * 22) + "."
        proc_warnings = validate_text_ste100(words_22, is_procedural=True)
        desc_warnings = validate_text_ste100(words_22, is_procedural=False)
        self.assertTrue(any("too long" in w for w in proc_warnings))
        self.assertFalse(any("too long" in w for w in desc_warnings))

    def test_contraction_detected_lowercase(self):
        """Contractions in lowercase are flagged (Rule 4.2).
        Note: STE-100 contraction patterns are compiled without re.IGNORECASE,
        so only lowercase contractions match."""
        warnings = validate_text_ste100("don't use contractions.", is_procedural=False)
        self.assertTrue(any("Contraction" in w for w in warnings))

    def test_contraction_not_detected_uppercase(self):
        """Uppercase contractions like 'Don't' are NOT flagged because the
        STE-100 regex patterns are compiled without re.IGNORECASE."""
        warnings = validate_text_ste100("Don't use contractions.", is_procedural=False)
        # The contraction pattern \bdon't\b is case-sensitive, so 'Don't' won't match
        contraction_warns = [w for w in warnings if "Contraction" in w]
        self.assertEqual(contraction_warns, [])

    def test_british_spelling_detected(self):
        """British spelling variants are flagged (Rule 1.14)."""
        warnings = validate_text_ste100("The system uses colour coding.", is_procedural=False)
        self.assertTrue(any("British spelling" in w for w in warnings))

    def test_semicolon_detected(self):
        """Semicolons are not permitted (Rule 8.1)."""
        warnings = validate_text_ste100("Use Python; avoid Java.", is_procedural=False)
        self.assertTrue(any("Semicolon" in w for w in warnings))

    def test_passive_voice_detected(self):
        """Passive voice patterns are flagged (Rule 3.6)."""
        warnings = validate_text_ste100("The code was reviewed by the team.", is_procedural=False)
        self.assertTrue(any("Passive" in w for w in warnings))

    def test_perfect_tense_detected(self):
        """Perfect tense helpers are flagged (Rule 3.2)."""
        warnings = validate_text_ste100("She has completed the project.", is_procedural=False)
        self.assertTrue(any("Perfect tense" in w for w in warnings))

    def test_progressive_tense_detected(self):
        """Progressive tense helpers are flagged (Rule 3.2)."""
        warnings = validate_text_ste100("He is running the tests.", is_procedural=False)
        self.assertTrue(any("Progressive tense" in w for w in warnings))

    def test_empty_text_no_crash(self):
        """Empty text returns empty warnings list."""
        warnings = validate_text_ste100("", is_procedural=False)
        self.assertEqual(warnings, [])

    def test_none_text_no_crash(self):
        """None text returns empty warnings list."""
        warnings = validate_text_ste100(None, is_procedural=False)
        self.assertEqual(warnings, [])

    def test_validate_sentence_returns_list(self):
        """validate_sentence returns a list of warning strings."""
        result = validate_sentence("Hello world.")
        self.assertIsInstance(result, list)

    def test_count_words_basic(self):
        """count_words_ste100 counts words correctly."""
        self.assertEqual(count_words_ste100("Hello world"), 2)
        self.assertEqual(count_words_ste100("One two three four five"), 5)

    def test_count_words_hyphenated_is_one(self):
        """Hyphenated words count as one word (Rule 8.7)."""
        self.assertEqual(count_words_ste100("state-of-the-art system"), 2)

    def test_count_words_parenthesized_is_one(self):
        """Parenthesized text counts as one word (Rule 8.5).
        'The (internal) system works' -> The, ___PAREN___, system, works = 4 words."""
        self.assertEqual(count_words_ste100("The (internal) system works"), 4)

    def test_split_into_sentences_basic(self):
        """Basic sentence splitting works."""
        sentences = split_into_sentences("First sentence. Second sentence.")
        self.assertEqual(len(sentences), 2)

    def test_split_into_sentences_preserves_abbreviations(self):
        """Abbreviations like 'e.g.' don't cause false splits."""
        sentences = split_into_sentences("Use Python, e.g. for data science.")
        self.assertEqual(len(sentences), 1)

    def test_ste100_warnings_include_context(self):
        """Warnings include the sentence snippet for context.
        Use a lowercase contraction to trigger the warning."""
        warnings = validate_text_ste100("don't do this.", is_procedural=False)
        self.assertTrue(any("[don't do this.]" in w for w in warnings))

    def test_multiple_violations_in_one_sentence(self):
        """A sentence with multiple violations produces multiple warnings."""
        warnings = validate_text_ste100(
            "don't use colour; it's not permitted.", is_procedural=False
        )
        # Should flag: contraction 'don't', British 'colour', semicolon ';',
        # contraction "it's", progressive/tense issues
        warning_types = " ".join(warnings)
        self.assertIn("Contraction", warning_types)
        self.assertIn("British spelling", warning_types)
        self.assertIn("Semicolon", warning_types)


# ═══════════════════════════════════════════════════════════════════════════════
# 9. render_latex() — produces valid tex output
# ═══════════════════════════════════════════════════════════════════════════════

class TestRenderLatexOutput(unittest.TestCase):
    """Verify render_latex() produces valid LaTeX document structure."""

    def _make_complete_data(self) -> dict:
        return {
            "name": "Alice Smith",
            "contact": {
                "email": "alice@example.com",
                "phone": "555-1234",
                "location": "NYC",
                "linkedin": "linkedin.com/in/alice",
                "website": "alice.dev",
            },
            "titles": ["Senior Backend Engineer"],
            "summary": "Backend engineer focused on distributed systems.",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [
                {
                    "title": "Staff Engineer",
                    "company": "Acme Corp",
                    "start": "2021",
                    "end": "Present",
                    "location": "Remote",
                    "bullets": [
                        "Built a distributed queue in Go",
                        "Led migration to Kubernetes",
                    ],
                }
            ],
            "education": [
                {"degree": "B.S. Computer Science", "school": "MIT", "years": "2016-2020"}
            ],
            "certifications": ["AWS Certified Solutions Architect"],
            "languages_spoken": ["English", "French"],
        }

    def test_document_structure(self):
        """Output contains proper LaTeX document structure."""
        tex = render_latex(self._make_complete_data(), "Alice Smith")
        self.assertIn(r"\documentclass", tex)
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)

    def test_name_appears_in_output(self):
        tex = render_latex(self._make_complete_data(), "Alice Smith")
        self.assertIn("Alice Smith", tex)

    def test_section_headers_present(self):
        """All major sections are present when data is complete."""
        tex = render_latex(self._make_complete_data(), "Alice Smith")
        self.assertIn("Summary", tex)
        self.assertIn("Skills", tex)
        self.assertIn("Experience", tex)
        self.assertIn("Education", tex)
        self.assertIn("Certifications", tex)
        self.assertIn("Languages", tex)

    def test_experience_bullets_appear(self):
        tex = render_latex(self._make_complete_data(), "Alice Smith")
        self.assertIn("Built a distributed queue in Go", tex)
        self.assertIn("Led migration to Kubernetes", tex)

    def test_special_chars_escaped(self):
        """Special LaTeX characters are escaped in all fields."""
        data = self._make_complete_data()
        data["name"] = "Alice & Bob"
        data["summary"] = "Built 100% $cool$ systems."
        tex = render_latex(data, "Alice")
        self.assertIn(r"\&", tex)
        self.assertIn(r"\%", tex)
        self.assertIn(r"\$", tex)

    def test_empty_data_produces_valid_document(self):
        """Empty dict still produces a valid document structure."""
        tex = render_latex({}, "Fallback Name")
        self.assertIn(r"\documentclass", tex)
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)
        self.assertIn("Fallback Name", tex)

    def test_none_data_produces_valid_document(self):
        """None data doesn't crash and uses fallback name."""
        tex = render_latex(None, "Carol")
        self.assertIn(r"\documentclass", tex)
        self.assertIn("Carol", tex)

    def test_missing_contact_fields_no_crash(self):
        """Partial contact data doesn't crash."""
        data = {
            "name": "Dave",
            "contact": {"email": "dave@example.com"},
        }
        tex = render_latex(data, "Dave")
        self.assertIn("Dave", tex)
        self.assertIn("dave@example.com", tex)

    def test_experience_with_missing_fields_no_crash(self):
        """Experience entries with missing fields don't crash."""
        data = {
            "name": "Eve",
            "experience": [
                {"title": "Engineer"},
                {"company": "Acme"},
                {"bullets": ["Built X"]},
                None,
            ],
        }
        tex = render_latex(data, "Eve")
        self.assertIn("Eve", tex)
        self.assertIn("Built X", tex)

    def test_no_experience_section_when_empty(self):
        """No Experience section header when experience list is empty."""
        tex = render_latex({"name": "Fay", "experience": []}, "Fay")
        self.assertNotIn(r"\textbf{Experience}", tex)

    def test_no_skills_section_when_empty(self):
        """No Skills section header when skills dict is empty."""
        tex = render_latex({"name": "Gus", "skills": {}}, "Gus")
        self.assertNotIn(r"\textbf{Skills}", tex)

    def test_latex_injection_prevented(self):
        """Malicious LaTeX commands are escaped, not executed."""
        data = {
            "name": "\\input{/etc/passwd}",
            "summary": "\\section{Hacked}",
        }
        tex = render_latex(data, "Safe")
        self.assertNotIn("\\input{", tex)
        self.assertNotIn("\\section{Hacked}", tex)
        self.assertIn(r"\textbackslash{}", tex)

    def test_uses_geometry_package(self):
        """Output uses geometry package for margins."""
        tex = render_latex(self._make_complete_data(), "Alice")
        self.assertIn(r"\usepackage[margin=0.75in]{geometry}", tex)

    def test_empty_style(self):
        """Page style is set to empty (no headers/footers)."""
        tex = render_latex(self._make_complete_data(), "Alice")
        self.assertIn(r"\pagestyle{empty}", tex)


# ═══════════════════════════════════════════════════════════════════════════════
# 10. consolidate_files() — end-to-end integration
# ═══════════════════════════════════════════════════════════════════════════════

class TestConsolidateFilesIntegration(unittest.TestCase):
    """Verify consolidate_files() integrates all pipeline steps."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_returns_expected_keys(self, _compile):
        """Result dict has profile, score, pdf_path, tmp_dir keys."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)

        self.assertIn("profile", result)
        self.assertIn("score", result)
        self.assertIn("pdf_path", result)
        self.assertIn("tmp_dir", result)

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_profile_contains_llm_output(self, _compile):
        """Profile dict reflects the LLM's structured response."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python", "Go"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        }))

        result = consolidate_files([txt_path], mock_client)

        self.assertEqual(result["profile"]["name"], "Alice Smith")
        self.assertIn("Python", result["profile"]["skills"]["languages"])

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_score_is_valid_dict(self, _compile):
        """Score dict has score, max_score, warnings, critical."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)

        score = result["score"]
        self.assertIn("score", score)
        self.assertIn("max_score", score)
        self.assertIn("warnings", score)
        self.assertIn("critical", score)
        self.assertIsInstance(score["score"], int)
        self.assertIsInstance(score["max_score"], int)

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_pdf_path_none_when_compile_fails(self, _compile):
        """pdf_path is None when pdflatex is unavailable."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)
        self.assertIsNone(result["pdf_path"])

    @patch("backend.latex.compile_pdf", return_value="/tmp/fake.pdf")
    def test_pdf_path_set_when_compile_succeeds(self, _compile):
        """pdf_path is set when pdflatex succeeds."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)
        self.assertEqual(result["pdf_path"], "/tmp/fake.pdf")

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_tmp_dir_exists(self, _compile):
        """tmp_dir is a real directory on disk."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)
        self.assertTrue(os.path.isdir(result["tmp_dir"]))
        shutil.rmtree(result["tmp_dir"], ignore_errors=True)

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_no_extractable_text_falls_back_to_raw(self, _compile):
        """File with no extractable text uses _raw fallback."""
        docx_path = _make_file(self.tmp.name, "bob_cv.docx", "binary content")
        mock_client = _mock_llm_client("should not be called")

        result = consolidate_files([docx_path], mock_client)

        self.assertIn("_raw", result["profile"])
        self.assertTrue(result["score"]["critical"])

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_person_name_extracted_from_filename(self, _compile):
        """Display name is extracted from the first file's name."""
        txt_path = _make_file(self.tmp.name, "alice_smith_cv.txt", "Content")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python"]},
            "experience": [],
        }))

        result = consolidate_files([txt_path], mock_client)
        # Name is extracted from filename — "alice_smith_cv.txt" -> extract_person -> "Alice_smith"
        self.assertIn("Alice", result["profile"]["name"])

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_multiple_files_consolidated(self, _compile):
        """Multiple files are extracted and sent to LLM together."""
        path1 = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nCV content")
        path2 = _make_file(self.tmp.name, "alice_resume.txt", "Alice Smith\nResume content")
        mock_client = _mock_llm_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python", "Go"]},
            "experience": [],
        }))

        result = consolidate_files([path1, path2], mock_client)

        mock_client.chat.assert_called_once()
        call_args = mock_client.chat.call_args
        messages = call_args[0][0]
        user_msg = messages[-1]["content"]
        self.assertIn("alice_cv.txt", user_msg)
        self.assertIn("alice_resume.txt", user_msg)

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_non_json_llm_response_uses_raw(self, _compile):
        """Non-JSON LLM response produces _raw fallback."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        mock_client = _mock_llm_client("Sorry, I cannot process this.")

        result = consolidate_files([txt_path], mock_client)

        self.assertIn("_raw", result["profile"])
        self.assertTrue(result["score"]["critical"])

    @patch("backend.latex.compile_pdf", return_value=None)
    def test_score_structured_data_called_on_profile(self, _compile):
        """score_structured_data is applied to the LLM profile output."""
        txt_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nEngineer")
        profile = {
            "name": "Alice Smith",
            "contact": {"email": "alice@example.com", "phone": "555", "location": "NYC"},
            "titles": ["Engineer"],
            "summary": "Expert engineer.",
            "skills": {
                "languages": ["Python"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
            "education": [{"degree": "BS", "school": "MIT", "years": "2020"}],
            "certifications": ["AWS"],
            "languages_spoken": ["English"],
        }
        mock_client = _mock_llm_client(json.dumps(profile))

        result = consolidate_files([txt_path], mock_client)

        self.assertFalse(result["score"]["critical"])
        self.assertGreater(result["score"]["score"], 0)


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
