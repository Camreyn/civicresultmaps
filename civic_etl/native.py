from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .models import EtlConfig, SourceConfig
from .xlsx import read_xlsx_sheet


def int_text(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = re.sub(r"[^\d.-]", "", str(value))
    if cleaned in {"", "-", "."}:
        return 0
    return int(float(cleaned))


def pct(numerator: int, denominator: int) -> float:
    return round((numerator / denominator) * 100, 4) if denominator else 0


def _source_map(config: EtlConfig) -> dict[str, SourceConfig]:
    return {source.id: source for source in config.sources}


def _artifact_path(source: SourceConfig) -> Path:
    path = Path(source.local_file)
    if not path.exists():
        raise FileNotFoundError(
            f"missing local artifact for {source.id}: {source.local_file}. "
            "Place the official source file at this path before running native import."
        )
    return path


def _candidate_column(header: list[Any], rule: dict[str, Any]) -> int:
    needle = " ".join(str(rule["candidateContains"]).lower().split())
    for index, value in enumerate(header):
        haystack = " ".join(str(value).lower().split())
        if value is not None and needle in haystack:
            return index
    raise ValueError(f"could not find candidate column containing {rule['candidateContains']!r}")


def _column_index(header: list[Any]) -> dict[str, int]:
    return {str(name).strip(): index for index, name in enumerate(header) if str(name).strip()}


def _county_name(raw: Any) -> str:
    value = str(raw or "").strip()
    if not value or value.lower() in {"total", "percentage"}:
        return ""
    titled = value.title() if value.isupper() else value
    return titled if re.search(r"\bcounty\b$", titled, re.IGNORECASE) else f"{titled} County"


def _ohio_county_results(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "President and Vice President"))
    if len(rows) < section.get("dataStartRow", 5):
        raise ValueError("Ohio summary workbook has too few rows")

    header = rows[section.get("headerRow", 2) - 1]
    total_row = rows[section.get("totalRow", 3) - 1]
    candidate_rules = {
        "trump": section["majorCandidates"]["trump"],
        "harris": section["majorCandidates"]["harris"],
        **{item["key"]: item for item in section.get("otherCandidates", [])},
    }
    candidate_columns = {key: _candidate_column(header, rule) for key, rule in candidate_rules.items()}
    other_keys = [item["key"] for item in section.get("otherCandidates", [])]
    reported_totals = {key: int_text(total_row[index]) for key, index in candidate_columns.items()}
    parsed_totals = {key: 0 for key in candidate_columns}

    result_rows: list[dict[str, Any]] = []
    for row in rows[section.get("dataStartRow", 5) - 1 :]:
        raw_county = row[0] if row else ""
        county = _county_name(raw_county)
        if not county or county.lower().startswith(("total", "percentage")):
            continue

        values = {
            key: int_text(row[index] if len(row) > index else 0)
            for key, index in candidate_columns.items()
        }
        other = sum(values[key] for key in other_keys)
        total = values["trump"] + values["harris"] + other
        if total == 0:
            continue
        for key, value in values.items():
            parsed_totals[key] += value
        result_rows.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {
                    "Trump": values["trump"],
                    "Harris": values["harris"],
                    "Other": other,
                },
                "totalVotes": total,
                "margin": values["trump"] - values["harris"],
                "marginPct": pct(values["trump"] - values["harris"], total),
                "sourceId": source.id,
            }
        )

    if parsed_totals != reported_totals:
        raise ValueError(f"Ohio county totals do not match workbook Total row: {parsed_totals} != {reported_totals}")

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), metrics


