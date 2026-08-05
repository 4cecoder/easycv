import sys
from typing import Optional
from automation.config import ROOT, get_env
from automation.test_orchestration import run_pytest, run_typecheck, load_progress, save_progress
from automation.improve import parse_test_failures, llm_suggest_fix, find_source_file


def resolve_test_target(target: str) -> Optional[str]:
    """Map a CLI target to a pytest target.

    Source directories (backend/, automation/, web/) contain no test files, so
    the full test suite is used instead of running pytest on an empty dir.
    """
    if not target:
        return None
    p = ROOT / target
    if p.is_dir():
        has_tests = (p / "tests").exists() or any(
            p.rglob("test_*.py")
        )
        if has_tests:
            return target
        print(f"[TDD] {target} is a source dir, running full test suite")
        return None
    return target


def tdd_loop(target: str = "", max_rounds: int = 0, max_failures: int = 0) -> int:
    env = get_env()
    max_rounds = max_rounds or env["tdd_max_rounds"]
    max_failures = max_failures or env["tdd_max_failures"]
    pytest_target = resolve_test_target(target)
    progress = load_progress()
    run_record = {
        "type": "tdd",
        "target": target,
        "rounds": [],
        "started_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
    }

    print(f"[TDD] Target: {target or '(all tests)'}")
    print(f"[TDD] Max rounds: {max_rounds}, max failures: {max_failures}")

    for round_num in range(1, max_rounds + 1):
        print(f"\n{'='*60}")
        print(f"[TDD] Round {round_num}/{max_rounds}")
        print(f"{'='*60}")

        # ── Run tests ──────────────────────────────────────────────────────
        print("\n[TDD] Running tests...")
        pytest_result = run_pytest(pytest_target)
        passed = pytest_result["passed"]
        failed = pytest_result["failed"]
        print(f"  [TDD] pytest: {passed} passed, {failed} failed")

        failures = parse_test_failures(pytest_result)
        print(f"  [TDD] parsed failures: {len(failures)}")

        round_record = {
            "round": round_num,
            "passed": passed,
            "failed": failed,
            "fixes": [],
        }

        if failed == 0:
            print(f"\n[TDD] All tests pass!") if round_num > 1 else None
            run_record["rounds"].append(round_record)
            run_record["conclusion"] = "all_pass"
            progress["runs"].append(run_record)
            save_progress(progress)
            return 0

        if failed > max_failures:
            print(f"[TDD] Too many failures ({failed} > {max_failures}), aborting.")
            run_record["rounds"].append(round_record)
            run_record["conclusion"] = "too_many_failures"
            progress["runs"].append(run_record)
            save_progress(progress)
            return 1

        # ── Fix each failure ───────────────────────────────────────────────
        for f in failures[:max_failures]:
            test_name = f"{f.get('test_file', '?')}::{f.get('test_name', '?')}"
            print(f"  [fix] {test_name}")
            target_file = find_source_file(f)
            if not target_file:
                print(f"    -> cannot locate source, skipping")
                round_record["fixes"].append({"test": test_name, "status": "no_source"})
                continue
            print(f"    -> fixing source: {target_file.relative_to(ROOT)}")

            src = target_file.read_text()
            fix_code = llm_suggest_fix(f, src, env, source_path=target_file)
            if not fix_code:
                print(f"    -> LLM returned no fix, skipping")
                round_record["fixes"].append({"test": test_name, "status": "no_llm_fix"})
                continue

            from automation.improve import apply_fix
            ok = apply_fix(target_file, fix_code, test_name)
            round_record["fixes"].append({"test": test_name, "status": "applied" if ok else "write_failed"})
            print(f"    -> {'applied' if ok else 'write failed'}")

        run_record["rounds"].append(round_record)

    print(f"\n[TDD] Max rounds ({max_rounds}) reached without full pass.")
    run_record["conclusion"] = "max_rounds"
    progress["runs"].append(run_record)
    save_progress(progress)
    return 1
