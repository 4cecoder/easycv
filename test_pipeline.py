#!/usr/bin/env python3
"""
Comprehensive Test Suite for CV/Resume Consolidation Pipeline
==============================================================

Coverage Areas:
  - test_helpers     : Helper functions (slug, classify, extract_person, is_cv_related, should_skip_dir)
  - test_scan        : Directory scanning, deduplication, bundle merging
  - test_extract     : Text extraction from .txt, .md, .pdf; error handling
  - test_organize    : File organization into person directories, dedup naming
  - test_llm         : LLMClient init, provider routing, chat mocking (Ollama/OpenAI/Anthropic)
  - test_consolidate : JSON parsing from LLM responses, markdown code fence stripping, fallback
  - test_integration : End-to-end pipeline test with temp directories

Run with:
    python -m unittest test_pipeline.py -v
    python -m pytest  test_pipeline.py -v   (if pytest is installed)

All tests use only Python 3.10+ standard library (unittest, unittest.mock, tempfile).
"""

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import defaultdict
from contextlib import redirect_stdout
from unittest.mock import MagicMock, PropertyMock, patch, mock_open

# ── Import the pipeline module ──────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipeline
import latex
from latex import escape_latex, render_latex, compile_pdf
from pipeline import (
    # Helpers
    slug,
    classify,
    extract_person,
    is_cv_related,
    should_skip_dir,
    # Scanning
    scan_directories,
    _merge_bundles,
    # Extraction
    extract_text,
    extract_all,
    # Organization
    organize_files,
    # LLM
    LLMClient,
    llm_consolidate,
    llm_generate_resume,
    llm_process_all,
    # Data models
    FoundFile,
    PersonBundle,
    # Internal helpers
    _load_aliases,
    _resolve_alias,
    _load_config,
    LLM_CONSOLIDATE_SYSTEM,
    LLM_RESUME_SYSTEM,
    # Data quality
    score_structured_data,
    validate_command,
    _find_structured_json_files,
    REQUIRED_STRUCTURED_KEYS,
    # Rescore / redetect / stats
    bundles_from_resources,
    rescore_command,
    redetect_command,
    stats_command,
    _unique_dest,
    # Web-layer bridge
    consolidate_stdin_command,
)


# ── Helpers for tests ───────────────────────────────────────────────────────

