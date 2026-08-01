---
title: EasyCV Automation Command Reference
status: complete
created: 2026-08-01
updated: 2026-08-01
category: reference
tags: [cli, commands, automation]
source: EasyCV project
---

# EasyCV Automation Command Reference

Complete reference for all automation CLI commands.

## Entry Point

```bash
cd /home/fource/bytecats/projects/web/easycv
uv run python -m automation <command>
```

## Commands

### test

Run all tests in the project.

```bash
uv run python -m automation test [OPTIONS]
```

#### Options

- `--target TEXT`: Test file pattern to run (pytest only)
- `--skip-ts`: Skip TypeScript typecheck, tests, and build

#### Behavior

- Runs pytest with verbose output
- Runs TypeScript typecheck
- Runs TypeScript tests
- Runs TypeScript build
- Returns 0 if all pass, 1 if any fail

#### Examples

```bash
# Run all tests
uv run python -m automation test

# Run pytest only
uv run python -m automation test --skip-ts

# Run specific test file
uv run python -m automation test --target tests/test_pipeline.py
```

---

### tdd

Run TDD loop with auto-fix.

```bash
uv run python -m automation tdd [OPTIONS]
```

#### Options

- `--target TEXT`: Test file pattern to target
- `--rounds INT`: Maximum TDD rounds (default: 5 from env)
- `--max-failures INT`: Abort if failures exceed this count (default: 10 from env)

#### Behavior

1. Run pytest and count failures
2. Parse failure details
3. For each failure, read source code
4. Ask LLM to suggest minimal fix
5. Apply fix with backup
6. Retest and repeat until pass or max rounds

#### Stop Conditions

- All tests pass (exit 0)
- Too many failures (exit 1)
- Max rounds reached (exit 1)

#### Examples

```bash
# Run TDD on all tests
uv run python -m automation tdd

# Run TDD on specific test file
uv run python -m automation tdd --target tests/test_pipeline.py

# Run with custom limits
uv run python -m automation tdd --rounds 10 --max-failures 20
```

---

### refine

Run OCR code review + LLM refactor loop.

```bash
uv run python -m automation refine [OPTIONS]
```

#### Options

- `--target TEXT`: File or directory to refine (default: backend/)
- `--dry-run`: Show changes without applying
- `--limit INT`: Max files to refine (default: 5)

#### Behavior

1. Scan files with OpenCodeReview
2. Extract comments and suggestions
3. Send source + comments to LLM
4. Get refactored code back
5. Backup original file
6. Apply refactor
7. Verify with pytest
8. Revert if tests fail

#### Stop Conditions

- All files processed
- User manual abort

#### Examples

```bash
# Refine backend files
uv run python -m automation refine --target backend/

# Refine with dry-run
uv run python -m automation refine --target backend/ --dry-run

# Refine specific file
uv run python -m automation refine --target backend/pipeline.py

# Refine more files
uv run python -m automation refine --target backend/ --limit 10
```

---

### playwright

Run Playwright E2E browser tests.

```bash
uv run python -m automation playwright [OPTIONS]
```

#### Options

- `--target TEXT`: Playwright test file pattern
- `--no-headless`: Run browser in headed mode

#### Behavior

1. Start dev server in background
2. Run Playwright tests
3. Stop dev server
4. Return test results

#### Examples

```bash
# Run Playwright tests
uv run python -m automation playwright

# Run in headed mode
uv run python -m automation playwright --no-headless

# Run specific test file
uv run python -m automation playwright --target web/tests/upload.spec.ts
```

---

### improve

Analyze test failures and suggest fixes.

```bash
uv run python -m automation improve [OPTIONS]
```

#### Options

- `--target TEXT`: Test file pattern to analyze (default: all tests)

#### Behavior

1. Run pytest and collect failures
2. Parse failure details
3. For each failure, read source
4. Ask LLM to suggest fix
5. Print suggestions (no auto-apply)

#### Output

- Test file and name
- Suggested fix code block
- Reason if fix not available

#### Examples

```bash
# Improve all tests
uv run python -m automation improve

# Improve specific test file
uv run python -m automation improve --target tests/test_pipeline.py
```

---

### ocr

List available OCR rules.

```bash
uv run python -m automation ocr
```

#### Behavior

Calls `ocr rules list` and displays available rules.

#### Examples

```bash
# List all rules
uv run python -m automation ocr
```

---

### scout

Discover LLM servers on local network.

```bash
uv run python -m automation scout
```

#### Behavior

Scans network for LLM endpoints and displays:
- Server type
- Base URL
- IP address

#### Examples

```bash
# Discover servers
uv run python -m automation scout
```

---

### status

Show automation progress summary.

```bash
uv run python -m automation status
```

#### Behavior

Reads `automation/progress.json` and displays:
- Total runs
- Total fixes
- Last run type and conclusion
- Last updated timestamp

#### Examples

```bash
# Show status
uv run python -m automation status
```

---

### chat

Send a prompt to the configured LLM endpoint.

```bash
uv run python -m automation chat --prompt TEXT [OPTIONS]
```

#### Options

- `--prompt TEXT`: Prompt text to send (required)
- `--model TEXT`: Override the LLM model name

#### Behavior

Sends prompt to LLM and prints response.

#### Examples

```bash
# Chat with LLM
uv run python -m automation chat --prompt "Explain TDD"

# Use different model
uv run python -m automation chat --prompt "Hello" --model "gpt-4"
```

---

## Exit Codes

- `0`: Success
- `1`: Failure or error

## Environment Variables

Configured in `automation/.env`:

```bash
# LLM endpoint
LLM_BASE_URL=http://192.168.122.2:8081/v1

# Model name
MODEL=Ornith-1.0-35B-MTP-APEX-I-Mini

# TDD limits
TDD_MAX_ROUNDS=5
TDD_MAX_FAILURES=10
```

## Progress Tracking

All runs recorded in `automation/progress.json`.

## Common Workflows

### Full Automation Loop

```bash
# Pull latest code
git pull

# Phase 1: OCR refinement
uv run python -m automation refine --target backend/ --limit 10

# Phase 2: TDD auto-fix
uv run python -m automation tdd

# Review changes
git status

# Commit and push
git commit -am "automation: apply fixes"
git push
```

### Quick Test Run

```bash
# Run all tests
uv run python -m automation test
```

### Debug Specific Test

```bash
# Improve suggestions
uv run python -m automation improve --target tests/test_pipeline.py

# Run TDD on specific test
uv run python -m automation tdd --target tests/test_pipeline.py
```

### Code Quality Scan

```bash
# Dry-run OCR scan
uv run python -m automation refine --target backend/ --dry-run --limit 5
```

## Troubleshooting

### Command Not Found

Ensure you are in the project directory:
```bash
cd /home/fource/bytecats/projects/web/easycv
```

### LLM Connection Failed

Check LLM server status:
```bash
curl http://192.168.122.2:8081/v1/models
```

### OCR Not Available

Install OpenCodeReview:
```bash
bun install -g @alibaba-group/open-code-review
```

### Tests Keep Failing

Increase limits:
```bash
uv run python -m automation tdd --rounds 10 --max-failures 20
```