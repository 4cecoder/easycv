import argparse
import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR, get_env
from automation.llm_client import chat, extract_code_block, make_request
from automation.test_orchestration import run_pytest


ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# The 35B local model truncates large single-shot rewrites (~600-700 output
# lines). Files above these limits are reported but not auto-refactored.
MAX_REFACTOR_LINES = 800
MAX_REFACTOR_KB = 35


def _strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def run_ocr(file_path: Path, env: dict) -> str:
    if not file_path.exists():
        return ""
    # Scan the tracked file directly. OCR is git-aware and skips untracked
    # files, so the previous .ocr-tmp copy silently produced 0 comments.
    try:
        rel = file_path.relative_to(ROOT)
    except ValueError:
        # File is outside ROOT (e.g., temp file during testing)
        rel = file_path.name
    
    cmd = [
        "ocr", "scan",
        "--path", str(rel),
        "--audience", "agent",
        "--no-plan", "--no-summary", "--no-dedup",
    ]
    try:
        res = subprocess.run(
            cmd, capture_output=True, text=True, cwd=str(ROOT),
            timeout=env.get("ocr_timeout", 600),
        )
    except subprocess.TimeoutExpired:
        print(f"  [refine] {rel}: OCR scan timed out ({env.get('ocr_timeout', 600)}s)")
        return ""

    output = _strip_ansi(res.stdout)
    if "Summary:" not in output or "comment(s)" not in output:
        return ""

    # Each comment block begins with a "─── path:line-range ───" header.
    blocks: list[list[str]] = []
    current: list[str] = []
    in_block = False
    for line in output.split("\n"):
        if "───" in line and str(file_path.name) in line:
            if current:
                blocks.append(current)
            current = [line]
            in_block = True
        elif in_block and line.strip():
            current.append(line)
    if current:
        blocks.append(current)

    # Dedupe blocks that share the same header + severity tag (OCR often
    # emits the same finding twice).
    seen = set()
    unique: list[str] = []
    for block in blocks:
        key = _strip_ansi(block[0] + block[1] if len(block) > 1 else block[0])
        if key in seen:
            continue
        seen.add(key)
        unique.append("\n".join(block).strip())
    return "\n\n".join(unique).strip()


def _chunked_refactor(file_path: Path, code: str, comments: str, env: dict, dry_run: bool, enforce_policy: bool) -> dict:
    """Refactor large files by splitting into chunks, processing each separately."""
    try:
        rel = file_path.relative_to(ROOT)
    except ValueError:
        # File is outside ROOT (e.g., temp file during testing)
        rel = file_path.name
    
    lines = code.splitlines()
    
    # Split into chunks (target ~400 lines per chunk for safety)
    chunk_size = 400
    chunks = []
    for i in range(0, len(lines), chunk_size):
        chunk_lines = lines[i:i + chunk_size]
        chunk_code = "\n".join(chunk_lines)
        chunks.append({
            "start": i + 1,  # 1-indexed line numbers
            "end": i + len(chunk_lines),
            "code": chunk_code,
            "original": chunk_code
        })
    
    print(f"  [chunked] split {len(lines)} lines into {len(chunks)} chunks")
    
    # Process each chunk with OCR and LLM
    refactored_chunks = []
    for i, chunk in enumerate(chunks, 1):
        print(f"  [chunked] processing chunk {i}/{len(chunks)} (lines {chunk['start']}-{chunk['end']})")
        
        # Create a temporary file for this chunk
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix=file_path.suffix, delete=False) as tmp:
            tmp.write(chunk['code'])
            tmp_path = Path(tmp.name)
        
        try:
            # Run OCR on the chunk
            chunk_comments = run_ocr(tmp_path, env)
            if not chunk_comments:
                print(f"  [chunked] chunk {i}: clean (no issues)")
                refactored_chunks.append(chunk['code'])
                continue
            
            # Request refactor for this chunk
            chunk_refactored = request_refactor(chunk['code'], chunk_comments, env)
            if not chunk_refactored:
                print(f"  [chunked] chunk {i}: LLM refactor failed, using original")
                refactored_chunks.append(chunk['code'])
                continue
            
            # Validate Python syntax if applicable
            if file_path.suffix == ".py":
                syntax_err = _validate_python(chunk_refactored)
                if syntax_err:
                    print(f"  [chunked] chunk {i}: syntax error ({syntax_err}), using original")
                    refactored_chunks.append(chunk['code'])
                    continue
            
            print(f"  [chunked] chunk {i}: refactor successful")
            refactored_chunks.append(chunk_refactored)
            
        finally:
            tmp_path.unlink()
    
    # Recombine chunks
    refactored_code = "\n".join(refactored_chunks)
    
    # Final compile gate on the full refactored code
    if file_path.suffix == ".py":
        syntax_err = _validate_python(refactored_code)
        if syntax_err:
            print(f"  [chunked] final recombination failed ({syntax_err})")
            return {
                "file": str(rel),
                "status": "recombination_failed",
                "comments": comments,
                "lines": len(lines),
            }
    
    if dry_run:
        print(f"  [chunked] dry-run mode, skipping apply")
        return {
            "file": str(rel),
            "status": "dry_run",
            "comments": comments,
            "lines": len(lines),
            "chunks": len(chunks),
        }
    
    # Apply the refactored code
    backup = file_path.with_suffix(file_path.suffix + ".refine.bak")
    shutil.copy2(file_path, backup)
    try:
        print(f"  [chunked] applying refactored code...")
        file_path.write_text(refactored_code)
        print(f"  [chunked] verifying with tests...")
        passed = verify_with_tests(file_path, backup)
        if backup.exists():
            backup.unlink()
        
        return {
            "file": str(rel),
            "status": "fixed" if passed else "reverted",
            "comments": comments,
            "lines": len(lines),
            "chunks": len(chunks),
        }
    except Exception as e:
        if backup.exists():
            shutil.copy2(backup, file_path)
            backup.unlink()
        print(f"  [chunked] error: {e}")
        return {
            "file": str(rel),
            "status": "error",
            "error": str(e),
            "comments": comments,
        }


