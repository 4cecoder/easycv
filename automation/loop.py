"""
Self-driving improvement loop for easyCV.

Chains the deterministic + LLM-guided phases into one autonomous cycle:
  policy check → OCR refine → TDD auto-fix → full test suite → optional commit

Runs entirely against the self-hosted LLM endpoint (no cloud tokens).
"""

import subprocess
from pathlib import Path
from typing import List, Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR, get_env
from automation.test_orchestration import (
    run_pytest,
    run_typecheck,
    run_ts_tests,
    load_progress,
    save_progress,
)
from automation.tdd import tdd_loop
from automation.refine import refine_file
from automation.policy_enforcer import get_policy_enforcer


EXCLUDE_PARTS = {
    "node_modules", ".next", ".netlify", ".convex", ".venv", ".git",
    "__pycache__", ".pytest_cache", ".ocr-tmp", "dist", "build", ".bun",
}


def _excluded(path: Path) -> bool:
    return any(part in EXCLUDE_PARTS for part in path.parts)


def discover_files(target: str) -> List[Path]:
    """Expand a target string into an ordered list of source files."""
    patterns = ("*.py", "*.ts", "*.tsx")
    if not target:
        files = [p for p in BACKEND_DIR.rglob("*.py") if not _excluded(p)]
        files += [p for p in TESTS_DIR.rglob("*.py") if not _excluded(p)]
        files += [p for p in WEB_DIR.rglob("*.ts") if not _excluded(p)]
        files += [p for p in WEB_DIR.rglob("*.tsx") if not _excluded(p)]
        return files
    root = ROOT / target
    if root.is_file():
        return [root]
    if root.is_dir():
        files: List[Path] = []
        for pattern in patterns:
            files.extend(sorted(p for p in root.rglob(pattern) if not _excluded(p)))
        return files
    print(f"[loop] target not found: {target}")
    return []


def run_policy_check(targets: List[str]) -> dict:
    """Run hard-coded policy guardrails (fast, no LLM)."""
    print("\n" + "=" * 60)
    print("[loop] Phase 0: policy guardrails")
    print("=" * 60)
    total = critical = files = 0
    problems: List[str] = []
    for target in targets or ["backend/", "tests/", "web/"]:
        for file_path in discover_files(target):
            if file_path.name.startswith("."):
                continue
            kind = "frontend" if str(file_path).startswith(str(WEB_DIR)) else "backend"
            try:
                enforcer = get_policy_enforcer(kind)
                code = file_path.read_text()
                violations = enforcer.check_file(file_path, code)
            except Exception as e:
                print(f"  [policy] {file_path.relative_to(ROOT)}: check failed ({e})")
                continue
            if violations:
                files += 1
                total += len(violations)
                crit = sum(1 for v in violations if v.severity == "critical")
                critical += crit
                if crit:
                    problems.append(f"{file_path.relative_to(ROOT)}: {crit} critical")
    print(f"  files with violations: {files}, total: {total}, critical: {critical}")
    for p in problems[:10]:
        print(f"  🔴 {p}")
    return {"files": files, "total": total, "critical": critical}


def run_refine(target: str, limit: int, dry_run: bool, enforce_policy: bool) -> List[dict]:
    print("\n" + "=" * 60)
    print(f"[loop] Phase 1: OCR refine on {target or 'backend+tests'}")
    print("=" * 60)
    env = get_env()
    files = discover_files(target)
    results = []
    for f in files[:limit]:
        r = refine_file(f, env, dry_run=dry_run, enforce_policy=enforce_policy)
        results.append(r)
    fixed = sum(1 for r in results if r["status"] == "fixed")
    reverted = sum(1 for r in results if r["status"] == "reverted")
    print(f"  refined {len(results)} files, {fixed} fixed, {reverted} reverted")
    return results


