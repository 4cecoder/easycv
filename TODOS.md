# EasyCV Active Todos

## Priority 1 (Do Today)
- [ ] Add regression tests for the full `loop` command
- [ ] Run a full autonomous pass on backend/ and web/
- [ ] Wire up scheduled runs (launchd) on a real schedule

## Priority 2 (Do This Week)
- [ ] Review and document remaining OCR feedback
- [ ] Add `ruff` or `pyflakes` as a fast deterministic pre-check before OCR
- [ ] Batch OCR scans across files to reduce per-file LLM round trips
- [ ] Create backup/restore strategy for automation runs
- [ ] Set up pre-commit OCR scan hook

## Priority 3 (Do Next Sprint)
- [ ] Implement async sleep for retry loops
- [ ] Add performance benchmarks to automation
- [ ] Create automation contribution guide
- [ ] Integrate OCR feedback into git workflow

## Completed Today
- [x] Fix Content-Type header in make_request() for GET requests
- [x] Improve exception handling - don't swallow KeyboardInterrupt (OCR feedback on pipeline.py)
- [x] Test tdd loop on single failing test
- [x] Fix `.env` to point at working gentoo llama.cpp endpoint (was dead 192.168.122.2)
- [x] Configure OCR provider to use gentoo llama.cpp (no cloud tokens)
- [x] Fix parse_test_failures to capture ALL failures, not just the last
- [x] Fix TDD loop to fix source files (from traceback), not overwrite test files
- [x] Harden llm_client: retry all transient errors, configurable timeouts, no Content-Type on GET
- [x] Add `loop` command: policy → refine → tdd → tests → optional commit
- [x] Add schedule.sh + launchd plist for autonomous daily runs
- [x] Fix OCR refine loop (temp copy was untracked → OCR skipped it, 0 comments)
- [x] Fix Stripe API version typecheck error (2026-07-29 → 2026-06-24.dahlia)
- [x] Fix OCR security issue (ReDoS in extract_code_block)
- [x] Fix bug: empty choices array handling
- [x] Fix bug: safe nested dictionary access
- [x] Fix bug: explicit None checks instead of truthiness
- [x] Apply LLM fixes to llm_client.py
- [x] Verify tests still passing after fixes
- [x] Set up goal management (GOALS.md)
- [x] Set up todo tracking (TODOS.md)
- [x] Fix OCR comment parsing (block-based capture, ANSI strip, dedup) — was counting chars as "comments"
- [x] Add compile gate (`ast.parse`) + one feedback retry — rejects broken LLM output before apply
- [x] Add size guard: >800 lines / 35KB reported for manual review, not auto-refactored
- [x] Proven refine chain end-to-end: ste100.py refactored + verified (precompiled regexes, unit-pattern bug fix)
- [x] latex.py refactored + verified (path-traversal guard, stderr surfacing, broadened exception handling)
- [x] pipeline.py size-guard verified (LLM truncates at ~630-680 lines on large rewrites; compile gate caught it)
- [x] Full `loop` run on backend: ALL GREEN (236 pytest, typecheck PASS, ts_tests PASS)
- [x] Rewrite corrupted GOALS.md (had literal N| line-number prefixes)
- [x] Tests: 14 automation tests passing (was 9; +validate_python, +exceeds_refactor_limit)

## Quick Commands
```bash
# Show active todos
grep -n "\[ \]" TODOS.md | head -10

# Show completed
grep -n "\[x\]" TODOS.md | head -10

# Add new todo
echo "- [ ] New task" >> TODOS.md

# Mark complete
sed -i 's/- \[ \] Task/- [x] Task/' TODOS.md
```

## Integration with Automation
- `python -m automation status` shows automation progress
- `python -m automation loop` runs the full self-driving cycle
- `python -m automation improve --target <file>` shows suggested fixes
- `python -m automation tdd` runs automated improvement loop