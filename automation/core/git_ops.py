"""
Git integration for deterministic ticket workflow.

Every ticket → GitHub Issue → feature branch → PR → merge.
Good git habits: atomic commits, clean history, meaningful messages.
"""

import subprocess
import json
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass

from automation.core.ticket import Ticket, TicketState


@dataclass
class GitBranch:
    """Git branch info."""
    name: str
    base: str = "main"
    exists: bool = False
    current: bool = False

    @staticmethod
    def from_output(line: str) -> "GitBranch":
        """Parse `git branch --list` output."""
        line = line.strip()
        is_current = line.startswith("*")
        if is_current:
            line = line[1:].strip()
        return GitBranch(name=line, current=is_current, exists=True)


@dataclass
class GitCommit:
    """Git commit info."""
    hash: str
    message: str
    author: str
    timestamp: str

    @staticmethod
    def from_output(line: str) -> "GitCommit":
        """Parse `git log --format="%H|%s|%an|%ai"` output."""
        parts = line.split("|")
        if len(parts) < 4:
            raise ValueError(f"Invalid commit line: {line}")
        return GitCommit(
            hash=parts[0],
            message=parts[1],
            author=parts[2],
            timestamp=parts[3],
        )


@dataclass
class GitHubIssue:
    """GitHub issue info."""
    number: int
    title: str
    state: str
    body: str
    url: str
    labels: List[str]

    @classmethod
    def from_dict(cls, data: dict) -> "GitHubIssue":
        return cls(
            number=data["number"],
            title=data["title"],
            state=data["state"],
            body=data.get("body", ""),
            url=data["html_url"],
            labels=[l["name"] for l in data.get("labels", [])],
        )


class GitOperations:
    """Deterministic git operations for agents."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root

    def run_git(self, args: List[str], capture: bool = True) -> subprocess.CompletedProcess:
        """Run git command deterministically."""
        cmd = ["git"] + args
        result = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            cwd=str(self.repo_root),
        )
        if result.returncode != 0 and capture:
            raise RuntimeError(f"Git failed: {cmd}\n{result.stderr}")
        return result

    def current_branch(self) -> GitBranch:
        """Get current branch."""
        result = self.run_git(["branch", "--show-current"])
        return GitBranch(name=result.stdout.strip(), current=True, exists=True)

    def list_branches(self) -> List[GitBranch]:
        """List all branches."""
        result = self.run_git(["branch", "--list"])
        return [GitBranch.from_output(line) for line in result.stdout.splitlines() if line.strip()]

    def create_branch(self, name: str, base: str = "main") -> GitBranch:
        """Create new branch from base."""
        self.run_git(["checkout", base])
        self.run_git(["pull", "origin", base])
        self.run_git(["checkout", "-b", name])
        return GitBranch(name=name, base=base, exists=True, current=True)

    def checkout_branch(self, name: str) -> GitBranch:
        """Checkout existing branch."""
        self.run_git(["checkout", name])
        return GitBranch(name=name, current=True, exists=True)

    def delete_branch(self, name: str, force: bool = False) -> None:
        """Delete branch."""
        args = ["branch", "-D" if force else "-d", name]
        self.run_git(args)

    def get_status(self) -> dict:
        """Get git status."""
        result = self.run_git(["status", "--porcelain"])
        modified = []
        untracked = []
        staged = []

        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            status = line[:2]
            path = line[3:]
            if status in ("M ", " M"):
                modified.append(path)
            elif status in ("??", "?? "):
                untracked.append(path)
            elif status.startswith(("M", "A", "D", "R", "C")):
                staged.append(path)

        return {
            "clean": len(modified) == 0 and len(untracked) == 0 and len(staged) == 0,
            "modified": modified,
            "untracked": untracked,
            "staged": staged,
            "branch": self.current_branch().name,
        }

    def add_files(self, paths: List[str]) -> None:
        """Stage files."""
        self.run_git(["add"] + paths)

    def commit(self, message: str, body: str = "") -> None:
        """Create commit with disciplined message."""
        # Validate commit message format
        if not message or len(message) > 72:
            raise ValueError(f"Invalid commit message: {message}")

        full_message = message
        if body:
            full_message += f"\n\n{body}"

        self.run_git(["commit", "-m", full_message])

    def push(self, branch: str, remote: str = "origin") -> None:
        """Push branch to remote."""
        self.run_git(["push", "-u", remote, branch])

    def pull(self, branch: str = None) -> None:
        """Pull latest changes."""
        args = ["pull"]
        if branch:
            args.extend(["origin", branch])
        self.run_git(args)

    def get_last_commit(self) -> GitCommit:
        """Get last commit info."""
        result = self.run_git(["log", "-1", '--format="%H|%s|%an|%ai"'])
        return GitCommit.from_output(result.stdout.strip().strip('"'))

    def create_backup_branch(self, prefix: str = "backup") -> str:
        """Create backup branch before destructive operations."""
        import time
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        branch_name = f"{prefix}-{timestamp}"
        return self.create_branch(branch_name, base=self.current_branch().name).name


class GitHubOperations:
    """GitHub CLI operations for ticket workflow."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root

    def run_gh(self, args: List[str], capture: bool = True) -> subprocess.CompletedProcess:
        """Run gh CLI command."""
        cmd = ["gh"] + args
        result = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            cwd=str(self.repo_root),
        )
        if result.returncode != 0 and capture:
            raise RuntimeError(f"gh CLI failed: {cmd}\n{result.stderr}")
        return result

    def create_issue(self, title: str, body: str, labels: Optional[List[str]] = None) -> GitHubIssue:
        """Create GitHub issue."""
        args = ["issue", "create", "--title", title, "--body", body]
        if labels:
            args.extend(["--label", ",".join(labels)])
        result = self.run_gh(args)
        issue_url = result.stdout.strip()
        # Get full issue data
        return self.get_issue_from_url(issue_url)

    def get_issue_from_url(self, url: str) -> GitHubIssue:
        """Get issue details from URL."""
        result = self.run_gh(["issue", "view", url, "--json", "number,title,state,body,html_url,labels"])
        return GitHubIssue.from_dict(json.loads(result.stdout))

    def create_pr(self, title: str, body: str, branch: str, base: str = "main", labels: Optional[List[str]] = None) -> str:
        """Create pull request."""
        args = [
            "pr", "create",
            "--title", title,
            "--body", body,
            "--base", base,
            "--head", branch,
        ]
        if labels:
            args.extend(["--label", ",".join(labels)])
        result = self.run_gh(args)
        return result.stdout.strip()

    def get_pr_number(self, branch: str) -> Optional[int]:
        """Get PR number for a branch."""
        try:
            result = self.run_gh(["pr", "list", "--head", branch, "--json", "number"])
            data = json.loads(result.stdout)
            return data[0]["number"] if data else None
        except Exception:
            return None

    def close_issue(self, issue_number: int, comment: Optional[str] = None) -> None:
        """Close issue with optional comment."""
        self.run_gh(["issue", "close", str(issue_number)])
        if comment:
            self.run_gh(["issue", "comment", str(issue_number), "--body", comment])


