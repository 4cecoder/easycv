---
title: EasyCV Autonomous Automation Loop
status: complete
created: 2026-08-01
updated: 2026-08-01
category: automation
tags: [tdd, ocr, llm, pytest, automation]
source: EasyCV project
---

# EasyCV Autonomous Automation Loop

This document describes the complete automation loop for the EasyCV project.

## Overview

The automation system operates in two main phases:

1. **OCR Refinement Phase**: Alibaba OpenCodeReview scans code and suggests fixes
2. **TDD Auto-Fix Phase**: Tests detect failures and LLM generates fixes

Both phases loop until tests pass or limits are reached.

## System Architecture

### Deterministic Components

- **Test Runners**: pytest, TypeScript typecheck, TypeScript tests, Playwright E2E
- **File Operations**: Backup, edit, restore with git-style safety
- **Progress Tracking**: JSON-based run history and fix tracking

### LLM-Guided Components

- **OCR Analysis**: Alibaba OpenCodeReview scans code with rule-based review
- **LLM Refactoring**: LLM refactors code based on OCR feedback
- **LLM Auto-Fix**: LLM generates minimal fixes for test failures

## Phase 1: OCR Refinement Loop

### Command

```bash
uv run python -m automation refine --target backend/ --limit 10
```

### Workflow Steps

1. **Scan Files**: OpenCodeReview scans target files
   - Uses `ocr scan` with agent audience mode
   - Generates rule-based feedback
   - Flags: security, bugs, unsafe access, ReDoS

2. **Request Refactor**: LLM refactors code
   - Input: Source code + OCR comments
   - Output: Refactored code in python code block
   - Constraint: Preserve all functionality and signatures

3. **Apply Safely**: Backup and edit
   - Create `.refine.bak` backup
   - Write refactored code
   - Verify with pytest

4. **Verify or Revert**: Test-driven apply
   - If tests pass: Keep changes, delete backup
   - If tests fail: Restore backup, report reverted

### Safety Features

- Auto-revert on test failure
- Backup files for every edit
- Dry-run mode for preview
- Progress tracking in `progress.json`

### Configuration

- `--target`: File or directory (default: backend/)
- `--limit`: Max files to process (default: 5)
- `--dry-run`: Preview without applying changes

## Phase 2: TDD Auto-Fix Loop

### Command

```bash
uv run python -m automation tdd
```

### Workflow Steps

1. **Run Tests**: Execute full pytest suite
   - Parse pass/fail counts
   - Extract failure details
   - Stop if all tests pass

2. **Parse Failures**: Extract error details
   - Test file and test name
   - Error messages and stack traces
   - Relevant source code

3. **Generate Fixes**: LLM suggests fixes
   - Input: Failure details + source code
   - Output: Fixed code in python code block
   - Constraint: Minimal change only

4. **Apply Fix**: Backup and edit
   - Create `.bak` backup
   - Write fixed code
   - Report status

5. **Retest**: Verify fix worked
   - Run pytest again
   - Loop until pass or max rounds reached

### Safety Features

- Max rounds limit (default: 5)
- Max failures limit (default: 10)
- Abort on too many failures
- Progress tracking

### Configuration

- `--target`: Test file pattern (default: all tests)
- `--rounds`: Max TDD rounds (default: 5 from env)
- `--max-failures`: Abort threshold (default: 10 from env)

## Full Automation Loop

### Execute Complete Pipeline

```bash
# Phase 1: OCR refinement
uv run python -m automation refine --target backend/ --limit 10

# Phase 2: TDD auto-fix
uv run python -m automation tdd
```

### Expected Flow

1. OCR scans backend files
2. LLM refactors flagged code
3. Tests verify each refactor
4. TDD loop fixes any remaining failures
5. Progress tracked in `progress.json`

### Stop Conditions

- All tests pass
- Max rounds reached
- Too many failures
- Manual abort

## Progress Tracking

### File Location

`automation/progress.json`

### Data Structure

```json
{
  "runs": [
    {
      "type": "tdd|ocr_scan|llm_fix|test_run",
      "target": "file or pattern",
      "timestamp": "ISO-8601",
      "conclusion": "all_pass|success|failure"
    }
  ],
  "fixes": [
    {
      "file": "path/to/file",
      "issue": "type",
      "severity": "high|medium|low",
      "description": "text",
      "status": "fixed|pending"
    }
  ],
  "last_updated": "ISO-8601"
}
```

### Status Command

```bash
uv run python -m automation status
```

Output:
```
total runs:     7
total fixes:    4
last run:       tdd — all_pass
last updated:   2026-07-31T18:54:04.308508+00:00
```

## Available Commands

| Command | Purpose |
|---------|---------|
| `test` | Run all tests (pytest + TS) |
| `tdd` | Run TDD auto-fix loop |
| `refine` | Run OCR + LLM refactor loop |
| `playwright` | Run E2E browser tests |
| `improve` | Suggest fixes for failures |
| `ocr` | List available OCR rules |
| `scout` | Discover LLM servers |
| `status` | Show progress summary |
| `chat` | Send prompt to LLM |

## Environment Requirements

### Required Tools

- `uv`: Python package manager
- `bun`: JavaScript runtime
- `ocr`: OpenCodeReview CLI (`@alibaba-group/open-code-review`)
- `pytest`: Python test framework
- `pytest-cov`: Coverage plugin

### LLM Configuration

Configured in `automation/.env`:

```bash
LLM_BASE_URL=http://192.168.122.2:8081/v1
MODEL=Ornith-1.0-35B-MTP-APEX-I-Mini
```

### Project Structure

```
automation/
├── __main__.py          # CLI entry point
├── steer.py             # Command router
├── tdd.py               # TDD loop logic
├── refine.py            # OCR + LLM refactor loop
├── improve.py           # LLM fix suggestion
├── test_orchestration.py # Test runners
├── llm_client.py        # LLM API client
├── config.py            # Configuration loader
├── progress.json        # Run history
├── .ocr-tmp/            # OCR temporary files
└── okf-manifest.json    # This package manifest
```

## Integration with Git

### Before Automation

```bash
cd /home/fource/bytecats/projects/web/easycv
git pull
```

### After Automation

```bash
git status
git diff
git commit -am "automation: apply fixes"
git push
```

### Safety Checks

- Automation creates backups before edits
- Auto-revert on test failure
- Progress JSON tracks all changes
- Manual review recommended before push

## Troubleshooting

### OCR Not Found

Install OpenCodeReview:
```bash
bun install -g @alibaba-group/open-code-review
```

### LLM Connection Failed

Check LLM server:
```bash
curl http://192.168.122.2:8081/v1/models
```

### Tests Keep Failing

Increase limits:
```bash
uv run python -m automation tdd --rounds 10 --max-failures 20
```

### Progress JSON Corrupt

Backup exists in `.ocr-tmp/`:
```bash
cp automation/.ocr-tmp/* .
```