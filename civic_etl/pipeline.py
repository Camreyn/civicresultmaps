from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import EtlConfig, ExpectedConfig, SourceConfig, ValidationReport

REQUIRED_CAPABILITIES = {
    "sourcePlanner",
    "certifiedResults",
    "map",
    "reviewGraphs",
    "turnout",
    "historicalBaseline",
}

PRODUCTION_WRITE_STATUSES = {"promoted"}


def load_config(path: str | Path) -> EtlConfig:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    sources = [
        SourceConfig(
            id=item["id"],
            category=item["category"],
            url=item["url"],
            local_file=item["localFile"],
            parser=item["parser"],
            authority=item["authority"],
            timestamp_basis=item["timestampBasis"],
            confidence=item["confidence"],
            status=item["status"],
        )
        for item in data.get("sources", [])
    ]
    expected_data = data.get("expected", {})

    return EtlConfig(
        code=data["code"].upper(),
        name=data["name"],
        authority=data["authority"],
        election_year=int(data["electionYear"]),
        office=data["office"].lower(),
        sources=sources,
        expected=ExpectedConfig(
            jurisdictions=int(expected_data.get("jurisdictions", 0)),
            result_rows=int(expected_data.get("resultRows", 0)),
            sources=int(expected_data.get("sources", 0)),
        ),
        capabilities={key: bool(value) for key, value in data.get("capabilities", {}).items()},
    )


def validate_config(config: EtlConfig) -> ValidationReport:
    errors: list[str] = []
    warnings: list[str] = []

    if len(config.code) != 2:
        errors.append("state code must be a two-letter postal abbreviation")

    if config.election_year < 1788:
        errors.append("election year is out of range")

    if not config.sources:
        errors.append("at least one source is required")

    if len(config.sources) != config.expected.sources:
        errors.append(
            f"expected {config.expected.sources} sources but config contains {len(config.sources)}"
        )

    missing_capabilities = REQUIRED_CAPABILITIES.difference(config.capabilities)
    if missing_capabilities:
        errors.append(f"missing capability flags: {', '.join(sorted(missing_capabilities))}")

    loaded_sources = [source for source in config.sources if source.status == "loaded"]
    if not loaded_sources:
        errors.append("at least one loaded source is required before staging")

    for source in config.sources:
        if not source.url.startswith("https://"):
            errors.append(f"source {source.id} must use an https URL")
        if not source.parser:
            errors.append(f"source {source.id} is missing parser metadata")
        if source.status in PRODUCTION_WRITE_STATUSES:
            errors.append(f"source {source.id} cannot request production promotion from config")
        if source.status != "loaded":
            warnings.append(f"source {source.id} is marked {source.status}")

    return ValidationReport(
        passed=not errors,
        errors=errors,
        warnings=warnings,
        metrics={
            "state": config.code,
            "year": config.election_year,
            "sourceCount": len(config.sources),
            "loadedSourceCount": len(loaded_sources),
            "expectedJurisdictions": config.expected.jurisdictions,
            "expectedResultRows": config.expected.result_rows,
        },
    )


def build_staging_artifact(config: EtlConfig, report: ValidationReport) -> dict[str, Any]:
    if not report.passed:
        raise ValueError("cannot build staging artifact from a failing validation report")

    return {
        "state": {
            "code": config.code,
            "name": config.name,
            "authority": config.authority,
        },
        "election": {
            "year": config.election_year,
            "office": config.office,
        },
        "sources": [
            {
                "id": source.id,
                "category": source.category,
                "sourceUrl": source.url,
                "localArtifact": source.local_file,
                "parser": source.parser,
                "authority": source.authority,
                "timestampBasis": source.timestamp_basis,
                "confidence": source.confidence,
                "status": source.status,
            }
            for source in config.sources
        ],
        "capabilities": config.capabilities,
        "validation": report.to_dict(),
        "promotion": {
            "status": "staged",
            "requiresHumanReview": True,
            "productionWriteAllowed": False,
        },
    }


def write_staging_artifact(artifact: dict[str, Any], out_dir: str | Path) -> Path:
    target_dir = Path(out_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{artifact['state']['code'].lower()}-{artifact['election']['year']}-staging.json"
    path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path
