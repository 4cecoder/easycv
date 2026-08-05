# EasyCV Autonomous Automation Loop - OKF 0.2 Package

This package contains complete documentation for the EasyCV autonomous automation system.

## Package Structure

```
automation/
├── okf-manifest.json         # OKF 0.2 metadata manifest
├── README.md                 # Package overview and quick start
├── automation-workflow.md    # Main workflow documentation
├── command-reference.md      # Complete CLI reference
├── architecture.md           # System architecture
├── progress-tracking.md      # Progress tracking system
├── policy-guardrails.md      # Policy-based guardrails documentation
├── __main__.py               # CLI entry point
├── steer.py                  # Command router
├── tdd.py                    # TDD loop logic
├── refine.py                 # OCR + LLM refactor loop (with policy)
├── improve.py                # LLM fix suggestion
├── test_orchestration.py     # Test runners
├── llm_client.py             # LLM API client
├── config.py                 # Configuration loader
├── policy_enforcer.py        # Policy enforcement engine
├── policy_only.py            # Policy-only check runner
├── playwright_agent.py       # Playwright agent
├── scanner.py                # Network scanner
├── goals.py                  # Goals tracking
├── progress.json             # Run history
├── policies/                 # Policy configuration
│   ├── backend-refactoring-policy.json
│   └── frontend-refactoring-policy.json
├── .ocr-tmp/                 # OCR temporary files
└── core/                     # Core automation modules
    ├── git_ops.py
    ├── product_manager.py
    ├── ticket.py
    └── types.py
```
## Quick Start

### Full Automation Loop

```bash
# Phase 0-3: One self-driving cycle — policy guardrails, OCR refine, TDD fix, full tests
uv run python -m automation loop --limit 10

# Scheduled autonomous passes (macOS launchd, daily 03:00)
chmod +x automation/schedule.sh
launchctl load automation/com.easycv.automation.plist

# Individual phases
uv run python -m automation refine --target backend/ --limit 10   # OCR + LLM refactor
uv run python -m automation tdd                                    # LLM auto-fix failing tests
uv run python -m automation status
```

### Self-Hosted LLM (no cloud tokens)

The pipeline runs entirely against a self-hosted llama.cpp endpoint. Configure in `.env`:

```bash
AUTOMATION_LLM_PROVIDER=llama.cpp
AUTOMATION_LLM_BASE_URL=http://gentoo.tail125a6c.ts.net:8081/v1
AUTOMATION_MODEL=/home/ubuntu/llama.cpp/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
```

The OCR CLI (`@alibaba-group/open-code-review`) must point at the same endpoint so it never
calls a cloud provider:

```bash
ocr config set custom_providers.gentoo.url http://gentoo.tail125a6c.ts.net:8081/v1
ocr config set custom_providers.gentoo.protocol openai
ocr config set custom_providers.gentoo.model /home/ubuntu/llama.cpp/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
ocr config set custom_providers.gentoo.api_key no-key-needed
ocr config set provider gentoo
```

Verify with: `uv run python -m automation chat --prompt "Reply with: OK"`

### Refine safety rails

Every refactor is guarded before and after apply:

1. **Size guard** — files over 800 lines / 35KB are reported for manual review only
   (the 35B local model truncates large single-shot rewrites). Status: `too_large`.
2. **Compile gate** — `.py` output is parsed with `ast.parse` before the file is
   touched; invalid output is rejected and retried once with the exact syntax
   error fed back to the model. Status: `llm_failed` if still broken.
3. **Test verify** — after apply, the full suite runs; any failure restores the
   `.refine.bak` backup and reverts the file. Status: `reverted`.

A `fixed` status means the change is real: applied, compiled, and verified by the
full test suite. Unbuffered logs (`PYTHONUNBUFFERED=1`) show live progress in
background/launchd runs.

### Quick Start Commands

| Command | Purpose |
|---------|---------|
| `test` | Run all tests |
| `tdd` | TDD auto-fix loop |
| `refine` | OCR + LLM refactor (supports .py, .ts, .tsx) |
| `status` | Show progress |

### Folder Guard Rails

The automation system enforces clear folder isolation:

| Target | Files | Purpose |
|--------|-------|---------|
| `backend/` | *.py | Python backend code |
| `tests/` | *.py | Python test files |
| `automation/` | *.py | Automation system code |
| `web/` | *.ts, *.tsx | TypeScript/React frontend |

**Safety**: Each target is processed independently with auto-revert on test failure.

## Documentation

### automation-workflow.md

Complete workflow documentation covering:
- OCR refinement phase
- TDD auto-fix phase
- Full automation loop
- Safety mechanisms
- Troubleshooting

### command-reference.md

Complete CLI reference covering:
- All commands and options
- Usage examples
- Exit codes
- Common workflows

### architecture.md

System architecture documentation covering:
- Component diagram
- Data flow
- Safety mechanisms
- Integration points
- Extension points

### progress-tracking.md

Progress tracking documentation covering:
- Data structure
- Run types
- Fix status values
- Querying and analysis
- Backup and restore

## OKF 0.2 Format

This package follows Open Knowledge Format 0.2 specification:

- **manifest.json**: Metadata and file index
- **Markdown files**: Content with frontmatter
- **ASD-STE100**: Writing standard
- **CC0 License**: Maximum reuse

## Requirements

- Python 3.12+ with `uv`
- Bun for JavaScript tools
- OpenCodeReview CLI
- LLM endpoint (local or remote)

## Project Location

```
/home/fource/bytecats/projects/web/easycv/automation/
```

## Usage

### Read Documentation

Start with `automation-workflow.md` for the complete workflow.

### Run Automation

Use the quick start commands above.

### Monitor Progress

Check `progress.json` or use `status` command.

### Extend System

See `architecture.md` for extension points.

## License

CC0 - Public Domain Dedication

## Version

1.2.0 - 2026-08-04

**Changes:**
- `loop` command: self-driving cycle (policy → refine → tdd → tests → optional commit)
- launchd/cron scheduler (`schedule.sh`, `com.easycv.automation.plist`)
- OCR comment parsing: block-based capture, ANSI stripping, dedup
- Refactor safety rails: size guard (800 lines / 35KB), `ast.parse` compile gate
  with one feedback retry, test-verify with auto-revert
- Proven fixes: `ste100.py` precompiled regexes + unit-pattern bug, `latex.py`
  path-traversal guard + stderr surfacing

## Known Issues

- TypeScript tests pass, but Next.js build requires NEXT_PUBLIC_CONVEX_URL environment variable
- This is expected — the variable should be set in production deployment

---

For questions or issues, refer to the troubleshooting sections in each documentation file.