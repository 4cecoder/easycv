"""
Git operations for autonomous improvement runs.

Run model (used by ``loop.py``):

- **outer**: create a throwaway worktree + run branch, re-exec the loop
  inside it, and — only if the inner run exits 0 (ALL GREEN) — merge the
  run branch into master with ``--no-ff`` and push.
- **inner**: run all phases; every change that passes its own verify step
  is committed atomically (one commit per file) on the run branch.

Properties:
- master is never committed to directly (run branches + ``--no-ff`` merges).
- history is linear-per-change: a failed later phase leaves a branch you can
  just delete; there is no way for an unverified change to reach master.
- weak models are fine because every commit is gated by a deterministic
  compile/test check before it is created.
"""

import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from automation.config import ROOT, get_env
from backend.constants import WORKER_DOWNLOAD_TIMEOUT

BRANCH_PREFIX = "automation"
IN_WORKTREE_ENV = "EASYCV_IN_WORKTREE"
RUN_BRANCH_ENV = "EASYCV_RUN_BRANCH"

DEFAULT_GIT_TIMEOUT = 120
DEFAULT_HEALTH_TIMEOUT = 8
MAX_SLUG_LEN = 24
HTTP_OK = 200

_HUNK_FUNC_RE = re.compile(r"^\+.*(?P<kind>def |class |async def )(?P<name>[A-Za-z_][A-Za-z0-9_]*)")

MASTER_PROTECT_HOOK = """#!/bin/sh
# Installed by automation/install-hooks.sh — do not edit.
# Blocks direct commits to master/main (merge commits are allowed).
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ "$branch" = "master" ] || [ "$branch" = "main" ]; then
  if [ -z "$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null)" ]; then
    echo "error: direct commit to '$branch' is blocked by the automation pre-commit hook." >&2
    echo "create a run branch first (the automation loop does this automatically)." >&2
    exit 1
  fi
fi
exit 0
"""


def run_git(cwd, *args: str, check: bool = True, capture: bool = True):
    """Run ``git -C cwd <args>``. Returns CompletedProcess (stdout decoded)."""
    res = subprocess.run(
        ["git", "-C", str(cwd), *args],
        capture_output=capture,
        text=True,
        timeout=DEFAULT_GIT_TIMEOUT,
    )
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed (rc {res.returncode}): {res.stderr.strip()}")
    return res


def current_branch(cwd: Optional[Path] = None) -> str:
    """Return the name of the currently checked out git branch."""
    res = run_git(cwd or ROOT, "branch", "--show-current")
    return res.stdout.strip()


def is_master(cwd: Optional[Path] = None) -> bool:
    """Check if the current branch is master or main."""
    return current_branch(cwd) in ("master", "main")


def dirty_paths(cwd: Optional[Path] = None) -> List[str]:
    """Tracked modifications (not untracked) in the working tree."""
    res = run_git(cwd or ROOT, "status", "--porcelain")
    return [line[3:] for line in res.stdout.splitlines() if line.strip() and not line.startswith("??")]


def llm_health_check() -> bool:
    """True if the configured LLM endpoint answers /health. No exceptions."""
    try:
        env = get_env()
        base = env["base_url"].rstrip("/")
        req = urllib.request.Request(base + "/health", method="GET")
        with urllib.request.urlopen(req, timeout=DEFAULT_HEALTH_TIMEOUT) as resp:
            return resp.status == HTTP_OK
    except Exception:
        return False