def _exceeds_refactor_limit(file_path: Path, lines: int, size_kb: float) -> bool:
    if lines > MAX_REFACTOR_LINES or size_kb > MAX_REFACTOR_KB:
        print(
            f"  [refine] {file_path.name}: {lines} lines ({size_kb:.0f}KB) exceeds auto-refactor limit "
            f"({MAX_REFACTOR_LINES} lines / {MAX_REFACTOR_KB}KB); comments recorded for manual review"
        )
        return True
    return False


def _validate_python(code: str) -> Optional[str]:
    """Return a SyntaxError description, or None if the code compiles."""
    try:
        ast.parse(code)
        return None
    except SyntaxError as e:
        where = f":{e.lineno}" if e.lineno else ""
        return f"SyntaxError{where} {e.msg}"


def request_refactor(code: str, comments: str, env: dict, feedback: Optional[str] = None) -> Optional[str]:
    prompt = (
        f"Here is a source file from the easyCV codebase:\n\n"
        f"```python\n{code}\n```\n\n"
        f"Here is automated code review feedback:\n\n"
        f"```\n{comments}\n```\n\n"
        f"Refactor the code to address the review feedback. "
        f"Preserve all existing functionality, imports, and signatures. "
        f"Return only the refactored code in a single ```python code block."
    )
    if feedback:
        prompt += (
            f"\n\nYour previous attempt did not compile and was rejected: {feedback}. "
            f"Fix the syntax error and return the complete refactored file again."
        )
    response = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=64000)
    if not response:
        return None
    return extract_code_block(response, "python")


def verify_with_tests(file_path: Path, backup_path: Path) -> bool:
    is_ts = file_path.suffix in (".ts", ".tsx")
    if is_ts:
        from automation.test_orchestration import run_typecheck
        result = run_typecheck()
    else:
        result = run_pytest()
    if result["returncode"] == 0:
        return True
    print(f"  tests failed after edit, restoring backup")
    shutil.copy2(backup_path, file_path)
    return False


