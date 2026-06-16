from __future__ import annotations

import csv
import json
import re
import zipfile
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


def _row_value(row: list[Any], columns: dict[str, int], name: str) -> Any:
    index = columns[name]
    return row[index] if len(row) > index else ""


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


def _wisconsin_contest_rows(section: dict[str, Any], sources: dict[str, SourceConfig]) -> list[dict[str, Any]]:
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "Sheet2"))
    if len(rows) < section.get("dataStartRow", 11):
        raise ValueError("Wisconsin ward workbook has too few rows")

    header = rows[section.get("candidateHeaderRow", 10) - 1]
    dem_index = _candidate_column(header, section["majorCandidates"]["dem"])
    rep_index = _candidate_column(header, section["majorCandidates"]["rep"])
    total_index = int(section.get("totalColumnIndex", 3))
    ward_index = int(section.get("wardColumnIndex", 2))
    county_index = int(section.get("countyColumnIndex", 1))
    other_indexes = [
        index
        for index in range(rep_index + 1, len(header))
        if index != dem_index and index != rep_index and str(header[index] or "").strip()
    ]

    county = ""
    output: list[dict[str, Any]] = []
    for row in rows[section.get("dataStartRow", 11) - 1 :]:
        if len(row) <= max(total_index, dem_index, rep_index, ward_index):
            continue
        if len(row) > county_index and row[county_index]:
            county = _county_name(row[county_index])
        ward = str(row[ward_index] if len(row) > ward_index else "").strip()
        if not county or not ward or "subtotals" in ward.lower() or ward.lower().startswith("total"):
            continue

        total = int_text(row[total_index])
        dem = int_text(row[dem_index])
        rep = int_text(row[rep_index])
        other = sum(int_text(row[index] if len(row) > index else 0) for index in other_indexes)
        if total == 0:
            continue

        output.append(
            {
                "county": county,
                "localUnit": ward,
                "totalVotes": total,
                "dem": dem,
                "rep": rep,
                "other": other,
                "sourceId": source.id,
            }
        )

    return output