def run_branch_name(target: str) -> str:
    """Generate a structured run branch name given a target module or prompt."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", target.strip()).strip("-").lower() or "all"
    slug = slug[:MAX_SLUG_LEN]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{BRANCH_PREFIX}/{stamp}-{slug}"


def has_remote(cwd: Optional[Path] = None) -> bool:
    """Check if git repository has a remote configured."""
    return bool(run_git(cwd or ROOT, "remote").stdout.strip())


def _worktree_path_for(branch: str) -> Path:
    name = branch.replace("/", "-")
    return Path(tempfile.gettempdir()) / f"easycv-{name}"


def create_worktree(branch: str) -> Path:
    """Create a run worktree at ``branch`` (based on latest origin/master);
    returns its path. Never touches the main checkout."""
    if not is_master(ROOT):
        raise RuntimeError(f"refusing to create worktree from non-master checkout ({current_branch()})")

    if has_remote(ROOT):
        run_git(ROOT, "fetch", "origin")
    base = "origin/master" if has_remote(ROOT) else "master"

    wt = _worktree_path_for(branch)
    run_git(ROOT, "worktree", "prune", check=False)
    if wt.exists():
        shutil.rmtree(wt)
    try:
        run_git(ROOT, "worktree", "add", "-q", "-b", branch, str(wt), base)
    except RuntimeError:
        # Branch already exists (a previous crashed run) — reuse it.
        run_git(ROOT, "worktree", "add", "-q", str(wt), branch)
    return wt


def has_changes_for(cwd: Path, rel_path: str) -> bool:
    """Check whether a specific relative path has pending git changes."""
    res = run_git(cwd, "status", "--porcelain", "--", rel_path)
    return bool(res.stdout.strip())


def commit_message_for(rel_path: str, diff: str, is_new: bool) -> str:
    """Deterministic commit message: subject + body stats. No LLM involved."""
    funcs: List[str] = []
    for line in diff.splitlines():
        m = _HUNK_FUNC_RE.match(line)
        if m and m.group("name") not in funcs:
            funcs.append(m.group("name"))
        if len(funcs) >= 2:
            break

    if is_new:
        subject = f"automation: add {rel_path}"
    elif funcs:
        subject = f"automation: {rel_path}: refactor {funcs[0]}" + (
            f", {funcs[1]}" if len(funcs) > 1 else ""
        )
    else:
        subject = f"automation: {rel_path}: apply review fixes"

    plus = diff.count("\n+")
    minus = diff.count("\n-")
    body = f"\n\nAuto-generated by the easycv automation loop.\n({plus} insertions, {minus} deletions)"
    return subject + body


def commit_file(cwd: Path, rel_path: str) -> Optional[str]:
    """Commit one verified file atomically. Returns short hash or None if clean."""
    if not has_changes_for(cwd, rel_path):
        return None
    is_new = not run_git(cwd, "status", "--porcelain", "--", rel_path).stdout.startswith(" M")
    run_git(cwd, "add", "--", rel_path)
    diff = run_git(cwd, "diff", "--cached", "--", rel_path).stdout
    msg = commit_message_for(rel_path, diff, is_new)
    res = run_git(cwd, "commit", "-q", "-m", msg)
    short = res.stdout.strip()
    if not short:
        short = run_git(cwd, "rev-parse", "--short", "HEAD").stdout.strip()
    return short


def merge_to_master(worktree: Path, branch: str, push: bool = True) -> bool:
    """Merge ``branch`` into master **without touching any working tree**.

    Uses git plumbing (``merge-tree`` + ``commit-tree``) so neither the main
    checkout nor the run worktree is disturbed. The merge commit is pushed
    straight to origin/master (or updates the local ref when there is no
    remote). Returns True on success.

    Only call when the run branch is fully green.
    """
    has_remote_ = has_remote(worktree)
    if has_remote_:
        run_git(worktree, "fetch", "origin")
    base = "origin/master" if has_remote_ else "master"
    merge_msg = f"automation: merge run branch {branch} (all gates green)"

    def _make_merge_commit() -> str:
        tree = run_git(worktree, "merge-tree", "--write-tree", base, branch).stdout.strip()
        if not tree:
            raise RuntimeError("merge-tree produced no tree (conflicts?)")
        return run_git(
            worktree, "commit-tree", tree, "-p", base, "-p", branch, "-m", merge_msg
        ).stdout.strip()

    try:
        commit = _make_merge_commit()
    except RuntimeError as e:
        print(f"[gitops] merge failed: {e}")
        return False

    if not has_remote_:
        # Local-only repo: advance the master ref directly (no worktree).
        run_git(worktree, "update-ref", "refs/heads/master", commit)
        print(f"[gitops] merged to master locally ({commit[:8]})")
        return True
    if not push:
        print(f"[gitops] merge commit ready ({commit[:8]}); not pushing")
        return True

    res = run_git(worktree, "push", "origin", f"{commit}:master", check=False)
    if res.returncode == 0:
        print(f"[gitops] pushed merge commit {commit[:8]} to origin/master")
        return True

    # Remote advanced while we worked — recompute against fresh origin/master.
    print("[gitops] push rejected; refetching and re-merging onto origin/master...")
    run_git(worktree, "fetch", "origin")
    base = "origin/master"
    try:
        commit = _make_merge_commit()
    except RuntimeError as e:
        print(f"[gitops] retry merge failed: {e}")
        return False
    retry = run_git(worktree, "push", "origin", f"{commit}:master", check=False)
    if retry.returncode == 0:
        print(f"[gitops] pushed merge commit {commit[:8]} to origin/master")
        return True
    print(f"[gitops] push still rejected: {retry.stderr.strip()}")
    return False


def cleanup_worktree(worktree: Path, branch: str, merged: bool = False, keep_on_failure: bool = True) -> None:
    """Remove the worktree and run branch after a run.

    - ``merged=True``: branch was merged to origin/master → force-delete.
    - ``keep_on_failure=True`` (default): an unmerged branch is kept for review.
    - ``keep_on_failure=False``: delete the branch even if unmerged.
    """
    run_git(ROOT, "worktree", "remove", "--force", str(worktree), check=False)
    if merged or not keep_on_failure:
        run_git(ROOT, "branch", "-D", branch, check=False)
    else:
        print(f"[gitops] run branch left for review: {branch}")

