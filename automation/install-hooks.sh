#!/usr/bin/env bash
# Point this clone's git hooks at the repo-tracked .githooks/ directory.
#
# Run this once from the repo root: ./automation/install-hooks.sh
# (Also runs automatically via web/package.json's postinstall on `bun
# install`, so most devs never need to run this by hand.)
#
# Must never fail `bun install` in CI or a Docker build — neither has a use
# for local git hooks, and both may lack `git` entirely or a .git dir
# (Docker's build context for web/Dockerfile only copies package.json +
# bun.lock, not this script's repo). Skip quietly instead of aborting.
set -uo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "install-hooks: git not found, skipping (not an error)"
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "install-hooks: not inside a git repo, skipping (not an error)"
  exit 0
}

cd "$repo_root"
git config core.hooksPath .githooks
echo "✓ core.hooksPath set to .githooks (pre-commit + pre-push now enforced)"