def _wisconsin_ward_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    presidential_source_id = sources[section["sourceId"]].id
    presidential_rows = _wisconsin_contest_rows(section, sources)
    comparison_section = config.raw.get("comparisonContest")
    comparison_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    if comparison_section:
        comparison_rows = _wisconsin_contest_rows(comparison_section, sources)
        comparison_by_key = {(row["county"], row["localUnit"]): row for row in comparison_rows}
        presidential_keys = {(row["county"], row["localUnit"]) for row in presidential_rows}
        comparison_keys = set(comparison_by_key)
        if presidential_keys != comparison_keys:
            raise ValueError(
                "Wisconsin comparison contest rows do not match presidential rows: "
                f"{len(presidential_keys - comparison_keys)} missing comparison rows, "
                f"{len(comparison_keys - presidential_keys)} extra comparison rows"
            )

    counties: dict[str, dict[str, int]] = {}
    review_rows: list[dict[str, Any]] = []
    for row in presidential_rows:
        county = row["county"]
        total = row["totalVotes"]
        harris = row["dem"]
        trump = row["rep"]
        other = row["other"]
        bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
        bucket["harris"] += harris
        bucket["trump"] += trump
        bucket["other"] += other
        bucket["total"] += total

        comparison = comparison_by_key.get((county, row["localUnit"]))
        dem_dropoff = pct(harris - comparison["dem"], total) if comparison else 0
        rep_dropoff = pct(trump - comparison["rep"], total) if comparison else 0
        review_rows.append(
            {
                "county": county,
                "localUnit": row["localUnit"],
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": dem_dropoff,
                "repDropoff": rep_dropoff,
                "coverageMode": "presidentVsSenate" if comparison else "voteShareOnly",
                "sourceId": row["sourceId"],
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
            "sourceId": presidential_source_id,
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
        "nativeComparisonRows": len(comparison_by_key),
        "nativeComparisonContest": comparison_section.get("label") if comparison_section else None,
        "nativeTurnoutRows": 0,
    }
    return result_rows, review_rows, metrics


def _truthy(value: Any) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _normalized_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["turnout"]
    source = sources[section["sourceId"]]
    required = {
        "state",
        "election_year",
        "jurisdiction_name",
        "level",
        "ballots_cast",
        "registered_voters",
        "denominator_note",
        "warning_required",
        "source_url",
    }

    output: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = set(reader.fieldnames or [])
        missing = sorted(required.difference(fieldnames))
        if missing:
            raise ValueError(f"normalized turnout CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"normalized turnout row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"normalized turnout row {index} has wrong election year: {row.get('election_year')!r}")

            jurisdiction = str(row.get("jurisdiction_name") or "").strip()
            if not jurisdiction:
                raise ValueError(f"normalized turnout row {index} is missing jurisdiction_name")
            county = _county_name(row.get("county") or jurisdiction)
            local_unit = str(row.get("local_unit") or jurisdiction).strip()
            registered = int_text(row.get("registered_voters"))
            ballots = int_text(row.get("ballots_cast"))
            turnout_raw = str(row.get("turnout_pct") or "").strip()

            output.append(
                {
                    "county": county,
                    "localUnit": local_unit,
                    "level": str(row.get("level") or section.get("sourceLevel", "jurisdiction")).strip(),
                    "ballotsCast": ballots,
                    "registeredVoters": registered if registered else None,
                    "turnoutPct": float(turnout_raw) if turnout_raw else pct(ballots, registered) if registered else None,
                    "denominatorType": row.get("denominator_type") or section.get("denominatorType", "registeredVoters"),
                    "registrationDenominatorTiming": row.get("denominator_note")
                    or row.get("denominator_timing")
                    or section.get("registrationDenominatorTiming", "notRecorded"),
                    "warningRequired": _truthy(row.get("warning_required")),
                    "sourceId": source.id,
                }
            )

    expected = section.get("expected", {})
    metrics = {
        "nativeTurnoutRows": len(output),
        "nativeRegisteredVoters": sum(int(row["registeredVoters"] or 0) for row in output),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in output),
        "nativeTurnoutParser": section.get("format", "normalizedTurnoutCsv"),
    }
    checks = {
        "nativeTurnoutRows": expected.get("rowCount"),
        "nativeRegisteredVoters": expected.get("registeredVoters"),
        "nativeBallotsCast": expected.get("ballotsCast"),
    }
    mismatches = {
        key: {"actual": metrics[key], "expected": expected_value}
        for key, expected_value in checks.items()
        if expected_value is not None and metrics[key] != expected_value
    }
    if mismatches:
        raise ValueError(f"normalized turnout validation failed: {mismatches}")

    return output, metrics


