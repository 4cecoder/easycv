# EasyCV Automation Goals

## Current Status
- ✅ LLM endpoint configured (self-hosted llama.cpp on gentoo, Ornith-35B) — no cloud tokens
- ✅ OCR configured to use the same endpoint (custom provider, no cloud calls)
- ✅ Test suite passing (236/236, +16 automation tests) — All tests green!
- ✅ Added `loop` command: policy → OCR refine → TDD fix → tests → optional commit
- ✅ Worktree orchestrator with per-file verified commits and plumbing merge
- ✅ Master pre-commit hook (blocks direct commits, forces automation workflow)
- ✅ Launchd scheduler for autonomous daily runs (03:00, auto-commit+push on green)
- ✅ Chunked refactor for large files (>800 lines, ~400-line chunks)
- ✅ Fixed typecheck (Stripe API version), OCR refine capture bug, multi-failure parsing
- ✅ Refine chain proven end-to-end: OCR → LLM refactor → compile gate → pytest verify → keep/revert
- ✅ Compile gate (`ast.parse`) rejects broken LLM output before touching files; retry once with syntax feedback
- ✅ Size guard: files > 800 lines / 35KB auto-refactored in chunks with final validation
- ✅ Real fixes applied and verified: `ste100.py` (precompiled regexes, buggy unit pattern), `latex.py` (path-traversal guard, stderr surfacing)
- ✅ Full `loop` run on backend: ALL GREEN (pytest + typecheck + ts_tests)

## Short-Term Goals (1-2 weeks)

### 1. Fix Remaining OCR Issues
- [x] OCR comment parsing fixed (block-based capture, ANSI strip, dedup)
- [x] Compile gate + retry-on-syntax-error added (LLM output validated before apply)
- [x] Size guard for large files (auto-chunked refactor, ~400 lines per chunk)
- [x] Regression tests for validation/size-guard/chunking logic
- [ ] Add regression tests for the full `loop` command with --commit
- [ ] Batch OCR scans across files to reduce per-file LLM round trips
- [ ] Add `ruff`/`pyflakes` as a fast deterministic pre-check before OCR
- [x] Chunked refactor for large files (>800 lines) implemented and tested
- **Priority**: High | **Owner**: Automation

### 2. TypeScript Pipeline
- [x] Get typecheck passing (Stripe API version fixed)
- [x] Run all TypeScript tests
- [ ] Add regression test for Stripe version alignment
- **Priority**: Medium | **Owner**: Web

### 3. TDD Loop Implementation
- [x] Run tdd loop on backend/ with real failures
- [x] Fix TDD loop to fix source files (not test files)
- [x] Add per-file commit integration for TDD fixes
- [ ] Document successful refactor patterns
- **Priority**: High | **Owner**: Automation

### 4. Code Review Integration
- [x] Create pre-commit hook for master protection (blocks direct commits)
- [x] Auto-generate fix suggestions (via OCR + LLM)
- [x] Integrate with git workflow (worktree + run branch + plumbing merge)
- [ ] Add regression tests for gitops (worktree/branch/commit/merge)
- **Priority**: Medium | **Owner**: DevOps

## Mid-Term Goals (1-2 months)

### 5. Full Stack Testing
- [ ] End-to-end test coverage
- [ ] Integration with worker pipeline
- [ ] Performance benchmarks
- **Priority**: High | **Owner**: Testing

### 6. Documentation
- [x] Automation pipeline docs (README.md updated with git strategy)
- [x] OCR integration guide (README.md updated)
- [x] Contribution guidelines (README.md updated)
- **Priority**: Low | **Owner**: Docs

## Progress Tracking
Run: `python -m automation status`

## Goal Management Commands
- Add goal: Edit this file with new [ ] item
- Mark complete: Change [ ] to [x]
- Review: `grep -r "\[ \]" GOALS.md | head -10`
- Summary: `python -m automation status`
