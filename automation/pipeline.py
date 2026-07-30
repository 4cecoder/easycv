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


def run_ts_tests(target: Optional[str] = None) -> dict:
    cmd = ["bun", "run", "test"]
    if target:
        cmd.append(target)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=str(WEB_DIR))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def run_typecheck() -> dict:
    cmd = ["bun", "run", "typecheck"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=str(WEB_DIR))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def run_ts_build() -> dict:
    cmd = ["bun", "run", "build"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, cwd=str(WEB_DIR))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


# ── Convenience ───────────────────────────────────────────────────────────────

def run_all_tests() -> dict:
    results = {}
    results["pytest"] = run_pytest()
    results["typecheck"] = run_typecheck()
    results["ts_tests"] = run_ts_tests()
    results["ts_build"] = run_ts_build()
    all_pass = all(r["returncode"] == 0 for r in results.values())
    return {"results": results, "all_pass": all_pass}


def summarize(result: dict) -> str:
    lines = []
    if "pytest" in result:
        pr = result["pytest"]
        lines.append(f"pytest: {pr['passed']} passed, {pr['failed']} failed")
    if "typecheck" in result:
        tr = result["typecheck"]
        lines.append(f"typecheck: {'PASS' if tr['returncode'] == 0 else 'FAIL'}")
    if "ts_tests" in result:
        tr = result["ts_tests"]
        lines.append(f"ts_tests: {'PASS' if tr['returncode'] == 0 else 'FAIL'}")
    if "ts_build" in result:
        tr = result["ts_build"]
        lines.append(f"ts_build: {'PASS' if tr['returncode'] == 0 else 'FAIL'}")
    return " | ".join(lines)