def _wisconsin_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("turnout")
    if not section:
        return [], {"nativeTurnoutRows": 0}

    source = sources[section["sourceId"]]
    required = {
        "state",
        "county",
        "municipality",
        "ward",
        "source_level",
        "ballots_cast",
        "registered_voters",
        "registration_denominator_timing",
        "denominator_type",
        "coverage_status",
        "warning_required",
        "source_url",
    }

    output: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = sorted(required.difference(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Wisconsin turnout CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            if str(row.get("state", "")).strip().upper() != config.code:
                raise ValueError(f"Wisconsin turnout row {index} has wrong state: {row.get('state')!r}")

            county = _county_name(row.get("county"))
            source_level = str(row.get("source_level") or "local").strip().lower()
            municipality = str(row.get("municipality") or "").strip()
            ward = str(row.get("ward") or "").strip()
            local_unit = " - ".join(part for part in [municipality, ward] if part) or "County total"
            ballots = int_text(row.get("ballots_cast"))
            registered = int_text(row.get("registered_voters"))
            timing = str(row.get("registration_denominator_timing") or "unknown").strip()
            warning_required = _truthy(row.get("warning_required"))

            output.append(
                {
                    "county": county,
                    "localUnit": local_unit,
                    "level": source_level,
                    "ballotsCast": ballots,
                    "registeredVoters": registered,
                    "turnoutPct": pct(ballots, registered) if registered else None,
                    "denominatorType": row.get("denominator_type") or section.get("denominatorType", "registered_voters"),
                    "registrationDenominatorTiming": timing,
                    "warningRequired": warning_required,
                    "sourceId": source.id,
                }
            )

    expected = section.get("expected", {})
    metrics = {
        "nativeTurnoutRows": len(output),
        "nativeTurnoutCoverageStatus": section.get("coverageStatus", "partial"),
        "nativeTurnoutCoveredCounties": len({row["county"] for row in output}),
        "nativeTurnoutMissingCountyCount": section.get("missingCountyCount"),
        "nativeTurnoutWarningRows": sum(1 for row in output if row["warningRequired"]),
        "nativeRegisteredVoters": sum(row["registeredVoters"] for row in output),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in output),
    }
    expected_checks = {
        "rowCount": metrics["nativeTurnoutRows"],
        "warningRows": metrics["nativeTurnoutWarningRows"],
        "partialBallotsCastTotal": metrics["nativeBallotsCast"],
        "partialRegisteredVotersTotal": metrics["nativeRegisteredVoters"],
    }
    mismatches = {
        key: {"actual": actual, "expected": expected[key]}
        for key, actual in expected_checks.items()
        if expected.get(key) is not None and actual != expected[key]
    }
    if mismatches:
        raise ValueError(f"Wisconsin partial turnout validation failed: {mismatches}")

    return output, metrics


def _minnesota_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "Precinct-Results"))
    if len(rows) < 2:
        raise ValueError("Minnesota precinct workbook has too few rows")

    columns = _column_index(rows[0])
    required = [
        "COUNTYNAME",
        "MCDNAME",
        "PCTNAME",
        "PCTCODE",
        "REG7AM",
        "EDR",
        "TOTVOTING",
        "USPRSR",
        "USPRSDFL",
        "USPRSTOTAL",
        "USSENR",
        "USSENDFL",
        "USSENTOTAL",
    ]
    missing = [name for name in required if name not in columns]
    if missing:
        raise ValueError(f"Minnesota precinct source missing columns: {', '.join(missing)}")

    other_columns = section.get(
        "otherColumns",
        ["USPRSLIB", "USPRSWTP", "USPRSG", "USPRSSLP", "USPRSSWP", "USPRSJFA", "USPRSIND", "USPRSWI"],
    )
    missing_other = [name for name in other_columns if name not in columns]
    if missing_other:
        raise ValueError(f"Minnesota precinct source missing other-candidate columns: {', '.join(missing_other)}")

    counties: dict[str, dict[str, int]] = {}
    review_rows: list[dict[str, Any]] = []
    turnout_rows: list[dict[str, Any]] = []
    comparison_rows = 0

    for row in rows[1:]:
        raw_county = str(_row_value(row, columns, "COUNTYNAME")).strip()
        if not raw_county:
            continue

        county = _county_name(raw_county)
        municipality = str(_row_value(row, columns, "MCDNAME")).strip()
        precinct = str(_row_value(row, columns, "PCTNAME")).strip()
        precinct_code = str(_row_value(row, columns, "PCTCODE")).strip()
        local_unit = f"{municipality} - {precinct} ({precinct_code})"
        trump = int_text(_row_value(row, columns, "USPRSR"))
        harris = int_text(_row_value(row, columns, "USPRSDFL"))
        other = sum(int_text(_row_value(row, columns, name)) for name in other_columns)
        total = int_text(_row_value(row, columns, "USPRSTOTAL"))
        senate_rep = int_text(_row_value(row, columns, "USSENR"))
        senate_dem = int_text(_row_value(row, columns, "USSENDFL"))
        senate_total = int_text(_row_value(row, columns, "USSENTOTAL"))
        registered = int_text(_row_value(row, columns, "REG7AM")) + int_text(_row_value(row, columns, "EDR"))
        ballots = int_text(_row_value(row, columns, "TOTVOTING"))

        turnout_rows.append(
            {
                "county": county,
                "localUnit": local_unit,
                "ballotsCast": ballots,
                "registeredVoters": registered,
                "turnoutPct": pct(ballots, registered) if registered else None,
                "denominatorType": "registeredVotersPlusElectionDayRegistrations",
                "registrationDenominatorTiming": "electionDayPlusEDR",
                "warningRequired": False,
                "sourceId": source.id,
            }
        )

        if not total:
            continue

        bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
        bucket["harris"] += harris
        bucket["trump"] += trump
        bucket["other"] += other
        bucket["total"] += total

        if senate_total:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": pct(harris - senate_dem, total) if senate_total else 0,
                "repDropoff": pct(trump - senate_rep, total) if senate_total else 0,
                "coverageMode": "presidentVsSenate" if senate_total else "voteShareOnly",
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
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": config.raw.get("comparisonContest", {}).get("label"),
        "nativeTurnoutRows": len(turnout_rows),
        "nativeRegisteredVoters": sum(row["registeredVoters"] for row in turnout_rows),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in turnout_rows),
    }
    return result_rows, review_rows, turnout_rows, metrics


