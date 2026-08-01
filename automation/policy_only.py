#!/usr/bin/env python
"""
Policy-only enforcement runner for EasyCV automation.

Runs policy checks without OCR scanning - hard-coded guardrails only.
"""

import argparse
from pathlib import Path

from automation.policy_enforcer import get_policy_enforcer
from automation.config import ROOT, BACKEND_DIR, WEB_DIR, TESTS_DIR


def main():
    parser = argparse.ArgumentParser(description="Policy-only enforcement (hard-coded guardrails)")
    parser.add_argument("--target", type=str, help="File or directory to check")
    parser.add_argument("--limit", type=int, default=20, help="Max files to check")
    args = parser.parse_args()

    target_dir = args.target or "backend/"
    print(f"\n[policy] Starting policy enforcement on: {target_dir}")
    print(f"[policy] Limit: {args.limit} file(s)")
    print("=" * 60)

    # Find files
    target = ROOT / target_dir
    if target.is_file():
        files = [target]
    elif target.is_dir():
        files = sorted(target.rglob("*.py")) + sorted(target.rglob("*.ts")) + sorted(target.rglob("*.tsx"))
        print(f"[policy] Found {len(files)} files, processing up to {args.limit}")
        files = files[:args.limit]
    else:
        print(f"[policy] Error: target not found: {args.target}")
        return 1

    # Check each file
    results = []
    total_violations = 0
    total_critical = 0

    for file_path in files:
        # Determine target (backend/frontend)
        if str(file_path).startswith(str(WEB_DIR)):
            target_name = "frontend"
        else:
            target_name = "backend"

        try:
            enforcer = get_policy_enforcer(target_name)
            code = file_path.read_text()
            violations = enforcer.check_file(file_path, code)

            if violations:
                critical_count = sum(1 for v in violations if v.severity == "critical")
                total_violations += len(violations)
                total_critical += critical_count

                rel_path = file_path.relative_to(ROOT)
                print(f"\n🔴 {rel_path}")
                print(f"   {len(violations)} violation(s) ({critical_count} critical)")

                # Show first 5 violations
                for v in violations[:5]:
                    icon = {"critical": "🔴", "error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(v.severity, "?")
                    print(f"   {icon} [{v.severity.upper()}] line {v.line}: {v.message}")
                    if v.suggestion:
                        print(f"      💡 {v.suggestion}")

                if len(violations) > 5:
                    print(f"   ... and {len(violations) - 5} more")

                results.append({
                    "file": str(rel_path),
                    "violations": len(violations),
                    "critical": critical_count,
                })
        except Exception as e:
            print(f"\n⚠️ {file_path.relative_to(ROOT)}: policy check failed ({e})")
            continue

    # Summary
    print("\n" + "=" * 60)
    print(f"[policy] Summary:")
    print(f"   Files checked: {len(files)}")
    print(f"   Files with violations: {len(results)}")
    print(f"   Total violations: {total_violations}")
    print(f"   Critical violations: {total_critical}")
    print("=" * 60)

    if results:
        print("\n[policy] Files with violations:")
        for r in results:
            icon = "🔴" if r["critical"] > 0 else "⚠️"
            print(f"  {icon} {r['file']}: {r['violations']} ({r['critical']} critical)")

    if total_critical > 0:
        print(f"\n🔴 Policy enforcement: FAILED ({total_critical} critical violation(s))")
        return 1
    elif total_violations > 0:
        print(f"\n⚠️ Policy enforcement: PASSED with warnings ({total_violations} violation(s))")
        return 0
    else:
        print(f"\n✅ Policy enforcement: PASSED (no violations)")
        return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())