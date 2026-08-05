import re
from pathlib import Path
from typing import Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR, get_env
from automation.llm_client import chat, extract_code_block

# Traceback frame line: "backend/pipeline.py:123: in function_name"
TRACEBACK_FRAME = re.compile(r"^\s*([\w./\\-]+\.py):(\d+): in (.+)$")


def parse_test_failures(pytest_result: dict) -> list[dict]:
    failures: list[dict] = []
    current: dict = {}
    stdout = pytest_result.get("stdout", "")
    stderr = pytest_result.get("stderr", "")

    all_lines = (stdout + "\n" + stderr).splitlines()

    for line in all_lines:
        # Marker: "tests/test_pipeline.py::TestFoo::test_bar FAILED"
        m = re.match(r"(.*?)::(.*?)\s+FAILED", line)
        if m:
            test_file = m.group(1).split()[0]
            test_name = m.group(2).split()[0]
            current = {
                "test_file": test_file,
                "test_name": test_name,
                "error": "",
                "traceback_files": [],
            }
            failures.append(current)
            continue
        if not current:
            continue
        # Capture traceback frames so we can locate the real source file
        frame = TRACEBACK_FRAME.match(line)
        if frame:
            src = frame.group(1).replace("\\", "/")
            if src not in current["traceback_files"]:
                current["traceback_files"].append(src)
        # Capture error detail lines (bounded to keep prompt size sane)
        if current["error"]:
            current["error"] += "\n"
        current["error"] += line
        if len(current["error"]) > 8000:
            current["error"] = current["error"][:8000] + "\n...[truncated]"

    # Fallback: parse "FAILED file::name - reason" lines with no preceding detail
    if not failures:
        for line in stdout.splitlines():
            m = re.match(r"FAILED (.*?)::(.*?) - (.*)", line)
            if m:
                failures.append(
                    {
                        "test_file": m.group(1),
                        "test_name": m.group(2),
                        "error": m.group(3),
                        "traceback_files": [],
                    }
                )
    return failures


def find_source_file(failure: dict) -> Optional[Path]:
    """Locate the source module that caused the failure.

    Prefers the deepest non-test file found in the traceback, then falls back
    to the test file itself.
    """
    test_file = failure.get("test_file", "")
    candidates = [ROOT / test_file]
    if test_file:
        candidates.append(TESTS_DIR / test_file)
        candidates.append(TESTS_DIR / f"{test_file}.py")

    for rel in failure.get("traceback_files", []):
        candidate = ROOT / rel
        if candidate.exists() and not rel.startswith("tests/"):
            candidates.insert(0, candidate)

    # Order: traceback-derived first, then test path guesses
    seen = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def read_source_for_failure(failure: dict) -> Optional[str]:
    src_path = find_source_file(failure)
    if src_path:
        return src_path.read_text()
    return None


def llm_suggest_fix(failure: dict, source_code: str, env: dict, source_path: Optional[Path] = None) -> Optional[str]:
    src_path = source_path or find_source_file(failure)
    test_file = failure.get("test_file", "")
    test_content = ""
    test_candidate = ROOT / test_file
    if not test_candidate.exists() and test_file:
        test_candidate = TESTS_DIR / test_file
    if test_candidate.exists():
        test_content = test_candidate.read_text()
        if len(test_content) > 8000:
            test_content = test_content[:8000] + "\n...[truncated]"

    target_label = src_path.relative_to(ROOT) if src_path else "unknown"
    prompt = (
        f"A test failed in the easyCV codebase:\n\n"
        f"Test file: {test_file}\n"
        f"Test name: {failure.get('test_name')}\n"
        f"Error:\n{failure.get('error', 'unknown')}\n\n"
        f"The failing test:\n```python\n{test_content}\n```\n\n"
        f"Source file to fix: {target_label}\n"
        f"Current source code:\n```python\n{source_code}\n```\n\n"
        f"Analyze the failure and fix the SOURCE FILE ({target_label}). "
        f"Do NOT modify the test. Return ONLY the fixed source code in a single ```python code block. "
        f"Preserve all existing imports, function signatures, and public behavior. "
        f"Make the minimal change needed to make the test pass."
    )
    response = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=16384)
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
