# EasyCV Active Todos

## Priority 1 (Do Today)
- [ ] Fix Content-Type header in make_request() for GET requests
- [ ] Improve exception handling - don't swallow KeyboardInterrupt
- [ ] Test tdd loop on single failing test
- [ ] Review and document remaining OCR feedback

## Priority 2 (Do This Week)
- [ ] Fix TypeScript vitest/globals type definition
- [ ] Get typecheck passing
- [ ] Run full automation test suite (pytest + TypeScript)
- [ ] Create backup/restore strategy for automation runs
- [ ] Set up pre-commit OCR scan hook

## Priority 3 (Do Next Sprint)
- [ ] Implement async sleep for retry loops
- [ ] Add performance benchmarks to automation
- [ ] Create automation contribution guide
- [ ] Integrate OCR feedback into git workflow

## Completed Today
- [x] Fix OCR security issue (ReDoS in extract_code_block)
- [x] Fix bug: empty choices array handling
- [x] Fix bug: safe nested dictionary access
- [x] Fix bug: explicit None checks instead of truthiness
- [x] Apply LLM fixes to llm_client.py
- [x] Verify tests still passing after fixes
- [x] Set up goal management (GOALS.md)
- [x] Set up todo tracking (TODOS.md)

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
- `python -m automation improve --target <file>` shows suggested fixes
- `python -m automation tdd` runs automated improvement loop