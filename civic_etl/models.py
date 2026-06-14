from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SourceConfig:
    id: str
    category: str
    url: str
    local_file: str
    parser: str
    authority: str
    timestamp_basis: str
    confidence: str
    status: str
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExpectedConfig:
    jurisdictions: int
    result_rows: int
    sources: int
    review_rows: int = 0
    turnout_rows: int = 0
    state_total: int = 0
    trump: int = 0
    harris: int = 0
    other: int = 0


@dataclass(frozen=True)
class EtlConfig:
    code: str
    name: str
    authority: str
    election_year: int
    office: str
    sources: list[SourceConfig]
    expected: ExpectedConfig
    capabilities: dict[str, bool]
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationReport:
    passed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "metrics": self.metrics,
        }
