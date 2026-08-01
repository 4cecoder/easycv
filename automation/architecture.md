---
title: EasyCV Automation Architecture
status: complete
created: 2026-08-01
updated: 2026-08-01
category: architecture
tags: [architecture, system-design, components]
source: EasyCV project
---

# EasyCV Automation Architecture

System architecture for autonomous coding automation.

## Overview

The automation system uses a two-phase approach:

1. **Deterministic Phase**: Test runners and file operations
2. **LLM-Guided Phase**: OCR analysis and auto-fix loops

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Entry Point                          │
│                    (steer.py / __main__.py)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │   TDD     │  │  Refine   │  │   Test    │
    │   Loop    │  │   Loop    │  │  Runner   │
    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
          │               │               │
          │       ┌───────▼───────┐       │
          │       │   OCR Scan    │       │
          │       │  (Alibaba)    │       │
          │       └───────┬───────┘       │
          │               │               │
          │       ┌───────▼───────┐       │
          │       │ LLM Client    │       │
          │       │ (llm_client)  │       │
          │       └───────┬───────┘       │
          │               │               │
          │       ┌───────▼───────┐       │
          │       │ Test Orchest  │       │
          │       │  (test_*)     │       │
          │       └───────┬───────┘       │
          └───────────────┼───────────────┘
                          │
                  ┌───────▼───────┐
                  │   Progress    │
                  │   Tracking    │
                  │ (progress.json)│
                  └───────────────┘
