"""
Product Manager Agent - Deterministic decision engine.

Rules-based prioritization and workflow orchestration.
No LLM ambiguity = reliable automation.
"""

import json
from pathlib import Path
from typing import List, Optional, Literal
from dataclasses import dataclass
from datetime import datetime, timedelta

from automation.core.ticket import (
    Ticket, TicketState, TicketPriority, TicketType,
    create_ticket_from_ocr, create_ticket_from_test_failure,
    VALID_TRANSITIONS
)
from automation.core.git_ops import TicketGitWorkflow
from automation.core.types import TestResult


@dataclass
class PMDecision:
    """A product management decision."""
    action: Literal[
        "prioritize_ticket",
        "start_ticket",
        "complete_ticket",
        "rollback_ticket",
        "block_ticket",
        "merge_pr",
        "skip_ticket",
    ]
    ticket_id: str
    reason: str
    confidence: float = 1.0


@dataclass
class WorkflowMetrics:
    """Workflow health metrics."""
    total_tickets: int = 0
    backlog: int = 0
    in_progress: int = 0
    review: int = 0
    done: int = 0
    blocked: int = 0
    avg_cycle_time_hours: float = 0.0
    success_rate: float = 0.0

    @classmethod
    def from_tickets(cls, tickets: List[Ticket]) -> "WorkflowMetrics":
        """Calculate metrics from ticket state."""
        metrics = cls(total_tickets=len(tickets))

        cycle_times = []
        successes = 0

        for ticket in tickets:
            if ticket.state == TicketState.BACKLOG:
                metrics.backlog += 1
            elif ticket.state == TicketState.IN_PROGRESS:
                metrics.in_progress += 1
            elif ticket.state == TicketState.REVIEW:
                metrics.review += 1
            elif ticket.state == TicketState.DONE:
                metrics.done += 1
                successes += 1
                if ticket.completed_at:
                    cycle = (ticket.completed_at - ticket.created_at).total_seconds() / 3600
                    cycle_times.append(cycle)
            elif ticket.state == TicketState.BLOCKED:
                metrics.blocked += 1

        if cycle_times:
            metrics.avg_cycle_time_hours = sum(cycle_times) / len(cycle_times)

        completed = metrics.done
        total_completed = completed + metrics.blocked
        if total_completed > 0:
            metrics.success_rate = completed / total_completed

        return metrics


