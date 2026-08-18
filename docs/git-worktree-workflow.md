# Git Worktree Workflow for EasyCV Parallel Development

This document provides a complete workflow for using git worktrees to develop multiple features in parallel without switching branches or stashing changes.

## Overview

Git worktrees allow you to checkout multiple branches simultaneously into separate working directories. This is ideal for:

- Developing multiple features in parallel
- Running tests on different branches simultaneously
- Reviewing changes without disrupting your main work
- Managing long-lived feature branches alongside master

## Current EasyCV State

- **Main Repository**: `/home/fource/bytecats/projects/web/easycv`
- **Current Branch**: `master`
- **Active Feature Branches**:
  - `sync-updates-20250108`
  - `ui-kit-work-20250108`
  - `money-analysis`
  - `remotes/origin/refactor/ste100-cleanup`

---

## Creating a New Worktree

### For a New Feature Branch

```bash
# 1. Create and checkout a new branch
cd /home/fource/bytecats/projects/web/easycv
git checkout -b feature-branch-name

# 2. Create a worktree for that branch
git worktree add ../easycv-feature-branch-name feature-branch-name
```

**Example for UI Kit work:**
```bash
cd /home/fource/bytecats/projects/web/easycv
git checkout -b ui-kit-work-20250108
git worktree add ../easycv-ui-kit ui-kit-work-20250108
```

### For an Existing Feature Branch

```bash
# Directly create worktree from existing branch
cd /home/fource/bytecats/projects/web/easycv
git worktree add ../easycv-sync-updates sync-updates-20250108
```

---

## Listing All Worktrees

```bash
# List all worktrees with their branches and commit hashes
cd /home/fource/bytecats/projects/web/easycv
git worktree list

# Output example:
# /home/fource/bytecats/projects/web/easycv          f1c9865 [master]
# /home/fource/bytecats/projects/web/easycv-sync    a1b2c3d [sync-updates-20250108]
# /home/fource/bytecats/projects/web/easycv-ui-kit  e5f6g7h [ui-kit-work-20250108]
```

---

## Working in Multiple Worktrees

### Typical Workflow

```bash
# Work on UI Kit feature
cd /home/fource/bytecats/projects/web/easycv-ui-kit
# Make changes, commit, push
git add .
git commit -m "Add new button components"
git push origin ui-kit-work-20250108

# Switch to sync-updates feature
cd /home/fource/bytecats/projects/web/easycv-sync-updates
# Make changes, commit, push
git add .
git commit -m "Sync database schema updates"
git push origin sync-updates-20250108

# Check master for latest changes
cd /home/fource/bytecats/projects/web/easycv
git pull origin master
```

### Running Tests in Parallel

```bash
# Terminal 1: Test UI Kit feature
cd /home/fource/bytecats/projects/web/easycv-ui-kit
bun run test

# Terminal 2: Test sync updates
cd /home/fource/bytecats/projects/web/easycv-sync-updates
bun run test

# Terminal 3: Master branch tests
cd /home/fource/bytecats/projects/web/easycv
bun run test
```

---

## Syncing Changes Between Worktrees and Master

### Pull Latest Master into Worktree

```bash
cd /home/fource/bytecats/projects/web/easycv-ui-kit
git fetch origin
git rebase origin/master
```

### Pull Worktree Changes into Master

```bash
# From master worktree
cd /home/fource/bytecats/projects/web/easycv
git fetch origin
git merge origin/ui-kit-work-20250108
```

### Sync All Worktrees with Master

```bash
# Script to sync all worktrees
for worktree in $(git worktree list --porcelain | grep worktree | cut -d' ' -f2); do
    if [ "$worktree" != "$(git worktree list --porcelain | grep -A1 "branch refs/heads/master" | grep worktree | cut -d' ' -f2)" ]; then
        echo "Syncing $worktree..."
        cd "$worktree"
        git fetch origin
        git rebase origin/master
    fi
done
cd /home/fource/bytecats/projects/web/easycv
```

---

## Cleaning Up Merged Worktrees

### Safety Checklist Before Removing Worktree

⚠️ **CRITICAL: Complete this checklist before pruning/removing any worktree**

- [ ] **Branch is merged**: Verify the feature branch is merged into master
  ```bash
  git branch --merged master | grep feature-branch-name
  ```

- [ ] **No uncommitted changes**: Check for uncommitted changes in worktree
  ```bash
  cd /home/fource/bytecats/projects/web/easycv-feature
  git status
  # Should show: "nothing to commit, working tree clean"
  ```

- [ ] **No stashed changes**: Check for stashed changes
  ```bash
  git stash list
  # Should be empty or show no relevant stashes
  ```

