---
title: EasyCV Automation Progress Tracking
status: complete
created: 2026-08-01
updated: 2026-08-01
category: reference
tags: [progress, tracking, json, monitoring]
source: EasyCV project
---

# EasyCV Automation Progress Tracking

Progress tracking system for automation runs and fixes.

## Overview

The automation system tracks all runs and fixes in `automation/progress.json`.

## File Location

```
/home/fource/bytecats/projects/web/easycv/automation/progress.json
```

## Data Structure

### Root Object

```json
{
  "runs": [...],
  "fixes": [...],
  "last_updated": "ISO-8601 timestamp"
}
```

### Run Entry

```json
{
  "type": "tdd|ocr_scan|llm_fix|test_run",
  "target": "file or pattern",
  "timestamp": "2026-08-01T12:00:00Z",
  "conclusion": "all_pass|success|failure|too_many_failures|max_rounds"
}
```

### TDD Run Entry

```json
{
  "type": "tdd",
  "target": "tests/ or specific file",
  "started_at": "2026-08-01T12:00:00Z",
  "rounds": [
    {
      "round": 1,
      "passed": 222,
      "failed": 0,
      "fixes": [
        {
          "test": "test_file::test_name",
          "status": "applied|no_source|no_llm_fix|file_not_found"
        }
      ]
    }
  ],
  "conclusion": "all_pass"
}
```

### Fix Entry

```json
{
  "file": "path/to/file",
  "issue": "security|bug|performance",
  "severity": "high|medium|low",
  "description": "Issue description",
  "status": "fixed|pending|failed"
}
```

## Run Types

### tdd

TDD auto-fix loop run.

**Fields**:
- `target`: Test file pattern
- `started_at`: Run start time
- `rounds`: Array of round objects
- `conclusion`: Final result

**Conclusions**:
- `all_pass`: All tests passed
- `too_many_failures`: Exceeded max failures
- `max_rounds`: Reached max rounds without pass

### ocr_scan

OpenCodeReview scan run.

**Fields**:
- `target`: File or directory scanned
- `timestamp`: Scan time
- `comments`: Number of comments found
- `conclusion`: Result

**Conclusions**:
- `success`: Scan completed
- `failure`: Scan failed

### llm_fix

LLM refactor application.

**Fields**:
- `target`: File refactored
- `timestamp`: Fix time
- `issues_fixed`: Number of issues
- `conclusion`: Result

**Conclusions**:
- `success`: Fix applied and verified
- `failure`: Fix failed or reverted

### test_run

Test execution run.

**Fields**:
- `timestamp`: Run time
- `passed`: Pass count
- `failed`: Fail count
- `conclusion`: Result

**Conclusions**:
- `all_pass`: All tests passed
- `minor_failure`: Some tests failed
- `major_failure`: Many tests failed

## Fix Status Values

### fixed

Fix applied successfully and tests pass.

### pending

Fix suggested but not yet applied.

### failed

Fix applied but tests failed (auto-reverted).

## Severity Levels

### high

Critical issue that must be fixed.

**Examples**:
- Security vulnerabilities
- Data corruption
- Crash bugs

### medium

Important issue that should be fixed.

**Examples**:
- Performance problems
- Incorrect behavior
- Edge case bugs

### low

Minor issue that can be deferred.

**Examples**:
- Style issues
- Minor optimizations
- Nice-to-have features

## Querying Progress

### Status Command

```bash
uv run python -m automation status
```

**Output**:
```
total runs:     7
total fixes:    4
last run:       tdd — all_pass
last updated:   2026-07-31T18:54:04.308508+00:00
```

### Manual Query

```bash
jq '.' automation/progress.json
```

### Filter by Type

```bash
jq '.runs[] | select(.type == "tdd")' automation/progress.json
```

### Count by Conclusion

```bash
jq '.runs | group_by(.conclusion) | map({conclusion: .[0].conclusion, count: length})' automation/progress.json
```

## Tracking Functions

### Load Progress

```python
from automation.test_orchestration import load_progress

progress = load_progress()
```

Returns dict with runs, fixes, last_updated.

### Save Progress

```python
from automation.test_orchestration import save_progress

progress["runs"].append(run_record)
save_progress(progress)
```

Updates `last_updated` automatically.

## Progress Updates

### Automatic Updates

All automation commands update progress automatically:
- `tdd`: Records each round and conclusion
- `refine`: Records OCR scans and fixes
- `test`: Records test runs

### Manual Updates

You can manually add entries:

```python
import json
from datetime import datetime, timezone

progress = json.loads(Path("automation/progress.json").read_text())
progress["runs"].append({
    "type": "manual",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "conclusion": "custom"
})
Path("automation/progress.json").write_text(json.dumps(progress, indent=2))
```

## Progress Analysis

### Success Rate

