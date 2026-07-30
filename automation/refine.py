import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR, get_env
from automation.llm_client import chat, extract_code_block, make_request
from automation.pipeline import run_pytest


def run_ocr(file_path: Path) -> str:
    if not file_path.exists():
        return ""
    rel = file_path.relative_to(ROOT)
    temp = ROOT / "automation" / ".ocr-tmp" / rel
    temp.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file_path, temp)
    cmd = [
        "ocr", "scan",
        "--path", str(temp),
        "--audience", "agent",
        "--no-plan", "--no-summary", "--no-dedup",
    ]
    res = subprocess.run(
        cmd, capture_output=True, text=True, cwd=str(ROOT), timeout=120
    )
    if temp.exists():
        temp.unlink()
    output = res.stdout.strip()
    comments = []
    if output and "Summary: 1 file(s) reviewed" in output:
        capture = False
        for line in output.split("\n"):
            if "───" in line and str(temp.name) in line:
                capture = True
            if capture:
                line = line.replace(str(temp), str(file_path))
                comments.append(line)
    return "\n".join(comments).strip()


def request_refactor(code: str, comments: str, env: dict) -> Optional[str]:
    prompt = (
        f"Here is a source file from the easyCV codebase:\n\n"
        f"```python\n{code}\n```\n\n"
        f"Here is automated code review feedback:\n\n"
        f"```\n{comments}\n```\n\n"
        f"Refactor the code to address the review feedback. "
        f"Preserve all existing functionality, imports, and signatures. "
        f"Return only the refactored code in a single ```python code block."
    )
    response = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=64000)
    if not response:
        return None
    return extract_code_block(response, "python")


def verify_with_tests(file_path: Path, backup_path: Path) -> bool:
    result = run_pytest()
    if result["returncode"] == 0:
        return True
    print(f"  tests failed after edit, restoring backup")
    shutil.copy2(backup_path, file_path)
    return False


def refine_file(file_path: Path, env: dict, dry_run: bool = False) -> dict:
    rel = file_path.relative_to(ROOT)
    print(f"[refine] scanning {rel}...")
    comments = run_ocr(file_path)
    if not comments:
        return {"file": str(rel), "status": "clean", "comments": None}

    code = file_path.read_text()
    print(f"[refine] LLM refactoring...")
    refactored = request_refactor(code, comments, env)
    if not refactored:
        return {"file": str(rel), "status": "llm_failed", "comments": comments}

    if dry_run:
        return {"file": str(rel), "status": "dry_run", "comments": comments, "diff": refactored}

    backup = file_path.with_suffix(file_path.suffix + ".refine.bak")
    shutil.copy2(file_path, backup)
    try:
        file_path.write_text(refactored)
        passed = verify_with_tests(file_path, backup)
        if backup.exists():
            backup.unlink()
        return {
            "file": str(rel),
            "status": "fixed" if passed else "reverted",
            "comments": comments,
        }
    except Exception as e:
        if backup.exists():
            shutil.copy2(backup, file_path)
            backup.unlink()
        return {"file": str(rel), "status": "error", "error": str(e)}


def discover_ocr_rules() -> list[dict]:
    res = subprocess.run(
        ["ocr", "rules", "list"], capture_output=True, text=True, timeout=15
    )
    rules = []
    for line in res.stdout.splitlines():
        if line.strip():
            rules.append({"rule": line.strip()})
    return rules


def main():
    parser = argparse.ArgumentParser(description="Refinement loop using Alibaba OCR (OpenCodeReview)")
    parser.add_argument("--target", type=str, help="File or directory to refine")
    parser.add_argument("--dry-run", action="store_true", help="Show suggested changes without applying")
    parser.add_argument("--limit", type=int, default=5, help="Max files to refine")
    args = parser.parse_args()

    env = get_env()
    if args.target:
        target = ROOT / args.target
        if target.is_file():
            results = [refine_file(target, env, dry_run=args.dry_run)]
        elif target.is_dir():
            files = sorted(target.rglob("*.py")) + sorted(target.rglob("*.ts"))
            results = []
            for f in files[:args.limit]:
                r = refine_file(f, env, dry_run=args.dry_run)
                results.append(r)
                if r["status"] not in ("clean", "dry_run"):
                    print(f"  -> {r['status']}")
                if r["status"] == "reverted":
                    print(f"  -> reverted, tests failed")
        else:
            print(f"target not found: {args.target}")
            return 1
    else:
        files = sorted(BACKEND_DIR.rglob("*.py")) + sorted(TESTS_DIR.rglob("*.py"))
        results = []
        for f in files[:args.limit]:
            r = refine_file(f, env, dry_run=args.dry_run)
            results.append(r)

    for r in results:
        status = r["status"]
        icon = {"clean": "✓", "fixed": "✓", "dry_run": "~", "reverted": "✗", "llm_failed": "!", "error": "!"}.get(status, "?")
        print(f"  {icon} {r['file']}: {status}")
        if r.get("error"):
            print(f"    error: {r['error']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
