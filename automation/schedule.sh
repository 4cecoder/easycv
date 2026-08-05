#!/bin/bash
# Self-driving EasyCV improvement loop — scheduled runner.
# Runs the autonomous loop against the self-hosted llama.cpp endpoint (no cloud tokens)
# in a worktree + run branch, per-file verified commits, merges to master on ALL GREEN,
# and pushes to origin. Safe defaults: 3 OCR files, auto-commit enabled.
#
# Usage:
#   ./automation/schedule.sh                      # default autonomous run
#   AUTOMATION_LOOP_NO_PUSH=1 ./schedule.sh       # merge locally but do not push
#   AUTOMATION_LOOP_TARGET=backend ./schedule.sh  # target backend only

set -u
cd "$(dirname "$0")/.."

LOG_DIR="automation/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/loop-$STAMP.log"

echo ">>> EasyCV automation pass started $(date)" | tee "$LOG"
echo ">>> Target: ${AUTOMATION_LOOP_TARGET:-all} limit: ${AUTOMATION_LOOP_LIMIT:-3} push: ${AUTOMATION_LOOP_NO_PUSH:+no }" | tee -a "$LOG"

# Keep the last 30 logs
ls -1t "$LOG_DIR"/loop-*.log 2>/dev/null | tail -n +31 | xargs -r rm -f

# Run the loop in a worktree + run branch; merge+push on ALL GREEN.
# PYTHONUNBUFFERED gives live progress in the log (no block buffering).
PYTHONUNBUFFERED=1 uv run python -m automation loop \
  --commit \
  ${AUTOMATION_LOOP_NO_PUSH:+--no-push} \
  --target "${AUTOMATION_LOOP_TARGET:-}" \
  --limit "${AUTOMATION_LOOP_LIMIT:-3}" \
  --rounds 3 \
  >> "$LOG" 2>&1

RC=$?
echo ">>> Automation pass finished (exit $RC) $(date)" | tee -a "$LOG"
exit $RC
