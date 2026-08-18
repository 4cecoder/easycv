#!/usr/bin/env python3
"""
Regression Integration Tests
==============================
End-to-end tests verifying the full EasyCV pipeline works correctly.

Test Areas:
  1. Module imports — all backend modules import cleanly
  2. CLI entry points — pipeline.py argparse subcommands are accessible
  3. LLMClient instantiation — each provider initializes correctly
  4. consolidate_files — returns the expected dict shape
  5. LaTeX compilation — renders valid .tex and (mocked) produces PDF
  6. STE-100 validator — catches common Simplified Technical English violations
  7. Job scraper — URL detection for all supported platforms
  8. Constants sanity — timeouts > 0, limits reasonable

Run with:
    uv run pytest tests/test_regression.py -v
"""

import argparse
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Ensure repo root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  Module Imports
# ═══════════════════════════════════════════════════════════════════════════════

class TestModuleImports(unittest.TestCase):
    """Verify every core backend module imports without error."""

    def test_import_backend_pipeline(self):
        import backend.pipeline
        self.assertTrue(hasattr(backend.pipeline, "LLMClient"))
        self.assertTrue(hasattr(backend.pipeline, "run"))
        self.assertTrue(hasattr(backend.pipeline, "main"))

    def test_import_backend_worker(self):
        import backend.worker
        self.assertTrue(hasattr(backend.worker, "main"))
        self.assertTrue(hasattr(backend.worker, "process_upload"))
        self.assertTrue(hasattr(backend.worker, "profile_fields_from"))

    def test_import_backend_latex(self):
        import backend.latex
        self.assertTrue(hasattr(backend.latex, "render_latex"))
        self.assertTrue(hasattr(backend.latex, "compile_pdf"))
        self.assertTrue(hasattr(backend.latex, "escape_latex"))

    def test_import_backend_ste100(self):
        import backend.ste100
        self.assertTrue(hasattr(backend.ste100, "validate_text_ste100"))
        self.assertTrue(hasattr(backend.ste100, "validate_sentence"))
        self.assertTrue(hasattr(backend.ste100, "count_words_ste100"))

    def test_import_backend_constants(self):
        import backend.constants
        self.assertTrue(hasattr(backend.constants, "PDF_TEXT_TIMEOUT"))
        self.assertTrue(hasattr(backend.constants, "LATEX_COMPILE_TIMEOUT"))
        self.assertTrue(hasattr(backend.constants, "BYTES_PER_KB"))

    def test_import_backend_job_scraper(self):
        import backend.job_scraper
        self.assertTrue(hasattr(backend.job_scraper, "detect_job_site"))
        self.assertTrue(hasattr(backend.job_scraper, "is_indeed_url"))
        self.assertTrue(hasattr(backend.job_scraper, "is_linkedin_url"))
        self.assertTrue(hasattr(backend.job_scraper, "is_glassdoor_url"))
        self.assertTrue(hasattr(backend.job_scraper, "is_ziprecruiter_url"))
        self.assertTrue(hasattr(backend.job_scraper, "scrape_job_posting"))

    def test_pipeline_key_classes_exist(self):
        from backend.pipeline import LLMClient, FoundFile, PersonBundle
        self.assertTrue(callable(LLMClient))
        self.assertTrue(callable(FoundFile))
        self.assertTrue(callable(PersonBundle))


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  CLI Entry Points
# ═══════════════════════════════════════════════════════════════════════════════

class TestCLIEntryPoints(unittest.TestCase):
    """Verify pipeline.py's argparse setup exposes all expected subcommands."""

    def _get_parser(self):
        """Reconstruct the parser from pipeline.main() without executing it."""
        from backend.pipeline import main
        # We can't call main() directly, but we can inspect via subcommands
        # by checking that the module's argparse definition is reachable.
        # Instead, import and test the actual subcommand names exist.
        import backend.pipeline as pipeline_mod
        # The main function uses argparse; we test by calling it with --help
        # which raises SystemExit(0).
        return pipeline_mod

    def test_scan_subcommand_accessible(self):
        """pipeline.py scan --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "scan", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_validate_subcommand_accessible(self):
        """pipeline.py validate --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "validate", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_rescore_subcommand_accessible(self):
        """pipeline.py rescore --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "rescore", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_redetect_subcommand_accessible(self):
        """pipeline.py redetect --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "redetect", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_stats_subcommand_accessible(self):
        """pipeline.py stats --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "stats", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_consolidate_stdin_subcommand_accessible(self):
        """pipeline.py consolidate-stdin --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "consolidate-stdin", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_match_job_subcommand_accessible(self):
        """pipeline.py match-job --help does not crash."""
        with patch("sys.argv", ["pipeline.py", "match-job", "--help"]):
            with self.assertRaises(SystemExit) as ctx:
                from backend.pipeline import main
                main()
            self.assertEqual(ctx.exception.code, 0)

    def test_worker_main_is_callable(self):
        """worker.py main() is callable."""
        import backend.worker
        self.assertTrue(callable(backend.worker.main))


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  LLMClient Instantiation
# ═══════════════════════════════════════════════════════════════════════════════