def _pennsylvania_county_codes(source: SourceConfig) -> dict[int, str]:
    codes: dict[int, str] = {}
    in_table = False
    for line in _artifact_path(source).read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if stripped == "County Code Table":
            in_table = True
            continue
        if not in_table:
            continue
        if stripped and set(stripped) == {"-"}:
            continue
        if not stripped:
            if codes:
                break
            continue
        match = re.match(r"^(\d{2})\s+(.+?)\s*$", stripped)
        if not match:
            continue
        code = int(match.group(1))
        if 1 <= code <= 67:
            codes[code] = match.group(2)
    if len(codes) != 67:
        raise ValueError(f"Pennsylvania readme county table produced {len(codes)} county codes, expected 67")
    return codes


def _pa_precinct_key(row: dict[str, str], county: str) -> tuple[str, ...]:
    return (
        county,
        row["precinctCode"],
        row["municipality"].strip(),
        row["breakdownCode1"].strip(),
        row["breakdownName1"].strip(),
        row["breakdownCode2"].strip(),
        row["breakdownName2"].strip(),
        row["mcd"].strip(),
        row["vtd"].strip(),
    )


def _pa_local_unit(key: tuple[str, ...]) -> str:
    _, precinct_code, municipality, code1, name1, code2, name2, mcd, vtd = key
    parts = [municipality or "Unnamed municipality"]
    if code1 or name1:
        parts.append(" ".join(item for item in [code1, name1] if item).strip())
    if code2 or name2:
        parts.append(" ".join(item for item in [code2, name2] if item).strip())
    parts.append(f"Precinct {precinct_code}")
    if mcd:
        parts.append(f"MCD {mcd}")
    if vtd:
        parts.append(f"VTD {vtd}")
    return " - ".join(parts)