class ProductManager:
    """
    Deterministic product management engine.

    Decision rules are explicit, testable, and reproducible.
    No LLM guessing = predictable behavior.
    """

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.workflow = TicketGitWorkflow(repo_root)
        self.ticket_store_path = repo_root / "automation" / "tickets.json"

    def load_tickets(self) -> List[Ticket]:
        """Load tickets from persistent store."""
        if not self.ticket_store_path.exists():
            return []

        with open(self.ticket_store_path) as f:
            data = json.load(f)

        return [Ticket.from_dict(t) for t in data]

    def save_tickets(self, tickets: List[Ticket]) -> None:
        """Save tickets to persistent store."""
        data = [t.to_dict() for t in tickets]
        self.ticket_store_path.write_text(json.dumps(data, indent=2))

    def ingest_ocr_comments(self, ocr_output: str) -> List[Ticket]:
        """
        Convert OCR scan output to tickets.

        Deterministic parsing:
        - Each "───" block = one comment
        - Parse severity, issue_type, description, location
        """
        tickets = []
        blocks = ocr_output.split("───")

        for block in blocks:
            if not block.strip():
                continue

            comment = self._parse_ocr_block(block)
            if comment:
                ticket = create_ticket_from_ocr(comment)
                tickets.append(ticket)

        return tickets

    def _parse_ocr_block(self, block: str) -> Optional[dict]:
        """Parse single OCR comment block."""
        lines = block.strip().split("\n")
        if len(lines) < 2:
            return None

        # Parse header: "─── file.py:27-30 ───"
        header = lines[0]
        if ":" not in header:
            return None

        try:
            file_part = header.split(":")[1].split(" ")[0]
            file_path = file_part.split("-")[0]

            # Parse line range
            range_part = header.split(":")[1].split(" ")[0]
            if "-" in range_part:
                line_start = int(range_part.split("-")[1].split("─")[0])
                line_end = int(range_part.split("-")[0])
            else:
                line_start = line_end = int(range_part)

            # Parse body for severity and description
            severity = "medium"
            issue_type = "bug"
            description_lines = []

            for line in lines[1:]:
                line = line.strip()
                if line.startswith("[") and "]" in line:
                    # Parse "[severity · issue_type]"
                    tags = line.split("]")[0][1:].split("·")
                    if len(tags) >= 1:
                        severity = tags[0].strip().lower()
                    if len(tags) >= 2:
                        issue_type = tags[1].strip().lower()
                else:
                    description_lines.append(line)

            description = " ".join(description_lines).strip()

            return {
                "file_path": file_path,
                "line_start": line_start,
                "line_end": line_end,
                "severity": severity,
                "issue_type": issue_type,
                "description": description,
            }

        except (ValueError, IndexError):
            return None

    def prioritize_tickets(self, tickets: List[Ticket]) -> List[PMDecision]:
        """
        Decide which tickets to prioritize.

        Deterministic rules:
        1. Critical security issues first
        2. High priority test failures
        3. Backlog items by dependency resolution
        4. Low priority blocked items
        """
        decisions = []

        # Get all backlog tickets
        backlog = [t for t in tickets if t.state == TicketState.BACKLOG]

        # Rule 1: Critical security fixes
        critical_sec = [
            t for t in backlog
            if t.priority == TicketPriority.CRITICAL
            and t.ticket_type == TicketType.SECURITY_FIX
        ]
        for ticket in critical_sec[:3]:  # Max 3 at once
            decisions.append(PMDecision(
                action="prioritize_ticket",
                ticket_id=ticket.id,
                reason="Critical security issue requires immediate action",
                confidence=1.0,
            ))

        # Rule 2: High priority items (limit to 5 in progress)
        in_progress = [t for t in tickets if t.state == TicketState.IN_PROGRESS]
        high_priority = [
            t for t in backlog
            if t.priority == TicketPriority.HIGH
            and t.id not in [t.id for t in in_progress]
        ]
        available_slots = max(0, 5 - len(in_progress))
        for ticket in high_priority[:available_slots]:  # Max 2 medium at once
            decisions.append(PMDecision(
                action="prioritize_ticket",
                ticket_id=ticket.id,
                reason="High priority item, capacity available",
                confidence=1.0,
            ))

        # Rule 3: Medium priority if dependencies met
        medium = [
            t for t in backlog
            if t.priority == TicketPriority.MEDIUM
            and all(dep_id in [t.id for t in tickets if t.state == TicketState.DONE]
                    for dep_id in t.dependencies)
        ]
        for ticket in medium[:2]:  # Max 2 medium at once
            decisions.append(PMDecision(
                action="prioritize_ticket",
                ticket_id=ticket.id,
                reason="Medium priority, dependencies resolved",
                confidence=1.0,
            ))

        return decisions

    def should_start_ticket(self, ticket: Ticket, metrics: WorkflowMetrics) -> bool:
        """
        Decide if ticket should be started.

        Deterministic conditions:
        1. Ticket state is PRIORITIZED
        2. Less than 5 tickets in progress
        3. Dependencies are done
        4. Not blocked
        """
        if ticket.state != TicketState.PRIORITIZED:
            return False

        if metrics.in_progress >= 5:
            return False

        # Check dependencies
        all_tickets = self.load_tickets()
        for dep_id in ticket.dependencies:
            dep = next((t for t in all_tickets if t.id == dep_id), None)
            if not dep or dep.state != TicketState.DONE:
                return False

        return True

    def should_complete_ticket(self, ticket: Ticket, test_result: TestResult) -> bool:
        """
        Decide if ticket work should be marked complete.

        Deterministic conditions:
        1. Ticket state is IN_PROGRESS
        2. All tests pass
        3. No blocking issues found
        """
        if ticket.state != TicketState.IN_PROGRESS:
            return False

        if not test_result.success:
            return False

        return True

    def should_rollback_ticket(self, ticket: Ticket, test_result: TestResult, error: str = "") -> bool:
        """
        Decide if ticket should be rolled back.

        Deterministic conditions:
        1. Tests fail after changes
        2. Critical errors encountered
        3. Ticket is security fix and introduced vulnerability
        """
        if not test_result.success:
            return True

        if error and ("critical" in error.lower() or "security" in error.lower()):
            return True

        return False

    def execute_decision(self, decision: PMDecision, tickets: List[Ticket]) -> List[Ticket]:
        """
        Execute a PM decision, updating tickets accordingly.

        Deterministic state transitions only.
        """
        ticket = next((t for t in tickets if t.id == decision.ticket_id), None)
        if not ticket:
            return tickets

        if decision.action == "prioritize_ticket":
            ticket.transition_to(TicketState.PRIORITIZED)

        elif decision.action == "start_ticket":
            if self.should_start_ticket(ticket, WorkflowMetrics.from_tickets(tickets)):
                self.workflow.start_ticket(ticket)
                ticket.assigned_to = "automation"

        elif decision.action == "complete_ticket":
            ticket.transition_to(TicketState.DONE)

        elif decision.action == "rollback_ticket":
            self.workflow.rollback_ticket(ticket, decision.reason)

        elif decision.action == "block_ticket":
            ticket.transition_to(TicketState.BLOCKED)

        elif decision.action == "skip_ticket":
            ticket.transition_to(TicketState.BACKLOG)

        # Save updated tickets
        self.save_tickets(tickets)

        return tickets

    def generate_status_report(self) -> str:
        """Generate deterministic status report."""
        tickets = self.load_tickets()
        metrics = WorkflowMetrics.from_tickets(tickets)

        lines = [
            "# Product Manager Status Report",
            f"Generated: {datetime.utcnow().isoformat()}",
            "",
            "## Metrics",
            f"- Total Tickets: {metrics.total_tickets}",
            f"- Backlog: {metrics.backlog}",
            f"- In Progress: {metrics.in_progress}",
            f"- Review: {metrics.review}",
            f"- Done: {metrics.done}",
            f"- Blocked: {metrics.blocked}",
            f"- Avg Cycle Time: {metrics.avg_cycle_time_hours:.1f}h",
            f"- Success Rate: {metrics.success_rate:.1%}",
            "",
            "## Recent Decisions",
        ]

        # Show recent tickets by state
        for state in [TicketState.IN_PROGRESS, TicketState.REVIEW, TicketState.BLOCKED]:
            state_tickets = [t for t in tickets if t.state == state]
            if state_tickets:
                lines.append(f"\n### {state.value.replace('_', ' ').title()}")
                for ticket in state_tickets[-5:]:  # Last 5
                    lines.append(f"- **{ticket.id}**: {ticket.title}")

        return "\n".join(lines)

    def run_orchestration_cycle(self) -> dict:
        """
        Run one complete PM orchestration cycle.

        Deterministic sequence:
        1. Load tickets
        2. Calculate metrics
        3. Make prioritization decisions
        4. Execute safe decisions
        5. Generate report
        """
        tickets = self.load_tickets()
        metrics = WorkflowMetrics.from_tickets(tickets)

        # Make decisions
        decisions = self.prioritize_tickets(tickets)

        # Execute prioritization only (let humans approve start/complete)
        for decision in decisions:
            if decision.action == "prioritize_ticket":
                tickets = self.execute_decision(decision, tickets)

        # Save and report
        self.save_tickets(tickets)

        return {
            "metrics": {
                "total": metrics.total_tickets,
                "backlog": metrics.backlog,
                "in_progress": metrics.in_progress,
                "review": metrics.review,
                "done": metrics.done,
                "blocked": metrics.blocked,
                "success_rate": metrics.success_rate,
            },
            "decisions": len(decisions),
            "report": self.generate_status_report(),
        }