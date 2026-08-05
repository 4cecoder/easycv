#!/bin/bash
# Self-driving EasyCV improvement loop — scheduled runner.
# Runs the autonomous loop against the self-hosted llama.cpp endpoint (no cloud tokens)
# and logs output. Safe defaults: 3 OCR files, no auto-commit (review first).
#
# Usage:
#   ./automation/schedule.sh                    # one pass, defaults
#   ./automation/schedule.sh --limit 10 --commit  # bigger pass + auto-commit

set -u
cd "$(dirname "$0")/.."

LOG_DIR="automation/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/loop-$STAMP.log"

echo ">>> EasyCV automation pass started $(date)" | tee "$LOG"
echo ">>> Target: ${AUTOMATION_LOOP_TARGET:-all} limit: ${AUTOMATION_LOOP_LIMIT:-3}" | tee -a "$LOG"

# Keep the last 30 logs
ls -1t "$LOG_DIR"/loop-*.log 2>/dev/null | tail -n +31 | xargs -r rm -f

# Run the loop; log everything. --commit only fires when ALL tests pass.
# PYTHONUNBUFFERED gives live progress in the log (no block buffering).
PYTHONUNBUFFERED=1 uv run python -m automation loop \
  --target "${AUTOMATION_LOOP_TARGET:-}" \
  --limit "${AUTOMATION_LOOP_LIMIT:-3}" \
  --rounds 3 \
  ${AUTOMATION_LOOP_COMMIT:+--commit} \
  >> "$LOG" 2>&1

RC=$?
echo ">>> Automation pass finished (exit $RC) $(date)" | tee -a "$LOG"
exit $RC