def _pennsylvania_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_section = config.raw["certifiedResults"]
    result_source = sources[result_section["sourceId"]]
    readme_source = sources[config.raw["countyCodeSourceId"]]
    turnout_section = config.raw["turnout"]
    turnout_source = sources[turnout_section["sourceId"]]
    county_codes = _pennsylvania_county_codes(readme_source)
    fieldnames = [
        "year",
        "electionType",
        "countyCode",
        "precinctCode",
        "officeRank",
        "district",
        "partyRank",
        "ballotPosition",
        "officeCode",
        "partyCode",
        "candidateNumber",
        "last",
        "first",
        "middle",
        "suffix",
        "votes",
        "yes",
        "no",
        "usCongress",
        "stateSenate",
        "stateHouse",
        "muniType",
        "municipality",
        "breakdownCode1",
        "breakdownName1",
        "breakdownCode2",
        "breakdownName2",
        "biCounty",
        "mcd",
        "fips",
        "vtd",
        "ballotQuestion",
        "recordType",
        "prevPrecinct",
        "prevCongress",
        "prevSenate",
        "prevHouse",
    ]
    county_totals: dict[str, dict[str, int]] = {}
    precinct_totals: dict[tuple[str, ...], dict[str, int]] = {}

    with _artifact_path(result_source).open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle, fieldnames=fieldnames):
            office = row["officeCode"]
            if office not in {result_section["officeCode"], config.raw["reviewCharts"]["downBallotOfficeCode"]}:
                continue
            county = _county_name(county_codes[int(row["countyCode"])])
            party = row["partyCode"]
            votes = int_text(row["votes"])
            key = _pa_precinct_key(row, county)
            precinct = precinct_totals.setdefault(
                key,
                {"pres_dem": 0, "pres_rep": 0, "pres_other": 0, "pres_total": 0, "sen_dem": 0, "sen_rep": 0, "sen_total": 0},
            )

            if office == result_section["officeCode"]:
                county_bucket = county_totals.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
                if party == "REP":
                    county_bucket["trump"] += votes
                    precinct["pres_rep"] += votes
                elif party == "DEM":
                    county_bucket["harris"] += votes
                    precinct["pres_dem"] += votes
                else:
                    county_bucket["other"] += votes
                    precinct["pres_other"] += votes
                county_bucket["total"] += votes
                precinct["pres_total"] += votes
            else:
                if party == "REP":
                    precinct["sen_rep"] += votes
                elif party == "DEM":
                    precinct["sen_dem"] += votes
                precinct["sen_total"] += votes

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["trump"],
                "Harris": values["harris"],
                "Other": values["other"],
            },
            "totalVotes": values["total"],
            "margin": values["trump"] - values["harris"],
            "marginPct": pct(values["trump"] - values["harris"], values["total"]),
            "sourceId": result_source.id,
        }
        for county, values in sorted(county_totals.items())
    ]

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for key, values in sorted(precinct_totals.items()):
        total = values["pres_total"]
        if not total:
            continue
        has_senate = bool(values["sen_total"])
        if has_senate:
            comparison_rows += 1
        review_rows.append(
            {
                "county": key[0],
                "localUnit": _pa_local_unit(key),
                "totalVotes": total,
                "harris": values["pres_dem"],
                "trump": values["pres_rep"],
                "harrisShare": pct(values["pres_dem"], total),
                "trumpShare": pct(values["pres_rep"], total),
                "demDropoff": pct(values["pres_dem"] - values["sen_dem"], total) if has_senate else 0,
                "repDropoff": pct(values["pres_rep"] - values["sen_rep"], total) if has_senate else 0,
                "coverageMode": "presidentVsSenate" if has_senate else "voteShareOnly",
                "sourceId": result_source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_rows_raw = read_xlsx_sheet(_artifact_path(turnout_source), turnout_section.get("sheetName", "By county"))
    if not turnout_rows_raw:
        raise ValueError("Pennsylvania turnout workbook is empty")
    turnout_columns = _column_index(turnout_rows_raw[0])
    for name in ["County", "Vote History", "Registered voters"]:
        if name not in turnout_columns:
            raise ValueError(f"Pennsylvania turnout source missing column: {name}")
    for row in turnout_rows_raw[1:]:
        county = _county_name(_row_value(row, turnout_columns, "County"))
        if not county:
            continue
        ballots = int_text(_row_value(row, turnout_columns, "Vote History"))
        registered = int_text(_row_value(row, turnout_columns, "Registered voters"))
        turnout_rows.append(
            {
                "county": county,
                "localUnit": county,
                "ballotsCast": ballots,
                "registeredVoters": registered,
                "turnoutPct": pct(ballots, registered) if registered else None,
                "denominatorType": "registeredVoters",
                "registrationDenominatorTiming": turnout_section.get("registrationDenominatorTiming", "certifiedVoterRegistrationSummary"),
                "warningRequired": bool(turnout_section.get("warningRequired", False)),
                "sourceId": turnout_source.id,
            }
        )

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": config.raw.get("comparisonContest", {}).get("label"),
        "nativeTurnoutRows": len(turnout_rows),
        "nativeRegisteredVoters": sum(row["registeredVoters"] for row in turnout_rows),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in turnout_rows),
    }
    return result_rows, review_rows, turnout_rows, metrics