def refine_file(file_path: Path, env: dict, dry_run: bool = False, enforce_policy: bool = True) -> dict:
    rel = file_path.relative_to(ROOT)
    print(f"\n[refine] Scanning {rel}...")

    # Phase 0: Policy enforcement (hard-coded guardrails)
    if enforce_policy:
        try:
            from automation.policy_enforcer import get_policy_enforcer

            # Determine target based on file path
            if str(file_path).startswith(str(WEB_DIR)):
                target = "frontend"
            else:
                target = "backend"

            enforcer = get_policy_enforcer(target)
            code = file_path.read_text()
            violations = enforcer.check_file(file_path, code)

            if violations:
                print(f"  [policy] {rel}: {len(violations)} violation(s) found")
                # Format violations for display
                formatted = enforcer.format_violations(violations)
                for line in formatted.split("\n")[:15]:  # Show first 15 lines
                    print(f"  [policy] {line}")

                # Auto-fix critical errors if not dry-run
                critical_violations = [v for v in violations if v.severity == "critical"]
                if critical_violations and not dry_run:
                    print(f"  [policy] {rel}: {len(critical_violations)} critical violation(s) - manual review required")
                    return {
                        "file": str(rel),
                        "status": "policy_critical",
                        "violations": len(violations),
                        "critical": len(critical_violations),
                    }
        except Exception as e:
            print(f"  [policy] {rel}: policy check failed ({e}) - continuing with OCR")

    # Phase 1: OCR scan
    comments = run_ocr(file_path, env)
    if not comments:
        print(f"  [refine] {rel}: clean (no issues found)")
        return {"file": str(rel), "status": "clean", "comments": None}

    code = file_path.read_text()
    comment_blocks = [c for c in comments.split("\n\n") if c.strip()]
    lines = len(code.splitlines())
    size_kb = len(code.encode("utf-8")) / 1024
    if _exceeds_refactor_limit(file_path, lines, size_kb):
        print(f"  [refine] {rel}: large file ({lines} lines, {size_kb:.1f}KB), attempting chunked refactor...")
        chunk_result = _chunked_refactor(file_path, code, comments, env, dry_run, enforce_policy)
        if chunk_result["status"] == "fixed":
            print(f"  [refine] {rel}: ✓ chunked refactor applied and verified")
        else:
            print(f"  [refine] {rel}: ✗ chunked refactor failed ({chunk_result['status']})")
        return chunk_result

    print(f"  [refine] {rel}: {len(comment_blocks)} comment(s) found, requesting refactor...")
    refactored = request_refactor(code, comments, env)
    if not refactored:
        print(f"  [refine] {rel}: LLM refactor failed")
        return {"file": str(rel), "status": "llm_failed", "comments": comments}

    # Deterministic gate: reject code that does not even compile before
    # touching the file (cheap vs. a full pytest run). Retry once with the
    # syntax error fed back to the model.
    if file_path.suffix == ".py":
        syntax_err = _validate_python(refactored)
        if syntax_err:
            print(f"  [refine] {rel}: refactor invalid ({syntax_err}), retrying once...")
            retry = request_refactor(code, comments, env, feedback=syntax_err)
            if not retry:
                print(f"  [refine] {rel}: LLM retry failed")
                return {"file": str(rel), "status": "llm_failed", "comments": comments}
            refactored = retry
            syntax_err = _validate_python(refactored)
            if syntax_err:
                print(f"  [refine] {rel}: retry still invalid ({syntax_err}), skipping")
                return {"file": str(rel), "status": "llm_failed", "comments": comments}

    if dry_run:
        print(f"  [refine] {rel}: dry-run mode, skipping apply")
        return {"file": str(rel), "status": "dry_run", "comments": comments, "diff": refactored}

    backup = file_path.with_suffix(file_path.suffix + ".refine.bak")
    shutil.copy2(file_path, backup)
    try:
        print(f"  [refine] {rel}: applying refactor...")
        file_path.write_text(refactored)
        print(f"  [refine] {rel}: verifying with tests...")
        passed = verify_with_tests(file_path, backup)
        if backup.exists():
            backup.unlink()
        result = {
            "file": str(rel),
            "status": "fixed" if passed else "reverted",
            "comments": comments,
        }
        if passed:
            print(f"  [refine] {rel}: ✓ tests pass, refactor applied")
        else:
            print(f"  [refine] {rel}: ✗ tests failed, reverted")
        return result
    except Exception as e:
        if backup.exists():
            shutil.copy2(backup, file_path)
            backup.unlink()
        print(f"  [refine] {rel}: ! error {e}")
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
    parser.add_argument("--no-policy", action="store_true", help="Disable policy enforcement")
    args = parser.parse_args()

    env = get_env()
    enforce_policy = not args.no_policy
    target_dir = args.target or "backend/"
    print(f"\n[refine] Starting refinement loop on: {target_dir}")
    print(f"[refine] Limit: {args.limit} file(s), Dry-run: {args.dry_run}")
    print("=" * 60)
    
    if args.target:
        target = ROOT / args.target
        if target.is_file():
            print(f"[refine] Targeting single file: {target.relative_to(ROOT)}")
            results = [refine_file(target, env, dry_run=args.dry_run)]
        elif target.is_dir():
            files = sorted(target.rglob("*.py")) + sorted(target.rglob("*.ts")) + sorted(target.rglob("*.tsx"))
            print(f"[refine] Found {len(files)} files in target, processing up to {args.limit}")
            results = []
            for f in files[:args.limit]:
                r = refine_file(f, env, dry_run=args.dry_run, enforce_policy=enforce_policy)
                results.append(r)
        else:
            print(f"[refine] Error: target not found: {args.target}")
            return 1
    else:
        files = sorted(BACKEND_DIR.rglob("*.py")) + sorted(TESTS_DIR.rglob("*.py"))
        print(f"[refine] Using default backend+tests, processing up to {args.limit}")
        results = []
        for f in files[:args.limit]:
            r = refine_file(f, env, dry_run=args.dry_run, enforce_policy=enforce_policy)
            results.append(r)

    print("\n[refine] Summary:")
    print("-" * 60)
    for r in results:
        status = r["status"]
        icon = {"clean": "✓", "fixed": "✓", "dry_run": "~", "reverted": "✗", "llm_failed": "!", "error": "!", "policy_critical": "🔴", "too_large": "⛔"}.get(status, "?")
        print(f"  {icon} {r['file']}: {status}")
        if r.get("violations"):
            print(f"    violations: {r['violations']} ({r.get('critical', 0)} critical)")
        if r.get("error"):
            print(f"    error: {r['error']}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