```

## Core Components

### 1. CLI Entry Point

**Files**: `__main__.py`, `steer.py`

**Responsibility**:
- Parse command-line arguments
- Route to appropriate handler
- Configure environment

**Commands**:
- test, tdd, refine, playwright
- improve, ocr, scout, status, chat

---

### 2. Test Orchestration

**File**: `test_orchestration.py`

**Responsibility**:
- Run pytest with configuration
- Run TypeScript typecheck
- Run TypeScript tests and build
- Run Playwright E2E tests
- Parse test results

**Functions**:
- `run_pytest()`: Execute Python tests
- `run_typecheck()`: TypeScript type checking
- `run_ts_tests()`: Run TypeScript tests
- `run_ts_build()`: TypeScript build
- `run_all_tests()`: Full suite
- `run_playwright()`: E2E browser tests

**Returns**: Dict with stdout, stderr, exit code, pass/fail counts

---

### 3. TDD Loop

**File**: `tdd.py`

**Responsibility**:
- Run tests iteratively
- Parse failures
- Request LLM fixes
- Apply fixes with backup
- Track progress

**Workflow**:
1. Run pytest
2. Parse failures
3. For each failure:
   - Read source code
   - Ask LLM for fix
   - Apply with backup
4. Retest
5. Loop until pass or max rounds

**Safety**:
- Max rounds limit
- Max failures limit
- Backup on every edit
- Auto-revert on failure

---

### 4. Refine Loop (OCR + LLM)

**File**: `refine.py`

**Responsibility**:
- Scan files with OpenCodeReview
- Extract OCR comments
- Request LLM refactor
- Apply with backup
- Verify with tests

**Workflow**:
1. Run OCR scan on file
2. Extract comments
3. Send source + comments to LLM
4. Get refactored code
5. Backup original
6. Apply refactor
7. Verify with pytest
8. Revert if tests fail

**Safety**:
- Auto-revert on test failure
- Backup files
- Dry-run mode
- Progress tracking

---

### 5. Improvement Suggestion

**File**: `improve.py`

**Responsibility**:
- Parse test failures
- Read source code
- Request LLM fixes
- Print suggestions (no apply)

**Functions**:
- `parse_test_failures()`: Extract failure details
- `read_source_for_failure()`: Get relevant source
- `llm_suggest_fix()`: Ask LLM for fix
- `apply_fix()`: Apply fix to file

---

### 6. LLM Client

**File**: `llm_client.py`

**Responsibility**:
- Connect to LLM endpoint
- Send prompts
- Parse responses
- Extract code blocks

**Configuration**:
- Base URL from environment
- Model name from environment
- Temperature and token limits

---

### 7. Progress Tracking

**File**: `progress.json`

**Responsibility**:
- Track all automation runs
- Record fixes applied
- Store timestamps

**Structure**:
```json
{
  "runs": [...],
  "fixes": [...],
  "last_updated": "ISO-8601"
}
```

**Functions**:
- `load_progress()`: Read from file
- `save_progress()`: Write to file

---

### 8. Configuration

**File**: `config.py`

**Responsibility**:
- Load environment variables
- Define project paths
- Provide defaults

**Paths**:
- ROOT: Project root
- BACKEND_DIR: Backend source
- WEB_DIR: Web/Next.js source
- TESTS_DIR: Test files

**Environment**:
- LLM endpoint URL
- Model name
- TDD limits

---

## Data Flow

### OCR Refinement Flow

```
File → OCR Scan → Comments → LLM → Refactored Code → Backup → Apply → Test → Pass/Revert
```

### TDD Auto-Fix Flow

```
Tests → Failures → Parse → Source → LLM → Fix → Backup → Apply → Retest → Loop
```

### Progress Flow

```
Run Start → Record → Actions → Fix Applied → Record → Run End → Update JSON
```

## Safety Mechanisms

### File Operations

- Backup before edit: `.bak` or `.refine.bak`
- Auto-revert on test failure
- Restore from backup on error
- Preserve original permissions

### Test Verification

- Verify after every edit
- Revert if tests fail
- Record pass/fail status
- Track fixes in progress

### Loop Limits

- Max rounds for TDD
- Max failures before abort
- Max files for refine
- Timeouts for subprocesses

### Progress Tracking

- Record every run
- Track every fix
- Timestamp all actions
- Persist across sessions

## Integration Points

### OpenCodeReview

- CLI tool: `ocr scan`
- Rules-based code review
- Agent-friendly output mode
- Local execution

### LLM Endpoint

- HTTP API interface
- Compatible with OpenAI format
- Local server: Ornith on VM
- Configurable model

### Test Frameworks

- pytest: Python tests
- TypeScript: Type checking
- Playwright: E2E tests
- Next.js build: Production check

## Error Handling

### Subprocess Errors

- Capture stdout and stderr
- Parse error messages
- Return structured results
- Timeout protection

### LLM Errors

- Retry on failure
- Log errors to progress
- Skip if no response
- Continue with next file

### File Errors

- Check existence before read
- Handle permission errors
- Restore backup on failure
- Report error status

## Performance Considerations

### Concurrency

- OCR scans: Single file sequential
- LLM requests: Sequential (avoid rate limits)
- Test runs: Sequential (deterministic)

### Caching

- No explicit caching
- LLM may cache internally
- Tests run fresh each time

### Resource Limits

- Subprocess timeouts
- LLM token limits
- File size limits

## Extension Points

### Adding New Commands

1. Add handler in `steer.py`
2. Implement logic in module
3. Update CLI parser
4. Document in command-reference

### Adding Test Runners

1. Add function in `test_orchestration.py`
2. Return standard dict format
3. Update `run_all_tests()`
4. Document behavior

### Adding LLM Prompts

1. Update `llm_suggest_fix()` or `request_refactor()`
2. Keep prompts minimal
3. Request code blocks
4. Preserve constraints

## Monitoring

### Progress JSON

- Run history
- Fix tracking
- Timestamps
- Conclusions

### Console Output

- Real-time progress
- Status messages
- Error reports
- Summary statistics

### Status Command

```bash
uv run python -m automation status
```

Shows:
- Total runs
- Total fixes
- Last run type
- Last conclusion
- Last updated

## Dependencies

### Python

- uv: Package manager
- pytest: Test framework
- Standard library: subprocess, pathlib, json

### JavaScript

- bun: Runtime
- OpenCodeReview: Code review
- Next.js: Build tools

### External

- LLM server: Ornith or OpenAI-compatible
- Network: Local LLM endpoint access

## File Organization

```
automation/
├── __main__.py              # Entry point
├── steer.py                 # CLI router
├── tdd.py                   # TDD loop
├── refine.py                # OCR + LLM loop
├── improve.py               # Fix suggestions
├── test_orchestration.py    # Test runners
├── llm_client.py            # LLM client
├── config.py                # Configuration
├── playwright_agent.py      # Playwright agent
├── scanner.py               # Network scanner
├── goals.py                 # Goals tracking
├── progress.json            # Run history
├── .env                     # Environment
├── .ocr-tmp/                # OCR temp files
├── okf-manifest.json        # OKF metadata
├── automation-workflow.md   # Main workflow
├── command-reference.md     # CLI reference
├── architecture.md          # This file
└── progress-tracking.md     # Tracking docs
```

## Future Enhancements

### Potential Additions

- Parallel file processing
- Incremental scans
- Test result caching
- Advanced LLM prompts
- Custom OCR rules
- Git integration
- Web dashboard
- Notification hooks

### Known Limitations

- Sequential processing only
- No persistent caching
- Fixed loop limits
- Single LLM endpoint
- Basic progress tracking

---

This architecture enables autonomous coding with safety, transparency, and extensibility.