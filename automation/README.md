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
# Pull latest code
cd /home/fource/bytecats/projects/web/easycv
git pull

# Phase 1: Backend OCR refinement (scan backend, LLM refactor, verify)
uv run python -m automation refine --target backend/ --limit 10

# Phase 2: Frontend OCR refinement (scan web/, LLM refactor, verify)
uv run python -m automation refine --target web/ --limit 50

# Phase 3: TDD auto-fix (run tests, LLM fix failures, loop)
uv run python -m automation tdd

# Check status
uv run python -m automation status
```

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

1.1.0 - 2026-08-01

**Changes:**
- Added frontend (.ts, .tsx) support to OCR refine loop
- Fixed Stripe API version (2026-07-29.dahlia)
- Switched to public @bytecats/ui-kit dependency
- Updated documentation with guardrails

## Known Issues

- TypeScript tests pass, but Next.js build requires NEXT_PUBLIC_CONVEX_URL environment variable
- This is expected — the variable should be set in production deployment

---

For questions or issues, refer to the troubleshooting sections in each documentation file.