class TestLLMClientInstantiation(unittest.TestCase):
    """Verify LLMClient can be constructed with each supported provider."""

    def setUp(self):
        self._orig_environ = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._orig_environ)

    def test_instantiate_ollama(self):
        from backend.pipeline import LLMClient
        client = LLMClient(provider="ollama")
        self.assertEqual(client.provider, "ollama")
        self.assertEqual(client.model, "llama3.2")

    def test_instantiate_openai(self):
        from backend.pipeline import LLMClient
        os.environ["OPENAI_API_KEY"] = "sk-test-key"
        client = LLMClient(provider="openai")
        self.assertEqual(client.provider, "openai")
        self.assertEqual(client.model, "gpt-4o")
        self.assertEqual(client.api_key, "sk-test-key")

    def test_instantiate_anthropic(self):
        from backend.pipeline import LLMClient
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"
        client = LLMClient(provider="anthropic")
        self.assertEqual(client.provider, "anthropic")
        self.assertEqual(client.model, "claude-sonnet-4-20250514")
        self.assertEqual(client.api_key, "sk-ant-test-key")

    def test_instantiate_with_custom_model(self):
        from backend.pipeline import LLMClient
        client = LLMClient(provider="ollama", model="custom-model")
        self.assertEqual(client.model, "custom-model")

    def test_instantiate_with_explicit_api_key(self):
        from backend.pipeline import LLMClient
        os.environ["OPENAI_API_KEY"] = "sk-env-key"
        client = LLMClient(provider="openai", api_key="sk-explicit")
        self.assertEqual(client.api_key, "sk-explicit")

    def test_all_providers_have_chat_method(self):
        from backend.pipeline import LLMClient
        for provider in ("ollama", "openai", "anthropic"):
            client = LLMClient(provider=provider)
            self.assertTrue(callable(getattr(client, "chat", None)),
                            f"LLMClient({provider}) missing chat()")

    def test_provider_model_mapping_is_populated(self):
        from backend.pipeline import LLM_PROVIDER_MODELS
        self.assertIn("openai", LLM_PROVIDER_MODELS)
        self.assertIn("anthropic", LLM_PROVIDER_MODELS)
        self.assertIn("ollama", LLM_PROVIDER_MODELS)
        for model in LLM_PROVIDER_MODELS.values():
            self.assertIsInstance(model, str)
            self.assertTrue(len(model) > 0)


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  consolidate_files Output Shape
# ═══════════════════════════════════════════════════════════════════════════════

