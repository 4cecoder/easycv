import os
import re
import sys
from pathlib import Path
from typing import Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR, get_env
from automation.llm_client import chat, extract_code_block


def parse_test_failures(pytest_result: dict) -> list[dict]:
    failures = []
    current = {}
    for line in pytest_result.get("stdout", "").splitlines():
        if "FAILED" in line and "::" in line:
            m = re.match(r"(.*?)::(.*?) FAILED", line)
            if m:
                current = {"test_file": m.group(1), "test_name": m.group(2), "error": ""}
    stderr = pytest_result.get("stderr", "")
    if stderr:
        for line in stderr.splitlines():
            if current and current.get("test_name"):
                current["error"] += line + "\n"
    for line in pytest_result.get("stdout", "").splitlines():
        if "Error" in line or "AssertionError" in line or "raise" in line:
            if current:
                current["error"] += line + "\n"
    if current and current.get("test_name"):
        failures.append(current)
    if not failures:
        for line in pytest_result.get("stdout", "").splitlines():
            m = re.match(r"FAILED (.*?)::(.*?) - (.*)", line)
            if m:
                failures.append({"test_file": m.group(1), "test_name": m.group(2), "error": m.group(3)})
    return failures


def read_source_for_failure(failure: dict) -> Optional[str]:
    test_file = failure.get("test_file", "")
    test_name = failure.get("test_name", "")
    src_path = ROOT / test_file
    if not src_path.exists():
        src_path = TESTS_DIR / f"{test_file}.py"
    if not src_path.exists():
        src_path = TESTS_DIR / test_file
    if src_path.exists():
        return src_path.read_text()
    parts = test_file.replace(".py", "").split("::")
    for candidate in [TESTS_DIR / f"{parts[-1]}.py", ROOT / f"{parts[-1]}.py"]:
        if candidate.exists():
            return candidate.read_text()
    return None


def llm_suggest_fix(failure: dict, source_code: str, env: dict) -> Optional[str]:
    prompt = (
        f"A test failed in the easyCV codebase:\n\n"
        f"Test file: {failure.get('test_file')}\n"
        f"Test name: {failure.get('test_name')}\n"
        f"Error:\n{failure.get('error', 'unknown')}\n\n"
        f"Relevant source code:\n```python\n{source_code}\n```\n\n"
        f"Analyze the failure and suggest a fix. Return ONLY the fixed code in a ```python code block. "
        f"Focus on the minimal change needed to make the test pass."
    )
    response = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=2048)
    if not response:
        return None
    return extract_code_block(response, "python")


def apply_fix(file_path: Path, fix_code: str, fix_name: str) -> bool:
    backup = file_path.with_suffix(file_path.suffix + ".bak")
    file_path.rename(backup)
    try:
        file_path.write_text(fix_code)
        return True
    except Exception:
        backup.rename(file_path)
        return False


def suggest_improvements(all_tests_result: dict) -> list[dict]:
    env = get_env()
    failures = parse_test_failures(all_tests_result.get("pytest", {}))
    suggestions = []
    for f in failures:
        src = read_source_for_failure(f)
        if not src:
            suggestions.append({**f, "fix": None, "reason": "could not read source"})
            continue
        fix = llm_suggest_fix(f, src, env)
        if fix:
            suggestions.append({**f, "fix": fix})
        else:
            suggestions.append({**f, "fix": None, "reason": "LLM returned no fix"})
    return suggestions
