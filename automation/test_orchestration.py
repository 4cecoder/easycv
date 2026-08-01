"""
Test orchestration for EasyCV autonomous coding framework.

This module provides test runners and orchestration utilities:
- run_pytest(): Execute Python tests
- run_typecheck(): TypeScript type checking
- run_ts_tests(): Run TypeScript tests
- run_ts_build(): TypeScript build
- run_all_tests(): Full test suite execution
- run_playwright(): E2E browser tests
- summarize(): Format test results
- load_progress()/save_progress(): Track automation runs

NOT to be confused with backend/pipeline.py, which is the EasyCV resume
processing pipeline (OCR, LLM, STE-100, LaTeX generation).

This module is part of the autonomous coding framework with heavy LLM rails:
- automation/tdd.py: TDD loop with LLM auto-fix
- automation/refine.py: OCR-based code review + LLM refactor
- automation/improve.py: Parse failures, suggest fixes
- automation/steer.py: CLI entry point for all automation commands
"""

import json
import subprocess
import sys
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR


PROGRESS_PATH = ROOT / "automation" / "progress.json"


# ── Progress tracking ─────────────────────────────────────────────────────────

def load_progress():
    if PROGRESS_PATH.exists():
        try:
            return json.loads(PROGRESS_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"runs": [], "fixes": [], "stats": {}}


def save_progress(progress):
    progress["last_updated"] = datetime.now(timezone.utc).isoformat()
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2))


# ── Test runners ──────────────────────────────────────────────────────────────

def run_pytest(target: Optional[str] = None, extra_args: Optional[list[str]] = None) -> dict:
    cmd = ["uv", "run", "pytest"]
    if target:
        cmd.append(target)
    if extra_args:
        cmd.extend(extra_args)
    cmd.extend(["-v", "--tb=short"])
    print(f"[pytest] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=str(ROOT))
    passed = failed = 0
    failures = []
    for line in result.stdout.splitlines():
        m = re.match(r"(.*?)::(.*?) PASSED", line)
        if m:
            passed += 1
            continue
        m = re.match(r"(.*?)::(.*?) FAILED", line)
        if m:
            failed += 1
            failures.append(f"{m.group(1)}::{m.group(2)}")
    summary_match = re.search(r"=+ ([\d]+) passed", result.stdout)
    total_passed = int(summary_match.group(1)) if summary_match else passed
    total_failed = int(re.search(r"=+ ([\d]+) failed", result.stdout).group(1)) if re.search(r"=+ ([\d]+) failed", result.stdout) else failed
    print(f"[pytest] Result: {total_passed} passed, {total_failed} failed (exit {result.returncode})")
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
        "passed": total_passed,
        "failed": total_failed,
        "failures": failures,
    }


def run_playwright(headless: bool = True, target: Optional[str] = None) -> dict:
    cmd = ["bunx", "playwright", "test"]
    if target:
        cmd.append(target)
    if headless:
        cmd.append("--reporter=list")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, cwd=str(WEB_DIR))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def run_typecheck() -> dict:
    cmd = ["bun", "run", "typecheck"]
    print(f"[typecheck] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=str(WEB_DIR))
    status = "PASS" if result.returncode == 0 else "FAIL"
    print(f"[typecheck] Result: {status}")
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def run_ts_build() -> dict:
    cmd = ["bun", "run", "build"]
    print(f"[ts_build] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, cwd=str(WEB_DIR))
    status = "PASS" if result.returncode == 0 else "FAIL"
    print(f"[ts_build] Result: {status}")
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def run_ts_tests(target: Optional[str] = None) -> dict:
    cmd = ["bun", "run", "test"]
    if target:
        cmd.append(target)
    print(f"[ts_tests] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=str(WEB_DIR))
    status = "PASS" if result.returncode == 0 else "FAIL"
    print(f"[ts_tests] Result: {status}")
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


# ── Convenience ───────────────────────────────────────────────────────────────

def run_all_tests() -> dict:
    results = {}
    print("\n[all_tests] Running full test suite...")
    print("=" * 60)
    results["pytest"] = run_pytest()
    results["typecheck"] = run_typecheck()
    results["ts_tests"] = run_ts_tests()
    results["ts_build"] = run_ts_build()
    all_pass = all(r["returncode"] == 0 for r in results.values())
    print("=" * 60)
    print(f"[all_tests] Overall: {'PASS' if all_pass else 'FAIL'}")
    return {"results": results, "all_pass": all_pass}


def summarize(result: dict) -> str:
    lines = []
    print("\n[summary] Test Results:")
    print("-" * 60)
    if "pytest" in result:
        pr = result["pytest"]
        line = f"pytest: {pr['passed']} passed, {pr['failed']} failed"
        lines.append(line)
        print(f"  {line}")
    if "typecheck" in result:
        tr = result["typecheck"]
        line = f"typecheck: {'PASS' if tr['returncode'] == 0 else 'FAIL'}"
        lines.append(line)
        print(f"  {line}")
    if "ts_tests" in result:
        tr = result["ts_tests"]
        line = f"ts_tests: {'PASS' if tr['returncode'] == 0 else 'FAIL'}"
        lines.append(line)
        print(f"  {line}")
    if "ts_build" in result:
        tr = result["ts_build"]
        line = f"ts_build: {'PASS' if tr['returncode'] == 0 else 'FAIL'}"
        lines.append(line)
        print(f"  {line}")
    print("-" * 60)
    return " | ".join(lines)