```python
runs = progress["runs"]
success = sum(1 for r in runs if r["conclusion"] in ["all_pass", "success"])
rate = success / len(runs) if runs else 0
print(f"Success rate: {rate:.1%}")
```

### Fix Distribution

```python
from collections import Counter

fixes = progress["fixes"]
issues = Counter(f["issue"] for f in fixes)
print("Issues by type:")
for issue, count in issues.most_common():
    print(f"  {issue}: {count}")
```

### Recent Activity

```python
from datetime import datetime, timedelta

now = datetime.now(timezone.utc)
recent = timedelta(hours=24)
recent_runs = [
    r for r in progress["runs"]
    if datetime.fromisoformat(r.get("timestamp", r.get("started_at", ""))) > now - recent
]
print(f"Runs in last 24 hours: {len(recent_runs)}")
```

## Progress Cleanup

### Old Entries

Remove entries older than N days:

```python
from datetime import datetime, timedelta

cutoff = datetime.now(timezone.utc) - timedelta(days=30)
progress["runs"] = [
    r for r in progress["runs"]
    if datetime.fromisoformat(r.get("timestamp", r.get("started_at", ""))) > cutoff
]
save_progress(progress)
```

### Duplicate Entries

Remove duplicate run entries:

```python
seen = set()
unique_runs = []
for r in progress["runs"]:
    key = (r["type"], r.get("timestamp", r.get("started_at", "")))
    if key not in seen:
        seen.add(key)
        unique_runs.append(r)
progress["runs"] = unique_runs
save_progress(progress)
```

## Progress Backup

### Backup Before Changes

```bash
cp automation/progress.json automation/progress.json.bak
```

### Restore Backup

```bash
cp automation/progress.json.bak automation/progress.json
```

### Multiple Backups

```bash
cp automation/progress.json "automation/progress-$(date +%Y%m%d-%H%M%S).json"
```

## Progress Reset

### Full Reset

```bash
echo '{"runs": [], "fixes": [], "last_updated": ""}' > automation/progress.json
```

### Reset Runs Only

```bash
jq '.runs = []' automation/progress.json > tmp.json && mv tmp.json automation/progress.json
```

### Reset Fixes Only

```bash
jq '.fixes = []' automation/progress.json > tmp.json && mv tmp.json automation/progress.json
```

## Progress Export

### Export as CSV

```python
import csv

with open("progress.csv", "w") as f:
    writer = csv.writer(f)
    writer.writerow(["type", "target", "timestamp", "conclusion"])
    for r in progress["runs"]:
        writer.writerow([
            r["type"],
            r.get("target", ""),
            r.get("timestamp", r.get("started_at", "")),
            r["conclusion"]
        ])
```

### Export as JSON Lines

```python
import json

with open("progress.jsonl", "w") as f:
    for r in progress["runs"]:
        f.write(json.dumps(r) + "\n")
```

## Progress Visualization

### Timeline View

```python
from datetime import datetime

for r in progress["runs"][-10:]:
    ts = r.get("timestamp", r.get("started_at", ""))
    dt = datetime.fromisoformat(ts)
    print(f"{dt.strftime('%Y-%m-%d %H:%M')} {r['type']:12s} {r['conclusion']}")
```

### Summary by Type

```python
from collections import defaultdict

by_type = defaultdict(list)
for r in progress["runs"]:
    by_type[r["type"]].append(r)

for run_type, runs in by_type.items():
    print(f"{run_type}: {len(runs)} runs")
```

## Progress Monitoring

### Watch for Changes

```bash
watch -n 5 'uv run python -m automation status'
```

### Alert on Failure

```bash
while true; do
    uv run python -m automation tdd
    if [ $? -ne 0 ]; then
        notify-send "Automation failed"
    fi
    sleep 3600
done
```

## Best Practices

### Always Update

- Every automation run updates progress
- Manual runs should also update progress
- Include timestamps for all entries

### Use Consistent Types

- Stick to defined run types
- Use standard conclusions
- Follow severity levels

### Keep it Clean

- Remove old entries periodically
- Avoid duplicate entries
- Maintain accurate counts

### Backup Regularly

- Backup before major changes
- Keep multiple backup versions
- Document restore procedures

## Troubleshooting

### Corrupted Progress JSON

Restore from backup:
```bash
cp automation/progress.json.bak automation/progress.json
```

### Missing Fields

Progress JSON may have missing fields for older entries. Handle gracefully:
```python
target = run.get("target", run.get("file", "unknown"))
```

### Large File Size

If progress.json gets too large, archive old entries:
```bash
jq 'select(.timestamp < "2026-07-01")' automation/progress.json > archive.json
jq 'select(.timestamp >= "2026-07-01")' automation/progress.json > tmp.json
mv tmp.json automation/progress.json
```

---

This tracking system ensures complete visibility into automation history and enables analysis of trends and patterns.