"""Tests for the automation pipeline improvements."""

import os
import subprocess
from pathlib import Path

import pytest

from automation.config import ROOT, TESTS_DIR, load_dotenv, _env_int
from automation.improve import parse_test_failures, find_source_file
from automation.refine import _validate_python, _exceeds_refactor_limit
from automation.tdd import resolve_test_target


def test_parse_test_failures_captures_multiple():
    result = {
        "stdout": (
            "tests/test_pipeline.py::TestFoo::test_a FAILED\n"
            "tests/test_pipeline.py:10: in test_a\n"
            "    assert 1 == 2\n"
            "tests/test_pipeline.py::TestFoo::test_b FAILED\n"
            "tests/test_pipeline.py:20: in test_b\n"
            "    assert 3 == 4\n"
        ),
        "stderr": "",
    }
    failures = parse_test_failures(result)
    assert len(failures) == 2
    assert failures[0]["test_name"] == "TestFoo::test_a"
    assert failures[1]["test_name"] == "TestFoo::test_b"
    assert failures[1]["test_file"] == "tests/test_pipeline.py"


def test_parse_test_failures_traceback_files():
    result = {
        "stdout": (
            "tests/test_pipeline.py::TestFoo::test_c FAILED\n"
            "backend/pipeline.py:456: in consolidate\n"
            "    raise ValueError(\"bad\")\n"
        ),
        "stderr": "",
    }
    failures = parse_test_failures(result)
    assert len(failures) == 1
    assert "backend/pipeline.py" in failures[0]["traceback_files"]


def test_parse_test_failures_fallback_reason():
    result = {
        "stdout": "FAILED tests/test_pipeline.py::TestFoo::test_d - AssertionError: nope",
        "stderr": "",
    }
    failures = parse_test_failures(result)
    assert len(failures) == 1
    assert failures[0]["test_name"] == "TestFoo::test_d"
    assert failures[0]["test_file"] == "tests/test_pipeline.py"


def test_find_source_file_prefers_non_test_traceback():
    failure = {
        "test_file": "tests/test_pipeline.py",
        "test_name": "test_c",
        "traceback_files": ["backend/pipeline.py"],
    }
    src = find_source_file(failure)
    assert src is not None
    assert src.name == "pipeline.py"


def test_find_source_file_falls_back_to_test():
    failure = {
        "test_file": "tests/test_pipeline.py",
        "test_name": "test_c",
        "traceback_files": [],
    }
    src = find_source_file(failure)
    assert src is not None


def test_resolve_test_target_source_dir_returns_none():
    assert resolve_test_target("backend") is None


def test_resolve_test_target_test_dir_passes_through():
    target = resolve_test_target("tests")
    assert target == "tests"


def test_load_dotenv_handles_export_prefix(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("FOO_BAR_TEST=hello\nexport EXPORTED_VAR=world\n")
    monkeypatch.setattr("automation.config.ROOT", tmp_path)
    monkeypatch.setattr("automation.config._dotenv_loaded", False)
    os.environ.pop("FOO_BAR_TEST", None)
    os.environ.pop("EXPORTED_VAR", None)
    load_dotenv()
    assert os.environ.get("FOO_BAR_TEST") == "hello"
    assert os.environ.get("EXPORTED_VAR") == "world"


def test_env_int_fallback(monkeypatch):
    monkeypatch.setenv("BAD_INT", "abc")
    assert _env_int("BAD_INT", 42) == 42
    assert _env_int("MISSING_INT", 42) == 42
    monkeypatch.setenv("GOOD_INT", "7")
    assert _env_int("GOOD_INT", 42) == 7


def test_validate_python_accepts_good_code():
    assert _validate_python("def f():\n    return 1\n") is None


def test_validate_python_rejects_unterminated_string():
    err = _validate_python('x = """unterminated\n')
    assert err is not None
    assert "SyntaxError" in err


def test_validate_python_reports_lineno():
    err = _validate_python("a = 1\nb = = 2\n")
    assert err is not None
    assert ":2" in err


def test_exceeds_refactor_limit_rejects_large_file(tmp_path):
    big = tmp_path / "big.py"
    big.write_text("x = 1\n")
    assert _exceeds_refactor_limit(big, lines=10000, size_kb=1.0) is True


def test_exceeds_refactor_limit_allows_small_file(tmp_path, capsys):
    small = tmp_path / "small.py"
    small.write_text("x = 1\n")
    assert _exceeds_refactor_limit(small, lines=100, size_kb=2.0) is False
    assert capsys.readouterr().out == ""