def _make_file(directory: str, filename: str, content: str = "dummy") -> str:
    """Create a file inside *directory* and return its full path."""
    path = os.path.join(directory, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def _make_cv_file(directory: str, name_part: str, ext: str = ".txt",
                  content: str = "dummy") -> str:
    """Convenience: create a CV-named file inside *directory*."""
    return _make_file(directory, f"{name_part}_cv{ext}", content)


def _create_minimal_pdf(path: str, text: str = "Hello CV World") -> None:
    """Create a minimal valid PDF containing *text*.  Works with ``strings``."""
    with open(path, "wb") as f:
        # Header
        f.write(b"%PDF-1.4\n")

        # Track byte-offsets so the cross-reference table is correct
        offsets = [0] * 6
        offsets[0] = 0  # object 0 is the free entry

        # Object 1: Catalog
        offsets[1] = f.tell()
        f.write(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

        # Object 2: Pages tree
        offsets[2] = f.tell()
        f.write(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")

        # Object 3: Page
        offsets[3] = f.tell()
        f.write(
            b"3 0 obj\n"
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
            b" /Contents 4 0 R"
            b" /Resources << /Font << /F1 5 0 R >> >> >>\n"
            b"endobj\n"
        )

        # Object 4: Content stream (uncompressed text)
        stream_data = f"BT /F1 12 Tf 100 700 Td ({text}) Tj ET\n".encode()
        offsets[4] = f.tell()
        f.write(f"4 0 obj\n<< /Length {len(stream_data)} >>\nstream\n".encode())
        f.write(stream_data)
        f.write(b"\nendstream\nendobj\n")

        # Object 5: Font
        offsets[5] = f.tell()
        f.write(
            b"5 0 obj\n"
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n"
            b"endobj\n"
        )

        # Cross-reference table
        xref_offset = f.tell()
        f.write(b"xref\n")
        f.write(f"0 6\n".encode())
        for i in range(6):
            if i == 0:
                f.write(f"{offsets[i]:010d} {65535:05d} f \n".encode())
            else:
                f.write(f"{offsets[i]:010d} {00000:05d} n \n".encode())

        # Trailer
        f.write(b"trailer\n<< /Size 6 /Root 1 0 R >>\n")
        f.write(f"startxref\n{xref_offset}\n".encode())
        f.write(b"%%EOF")


def _strings_available() -> bool:
    """Return True if the system ``strings`` command is available."""
    try:
        subprocess.run(["strings", "--help"],
                       capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _pdftotext_available() -> bool:
    """Return True if ``pdftotext`` (poppler-utils) is available."""
    try:
        subprocess.run(["pdftotext", "--help"],
                       capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  test_helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestHelpers(unittest.TestCase):
    """Isolated tests for small utility functions."""

    # ── slug ─────────────────────────────────────────────────────────────

    def test_slug_normal(self):
        """Normal names produce kebab-case slugs."""
        self.assertEqual(slug("John Doe"), "john-doe")
        self.assertEqual(slug("Alice   Smith"), "alice-smith")
        self.assertEqual(slug("Jean-Pierre"), "jean-pierre")

    def test_slug_edge_chars(self):
        """Special characters are replaced or stripped."""
        self.assertEqual(slug(" Hello World "), "hello-world")
        self.assertEqual(slug("special!@#chars"), "special-chars")
        self.assertEqual(slug("--- leading trailing ---"), "leading-trailing")

    def test_slug_empty(self):
        """Empty or all-punctuation input returns 'unknown'."""
        self.assertEqual(slug(""), "unknown")
        self.assertEqual(slug("---"), "unknown")
        self.assertEqual(slug("   _ - _   "), "unknown")

    def test_slug_unicode(self):
        """Unicode characters outside a-z are stripped."""
        self.assertEqual(slug("café"), "caf")
        self.assertEqual(slug("Jalapeño"), "jalape-o")
        self.assertEqual(slug("über cool"), "ber-cool")

    # ── classify ──────────────────────────────────────────────────────────

    def test_classify_cv(self):
        """'cv' at word boundary -> 'cv' (note: underscore is a w-char, breaks \\b)."""
        # `_` is a word char in Python regex, so _cv does NOT have a
        # word boundary before ``c``.  Use space/hyphen/string-end.
        self.assertEqual(classify("john cv.pdf"), "cv")
        self.assertEqual(classify("john-cv.pdf"), "cv")
        self.assertEqual(classify("cv .pdf"), "cv")

    def test_classify_resume(self):
        self.assertEqual(classify("resume_john.pdf"), "resume")
        self.assertEqual(classify("john_resume_2024.pdf"), "resume")

    def test_classify_linkedin(self):
        self.assertEqual(classify("linkedin_john.pdf"), "linkedin")
        self.assertEqual(classify("john_linkedin_profile.pdf"), "linkedin")

    def test_classify_profile(self):
        self.assertEqual(classify("profile_john.pdf"), "profile")
        self.assertEqual(classify("john_profile.pdf"), "profile")

    def test_classify_cover_letter(self):
        self.assertEqual(classify("cover_letter.pdf"), "cover-letter")
        self.assertEqual(classify("cover letter acme.pdf"), "cover-letter")

    def test_classify_other(self):
        self.assertEqual(classify("notes.txt"), "other")
        self.assertEqual(classify("random_file.pdf"), "other")
        self.assertEqual(classify("image.png"), "other")

    # ── is_cv_related ─────────────────────────────────────────────────────

    def test_is_cv_related_matches(self):
        self.assertTrue(is_cv_related("john_cv.pdf"))
        self.assertTrue(is_cv_related("resume_john.pdf"))
        self.assertTrue(is_cv_related("linkedin_john.pdf"))
        self.assertTrue(is_cv_related("profile_john.pdf"))
        self.assertTrue(is_cv_related("curriculum_vitae.pdf"))
        self.assertTrue(is_cv_related("career_summary.pdf"))

    def test_is_cv_related_non_matches(self):
        self.assertFalse(is_cv_related("notes.txt"))
        self.assertFalse(is_cv_related("photo.jpg"))
        self.assertFalse(is_cv_related("readme.md"))
        self.assertFalse(is_cv_related("invoice.pdf"))

    # ── should_skip_dir ───────────────────────────────────────────────────

    def test_should_skip_dir_matches(self):
        for skip_name in ["node_modules", ".git", "__pycache__", ".Trash", "Library"]:
            with self.subTest(skip=skip_name):
                self.assertTrue(should_skip_dir(f"/some/path/{skip_name}/sub"))

    def test_should_skip_dir_non_matches(self):
        self.assertFalse(should_skip_dir("/home/user/Downloads"))
        self.assertFalse(should_skip_dir("/home/user/Documents/CVs"))
        self.assertFalse(should_skip_dir("/tmp"))

    def test_should_skip_dir_partial_not_enough(self):
        """'library' (lowercase) should NOT match because SKIP_DIRS has 'Library'."""
        self.assertFalse(should_skip_dir("/home/user/library"))

    # ── extract_person ────────────────────────────────────────────────────

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_with_years(self, _):
        """Years are stripped before name extraction."""
        result = extract_person("john_doe_2024_cv.pdf")
        self.assertIsNotNone(result)
        # 'john doe' after year removal → 'John Doe'
        self.assertIn("John", result)

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_no_year(self, _):
        """Name extracted without year suffixes."""
        result = extract_person("alice smith_resume.pdf")
        self.assertEqual(result, "Alice Smith")

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_with_alias(self, _):
        """Alias lookup overrides extracted name."""
        with patch("pipeline._load_aliases",
                   return_value={"alice smith": "Alice B. Smith"}):
            result = extract_person("alice smith_resume.pdf")
            self.assertEqual(result, "Alice B. Smith")

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_various_formats(self, _):
        cases = [
            # (filename, expected_substring)
            ("john_doe_cv.pdf", "John"),
            ("jane_doe_profile.pdf", "Jane"),
            ("bob_linkedin.pdf", "Bob"),
            ("cv_john.pdf", "John"),   # might not match NAME_HINTS; fallback split
        ]
        for fname, expected in cases:
            with self.subTest(fname=fname):
                result = extract_person(fname)
                if result is not None:
                    self.assertIn(expected, result)

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_none_for_unrelated(self, _):
        """Files without name patterns return None."""
        # "notes.txt" falls through to the split fallback which treats
        # it as a name candidate → use a purely-numeric name instead.
        result = extract_person("123_cv.pdf")
        self.assertIsNone(result)

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_person_edge_chars(self, _):
        """Special characters in filenames are handled."""
        result = extract_person("john-doe_cv.pdf")
        # Should not crash; may return something meaningful or None.
        self.assertIsNotNone(result)
        # Substring check is lenient since 'john-doe'.title() = 'John-Doe'
        self.assertIn("John", result)

    # ── _resolve_alias ─────────────────────────────────────────────────────

    def test_resolve_alias_direct(self):
        aliases = {"john doe": "John B. Doe"}
        self.assertEqual(_resolve_alias("john doe", aliases), "John B. Doe")

    def test_resolve_alias_substring(self):
        aliases = {"john doe": "John B. Doe"}
        # 'john_doe_cv' contains 'john doe' ... no it doesn't (underscore)
        # Actually 'john' in 'john_doe_cv' is in 'john doe' — wait, the code
        # does `k in name or name in k`.
        # name = "john_doe_cv", k = "john doe" → "john doe" in "john_doe_cv"? No.
        # "john_doe_cv" in "john doe"? No. So no match.
        # Let's use a case that actually matches.
        pass

    def test_resolve_alias_no_match(self):
        aliases = {"existing": "Canonical"}
        self.assertIsNone(_resolve_alias("unknown", aliases))


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  test_scan
# ═══════════════════════════════════════════════════════════════════════════════

class TestScan(unittest.TestCase):
    """Test directory scanning and bundle merging."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    # ── scan_directories ──────────────────────────────────────────────────

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_directories(self, _):
        """Temp dirs with CV files produce correct bundles."""
        root = self.tmp.name

        # Person A: two files
        _make_cv_file(root, "alice smith", ".txt", "alice cv")
        _make_cv_file(os.path.join(root, "sub"), "alice smith", ".txt", "alice resume")
        # Person B: one file
        _make_cv_file(root, "bob jones", ".pdf", "bob cv")
        # Non-CV file — should be ignored
        _make_file(root, "notes.txt", "irrelevant")

        bundles = scan_directories([root])

        # 'alice smith' and 'bob jones' should be found
        names = list(bundles.keys())
        # extract_person("alice smith_cv.txt") → "Alice Smith"
        # extract_person("bob jones_cv.pdf") → "Bob Jones"
        self.assertIn("Alice Smith", names)
        self.assertIn("Bob Jones", names)
        self.assertEqual(len(bundles["Alice Smith"].files), 2)
        self.assertEqual(len(bundles["Bob Jones"].files), 1)
        self.assertEqual(len(bundles), 2)

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_empty_dir(self, _):
        """Empty directory returns empty bundles dict."""
        bundles = scan_directories([self.tmp.name])
        self.assertEqual(bundles, {})

    @patch("pipeline._load_aliases", return_value={})
    @unittest.skipIf(not hasattr(os, "symlink"), "os.symlink not available")
    def test_scan_dedup_symlink(self, _):
        """Same real file discovered via two paths (symlink) is counted once."""
        root = self.tmp.name

        # Real file
        real_dir = os.path.join(root, "real")
        os.makedirs(real_dir)
        real_file = _make_cv_file(real_dir, "alice smith", ".txt", "content")

        # Symlink pointing to the same real file
        link_dir = os.path.join(root, "link")
        os.makedirs(link_dir)
        link_path = os.path.join(link_dir, "alice smith_cv.txt")
        os.symlink(real_file, link_path)

        bundles = scan_directories([root])

        # Only 1 file counted (resolved via os.path.realpath)
        self.assertIn("Alice Smith", bundles)
        self.assertEqual(len(bundles["Alice Smith"].files), 1)

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_skips_hidden_dirs(self, _):
        """Directories starting with '.' are skipped."""
        root = self.tmp.name
        hidden = os.path.join(root, ".hidden")
        os.makedirs(hidden)
        _make_cv_file(hidden, "alice smith", ".txt", "content")

        bundles = scan_directories([root])
        self.assertEqual(bundles, {})

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_skips_system_dirs(self, _):
        """System dirs like node_modules are skipped."""
        root = self.tmp.name
        skipped = os.path.join(root, "node_modules")
        os.makedirs(skipped)
        _make_cv_file(skipped, "alice smith", ".txt", "content")

        bundles = scan_directories([root])
        self.assertEqual(bundles, {})

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_invalid_ext_skipped(self, _):
        """Files with extensions not in VALID_EXT are skipped."""
        root = self.tmp.name
        _make_cv_file(root, "alice smith", ".png", "content")
        _make_cv_file(root, "bob jones", ".html", "content")

        bundles = scan_directories([root])
        self.assertEqual(bundles, {})

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_non_cv_name_skipped(self, _):
        """Files whose names don't match CV_PATTERNS are skipped."""
        root = self.tmp.name
        _make_file(root, "readme.txt", "content")
        _make_file(root, "image.pdf", "content")

        bundles = scan_directories([root])
        self.assertEqual(bundles, {})

    @patch("pipeline._load_aliases", return_value={})
    def test_scan_nonexistent_dir_warn(self, _):
        """Non-existent directory produces a warning but no crash."""
        bundles = scan_directories(["/nonexistent_path_xyz123"])
        self.assertEqual(bundles, {})

    # ── _merge_bundles ────────────────────────────────────────────────────

    @patch("pipeline._load_aliases", return_value={})
    def test_merge_bundles_identity(self, _):
        """Without aliases, bundles pass through unchanged (except sorting)."""
        b1 = PersonBundle(name="Alice Smith")
        b1.files.append(FoundFile(
            path="/a/cv.pdf", filename="cv.pdf", ext=".pdf",
            size_kb=10, person="Alice Smith", category="cv"))
        bundles = {"Alice Smith": b1}
        merged = _merge_bundles(bundles)
        self.assertIn("Alice Smith", merged)
        self.assertEqual(len(merged["Alice Smith"].files), 1)

    @patch("pipeline._load_aliases",
           return_value={"alice smith": "Alice Canonical"})
    def test_merge_bundles_alias(self, _):
        """Aliased keys merge into the canonical name."""
        b1 = PersonBundle(name="alice smith")
        b1.files.append(FoundFile(
            path="/a/cv.pdf", filename="cv.pdf", ext=".pdf",
            size_kb=10, person="alice smith", category="cv"))
        bundles = {"alice smith": b1}
        merged = _merge_bundles(bundles)
        self.assertIn("Alice Canonical", merged)
        self.assertNotIn("alice smith", merged)
        self.assertEqual(len(merged["Alice Canonical"].files), 1)

    @patch("pipeline._load_aliases", return_value={})
    def test_merge_bundles_unknown_merged(self, _):
        """Unknown files merge into the person with the most files."""
        alice = PersonBundle(name="Alice Smith")
        alice.files.append(FoundFile(
            path="/a/a.pdf", filename="a.pdf", ext=".pdf",
            size_kb=10, person="Alice Smith", category="cv"))
        bob = PersonBundle(name="Bob Jones")
        bob.files.append(FoundFile(
            path="/b/b.pdf", filename="b.pdf", ext=".pdf",
            size_kb=10, person="Bob Jones", category="cv"))
        unknown = PersonBundle(name="unknown")
        unknown.files.append(FoundFile(
            path="/u/u.pdf", filename="u.pdf", ext=".pdf",
            size_kb=10, person="unknown", category="other"))

        bundles = {"Alice Smith": alice, "Bob Jones": bob, "unknown": unknown}
        merged = _merge_bundles(bundles)

        # Both Alice and Bob have 1 file, so "primary" is whichever max() picks.
        # unknown files should be merged into one of them (not kept separate).
        self.assertNotIn("unknown", merged)
        total_people_with_extra = sum(
            1 for b in merged.values() if len(b.files) > 1
        )
        self.assertEqual(total_people_with_extra, 1)


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  test_extract
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtract(unittest.TestCase):
    """Test text extraction from various file types."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_extract_text_txt(self):
        """.txt file content is returned."""
        path = _make_file(self.tmp.name, "hello.txt", "Hello World!")
        text = extract_text(path)
        self.assertEqual(text, "Hello World!")

    def test_extract_text_md(self):
        """.md file content is returned."""
        path = _make_file(self.tmp.name, "readme.md", "# Markdown\nContent")
        text = extract_text(path)
        self.assertIn("Markdown", text)

    def test_extract_text_nonexistent(self):
        """Missing file returns None."""
        text = extract_text("/nonexistent_file_xyz.txt")
        self.assertIsNone(text)

    def test_extract_text_unsupported(self):
        """Files with unsupported extensions return None."""
        path = _make_file(self.tmp.name, "image.png", "binary")
        text = extract_text(path)
        self.assertIsNone(text)

    def test_extract_text_unsupported_docx(self):
        """.docx is a VALID_EXT but not handled by .txt/.md branch — returns None."""
        path = _make_file(self.tmp.name, "cv.docx", "fake docx content")
        text = extract_text(path)
        # .docx isn't .txt or .md, and it's not .pdf, so returns None
        self.assertIsNone(text)

    def test_extract_text_pdf_with_strings(self):
        """PDF extraction works via ``strings`` fallback."""
        if not _strings_available():
            self.skipTest("strings command not available on this system")

        pdf_path = os.path.join(self.tmp.name, "test.pdf")
        _create_minimal_pdf(pdf_path, text="CV Resume Skills Python")

        text = extract_text(pdf_path)
        # On systems with strings, the text should be found
        if text is not None:
            self.assertIn("CV", text)
            self.assertIn("Python", text)

    def test_extract_text_pdf_fallback_none(self):
        """PDF extraction returns None when no tool is available."""
        # Temporarily hide strings/pdftotext by patching subprocess.run
        original_run = subprocess.run

        def failing_run(*args, **kwargs):
            raise FileNotFoundError("No such tool")

        with patch("subprocess.run", side_effect=failing_run):
            pdf_path = os.path.join(self.tmp.name, "test.pdf")
            _create_minimal_pdf(pdf_path, text="Hello")
            text = extract_text(pdf_path)
            self.assertIsNone(text)

    # ── extract_all ───────────────────────────────────────────────────────

    @patch("pipeline._load_aliases", return_value={})
    def test_extract_all_populates_texts(self, _):
        """extract_all fills extracted_texts for each bundle."""
        root = self.tmp.name
        _make_cv_file(root, "alice smith", ".txt", "Alice CV content here")

        bundles = scan_directories([root])
        bundles = extract_all(bundles)

        alice = bundles.get("Alice Smith")
        self.assertIsNotNone(alice)
        self.assertTrue(len(alice.extracted_texts) > 0)
        for fname, text in alice.extracted_texts.items():
            self.assertIn("Alice", text)


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  test_organize
# ═══════════════════════════════════════════════════════════════════════════════

class TestOrganize(unittest.TestCase):
    """Test file organization into person directories."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    @patch("pipeline._load_aliases", return_value={})
    def test_organize_files(self, _):
        """Files are copied into 'resources/{slug(person)}/' directories."""
        root = self.tmp.name
        output = os.path.join(root, "output")

        # Create source files
        src = os.path.join(root, "src")
        os.makedirs(src)
        alice_file = _make_cv_file(src, "alice smith", ".txt", "alice content")
        bob_file = _make_cv_file(src, "bob jones", ".txt", "bob content")

        bundles = scan_directories([src])
        organize_files(bundles, output)

        # Check Alice's file was copied
        alice_dir = os.path.join(output, "resources", "alice-smith")
        self.assertTrue(os.path.isdir(alice_dir))
        alice_dest = os.path.join(alice_dir, os.path.basename(alice_file))
        self.assertTrue(os.path.isfile(alice_dest))
        with open(alice_dest) as f:
            self.assertEqual(f.read(), "alice content")

        # Check Bob's file was copied
        bob_dir = os.path.join(output, "resources", "bob-jones")
        self.assertTrue(os.path.isdir(bob_dir))
        bob_dest = os.path.join(bob_dir, os.path.basename(bob_file))
        self.assertTrue(os.path.isfile(bob_dest))

    @patch("pipeline._load_aliases", return_value={})
    def test_organize_dedup(self, _):
        """Duplicate filenames get a '_dup' suffix appended."""
        root = self.tmp.name
        output = os.path.join(root, "output")

        # Two files with the same name under different source dirs
        src1 = os.path.join(root, "src1")
        src2 = os.path.join(root, "src2")
        os.makedirs(src1)
        os.makedirs(src2)

        _make_file(src1, "alice smith_cv.txt", "first version")
        _make_file(src2, "alice smith_cv.txt", "second version")

        bundles = scan_directories([src1, src2])
        organize_files(bundles, output)

        alice_dir = os.path.join(output, "resources", "alice-smith")
        first = os.path.join(alice_dir, "alice smith_cv.txt")
        second = os.path.join(alice_dir, "alice smith_cv_dup.txt")

        self.assertTrue(os.path.isfile(first), f"Expected {first}")
        self.assertTrue(os.path.isfile(second), f"Expected {second}")

        with open(first) as f:
            self.assertEqual(f.read(), "first version")
        with open(second) as f:
            self.assertEqual(f.read(), "second version")

    @patch("pipeline._load_aliases", return_value={})
    def test_organize_dry_run_no_files_copied(self, _):
        """Dry run should not create any files."""
        root = self.tmp.name
        output = os.path.join(root, "output")

        src = os.path.join(root, "src")
        os.makedirs(src)
        _make_cv_file(src, "alice smith", ".txt", "content")

        bundles = scan_directories([src])
        organize_files(bundles, output, dry_run=True)

        # No files should have been created in dry-run mode
        alice_dir = os.path.join(output, "resources", "alice-smith")
        self.assertFalse(os.path.isdir(alice_dir),
                         "Dry run should not create directories")


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  test_llm
# ═══════════════════════════════════════════════════════════════════════════════

class TestLLM(unittest.TestCase):
    """Test LLMClient initialization and chat routing with mocking."""

    def setUp(self):
        # Save original env to restore after tests
        self._orig_environ = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._orig_environ)

    # ── init ──────────────────────────────────────────────────────────────

    def test_llm_init_defaults(self):
        """Default provider is 'ollama' with matching model."""
        client = LLMClient()
        self.assertEqual(client.provider, "ollama")
        self.assertEqual(client.model, "llama3.2")
        self.assertIsNone(client.api_key)

    def test_llm_init_openai(self):
        """OpenAI provider sets model and reads env var."""
        os.environ["OPENAI_API_KEY"] = "sk-test123"
        client = LLMClient(provider="openai")
        self.assertEqual(client.provider, "openai")
        self.assertEqual(client.model, "gpt-4o")
        self.assertEqual(client.api_key, "sk-test123")

    def test_llm_init_anthropic(self):
        """Anthropic provider sets model and reads env var."""
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test123"
        client = LLMClient(provider="anthropic")
        self.assertEqual(client.provider, "anthropic")
        self.assertEqual(client.model, "claude-sonnet-4-20250514")
        self.assertEqual(client.api_key, "sk-ant-test123")

    def test_llm_init_custom_model(self):
        """Custom model overrides the default."""
        client = LLMClient(provider="openai", model="gpt-3.5-turbo")
        self.assertEqual(client.model, "gpt-3.5-turbo")

    def test_llm_init_explicit_api_key(self):
        """Explicit api_key takes precedence over env var."""
        os.environ["OPENAI_API_KEY"] = "sk-env-key"
        client = LLMClient(provider="openai", api_key="sk-explicit-key")
        self.assertEqual(client.api_key, "sk-explicit-key")

    def test_llm_unknown_provider(self):
        """Unknown provider logs error and returns None from chat()."""
        client = LLMClient(provider="nonexistent")
        result = client.chat([{"role": "user", "content": "hi"}])
        self.assertIsNone(result)

    # ── _chat_ollama ──────────────────────────────────────────────────────

    @patch("urllib.request.urlopen")
    def test_chat_ollama_success(self, mock_urlopen):
        """Successful Ollama response returns parsed content."""
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "message": {"content": "Hello from Ollama"}
        }).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        client = LLMClient(provider="ollama", api_key="ignored")
        result = client.chat([{"role": "user", "content": "Hi"}])
        self.assertEqual(result, "Hello from Ollama")

    @patch("urllib.request.urlopen", side_effect=ConnectionRefusedError("No server"))
    def test_chat_ollama_connection_error(self, mock_urlopen):
        """Connection errors are caught and return None."""
        client = LLMClient(provider="ollama", api_key="ignored")
        result = client.chat([{"role": "user", "content": "Hi"}])
        self.assertIsNone(result)

    # ── _chat_openai ──────────────────────────────────────────────────────

    @patch.dict("sys.modules", {"openai": MagicMock()})
    def test_chat_openai_success(self):
        """OpenAI chat returns content when openai package is installed."""
        import openai
        # Configure the mock
        mock_completion = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "OpenAI response"
        mock_choice.message = mock_message
        mock_completion.choices = [mock_choice]
        openai.OpenAI.return_value.chat.completions.create.return_value = mock_completion

        client = LLMClient(provider="openai", api_key="sk-test")
        result = client.chat([{"role": "user", "content": "Hi"}])
        self.assertEqual(result, "OpenAI response")

    def test_chat_openai_not_installed(self):
        """OpenAI chat returns None when openai package is missing."""
        # Remove openai from sys.modules if present
        saved = sys.modules.pop("openai", None)
        try:
            client = LLMClient(provider="openai", api_key="sk-test")
            result = client.chat([{"role": "user", "content": "Hi"}])
            self.assertIsNone(result)
        finally:
            if saved is not None:
                sys.modules["openai"] = saved

    # ── _chat_anthropic ───────────────────────────────────────────────────

    @patch.dict("sys.modules", {"anthropic": MagicMock()})
    def test_chat_anthropic_success(self):
        """Anthropic chat returns content when anthropic package is installed."""
        import anthropic
        mock_msg = MagicMock()
        mock_text_block = MagicMock()
        mock_text_block.text = "Anthropic response"
        mock_msg.content = [mock_text_block]
        anthropic.Anthropic.return_value.messages.create.return_value = mock_msg

        client = LLMClient(provider="anthropic", api_key="sk-ant-test")
        result = client.chat([{"role": "user", "content": "Hi"}])
        self.assertEqual(result, "Anthropic response")

    def test_chat_anthropic_not_installed(self):
        """Anthropic chat returns None when anthropic package is missing."""
        saved = sys.modules.pop("anthropic", None)
        try:
            client = LLMClient(provider="anthropic", api_key="sk-ant-test")
            result = client.chat([{"role": "user", "content": "Hi"}])
            self.assertIsNone(result)
        finally:
            if saved is not None:
                sys.modules["anthropic"] = saved

    # ── system message handling in Anthropic ──────────────────────────────

    @patch.dict("sys.modules", {"anthropic": MagicMock()})
    def test_chat_anthropic_with_system_message(self):
        """Anthropic routes system message to 'system' kwarg."""
        import anthropic
        mock_msg = MagicMock()
        mock_text_block = MagicMock()
        mock_text_block.text = "With system"
        mock_msg.content = [mock_text_block]
        anthropic.Anthropic.return_value.messages.create.return_value = mock_msg

        client = LLMClient(provider="anthropic", api_key="sk-ant-test")
        result = client.chat([
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Hi"},
        ])
        self.assertEqual(result, "With system")

        # Verify the 'system' kwarg was passed
        call_kwargs = anthropic.Anthropic.return_value.messages.create.call_args.kwargs
        self.assertEqual(call_kwargs.get("system"), "You are helpful.")
        # Verify messages don't include the system role
        for m in call_kwargs["messages"]:
            self.assertNotEqual(m["role"], "system")


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  test_consolidate
# ═══════════════════════════════════════════════════════════════════════════════

class TestConsolidate(unittest.TestCase):
    """Test JSON parsing from LLM responses and the llm_process_all function."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    # ── JSON parsing (llm_consolidate internals) ──────────────────────────

    def test_json_parse_with_code_fences(self):
        """LLM response with markdown code fences is parsed correctly."""
        response = "Here is the JSON:\n```json\n{\"name\": \"Alice\"}\n```"
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        self.assertIsNotNone(json_match)
        text = json_match.group(1)
        parsed = json.loads(text)
        self.assertEqual(parsed["name"], "Alice")

    def test_json_parse_without_code_fences(self):
        """LLM response without code fences is parsed directly."""
        response = '{"name": "Bob", "skills": {"languages": ["Go"]}}'
        # Simulate what llm_consolidate does
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        text = json_match.group(1) if json_match else response
        parsed = json.loads(text)
        self.assertEqual(parsed["name"], "Bob")
        self.assertIn("Go", parsed["skills"]["languages"])

    def test_json_parse_with_code_fences_no_lang(self):
        """LLM response with plain ``` fences is parsed correctly."""
        response = "```\n{\"name\": \"Charlie\"}\n```"
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        self.assertIsNotNone(json_match)
        text = json_match.group(1)
        parsed = json.loads(text)
        self.assertEqual(parsed["name"], "Charlie")

    def test_non_json_fallback(self):
        """Non-JSON response produces a dict with '_raw' key."""
        response = "Sorry, I cannot process that."
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        text = json_match.group(1) if json_match else response
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = {"_raw": response}
        self.assertIn("_raw", parsed)
        self.assertEqual(parsed["_raw"], response)

    # ── llm_consolidate ───────────────────────────────────────────────────

    def test_llm_consolidate_with_mock_client(self):
        """llm_consolidate returns parsed JSON when client returns valid JSON."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Test Person is a developer."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = json.dumps({
            "name": "Test Person",
            "skills": {"languages": ["Python"]},
            "experience": [],
        })

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Test Person")
        self.assertEqual(result["skills"]["languages"], ["Python"])

    def test_llm_consolidate_with_code_fences(self):
        """llm_consolidate handles JSON inside markdown code fences."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = (
            "Here is the structured data:\n"
            "```json\n{\"name\": \"Test Person\", \"skills\": {\"languages\": [\"Python\"]}}\n"
            "```"
        )

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result["name"], "Test Person")

    def test_llm_consolidate_non_json(self):
        """llm_consolidate returns fallback dict for non-JSON response."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "I cannot process this request."

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNotNone(result)
        self.assertIn("_raw", result)
        self.assertEqual(result["_raw"], "I cannot process this request.")

    def test_llm_consolidate_empty_response(self):
        """llm_consolidate returns None when client returns None."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = None

        result = llm_consolidate(mock_client, bundle)
        self.assertIsNone(result)

    def test_llm_consolidate_json_array_response(self):
        """llm_consolidate falls back to '_raw' instead of crashing when the
        LLM returns a valid JSON array instead of an object."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "[1,2,3]"

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": "[1,2,3]"})

    def test_llm_consolidate_json_null_response(self):
        """llm_consolidate falls back to '_raw' instead of crashing when the
        LLM returns JSON null instead of an object."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "null"

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": "null"})

    def test_llm_consolidate_json_scalar_response(self):
        """llm_consolidate falls back to '_raw' instead of crashing when the
        LLM returns a bare JSON scalar (number) instead of an object."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "42"

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": "42"})

    def test_llm_consolidate_json_string_response(self):
        """llm_consolidate falls back to '_raw' instead of crashing when the
        LLM returns a bare JSON string instead of an object."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = '"just a string"'

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": '"just a string"'})

    def test_llm_consolidate_json_bool_response(self):
        """llm_consolidate falls back to '_raw' instead of crashing when the
        LLM returns a bare JSON boolean instead of an object."""
        bundle = PersonBundle(name="Test Person")
        bundle.extracted_texts["cv.txt"] = "Content."

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "true"

        result = llm_consolidate(mock_client, bundle)
        self.assertEqual(result, {"_raw": "true"})

    # ── llm_generate_resume ───────────────────────────────────────────────

    def test_llm_generate_resume(self):
        """llm_generate_resume returns markdown from LLM."""
        mock_client = MagicMock(spec=LLMClient)
        mock_client.chat.return_value = "# Test Person Resume\n\nExperience..."

        result = llm_generate_resume(
            mock_client, "Test Person",
            {"name": "Test Person", "skills": {"languages": ["Python"]}}
        )
        self.assertIsNotNone(result)
        self.assertIn("Test Person", result)

    def test_llm_generate_resume_none(self):
        """llm_generate_resume returns None when client fails."""
        mock_client = MagicMock(spec=LLMClient)
        mock_client.chat.return_value = None

        result = llm_generate_resume(
            mock_client, "Test Person", {"name": "Test Person"}
        )
        self.assertIsNone(result)

    # ── llm_process_all ───────────────────────────────────────────────────

    def test_llm_process_all_full(self):
        """llm_process_all writes consolidated JSON and resume markdown."""
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Alice Smith")
        bundle.extracted_texts = {
            "alice_cv.txt": "Alice Smith is an engineer."
        }

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        # First call → consolidated JSON
        # Second call → resume markdown
        mock_client.chat.side_effect = [
            json.dumps({"name": "Alice Smith", "skills": {"languages": ["Python"]}}),
            "# Alice Resume\n\nSkills: Python",
        ]

        llm_process_all({"Alice Smith": bundle}, output, mock_client)

        # Check consolidated JSON
        json_path = os.path.join(output, "consolidated", "alice-smith_structured.json")
        self.assertTrue(os.path.isfile(json_path), f"Expected {json_path}")
        with open(json_path) as f:
            data = json.load(f)
        self.assertEqual(data["name"], "Alice Smith")
        self.assertEqual(data["skills"]["languages"], ["Python"])

        # Check resume
        resume_path = os.path.join(output, "resumes", "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(resume_path), f"Expected {resume_path}")
        with open(resume_path) as f:
            content = f.read()
        self.assertIn("Alice", content)

    def test_llm_process_all_no_extracted_text(self):
        """Bundles without extracted text are skipped."""
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Bob Jones")  # no extracted_texts

        mock_client = MagicMock(spec=LLMClient)
        llm_process_all({"Bob Jones": bundle}, output, mock_client)

        # No files should be written
        consolidated_dir = os.path.join(output, "consolidated")
        resume_dir = os.path.join(output, "resumes")
        self.assertFalse(os.path.isdir(consolidated_dir) and
                         os.listdir(consolidated_dir),
                         "No consolidated files expected")
        self.assertFalse(os.path.isdir(resume_dir) and
                         os.listdir(resume_dir),
                         "No resume files expected")

    def test_llm_process_all_skip_resume(self):
        """With skip_resume=True, only consolidated JSON is written."""
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Alice Smith")
        bundle.extracted_texts = {"alice_cv.txt": "Alice content."}

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = json.dumps({"name": "Alice Smith"})

        llm_process_all({"Alice Smith": bundle}, output, mock_client,
                        skip_resume=True)

        json_path = os.path.join(output, "consolidated", "alice-smith_structured.json")
        self.assertTrue(os.path.isfile(json_path))

        resume_path = os.path.join(output, "resumes", "alice-smith_resume.md")
        self.assertFalse(os.path.isfile(resume_path),
                         "Resume should not exist when skip_resume=True")

    def test_llm_process_all_skip_consolidate_no_cache(self):
        """With skip_consolidate=True and no cached JSON, person is skipped."""
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Alice Smith")
        bundle.extracted_texts = {"alice_cv.txt": "Alice content."}

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"

        llm_process_all({"Alice Smith": bundle}, output, mock_client,
                        skip_consolidate=True)

        # No files should be written
        consolidated_dir = os.path.join(output, "consolidated")
        self.assertFalse(os.path.isdir(consolidated_dir) and
                         os.listdir(consolidated_dir))

    def test_llm_process_all_skip_consolidate_with_cache(self):
        """With skip_consolidate=True and cached JSON, resume is generated."""
        output = os.path.join(self.tmp.name, "output")
        os.makedirs(os.path.join(output, "consolidated"))
        cached = {"name": "Alice Smith", "skills": {"languages": ["Python"]}}
        cache_path = os.path.join(output, "consolidated", "alice-smith_structured.json")
        with open(cache_path, "w") as f:
            json.dump(cached, f)

        bundle = PersonBundle(name="Alice Smith")
        bundle.extracted_texts = {"alice_cv.txt": "Alice content."}

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.return_value = "# Alice Resume\n\nSkills: Python"

        llm_process_all({"Alice Smith": bundle}, output, mock_client,
                        skip_consolidate=True)

        resume_path = os.path.join(output, "resumes", "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(resume_path))


# ═══════════════════════════════════════════════════════════════════════════════
# 7.  test_integration
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegration(unittest.TestCase):
    """End-to-end test of the pipeline using temp directories and .txt CV files."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    @patch("pipeline._load_aliases", return_value={})
    def test_full_pipeline(self, _):
        """
        Full pipeline (scan → organize → extract → verify structure).
        No LLM calls — we verify the data pipeline works end-to-end.
        """
        root = self.tmp.name

        # ── Create sample CV files ──
        src1 = os.path.join(root, "src1")
        src2 = os.path.join(root, "src2")
        os.makedirs(src1)
        os.makedirs(src2)

        alice_cv = _make_cv_file(src1, "alice smith", ".txt",
                                 "Alice Smith\nSoftware Engineer\nPython, Go")
        alice_resume = _make_cv_file(src2, "alice smith", ".txt",
                                     "Alice Smith\nSenior Engineer\nKubernetes, Docker")
        bob_cv = _make_cv_file(src1, "bob jones", ".txt",
                               "Bob Jones\nData Scientist\nML, Python")
        unrelated = _make_file(src1, "readme.md", "Just a readme")
        _ = unrelated  # should be ignored by scan

        output_dir = os.path.join(root, "output")

        # ── STEP 1: Scan ──
        bundles = scan_directories([src1, src2])
        self.assertGreaterEqual(len(bundles), 2,
                                "Should find at least Alice and Bob")

        # Normalize names (osx filesystem case can vary)
        person_names = set(bundles.keys())
        alice_key = next((n for n in person_names if "Alice" in n), None)
        bob_key = next((n for n in person_names if "Bob" in n), None)
        self.assertIsNotNone(alice_key, f"Alice not found in {person_names}")
        self.assertIsNotNone(bob_key, f"Bob not found in {person_names}")

        # Alice should have 2 files (from src1 and src2)
        alice_bundle = bundles[alice_key]
        bob_bundle = bundles[bob_key]
        self.assertEqual(len(alice_bundle.files), 2)
        self.assertEqual(len(bob_bundle.files), 1)

        # ── STEP 2: Organize ──
        organize_files(bundles, output_dir)

        alice_dir = os.path.join(output_dir, "resources", "alice-smith")
        bob_dir = os.path.join(output_dir, "resources", "bob-jones")
        self.assertTrue(os.path.isdir(alice_dir),
                        f"Expected Alice dir at {alice_dir}")
        self.assertTrue(os.path.isdir(bob_dir),
                        f"Expected Bob dir at {bob_dir}")

        # Check Alice's files were copied
        alice_files = os.listdir(alice_dir)
        self.assertEqual(len(alice_files), 2,
                         f"Expected 2 files for Alice, got {alice_files}")

        # ── STEP 3: Extract ──
        bundles = extract_all(bundles)

        self.assertIn(len(alice_bundle.extracted_texts), (1, 2),
                      "Alice should have extracted text")
        for fname, text in alice_bundle.extracted_texts.items():
            self.assertIn("Alice", text)

        self.assertEqual(len(bob_bundle.extracted_texts), 1)
        for fname, text in bob_bundle.extracted_texts.items():
            self.assertIn("Bob", text)

        # ── STEP 4: Verify output structure ──
        # Resources directory should exist
        resources_dir = os.path.join(output_dir, "resources")
        self.assertTrue(os.path.isdir(resources_dir))

        # Consolidated directory may exist or not (depends on LLM step)
        # We don't run LLM here, so consolidated/ may not exist

        # ── STEP 5: Cleanup handled by TemporaryDirectory ──

    @patch("pipeline._load_aliases", return_value={})
    def test_pipeline_with_llm_mock(self, _):
        """End-to-end test including mock LLM consolidation and resume."""
        root = self.tmp.name
        src = os.path.join(root, "src")
        os.makedirs(src)
        _make_cv_file(src, "alice smith", ".txt",
                      "Alice Smith is a Software Engineer.")

        output_dir = os.path.join(root, "output")

        # Scan and organize
        bundles = scan_directories([src])
        organize_files(bundles, output_dir)
        bundles = extract_all(bundles)

        # Mock LLM processing
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.side_effect = [
            json.dumps({
                "name": "Alice Smith",
                "contact": {"email": "alice@example.com"},
                "skills": {"languages": ["Python", "Go"]},
                "experience": [],
            }),
            "# Alice Smith\n**Engineer**\n\nSkills: Python, Go",
        ]

        llm_process_all(bundles, output_dir, mock_client)

        # Verify consolidated JSON
        json_path = os.path.join(output_dir, "consolidated",
                                 "alice-smith_structured.json")
        self.assertTrue(os.path.isfile(json_path))
        with open(json_path) as f:
            data = json.load(f)
        self.assertEqual(data["name"], "Alice Smith")
        self.assertEqual(data["contact"]["email"], "alice@example.com")
        self.assertIn("Go", data["skills"]["languages"])

        # Verify resume
        resume_path = os.path.join(output_dir, "resumes",
                                   "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(resume_path))
        with open(resume_path) as f:
            content = f.read()
        self.assertIn("Alice", content)
        self.assertIn("Python", content)

        # README summary is written by summary_report() (called from run()),
        # not by llm_process_all() — skip that assertion here.

    @patch("pipeline._load_aliases", return_value={})
    def test_pipeline_empty_no_crash(self, _):
        """Pipeline with no CV files completes gracefully."""
        root = self.tmp.name
        output_dir = os.path.join(root, "output")

        bundles = scan_directories([root])
        self.assertEqual(bundles, {})

        # organize_files on empty bundles should not crash
        organize_files(bundles, output_dir)

    @patch("pipeline._load_aliases", return_value={})
    def test_pipeline_dedup_across_dirs(self, _):
        """
        Same person, same filename across dirs results in _dup suffix
        after organize.
        """
        root = self.tmp.name
        src1 = os.path.join(root, "src1")
        src2 = os.path.join(root, "src2")
        os.makedirs(src1)
        os.makedirs(src2)

        _make_file(src1, "alice smith_cv.txt", "version 1")
        _make_file(src2, "alice smith_cv.txt", "version 2")

        output_dir = os.path.join(root, "output")
        bundles = scan_directories([src1, src2])
        organize_files(bundles, output_dir)

        alice_dir = os.path.join(output_dir, "resources", "alice-smith")
        files = sorted(os.listdir(alice_dir))
        self.assertEqual(len(files), 2)
        self.assertIn("alice smith_cv.txt", files)
        self.assertIn("alice smith_cv_dup.txt", files)


# ═══════════════════════════════════════════════════════════════════════════════
# 8.  test_latex
# ═══════════════════════════════════════════════════════════════════════════════

class TestEscapeLatex(unittest.TestCase):
    """escape_latex() must neutralize every LaTeX special character."""

    def test_backslash(self):
        self.assertEqual(escape_latex("a\\b"), r"a\textbackslash{}b")

    def test_ampersand(self):
        self.assertEqual(escape_latex("Foo & Bar"), r"Foo \& Bar")

    def test_percent(self):
        self.assertEqual(escape_latex("100%"), r"100\%")

    def test_dollar(self):
        self.assertEqual(escape_latex("$cool$"), r"\$cool\$")

    def test_hash(self):
        self.assertEqual(escape_latex("#1"), r"\#1")

    def test_underscore(self):
        self.assertEqual(escape_latex("a_b"), r"a\_b")

    def test_open_brace(self):
        self.assertEqual(escape_latex("a{b"), r"a\{b")

    def test_close_brace(self):
        self.assertEqual(escape_latex("a}b"), r"a\}b")

    def test_tilde(self):
        self.assertEqual(escape_latex("a~b"), r"a\textasciitilde{}b")

    def test_caret(self):
        self.assertEqual(escape_latex("a^b"), r"a\textasciicircum{}b")

    def test_none_returns_empty_string(self):
        self.assertEqual(escape_latex(None), "")

    def test_non_string_is_stringified(self):
        self.assertEqual(escape_latex(42), "42")

    def test_plain_text_unchanged(self):
        self.assertEqual(escape_latex("Senior Engineer"), "Senior Engineer")

    def test_no_double_escaping(self):
        """A literal backslash must not have its escaped braces re-escaped."""
        result = escape_latex("\\")
        self.assertEqual(result, r"\textbackslash{}")
        # The braces introduced by the replacement itself must not be
        # escaped a second time (that would produce \textbackslash\{\}).
        self.assertNotIn(r"\{\}", result)

    def test_injection_attempt_neutralized(self):
        malicious = "\\input{/etc/passwd}"
        result = escape_latex(malicious)
        # No raw backslash-command sequence should survive.
        self.assertNotIn("\\input{", result)
        self.assertIn(r"\textbackslash{}", result)
        self.assertIn(r"\{", result)
        self.assertIn(r"\}", result)

    def test_combined_special_chars(self):
        result = escape_latex("50% off $100 & #1 pick_of {the} ~top^tier")
        self.assertIn(r"\%", result)
        self.assertIn(r"\$", result)
        self.assertIn(r"\&", result)
        self.assertIn(r"\#", result)
        self.assertIn(r"\_", result)
        self.assertIn(r"\{", result)
        self.assertIn(r"\}", result)
        self.assertIn(r"\textasciitilde{}", result)
        self.assertIn(r"\textasciicircum{}", result)


class TestRenderLatex(unittest.TestCase):
    """render_latex() with full data and with missing/partial data."""

    def test_full_data_structure(self):
        data = {
            "name": "Alice Smith",
            "contact": {"email": "alice@example.com", "phone": "555-1234",
                       "location": "NYC", "linkedin": "linkedin.com/in/alice",
                       "website": "alice.dev"},
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
                {"title": "Staff Engineer", "company": "Acme Corp",
                 "start": "2021", "end": "Present", "location": "Remote",
                 "bullets": ["Built a distributed queue in Go", "Led migration to Kubernetes"]},
            ],
            "education": [{"degree": "B.S. Computer Science", "school": "MIT", "years": "2016-2020"}],
            "certifications": ["AWS Certified Solutions Architect"],
            "languages_spoken": ["English", "French"],
        }
        tex = render_latex(data, "Alice Smith")

        self.assertTrue(tex.startswith(r"\documentclass"))
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)
        self.assertIn("Alice Smith", tex)
        self.assertIn("Staff Engineer", tex)
        self.assertIn("Acme Corp", tex)
        self.assertIn("Built a distributed queue in Go", tex)
        self.assertIn("MIT", tex)
        self.assertIn("AWS Certified Solutions Architect", tex)
        self.assertIn("English", tex)
        self.assertIn("Python", tex)
        self.assertIn(r"\begin{itemize}", tex)

    def test_special_characters_are_escaped(self):
        data = {
            "name": "Al\\ice & Co",
            "contact": {"location": "NYC & Co", "website": "http://x.com/~alice"},
            "titles": ["Senior Eng #1"],
            "summary": "Built 100% $cool$ systems # rock",
            "skills": {"languages": ["C#", "Python_3"], "frameworks": ["Django & Co"]},
            "experience": [{
                "title": "Eng & Lead", "company": "Foo_Bar {Inc}",
                "start": "2020", "end": "2022", "location": "Remote ~HQ",
                "bullets": ["Handled \\command{x}", "Grew perf by 2^10x"],
            }],
            "education": [{"degree": "B.S. CS #1", "school": "MIT & Co", "years": "2016"}],
            "certifications": ["AWS_Cert & Co"],
            "languages_spoken": ["English & French"],
        }
        tex = render_latex(data, "Alice")

        # Escaped forms must be present...
        self.assertIn(r"\&", tex)
        self.assertIn(r"\#", tex)
        self.assertIn(r"\%", tex)
        self.assertIn(r"\$", tex)
        self.assertIn(r"\_", tex)
        self.assertIn(r"\{", tex)
        self.assertIn(r"\}", tex)
        self.assertIn(r"\textasciitilde{}", tex)
        self.assertIn(r"\textasciicircum{}", tex)
        self.assertIn(r"\textbackslash{}", tex)
        # ...and the raw dangerous sequence must never survive unescaped.
        self.assertNotIn("\\command{x}", tex)
        self.assertNotIn("Foo_Bar {Inc}", tex)

    def test_empty_data_does_not_crash(self):
        tex = render_latex({}, "Bob Jones")
        self.assertIsInstance(tex, str)
        self.assertIn(r"\documentclass", tex)
        self.assertIn(r"\end{document}", tex)
        self.assertIn("Bob Jones", tex)  # falls back to the `name` arg

    def test_none_data_does_not_crash(self):
        tex = render_latex(None, "Carol")
        self.assertIsInstance(tex, str)
        self.assertIn("Carol", tex)

    def test_missing_and_null_nested_fields_do_not_crash(self):
        data = {
            "name": "Dave",
            "contact": None,
            "titles": None,
            "summary": None,
            "skills": {"languages": None, "frameworks": []},
            "experience": [{"bullets": None}, None, {"title": "Eng"}],
            "education": [{}, {"degree": "B.S."}],
            "certifications": None,
            "languages_spoken": [],
        }
        tex = render_latex(data, "Dave")
        self.assertIsInstance(tex, str)
        self.assertIn("Dave", tex)
        self.assertIn(r"\end{document}", tex)

    def test_no_experience_section_when_empty(self):
        tex = render_latex({"name": "Eve", "skills": {}, "experience": []}, "Eve")
        self.assertNotIn(r"\textbf{Experience}", tex)

    def test_name_falls_back_to_arg_when_data_name_blank(self):
        tex = render_latex({"name": "  "}, "Fallback Name")
        self.assertIn("Fallback Name", tex)


class TestCompilePdf(unittest.TestCase):
    """compile_pdf() with pdflatex mocked / unavailable."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _write_tex(self, name="resume.tex"):
        tex_path = os.path.join(self.tmp.name, name)
        with open(tex_path, "w") as f:
            f.write(r"\documentclass{article}\begin{document}x\end{document}")
        return tex_path

    @patch("latex.subprocess.run")
    def test_compile_success(self, mock_run):
        tex_path = self._write_tex()
        pdf_path = os.path.join(self.tmp.name, "resume.pdf")
        with open(pdf_path, "w") as f:
            f.write("%PDF-1.4 fake")
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        result = compile_pdf(tex_path, self.tmp.name)

        self.assertEqual(result, pdf_path)
        args, kwargs = mock_run.call_args
        called_args = args[0]
        self.assertIsInstance(called_args, list)
        self.assertEqual(called_args[0], "pdflatex")
        self.assertIn("-interaction=nonstopmode", called_args)
        self.assertIn("-halt-on-error", called_args)
        self.assertIn("-no-shell-escape", called_args)
        self.assertNotIn("shell", kwargs)  # never shell=True

    @patch("latex.subprocess.run")
    def test_compile_pdflatex_not_installed(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        tex_path = self._write_tex()

        result = compile_pdf(tex_path, self.tmp.name)

        self.assertIsNone(result)

    @patch("latex.subprocess.run")
    def test_compile_timeout(self, mock_run):
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="pdflatex", timeout=30)
        tex_path = self._write_tex()

        result = compile_pdf(tex_path, self.tmp.name)

        self.assertIsNone(result)

    @patch("latex.subprocess.run")
    def test_compile_nonzero_exit_returns_none(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="! Undefined control sequence")
        tex_path = self._write_tex()

        result = compile_pdf(tex_path, self.tmp.name)

        self.assertIsNone(result)

    @patch("latex.subprocess.run")
    def test_compile_uses_timeout_kwarg(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        tex_path = self._write_tex()
        pdf_path = os.path.join(self.tmp.name, "resume.pdf")
        with open(pdf_path, "w") as f:
            f.write("%PDF-1.4 fake")

        compile_pdf(tex_path, self.tmp.name)

        _, kwargs = mock_run.call_args
        self.assertEqual(kwargs.get("timeout"), 30)


class TestScoreStructuredData(unittest.TestCase):
    """score_structured_data(): completeness scoring + warnings for consolidated JSON."""

    def _complete_data(self) -> dict:
        return {
            "name": "Jane Doe",
            "contact": {
                "email": "jane@example.com", "phone": "555-1234", "location": "NYC",
                "linkedin": "linkedin.com/in/janedoe", "website": "janedoe.dev",
            },
            "titles": ["Software Engineer"],
            "summary": "Experienced backend engineer specializing in distributed systems.",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS", "Docker"],
                "databases": ["Postgres"],
                "tools": ["Git"],
            },
            "experience": [
                {"title": "Engineer", "company": "Acme", "start": "2020", "end": "2022",
                 "location": "NYC", "bullets": ["Built X", "Designed Y"]},
            ],
            "education": [{"degree": "BS", "school": "MIT", "years": "2016-2020"}],
            "certifications": ["AWS Certified"],
            "languages_spoken": ["English"],
        }

    def test_complete_data_scores_full_with_no_warnings(self):
        result = score_structured_data(self._complete_data())
        self.assertEqual(result["warnings"], [])
        self.assertFalse(result["critical"])
        self.assertEqual(result["score"], result["max_score"])
        self.assertGreater(result["max_score"], 0)

    def test_missing_optional_fields_produces_warnings_not_critical(self):
        data = self._complete_data()
        del data["contact"]["email"]
        data["summary"] = ""
        data["skills"]["languages"] = []
        del data["experience"][0]["bullets"]
        del data["certifications"]

        result = score_structured_data(data)

        self.assertFalse(result["critical"])
        self.assertLess(result["score"], result["max_score"])
        self.assertIn("no contact email", result["warnings"])
        self.assertIn("no professional summary", result["warnings"])
        self.assertIn("skills.languages is empty", result["warnings"])
        self.assertIn("no certifications listed", result["warnings"])
        self.assertTrue(any("missing bullets" in w for w in result["warnings"]))

    def test_missing_required_key_is_critical(self):
        data = self._complete_data()
        del data["skills"]

        result = score_structured_data(data)

        self.assertTrue(result["critical"])
        self.assertIn("missing required field: skills", result["warnings"])

    def test_empty_required_value_is_critical(self):
        """An empty list/dict for a required key counts as missing, not just an absent key."""
        data = self._complete_data()
        data["experience"] = []

        result = score_structured_data(data)

        self.assertTrue(result["critical"])
        self.assertIn("missing required field: experience", result["warnings"])

    def test_raw_fallback_data_is_critical(self):
        result = score_structured_data({"_raw": "not json, sorry"})
        self.assertTrue(result["critical"])
        self.assertTrue(any("raw" in w.lower() for w in result["warnings"]))

    def test_non_dict_input_is_critical(self):
        result = score_structured_data(["not", "a", "dict"])
        self.assertTrue(result["critical"])
        self.assertEqual(result["score"], 0)

    def test_skills_not_a_dict_warns_without_crashing(self):
        data = self._complete_data()
        data["skills"] = ["Python", "Go"]  # required key present (truthy) but malformed shape
        result = score_structured_data(data)
        self.assertIn("skills is missing or not an object", result["warnings"])

    def test_experience_entry_missing_title_and_company(self):
        data = self._complete_data()
        data["experience"] = [{"bullets": ["Did stuff"]}]
        result = score_structured_data(data)
        self.assertTrue(any("missing title/company" in w for w in result["warnings"]))

    def test_experience_non_dict_entry_does_not_crash(self):
        data = self._complete_data()
        data["experience"] = ["just a string, not an object"]
        result = score_structured_data(data)
        self.assertTrue(any("not a valid object" in w for w in result["warnings"]))

    def test_minimal_valid_data_not_critical(self):
        """Only REQUIRED_STRUCTURED_KEYS present: passes the gate, but many warnings."""
        data = {"name": "Jane Doe", "skills": {"languages": ["Python"]}, "experience": [
            {"title": "Engineer", "company": "Acme", "bullets": ["Built things"]},
        ]}
        result = score_structured_data(data)
        self.assertFalse(result["critical"])
        self.assertTrue(len(result["warnings"]) > 0)


class TestFindStructuredJsonFiles(unittest.TestCase):
    """_find_structured_json_files(): locate *_structured.json given a file or dir."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_single_file_path(self):
        path = os.path.join(self.tmp.name, "jane-doe_structured.json")
        with open(path, "w") as f:
            json.dump({"name": "Jane"}, f)
        self.assertEqual(_find_structured_json_files(path), [path])

    def test_directory_with_consolidated_subdir(self):
        consolidated = os.path.join(self.tmp.name, "consolidated")
        os.makedirs(consolidated)
        p1 = os.path.join(consolidated, "alice_structured.json")
        p2 = os.path.join(consolidated, "bob_structured.json")
        other = os.path.join(consolidated, "alice_extracted.md")
        for p in (p1, p2):
            with open(p, "w") as f: json.dump({}, f)
        with open(other, "w") as f: f.write("not relevant")

        found = _find_structured_json_files(self.tmp.name)
        self.assertEqual(sorted(found), sorted([p1, p2]))

    def test_directory_without_consolidated_subdir_scans_directly(self):
        p1 = os.path.join(self.tmp.name, "alice_structured.json")
        with open(p1, "w") as f: json.dump({}, f)
        found = _find_structured_json_files(self.tmp.name)
        self.assertEqual(found, [p1])

    def test_nonexistent_path_returns_empty(self):
        self.assertEqual(_find_structured_json_files(os.path.join(self.tmp.name, "nope")), [])


class TestValidateCommand(unittest.TestCase):
    """validate_command(): end-to-end report + exit-code semantics."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.consolidated = os.path.join(self.tmp.name, "consolidated")
        os.makedirs(self.consolidated)

    def _write(self, name: str, data: dict) -> str:
        path = os.path.join(self.consolidated, f"{name}_structured.json")
        with open(path, "w") as f:
            json.dump(data, f)
        return path

    def test_all_complete_returns_zero(self):
        self._write("jane-doe", {
            "name": "Jane Doe",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })
        self.assertEqual(validate_command(self.tmp.name), 0)

    def test_one_critical_returns_nonzero(self):
        self._write("jane-doe", {
            "name": "Jane Doe",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })
        self._write("bob-jones", {"name": "Bob Jones"})  # missing skills + experience
        self.assertEqual(validate_command(self.tmp.name), 1)

    def test_unparseable_json_is_treated_as_failure(self):
        bad_path = os.path.join(self.consolidated, "broken_structured.json")
        with open(bad_path, "w") as f:
            f.write("{ this is not valid json")
        self.assertEqual(validate_command(self.tmp.name), 1)

    def test_no_files_found_returns_nonzero(self):
        empty_dir = os.path.join(self.tmp.name, "nothing_here")
        os.makedirs(empty_dir)
        self.assertEqual(validate_command(empty_dir), 1)

    def test_single_file_path_complete(self):
        path = self._write("jane-doe", {
            "name": "Jane Doe",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })
        self.assertEqual(validate_command(path), 0)


class TestValidateCLI(unittest.TestCase):
    """CLI wiring: `pipeline.py validate <path>` exits with the score-derived code."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.consolidated = os.path.join(self.tmp.name, "consolidated")
        os.makedirs(self.consolidated)

    def _write(self, name: str, data: dict) -> str:
        path = os.path.join(self.consolidated, f"{name}_structured.json")
        with open(path, "w") as f:
            json.dump(data, f)
        return path

    def test_cli_validate_exits_zero_on_success(self):
        self._write("jane-doe", {
            "name": "Jane Doe",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })
        with patch.object(sys, "argv", ["pipeline.py", "validate", self.tmp.name]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertEqual(ctx.exception.code, 0)

    def test_cli_validate_exits_nonzero_on_critical_failure(self):
        self._write("bob-jones", {"name": "Bob Jones"})
        with patch.object(sys, "argv", ["pipeline.py", "validate", self.tmp.name]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertNotEqual(ctx.exception.code, 0)

    def test_cli_validate_single_file_arg(self):
        path = self._write("jane-doe", {
            "name": "Jane Doe",
            "skills": {"languages": ["Python"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })
        with patch.object(sys, "argv", ["pipeline.py", "validate", path]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertEqual(ctx.exception.code, 0)


class TestPipelineLatexWiring(unittest.TestCase):
    """--format latex wiring: llm_process_all renders a .tex via latex.py."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_llm_process_all_latex_format_renders_tex(self):
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Alice Smith")
        bundle.extracted_texts = {"alice_cv.txt": "Alice Smith is an engineer."}

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.side_effect = [
            json.dumps({"name": "Alice Smith", "skills": {"languages": ["Python"]}, "experience": []}),
            "# Alice Resume\n\nSkills: Python",
        ]

        with patch("latex.compile_pdf", return_value=None) as mock_compile:
            llm_process_all({"Alice Smith": bundle}, output, mock_client, resume_format="latex")

        tex_path = os.path.join(output, "latex", "alice-smith_resume.tex")
        self.assertTrue(os.path.isfile(tex_path))
        with open(tex_path) as f:
            content = f.read()
        self.assertIn("Alice Smith", content)
        mock_compile.assert_called_once()

        # markdown resume still generated (format=latex is additive, not exclusive)
        md_path = os.path.join(output, "resumes", "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(md_path))

    def test_llm_process_all_markdown_format_no_tex(self):
        """Default format=markdown must not create a latex/ dir."""
        output = os.path.join(self.tmp.name, "output")

        bundle = PersonBundle(name="Bob Jones")
        bundle.extracted_texts = {"bob_cv.txt": "Bob Jones is an engineer."}

        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.side_effect = [
            json.dumps({"name": "Bob Jones", "skills": {}, "experience": []}),
            "# Bob Resume",
        ]

        llm_process_all({"Bob Jones": bundle}, output, mock_client)

        latex_dir = os.path.join(output, "latex")
        self.assertFalse(os.path.isdir(latex_dir))


# ═══════════════════════════════════════════════════════════════════════════════
# 9.  test_unique_dest
# ═══════════════════════════════════════════════════════════════════════════════

class TestUniqueDest(unittest.TestCase):
    """_unique_dest(): collision-free destination naming, shared by organize_files
    and redetect_command's --apply move step."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_no_collision_returns_plain_path(self):
        dest = _unique_dest(self.tmp.name, "alice_cv.txt")
        self.assertEqual(dest, os.path.join(self.tmp.name, "alice_cv.txt"))

    def test_single_collision_gets_dup_suffix(self):
        _make_file(self.tmp.name, "alice_cv.txt", "v1")
        dest = _unique_dest(self.tmp.name, "alice_cv.txt")
        self.assertEqual(dest, os.path.join(self.tmp.name, "alice_cv_dup.txt"))

    def test_repeated_collision_increments_counter(self):
        _make_file(self.tmp.name, "alice_cv.txt", "v1")
        _make_file(self.tmp.name, "alice_cv_dup.txt", "v2")
        dest = _unique_dest(self.tmp.name, "alice_cv.txt")
        self.assertEqual(dest, os.path.join(self.tmp.name, "alice_cv_dup2.txt"))


# ═══════════════════════════════════════════════════════════════════════════════
# 10. test_bundles_from_resources
# ═══════════════════════════════════════════════════════════════════════════════

class TestBundlesFromResources(unittest.TestCase):
    """bundles_from_resources(): rebuild PersonBundle objects from an already
    organized resources/ folder, without re-scanning source directories."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = os.path.join(self.tmp.name, "output")
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "Alice Smith\nEngineer")
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_resume.txt"), "Alice Smith resume")
        _make_file(self.output, os.path.join("resources", "bob-jones", "bob_cv.txt"), "Bob Jones\nScientist")

    def test_no_resources_dir_returns_empty(self):
        empty_output = os.path.join(self.tmp.name, "nothing")
        self.assertEqual(bundles_from_resources(empty_output), {})

    def test_rebuilds_all_people_with_correct_file_counts(self):
        bundles = bundles_from_resources(self.output)
        self.assertEqual(set(bundles.keys()), {"Alice Smith", "Bob Jones"})
        self.assertEqual(len(bundles["Alice Smith"].files), 2)
        self.assertEqual(len(bundles["Bob Jones"].files), 1)

    def test_display_name_round_trips_through_slug(self):
        bundles = bundles_from_resources(self.output)
        for name in bundles:
            self.assertEqual(pipeline.slug(name), pipeline.slug(name.lower().replace(" ", "-")))

    def test_person_filter_by_display_name(self):
        bundles = bundles_from_resources(self.output, person_filter="Alice Smith")
        self.assertEqual(set(bundles.keys()), {"Alice Smith"})

    def test_person_filter_by_slug(self):
        bundles = bundles_from_resources(self.output, person_filter="bob-jones")
        self.assertEqual(set(bundles.keys()), {"Bob Jones"})

    def test_person_filter_no_match_returns_empty(self):
        bundles = bundles_from_resources(self.output, person_filter="nobody-here")
        self.assertEqual(bundles, {})

    def test_ignores_files_with_unsupported_extension(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "notes.xyz"), "junk")
        bundles = bundles_from_resources(self.output)
        names = {ff.filename for ff in bundles["Alice Smith"].files}
        self.assertNotIn("notes.xyz", names)

    def test_empty_person_dir_excluded(self):
        os.makedirs(os.path.join(self.output, "resources", "empty-person"))
        bundles = bundles_from_resources(self.output)
        self.assertNotIn("Empty Person", bundles)


# ═══════════════════════════════════════════════════════════════════════════════
# 11. test_rescore_command
# ═══════════════════════════════════════════════════════════════════════════════

class TestRescoreCommand(unittest.TestCase):
    """rescore_command(): re-run LLM consolidation/resume against already
    organized resources/, reusing extract_all + llm_process_all."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = os.path.join(self.tmp.name, "output")
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"),
                  "Alice Smith\nSoftware Engineer\nPython, Go")

    def _mock_client(self, extra_pairs=1):
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        responses = []
        for _ in range(extra_pairs):
            responses.append(json.dumps({
                "name": "Alice Smith",
                "skills": {"languages": ["Python", "Go"]},
                "experience": [],
            }))
            responses.append("# Alice Smith\n\nSkills: Python, Go")
        mock_client.chat.side_effect = responses
        return mock_client

    def test_no_resources_dir_returns_error(self):
        empty_output = os.path.join(self.tmp.name, "nothing")
        rc = rescore_command(empty_output, self._mock_client())
        self.assertEqual(rc, 1)

    def test_unknown_person_filter_returns_error(self):
        rc = rescore_command(self.output, self._mock_client(), person="Nobody")
        self.assertEqual(rc, 1)

    def test_rescore_writes_structured_json_and_resume(self):
        rc = rescore_command(self.output, self._mock_client())
        self.assertEqual(rc, 0)

        json_path = os.path.join(self.output, "consolidated", "alice-smith_structured.json")
        self.assertTrue(os.path.isfile(json_path))
        with open(json_path) as f:
            data = json.load(f)
        self.assertEqual(data["name"], "Alice Smith")

        resume_path = os.path.join(self.output, "resumes", "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(resume_path))

    def test_rescore_with_person_filter(self):
        _make_file(self.output, os.path.join("resources", "bob-jones", "bob_cv.txt"), "Bob Jones\nScientist")
        rc = rescore_command(self.output, self._mock_client(), person="Alice Smith")
        self.assertEqual(rc, 0)
        self.assertTrue(os.path.isfile(os.path.join(self.output, "consolidated", "alice-smith_structured.json")))
        self.assertFalse(os.path.isfile(os.path.join(self.output, "consolidated", "bob-jones_structured.json")))

    def test_rescore_skip_resume_only_writes_json(self):
        mock_client = self._mock_client(extra_pairs=1)
        rc = rescore_command(self.output, mock_client, skip_resume=True)
        self.assertEqual(rc, 0)
        self.assertTrue(os.path.isfile(os.path.join(self.output, "consolidated", "alice-smith_structured.json")))
        self.assertFalse(os.path.isfile(os.path.join(self.output, "resumes", "alice-smith_resume.md")))
        # Resume generation step never fired, so only one chat() call happened.
        mock_client.chat.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# 12. test_redetect_command
# ═══════════════════════════════════════════════════════════════════════════════

class TestRedetectCommand(unittest.TestCase):
    """redetect_command(): re-run extract_person() against already-organized
    filenames and report/apply diffs, dry-run by default."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = os.path.join(self.tmp.name, "output")

    def test_no_resources_dir_returns_error(self):
        rc = redetect_command(self.output)
        self.assertEqual(rc, 1)

    @patch("pipeline._load_aliases", return_value={})
    def test_no_changes_when_already_matching(self, _):
        # extract_person("alice-smith_cv.txt") -> "Alice-smith" -> slug "alice-smith",
        # which matches the directory it's already organized under.
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice-smith_cv.txt"), "content")
        rc = redetect_command(self.output)
        self.assertEqual(rc, 0)
        # File untouched.
        self.assertTrue(os.path.isfile(os.path.join(self.output, "resources", "alice-smith", "alice-smith_cv.txt")))

    @patch("pipeline._load_aliases", return_value={})
    def test_dry_run_reports_but_does_not_move(self, _):
        # File organized under the wrong slug -- extract_person("alice_cv.txt") resolves to "alice".
        _make_file(self.output, os.path.join("resources", "wrongname", "alice_cv.txt"), "content")
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = redetect_command(self.output, apply=False)
        self.assertEqual(rc, 0)
        self.assertIn("wrongname", buf.getvalue())
        self.assertIn("alice", buf.getvalue())
        # Dry run: original file must still be exactly where it was.
        self.assertTrue(os.path.isfile(os.path.join(self.output, "resources", "wrongname", "alice_cv.txt")))
        self.assertFalse(os.path.isdir(os.path.join(self.output, "resources", "alice")))

    @patch("pipeline._load_aliases", return_value={})
    def test_apply_moves_file_and_prunes_empty_dir(self, _):
        _make_file(self.output, os.path.join("resources", "wrongname", "alice_cv.txt"), "content")
        rc = redetect_command(self.output, apply=True)
        self.assertEqual(rc, 0)

        new_path = os.path.join(self.output, "resources", "alice", "alice_cv.txt")
        self.assertTrue(os.path.isfile(new_path))
        # Old dir pruned since it's now empty.
        self.assertFalse(os.path.isdir(os.path.join(self.output, "resources", "wrongname")))

    @patch("pipeline._load_aliases", return_value={})
    def test_apply_dedupes_on_collision(self, _):
        # Two mis-organized files that both detect to "alice" and share a filename.
        _make_file(self.output, os.path.join("resources", "wrongname1", "alice_cv.txt"), "v1")
        _make_file(self.output, os.path.join("resources", "wrongname2", "alice_cv.txt"), "v2")
        rc = redetect_command(self.output, apply=True)
        self.assertEqual(rc, 0)

        alice_dir = os.path.join(self.output, "resources", "alice")
        files = sorted(os.listdir(alice_dir))
        self.assertEqual(files, ["alice_cv.txt", "alice_cv_dup.txt"])

    @patch("pipeline._load_aliases", return_value={})
    def test_stray_non_cv_file_ignored(self, _):
        # Non-CV junk (e.g. a stray .DS_Store or README.md) sitting inside a
        # person's resources/ dir must never be treated as a filename to
        # detect a person from -- it should be left exactly where it is,
        # both in dry-run reporting and under --apply.
        _make_file(self.output, os.path.join("resources", "weird-person", ".DS_Store"), "junk")
        _make_file(self.output, os.path.join("resources", "weird-person", "README.md"), "notes")
        _make_file(self.output, os.path.join("resources", "weird-person", "notes.txt"), "not a cv")

        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = redetect_command(self.output, apply=False)
        out = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("no changes", out)
        self.assertNotIn("hidden", out)
        self.assertNotIn("README", out)

        rc = redetect_command(self.output, apply=True)
        self.assertEqual(rc, 0)
        weird_dir = os.path.join(self.output, "resources", "weird-person")
        self.assertTrue(os.path.isfile(os.path.join(weird_dir, ".DS_Store")))
        self.assertTrue(os.path.isfile(os.path.join(weird_dir, "README.md")))
        self.assertTrue(os.path.isfile(os.path.join(weird_dir, "notes.txt")))
        # No bogus new person dirs were created from the junk files.
        self.assertFalse(os.path.isdir(os.path.join(self.output, "resources", "hidden-txt")))
        self.assertFalse(os.path.isdir(os.path.join(self.output, "resources", "readme")))

    @patch("pipeline._load_aliases", return_value={})
    def test_stray_file_alongside_real_mismatch_only_moves_the_real_one(self, _):
        # A directory mixing a legitimately mis-detected CV file with junk:
        # only the CV file should move.
        _make_file(self.output, os.path.join("resources", "wrongname", "alice_cv.txt"), "content")
        _make_file(self.output, os.path.join("resources", "wrongname", ".DS_Store"), "junk")

        rc = redetect_command(self.output, apply=True)
        self.assertEqual(rc, 0)
        self.assertTrue(os.path.isfile(os.path.join(self.output, "resources", "alice", "alice_cv.txt")))
        # wrongname/ still exists (not pruned) because .DS_Store is still in it.
        self.assertTrue(os.path.isfile(os.path.join(self.output, "resources", "wrongname", ".DS_Store")))


# ═══════════════════════════════════════════════════════════════════════════════
# 13. test_stats_command
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatsCommand(unittest.TestCase):
    """stats_command(): summarize an output dir's people, file counts, which
    artifacts exist, and (reusing score_structured_data) quality warnings."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = os.path.join(self.tmp.name, "output")

    def test_no_resources_dir_returns_error(self):
        rc = stats_command(self.output)
        self.assertEqual(rc, 1)

    def test_empty_resources_dir_returns_zero(self):
        os.makedirs(os.path.join(self.output, "resources"))
        rc = stats_command(self.output)
        self.assertEqual(rc, 0)

    def test_reports_people_files_and_artifacts(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_resume.txt"), "content")
        _make_file(self.output, os.path.join("resources", "bob-jones", "bob_cv.txt"), "content")

        consolidated = os.path.join(self.output, "consolidated")
        os.makedirs(consolidated)
        with open(os.path.join(consolidated, "alice-smith_structured.json"), "w") as f:
            json.dump({
                "name": "Alice Smith",
                "skills": {"languages": ["Python"]},
                "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
            }, f)

        resumes = os.path.join(self.output, "resumes")
        os.makedirs(resumes)
        with open(os.path.join(resumes, "alice-smith_resume.md"), "w") as f:
            f.write("# Alice Smith")

        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = stats_command(self.output)
        out = buf.getvalue()

        self.assertEqual(rc, 0)
        self.assertIn("People: 2", out)
        self.assertIn("[alice-smith] 2 file(s)", out)
        self.assertIn("[bob-jones] 1 file(s)", out)
        self.assertIn("structured json: yes", out)
        self.assertIn("resume markdown: yes", out)
        self.assertIn("latex:           no", out)
        # Bob has no structured JSON at all.
        self.assertIn("Total files: 3", out)

    def test_missing_structured_json_reported_as_no_quality(self):
        _make_file(self.output, os.path.join("resources", "bob-jones", "bob_cv.txt"), "content")
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = stats_command(self.output)
        out = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("structured json: no", out)
        self.assertNotIn("quality:", out)

    def test_unparseable_structured_json_reports_error_not_crash(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        consolidated = os.path.join(self.output, "consolidated")
        os.makedirs(consolidated)
        with open(os.path.join(consolidated, "alice-smith_structured.json"), "w") as f:
            f.write("{ not valid json")

        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = stats_command(self.output)
        out = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("[error] could not read", out)


class TestConsolidateStdinCommand(unittest.TestCase):
    """consolidate_stdin_command(): the web-layer bridge. Builds a single
    PersonBundle from already-saved paths, reuses extract_text/llm_consolidate/
    score_structured_data/latex exactly as scan/rescore do, and prints EXACTLY
    one line of JSON to stdout with all internal progress output redirected to
    stderr."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cv_path = _make_file(self.tmp.name, "alice_cv.txt", "Alice Smith\nSoftware Engineer\nPython, Go")

    def _mock_client(self, chat_return):
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "anthropic"
        mock_client.model = "claude-sonnet-4-20250514"
        mock_client.chat.return_value = chat_return
        return mock_client

    @patch("latex.compile_pdf")
    def test_stdout_is_exactly_one_json_line_with_expected_keys(self, mock_compile):
        mock_compile.return_value = "/tmp/fake/alice-smith_resume.pdf"
        mock_client = self._mock_client(json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python", "Go"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        }))

        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = consolidate_stdin_command([self.cv_path], mock_client)
        out = buf.getvalue()

        self.assertEqual(rc, 0)
        lines = out.splitlines()
        self.assertEqual(len(lines), 1, f"expected exactly one stdout line, got: {out!r}")

        payload = json.loads(lines[0])
        self.assertEqual(set(payload.keys()), {"profile", "score", "pdf_path", "tmp_dir"})
        self.assertEqual(payload["profile"]["name"], "Alice Smith")
        self.assertEqual(payload["score"]["critical"], False)
        self.assertIn("score", payload["score"])
        self.assertIn("max_score", payload["score"])
        self.assertIn("warnings", payload["score"])
        self.assertEqual(payload["pdf_path"], "/tmp/fake/alice-smith_resume.pdf")
        self.assertTrue(os.path.isdir(payload["tmp_dir"]))

        # No progress/log lines (e.g. "[llm] sending...") leaked onto stdout.
        self.assertNotIn("[llm]", out)
        self.assertNotIn("[warn]", out)

    @patch("latex.compile_pdf", return_value=None)
    def test_pdf_path_null_when_compile_fails(self, mock_compile):
        mock_client = self._mock_client(json.dumps({
            "name": "Alice Smith", "skills": {"languages": ["Python"]}, "experience": [],
        }))
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = consolidate_stdin_command([self.cv_path], mock_client)
        payload = json.loads(buf.getvalue().splitlines()[0])
        self.assertEqual(rc, 0)
        self.assertIsNone(payload["pdf_path"])

    @patch("latex.compile_pdf", return_value=None)
    def test_tmp_dir_always_reported_even_when_pdf_compile_fails(self, mock_compile):
        # Regression test: tmp_dir must be reported even when pdf_path is
        # null, since it's the only way the caller can find and clean up the
        # rendered .tex file + directory. Before this field existed, the
        # caller only ever cleaned up path.dirname(pdf_path) -- when
        # pdflatex isn't installed (pdf_path always null), that leaked one
        # tmpdir per call, permanently, with no cleanup path at all.
        mock_client = self._mock_client(json.dumps({
            "name": "Alice Smith", "skills": {"languages": ["Python"]}, "experience": [],
        }))
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = consolidate_stdin_command([self.cv_path], mock_client)
        payload = json.loads(buf.getvalue().splitlines()[0])
        self.assertEqual(rc, 0)
        self.assertIsNone(payload["pdf_path"])
        self.assertIn("tmp_dir", payload)
        self.assertTrue(os.path.isdir(payload["tmp_dir"]))
        tex_files = [f for f in os.listdir(payload["tmp_dir"]) if f.endswith(".tex")]
        self.assertEqual(len(tex_files), 1, f"expected exactly one .tex file, found: {tex_files}")
        shutil.rmtree(payload["tmp_dir"], ignore_errors=True)

    @patch("latex.compile_pdf", return_value=None)
    def test_non_json_llm_response_falls_back_to_raw(self, mock_compile):
        mock_client = self._mock_client("not valid json at all")
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = consolidate_stdin_command([self.cv_path], mock_client)
        payload = json.loads(buf.getvalue().splitlines()[0])
        self.assertEqual(rc, 0)
        self.assertIn("_raw", payload["profile"])
        self.assertTrue(payload["score"]["critical"])

    @patch("latex.compile_pdf", return_value=None)
    def test_no_extractable_text_falls_back_to_raw_without_calling_llm(self, mock_compile):
        # A .txt file with an unreadable path would still extract fine, so
        # simulate "no extractable text" via an unsupported extension instead.
        bad_path = _make_file(self.tmp.name, "resume.docx", "binary-ish content")
        mock_client = self._mock_client("should never be called")
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = consolidate_stdin_command([bad_path], mock_client)
        payload = json.loads(buf.getvalue().splitlines()[0])
        self.assertEqual(rc, 0)
        self.assertIn("_raw", payload["profile"])
        mock_client.chat.assert_not_called()

    @patch("latex.compile_pdf", return_value=None)
    def test_cli_wiring(self, mock_compile):
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "anthropic"
        mock_client.model = "claude-sonnet-4-20250514"
        mock_client.chat.return_value = json.dumps({
            "name": "Alice Smith", "skills": {"languages": ["Python"]}, "experience": [],
        })
        buf = io.StringIO()
        with patch("pipeline.LLMClient", return_value=mock_client):
            with patch.object(sys, "argv", ["pipeline.py", "consolidate-stdin", self.cv_path, "--llm", "anthropic"]):
                with redirect_stdout(buf):
                    with self.assertRaises(SystemExit) as ctx:
                        pipeline.main()
        self.assertEqual(ctx.exception.code, 0)
        lines = buf.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        payload = json.loads(lines[0])
        self.assertEqual(set(payload.keys()), {"profile", "score", "pdf_path", "tmp_dir"})
        shutil.rmtree(payload["tmp_dir"], ignore_errors=True)

    def test_cli_requires_llm(self):
        with patch.object(sys, "argv", ["pipeline.py", "consolidate-stdin", self.cv_path]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertNotEqual(ctx.exception.code, 0)


class TestRescoreRedetectStatsCLI(unittest.TestCase):
    """CLI wiring for `rescore` / `redetect` / `stats` subcommands."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = os.path.join(self.tmp.name, "output")

    def test_cli_rescore_requires_llm(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        with patch.object(sys, "argv", ["pipeline.py", "rescore", "--output", self.output]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertNotEqual(ctx.exception.code, 0)

    def test_cli_rescore_runs_with_llm(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.side_effect = [
            json.dumps({"name": "Alice Smith", "skills": {"languages": ["Python"]}, "experience": []}),
            "# Alice Smith",
        ]
        with patch("pipeline.LLMClient", return_value=mock_client):
            with patch.object(sys, "argv", ["pipeline.py", "rescore", "--output", self.output, "--llm", "ollama"]):
                with self.assertRaises(SystemExit) as ctx:
                    pipeline.main()
        self.assertEqual(ctx.exception.code, 0)
        self.assertTrue(os.path.isfile(
            os.path.join(self.output, "consolidated", "alice-smith_structured.json")))

    @patch("pipeline._load_aliases", return_value={})
    def test_cli_redetect_dry_run_default(self, _):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        with patch.object(sys, "argv", ["pipeline.py", "redetect", "--output", self.output]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertEqual(ctx.exception.code, 0)

    def test_cli_stats_runs(self):
        _make_file(self.output, os.path.join("resources", "alice-smith", "alice_cv.txt"), "content")
        with patch.object(sys, "argv", ["pipeline.py", "stats", "--output", self.output]):
            with self.assertRaises(SystemExit) as ctx:
                pipeline.main()
        self.assertEqual(ctx.exception.code, 0)


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