class TicketGitWorkflow:
    """
    End-to-end ticket → git → GitHub workflow.

    Deterministic sequence:
    1. Create GitHub Issue
    2. Create feature branch
    3. Apply fixes (atomic commits)
    4. Push and create PR
    5. Update ticket state
    """

    def __init__(self, repo_root: Path):
        self.git = GitOperations(repo_root)
        self.github = GitHubOperations(repo_root)

    def ticket_to_branch_name(self, ticket: Ticket) -> str:
        """Convert ticket to deterministic branch name."""
        # Format: type/priority-id-short-title
        priority_code = {
            "critical": "crit",
            "high": "high",
            "medium": "med",
            "low": "low",
            "backlog": "back",
        }
        type_code = {
            "bug_fix": "fix",
            "security_fix": "sec",
            "feature": "feat",
            "refactor": "ref",
            "performance": "perf",
            "documentation": "docs",
            "test": "test",
        }

        safe_title = "".join(c.lower() if c.isalnum() else "-" for c in ticket.title)[:20]
        p_code = priority_code.get(ticket.priority.value, "med")
        t_code = type_code.get(ticket.ticket_type.value, "fix")

        return f"{t_code}/{p_code}-{ticket.id}-{safe_title}"

    def start_ticket(self, ticket: Ticket) -> tuple[GitHubIssue, GitBranch]:
        """Start working on a ticket: create issue + branch."""
        # Create GitHub issue
        labels = [ticket.ticket_type.value, ticket.priority.value] + ticket.tags
        issue = self.github.create_issue(
            title=f"[{ticket.priority.value.upper()}] {ticket.title}",
            body=ticket.description,
            labels=labels,
        )

        # Create feature branch
        branch_name = self.ticket_to_branch_name(ticket)
        branch = self.git.create_branch(branch_name)

        # Update ticket with issue reference
        ticket.assigned_to = "automation"
        ticket.transition_to(TicketState.IN_PROGRESS)

        return issue, branch

    def commit_fix(self, ticket: Ticket, commit_message: str, files: List[str]) -> None:
        """Commit fix with disciplined message."""
        # Validate clean state
        status = self.git.get_status()
        if not status["clean"] and status["branch"] == "main":
            raise RuntimeError("Cannot commit directly to main")

        # Add and commit
        self.git.add_files(files)
        body = f"Ticket: {ticket.id}\n\n{ticket.description}"
        self.git.commit(commit_message, body)

    def complete_ticket(self, ticket: Ticket, pr_title: Optional[str] = None, pr_body: Optional[str] = None) -> str:
        """Complete ticket: push → PR → close issue."""
        # Push branch
        branch = self.git.current_branch()
        self.git.push(branch.name)

        # Create PR
        pr_title = pr_title or f"[{ticket.priority.value.upper()}] {ticket.title}"
        pr_body = pr_body or f"Resolves #{self.github.get_pr_number(branch.name)}\n\n{ticket.description}"

        pr_url = self.github.create_pr(
            title=pr_title,
            body=pr_body,
            branch=branch.name,
        )

        # Update ticket
        ticket.transition_to(TicketState.REVIEW)

        return pr_url

    def rollback_ticket(self, ticket: Ticket, reason: str) -> None:
        """Rollback failed ticket work."""
        # Get back to main
        self.git.checkout_branch("main")

        # Delete feature branch
        branch_name = self.ticket_to_branch_name(ticket)
        self.git.delete_branch(branch_name, force=True)

        # Update ticket
        ticket.transition_to(TicketState.BLOCKED)
        ticket.description += f"\n\n**BLOCKED**: {reason}"