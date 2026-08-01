import argparse
import sys

from automation.config import get_env, ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR
from automation.test_orchestration import (
    run_pytest,
    run_playwright,
    run_ts_tests,
    run_typecheck,
    run_ts_build,
    run_all_tests,
    summarize,
    load_progress,
    save_progress,
)
from automation.tdd import tdd_loop
from automation.playwright_agent import full_pipeline, start_dev_server, stop_dev_server
from automation.improve import suggest_improvements, parse_test_failures
from automation.refine import refine_file, discover_ocr_rules
from automation.scanner import discover_llm_servers
from automation.llm_client import chat


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="easycv-automation",
        description="easyCV automation pipeline CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── test ────────────────────────────────────────────────────────────────────
    p_test = sub.add_parser("test", help="Run all tests (pytest + TS typecheck + TS tests + TS build)")
    p_test.add_argument("--target", type=str, default="", help="Test file pattern to run (pytest only, skips TS)")
    p_test.add_argument("--skip-ts", action="store_true", help="Skip TypeScript typecheck, tests, and build")

    # ── tdd ─────────────────────────────────────────────────────────────────────
    p_tdd = sub.add_parser("tdd", help="Run TDD loop: test → LLM fix failures → retest (up to N rounds)")
    p_tdd.add_argument("--target", type=str, default="", help="Test file pattern to target")
    p_tdd.add_argument("--rounds", type=int, default=0, help="Maximum TDD rounds")
    p_tdd.add_argument("--max-failures", type=int, default=0, help="Abort if failures exceed this count")

    # ── playwright ──────────────────────────────────────────────────────────────
    p_pw = sub.add_parser("playwright", help="Start dev server, run Playwright tests, stop server")
    p_pw.add_argument("--target", type=str, default="", help="Playwright test file pattern")
    p_pw.add_argument("--no-headless", action="store_true", help="Run browser in headed mode")

    # ── improve ─────────────────────────────────────────────────────────────────
    p_imp = sub.add_parser("improve", help="Analyze test failures and suggest LLM-generated fixes")
    p_imp.add_argument("--target", type=str, default="", help="Test file pattern to analyze")

    # ── refine ──────────────────────────────────────────────────────────────────
    p_refine = sub.add_parser("refine", help="Run Alibaba OCR code review + LLM refactor loop")
    p_refine.add_argument("--target", type=str, default="", help="File or directory to refine")
    p_refine.add_argument("--dry-run", action="store_true", help="Show changes without applying")
    p_refine.add_argument("--limit", type=int, default=5, help="Max files to refine")

    # ── ocr ────────────────────────────────────────────────────────────────────
    sub.add_parser("ocr", help="List available OCR (OpenCodeReview) rules")

    # ── scout ───────────────────────────────────────────────────────────────────
    sub.add_parser("scout", help="Discover LLM servers on local network")

    # ── status ──────────────────────────────────────────────────────────────────
    sub.add_parser("status", help="Show automation progress summary from progress.json")

    # ── chat ────────────────────────────────────────────────────────────────────
    p_chat = sub.add_parser("chat", help="Send a prompt to the configured LLM endpoint")
    p_chat.add_argument("--prompt", type=str, required=True, help="Prompt text to send")
    p_chat.add_argument("--model", type=str, default=None, help="Override the LLM model name")

    args = parser.parse_args()

    if args.command == "test":
        print("\n[test] Running test suite...")
        print("=" * 60)
        if args.target:
            print(f"[test] Targeting: {args.target}")
            result = run_pytest(target=args.target)
            if result["returncode"] == 0:
                print(f"\n[test] ✓ PASS: {result['passed']} passed, {result['failed']} failed")
                return 0
            else:
                print(f"\n[test] ✗ FAIL: {result['passed']} passed, {result['failed']} failed")
                return 1
        elif args.skip_ts:
            print(f"[test] Running pytest only (skipping TypeScript)")
            result = run_pytest()
            if result["returncode"] == 0:
                print(f"\n[test] ✓ PASS: {result['passed']} passed, {result['failed']} failed")
                return 0
            else:
                print(f"\n[test] ✗ FAIL: {result['passed']} passed, {result['failed']} failed")
                return 1
        else:
            print(f"[test] Running full suite (pytest + typecheck + ts_tests + ts_build)")
            result = run_all_tests()
            print(summarize(result))
            return 0 if result["all_pass"] else 1

    elif args.command == "tdd":
        return tdd_loop(target=args.target, max_rounds=args.rounds, max_failures=args.max_failures)

    elif args.command == "playwright":
        result = full_pipeline(target=args.target, headless=not args.no_headless)
        rc = result["result"]["returncode"]
        if rc == 0:
            print("playwright: all tests passed")
        else:
            print(f"playwright: exit code {rc}")
            if result.get("analysis"):
                print("analysis:", result["analysis"])
        return 0 if rc == 0 else 1

    elif args.command == "improve":
        if args.target:
            pytest_result = run_pytest(target=args.target)
        else:
            pytest_result = run_pytest()
        suggestions = suggest_improvements({"pytest": pytest_result})
        if not suggestions:
            print("no failures to improve")
            return 0
        for s in suggestions:
            test = f"{s.get('test_file', '?')}::{s.get('test_name', '?')}"
            if s.get("fix"):
                print(f"fix: {test}")
                print(s["fix"])
                print()
            else:
                reason = s.get("reason", "unknown")
                print(f"skip: {test} ({reason})")
        return 0

    elif args.command == "refine":
        from automation.refine import main as refine_main
        refine_argv = [sys.argv[0], "--target", args.target]
        if args.dry_run:
            refine_argv.append("--dry-run")
        refine_argv.extend(["--limit", str(args.limit)])
        sys.argv = refine_argv
        return refine_main()

    elif args.command == "ocr":
        rules = discover_ocr_rules()
        if rules:
            for r in rules:
                print(r["rule"])
        else:
            print("no OCR rules found")
        return 0

    elif args.command == "scout":
        servers = discover_llm_servers()
        if not servers:
            print("no LLM servers discovered")
            return 1
        for s in servers:
            print(f"{s['type']:20s} {s['base_url']:40s} ({s['ip']})")
        return 0

    elif args.command == "status":
        progress = load_progress()
        runs = progress.get("runs", [])
        fixes = progress.get("fixes", [])
        print(f"total runs:     {len(runs)}")
        print(f"total fixes:    {len(fixes)}")
        if runs:
            last = runs[-1]
            print(f"last run:       {last.get('type', 'unknown')} — {last.get('conclusion', 'incomplete')}")
        if progress.get("last_updated"):
            print(f"last updated:   {progress['last_updated']}")
        return 0

    elif args.command == "chat":
        env = get_env()
        response = chat(
            [{"role": "user", "content": args.prompt}],
            model=args.model or env["model"],
        )
        if response:
            print(response)
            return 0
        else:
            print("chat: no response from LLM endpoint")
            return 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