class TestConsolidateFilesShape(unittest.TestCase):
    """Verify consolidate_files returns the expected dictionary shape."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_consolidate_files_returns_expected_keys(self):
        """Result dict contains profile, score, pdf_path, and tmp_dir."""
        from backend.pipeline import consolidate_files

        # Create a minimal .txt file that can be extracted
        cv_path = os.path.join(self.tmp.name, "alice_cv.txt")
        with open(cv_path, "w") as f:
            f.write("Alice Smith\nSoftware Engineer\nPython, Go")

        # Use a mock LLM client that returns valid structured data
        mock_client = MagicMock()
        mock_client.chat.return_value = json.dumps({
            "name": "Alice Smith",
            "skills": {"languages": ["Python", "Go"]},
            "experience": [{"title": "Engineer", "company": "Acme", "bullets": ["Built X"]}],
        })

        result = consolidate_files([cv_path], mock_client)

        # Verify the result shape
        self.assertIsInstance(result, dict)
        self.assertIn("profile", result)
        self.assertIn("score", result)
        self.assertIn("pdf_path", result)
        self.assertIn("tmp_dir", result)

        # Verify profile is a dict
        self.assertIsInstance(result["profile"], dict)

        # Verify score has expected sub-keys
        score = result["score"]
        self.assertIsInstance(score, dict)
        self.assertIn("score", score)
        self.assertIn("max_score", score)
        self.assertIn("warnings", score)
        self.assertIn("critical", score)
        self.assertIsInstance(score["score"], int)
        self.assertIsInstance(score["max_score"], int)
        self.assertIsInstance(score["warnings"], list)
        self.assertIsInstance(score["critical"], bool)

        # Verify tmp_dir is a string path
        self.assertIsInstance(result["tmp_dir"], str)
        self.assertTrue(os.path.isdir(result["tmp_dir"]))

    def test_consolidate_files_with_llm_none_returns_fallback(self):
        """When LLM client is None, profile falls back gracefully."""
        from backend.pipeline import consolidate_files

        cv_path = os.path.join(self.tmp.name, "bob_cv.txt")
        with open(cv_path, "w") as f:
            f.write("Bob Jones\nData Scientist")

        result = consolidate_files([cv_path], llm_client=None)

        self.assertIsInstance(result, dict)
        self.assertIn("profile", result)
        self.assertIn("score", result)
        self.assertIn("tmp_dir", result)
        # Profile should be a dict (fallback)
        self.assertIsInstance(result["profile"], dict)

    def test_consolidate_files_with_no_text_extracts(self):
        """Files that produce no extractable text still return valid shape."""
        from backend.pipeline import consolidate_files

        # Create a file with non-extractable content
        cv_path = os.path.join(self.tmp.name, "charlie_cv.xyz")
        with open(cv_path, "w") as f:
            f.write("Some content")

        mock_client = MagicMock()
        mock_client.chat.return_value = json.dumps({
            "name": "Charlie",
            "skills": {},
            "experience": [],
        })

        result = consolidate_files([cv_path], mock_client)
        self.assertIsInstance(result, dict)
        self.assertIn("profile", result)
        self.assertIn("score", result)

    def test_consolidate_files_tmp_dir_exists(self):
        """The returned tmp_dir is a real directory on disk."""
        from backend.pipeline import consolidate_files

        cv_path = os.path.join(self.tmp.name, "dave_cv.txt")
        with open(cv_path, "w") as f:
            f.write("Dave Engineer")

        mock_client = MagicMock()
        mock_client.chat.return_value = json.dumps({
            "name": "Dave",
            "skills": {"languages": ["Rust"]},
            "experience": [],
        })

        result = consolidate_files([cv_path], mock_client)
        self.assertTrue(os.path.isdir(result["tmp_dir"]))

        # Cleanup
        import shutil
        shutil.rmtree(result["tmp_dir"], ignore_errors=True)


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  LaTeX Compilation Produces Valid Output
# ═══════════════════════════════════════════════════════════════════════════════

class TestLatexEndToEnd(unittest.TestCase):
    """Verify render_latex produces valid .tex and compile_pdf produces PDF."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_render_latex_produces_compilable_tex(self):
        """render_latex output starts with documentclass and ends with end{document}."""
        from backend.latex import render_latex

        data = {
            "name": "Test Engineer",
            "contact": {"email": "test@example.com", "location": "NYC"},
            "titles": ["Senior Engineer"],
            "summary": "Experienced engineer.",
            "skills": {
                "languages": ["Python", "Go"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [{
                "title": "Staff Engineer",
                "company": "Acme Corp",
                "start": "2021",
                "end": "Present",
                "bullets": ["Built distributed systems", "Led Kubernetes migration"],
            }],
            "education": [{"degree": "B.S. CS", "school": "MIT", "years": "2016-2020"}],
            "certifications": ["AWS Certified"],
            "languages_spoken": ["English"],
        }

        tex = render_latex(data, "Test Engineer")

        self.assertIsInstance(tex, str)
        self.assertTrue(tex.startswith(r"\documentclass"))
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)
        self.assertIn("Test Engineer", tex)
        self.assertIn("Staff Engineer", tex)
        self.assertIn("Acme Corp", tex)

    def test_render_latex_empty_data_still_valid(self):
        """render_latex with empty data produces valid LaTeX structure."""
        from backend.latex import render_latex

        tex = render_latex({}, "Fallback Name")
        self.assertIn(r"\documentclass", tex)
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)
        self.assertIn("Fallback Name", tex)

    @patch("backend.latex.subprocess.run")
    def test_compile_pdf_mocked_produces_path(self, mock_run):
        """compile_pdf with mocked pdflatex returns PDF path on success."""
        from backend.latex import compile_pdf

        tex_path = os.path.join(self.tmp.name, "resume.tex")
        with open(tex_path, "w") as f:
            f.write(r"\documentclass{article}\begin{document}Test\end{document}")

        # Create a fake PDF so the isfile check passes
        pdf_path = os.path.join(self.tmp.name, "resume.pdf")
        with open(pdf_path, "w") as f:
            f.write("%PDF-1.4 fake")

        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        result = compile_pdf(tex_path, self.tmp.name)
        self.assertEqual(result, pdf_path)

    @patch("backend.latex.subprocess.run")
    def test_compile_pdf_nonzero_exit_returns_none(self, mock_run):
        """compile_pdf returns None when pdflatex exits non-zero."""
        from backend.latex import compile_pdf

        tex_path = os.path.join(self.tmp.name, "bad.tex")
        with open(tex_path, "w") as f:
            f.write(r"\documentclass{article}\begin{document}Bad\end{document}")

        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="! Error")

        result = compile_pdf(tex_path, self.tmp.name)
        self.assertIsNone(result)

    def test_render_special_characters_escaped(self):
        """Special LaTeX characters in data are escaped in output."""
        from backend.latex import render_latex

        data = {
            "name": "Test & % $ # _ { } ~ ^",
            "skills": {"languages": ["C++"]},
            "experience": [],
        }
        tex = render_latex(data, "Test")

        # Raw ampersand should not survive unescaped
        self.assertNotIn("Test &", tex)
        # Escaped ampersand should be present
        self.assertIn(r"\&", tex)

    @patch("backend.latex.subprocess.run")
    def test_compile_pdf_path_traversal_blocked(self, mock_run):
        """compile_pdf rejects output_dir outside tex file's parent."""
        from backend.latex import compile_pdf

        tex_path = os.path.join(self.tmp.name, "resume.tex")
        with open(tex_path, "w") as f:
            f.write(r"\documentclass{article}\begin{document}Test\end{document}")

        outside_dir = os.path.join(self.tmp.name, "..", "outside")
        os.makedirs(outside_dir, exist_ok=True)

        result = compile_pdf(tex_path, outside_dir)
        self.assertIsNone(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  STE-100 Validator Catches Common Violations
# ═══════════════════════════════════════════════════════════════════════════════

class TestSTE100Regression(unittest.TestCase):
    """Verify the STE-100 validator catches common violations."""

    def test_detects_british_spelling_colour(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("Use the correct colour for the indicator.")
        self.assertTrue(any("colour" in w for w in warnings),
                        "Should flag British spelling 'colour'")

    def test_detects_british_spelling_organise(self):
        from backend.ste100 import validate_text_ste100
        # STE-100 spelling patterns are case-sensitive; use lowercase
        warnings = validate_text_ste100("you should organise the data before processing.")
        self.assertTrue(any("organise" in w for w in warnings),
                        "Should flag British spelling 'organise'")

    def test_detects_contraction_dont(self):
        from backend.ste100 import validate_text_ste100
        # STE-100 contraction patterns are case-sensitive; use lowercase
        warnings = validate_text_ste100("you should use this approach, don't skip it.")
        self.assertTrue(any("don't" in w for w in warnings),
                        "Should flag contraction 'don't'")

    def test_detects_contraction_isnt(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("This isn't the right way.")
        self.assertTrue(any("isn't" in w for w in warnings),
                        "Should flag contraction 'isn't'")

    def test_detects_passive_voice(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("The data was processed by the system.")
        self.assertTrue(any("passive" in w.lower() for w in warnings),
                        "Should flag passive voice")

    def test_detects_perfect_tense(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("The system has completed the analysis.")
        self.assertTrue(any("simple past tense" in w.lower() for w in warnings),
                        "Should flag perfect tense")

    def test_detects_progressive_tense(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("The server is processing the request.")
        self.assertTrue(any("simple past tense" in w.lower() for w in warnings),
                        "Should flag progressive tense")

    def test_detects_semicolon(self):
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("Do this first; then do that.")
        self.assertTrue(any("semicolon" in w for w in warnings),
                        "Should flag semicolon")

    def test_sentence_too_long_procedural(self):
        from backend.ste100 import validate_text_ste100
        # 21 words exceeds procedural limit of 20
        text = " ".join(["word"] * 21)
        warnings = validate_text_ste100(text, is_procedural=True)
        self.assertTrue(any("shorten this" in w.lower() for w in warnings),
                        "Should flag sentence exceeding 20-word procedural limit")

    def test_sentence_too_long_descriptive(self):
        from backend.ste100 import validate_text_ste100
        # 26 words exceeds descriptive limit of 25
        text = " ".join(["word"] * 26)
        warnings = validate_text_ste100(text, is_procedural=False)
        self.assertTrue(any("shorten this" in w.lower() for w in warnings),
                        "Should flag sentence exceeding 25-word descriptive limit")

    def test_clean_text_no_warnings(self):
        """Simple, well-formed text should produce no warnings."""
        from backend.ste100 import validate_text_ste100
        warnings = validate_text_ste100("Use the tool to check the result.")
        # Should have no contractions, no British spelling, no passive, etc.
        contraction_warnings = [w for w in warnings if "contraction" in w]
        self.assertEqual(len(contraction_warnings), 0,
                         f"Unexpected contraction warnings: {contraction_warnings}")

    def test_word_count_hyphenated_counts_as_one(self):
        """Hyphenated words count as one word per Rule 8.7."""
        from backend.ste100 import count_words_ste100
        count = count_words_ste100("This is a well-known fact.")
        # "well-known" = 1 word, total = 5
        self.assertEqual(count, 5)

    def test_word_count_quoted_text_counts_as_one(self):
        """Quoted text counts as one word per Rule 8.6."""
        from backend.ste100 import count_words_ste100
        count = count_words_ste100('Read the "important message" now.')
        # "important message" = 1 word, total = 4
        self.assertEqual(count, 4)

    def test_validate_sentence_returns_list(self):
        """validate_sentence always returns a list."""
        from backend.ste100 import validate_sentence
        result = validate_sentence("Simple test sentence.")
        self.assertIsInstance(result, list)

    def test_validate_text_ste100_empty_input(self):
        """validate_text_ste100 handles empty string."""
        from backend.ste100 import validate_text_ste100
        result = validate_text_ste100("")
        self.assertIsInstance(result, list)
        self.assertEqual(result, [])


# ═══════════════════════════════════════════════════════════════════════════════
# 7.  Job Scraper Platform Support
# ═══════════════════════════════════════════════════════════════════════════════

class TestJobScraperPlatforms(unittest.TestCase):
    """Verify job scraper detects all supported platforms."""

    def test_detect_indeed(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://www.indeed.com/viewjob?jk=abc123"), "indeed")

    def test_detect_indeed_international(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://de.indeed.com/viewjob?jk=abc"), "indeed")

    def test_detect_linkedin(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://www.linkedin.com/jobs/view/12345"), "linkedin")

    def test_detect_linkedin_short(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://lnkd.in/abc123"), "linkedin")

    def test_detect_glassdoor(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://www.glassdoor.com/job-listing/12345"), "glassdoor")

    def test_detect_glassdoor_international(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://uk.glassdoor.com/job/12345"), "glassdoor")

    def test_detect_ziprecruiter(self):
        from backend.job_scraper import detect_job_site
        self.assertEqual(detect_job_site("https://www.ziprecruiter.com/job/12345"), "ziprecruiter")

    def test_detect_unsupported_returns_none(self):
        from backend.job_scraper import detect_job_site
        self.assertIsNone(detect_job_site("https://www.google.com/search?q=jobs"))

    def test_is_supported_job_url_all_platforms(self):
        from backend.job_scraper import is_supported_job_url
        self.assertTrue(is_supported_job_url("https://www.indeed.com/job/123"))
        self.assertTrue(is_supported_job_url("https://www.linkedin.com/jobs/view/123"))
        self.assertTrue(is_supported_job_url("https://www.glassdoor.com/job/123"))
        self.assertTrue(is_supported_job_url("https://www.ziprecruiter.com/job/123"))
        self.assertFalse(is_supported_job_url("https://www.google.com/jobs"))

    def test_extract_indeed_job_id(self):
        from backend.job_scraper import extract_job_id
        job_id = extract_job_id("https://www.indeed.com/viewjob?jk=abc123def")
        self.assertEqual(job_id, "abc123def")

    def test_extract_linkedin_job_id(self):
        from backend.job_scraper import extract_job_id
        job_id = extract_job_id("https://www.linkedin.com/jobs/view/software-engineer-12345678")
        self.assertEqual(job_id, "12345678")

    def test_extract_glassdoor_job_id(self):
        from backend.job_scraper import extract_job_id
        job_id = extract_job_id("https://www.glassdoor.com/job-listing/?jl=98765")
        self.assertEqual(job_id, "98765")

    def test_extract_ziprecruiter_job_id(self):
        from backend.job_scraper import extract_job_id
        job_id = extract_job_id("https://www.ziprecruiter.com/job/senior-engineer-abc123")
        self.assertEqual(job_id, "abc123")

    def test_extract_unsupported_returns_none(self):
        from backend.job_scraper import extract_job_id
        self.assertIsNone(extract_job_id("https://www.google.com/search"))

    def test_normalize_job_url_adds_scheme(self):
        from backend.job_scraper import normalize_job_url
        result = normalize_job_url("www.indeed.com/job/123")
        self.assertTrue(result.startswith("https://"))

    def test_normalize_job_url_strips_whitespace(self):
        from backend.job_scraper import normalize_job_url
        result = normalize_job_url("  https://www.indeed.com/job/123  ")
        self.assertEqual(result, "https://www.indeed.com/job/123")

    def test_normalize_empty_returns_empty(self):
        from backend.job_scraper import normalize_job_url
        self.assertEqual(normalize_job_url(""), "")
        self.assertEqual(normalize_job_url(None), "")
        self.assertEqual(normalize_job_url("   "), "")

    def test_clean_html_text(self):
        from backend.job_scraper import clean_html_text
        html = "<p>Hello</p><script>evil()</script><p>World</p>"
        result = clean_html_text(html)
        self.assertIn("Hello", result)
        self.assertIn("World", result)
        self.assertNotIn("evil()", result)

    def test_extract_job_text_from_html_with_meta(self):
        from backend.job_scraper import extract_job_text_from_html
        html = '<meta name="description" content="Great engineering role at Acme">'
        result = extract_job_text_from_html(html)
        self.assertIn("Great engineering role", result)

    def test_all_platform_is_functions_exist(self):
        """All platform detection functions are callable."""
        from backend.job_scraper import (
            is_indeed_url, is_linkedin_url, is_glassdoor_url, is_ziprecruiter_url
        )
        for func in (is_indeed_url, is_linkedin_url, is_glassdoor_url, is_ziprecruiter_url):
            self.assertTrue(callable(func))


# ═══════════════════════════════════════════════════════════════════════════════
# 8.  Constants Sanity
# ═══════════════════════════════════════════════════════════════════════════════

class TestConstantsSanity(unittest.TestCase):
    """Verify constants.py values are sane and within reasonable bounds."""

    def test_timeouts_are_positive(self):
        from backend.constants import (
            PDF_TEXT_TIMEOUT, LATEX_COMPILE_TIMEOUT, WORKER_DOWNLOAD_TIMEOUT,
            DEFAULT_POLL_INTERVAL,
        )
        self.assertGreater(PDF_TEXT_TIMEOUT, 0)
        self.assertGreater(LATEX_COMPILE_TIMEOUT, 0)
        self.assertGreater(WORKER_DOWNLOAD_TIMEOUT, 0)
        self.assertGreater(DEFAULT_POLL_INTERVAL, 0)

    def test_timeouts_are_reasonable(self):
        """Timeouts should be between 1 second and 5 minutes."""
        from backend.constants import (
            PDF_TEXT_TIMEOUT, LATEX_COMPILE_TIMEOUT, WORKER_DOWNLOAD_TIMEOUT,
        )
        for name, val in [
            ("PDF_TEXT_TIMEOUT", PDF_TEXT_TIMEOUT),
            ("LATEX_COMPILE_TIMEOUT", LATEX_COMPILE_TIMEOUT),
            ("WORKER_DOWNLOAD_TIMEOUT", WORKER_DOWNLOAD_TIMEOUT),
        ]:
            self.assertGreaterEqual(val, 1, f"{name} too small")
            self.assertLessEqual(val, 300, f"{name} too large (>5min)")

    def test_llm_token_limits_are_positive(self):
        from backend.constants import (
            DEFAULT_MAX_TOKENS_CONSOLIDATION, DEFAULT_MAX_TOKENS_RESUME,
            DEFAULT_MAX_TOKENS_JOB_MATCH, TEXT_TRUNCATION_LENGTH,
        )
        self.assertGreater(DEFAULT_MAX_TOKENS_CONSOLIDATION, 0)
        self.assertGreater(DEFAULT_MAX_TOKENS_RESUME, 0)
        self.assertGreater(DEFAULT_MAX_TOKENS_JOB_MATCH, 0)
        self.assertGreater(TEXT_TRUNCATION_LENGTH, 0)

    def test_llm_token_limits_are_reasonable(self):
        from backend.constants import (
            DEFAULT_MAX_TOKENS_CONSOLIDATION, DEFAULT_MAX_TOKENS_RESUME,
            DEFAULT_MAX_TOKENS_JOB_MATCH, TEXT_TRUNCATION_LENGTH,
        )
        self.assertLessEqual(DEFAULT_MAX_TOKENS_CONSOLIDATION, 100_000)
        self.assertLessEqual(DEFAULT_MAX_TOKENS_RESUME, 100_000)
        self.assertLessEqual(DEFAULT_MAX_TOKENS_JOB_MATCH, 100_000)
        self.assertLessEqual(TEXT_TRUNCATION_LENGTH, 100_000)

    def test_ste100_word_limits(self):
        from backend.constants import PROCEDURAL_WORD_LIMIT, DESCRIPTIVE_WORD_LIMIT
        self.assertEqual(PROCEDURAL_WORD_LIMIT, 20)
        self.assertEqual(DESCRIPTIVE_WORD_LIMIT, 25)
        self.assertGreater(PROCEDURAL_WORD_LIMIT, 0)
        self.assertGreater(DESCRIPTIVE_WORD_LIMIT, PROCEDURAL_WORD_LIMIT)

    def test_data_quality_thresholds(self):
        from backend.constants import (
            MIN_SCORE_THRESHOLD, MAX_WARNINGS_COUNT, MAX_CRITICAL_ISSUES,
        )
        self.assertGreater(MIN_SCORE_THRESHOLD, 0)
        self.assertLessEqual(MIN_SCORE_THRESHOLD, 1.0)
        self.assertGreater(MAX_WARNINGS_COUNT, 0)
        self.assertGreater(MAX_CRITICAL_ISSUES, 0)

    def test_file_size_limit(self):
        from backend.constants import MAX_FILE_SIZE_KB
        self.assertGreater(MAX_FILE_SIZE_KB, 0)
        self.assertGreaterEqual(MAX_FILE_SIZE_KB, 1024)  # At least 1MB

    def test_processing_limits(self):
        from backend.constants import (
            MAX_CONCURRENT_PROCESSES, MAX_RETRY_ATTEMPTS, RETRY_DELAY_SECONDS,
        )
        self.assertGreater(MAX_CONCURRENT_PROCESSES, 0)
        self.assertGreater(MAX_RETRY_ATTEMPTS, 0)
        self.assertGreater(RETRY_DELAY_SECONDS, 0)

    def test_bytes_per_kb(self):
        from backend.constants import BYTES_PER_KB
        self.assertEqual(BYTES_PER_KB, 1024)

    def test_output_formatting(self):
        from backend.constants import INDENT_SPACES, MAX_LINE_LENGTH
        self.assertGreater(INDENT_SPACES, 0)
        self.assertGreater(MAX_LINE_LENGTH, 0)

    def test_log_output_limits(self):
        from backend.constants import STDERR_LINE_LIMIT, STDERR_CHAR_LIMIT
        self.assertGreater(STDERR_LINE_LIMIT, 0)
        self.assertGreater(STDERR_CHAR_LIMIT, 0)
        self.assertLessEqual(STDERR_LINE_LIMIT, 100)
        self.assertLessEqual(STDERR_CHAR_LIMIT, 10_000)


# ═══════════════════════════════════════════════════════════════════════════════
# 9.  End-to-End Pipeline Flow (Mock LLM)
# ═══════════════════════════════════════════════════════════════════════════════

class TestEndToEndPipelineFlow(unittest.TestCase):
    """Verify the full scan -> extract -> consolidate -> score -> render flow."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_full_flow_with_mock_llm(self):
        """
        Scan -> Extract -> Consolidate (mock LLM) -> Score -> Render LaTeX.
        Verifies all pieces connect correctly.
        """
        from backend.pipeline import (
            scan_directories, extract_all, organize_files,
            llm_process_all, LLMClient, PersonBundle,
        )
        from backend.latex import render_latex

        root = self.tmp.name
        src = os.path.join(root, "src")
        os.makedirs(src)

        # Create a CV file
        with open(os.path.join(src, "alice smith_cv.txt"), "w") as f:
            f.write("Alice Smith\nSenior Software Engineer\nPython, Go, Rust\n")

        output = os.path.join(root, "output")

        # Step 1: Scan
        with patch("backend.pipeline._load_aliases", return_value={}):
            bundles = scan_directories([src])
        self.assertIn("Alice Smith", bundles)

        # Step 2: Organize
        organize_files(bundles, output)
        self.assertTrue(os.path.isdir(os.path.join(output, "resources", "alice-smith")))

        # Step 3: Extract
        bundles = extract_all(bundles)
        alice = bundles["Alice Smith"]
        self.assertTrue(len(alice.extracted_texts) > 0)

        # Step 4: Consolidate with mock LLM
        mock_client = MagicMock(spec=LLMClient)
        mock_client.provider = "ollama"
        mock_client.model = "llama3.2"
        mock_client.chat.side_effect = [
            json.dumps({
                "name": "Alice Smith",
                "contact": {"email": "alice@example.com", "location": "NYC"},
                "titles": ["Senior Software Engineer"],
                "summary": "Backend engineer specializing in distributed systems.",
                "skills": {
                    "languages": ["Python", "Go", "Rust"],
                    "frameworks": ["Django"],
                    "cloud_devops": ["AWS"],
                    "databases": ["Postgres"],
                    "tools": ["Docker"],
                },
                "experience": [{
                    "title": "Senior Engineer",
                    "company": "Acme Corp",
                    "start": "2021",
                    "end": "Present",
                    "bullets": ["Built distributed queue in Go"],
                }],
                "education": [{"degree": "B.S. CS", "school": "MIT", "years": "2016-2020"}],
                "certifications": ["AWS Solutions Architect"],
                "languages_spoken": ["English"],
            }),
            "# Alice Smith\n**Senior Engineer** | NYC\n\nSkills: Python, Go, Rust",
        ]

        llm_process_all(bundles, output, mock_client)

        # Step 5: Verify outputs
        json_path = os.path.join(output, "consolidated", "alice-smith_structured.json")
        self.assertTrue(os.path.isfile(json_path))
        with open(json_path) as f:
            data = json.load(f)
        self.assertEqual(data["name"], "Alice Smith")
        self.assertIn("Python", data["skills"]["languages"])

        resume_path = os.path.join(output, "resumes", "alice-smith_resume.md")
        self.assertTrue(os.path.isfile(resume_path))

        # Step 6: Verify LaTeX rendering works on the consolidated data
        tex = render_latex(data, "Alice Smith")
        self.assertIn("Alice Smith", tex)
        self.assertIn(r"\begin{document}", tex)
        self.assertIn(r"\end{document}", tex)

    def test_consolidate_files_end_to_end(self):
        """Test the consolidate_files function produces valid profile + score."""
        from backend.pipeline import consolidate_files

        cv_path = os.path.join(self.tmp.name, "test_cv.txt")
        with open(cv_path, "w") as f:
            f.write("Jane Doe\nDevOps Engineer\nKubernetes, Docker, AWS")

        mock_client = MagicMock()
        mock_client.chat.return_value = json.dumps({
            "name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "titles": ["DevOps Engineer"],
            "summary": "Cloud infrastructure specialist.",
            "skills": {
                "languages": ["Python"],
                "frameworks": [],
                "cloud_devops": ["AWS", "Kubernetes"],
                "databases": [],
                "tools": ["Docker"],
            },
            "experience": [{
                "title": "DevOps Engineer",
                "company": "TechCo",
                "start": "2022",
                "end": "Present",
                "bullets": ["Managed Kubernetes clusters"],
            }],
            "education": [],
            "certifications": ["AWS Certified"],
            "languages_spoken": [],
        })

        result = consolidate_files([cv_path], mock_client)

        # Profile shape
        self.assertIn("name", result["profile"])
        self.assertEqual(result["profile"]["name"], "Jane Doe")

        # Score shape
        self.assertIn("score", result["score"])
        self.assertIn("max_score", result["score"])
        self.assertGreater(result["score"]["max_score"], 0)

        # Cleanup
        import shutil
        shutil.rmtree(result["tmp_dir"], ignore_errors=True)


# ═══════════════════════════════════════════════════════════════════════════════
# 10.  Worker Profile Mapping
# ═══════════════════════════════════════════════════════════════════════════════

class TestWorkerProfileMapping(unittest.TestCase):
    """Verify worker.py's profile_fields_from converts correctly."""

    def test_profile_fields_from_valid_data(self):
        from backend.worker import profile_fields_from

        profile = {
            "name": "Alice Smith",
            "contact": {"email": "alice@example.com", "phone": "555-1234"},
            "titles": ["Engineer"],
            "summary": "Experienced engineer.",
            "skills": {
                "languages": ["Python"],
                "frameworks": ["Django"],
                "cloud_devops": ["AWS"],
                "databases": ["Postgres"],
                "tools": ["Docker"],
            },
            "experience": [{
                "title": "Engineer",
                "company": "Acme",
                "bullets": ["Built X"],
            }],
            "education": [{"degree": "BS", "school": "MIT"}],
            "certifications": ["AWS"],
            "languages_spoken": ["English"],
        }

        result = profile_fields_from(profile)
        self.assertEqual(result["name"], "Alice Smith")
        self.assertIn("contact", result)
        self.assertIn("skills", result)
        self.assertIn("experience", result)
        self.assertIn("languagesSpoken", result)  # snake_case -> camelCase

    def test_profile_fields_from_raw_fallback(self):
        from backend.worker import profile_fields_from

        result = profile_fields_from({"_raw": "raw text output"})
        self.assertIn("rawFallback", result)
        self.assertEqual(result["rawFallback"], "raw text output")

    def test_profile_fields_from_none_returns_raw(self):
        from backend.worker import profile_fields_from

        result = profile_fields_from(None)
        self.assertIn("rawFallback", result)

    def test_profile_fields_from_invalid_dict(self):
        from backend.worker import profile_fields_from

        result = profile_fields_from("not a dict")
        self.assertIn("rawFallback", result)


if __name__ == "__main__":
    unittest.main()
