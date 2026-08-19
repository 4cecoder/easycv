#!/usr/bin/env bash
# Point this clone's git hooks at the repo-tracked .githooks/ directory.
#
# Run this once from the repo root: ./automation/install-hooks.sh
# (Also runs automatically via web/package.json's postinstall on `bun
# install`, so most devs never need to run this by hand.)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo "✓ core.hooksPath set to .githooks (pre-commit + pre-push now enforced)"