- [ ] **Remote branch deleted**: Verify remote branch is deleted (if applicable)
  ```bash
  git branch -r | grep feature-branch-name
  # Should return empty
  ```

- [ ] **Dependencies resolved**: Ensure no other worktrees depend on this worktree

- [ ] **Backup important changes**: If any work is valuable, create a backup or tag
  ```bash
  git tag backup-feature-branch-name-$(date +%Y%m%d)
  ```

### Removing a Worktree (Safe Cleanup)

```bash
# 1. Remove the worktree
cd /home/fource/bytecats/projects/web/easycv
git worktree remove /home/fource/bytecats/projects/web/easycv-ui-kit

# 2. Delete the branch (if merged and no longer needed)
git branch -d ui-kit-work-20250108

# 3. Delete remote branch (if exists)
git push origin --delete ui-kit-work-20250108
```

### Force Remove (Use with Extreme Caution)

```bash
# Only use if you're absolutely sure the worktree can be deleted
git worktree remove -f /home/fource/bytecats/projects/web/easycv-ui-kit
```

---

## Pruning Dead Worktrees

```bash
# Remove worktree directories that have been manually deleted
cd /home/fource/bytecats/projects/web/easycv
git worktree prune

# Check for corrupted/missing worktrees
git worktree list --porcelain
```

---

## Best Practices

### 1. Naming Convention

```
../easycv-<feature-name>    # Worktree directory
feature-<name>-YYYYMMDD     # Branch name
```

Examples:
- `../easycv-ui-kit` → `ui-kit-work-20250108`
- `../easycv-sync-updates` → `sync-updates-20250108`
- `../easycv-money-analysis` → `money-analysis`

### 2. Worktree Management

- Keep 2-4 active worktrees maximum
- Remove worktrees immediately after merging
- Commit frequently in each worktree
- Use descriptive commit messages with worktree context

### 3. Conflict Resolution

When rebasing worktrees onto master:
```bash
cd /home/fource/bytecats/projects/web/easycv-ui-kit
git fetch origin
git rebase origin/master
# If conflicts occur:
git status
# Resolve conflicts
git add <resolved-files>
git rebase --continue
```

### 4. Branch Hygiene

```bash
# Before pushing, ensure your branch is up to date
git fetch origin
git rebase origin/master

# After pushing, update other worktrees
cd /home/fource/bytecats/projects/web/easycv
git worktree list
# Check which worktrees need updating
```

---

## Troubleshooting

### Worktree Won't Remove

```bash
# Check if worktree is locked
git worktree list --porcelain | grep -A5 "worktree /path/to/worktree"

# Remove lock file if stale
rm /home/fource/bytecats/projects/web/easycv/.git/worktrees/<worktree-name>/locked

# Try removal again
git worktree remove /path/to/worktree
```

### Worktree Shows as "Detached"

```bash
cd /home/fource/bytecats/projects/web/easycv-feature
git checkout <branch-name>
```

### Corrupted Worktree

```bash
# Remove the worktree directory manually
rm -rf /home/fource/bytecats/projects/web/easycv-feature

# Prune the worktree reference
cd /home/fource/bytecats/projects/web/easycv
git worktree prune
```

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Create new worktree | `git worktree add ../easycv-feature branch-name` |
| List all worktrees | `git worktree list` |
| Remove worktree | `git worktree remove ../easycv-feature` |
| Prune dead worktrees | `git worktree prune` |
| Move worktree | `git worktree move ../easycv-feature ../new-location` |
| Sync with master | `git fetch origin && git rebase origin/master` |
| Check for merged branches | `git branch --merged master` |

---

## EasyCV-Specific Notes

### Project Structure Considerations

- **Frontend (Next.js)**: `web/` directory
- **Backend (Python)**: Root directory with `pipeline.py`, `worker.py`
- **Database**: `web/convex/` directory
- **Tests**: `bun run test` (frontend), `uv run pytest` (backend)

### Worktree Testing Strategy

```bash
# In each worktree, run relevant tests:
cd /home/fource/bytecats/projects/web/easycv-feature

# Frontend tests
cd web
bun run test
bun run typecheck

# Backend tests
cd /home/fource/bytecats/projects/web/easycv-feature
uv run pytest

# Convex dev sync
cd web
bunx convex dev
```

### Convex Considerations

Each worktree needs its own Convex dev instance or proper isolation:
```bash
# In each worktree
cd web
bunx convex dev --configure
```

---

## Related Documentation

- [Git Worktree Official Documentation](https://git-scm.com/docs/git-worktree)
- EasyCV Development Guidelines: `.cursorrules`
- Next.js Deployment: `web/` directory structure

---

**Last Updated**: 2025-01-08  
**Maintained By**: EasyCV Development Team  
**Repository**: `/home/fource/bytecats/projects/web/easycv`