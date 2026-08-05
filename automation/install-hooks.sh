#!/usr/bin/env bash
# Install git hooks for the easycv automation harness.
#
# Run this once from the repo root: ./automation/install-hooks.sh
set -euo pipefail

HOOKS_DIR=".git/hooks"
PRE_COMMIT="$HOOKS_DIR/pre-commit"
PRE_COMMIT_CONTENT='#!/bin/sh
# Installed by automation/install-hooks.sh — do not edit.
# Blocks direct commits to master/main (merge commits are allowed).
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ "$branch" = "master" ] || [ "$branch" = "main" ]; then
  if [ -z "$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null)" ]; then
    echo "error: direct commit to '\''$branch'\'' is blocked by the automation pre-commit hook." >&2
    echo "create a run branch first (the automation loop does this automatically)." >&2
    exit 1
  fi
fi
exit 0
'

mkdir -p "$HOOKS_DIR"
echo "$PRE_COMMIT_CONTENT" > "$PRE_COMMIT"
chmod +x "$PRE_COMMIT"
echo "✓ pre-commit hook installed (blocks direct commits to master/main)"