def run_loop(
    target: str = "",
    limit: int = 5,
    rounds: int = 0,
    dry_run: bool = False,
    commit: bool = False,
    no_policy: bool = False,
    skip_refine: bool = False,
    skip_tdd: bool = False,
) -> int:
    env = get_env()
    progress = load_progress()
    run_record = {
        "type": "loop",
        "target": target or "all",
        "started_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "phases": {},
    }

    print("[loop] EasyCV self-driving improvement cycle")
    print(f"[loop] Target: {target or 'backend+tests+web'}, limit: {limit} files")

    # Phase 0: policy guardrails
    if no_policy:
        policy = {"skipped": True}
    else:
        policy = run_policy_check([target] if target else [])
    run_record["phases"]["policy"] = policy

    # Phase 1: OCR refine
    if skip_refine:
        print("[loop] skipping OCR refine phase")
        refine_results = []
    else:
        refine_target = target if target else ""
        if target and not (ROOT / target).exists():
            print(f"[loop] skipping refine: target not found ({target})")
            refine_results = []
        else:
            refine_results = run_refine(refine_target, limit, dry_run, enforce_policy=not no_policy)
    run_record["phases"]["refine"] = {
        "files": len(refine_results),
        "fixed": sum(1 for r in refine_results if r["status"] == "fixed"),
        "reverted": sum(1 for r in refine_results if r["status"] == "reverted"),
    }

    # Phase 2: TDD auto-fix
    print("\n" + "=" * 60)
    print("[loop] Phase 2: TDD auto-fix")
    print("=" * 60)
    if skip_tdd:
        print("[loop] skipping TDD phase")
        tdd_rc = 0
    else:
        tdd_rc = tdd_loop(target=target if target else "", max_rounds=rounds, max_failures=0)
    run_record["phases"]["tdd"] = {"exit_code": tdd_rc}

    # Phase 3: full test suite
    print("\n" + "=" * 60)
    print("[loop] Phase 3: full test suite")
    print("=" * 60)
    pytest_result = run_pytest()
    pytest_pass = pytest_result["returncode"] == 0
    run_record["phases"]["pytest"] = {
        "passed": pytest_result["passed"],
        "failed": pytest_result["failed"],
    }
    typecheck_result = run_typecheck()
    typecheck_pass = typecheck_result["returncode"] == 0
    run_record["phases"]["typecheck"] = {"exit_code": typecheck_result["returncode"]}
    ts_result = run_ts_tests()
    ts_pass = ts_result["returncode"] == 0
    run_record["phases"]["ts_tests"] = {"exit_code": ts_result["returncode"]}

    all_pass = pytest_pass and typecheck_pass and ts_pass
    run_record["conclusion"] = "all_pass" if all_pass else "fail"
    progress["runs"].append(run_record)
    save_progress(progress)

    print("\n" + "=" * 60)
    print(f"[loop] Result: {'ALL GREEN' if all_pass else 'ISSUES REMAIN'}")
    print(f"  pytest: {pytest_result['passed']} passed, {pytest_result['failed']} failed")
    print(f"  typecheck: {'PASS' if typecheck_pass else 'FAIL'}")
    print(f"  ts_tests: {'PASS' if ts_pass else 'FAIL'}")
    print("=" * 60)

    # Phase 4: optional commit
    if commit and all_pass:
        return commit_changes(target)

    return 0 if all_pass else 1


def commit_changes(target: str) -> int:
    print("\n[loop] Phase 4: committing changes...")
    res = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=str(ROOT))
    changed = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    if not changed:
        print("[loop] no changes to commit")
        return 0
    subprocess.run(["git", "add", "-A"], cwd=str(ROOT))
    target_label = target or "codebase"
    commit_res = subprocess.run(
        ["git", "commit", "-m", f"automation: self-improvement pass on {target_label}"],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    print(commit_res.stdout.strip())
    print(commit_res.stderr.strip())
    return 0 if commit_res.returncode == 0 else 1