def _ohio_review_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["reviewCharts"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "President and Vice President"))
    header = rows[section.get("headerRow", 2) - 1]
    columns = _column_index(header)
    trump_index = _candidate_column(header, section["majorCandidates"]["trump"])
    harris_index = _candidate_column(header, section["majorCandidates"]["harris"])

    required = ["County Name", "Precinct Name", "Precinct Code", section.get("totalColumn", "Ballots Counted")]
    missing = [name for name in required if name not in columns]
    if missing:
        raise ValueError(f"Ohio review source missing columns: {', '.join(missing)}")

    output: list[dict[str, Any]] = []
    for row in rows[section.get("dataStartRow", 5) - 1 :]:
        county = _county_name(row[columns["County Name"]] if len(row) > columns["County Name"] else "")
        precinct = str(row[columns["Precinct Name"]] if len(row) > columns["Precinct Name"] else "").strip()
        code = str(row[columns["Precinct Code"]] if len(row) > columns["Precinct Code"] else "").strip()
        if not county or county in {"Total", "Percentage"}:
            continue
        total = int_text(row[columns[section.get("totalColumn", "Ballots Counted")]])
        if not total:
            continue
        harris = int_text(row[harris_index] if len(row) > harris_index else 0)
        trump = int_text(row[trump_index] if len(row) > trump_index else 0)
        output.append(
            {
                "county": county,
                "localUnit": f"{precinct} ({code})" if code else precinct,
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": 0,
                "repDropoff": 0,
                "coverageMode": "voteShareOnly",
                "sourceId": source.id,
            }
        )

    return output, {
        "nativeReviewRows": len(output),
        "nativeReviewWarning": section.get("warning", ""),
    }


def _ohio_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["turnout"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "President and Vice President"))
    header = rows[section.get("headerRow", 2) - 1]
    columns = _column_index(header)
    required = ["County Name", "Precinct Name", "Precinct Code", "Registered Voters", "Ballots Counted"]
    missing = [name for name in required if name not in columns]
    if missing:
        raise ValueError(f"Ohio turnout source missing columns: {', '.join(missing)}")

    output: list[dict[str, Any]] = []
    for row in rows[section.get("dataStartRow", 5) - 1 :]:
        county = _county_name(row[columns["County Name"]] if len(row) > columns["County Name"] else "")
        if not county:
            continue
        precinct = str(row[columns["Precinct Name"]] if len(row) > columns["Precinct Name"] else "").strip()
        code = str(row[columns["Precinct Code"]] if len(row) > columns["Precinct Code"] else "").strip()
        registered = int_text(row[columns["Registered Voters"]] if len(row) > columns["Registered Voters"] else 0)
        ballots = int_text(row[columns["Ballots Counted"]] if len(row) > columns["Ballots Counted"] else 0)
        output.append(
            {
                "county": county,
                "localUnit": f"{code} - {precinct}" if code and precinct else code or precinct,
                "ballotsCast": ballots,
                "registeredVoters": registered,
                "turnoutPct": pct(ballots, registered) if registered else None,
                "denominatorType": section.get("denominatorType", "registeredVoters"),
                "registrationDenominatorTiming": section.get("registrationDenominatorTiming", "final"),
                "warningRequired": bool(section.get("warningRequired", False)),
                "sourceId": source.id,
            }
        )

    expected_totals = section.get("statewideTotals") or {}
    parsed_totals = {
        "registeredVoters": sum(row["registeredVoters"] for row in output),
        "ballotsCast": sum(row["ballotsCast"] for row in output),
    }
    if expected_totals and parsed_totals != expected_totals:
        raise ValueError(f"Ohio turnout totals do not match expected totals: {parsed_totals} != {expected_totals}")

    return output, {
        "nativeTurnoutRows": len(output),
        "nativeRegisteredVoters": parsed_totals["registeredVoters"],
        "nativeBallotsCast": parsed_totals["ballotsCast"],
    }


def _assert_expected(config: EtlConfig, metrics: dict[str, Any]) -> None:
    checks = {
        "nativeResultRows": config.expected.result_rows,
        "nativeResultTotalVotes": config.expected.state_total,
        "nativeTrumpVotes": config.expected.trump,
        "nativeHarrisVotes": config.expected.harris,
        "nativeOtherVotes": config.expected.other,
        "nativeReviewRows": config.expected.review_rows,
        "nativeTurnoutRows": config.expected.turnout_rows,
    }
    mismatches = {
        key: {"actual": metrics.get(key), "expected": expected}
        for key, expected in checks.items()
        if expected and metrics.get(key) != expected
    }
    if mismatches:
        raise ValueError(f"native Ohio validation failed: {mismatches}")


