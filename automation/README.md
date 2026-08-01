# EasyCV Autonomous Automation Loop - OKF 0.2 Package

This package contains complete documentation for the EasyCV autonomous automation system.

## Package Structure

```
automation/
├── okf-manifest.json         # OKF 0.2 metadata manifest
├── automation-workflow.md    # Main workflow documentation
├── command-reference.md      # Complete CLI reference
├── architecture.md           # System architecture
└── progress-tracking.md      # Progress tracking system
```

## Quick Start

### Full Automation Loop

```bash
# Pull latest code
cd /home/fource/bytecats/projects/web/easycv
git pull

# Phase 1: OCR refinement (scan backend, LLM refactor, verify)
uv run python -m automation refine --target backend/ --limit 10

# Phase 2: TDD auto-fix (run tests, LLM fix failures, loop)
uv run python -m automation tdd

# Check status
uv run python -m automation status
```

### Quick Commands

| Command | Purpose |
|---------|---------|
| `test` | Run all tests |
| `tdd` | TDD auto-fix loop |
| `refine` | OCR + LLM refactor |
| `status` | Show progress |

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

1.0.0 - 2026-08-01

---

For questions or issues, refer to the troubleshooting sections in each documentation file.