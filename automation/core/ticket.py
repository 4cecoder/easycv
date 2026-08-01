"""
Ticket/work item state machine for deterministic automation.

States are single-sourced truth. Transitions are rule-based.
No ambiguity = agents can work reliably.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional, List
from datetime import datetime
from enum import Enum
import uuid


class TicketState(str, Enum):
    """Deterministic ticket state machine."""
    BACKLOG = "backlog"           # Identified but not prioritized
    PRIORITIZED = "prioritized"   # Ready for work
    IN_PROGRESS = "in_progress"   # Agent working on it
    REVIEW = "review"             # Needs human review
    DONE = "done"                 # Completed and verified
    BLOCKED = "blocked"           # Cannot proceed
    CANCELLED = "cancelled"       # Not needed


class TicketType(str, Enum):
    """Types of work tickets."""
    BUG_FIX = "bug_fix"
    SECURITY_FIX = "security_fix"
    FEATURE = "feature"
    REFACTOR = "refactor"
    PERFORMANCE = "performance"
    DOCUMENTATION = "documentation"
    TEST = "test"


class TicketPriority(str, Enum):
    """Priority levels (mapped to ordinal for sorting)."""
    CRITICAL = "critical"   # Must do now
    HIGH = "high"           # Do today
    MEDIUM = "medium"       # Do this week
    LOW = "low"             # Do this sprint
    BACKLOG = "backlog"     # Consider later

    @property
    def score(self) -> int:
        return {
            "critical": 100,
            "high": 75,
            "medium": 50,
            "low": 25,
            "backlog": 0,
        }[self.value]


# Valid state transitions (deterministic rules)
VALID_TRANSITIONS: dict[TicketState, List[TicketState]] = {
    TicketState.BACKLOG: [TicketState.PRIORITIZED, TicketState.CANCELLED],
    TicketState.PRIORITIZED: [TicketState.IN_PROGRESS, TicketState.BLOCKED, TicketState.CANCELLED],
    TicketState.IN_PROGRESS: [TicketState.REVIEW, TicketState.BLOCKED, TicketState.BACKLOG],
    TicketState.REVIEW: [TicketState.DONE, TicketState.IN_PROGRESS, TicketState.BLOCKED],
    TicketState.BLOCKED: [TicketState.IN_PROGRESS, TicketState.BACKLOG, TicketState.CANCELLED],
    TicketState.DONE: [],  # Terminal state
    TicketState.CANCELLED: [],  # Terminal state
}


class EvidenceType(str, Enum):
    """Types of evidence."""
    CODE_REVIEW = "code_review"
    TEST_OUTPUT = "test_output"
    ERROR_LOG = "error_log"
    SCREENSHOT = "screenshot"
    DIFF = "diff"


@dataclass
class TicketSource:
    """Where the ticket came from."""
    source_type: Literal["ocr", "test_failure", "human", "improvement", "dependency"]
    reference: str  # file path, test name, ticket ID, etc.
    metadata: dict = field(default_factory=dict)


@dataclass
class TicketEvidence:
    """Evidence supporting the ticket (screenshots, logs, etc)."""
    evidence_type: EvidenceType
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Ticket:
    """Single unit of work in the pipeline."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str = ""
    description: str = ""
    ticket_type: TicketType = TicketType.BUG_FIX
    priority: TicketPriority = TicketPriority.MEDIUM
    state: TicketState = TicketState.BACKLOG
    source: Optional[TicketSource] = None
    evidence: List[TicketEvidence] = field(default_factory=list)
    assigned_to: Optional[str] = None  # "automation", "human", specific agent
    estimated_hours: Optional[float] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    tags: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # Ticket IDs

    def can_transition_to(self, new_state: TicketState) -> bool:
        """Check if transition is valid (deterministic rule)."""
        valid = VALID_TRANSITIONS.get(self.state, [])
        return new_state in valid

    def transition_to(self, new_state: TicketState) -> bool:
        """Attempt state transition. Returns True if successful."""
        if not self.can_transition_to(new_state):
            raise ValueError(
                f"Invalid transition: {self.state} → {new_state}. "
                f"Valid: {VALID_TRANSITIONS.get(self.state, [])}"
            )
        self.state = new_state
        self.updated_at = datetime.utcnow()
        if new_state == TicketState.DONE:
            self.completed_at = datetime.utcnow()
        return True

    def to_dict(self) -> dict:
        """Serialize for storage."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "ticket_type": self.ticket_type.value,
            "priority": self.priority.value,
            "state": self.state.value,
            "source": self.source.__dict__ if self.source else None,
            "evidence": [
                {
                    "evidence_type": e.evidence_type.value,
                    "content": e.content,
                    "timestamp": e.timestamp.isoformat()
                }
                for e in self.evidence
            ],
            "assigned_to": self.assigned_to,
            "estimated_hours": self.estimated_hours,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "tags": self.tags,
            "dependencies": self.dependencies,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Ticket":
        """Deserialize from storage."""
        # Handle source
        source = None
        if data.get("source"):
            source_data = data["source"]
            source = TicketSource(
                source_type=source_data["source_type"],
                reference=source_data["reference"],
                metadata=source_data.get("metadata", {}),
            )

        # Handle evidence
        evidence = []
        for e_data in data.get("evidence", []):
            evidence.append(TicketEvidence(
                evidence_type=EvidenceType(e_data["evidence_type"]),
                content=e_data["content"],
                timestamp=datetime.fromisoformat(e_data["timestamp"]),
            ))

        return cls(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            ticket_type=TicketType(data["ticket_type"]),
            priority=TicketPriority(data["priority"]),
            state=TicketState(data["state"]),
            source=source,
            evidence=evidence,
            assigned_to=data.get("assigned_to"),
            estimated_hours=data.get("estimated_hours"),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None,
            tags=data.get("tags", []),
            dependencies=data.get("dependencies", []),
        )


def create_ticket_from_ocr(comment: dict) -> Ticket:
    """Create ticket from OCR code review comment (deterministic mapping)."""
    severity_to_priority = {
        "critical": TicketPriority.CRITICAL,
        "high": TicketPriority.HIGH,
        "medium": TicketPriority.MEDIUM,
        "low": TicketPriority.LOW,
    }

    issue_type_to_ticket_type = {
        "security": TicketType.SECURITY_FIX,
        "bug": TicketType.BUG_FIX,
        "performance": TicketType.PERFORMANCE,
        "style": TicketType.REFACTOR,
        "documentation": TicketType.DOCUMENTATION,
        "architecture": TicketType.REFACTOR,
    }

    severity = comment.get("severity", "medium").lower()
    issue_type = comment.get("issue_type", "bug").lower()
    file_path = comment.get("file_path", "unknown")
    line_start = comment.get("line_start", 0)

    # Extract short description from comment
    description = comment.get("description", "")
    # Get first sentence as title
    title = description.split(".")[0].strip() if description else f"Fix issue in {file_path}"

    return Ticket(
        title=title,
        description=description,
        ticket_type=issue_type_to_ticket_type.get(issue_type, TicketType.BUG_FIX),
        priority=severity_to_priority.get(severity, TicketPriority.MEDIUM),
        source=TicketSource(
            source_type="ocr",
            reference=f"{file_path}:{line_start}",
            metadata={"severity": severity, "issue_type": issue_type}
        ),
        evidence=[TicketEvidence(
            evidence_type=EvidenceType.CODE_REVIEW,
            content=description,
        )],
        tags=["ocr", issue_type, severity],
        state=TicketState.BACKLOG,
    )


def create_ticket_from_test_failure(test_name: str, error_output: str) -> Ticket:
    """Create ticket from test failure (deterministic mapping)."""
    title = f"Fix failing test: {test_name}"
    
    # Determine priority based on test name patterns
    if "security" in test_name.lower() or "auth" in test_name.lower():
        priority = TicketPriority.HIGH
        ticket_type = TicketType.SECURITY_FIX
    elif "critical" in test_name.lower():
        priority = TicketPriority.CRITICAL
        ticket_type = TicketType.BUG_FIX
    else:
        priority = TicketPriority.HIGH
        ticket_type = TicketType.BUG_FIX

    return Ticket(
        title=title,
        description=f"Test is failing:\n```\n{error_output}\n```",
        ticket_type=ticket_type,
        priority=priority,
        source=TicketSource(
            source_type="test_failure",
            reference=test_name,
        ),
        evidence=[TicketEvidence(
            evidence_type=EvidenceType.TEST_OUTPUT,
            content=error_output,
        )],
        tags=["test", "failure"],
        state=TicketState.BACKLOG,
    )