def _michigan_key(raw: Any) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", str(raw or "").upper().replace(" COUNTY", "")).strip()


def _michigan_county_results(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    totals: dict[str, dict[str, int]] = {}
    with _artifact_path(source).open(newline="", encoding="utf-8-sig") as handle:
        handle.readline()
        for row in csv.DictReader(handle, delimiter="\t"):
            if row.get("OfficeCode(text)") != section.get("officeCode", "1"):
                continue
            county = _county_name(row.get("CountyName"))
            party = row.get("PartyDescription", "")
            votes = int_text(row.get("CandidateVotes"))
            bucket = totals.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
            if party == "REPUBLICAN":
                bucket["trump"] += votes
            elif party == "DEMOCRATIC":
                bucket["harris"] += votes
            else:
                bucket["other"] += votes
            bucket["total"] += votes

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
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
        for county, values in sorted(totals.items())
    ]
    return result_rows, {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
    }


def _michigan_review_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["reviewCharts"]
    source = sources[section["sourceId"]]
    with zipfile.ZipFile(_artifact_path(source)) as archive:
        def read_table(path: str) -> list[list[str]]:
            return [
                line.split("\t")
                for line in archive.read(path).decode("utf-8-sig", errors="replace").splitlines()
                if line.strip()
            ]

        county_lookup = {row[0]: _county_name(row[1]) for row in read_table("2024GEN/county.txt") if len(row) >= 2}
        municipality_lookup = {
            (row[2], row[3]): row[4].title()
            for row in read_table("2024GEN/2024city.txt")
            if len(row) >= 5
        }
        party_lookup = {
            (row[2], row[3], row[4], row[5]): row[9]
            for row in read_table("2024GEN/2024name.txt")
            if len(row) >= 10
        }
        vote_rows = read_table("2024GEN/2024vote.txt")

    precincts: dict[tuple[str, str, str, str, str], dict[str, int]] = {}
    for row in vote_rows:
        if len(row) < 12:
            continue
        office, district, status, candidate = row[2], row[3], row[4], row[5]
        if office not in {section["presidentContest"]["officeCode"], section["downBallotContest"]["officeCode"]}:
            continue
        county_code, municipality_code, ward_code, precinct_code, precinct_label = row[6], row[7], row[8], row[9], row[10]
        county = county_lookup.get(county_code, "")
        municipality = municipality_lookup.get((county_code, municipality_code), "")
        key = (county, municipality, ward_code, precinct_code, precinct_label)
        bucket = precincts.setdefault(
            key,
            {"pres_dem": 0, "pres_rep": 0, "pres_other": 0, "pres_total": 0, "sen_dem": 0, "sen_rep": 0, "sen_total": 0},
        )
        party = party_lookup.get((office, district, status, candidate), "")
        votes = int_text(row[11])
        if office == section["presidentContest"]["officeCode"]:
            if party == "DEM":
                bucket["pres_dem"] += votes
            elif party == "REP":
                bucket["pres_rep"] += votes
            else:
                bucket["pres_other"] += votes
            bucket["pres_total"] += votes
        else:
            if party == "DEM":
                bucket["sen_dem"] += votes
            elif party == "REP":
                bucket["sen_rep"] += votes
            bucket["sen_total"] += votes

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for key, values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        county, municipality, ward_code, precinct_code, precinct_label = key
        label_parts = [municipality or "Unnamed municipality"]
        if ward_code and ward_code != "0":
            label_parts.append(f"Ward {int_text(ward_code)}")
        label_parts.append(f"Precinct {int_text(precinct_code)}")
        if precinct_label:
            label_parts.append(precinct_label)
        has_senate = bool(values["sen_total"])
        if has_senate:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": " - ".join(label_parts),
                "totalVotes": total,
                "harris": values["pres_dem"],
                "trump": values["pres_rep"],
                "harrisShare": pct(values["pres_dem"], total),
                "trumpShare": pct(values["pres_rep"], total),
                "demDropoff": pct(values["pres_dem"] - values["sen_dem"], total) if has_senate else 0,
                "repDropoff": pct(values["pres_rep"] - values["sen_rep"], total) if has_senate else 0,
                "coverageMode": "presidentVsSenate" if has_senate else "voteShareOnly",
                "sourceId": source.id,
            }
        )

    return review_rows, {
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": config.raw.get("comparisonContest", {}).get("label"),
    }


