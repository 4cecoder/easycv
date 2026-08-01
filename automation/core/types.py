"""
Core data types for the easyCV automation pipeline.

All automation modules share these data shapes. This ensures:
1. Deterministic behavior (no ambiguous dicts)
2. Type safety for agents
3. Clear data contracts
"""

from dataclasses import dataclass, field
from typing import Optional, List, Literal, Any
from datetime import datetime
from enum import Enum


class SeverityLevel(str, Enum):
    """Severity levels for code review issues."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class IssueType(str, Enum):
    """Types of code review issues."""
    BUG = "bug"
    SECURITY = "security"
    PERFORMANCE = "performance"
    STYLE = "style"
    DOCUMENTATION = "documentation"
    ARCHITECTURE = "architecture"


@dataclass(frozen=True)
class CodeComment:
    """A single code review comment from OCR."""
    file_path: str
    line_start: int
    line_end: int
    severity: SeverityLevel
    issue_type: IssueType
    description: str
    rule_id: str = ""

    def __post_init__(self):
        if not self.description:
            raise ValueError("CodeComment description cannot be empty")


@dataclass
class LLMResponse:
    """Standardized LLM response."""
    content: Optional[str]
    reasoning: Optional[str] = None
    raw: dict = field(default_factory=dict)
    success: bool = True
    error_message: str = ""

    @classmethod
    def error(cls, message: str) -> "LLMResponse":
        return cls(content=None, success=False, error_message=message)


@dataclass
class TestResult:
    """Result of running tests."""
    test_type: Literal["pytest", "playwright", "typecheck", "build"]
    exit_code: int
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0
    failures: List[str] = field(default_factory=list)
    stdout: str = ""
    stderr: str = ""

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and self.failed == 0


@dataclass
class ProcessResult:
    """Result of any subprocess execution."""
    command: List[str]
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float

    @property
    def success(self) -> bool:
        return self.exit_code == 0


@dataclass
class FileChange:
    """Represents a proposed file change."""
    file_path: str
    original_content: str
    proposed_content: str
    reason: str
    confidence: float = 1.0  # 0.0 to 1.0

    @property
    def diff(self) -> str:
        """Generate a unified diff."""
        import difflib
        return "\n".join(
            difflib.unified_diff(
                self.original_content.splitlines(keepends=True),
                self.proposed_content.splitlines(keepends=True),
                fromfile=f"a/{self.file_path}",
                tofile=f"b/{self.file_path}",
                lineterm=""
            )
        )


@dataclass
class FixResult:
    """Result of applying a fix."""
    file_path: str
    status: Literal["applied", "reverted", "failed", "dry_run"]
    test_passed_before: bool = False
    test_passed_after: bool = False
    error: str = ""

    @property
    def improvement(self) -> bool:
        return self.test_passed_after and not self.test_passed_before


@dataclass
class AutomationRun:
    """Single automation pipeline run."""
    run_id: str
    run_type: str  # "tdd", "refine", "improve", "test"
    timestamp: datetime
    target: str
    status: Literal["running", "success", "failed", "partial"]
    duration_seconds: float = 0.0
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "run_type": self.run_type,
            "timestamp": self.timestamp.isoformat(),
            "target": self.target,
            "status": self.status,
            "duration_seconds": self.duration_seconds,
            "details": self.details,
        }


@dataclass
class LLMConfig:
    """LLM endpoint configuration."""
    base_url: str
    model: str
    api_key: str = ""
    timeout_seconds: int = 300
    max_tokens: int = 64000
    temperature: float = 0.1

    @property
    def headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers


@dataclass
class RetryConfig:
    """Retry strategy configuration."""
    max_attempts: int = 3
    base_delay_seconds: float = 2.0
    max_delay_seconds: float = 60.0
    exponential_backoff: bool = True

    def get_delay(self, attempt: int) -> float:
        if self.exponential_backoff:
            delay = self.base_delay_seconds * (2 ** attempt)
        else:
            delay = self.base_delay_seconds
        return min(delay, self.max_delay_seconds)