def _wisconsin_ward_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "Sheet2"))
    if len(rows) < section.get("dataStartRow", 11):
        raise ValueError("Wisconsin ward workbook has too few rows")

    header = rows[section.get("candidateHeaderRow", 10) - 1]
    harris_index = _candidate_column(header, section["majorCandidates"]["harris"])
    trump_index = _candidate_column(header, section["majorCandidates"]["trump"])
    total_index = int(section.get("totalColumnIndex", 3))
    ward_index = int(section.get("wardColumnIndex", 2))
    county_index = int(section.get("countyColumnIndex", 1))
    other_indexes = [
        index
        for index in range(trump_index + 1, len(header))
        if index != harris_index and index != trump_index and str(header[index] or "").strip()
    ]

    county = ""
    counties: dict[str, dict[str, int]] = {}
    review_rows: list[dict[str, Any]] = []
    for row in rows[section.get("dataStartRow", 11) - 1 :]:
        if len(row) <= max(total_index, harris_index, trump_index, ward_index):
            continue
        if len(row) > county_index and row[county_index]:
            county = _county_name(row[county_index])
        ward = str(row[ward_index] if len(row) > ward_index else "").strip()
        if not county or not ward or "subtotals" in ward.lower() or ward.lower().startswith("total"):
            continue

        total = int_text(row[total_index])
        harris = int_text(row[harris_index])
        trump = int_text(row[trump_index])
        other = sum(int_text(row[index] if len(row) > index else 0) for index in other_indexes)
        if total == 0:
            continue

        bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
        bucket["harris"] += harris
        bucket["trump"] += trump
        bucket["other"] += other
        bucket["total"] += total
        review_rows.append(
            {
                "county": county,
                "localUnit": ward,
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": 0,
                "repDropoff": 0,
                "coverageMode": "voteShareOnly",
                "sourceId": source.id,
            }
        )

    result_rows = [
        {
            "jurisdictionName": county_name,
            "jurisdictionCode": county_name.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["trump"],
                "Harris": values["harris"],
                "Other": values["other"],
            },
            "totalVotes": values["total"],
            "margin": values["trump"] - values["harris"],
            "marginPct": pct(values["trump"] - values["harris"], values["total"]),
            "sourceId": source.id,
        }
        for county_name, values in sorted(counties.items())
    ]

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeTurnoutRows": 0,
    }
    return result_rows, review_rows, metrics


def _assert_native_expected(config: EtlConfig, metrics: dict[str, Any]) -> None:
    checks = {
        "nativeResultRows": config.expected.result_rows,
        "nativeResultTotalVotes": config.expected.state_total,
        "nativeTrumpVotes": config.expected.trump,
        "nativeHarrisVotes": config.expected.harris,
        "nativeOtherVotes": config.expected.other,
        "nativeReviewRows": config.expected.review_rows,
        "nativeTurnoutRows": config.expected.turnout_rows,
    }
    mismatches = {
        key: {"actual": metrics.get(key), "expected": expected}
        for key, expected in checks.items()
        if expected and metrics.get(key) != expected
    }
    if mismatches:
        raise ValueError(f"native {config.code} validation failed: {mismatches}")


def build_native_payload(config: EtlConfig) -> dict[str, Any] | None:
    if config.code == "WI" and config.raw.get("certifiedResults", {}).get("format") == "wisconsinWardByWardXlsx":
        sources = _source_map(config)
        result_rows, review_rows, metrics = _wisconsin_ward_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWisconsinWardByWardXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": [],
            "metrics": metrics,
        }

    if config.code != "OH" or config.raw.get("certifiedResults", {}).get("format") != "ohioStatewideRaceSummaryXlsx":
        return None

    sources = _source_map(config)
    result_rows, result_metrics = _ohio_county_results(config, sources)
    review_rows, review_metrics = _ohio_review_rows(config, sources)
    turnout_rows, turnout_metrics = _ohio_turnout_rows(config, sources)
    metrics = {**result_metrics, **review_metrics, **turnout_metrics}
    _assert_expected(config, metrics)

    return {
        "parser": "nativeOhioOfficialXlsx",
        "resultRows": result_rows,
        "reviewRows": review_rows,
        "turnoutRows": turnout_rows,
        "metrics": metrics,
    }