def _michigan_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["turnout"]
    source = sources[section["sourceId"]]
    registration_source = sources[section["registrationSourceId"]]
    registration_payload = json.loads(_artifact_path(registration_source).read_text(encoding="utf-8"))
    registration_rows = {
        _michigan_key(county): values
        for county, values in registration_payload.get("counties", {}).items()
    }
    output: list[dict[str, Any]] = []
    with _artifact_path(source).open(newline="", encoding="utf-8-sig") as handle:
        handle.readline()
        for row in csv.DictReader(handle, delimiter="\t"):
            raw_county = row.get("County Name", "")
            if not str(row.get("County Code", "")).strip().isdigit():
                continue
            county = _county_name(str(raw_county).replace(" COUNTY", ""))
            registration = registration_rows.get(_michigan_key(raw_county))
            if not registration:
                raise ValueError(f"Michigan registration denominator missing for {raw_county}")
            ballots = int_text(row.get("County Voters"))
            registered = int_text(registration["novemberActiveRegisteredVoters"])
            output.append(
                {
                    "county": county,
                    "localUnit": county,
                    "ballotsCast": ballots,
                    "registeredVoters": registered,
                    "turnoutPct": pct(ballots, registered) if registered else None,
                    "denominatorType": "novemberActiveRegisteredVoters",
                    "registrationDenominatorTiming": section.get("registrationDenominatorTiming", "novemberActiveRegisteredVoters"),
                    "warningRequired": bool(section.get("warningRequired", False)),
                    "sourceId": source.id,
                }
            )

    return output, {
        "nativeTurnoutRows": len(output),
        "nativeRegisteredVoters": sum(row["registeredVoters"] for row in output),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in output),
    }


def _michigan_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_rows, result_metrics = _michigan_county_results(config, sources)
    review_rows, review_metrics = _michigan_review_rows(config, sources)
    turnout_rows, turnout_metrics = _michigan_turnout_rows(config, sources)
    return result_rows, review_rows, turnout_rows, {**result_metrics, **review_metrics, **turnout_metrics}


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
    turnout_format = config.raw.get("turnout", {}).get("format")
    if config.raw.get("turnoutOnly") and turnout_format in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        sources = _source_map(config)
        turnout_rows, metrics = _normalized_turnout_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": f"native{turnout_format[0].upper()}{turnout_format[1:]}",
            "resultRows": [],
            "reviewRows": [],
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "MI" and config.raw.get("certifiedResults", {}).get("format") == "michiganCountyTab":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _michigan_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMichiganMvic",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "PA" and config.raw.get("certifiedResults", {}).get("format") == "pennsylvaniaBulkCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _pennsylvania_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativePennsylvaniaBulkCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "MN" and config.raw.get("certifiedResults", {}).get("format") == "minnesotaPrecinctResultsXlsx":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _minnesota_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMinnesotaPrecinctResultsXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "WI" and config.raw.get("certifiedResults", {}).get("format") == "wisconsinWardByWardXlsx":
        sources = _source_map(config)
        result_rows, review_rows, metrics = _wisconsin_ward_rows(config, sources)
        turnout_rows, turnout_metrics = _wisconsin_turnout_rows(config, sources)
        metrics = {**metrics, **turnout_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWisconsinWardByWardXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
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
