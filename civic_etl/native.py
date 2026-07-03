from __future__ import annotations

import csv
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
import json
import re
import zipfile
from pathlib import Path
from typing import Any, Callable

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
    if not value or value.lower() in {"multiple counties", "total", "percentage"}:
        return ""
    titled = value.title() if value.isupper() else value
    return titled if re.search(r"\bcounty\b$", titled, re.IGNORECASE) else f"{titled} County"


def _texas_county_name(raw: Any) -> str:
    value = str(raw or "").strip()
    if re.fullmatch(r"la\s*salle(?:\s+county)?", value, re.IGNORECASE):
        return "Lasalle County"
    return _county_name(value)


def _nevada_jurisdiction_name(raw: Any) -> str:
    value = str(raw or "").strip()
    if re.fullmatch(r"carson\s+city(?:\s+county)?", value, re.IGNORECASE):
        return "Carson City"
    return _county_name(value)
def _missouri_jurisdiction_name(raw: Any) -> str:
    value = str(raw or "").strip()
    if re.fullmatch(r"kansas\s+city(?:\s+county)?", value, re.IGNORECASE):
        return "Kansas City"
    if re.fullmatch(r"st\.?\s+louis\s+city(?:\s+county)?", value, re.IGNORECASE):
        return "St. Louis City"
    return _county_name(value)


def _illinois_jurisdiction_name(raw: Any) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if re.match(r"^city\s+of\s+", value, re.IGNORECASE):
        city = re.sub(r"^city\s+of\s+", "", value, flags=re.IGNORECASE)
        return f"City of {city.title()}"
    return _county_name(value)


WASHINGTON_COUNTY_CODES = {
    "AD": "Adams County",
    "AS": "Asotin County",
    "BE": "Benton County",
    "CM": "Clallam County",
    "CH": "Chelan County",
    "CR": "Clark County",
    "CU": "Columbia County",
    "CZ": "Cowlitz County",
    "DG": "Douglas County",
    "FE": "Ferry County",
    "FR": "Franklin County",
    "GA": "Garfield County",
    "GY": "Grays Harbor County",
    "GR": "Grant County",
    "IS": "Island County",
    "JE": "Jefferson County",
    "KI": "King County",
    "KP": "Kitsap County",
    "KS": "Kittitas County",
    "KT": "Klickitat County",
    "LE": "Lewis County",
    "LI": "Lincoln County",
    "MA": "Mason County",
    "OK": "Okanogan County",
    "PA": "Pacific County",
    "PI": "Pierce County",
    "PE": "Pend Oreille County",
    "SJ": "San Juan County",
    "SK": "Skagit County",
    "SM": "Skamania County",
    "SN": "Snohomish County",
    "SP": "Spokane County",
    "ST": "Stevens County",
    "TH": "Thurston County",
    "WK": "Wahkiakum County",
    "WL": "Walla Walla County",
    "WM": "Whatcom County",
    "WT": "Whitman County",
    "YA": "Yakima County",
}


def _candidate_bucket(candidate: str, dem_needles: list[str], rep_needles: list[str]) -> str:
    normalized = " ".join(candidate.lower().split())
    if any(needle.lower() in normalized for needle in dem_needles):
        return "dem"
    if any(needle.lower() in normalized for needle in rep_needles):
        return "rep"
    return "other"


def _party_bucket(party: Any, candidate: Any = "") -> str | None:
    normalized_party = str(party or "").strip().lower()
    if normalized_party in {"dem", "democrat", "democratic"}:
        return "dem"
    if normalized_party in {"rep", "republican"}:
        return "rep"
    normalized_candidate = " ".join(str(candidate or "").lower().split())
    if normalized_candidate in {"over votes", "under votes", "blank ballots"}:
        return None
    return "other"


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

    comparison_section = config.raw.get("comparisonContest")
    comparison_by_key: dict[tuple[str, str, str], dict[str, int]] = {}
    if comparison_section:
        comparison_source = sources[comparison_section.get("sourceId", section["sourceId"])]
        comparison_rows = read_xlsx_sheet(
            _artifact_path(comparison_source),
            comparison_section.get("sheetName", "U.S. Congress"),
        )
        comparison_header = comparison_rows[comparison_section.get("headerRow", 2) - 1]
        comparison_columns = _column_index(comparison_header)
        comparison_dem_index = _candidate_column(comparison_header, comparison_section["majorCandidates"]["dem"])
        comparison_rep_index = _candidate_column(comparison_header, comparison_section["majorCandidates"]["rep"])
        comparison_other_indexes = [
            _candidate_column(comparison_header, rule)
            for rule in comparison_section.get("otherCandidates", [])
        ]
        comparison_required = ["County Name", "Precinct Name", "Precinct Code"]
        comparison_missing = [name for name in comparison_required if name not in comparison_columns]
        if comparison_missing:
            raise ValueError(f"Ohio comparison source missing columns: {', '.join(comparison_missing)}")

        for row in comparison_rows[comparison_section.get("dataStartRow", 5) - 1 :]:
            county = _county_name(_row_value(row, comparison_columns, "County Name"))
            precinct = str(_row_value(row, comparison_columns, "Precinct Name")).strip()
            code = str(_row_value(row, comparison_columns, "Precinct Code")).strip()
            if not county:
                continue
            dem = int_text(row[comparison_dem_index] if len(row) > comparison_dem_index else 0)
            rep = int_text(row[comparison_rep_index] if len(row) > comparison_rep_index else 0)
            other = sum(int_text(row[index] if len(row) > index else 0) for index in comparison_other_indexes)
            if dem or rep or other:
                comparison_by_key[(county, precinct, code)] = {"dem": dem, "rep": rep, "other": other}

    output: list[dict[str, Any]] = []
    presidential_keys: set[tuple[str, str, str]] = set()
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
        key = (county, precinct, code)
        presidential_keys.add(key)
        comparison = comparison_by_key.get(key)
        output.append(
            {
                "county": county,
                "localUnit": f"{precinct} ({code})" if code else precinct,
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": pct(harris - comparison["dem"], total) if comparison else 0,
                "repDropoff": pct(trump - comparison["rep"], total) if comparison else 0,
                "coverageMode": "presidentVsSenate" if comparison else "voteShareOnly",
                "comparisonContest": comparison_section.get("label", "") if comparison else "",
                "comparisonDemVotes": comparison["dem"] if comparison else 0,
                "comparisonRepVotes": comparison["rep"] if comparison else 0,
                "comparisonOtherVotes": comparison["other"] if comparison else 0,
                "sourceId": source.id,
            }
        )

    if comparison_section:
        comparison_keys = set(comparison_by_key)
        if presidential_keys != comparison_keys:
            raise ValueError(
                "Ohio comparison contest rows do not match presidential rows: "
                f"{len(presidential_keys - comparison_keys)} missing comparison rows, "
                f"{len(comparison_keys - presidential_keys)} extra comparison rows"
            )

    return output, {
        "nativeReviewRows": len(output),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": len(comparison_by_key),
        "nativeComparisonContest": comparison_section.get("label") if comparison_section else None,
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
            registered_raw = str(row.get("registered_voters") or "").strip()
            ballots_raw = str(row.get("ballots_cast") or "").strip()
            registered = int_text(registered_raw)
            ballots = int_text(ballots_raw)
            turnout_raw = str(row.get("turnout_pct") or "").strip()
            has_ballots_cast = bool(ballots_raw) and ballots >= 0
            has_positive_denominator = bool(registered_raw) and registered > 0
            ballots_for_output = ballots if has_ballots_cast else 0
            registered_for_output = registered if has_positive_denominator else None

            output.append(
                {
                    "county": county,
                    "localUnit": local_unit,
                    "level": str(row.get("level") or section.get("sourceLevel", "jurisdiction")).strip(),
                    "ballotsCast": ballots_for_output,
                    "registeredVoters": registered_for_output,
                    "turnoutPct": float(turnout_raw) if turnout_raw and has_ballots_cast and has_positive_denominator else pct(ballots_for_output, registered) if has_ballots_cast and has_positive_denominator else None,
                    "denominatorType": row.get("denominator_type") or section.get("denominatorType", "registeredVoters"),
                    "registrationDenominatorTiming": row.get("denominator_note")
                    or row.get("denominator_timing")
                    or section.get("registrationDenominatorTiming", "notRecorded"),
                    "warningRequired": bool(section.get("warningRequired", False))
                    or _truthy(row.get("warning_required"))
                    or not has_ballots_cast
                    or not has_positive_denominator,
                    "sourceId": source.id,
                }
            )

    expected = section.get("expected", {})
    metrics = {
        "nativeTurnoutRows": len(output),
        "nativeRegisteredVoters": sum(int(row["registeredVoters"] or 0) for row in output),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in output),
        "nativeTurnoutParser": section.get("format", "normalizedTurnoutCsv"),
        "nativeTurnoutWarningRows": sum(1 for row in output if row["warningRequired"]),
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


def _north_carolina_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    president_contest = section.get("presidentContest", "US PRESIDENT")
    comparison_section = config.raw.get("comparisonContest", {})
    comparison_contest = comparison_section.get("contestName", "NC GOVERNOR")
    review_section = config.raw.get("reviewCharts", {})
    real_precinct_filter = review_section.get("realPrecinctFilter", {})
    real_precinct_column = real_precinct_filter.get("column", "Real Precinct")
    real_precinct_value = str(real_precinct_filter.get("includeValue", "Y")).strip().upper()

    precincts: dict[tuple[str, str], dict[str, int]] = {}
    counties: dict[str, dict[str, int]] = {}
    comparison_rows = 0
    review_excluded_reporting_units: set[tuple[str, str]] = set()
    review_excluded_presidential_votes = 0
    with zipfile.ZipFile(_artifact_path(source)) as archive:
        names = archive.namelist()
        if not names:
            raise ValueError("North Carolina precinct results ZIP is empty")
        with archive.open(names[0]) as raw:
            text = (line.decode("utf-8-sig", errors="replace") for line in raw)
            reader = csv.DictReader(text, delimiter="\t")
            required = {"County", "Precinct", "Contest Name", "Choice Party", "Total Votes"}
            if real_precinct_filter:
                required.add(real_precinct_column)
            missing = required.difference(reader.fieldnames or [])
            if missing:
                raise ValueError(f"North Carolina precinct source missing columns: {', '.join(sorted(missing))}")

            for row in reader:
                contest = str(row.get("Contest Name") or "").strip()
                if contest not in {president_contest, comparison_contest}:
                    continue

                county = _county_name(row.get("County"))
                precinct = str(row.get("Precinct") or "").strip()
                party = str(row.get("Choice Party") or "").strip().upper()
                votes = int_text(row.get("Total Votes"))
                if not county or not precinct:
                    continue

                if contest == president_contest:
                    county_bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
                    if party == "DEM":
                        county_bucket["harris"] += votes
                    elif party == "REP":
                        county_bucket["trump"] += votes
                    else:
                        county_bucket["other"] += votes
                    county_bucket["total"] += votes

                is_review_unit = True
                if real_precinct_filter:
                    is_review_unit = str(row.get(real_precinct_column) or "").strip().upper() == real_precinct_value
                if not is_review_unit:
                    if contest == president_contest:
                        review_excluded_reporting_units.add((county, precinct))
                        review_excluded_presidential_votes += votes
                    continue

                key = (county, precinct)
                bucket = precincts.setdefault(
                    key,
                    {
                        "gov_dem": 0,
                        "gov_rep": 0,
                        "gov_total": 0,
                        "pres_dem": 0,
                        "pres_other": 0,
                        "pres_rep": 0,
                        "pres_total": 0,
                    },
                )

                if contest == president_contest:
                    if party == "DEM":
                        bucket["pres_dem"] += votes
                    elif party == "REP":
                        bucket["pres_rep"] += votes
                    else:
                        bucket["pres_other"] += votes
                    bucket["pres_total"] += votes
                elif party == "DEM":
                    bucket["gov_dem"] += votes
                    bucket["gov_total"] += votes
                elif party == "REP":
                    bucket["gov_rep"] += votes
                    bucket["gov_total"] += votes
                else:
                    bucket["gov_total"] += votes

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
        if values["total"]
    ]

    review_rows: list[dict[str, Any]] = []
    for (county, precinct), values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        has_comparison = bool(values["gov_total"])
        if has_comparison:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": precinct,
                "totalVotes": total,
                "harris": values["pres_dem"],
                "trump": values["pres_rep"],
                "harrisShare": pct(values["pres_dem"], total),
                "trumpShare": pct(values["pres_rep"], total),
                "demDropoff": pct(values["pres_dem"] - values["gov_dem"], total) if has_comparison else 0,
                "repDropoff": pct(values["pres_rep"] - values["gov_rep"], total) if has_comparison else 0,
                "coverageMode": "presidentVsGovernor" if has_comparison else "voteShareOnly",
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_section.get("label"),
        "nativeReviewReportingUnitFilter": f"{real_precinct_column}={real_precinct_value}" if real_precinct_filter else "",
        "nativeReviewExcludedReportingUnits": len(review_excluded_reporting_units),
        "nativeReviewExcludedPresidentialVotes": review_excluded_presidential_votes,
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in review_rows),
        "nativeReviewCertifiedVoteGap": sum(row["totalVotes"] for row in result_rows) - sum(row["totalVotes"] for row in review_rows),
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics


def _georgia_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    contest_name = section.get("contestName", "President of the US")
    candidate_rules = section.get("candidateRules", {})
    dem_needles = candidate_rules.get("harris", ["Kamala"])
    rep_needles = candidate_rules.get("trump", ["Donald"])
    review_section = config.raw.get("reviewCharts", {})
    comparison_pattern = re.compile(
        review_section.get("comparisonContestRegex", r"^US House of Representatives - District \d+$"),
        re.IGNORECASE,
    )
    comparison_label = review_section.get("comparisonContest", "U.S. House")

    payload = json.loads(_artifact_path(source).read_text(encoding="utf-8"))
    statewide_item = next((item for item in payload.get("results", {}).get("ballotItems", []) if item.get("name") == contest_name), None)
    statewide_values = {"harris": 0, "other": 0, "total": 0, "trump": 0}
    if statewide_item:
        for option in statewide_item.get("ballotOptions", []):
            votes = int_text(option.get("voteCount"))
            bucket = _candidate_bucket(str(option.get("name") or ""), dem_needles, rep_needles)
            if bucket == "dem":
                statewide_values["harris"] += votes
            elif bucket == "rep":
                statewide_values["trump"] += votes
            else:
                statewide_values["other"] += votes
            statewide_values["total"] += votes

    result_rows: list[dict[str, Any]] = []
    precincts: dict[tuple[str, str, str], dict[str, Any]] = {}
    comparison_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    for local in payload.get("localResults", []):
        county = _county_name(local.get("name"))
        if not county:
            continue
        item = next((candidate for candidate in local.get("ballotItems", []) if candidate.get("name") == contest_name), None)
        if item:
            values = {"harris": 0, "other": 0, "total": 0, "trump": 0}
            for option in item.get("ballotOptions", []):
                votes = int_text(option.get("voteCount"))
                bucket = _candidate_bucket(str(option.get("name") or ""), dem_needles, rep_needles)
                if bucket == "dem":
                    values["harris"] += votes
                elif bucket == "rep":
                    values["trump"] += votes
                else:
                    values["other"] += votes
                values["total"] += votes

                for precinct in option.get("precinctResults") or []:
                    precinct_id = str(precinct.get("id") or "").strip()
                    precinct_name = str(precinct.get("name") or precinct_id).strip()
                    if not precinct_name:
                        continue
                    precinct_key = (county, precinct_id, precinct_name)
                    precinct_values = precincts.setdefault(
                        precinct_key,
                        {"harris": 0, "other": 0, "total": 0, "trump": 0},
                    )
                    precinct_votes = int_text(precinct.get("voteCount"))
                    if bucket == "dem":
                        precinct_values["harris"] += precinct_votes
                    elif bucket == "rep":
                        precinct_values["trump"] += precinct_votes
                    else:
                        precinct_values["other"] += precinct_votes
                    precinct_values["total"] += precinct_votes

            if values["total"]:
                result_rows.append(
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
                )

        for comparison_item in local.get("ballotItems", []):
            comparison_name = str(comparison_item.get("name") or "").strip()
            if not comparison_pattern.search(comparison_name):
                continue
            for option in comparison_item.get("ballotOptions") or []:
                bucket = _party_bucket(option.get("politicalParty"), option.get("name"))
                if bucket is None:
                    continue
                for precinct in option.get("precinctResults") or []:
                    precinct_id = str(precinct.get("id") or "").strip()
                    precinct_name = str(precinct.get("name") or precinct_id).strip()
                    if not precinct_name:
                        continue
                    precinct_key = (county, precinct_id, precinct_name)
                    comparison = comparison_by_key.setdefault(
                        precinct_key,
                        {
                            "dem": 0,
                            "demPresent": False,
                            "other": 0,
                            "rep": 0,
                            "repPresent": False,
                            "total": 0,
                            "contests": set(),
                        },
                    )
                    precinct_votes = int_text(precinct.get("voteCount"))
                    if bucket == "dem":
                        comparison["dem"] += precinct_votes
                        comparison["demPresent"] = True
                    elif bucket == "rep":
                        comparison["rep"] += precinct_votes
                        comparison["repPresent"] = True
                    else:
                        comparison["other"] += precinct_votes
                    comparison["total"] += precinct_votes
                    comparison["contests"].add(comparison_name)

    review_rows: list[dict[str, Any]] = []
    zero_total_review_rows = 0
    comparison_rows = 0
    comparable_rows = 0
    one_sided_comparison_rows = 0
    multi_district_comparison_rows = 0
    for (county, precinct_id, precinct_name), values in sorted(precincts.items()):
        total = values["total"]
        if not total:
            zero_total_review_rows += 1
            continue
        comparison = comparison_by_key.get((county, precinct_id, precinct_name))
        contests = sorted(comparison["contests"]) if comparison else []
        has_comparison = bool(comparison and comparison["total"])
        has_multi_district_comparison = bool(has_comparison and len(contests) > 1)
        has_comparable_house = bool(
            has_comparison
            and comparison
            and comparison["demPresent"]
            and comparison["repPresent"]
            and not has_multi_district_comparison
        )
        if has_comparison:
            comparison_rows += 1
        if has_comparable_house:
            comparable_rows += 1
        elif has_multi_district_comparison:
            multi_district_comparison_rows += 1
        elif has_comparison:
            one_sided_comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": f"{precinct_name} ({precinct_id})" if precinct_id and precinct_id != precinct_name else precinct_name,
                "totalVotes": total,
                "harris": values["harris"],
                "trump": values["trump"],
                "harrisShare": pct(values["harris"], total),
                "trumpShare": pct(values["trump"], total),
                "demDropoff": pct(values["harris"] - comparison["dem"], total) if has_comparable_house and comparison else 0,
                "repDropoff": pct(values["trump"] - comparison["rep"], total) if has_comparable_house and comparison else 0,
                "coverageMode": "presidentVsUSHouse" if has_comparable_house else "multiDistrictHouseComparison" if has_multi_district_comparison else "oneSidedHouseComparison" if has_comparison else "voteShareOnly",
                "comparisonContest": contests[0] if len(contests) == 1 else comparison_label if has_comparison else "",
                "comparisonContests": contests,
                "comparisonDemVotes": comparison["dem"] if comparison else 0,
                "comparisonDemCandidatePresent": bool(comparison and comparison["demPresent"]),
                "comparisonRepVotes": comparison["rep"] if comparison else 0,
                "comparisonRepCandidatePresent": bool(comparison and comparison["repPresent"]),
                "comparisonOtherVotes": comparison["other"] if comparison else 0,
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    local_values = {
        "harris": sum(row["votes"]["Harris"] for row in result_rows),
        "other": sum(row["votes"]["Other"] for row in result_rows),
        "total": sum(row["totalVotes"] for row in result_rows),
        "trump": sum(row["votes"]["Trump"] for row in result_rows),
    }
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": local_values["total"],
        "nativeTrumpVotes": local_values["trump"],
        "nativeHarrisVotes": local_values["harris"],
        "nativeOtherVotes": local_values["other"],
        "nativeReviewRows": len(review_rows),
        "nativeReviewZeroTotalRowsOmitted": zero_total_review_rows,
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparableComparisonRows": comparable_rows,
        "nativeOneSidedComparisonRows": one_sided_comparison_rows,
        "nativeMultiDistrictComparisonRows": multi_district_comparison_rows,
        "nativeComparisonContest": comparison_label,
        "nativeStatewideCertifiedVoteGap": local_values["total"] - statewide_values["total"],
        "nativeStatewideCertifiedVotes": statewide_values["total"],
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics

ILLINOIS_NON_CANDIDATE_ROWS = {"Over Votes", "Under Votes", "Blank Ballots"}


def _illinois_party_bucket(party: Any, candidate: Any) -> str | None:
    if str(candidate or "").strip() in ILLINOIS_NON_CANDIDATE_ROWS:
        return None
    normalized = str(party or "").strip().upper()
    if "DEMOCRATIC" in normalized:
        return "dem"
    if "REPUBLICAN" in normalized:
        return "rep"
    return "other"


def _illinois_result_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("JurisdictionID") or "").strip(),
        str(row.get("JurisName") or "").strip(),
        str(row.get("PrecinctName") or "").strip(),
    )


def _illinois_official_csv_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    artifact_dir = _artifact_path(source)
    if not artifact_dir.is_dir():
        raise ValueError(f"Illinois official result source must be a directory: {artifact_dir}")

    presidential_files = sorted(artifact_dir.glob("*PRESIDENT AND VICE PRESIDENT*.csv"))
    if len(presidential_files) != 1:
        raise ValueError(f"expected one Illinois presidential CSV, found {len(presidential_files)}")
    house_files = sorted(artifact_dir.glob("*CONGRESS*.csv"))
    if not house_files:
        raise ValueError("Illinois official result directory does not contain U.S. House comparison CSVs")

    presidential_by_precinct: dict[tuple[str, str, str], dict[str, Any]] = {}
    jurisdiction_totals: dict[str, dict[str, int]] = {}
    with presidential_files[0].open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "JurisdictionID",
            "JurisName",
            "CandidateName",
            "PrecinctName",
            "Registration",
            "PartyName",
            "VoteCount",
        }
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Illinois presidential CSV missing columns: {', '.join(missing)}")

        for row in reader:
            key = _illinois_result_key(row)
            jurisdiction = _illinois_jurisdiction_name(row.get("JurisName"))
            if not jurisdiction:
                continue
            precinct = presidential_by_precinct.setdefault(
                key,
                {
                    "county": jurisdiction,
                    "localUnit": key[2],
                    "harris": 0,
                    "trump": 0,
                    "other": 0,
                    "totalVotes": 0,
                    "registeredVoters": int_text(row.get("Registration")),
                    "sourceId": source.id,
                },
            )
            votes = int_text(row.get("VoteCount"))
            candidate = str(row.get("CandidateName") or "").strip()
            if candidate == "Kamala D. Harris":
                precinct["harris"] += votes
                precinct["totalVotes"] += votes
            elif candidate == "Donald J. Trump":
                precinct["trump"] += votes
                precinct["totalVotes"] += votes
            elif candidate not in ILLINOIS_NON_CANDIDATE_ROWS:
                precinct["other"] += votes
                precinct["totalVotes"] += votes

    for row in presidential_by_precinct.values():
        bucket = jurisdiction_totals.setdefault(row["county"], {"harris": 0, "trump": 0, "other": 0, "total": 0})
        bucket["harris"] += row["harris"]
        bucket["trump"] += row["trump"]
        bucket["other"] += row["other"]
        bucket["total"] += row["totalVotes"]

    result_rows = [
        {
            "jurisdictionName": jurisdiction,
            "jurisdictionCode": jurisdiction.upper().replace(" COUNTY", ""),
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
        for jurisdiction, values in sorted(jurisdiction_totals.items())
    ]

    house_by_precinct: dict[tuple[str, str, str], dict[str, Any]] = {}
    for path in house_files:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            required = {"JurisdictionID", "JurisName", "CandidateName", "ContestName", "PrecinctName", "PartyName", "VoteCount"}
            missing = sorted(required.difference(set(reader.fieldnames or [])))
            if missing:
                raise ValueError(f"Illinois House CSV {path.name} missing columns: {', '.join(missing)}")
            for row in reader:
                key = _illinois_result_key(row)
                comparison = house_by_precinct.setdefault(
                    key,
                    {"dem": 0, "rep": 0, "other": 0, "districts": set(), "sourceFiles": set()},
                )
                comparison["districts"].add(str(row.get("ContestName") or "").strip())
                comparison["sourceFiles"].add(path.name)
                bucket = _illinois_party_bucket(row.get("PartyName"), row.get("CandidateName"))
                if bucket:
                    comparison[bucket] += int_text(row.get("VoteCount"))

    review_rows: list[dict[str, Any]] = []
    missing_presidential_rows = 0
    multi_district_precincts = 0
    uncontested_precincts = 0
    for key, comparison in house_by_precinct.items():
        president = presidential_by_precinct.get(key)
        if not president:
            missing_presidential_rows += 1
            continue
        districts = sorted(comparison["districts"])
        if len(districts) != 1:
            multi_district_precincts += 1
            continue
        if comparison["dem"] <= 0 or comparison["rep"] <= 0:
            uncontested_precincts += 1
            continue
        total = president["totalVotes"]
        if total <= 0:
            continue
        review_rows.append(
            {
                "county": president["county"],
                "localUnit": president["localUnit"],
                "totalVotes": total,
                "harris": president["harris"],
                "trump": president["trump"],
                "harrisShare": pct(president["harris"], total),
                "trumpShare": pct(president["trump"], total),
                "demDropoff": pct(president["harris"] - comparison["dem"], total),
                "repDropoff": pct(president["trump"] - comparison["rep"], total),
                "coverageMode": "presidentVsHouseContestedPrecinct",
                "comparisonContest": districts[0],
                "comparisonDemVotes": comparison["dem"],
                "comparisonRepVotes": comparison["rep"],
                "comparisonOtherVotes": comparison["other"],
                "excludedJoinCaveat": "Illinois review rows omit precinct keys that appear in multiple House districts and House rows without both Democratic and Republican candidate votes.",
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeComparisonRows": len(review_rows),
        "nativeComparisonContest": config.raw.get("reviewCharts", {}).get("comparisonContest", "U.S. House"),
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in review_rows),
        "nativeReviewMissingPresidentialRows": missing_presidential_rows,
        "nativeReviewMultiDistrictPrecinctsOmitted": multi_district_precincts,
        "nativeReviewUncontestedHousePrecinctsOmitted": uncontested_precincts,
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        **turnout_metrics,
    }
    return (
        sorted(result_rows, key=lambda item: item["jurisdictionName"]),
        sorted(review_rows, key=lambda item: (item["county"], item["localUnit"])),
        turnout_rows,
        metrics,
    )


def _county_comparison_review_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    result_rows: list[dict[str, Any]],
    *,
    missing_label: str,
    county_normalizer: Callable[[Any], str] = _county_name,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("reviewCharts", {})
    if section.get("format") != "countyComparisonCsv":
        return [], {"nativeReviewRows": 0}

    source = sources[section["sourceId"]]
    president_by_county = {row["jurisdictionName"]: row for row in result_rows}
    review_rows: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"state", "election_year", "jurisdiction_name", "comparison_dem", "comparison_rep"}
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"{missing_label} comparison CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"{missing_label} comparison row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"{missing_label} comparison row {index} has wrong election year: {row.get('election_year')!r}")
            county = county_normalizer(row.get("jurisdiction_name"))
            president = president_by_county.get(county)
            if not county or not president:
                raise ValueError(f"{missing_label} comparison row {index} does not match a presidential county row: {row.get('jurisdiction_name')!r}")
            total = president["totalVotes"]
            comparison_dem = int_text(row.get("comparison_dem"))
            comparison_rep = int_text(row.get("comparison_rep"))
            review_rows.append(
                {
                    "county": county,
                    "localUnit": row.get("local_unit") or county,
                    "totalVotes": total,
                    "harris": president["votes"]["Harris"],
                    "trump": president["votes"]["Trump"],
                    "harrisShare": pct(president["votes"]["Harris"], total),
                    "trumpShare": pct(president["votes"]["Trump"], total),
                    "demDropoff": pct(president["votes"]["Harris"] - comparison_dem, total),
                    "repDropoff": pct(president["votes"]["Trump"] - comparison_rep, total),
                    "coverageMode": section.get("coverageMode", "presidentVsComparisonContest"),
                    "comparisonContest": section.get("comparisonContest", ""),
                    "comparisonDemVotes": comparison_dem,
                    "comparisonRepVotes": comparison_rep,
                    "comparisonOtherVotes": int_text(row.get("comparison_other")),
                    "sourceId": source.id,
                }
            )

    return sorted(review_rows, key=lambda item: item["county"]), {
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": len(review_rows),
        "nativeComparisonContest": section.get("comparisonContest", ""),
    }



def _local_comparison_review_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    result_rows: list[dict[str, Any]],
    *,
    missing_label: str,
    county_normalizer: Callable[[Any], str] = _county_name,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("reviewCharts", {})
    if section.get("format") != "localComparisonCsv":
        return [], {"nativeReviewRows": 0}

    source_ids = section.get("sourceIds") or [section["sourceId"]]
    valid_counties = {row["jurisdictionName"] for row in result_rows}
    review_rows: list[dict[str, Any]] = []
    for source_id in source_ids:
        source = sources[source_id]
        with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            required = {
                "state",
                "election_year",
                "county",
                "local_unit",
                "pres_harris",
                "pres_trump",
                "pres_other",
                "pres_total",
                "comparison_dem",
                "comparison_rep",
                "comparison_other",
            }
            missing = sorted(required.difference(set(reader.fieldnames or [])))
            if missing:
                raise ValueError(f"{missing_label} local comparison CSV missing columns: {', '.join(missing)}")

            for index, row in enumerate(reader, start=2):
                state = str(row.get("state") or "").strip().upper()
                if state != config.code:
                    raise ValueError(f"{missing_label} local comparison row {index} has wrong state: {row.get('state')!r}")
                year = int_text(row.get("election_year"))
                if year != config.election_year:
                    raise ValueError(f"{missing_label} local comparison row {index} has wrong election year: {row.get('election_year')!r}")
                county = county_normalizer(row.get("county"))
                if county not in valid_counties:
                    raise ValueError(f"{missing_label} local comparison row {index} does not match a presidential county row: {row.get('county')!r}")
                local_unit = str(row.get("local_unit") or "").strip()
                if not local_unit:
                    raise ValueError(f"{missing_label} local comparison row {index} is missing local_unit")

                harris = int_text(row.get("pres_harris"))
                trump = int_text(row.get("pres_trump"))
                other = int_text(row.get("pres_other"))
                total = int_text(row.get("pres_total")) or harris + trump + other
                if not total:
                    continue
                comparison_dem = int_text(row.get("comparison_dem"))
                comparison_rep = int_text(row.get("comparison_rep"))
                comparison_other = int_text(row.get("comparison_other"))
                dem_dropoff = pct(harris - comparison_dem, total)
                rep_dropoff = pct(trump - comparison_rep, total)
                if str(row.get("dem_dropoff") or "").strip():
                    dem_dropoff = round(float(str(row.get("dem_dropoff")).replace("%", "")), 4)
                if str(row.get("rep_dropoff") or "").strip():
                    rep_dropoff = round(float(str(row.get("rep_dropoff")).replace("%", "")), 4)
                review_rows.append(
                    {
                        "county": county,
                        "localUnit": local_unit,
                        "totalVotes": total,
                        "harris": harris,
                        "trump": trump,
                        "harrisShare": pct(harris, total),
                        "trumpShare": pct(trump, total),
                        "demDropoff": dem_dropoff,
                        "repDropoff": rep_dropoff,
                        "coverageMode": section.get("coverageMode", "presidentVsComparisonContest"),
                        "comparisonContest": section.get("comparisonContest", ""),
                        "comparisonDemVotes": comparison_dem,
                        "comparisonRepVotes": comparison_rep,
                        "comparisonOtherVotes": comparison_other,
                        "sourceId": source.id,
                    }
                )

    return sorted(review_rows, key=lambda item: (item["county"], item["localUnit"])), {
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": len(review_rows),
        "nativeComparisonContest": section.get("comparisonContest", ""),
        "nativeReviewSourceCoverage": section.get("sourceCoverage", ""),
    }


def _new_hampshire_town_ward_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    review_section = config.raw.get("reviewCharts", {})
    use_house_comparison = review_section.get("comparisonContest") == "U.S. House"
    counties: dict[str, dict[str, int]] = {}
    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0

    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "state",
            "election_year",
            "county",
            "local_unit",
            "pres_harris",
            "pres_trump",
            "pres_other",
            "pres_total",
            "gov_dem",
            "gov_rep",
            "gov_other",
            "gov_total",
        }
        if use_house_comparison:
            required.update({"house_dem", "house_rep", "house_other", "house_total"})
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"New Hampshire town/ward CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"New Hampshire town/ward row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"New Hampshire town/ward row {index} has wrong election year: {row.get('election_year')!r}")
            county = _county_name(row.get("county"))
            local_unit = str(row.get("local_unit") or "").strip()
            if not county or not local_unit:
                raise ValueError(f"New Hampshire town/ward row {index} is missing county/local_unit")

            harris = int_text(row.get("pres_harris"))
            trump = int_text(row.get("pres_trump"))
            other = int_text(row.get("pres_other"))
            total = int_text(row.get("pres_total"))
            if total:
                bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
                bucket["harris"] += harris
                bucket["trump"] += trump
                bucket["other"] += other
                bucket["total"] += total

            gov_dem = int_text(row.get("gov_dem"))
            gov_rep = int_text(row.get("gov_rep"))
            gov_other = int_text(row.get("gov_other"))
            gov_total = int_text(row.get("gov_total"))
            house_dem = int_text(row.get("house_dem"))
            house_rep = int_text(row.get("house_rep"))
            house_other = int_text(row.get("house_other"))
            house_total = int_text(row.get("house_total"))
            comparison_dem = house_dem if use_house_comparison else gov_dem
            comparison_rep = house_rep if use_house_comparison else gov_rep
            comparison_other = house_other if use_house_comparison else gov_other
            comparison_total = house_total if use_house_comparison else gov_total
            if not total:
                continue
            has_comparison = bool(comparison_total)
            if has_comparison:
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
                    "demDropoff": pct(harris - comparison_dem, total) if has_comparison else 0,
                    "repDropoff": pct(trump - comparison_rep, total) if has_comparison else 0,
                    "coverageMode": review_section.get("coverageMode", "presidentVsGovernor") if has_comparison else "voteShareOnly",
                    "comparisonContest": review_section.get("comparisonContest", ""),
                    "comparisonDemVotes": comparison_dem,
                    "comparisonRepVotes": comparison_rep,
                    "comparisonOtherVotes": comparison_other,
                    "sourceId": source.id,
                }
            )

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
        for county, values in sorted(counties.items())
        if values["total"]
    ]

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": review_section.get("comparisonContest", ""),
        **turnout_metrics,
    }
    return result_rows, sorted(review_rows, key=lambda item: (item["county"], item["localUnit"])), turnout_rows, metrics


def _mississippi_election_recap_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    president_office = section.get("presidentOffice", "United States-President")
    comparison_section = config.raw.get("reviewCharts", {})
    comparison_office = comparison_section.get("comparisonOffice", "United States-Senate")

    counties: dict[str, dict[str, int]] = {}
    comparison: dict[str, dict[str, int]] = {}
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"County", "Office", "Candidate", "Party", "County Total", "State Total"}
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Mississippi election recap CSV missing columns: {', '.join(missing)}")

        for row in reader:
            office = str(row.get("Office") or "").strip()
            if office not in {president_office, comparison_office}:
                continue
            county = _county_name(row.get("County"))
            if not county:
                continue
            party = str(row.get("Party") or "").strip().lower()
            votes = int_text(row.get("County Total"))
            if office == president_office:
                bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
                if party == "democrat":
                    bucket["harris"] += votes
                elif party == "republican":
                    bucket["trump"] += votes
                else:
                    bucket["other"] += votes
                bucket["total"] += votes
            else:
                bucket = comparison.setdefault(county, {"dem": 0, "other": 0, "rep": 0, "total": 0})
                if party == "democrat":
                    bucket["dem"] += votes
                elif party == "republican":
                    bucket["rep"] += votes
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
        for county, values in sorted(counties.items())
        if values["total"]
    ]

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for row in result_rows:
        county = row["jurisdictionName"]
        comparison_values = comparison.get(county, {"dem": 0, "other": 0, "rep": 0, "total": 0})
        has_comparison = bool(comparison_values["total"])
        if has_comparison:
            comparison_rows += 1
        total = row["totalVotes"]
        review_rows.append(
            {
                "county": county,
                "localUnit": "County total",
                "totalVotes": total,
                "harris": row["votes"]["Harris"],
                "trump": row["votes"]["Trump"],
                "harrisShare": pct(row["votes"]["Harris"], total),
                "trumpShare": pct(row["votes"]["Trump"], total),
                "demDropoff": pct(row["votes"]["Harris"] - comparison_values["dem"], total) if has_comparison else 0,
                "repDropoff": pct(row["votes"]["Trump"] - comparison_values["rep"], total) if has_comparison else 0,
                "coverageMode": comparison_section.get("coverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                "comparisonContest": comparison_section.get("comparisonContest", ""),
                "comparisonDemVotes": comparison_values["dem"],
                "comparisonRepVotes": comparison_values["rep"],
                "comparisonOtherVotes": comparison_values["other"],
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": comparison_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_section.get("comparisonContest", ""),
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics



def _county_president_csv_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    *,
    missing_label: str,
    county_normalizer: Callable[[Any], str] = _county_name,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    result_rows: list[dict[str, Any]] = []
    other_columns = list(section.get("otherColumns", []))

    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"state", "election_year", "jurisdiction_name", "trump", "harris", *other_columns}
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"{missing_label} presidential CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"{missing_label} presidential row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"{missing_label} presidential row {index} has wrong election year: {row.get('election_year')!r}")
            county = county_normalizer(row.get("jurisdiction_name"))
            if not county:
                raise ValueError(f"{missing_label} presidential row {index} is missing jurisdiction_name")

            trump = int_text(row.get("trump"))
            harris = int_text(row.get("harris"))
            other = sum(int_text(row.get(column)) for column in other_columns)
            total = trump + harris + other
            result_rows.append(
                {
                    "jurisdictionName": county,
                    "jurisdictionCode": row.get("jurisdiction_code") or county,
                    "level": row.get("level") or "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )

    result_rows = sorted(result_rows, key=lambda item: item["jurisdictionName"])
    review_rows, review_metrics = _local_comparison_review_rows(
        config,
        sources,
        result_rows,
        missing_label=missing_label,
        county_normalizer=county_normalizer,
    )
    if not review_rows and config.capabilities.get("reviewGraphs", False):
        review_rows, review_metrics = _county_comparison_review_rows(
            config,
            sources,
            result_rows,
            missing_label=missing_label,
            county_normalizer=county_normalizer,
        )

    if not review_rows and config.capabilities.get("reviewGraphs", False):
        review_rows = [
            {
                "county": row["jurisdictionName"],
                "localUnit": "County total",
                "totalVotes": row["totalVotes"],
                "harris": row["votes"]["Harris"],
                "trump": row["votes"]["Trump"],
                "harrisShare": pct(row["votes"]["Harris"], row["totalVotes"]),
                "trumpShare": pct(row["votes"]["Trump"], row["totalVotes"]),
                "demDropoff": 0,
                "repDropoff": 0,
                "coverageMode": "voteShareOnly",
                "sourceId": source.id,
            }
            for row in result_rows
        ]
        review_metrics = {
            "nativeReviewRows": len(review_rows),
            "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
            "nativeComparisonRows": 0,
            "nativeComparisonContest": config.raw.get("reviewCharts", {}).get("comparisonContest", ""),
        }

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        **review_metrics,
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics
MARYLAND_VOTE_COLUMNS = [
    "Early Votes",
    "Election Night Votes",
    "Mail-In Ballot 1 Votes",
    "Provisional Votes",
    "Mail-In Ballot 2 Votes",
]


def _maryland_candidate_votes(row: dict[str, Any]) -> int:
    return sum(int_text(row.get(column)) for column in MARYLAND_VOTE_COLUMNS)


def _maryland_candidate_bucket(row: dict[str, Any], contest: str) -> str:
    candidate = " ".join(str(row.get("Candidate Name") or "").lower().split())
    party = str(row.get("Party") or "").strip().upper()

    if contest == "President - Vice Pres":
        if "kamala d. harris" in candidate:
            return "harris"
        if "donald j. trump" in candidate:
            return "trump"
        return "other"

    if contest == "U.S. Senator":
        if "angela alsobrooks" in candidate or party == "DEM":
            return "dem"
        if "larry hogan" in candidate or party == "REP":
            return "rep"

    return "other"


def _maryland_precinct_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_section = config.raw["certifiedResults"]
    review_section = config.raw.get("reviewCharts", {})
    result_source = sources[result_section["sourceId"]]
    turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    presidential: dict[tuple[str, str], dict[str, Any]] = {}
    senate: dict[tuple[str, str], dict[str, Any]] = {}
    county_totals: dict[str, dict[str, int]] = {}
    mode_totals = {
        "president": {column: 0 for column in MARYLAND_VOTE_COLUMNS},
        "senate": {column: 0 for column in MARYLAND_VOTE_COLUMNS},
    }

    with _artifact_path(result_source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "County Name",
            "Election District - Precinct",
            "Office Name",
            "Candidate Name",
            "Party",
            *MARYLAND_VOTE_COLUMNS,
        }
        missing = sorted(required.difference(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Maryland precinct CSV missing columns: {', '.join(missing)}")

        for row in reader:
            contest = str(row.get("Office Name") or "").strip()
            if contest not in {"President - Vice Pres", "U.S. Senator"}:
                continue

            county = str(row.get("County Name") or "").strip()
            precinct = str(row.get("Election District - Precinct") or "").strip()
            if not county or not precinct:
                continue

            votes = _maryland_candidate_votes(row)
            key = (county, precinct)
            if contest == "President - Vice Pres":
                bucket = _maryland_candidate_bucket(row, contest)
                current = presidential.setdefault(
                    key,
                    {
                        "county": county,
                        "localUnit": precinct,
                        "harris": 0,
                        "trump": 0,
                        "other": 0,
                        "totalVotes": 0,
                        "sourceId": result_source.id,
                    },
                )
                current[bucket] += votes
                current["totalVotes"] += votes
                county_bucket = county_totals.setdefault(county, {"harris": 0, "trump": 0, "other": 0, "total": 0})
                county_bucket[bucket] += votes
                county_bucket["total"] += votes
                for column in MARYLAND_VOTE_COLUMNS:
                    mode_totals["president"][column] += int_text(row.get(column))
            else:
                bucket = _maryland_candidate_bucket(row, contest)
                if bucket == "other":
                    continue
                current = senate.setdefault(
                    key,
                    {
                        "county": county,
                        "localUnit": precinct,
                        "dem": 0,
                        "rep": 0,
                    },
                )
                current[bucket] += votes
                for column in MARYLAND_VOTE_COLUMNS:
                    mode_totals["senate"][column] += int_text(row.get(column))

    missing_senate = sorted(set(presidential).difference(senate))
    extra_senate = sorted(set(senate).difference(presidential))
    if missing_senate or extra_senate:
        raise ValueError(
            "Maryland precinct President and U.S. Senate keys do not match: "
            f"{len(missing_senate)} missing Senate rows, {len(extra_senate)} extra Senate rows"
        )

    review_rows: list[dict[str, Any]] = []
    for key, row in sorted(presidential.items()):
        comparison = senate[key]
        total = row["totalVotes"]
        harris = row["harris"]
        trump = row["trump"]
        comparison_dem = comparison["dem"]
        comparison_rep = comparison["rep"]
        review_rows.append(
            {
                "county": row["county"],
                "localUnit": row["localUnit"],
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "comparisonDemVotes": comparison_dem,
                "comparisonRepVotes": comparison_rep,
                "comparisonDemCandidatePresent": True,
                "comparisonRepCandidatePresent": True,
                "demDropoff": pct(harris - comparison_dem, total),
                "repDropoff": pct(trump - comparison_rep, total),
                "coverageMode": review_section.get("coverageMode", "presidentVsSenate"),
                "sourceId": row["sourceId"],
            }
        )

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

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": len(review_rows),
        "nativeComparisonContest": review_section.get("comparisonContest", "U.S. Senator"),
        "nativePresidentialModeVotes": mode_totals["president"],
        "nativeSenateModeVotes": mode_totals["senate"],
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics

def _sc_csv_rows(source: SourceConfig) -> tuple[list[list[str]], list[str], list[str], int, int]:
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))
    if len(rows) < 3:
        raise ValueError(f"South Carolina Election History CSV has too few rows: {source.local_file}")

    candidate_header = rows[0]
    party_header = rows[1]
    try:
        total_votes_index = candidate_header.index("Total Votes Cast")
        total_ballots_index = candidate_header.index("Total Ballots Cast")
    except ValueError as error:
        raise ValueError(f"South Carolina Election History CSV missing total columns: {source.local_file}") from error

    return rows[2:], candidate_header, party_header, total_votes_index, total_ballots_index


def _sc_party_bucket(party: str, candidate: str) -> str:
    normalized_party = " ".join(str(party or "").strip().lower().split())
    normalized_candidate = " ".join(str(candidate or "").strip().lower().split())
    if normalized_party == "democratic":
        return "dem"
    if normalized_party == "republican":
        return "rep"
    if "kamala" in normalized_candidate and "harris" in normalized_candidate:
        return "dem"
    if "donald" in normalized_candidate and "trump" in normalized_candidate:
        return "rep"
    return "other"


def _sc_values_from_row(row: list[str], candidate_header: list[str], party_header: list[str], total_votes_index: int, total_ballots_index: int) -> dict[str, int]:
    values = {
        "dem": 0,
        "other": 0,
        "rep": 0,
        "total": int_text(row[total_votes_index] if len(row) > total_votes_index else 0),
        "total_ballots": int_text(row[total_ballots_index] if len(row) > total_ballots_index else 0),
    }
    for index in range(2, total_votes_index):
        votes = int_text(row[index] if len(row) > index else 0)
        bucket = _sc_party_bucket(
            party_header[index] if len(party_header) > index else "",
            candidate_header[index] if len(candidate_header) > index else "",
        )
        values[bucket] += votes
    return values


def _south_carolina_election_history_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_section = config.raw["certifiedResults"]
    review_section = config.raw.get("reviewCharts", {})
    president_source = sources[result_section["sourceId"]]
    comparison_source = sources[review_section["sourceId"]]

    president_rows, president_header, president_parties, president_total_index, president_ballots_index = _sc_csv_rows(president_source)
    county_results: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str], dict[str, Any]] = {}
    current_county = ""
    presidential_precinct_rows = 0
    zero_presidential_precinct_rows = 0

    for row in president_rows:
        if len(row) < 2:
            continue
        row_type = str(row[0] or "").strip()
        label = str(row[1] or "").strip()
        if row_type == "County":
            current_county = _county_name(label)
            county_results[current_county] = _sc_values_from_row(row, president_header, president_parties, president_total_index, president_ballots_index)
            continue
        if row_type != "Precinct" or not current_county or not label:
            continue

        presidential_precinct_rows += 1
        values = _sc_values_from_row(row, president_header, president_parties, president_total_index, president_ballots_index)
        if not values["total"]:
            zero_presidential_precinct_rows += 1
            continue
        precincts[(current_county, label)] = {
            "county": current_county,
            "localUnit": label,
            "harris": values["dem"],
            "trump": values["rep"],
            "other": values["other"],
            "totalVotes": values["total"],
            "totalBallots": values["total_ballots"],
        }

    comparison_by_key: dict[tuple[str, str], dict[str, int]] = {}
    comparison_precinct_rows = 0
    duplicate_comparison_rows = 0
    for contest_id in review_section.get("comparisonContestIds", []):
        contest_file = _artifact_path(comparison_source) / f"us-house-{contest_id}.csv"
        if not contest_file.exists():
            raise FileNotFoundError(f"missing South Carolina U.S. House comparison CSV: {contest_file}")
        contest_source = SourceConfig(
            id=comparison_source.id,
            category=comparison_source.category,
            url=comparison_source.url,
            local_file=str(contest_file),
            parser=comparison_source.parser,
            authority=comparison_source.authority,
            timestamp_basis=comparison_source.timestamp_basis,
            confidence=comparison_source.confidence,
            status=comparison_source.status,
            raw=comparison_source.raw,
        )
        house_rows, house_header, house_parties, house_total_index, house_ballots_index = _sc_csv_rows(contest_source)
        current_house_county = ""
        for row in house_rows:
            if len(row) < 2:
                continue
            row_type = str(row[0] or "").strip()
            label = str(row[1] or "").strip()
            if row_type == "County":
                current_house_county = _county_name(label)
                continue
            if row_type != "Precinct" or not current_house_county or not label:
                continue

            comparison_precinct_rows += 1
            values = _sc_values_from_row(row, house_header, house_parties, house_total_index, house_ballots_index)
            key = (current_house_county, label)
            if key in comparison_by_key:
                duplicate_comparison_rows += 1
            bucket = comparison_by_key.setdefault(key, {"dem": 0, "other": 0, "rep": 0, "total": 0, "total_ballots": 0})
            bucket["dem"] += values["dem"]
            bucket["rep"] += values["rep"]
            bucket["other"] += values["other"]
            bucket["total"] += values["total"]
            bucket["total_ballots"] += values["total_ballots"]

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    missing_comparison_rows = 0
    for key, row in sorted(precincts.items()):
        comparison = comparison_by_key.get(key)
        has_comparison = bool(comparison and comparison["total"])
        if has_comparison:
            comparison_rows += 1
        else:
            missing_comparison_rows += 1
        total = row["totalVotes"]
        review_rows.append(
            {
                "county": row["county"],
                "localUnit": row["localUnit"],
                "totalVotes": total,
                "harris": row["harris"],
                "trump": row["trump"],
                "harrisShare": pct(row["harris"], total),
                "trumpShare": pct(row["trump"], total),
                "demDropoff": pct(row["harris"] - comparison["dem"], total) if has_comparison else 0,
                "repDropoff": pct(row["trump"] - comparison["rep"], total) if has_comparison else 0,
                "coverageMode": review_section.get("coverageMode", "presidentVsUSHouse") if has_comparison else "voteShareOnly",
                "comparisonContest": review_section.get("comparisonContest", "United States House"),
                "comparisonDemVotes": comparison["dem"] if comparison else 0,
                "comparisonRepVotes": comparison["rep"] if comparison else 0,
                "comparisonOtherVotes": comparison["other"] if comparison else 0,
                "sourceId": president_source.id,
            }
        )

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["rep"],
                "Harris": values["dem"],
                "Other": values["other"],
            },
            "totalVotes": values["total"],
            "margin": values["rep"] - values["dem"],
            "marginPct": pct(values["rep"] - values["dem"], values["total"]),
            "sourceId": president_source.id,
        }
        for county, values in sorted(county_results.items())
        if values["total"]
    ]

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": review_section.get("comparisonContest", "United States House"),
        "nativeMissingComparisonRows": missing_comparison_rows,
        "nativePresidentialPrecinctRows": presidential_precinct_rows,
        "nativeZeroPresidentialPrecinctRows": zero_presidential_precinct_rows,
        "nativeComparisonPrecinctRows": comparison_precinct_rows,
        "nativeDuplicateComparisonRows": duplicate_comparison_rows,
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics
def _historical_baseline_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("historicalBaselines", {})
    if section.get("format") != "historicalPresidentialCsv":
        return [], {"nativeHistoricalRows": 0}

    source = sources[section["sourceId"]]
    rows: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "state",
            "election_year",
            "jurisdiction_name",
            "source_id",
            "source_level",
            "row_method",
            "dem_votes",
            "rep_votes",
            "other_votes",
            "total_votes",
        }
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Historical baseline CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"Historical baseline row {index} has wrong state: {row.get('state')!r}")
            county = _nevada_jurisdiction_name(row.get("jurisdiction_name")) if config.code == "NV" else _county_name(row.get("jurisdiction_name"))
            if not county:
                raise ValueError(f"Historical baseline row {index} is missing jurisdiction_name")
            rows.append(
                {
                    "electionYear": int_text(row.get("election_year")),
                    "sourceId": row.get("source_id") or source.id,
                    "sourceLevel": row.get("source_level") or "county",
                    "rowMethod": row.get("row_method") or "historicalPresidentialCsv",
                    "jurisdictionName": county,
                    "localUnit": row.get("local_unit") or county,
                    "demVotes": int_text(row.get("dem_votes")),
                    "repVotes": int_text(row.get("rep_votes")),
                    "otherVotes": int_text(row.get("other_votes")),
                    "totalVotes": int_text(row.get("total_votes")),
                    "sourceUrl": row.get("source_url") or source.url,
                    "sourceDocumentId": source.id,
                }
            )

    expected_rows = int_text(section.get("expected", {}).get("rowCount"))
    if expected_rows and len(rows) != expected_rows:
        raise ValueError(f"Historical baseline expected {expected_rows} rows, got {len(rows)}")
    years = sorted({row["electionYear"] for row in rows})
    return rows, {
        "nativeHistoricalRows": len(rows),
        "nativeHistoricalYears": years,
        "nativeHistoricalWarning": section.get("warning", ""),
    }


def _arizona_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    other_columns = section.get("otherColumns", [])

    result_rows: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"state", "election_year", "jurisdiction_name", "trump", "harris", *other_columns}
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Arizona canvass CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"Arizona canvass row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"Arizona canvass row {index} has wrong election year: {row.get('election_year')!r}")
            county = _county_name(row.get("jurisdiction_name"))
            if not county:
                raise ValueError(f"Arizona canvass row {index} is missing jurisdiction_name")

            trump = int_text(row.get("trump"))
            harris = int_text(row.get("harris"))
            other = sum(int_text(row.get(column)) for column in other_columns)
            total = trump + harris + other
            if not total:
                continue
            result_rows.append(
                {
                    "jurisdictionName": county,
                    "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                    "level": "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    review_rows, review_metrics = _county_comparison_review_rows(config, sources, result_rows, missing_label="Arizona canvass")
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        **review_metrics,
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics


def _nevada_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    other_columns = section.get("otherColumns", [])

    result_rows: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"state", "election_year", "jurisdiction_name", "trump", "harris", *other_columns}
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Nevada statewide results CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            state = str(row.get("state") or "").strip().upper()
            if state != config.code:
                raise ValueError(f"Nevada results row {index} has wrong state: {row.get('state')!r}")
            year = int_text(row.get("election_year"))
            if year != config.election_year:
                raise ValueError(f"Nevada results row {index} has wrong election year: {row.get('election_year')!r}")
            county = _nevada_jurisdiction_name(row.get("jurisdiction_name"))
            if not county:
                raise ValueError(f"Nevada results row {index} is missing jurisdiction_name")

            trump = int_text(row.get("trump"))
            harris = int_text(row.get("harris"))
            other = sum(int_text(row.get(column)) for column in other_columns)
            total = trump + harris + other
            if not total:
                continue
            result_rows.append(
                {
                    "jurisdictionName": county,
                    "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                    "level": "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    review_rows, review_metrics = _local_comparison_review_rows(
        config,
        sources,
        result_rows,
        missing_label="Nevada local results",
        county_normalizer=_nevada_jurisdiction_name,
    )
    if not review_rows:
        review_rows, review_metrics = _county_comparison_review_rows(
            config,
            sources,
            result_rows,
            missing_label="Nevada statewide results",
            county_normalizer=_nevada_jurisdiction_name,
        )
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        **review_metrics,
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics


def _clarity_county_json_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_path = _artifact_path(source)
    base_dir = source_path.parent

    details = json.loads(source_path.read_text(encoding="utf-8-sig"))
    summary = json.loads((base_dir / section.get("summaryFile", "sum.json")).read_text(encoding="utf-8-sig"))
    summary_by_key = {str(item.get("K")): item for item in summary.get("Contests", [])}
    detail_by_key = {str(item.get("K")): item for item in details.get("Contests", [])}

    president_key = str(section.get("presidentContestKey", "1000"))
    president_summary = summary_by_key.get(president_key)
    president_detail = detail_by_key.get(president_key)
    if not president_summary or not president_detail:
        raise ValueError(f"Iowa Clarity JSON missing president contest {president_key}")

    def party_index(contest: dict[str, Any], party: str) -> int:
        parties = [str(value).strip().upper() for value in contest.get("P", [])]
        try:
            return parties.index(party)
        except ValueError as exc:
            raise ValueError(f"Iowa contest {contest.get('K')} missing {party} candidate") from exc

    pres_dem_index = party_index(president_summary, "DEM")
    pres_rep_index = party_index(president_summary, "REP")
    result_rows: list[dict[str, Any]] = []
    for county_raw, votes in zip(president_detail.get("P", []), president_detail.get("V", [])):
        county = _county_name(county_raw)
        if not county:
            continue
        harris = int_text(votes[pres_dem_index] if len(votes) > pres_dem_index else 0)
        trump = int_text(votes[pres_rep_index] if len(votes) > pres_rep_index else 0)
        other = sum(int_text(value) for index, value in enumerate(votes) if index not in {pres_dem_index, pres_rep_index})
        total = harris + trump + other
        if not total:
            continue
        result_rows.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {
                    "Trump": trump,
                    "Harris": harris,
                    "Other": other,
                },
                "totalVotes": total,
                "margin": trump - harris,
                "marginPct": pct(trump - harris, total),
                "sourceId": source.id,
            }
        )

    comparison_pattern = re.compile(section.get("comparisonContestRegex", r"United States Representative District"), re.IGNORECASE)
    comparison_by_county: dict[str, dict[str, int]] = {}
    for contest_key, contest_summary in summary_by_key.items():
        contest_name = str(contest_summary.get("C") or "")
        if not comparison_pattern.search(contest_name):
            continue
        contest_detail = detail_by_key.get(contest_key)
        if not contest_detail:
            continue
        dem_index = party_index(contest_summary, "DEM")
        rep_index = party_index(contest_summary, "REP")
        for county_raw, votes in zip(contest_detail.get("P", []), contest_detail.get("V", [])):
            county = _county_name(county_raw)
            if not county:
                continue
            bucket = comparison_by_county.setdefault(county, {"dem": 0, "rep": 0, "total": 0})
            dem = int_text(votes[dem_index] if len(votes) > dem_index else 0)
            rep = int_text(votes[rep_index] if len(votes) > rep_index else 0)
            bucket["dem"] += dem
            bucket["rep"] += rep
            bucket["total"] += sum(int_text(value) for value in votes)

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for row in sorted(result_rows, key=lambda item: item["jurisdictionName"]):
        county = row["jurisdictionName"]
        total = row["totalVotes"]
        comparison = comparison_by_county.get(county, {"dem": 0, "rep": 0, "total": 0})
        has_comparison = bool(comparison["total"])
        if has_comparison:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": "County total",
                "totalVotes": total,
                "harris": row["votes"]["Harris"],
                "trump": row["votes"]["Trump"],
                "harrisShare": pct(row["votes"]["Harris"], total),
                "trumpShare": pct(row["votes"]["Trump"], total),
                "demDropoff": pct(row["votes"]["Harris"] - comparison["dem"], total) if has_comparison else 0,
                "repDropoff": pct(row["votes"]["Trump"] - comparison["rep"], total) if has_comparison else 0,
                "coverageMode": section.get("comparisonCoverageMode", "presidentVsUSHouse") if has_comparison else "voteShareOnly",
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": section.get("comparisonContestLabel", "United States Representative"),
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics


def _arkansas_totalresults_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_dir = _artifact_path(source)
    if not source_dir.is_dir():
        raise ValueError(f"Arkansas TotalResults source must be a directory: {source_dir}")

    election_info = json.loads((source_dir / section.get("electionInfoFile", "election-info.json")).read_text(encoding="utf-8-sig"))
    federal_results = json.loads((source_dir / section.get("federalResultsFile", "federal-results.json")).read_text(encoding="utf-8-sig"))
    manifest = json.loads((source_dir / section.get("manifestFile", "manifest.json")).read_text(encoding="utf-8-sig"))
    county_files = manifest.get("files", [])

    county_names = {
        str(location_id): _county_name(location.get("locationName"))
        for location_id, location in (election_info.get("response", {}).get("locations") or {}).items()
    }
    president_contest_id = str(section.get("presidentContestId", "366"))
    trump_choice_id = str(section.get("trumpChoiceId", "789"))
    harris_choice_id = str(section.get("harrisChoiceId", "791"))
    dem_party_id = str(section.get("demPartyId", "2099"))
    rep_party_id = str(section.get("repPartyId", "2096"))
    comparison_contest_ids = {str(value) for value in section.get("comparisonContestIds", [])}

    def choice_totals(choices: list[dict[str, Any]]) -> tuple[int, int, int, int]:
        harris = 0
        trump = 0
        other = 0
        for choice in choices or []:
            choice_id = str(choice.get("choiceID") or choice.get("choiceId") or choice.get("id") or "")
            votes = int_text(choice.get("totalVotes"))
            if choice_id == harris_choice_id:
                harris += votes
            elif choice_id == trump_choice_id:
                trump += votes
            else:
                other += votes
        return harris, trump, other, harris + trump + other

    def comparison_totals(choices: list[dict[str, Any]]) -> tuple[int, int, int]:
        dem = 0
        rep = 0
        total = 0
        for choice in choices or []:
            votes = int_text(choice.get("totalVotes"))
            total += votes
            party_id = str(choice.get("partyID") or choice.get("partyId") or "")
            if party_id == dem_party_id:
                dem += votes
            elif party_id == rep_party_id:
                rep += votes
        return dem, rep, total

    president = (federal_results.get("response", {}).get("contests") or {}).get(president_contest_id)
    if not president:
        raise ValueError(f"Arkansas federal results missing U.S. President contest {president_contest_id}")

    result_rows: list[dict[str, Any]] = []
    for location_id, location in sorted((president.get("locations") or {}).items(), key=lambda item: county_names.get(str(item[0]), "")):
        county = county_names.get(str(location_id)) or _county_name(location_id)
        harris, trump, other, total = choice_totals(location.get("choices") or [])
        if not total:
            continue
        result_rows.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {
                    "Trump": trump,
                    "Harris": harris,
                    "Other": other,
                },
                "totalVotes": total,
                "margin": trump - harris,
                "marginPct": pct(trump - harris, total),
                "sourceId": source.id,
            }
        )

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    missing_comparison_rows = 0
    for entry in sorted(county_files, key=lambda item: county_names.get(str(item.get("locationId")), "")):
        location_id = str(entry.get("locationId") or "")
        county = county_names.get(location_id) or _county_name(entry.get("countyName"))
        relative_file = str(entry.get("file") or "")
        if not relative_file:
            continue
        county_data = json.loads((source_dir / relative_file).read_text(encoding="utf-8-sig"))
        contests = county_data.get("response", {}).get("contests") or {}
        county_president = contests.get(president_contest_id)
        if not county_president:
            raise ValueError(f"Arkansas county result file missing U.S. President contest: {relative_file}")

        comparison_by_unit: dict[str, dict[str, int]] = {}
        for contest_id, contest in contests.items():
            contest_id = str(contest_id)
            if contest_id == president_contest_id:
                continue
            if comparison_contest_ids and contest_id not in comparison_contest_ids:
                continue
            for unit_id, unit in (contest.get("locations") or {}).items():
                dem, rep, total = comparison_totals(unit.get("choices") or [])
                if not total:
                    continue
                bucket = comparison_by_unit.setdefault(str(unit_id), {"dem": 0, "rep": 0, "total": 0})
                bucket["dem"] += dem
                bucket["rep"] += rep
                bucket["total"] += total

        for unit_id, unit in sorted((county_president.get("locations") or {}).items(), key=lambda item: str(item[0])):
            harris, trump, _other, total = choice_totals(unit.get("choices") or [])
            if not total:
                continue
            comparison = comparison_by_unit.get(str(unit_id), {"dem": 0, "rep": 0, "total": 0})
            has_comparison = comparison["total"] > 0
            if has_comparison:
                comparison_rows += 1
            else:
                missing_comparison_rows += 1
            review_rows.append(
                {
                    "county": county,
                    "localUnit": f"Reporting unit {unit_id}",
                    "totalVotes": total,
                    "harris": harris,
                    "trump": trump,
                    "harrisShare": pct(harris, total),
                    "trumpShare": pct(trump, total),
                    "demDropoff": pct(harris - comparison["dem"], total) if has_comparison else 0,
                    "repDropoff": pct(trump - comparison["rep"], total) if has_comparison else 0,
                    "coverageMode": section.get("comparisonCoverageMode", "presidentVsUSHouse") if has_comparison else "voteShareOnly",
                    "sourceId": source.id,
                }
            )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": section.get("comparisonContestLabel", "United States House"),
        "nativeMissingComparisonRows": missing_comparison_rows,
        **turnout_metrics,
    }
    return (
        sorted(result_rows, key=lambda item: item["jurisdictionName"]),
        sorted(review_rows, key=lambda item: (item["county"], item["localUnit"])),
        turnout_rows,
        metrics,
    )


def _wv_choice_precinct_votes(contest: ET.Element | None, party: str | None = None) -> dict[str, int]:
    votes_by_precinct: dict[str, int] = {}
    if contest is None:
        return votes_by_precinct
    for choice in contest.findall("Choice"):
        choice_party = str(choice.attrib.get("party") or "").strip().upper()
        if party is not None and choice_party != party:
            continue
        for vote_type in choice.findall("VoteType"):
            for precinct in vote_type.findall("Precinct"):
                name = str(precinct.attrib.get("name") or "").strip()
                if not name:
                    continue
                votes_by_precinct[name] = votes_by_precinct.get(name, 0) + int_text(precinct.attrib.get("votes"))
    return votes_by_precinct


def _wv_clarity_county_detailxml_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_dir = _artifact_path(source)
    if not source_dir.is_dir():
        raise ValueError(f"West Virginia county detail XML source must be a directory: {source_dir}")

    president_pattern = re.compile(section.get("presidentContestRegex", r"^U\.S\. PRESIDENT$"), re.IGNORECASE)
    comparison_pattern = re.compile(section.get("comparisonContestRegex", r"^U\.S\. SENATOR$"), re.IGNORECASE)
    result_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    turnout_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    missing_comparison_counties: list[str] = []

    for zip_path in sorted(source_dir.glob("*/detailxml.zip")):
        with zipfile.ZipFile(zip_path) as archive:
            with archive.open("detail.xml") as detail_file:
                root = ET.parse(detail_file).getroot()

        region = root.findtext("Region") or zip_path.parent.name
        county = _county_name(region)
        contests = root.findall("Contest")
        president = next((contest for contest in contests if president_pattern.search(contest.attrib.get("text", ""))), None)
        comparison = next((contest for contest in contests if comparison_pattern.search(contest.attrib.get("text", ""))), None)
        if president is None:
            raise ValueError(f"West Virginia county report missing U.S. President contest: {zip_path}")

        pres_dem = _wv_choice_precinct_votes(president, "DEM")
        pres_rep = _wv_choice_precinct_votes(president, "REP")
        pres_all = _wv_choice_precinct_votes(president)
        comp_dem = _wv_choice_precinct_votes(comparison, "DEM")
        comp_rep = _wv_choice_precinct_votes(comparison, "REP")
        comp_all = _wv_choice_precinct_votes(comparison)

        precinct_names = sorted(pres_all)
        harris = sum(pres_dem.values())
        trump = sum(pres_rep.values())
        total = sum(pres_all.values())
        other = total - harris - trump
        if total:
            result_rows.append(
                {
                    "jurisdictionName": county,
                    "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                    "level": "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )

        if comparison is None:
            missing_comparison_counties.append(county)

        voter_turnout = root.find("VoterTurnout")
        if voter_turnout is not None:
            for precinct in voter_turnout.findall("./Precincts/Precinct"):
                local_unit = str(precinct.attrib.get("name") or "").strip()
                if not local_unit:
                    continue
                turnout_rows.append(
                    {
                        "county": county,
                        "localUnit": local_unit,
                        "level": "precinct",
                        "ballotsCast": int_text(precinct.attrib.get("ballotsCast")),
                        "registeredVoters": int_text(precinct.attrib.get("totalVoters")),
                        "turnoutPct": float(precinct.attrib.get("voterTurnout") or 0),
                        "denominatorType": "registeredVoters",
                        "registrationDenominatorTiming": "officialCountyReport",
                        "warningRequired": False,
                        "sourceId": source.id,
                    }
                )

        for precinct in precinct_names:
            row_total = pres_all.get(precinct, 0)
            if not row_total:
                continue
            comparison_total = comp_all.get(precinct, 0)
            has_comparison = comparison_total > 0
            if has_comparison:
                comparison_rows += 1
            review_rows.append(
                {
                    "county": county,
                    "localUnit": precinct,
                    "totalVotes": row_total,
                    "harris": pres_dem.get(precinct, 0),
                    "trump": pres_rep.get(precinct, 0),
                    "harrisShare": pct(pres_dem.get(precinct, 0), row_total),
                    "trumpShare": pct(pres_rep.get(precinct, 0), row_total),
                    "demDropoff": pct(pres_dem.get(precinct, 0) - comp_dem.get(precinct, 0), row_total) if has_comparison else 0,
                    "repDropoff": pct(pres_rep.get(precinct, 0) - comp_rep.get(precinct, 0), row_total) if has_comparison else 0,
                    "coverageMode": section.get("comparisonCoverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                    "sourceId": source.id,
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
        "nativeComparisonContest": section.get("comparisonContestLabel", "United States Senator"),
        "nativeTurnoutRows": len(turnout_rows),
        "nativeTurnoutBallotsCast": sum(row["ballotsCast"] for row in turnout_rows),
        "nativeTurnoutRegisteredVoters": sum(row["registeredVoters"] for row in turnout_rows),
        "nativeMissingComparisonCounties": missing_comparison_counties,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), sorted(review_rows, key=lambda item: (item["county"], item["localUnit"])), sorted(turnout_rows, key=lambda item: (item["county"], item["localUnit"])), metrics

def _indiana_enr_county_json_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_path = _artifact_path(source)
    base_dir = source_path.parent
    president_data = json.loads(source_path.read_text(encoding="utf-8-sig"))
    comparison_data = json.loads((base_dir / section.get("comparisonFile", "OffCatC_1006_A.json")).read_text(encoding="utf-8-sig"))

    def regions(payload: dict[str, Any]) -> list[dict[str, Any]]:
        value = payload.get("Root", {}).get("OfficeCategory", {}).get("Regions", {}).get("Region", [])
        return value if isinstance(value, list) else [value]

    def candidate_votes(region: dict[str, Any]) -> tuple[int, int, int, int]:
        candidates = region.get("RegionSummary", {}).get("Race", {}).get("Candidates", {}).get("Candidate", [])
        candidates = candidates if isinstance(candidates, list) else [candidates]
        dem = 0
        rep = 0
        other = 0
        for candidate in candidates:
            votes = int_text(candidate.get("TOTAL"))
            party = str(candidate.get("PARTY") or "").strip().upper()
            if party == "D":
                dem += votes
            elif party == "R":
                rep += votes
            else:
                other += votes
        return dem, rep, other, dem + rep + other

    comparison_by_county: dict[str, dict[str, int]] = {}
    for region in regions(comparison_data):
        county = _county_name(region.get("MAP_JURISDICTION_NAME"))
        if not county:
            continue
        dem, rep, _other, total = candidate_votes(region)
        comparison_by_county[county] = {"dem": dem, "rep": rep, "total": total}

    result_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for region in regions(president_data):
        county = _county_name(region.get("MAP_JURISDICTION_NAME"))
        if not county:
            continue
        harris, trump, other, total = candidate_votes(region)
        if not total:
            continue
        result_row = {
            "jurisdictionName": county,
            "jurisdictionCode": str(region.get("MAP_FIPS") or "").strip(),
            "level": "county",
            "votes": {
                "Trump": trump,
                "Harris": harris,
                "Other": other,
            },
            "totalVotes": total,
            "margin": trump - harris,
            "marginPct": pct(trump - harris, total),
            "sourceId": source.id,
        }
        result_rows.append(result_row)

        comparison = comparison_by_county.get(county, {"dem": 0, "rep": 0, "total": 0})
        has_comparison = bool(comparison["total"])
        if has_comparison:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": "County total",
                "totalVotes": total,
                "harris": harris,
                "trump": trump,
                "harrisShare": pct(harris, total),
                "trumpShare": pct(trump, total),
                "demDropoff": pct(harris - comparison["dem"], total) if has_comparison else 0,
                "repDropoff": pct(trump - comparison["rep"], total) if has_comparison else 0,
                "coverageMode": section.get("comparisonCoverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": section.get("comparisonContestLabel", "United States Senator"),
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), sorted(review_rows, key=lambda item: item["county"]), turnout_rows, metrics

def _texas_vtd_zip_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    certified_total: int,
    certified_presidential_totals: dict[str, int],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["reviewCharts"]
    source = sources[section["sourceId"]]
    returns_file = section.get("returnsFile", "2024_General_Election_Returns.csv")
    president_office = section.get("presidentOffice", "President")
    comparison_office = section.get("comparisonOffice", "U.S. Sen")
    comparison_label = section.get("comparisonContest", "United States Senator")
    precincts: dict[tuple[str, str], dict[str, Any]] = {}
    vtd_presidential_totals = {"Trump": 0, "Harris": 0, "Stein": 0, "Oliver": 0, "GenericWriteIn": 0, "Other": 0}

    def values_for(row: dict[str, str]) -> dict[str, Any]:
        county = _texas_county_name(row.get("County"))
        vtd = str(row.get("VTD") or "").strip()
        key = (county, vtd)
        return precincts.setdefault(
            key,
            {
                "county": county,
                "vtd": vtd,
                "cntyvtd": str(row.get("cntyvtd") or row.get("CNTYVTD") or "").strip(),
                "vtdkey": str(row.get("vtdkeyvalue") or row.get("vtdkey") or "").strip(),
                "pres_harris": 0,
                "pres_other": 0,
                "pres_total": 0,
                "pres_trump": 0,
                "sen_dem": 0,
                "sen_other": 0,
                "sen_rep": 0,
                "sen_total": 0,
            },
        )

    with zipfile.ZipFile(_artifact_path(source)) as archive, archive.open(returns_file) as handle:
        reader = csv.DictReader((line.decode("utf-8-sig") for line in handle))
        required = {"County", "VTD", "Office", "Party", "Votes"}
        missing = sorted(required.difference(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Texas VTD returns CSV missing columns: {', '.join(missing)}")

        for row in reader:
            office = str(row.get("Office") or "").strip()
            if office not in {president_office, comparison_office}:
                continue
            values = values_for(row)
            votes = int_text(row.get("Votes"))
            party = str(row.get("Party") or "").strip().upper()
            if office == president_office:
                name = str(row.get("Name") or "").strip().upper()
                if party == "D":
                    values["pres_harris"] += votes
                    vtd_presidential_totals["Harris"] += votes
                elif party == "R":
                    values["pres_trump"] += votes
                    vtd_presidential_totals["Trump"] += votes
                else:
                    values["pres_other"] += votes
                    vtd_presidential_totals["Other"] += votes
                    if name == "STEIN":
                        vtd_presidential_totals["Stein"] += votes
                    elif name == "OLIVER":
                        vtd_presidential_totals["Oliver"] += votes
                    elif party == "W" or name == "WRITE-IN":
                        vtd_presidential_totals["GenericWriteIn"] += votes
                values["pres_total"] += votes
            elif party == "D":
                values["sen_dem"] += votes
                values["sen_total"] += votes
            elif party == "R":
                values["sen_rep"] += votes
                values["sen_total"] += votes
            else:
                values["sen_other"] += votes
                values["sen_total"] += votes

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for values in sorted(precincts.values(), key=lambda item: (item["county"], item["vtd"])):
        total = values["pres_total"]
        if not total:
            continue
        has_senate = bool(values["sen_total"])
        if has_senate:
            comparison_rows += 1
        local_unit = f"VTD {values['vtd']}"
        local_keys = [part for part in [values["cntyvtd"], values["vtdkey"]] if part]
        if local_keys:
            local_unit += f" ({'; '.join(local_keys)})"
        review_rows.append(
            {
                "county": values["county"],
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - values["sen_dem"], total) if has_senate else 0,
                "repDropoff": pct(values["pres_trump"] - values["sen_rep"], total) if has_senate else 0,
                "coverageMode": "presidentVsSenate" if has_senate else "voteShareOnly",
                "comparisonContest": comparison_label,
                "comparisonDemVotes": values["sen_dem"],
                "comparisonRepVotes": values["sen_rep"],
                "comparisonOtherVotes": values["sen_other"],
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    turnout_section = config.raw.get("turnout", {})
    if turnout_section.get("format") == "texasVtdZipVrto":
        turnout_source = sources[turnout_section["sourceId"]]
        vrto_file = turnout_section.get("vrtoFile", "2024_General_Election_VRTO.csv")
        with zipfile.ZipFile(_artifact_path(turnout_source)) as archive, archive.open(vrto_file) as handle:
            reader = csv.DictReader((line.decode("utf-8-sig") for line in handle))
            required = {"County", "VTD", "CNTYVTD", "vtdkey", "TotalVR", "TotalTO"}
            missing = sorted(required.difference(reader.fieldnames or []))
            if missing:
                raise ValueError(f"Texas VTD VRTO CSV missing columns: {', '.join(missing)}")
            for row in reader:
                county = _texas_county_name(row.get("County"))
                vtd = str(row.get("VTD") or "").strip()
                cntyvtd = str(row.get("CNTYVTD") or "").strip()
                vtdkey = str(row.get("vtdkey") or "").strip()
                registered = int_text(row.get("TotalVR"))
                ballots = int_text(row.get("TotalTO"))
                local_unit = f"VTD {vtd}"
                local_keys = [part for part in [cntyvtd, vtdkey] if part]
                if local_keys:
                    local_unit += f" ({'; '.join(local_keys)})"
                turnout_rows.append(
                    {
                        "county": county,
                        "localUnit": local_unit,
                        "ballotsCast": ballots,
                        "registeredVoters": registered,
                        "turnoutPct": pct(ballots, registered) if registered else None,
                        "denominatorType": turnout_section.get("denominatorType", "registeredVoters"),
                        "registrationDenominatorTiming": turnout_section.get("registrationDenominatorTiming", "vtdReported"),
                        "warningRequired": bool(turnout_section.get("warningRequired", False)),
                        "sourceId": turnout_source.id,
                    }
                )
        turnout_metrics = {
            "nativeTurnoutRows": len(turnout_rows),
            "nativeRegisteredVoters": sum(row["registeredVoters"] for row in turnout_rows),
            "nativeBallotsCast": sum(row["ballotsCast"] for row in turnout_rows),
            "nativeTurnoutParser": "texasVtdZipVrto",
        }

    review_presidential_total = sum(row["totalVotes"] for row in review_rows)
    certified_other = certified_presidential_totals.get("Other", 0)
    vtd_named_minor = vtd_presidential_totals["Stein"] + vtd_presidential_totals["Oliver"]
    certified_named_minor = certified_presidential_totals.get("Stein", 0) + certified_presidential_totals.get("Oliver", 0)
    metrics = {
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_label,
        "nativeReviewPresidentialVotes": review_presidential_total,
        "nativeReviewCertifiedVoteGap": certified_total - review_presidential_total,
        "nativeReviewVtdMinusCertifiedVotes": review_presidential_total - certified_total,
        "nativeReviewTrumpVtdMinusCertified": vtd_presidential_totals["Trump"] - certified_presidential_totals.get("Trump", 0),
        "nativeReviewHarrisVtdMinusCertified": vtd_presidential_totals["Harris"] - certified_presidential_totals.get("Harris", 0),
        "nativeReviewOtherVtdMinusCertified": vtd_presidential_totals["Other"] - certified_other,
        "nativeReviewNamedMinorVtdMinusCertified": vtd_named_minor - certified_named_minor,
        "nativeReviewGenericWriteInVotes": vtd_presidential_totals["GenericWriteIn"],
        "nativeCertifiedDeclaredWriteInVotes": certified_presidential_totals.get("DeclaredWriteIn", 0),
        "nativeReviewGenericWriteInOverCertifiedDeclaredWriteIns": vtd_presidential_totals["GenericWriteIn"] - certified_presidential_totals.get("DeclaredWriteIn", 0),
        **turnout_metrics,
    }
    return review_rows, turnout_rows, metrics


def _texas_county_json_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    county_data = json.loads(_artifact_path(source).read_text(encoding="utf-8-sig"))
    president_id = str(section.get("presidentRaceId", "1001"))
    comparison_id = str(section.get("comparisonRaceId", "7958"))

    def party_votes(race: dict[str, Any]) -> tuple[int, int, int, int]:
        dem = 0
        rep = 0
        other = 0
        total = int_text(race.get("T"))
        for candidate in race.get("C", {}).values():
            votes = int_text(candidate.get("V"))
            party = str(candidate.get("P") or "").strip().upper()
            if party == "DEM":
                dem += votes
            elif party == "REP":
                rep += votes
            else:
                other += votes
        parsed_total = dem + rep + other
        return dem, rep, other, total or parsed_total

    result_rows: list[dict[str, Any]] = []
    comparison_by_county: dict[str, dict[str, int]] = {}
    certified_presidential_totals = {"Trump": 0, "Harris": 0, "Other": 0, "Stein": 0, "Oliver": 0, "DeclaredWriteIn": 0}
    for fips, county in sorted(county_data.items()):
        races = county.get("Races", {})
        president = races.get(president_id)
        if not president:
            continue
        county_name = _texas_county_name(county.get("N"))
        harris, trump, other, total = party_votes(president)
        if not total:
            continue
        certified_presidential_totals["Trump"] += trump
        certified_presidential_totals["Harris"] += harris
        certified_presidential_totals["Other"] += other
        for candidate in president.get("C", {}).values():
            candidate_votes = int_text(candidate.get("V"))
            candidate_name = str(candidate.get("N") or "").upper()
            candidate_party = str(candidate.get("P") or "").strip().upper()
            if candidate_party == "W":
                certified_presidential_totals["DeclaredWriteIn"] += candidate_votes
            elif "JILL STEIN" in candidate_name:
                certified_presidential_totals["Stein"] += candidate_votes
            elif "CHASE OLIVER" in candidate_name:
                certified_presidential_totals["Oliver"] += candidate_votes
        result_rows.append(
            {
                "jurisdictionName": county_name,
                "jurisdictionCode": str(fips),
                "level": "county",
                "votes": {
                    "Trump": trump,
                    "Harris": harris,
                    "Other": other,
                },
                "totalVotes": total,
                "margin": trump - harris,
                "marginPct": pct(trump - harris, total),
                "sourceId": source.id,
            }
        )

        comparison = races.get(comparison_id)
        if comparison:
            dem, rep, _other, comparison_total = party_votes(comparison)
            comparison_by_county[county_name] = {"dem": dem, "rep": rep, "total": comparison_total}

    if config.raw.get("reviewCharts", {}).get("format") == "texasVtdZipPrecinctComparison":
        review_rows, turnout_rows, review_metrics = _texas_vtd_zip_rows(
            config,
            sources,
            sum(row["totalVotes"] for row in result_rows),
            certified_presidential_totals,
        )
    else:
        review_rows = []
        comparison_rows = 0
        for row in sorted(result_rows, key=lambda item: item["jurisdictionName"]):
            county = row["jurisdictionName"]
            total = row["totalVotes"]
            comparison = comparison_by_county.get(county, {"dem": 0, "rep": 0, "total": 0})
            has_comparison = bool(comparison["total"])
            if has_comparison:
                comparison_rows += 1
            review_rows.append(
                {
                    "county": county,
                    "localUnit": "County total",
                    "totalVotes": total,
                    "harris": row["votes"]["Harris"],
                    "trump": row["votes"]["Trump"],
                    "harrisShare": pct(row["votes"]["Harris"], total),
                    "trumpShare": pct(row["votes"]["Trump"], total),
                    "demDropoff": pct(row["votes"]["Harris"] - comparison["dem"], total) if has_comparison else 0,
                    "repDropoff": pct(row["votes"]["Trump"] - comparison["rep"], total) if has_comparison else 0,
                    "coverageMode": section.get("comparisonCoverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                    "sourceId": source.id,
                }
            )

        turnout_rows = []
        turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
        if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
            turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)
        review_metrics = {
            "nativeReviewRows": len(review_rows),
            "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
            "nativeComparisonRows": comparison_rows,
            "nativeComparisonContest": section.get("comparisonContestLabel", "United States Senator"),
            **turnout_metrics,
        }

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        **review_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics

class _HtmlTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._in_row = False
        self._in_cell = False
        self._current_row: list[str] = []
        self._current_cell: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "tr":
            self._in_row = True
            self._current_row = []
        elif tag.lower() in {"td", "th"} and self._in_row:
            self._in_cell = True
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._in_cell:
            text = " ".join("".join(self._current_cell).split())
            self._current_row.append(text)
            self._in_cell = False
        elif tag == "tr" and self._in_row:
            if self._current_row:
                self.rows.append(self._current_row)
            self._in_row = False


class _DelawareReportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[dict[str, Any]] = []
        self.section = ""
        self.contest = ""
        self.unit = ""
        self._heading: tuple[str, str] | None = None
        self._heading_text: list[str] = []
        self._table: list[list[str]] = []
        self._row: list[str] = []
        self._cell: list[str] = []
        self._in_row = False
        self._in_cell = False
        self._in_table = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {name: value or "" for name, value in attrs}
        if tag in {"h2", "h3", "h4"}:
            self._heading = (tag, attr_map.get("class", ""))
            self._heading_text = []
        elif tag == "table":
            self._in_table = True
            self._table = []
        elif tag == "tr" and self._in_table:
            self._in_row = True
            self._row = []
        elif tag in {"td", "th"} and self._in_row:
            self._in_cell = True
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._heading:
            self._heading_text.append(data)
        if self._in_cell:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._heading and tag == self._heading[0]:
            heading_tag, class_name = self._heading
            text = " ".join("".join(self._heading_text).split())
            if heading_tag == "h2":
                self.section = text
                self.contest = ""
                self.unit = ""
            elif "contest-title" in class_name:
                self.contest = text
                self.unit = ""
            elif heading_tag == "h4":
                self.unit = text
            self._heading = None
        elif tag in {"td", "th"} and self._in_cell:
            self._row.append(" ".join("".join(self._cell).split()))
            self._in_cell = False
        elif tag == "tr" and self._in_row:
            if self._row:
                self._table.append(self._row)
            self._in_row = False
        elif tag == "table" and self._in_table:
            if self._table:
                self.tables.append(
                    {
                        "section": self.section,
                        "contest": self.contest,
                        "unit": self.unit,
                        "rows": self._table,
                    }
                )
            self._in_table = False


DELAWARE_COUNTY_COLUMNS = {
    "New Castle": "New Castle County",
    "Kent": "Kent County",
    "Sussex": "Sussex County",
}


def _delaware_report_tables(source: SourceConfig) -> list[dict[str, Any]]:
    parser = _DelawareReportParser()
    parser.feed(_artifact_path(source).read_text(encoding="utf-8-sig"))
    return parser.tables


def _delaware_party_bucket(party: Any) -> str:
    normalized = " ".join(str(party or "").lower().split())
    if "democratic" in normalized or normalized == "democrat":
        return "dem"
    if "republican" in normalized:
        return "rep"
    return "other"


def _delaware_table_totals(rows: list[list[str]], column: str = "Total Votes") -> dict[str, int]:
    if not rows:
        return {"dem": 0, "rep": 0, "other": 0, "total": 0}
    columns = _column_index(rows[0])
    if column not in columns:
        raise ValueError(f"Delaware report table missing {column!r} column")

    totals = {"dem": 0, "rep": 0, "other": 0, "total": 0}
    party_index = columns.get("Party", 1)
    for row in rows[1:]:
        if len(row) <= columns[column]:
            continue
        votes = int_text(row[columns[column]])
        bucket = _delaware_party_bucket(row[party_index] if len(row) > party_index else "")
        totals[bucket] += votes
        totals["total"] += votes
    return totals


def _delaware_election_district_counties(source: SourceConfig) -> dict[str, str]:
    current_county = ""
    district_counties: dict[str, str] = {}
    for raw_line in _artifact_path(source).read_text(encoding="utf-8-sig").splitlines():
        line = " ".join(raw_line.strip().split())
        if line in {"KENT COUNTY", "NEW CASTLE COUNTY", "SUSSEX COUNTY"}:
            current_county = line.title()
            continue
        if line.startswith("Representative District "):
            continue
        match = re.fullmatch(r"Election District (\d{2}-\d{2})", line)
        if match and current_county:
            district_counties[f"Election District {match.group(1)}"] = current_county
    return district_counties


def _delaware_official_report_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    tables = _delaware_report_tables(source)

    county_table = next(
        (
            table
            for table in tables
            if table["section"] == "By County"
            and table["contest"] == section.get("contest", "President and Vice President")
        ),
        None,
    )
    if not county_table:
        raise ValueError("Delaware report is missing By County President table")

    result_rows: list[dict[str, Any]] = []
    for column, county in DELAWARE_COUNTY_COLUMNS.items():
        totals = _delaware_table_totals(county_table["rows"], column)
        result_rows.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {
                    "Trump": totals["rep"],
                    "Harris": totals["dem"],
                    "Other": totals["other"],
                },
                "totalVotes": totals["total"],
                "margin": totals["rep"] - totals["dem"],
                "marginPct": pct(totals["rep"] - totals["dem"], totals["total"]),
                "sourceId": source.id,
            }
        )

    review_section = config.raw.get("reviewCharts", {})
    comparison_section = config.raw.get("comparisonContest", {})
    county_map_source_id = review_section.get("countyMapSourceId")
    district_counties = (
        _delaware_election_district_counties(sources[county_map_source_id])
        if county_map_source_id
        else {}
    )
    president_by_district = {
        table["unit"]: _delaware_table_totals(table["rows"])
        for table in tables
        if table["section"] == review_section.get("section", "By Election District")
        and table["contest"] == review_section.get("contest", "President and Vice President")
    }
    comparison_by_district = {
        table["unit"]: _delaware_table_totals(table["rows"])
        for table in tables
        if table["section"] == review_section.get("section", "By Election District")
        and table["contest"] == comparison_section.get("contest", "U.S. Senator")
    }

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    missing_county_units: list[str] = []
    for unit in sorted(president_by_district):
        president = president_by_district[unit]
        if not president["total"]:
            continue
        county = district_counties.get(unit)
        if not county:
            missing_county_units.append(unit)
            county = "Unknown County"
        comparison = comparison_by_district.get(unit)
        has_comparison = bool(comparison and comparison["total"])
        if has_comparison:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": unit,
                "totalVotes": president["total"],
                "harris": president["dem"],
                "trump": president["rep"],
                "harrisShare": pct(president["dem"], president["total"]),
                "trumpShare": pct(president["rep"], president["total"]),
                "demDropoff": pct(president["dem"] - comparison["dem"], president["total"]) if has_comparison else 0,
                "repDropoff": pct(president["rep"] - comparison["rep"], president["total"]) if has_comparison else 0,
                "coverageMode": review_section.get("comparisonCoverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                "comparisonContest": comparison_section.get("label", "U.S. Senator") if has_comparison else "",
                "comparisonDemVotes": comparison["dem"] if has_comparison else 0,
                "comparisonRepVotes": comparison["rep"] if has_comparison else 0,
                "comparisonOtherVotes": comparison["other"] if has_comparison else 0,
                "sourceId": source.id,
            }
        )

    if missing_county_units:
        raise ValueError(
            "Delaware AGP county crosswalk is missing election districts: "
            + ", ".join(missing_county_units[:10])
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_section.get("label", "U.S. Senator"),
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics



def _florida_extract_totals(source: SourceConfig) -> dict[str, Any]:
    with _artifact_path(source).open("r", encoding="latin-1", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="	"))

    president_by_county: dict[str, dict[str, int]] = {}
    senate_by_county: dict[str, dict[str, int]] = {}
    race_codes = set()
    president_rows = 0
    senate_rows = 0

    for row in rows:
        race_code = str(row.get("RaceCode", "")).strip().upper()
        race_codes.add(race_code)
        county = _county_name(row.get("CountyName", ""))
        if not county:
            continue
        party = str(row.get("PartyCode", "")).strip().upper()
        votes = int_text(row.get("CanVotes"))

        if race_code == "PRE":
            president_rows += 1
            current = president_by_county.setdefault(county, {"Trump": 0, "Harris": 0, "Other": 0})
            if party == "REP":
                current["Trump"] += votes
            elif party == "DEM":
                current["Harris"] += votes
            else:
                current["Other"] += votes
        elif race_code == "USS":
            senate_rows += 1
            current = senate_by_county.setdefault(county, {"REP": 0, "DEM": 0})
            if party in current:
                current[party] += votes

    return {
        "rows": rows,
        "raceCodes": sorted(code for code in race_codes if code),
        "presidentByCounty": president_by_county,
        "senateByCounty": senate_by_county,
        "presidentRows": president_rows,
        "senateRows": senate_rows,
    }


def _verify_florida_extract(
    review_section: dict[str, Any],
    sources: dict[str, SourceConfig],
    result_rows: list[dict[str, Any]],
    review_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    source_id = review_section.get("verificationSourceId")
    if not source_id:
        return {}

    extract = _florida_extract_totals(sources[source_id])
    president_by_county = extract["presidentByCounty"]
    senate_by_county = extract["senateByCounty"]
    mismatches: list[str] = []

    for row in result_rows:
        county = row["jurisdictionName"]
        expected = president_by_county.get(county)
        if expected != row["votes"]:
            mismatches.append(f"{county} presidential extract mismatch")

    for row in review_rows:
        county = row["county"]
        expected = senate_by_county.get(county)
        if not expected:
            mismatches.append(f"{county} senate extract missing")
            continue
        if expected["DEM"] != row.get("comparisonDemVotes") or expected["REP"] != row.get("comparisonRepVotes"):
            mismatches.append(f"{county} senate extract mismatch")

    if mismatches:
        preview = "; ".join(mismatches[:6])
        raise ValueError(f"Florida official extract verification failed: {preview}")

    return {
        "nativeExtractRows": len(extract["rows"]),
        "nativeExtractRaceCount": len(extract["raceCodes"]),
        "nativeExtractPresidentRows": extract["presidentRows"],
        "nativeExtractSenateRows": extract["senateRows"],
        "nativeExtractCountyCount": len(president_by_county),
        "nativeExtractSourceId": source_id,
        "nativeExtractVerificationPassed": True,
        "nativeCountyDistributionAnalysis": bool(review_section.get("countyDistributionAnalysis")),
    }

def _florida_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]

    parser = _HtmlTableParser()
    parser.feed(_artifact_path(source).read_text(encoding="utf-8", errors="replace"))

    result_rows: list[dict[str, Any]] = []
    for row in parser.rows:
        if len(row) < 10:
            continue
        label = " ".join(str(row[0]).strip().split()).lower()
        if label in {"county", "total", "% votes"}:
            continue
        county = _county_name(row[0])
        if not county:
            continue
        trump = int_text(row[1])
        harris = int_text(row[2])
        other = sum(int_text(value) for value in row[3:])
        total = trump + harris + other
        if not total:
            continue
        result_rows.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {
                    "Trump": trump,
                    "Harris": harris,
                    "Other": other,
                },
                "totalVotes": total,
                "margin": trump - harris,
                "marginPct": pct(trump - harris, total),
                "sourceId": source.id,
            }
        )

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    review_section = config.raw.get("reviewCharts", {})
    if review_section.get("format") == "floridaDetailHtmlCountyComparison":
        review_source = sources[review_section["sourceId"]]
        review_parser = _HtmlTableParser()
        review_parser.feed(_artifact_path(review_source).read_text(encoding="utf-8", errors="replace"))
        header = next((row for row in review_parser.rows if row and row[0].strip().lower() == "county"), [])
        header_lower = [cell.lower() for cell in header]

        def candidate_index(needle: str) -> int:
            needle_lower = needle.lower()
            for index, label in enumerate(header_lower):
                if needle_lower in label:
                    return index
            raise ValueError(f"Florida comparison source missing candidate column containing {needle!r}")

        rep_index = candidate_index(review_section["repCandidateContains"])
        dem_index = candidate_index(review_section["demCandidateContains"])
        president_by_county = {row["jurisdictionName"]: row for row in result_rows}

        for row in review_parser.rows:
            if len(row) <= max(rep_index, dem_index):
                continue
            label = " ".join(str(row[0]).strip().split()).lower()
            if label in {"county", "total", "% votes"}:
                continue
            county = _county_name(row[0])
            president = president_by_county.get(county)
            if not county or not president:
                continue
            comparison_rep = int_text(row[rep_index])
            comparison_dem = int_text(row[dem_index])
            if not comparison_rep and not comparison_dem:
                continue
            total = president["totalVotes"]
            comparison_rows += 1
            review_rows.append(
                {
                    "county": county,
                    "localUnit": county,
                    "totalVotes": total,
                    "harris": president["votes"]["Harris"],
                    "trump": president["votes"]["Trump"],
                    "harrisShare": pct(president["votes"]["Harris"], total),
                    "trumpShare": pct(president["votes"]["Trump"], total),
                    "demDropoff": pct(president["votes"]["Harris"] - comparison_dem, total),
                    "repDropoff": pct(president["votes"]["Trump"] - comparison_rep, total),
                    "coverageMode": review_section.get("coverageMode", "presidentVsSenate"),
                    "comparisonContest": review_section.get("comparisonContest", ""),
                    "comparisonDemVotes": comparison_dem,
                    "comparisonRepVotes": comparison_rep,
                    "sourceId": review_source.id,
                }
            )

    verification_metrics = _verify_florida_extract(review_section, sources, result_rows, review_rows)

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": review_section.get("comparisonContest", ""),
        **verification_metrics,
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), sorted(review_rows, key=lambda item: item["county"]), turnout_rows, metrics


def _virginia_title(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    titled = text.title() if text.isupper() else text
    return (
        titled.replace(" Of ", " of ")
        .replace(" And ", " and ")
        .replace(" & ", " and ")
        .replace("'S", "'s")
        .replace("F.T.", "F.T.")
    )


def _virginia_enr_vote_count(row: dict[str, str]) -> int:
    return int_text(row.get("TOTAL_VOTES")) + int_text(row.get("WriteInVote"))


def _virginia_enr_review_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("reviewCharts", {})
    if section.get("format") != "virginiaEnrElectionResultsCsv":
        return [], {"nativeComparisonRows": 0, "nativeComparisonContest": None}

    source = sources[section["sourceId"]]
    president_office = section.get("presidentOffice", "President and Vice President")
    comparison_office = section.get("comparisonOffice", "Member, United States Senate")
    dem_candidates = set(section.get("demCandidates", ["Kamala D. Harris", "Timothy M. Kaine"]))
    rep_candidates = set(section.get("repCandidates", ["Donald J. Trump", "Hung Cao"]))
    required = {
        "CandidateName",
        "TOTAL_VOTES",
        "WriteInVote",
        "LocalityName",
        "PrecinctId",
        "PrecinctName",
        "OfficeTitle",
    }
    grouped: dict[tuple[str, str, str], dict[str, int]] = {}

    with _artifact_path(source).open("r", encoding=section.get("encoding", "cp1252"), newline="") as handle:
        reader = csv.DictReader(handle)
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Virginia ENR election results CSV missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            office = str(row.get("OfficeTitle") or "").strip()
            if office not in {president_office, comparison_office}:
                continue
            county = _virginia_title(row.get("LocalityName"))
            precinct_id = str(row.get("PrecinctId") or "").strip()
            precinct_name = _virginia_title(row.get("PrecinctName"))
            if not county or not precinct_name:
                continue
            candidate = str(row.get("CandidateName") or "").strip()
            votes = _virginia_enr_vote_count(row)
            prefix = "pres" if office == president_office else "comparison"
            values = grouped.setdefault(
                (county, precinct_id, precinct_name),
                {
                    "pres_dem": 0,
                    "pres_other": 0,
                    "pres_rep": 0,
                    "pres_total": 0,
                    "comparison_dem": 0,
                    "comparison_other": 0,
                    "comparison_rep": 0,
                    "comparison_total": 0,
                },
            )
            if candidate in dem_candidates:
                bucket = "dem"
            elif candidate in rep_candidates:
                bucket = "rep"
            else:
                bucket = "other"
            values[f"{prefix}_{bucket}"] += votes
            values[f"{prefix}_total"] += votes

    output: list[dict[str, Any]] = []
    comparison_rows = 0
    missing_comparison_rows = 0
    for county, precinct_id, precinct_name in sorted(grouped):
        values = grouped[(county, precinct_id, precinct_name)]
        total = values["pres_total"]
        if not total:
            continue
        has_comparison = values["comparison_total"] > 0
        if has_comparison:
            comparison_rows += 1
        else:
            missing_comparison_rows += 1
        output.append(
            {
                "county": county,
                "localUnit": precinct_name,
                "totalVotes": total,
                "harris": values["pres_dem"],
                "trump": values["pres_rep"],
                "harrisShare": pct(values["pres_dem"], total),
                "trumpShare": pct(values["pres_rep"], total),
                "demDropoff": pct(values["pres_dem"] - values["comparison_dem"], total) if has_comparison else 0,
                "repDropoff": pct(values["pres_rep"] - values["comparison_rep"], total) if has_comparison else 0,
                "coverageMode": section.get("coverageMode", "presidentVsSenate") if has_comparison else "voteShareOnly",
                "comparisonContest": section.get("comparisonContest", "Member, United States Senate") if has_comparison else "",
                "comparisonDemVotes": values["comparison_dem"],
                "comparisonRepVotes": values["comparison_rep"],
                "comparisonOtherVotes": values["comparison_other"],
                "sourceId": source.id,
            }
        )

    return output, {
        "nativeReviewRows": len(output),
        "nativeReviewWarning": section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeMissingComparisonRows": missing_comparison_rows,
        "nativeComparisonContest": section.get("comparisonContest", "Member, United States Senate") if comparison_rows else None,
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in output),
    }


def _virginia_enr_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("turnout", {})
    if section.get("format") != "virginiaEnrTurnoutCsv":
        return [], {"nativeTurnoutRows": 0}

    source = sources[section["sourceId"]]
    required = {
        "locality",
        "precinct",
        "TotalVoteTurnout",
        "ActiveRegisteredVoters",
        "InactiveRegisteredVoters",
        "TotalRegisteredVoters",
    }
    output: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Virginia ENR turnout CSV missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            county = _virginia_title(row.get("locality"))
            local_unit = _virginia_title(row.get("precinct"))
            if not county or not local_unit:
                continue
            ballots = int_text(row.get("TotalVoteTurnout"))
            registered = int_text(row.get("TotalRegisteredVoters"))
            output.append(
                {
                    "county": county,
                    "localUnit": local_unit,
                    "level": section.get("sourceLevel", "precinct"),
                    "ballotsCast": ballots,
                    "registeredVoters": registered,
                    "turnoutPct": pct(ballots, registered) if registered else None,
                    "denominatorType": section.get("denominatorType", "registeredVoters"),
                    "registrationDenominatorTiming": section.get("registrationDenominatorTiming", "officialEnrFinal"),
                    "warningRequired": bool(section.get("warningRequired", False)),
                    "sourceId": source.id,
                }
            )

    totals = {
        "nativeTurnoutRows": len(output),
        "nativeBallotsCast": sum(row["ballotsCast"] for row in output),
        "nativeRegisteredVoters": sum(row["registeredVoters"] for row in output),
    }
    return output, totals


def _virginia_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    candidate_columns = section.get(
        "candidateColumns",
        {
            "harris": "Kamala D. Harris",
            "trump": "Donald J. Trump",
            "other": [
                "Jill E. Stein",
                "Chase R. Oliver",
                "Cornel R. West",
                "Claudia De la Cruz",
                "Write-Ins",
            ],
        },
    )

    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    if len(rows) < 3:
        raise ValueError("Virginia contest CSV has too few rows")

    header = [str(value).strip() for value in rows[0]]
    candidate_index = {name: index for index, name in enumerate(header) if name}
    required_candidates = [
        candidate_columns["harris"],
        candidate_columns["trump"],
        *candidate_columns.get("other", []),
        section.get("totalColumn", "Total Votes Cast"),
    ]
    missing = [name for name in required_candidates if name not in candidate_index]
    if missing:
        raise ValueError(f"Virginia contest CSV missing columns: {', '.join(missing)}")

    harris_index = candidate_index[candidate_columns["harris"]]
    trump_index = candidate_index[candidate_columns["trump"]]
    other_indexes = [candidate_index[name] for name in candidate_columns.get("other", [])]
    total_index = candidate_index[section.get("totalColumn", "Total Votes Cast")]

    result_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    current_locality = ""
    state_values: dict[str, int] | None = None

    for index, row in enumerate(rows[2:], start=3):
        if len(row) <= total_index:
            continue
        row_type = str(row[0] if row else "").strip()
        name = str(row[1] if len(row) > 1 else "").strip()
        if not row_type or not name:
            continue

        harris = int_text(row[harris_index])
        trump = int_text(row[trump_index])
        other = sum(int_text(row[column]) for column in other_indexes)
        total = int_text(row[total_index])
        if total != harris + trump + other:
            raise ValueError(f"Virginia contest row {index} total mismatch for {name}: {total} != {harris + trump + other}")

        if row_type == "State":
            state_values = {"harris": harris, "other": other, "total": total, "trump": trump}
        elif row_type == "Locality":
            current_locality = name
            result_rows.append(
                {
                    "jurisdictionName": name,
                    "jurisdictionCode": name.upper().replace(" COUNTY", "").replace(" CITY", ""),
                    "level": "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )
        elif row_type == "Precinct":
            if not current_locality:
                raise ValueError(f"Virginia precinct row {index} appears before a locality row")
            if not total:
                continue
            review_rows.append(
                {
                    "county": current_locality,
                    "localUnit": name,
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

    local_values = {
        "harris": sum(row["votes"]["Harris"] for row in result_rows),
        "other": sum(row["votes"]["Other"] for row in result_rows),
        "total": sum(row["totalVotes"] for row in result_rows),
        "trump": sum(row["votes"]["Trump"] for row in result_rows),
    }
    if state_values and local_values != state_values:
        raise ValueError(f"Virginia locality totals do not match State row: {local_values} != {state_values}")

    enr_review_rows, enr_review_metrics = _virginia_enr_review_rows(config, sources)
    if enr_review_rows:
        review_rows = enr_review_rows

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") == "virginiaEnrTurnoutCsv":
        turnout_rows, turnout_metrics = _virginia_enr_turnout_rows(config, sources)
    elif config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": local_values["total"],
        "nativeTrumpVotes": local_values["trump"],
        "nativeHarrisVotes": local_values["harris"],
        "nativeOtherVotes": local_values["other"],
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": 0,
        "nativeComparisonContest": None,
        **enr_review_metrics,
        **turnout_metrics,
    }
    return sorted(result_rows, key=lambda item: item["jurisdictionName"]), review_rows, turnout_rows, metrics


def _washington_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_section = config.raw["certifiedResults"]
    review_section = config.raw["reviewCharts"]
    comparison_section = config.raw.get("comparisonContest", {})
    result_source = sources[result_section["sourceId"]]
    review_source = sources[review_section["sourceId"]]
    statewide_source_id = result_section.get("statewideSourceId")
    candidate_rules = result_section.get("candidateRules", {})
    dem_needles = candidate_rules.get("harris", ["Kamala"])
    rep_needles = candidate_rules.get("trump", ["Donald"])

    counties: dict[str, dict[str, int]] = {}
    with _artifact_path(result_source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"County", "Race", "Candidate", "Votes"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Washington county source missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            if str(row.get("Race") or "").strip() != result_section.get("presidentContest", "United States President/Vice President"):
                continue
            county = _county_name(row.get("County"))
            if not county:
                continue
            votes = int_text(row.get("Votes"))
            bucket = _candidate_bucket(str(row.get("Candidate") or ""), dem_needles, rep_needles)
            values = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
            if bucket == "dem":
                values["harris"] += votes
            elif bucket == "rep":
                values["trump"] += votes
            else:
                values["other"] += votes
            values["total"] += votes

    if statewide_source_id:
        statewide_source = sources[statewide_source_id]
        statewide = {"harris": 0, "other": 0, "total": 0, "trump": 0}
        with _artifact_path(statewide_source).open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            required = {"Race", "Candidate", "Votes"}
            missing = required.difference(reader.fieldnames or [])
            if missing:
                raise ValueError(f"Washington statewide source missing columns: {', '.join(sorted(missing))}")

            for row in reader:
                if str(row.get("Race") or "").strip() != result_section.get("statewidePresidentContest", "President/Vice President"):
                    continue
                votes = int_text(row.get("Votes"))
                bucket = _candidate_bucket(str(row.get("Candidate") or ""), dem_needles, rep_needles)
                if bucket == "dem":
                    statewide["harris"] += votes
                elif bucket == "rep":
                    statewide["trump"] += votes
                else:
                    statewide["other"] += votes
                statewide["total"] += votes

        county_totals = {
            "harris": sum(values["harris"] for values in counties.values()),
            "other": sum(values["other"] for values in counties.values()),
            "total": sum(values["total"] for values in counties.values()),
            "trump": sum(values["trump"] for values in counties.values()),
        }
        if county_totals != statewide:
            raise ValueError(f"Washington county totals do not match statewide export: {county_totals} != {statewide}")

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
        for county, values in sorted(counties.items())
        if values["total"]
    ]

    precincts: dict[tuple[str, str, str], dict[str, int]] = {}
    senate_dem_needles = comparison_section.get("democraticCandidateContains", ["Maria Cantwell"])
    senate_rep_needles = comparison_section.get("republicanCandidateContains", ["Raul Garcia"])
    with _artifact_path(review_source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Race", "CountyCode", "Candidate", "PrecinctName", "PrecinctCode", "Votes"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Washington precinct source missing columns: {', '.join(sorted(missing))}")

        contests = {
            review_section.get("presidentContest", "President/Vice President"),
            comparison_section.get("contestName", "U.S. Senator"),
        }
        for row in reader:
            race = str(row.get("Race") or "").strip()
            if race not in contests:
                continue
            precinct_code = str(row.get("PrecinctCode") or "").strip()
            precinct_name = str(row.get("PrecinctName") or "").strip()
            if precinct_code == "-1" or precinct_name.lower() == "total":
                continue
            county_code = str(row.get("CountyCode") or "").strip().upper()
            county = WASHINGTON_COUNTY_CODES.get(county_code)
            if not county:
                raise ValueError(f"unknown Washington county code in precinct source: {county_code!r}")

            key = (county, precinct_code, precinct_name)
            values = precincts.setdefault(
                key,
                {
                    "pres_harris": 0,
                    "pres_other": 0,
                    "pres_total": 0,
                    "pres_trump": 0,
                    "sen_dem": 0,
                    "sen_rep": 0,
                    "sen_total": 0,
                },
            )
            votes = int_text(row.get("Votes"))
            candidate = str(row.get("Candidate") or "")

            if race == review_section.get("presidentContest", "President/Vice President"):
                bucket = _candidate_bucket(candidate, dem_needles, rep_needles)
                if bucket == "dem":
                    values["pres_harris"] += votes
                elif bucket == "rep":
                    values["pres_trump"] += votes
                else:
                    values["pres_other"] += votes
                values["pres_total"] += votes
            else:
                bucket = _candidate_bucket(candidate, senate_dem_needles, senate_rep_needles)
                if bucket == "dem":
                    values["sen_dem"] += votes
                elif bucket == "rep":
                    values["sen_rep"] += votes
                values["sen_total"] += votes

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for (county, precinct_code, precinct_name), values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        has_senate = bool(values["sen_total"])
        if has_senate:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": f"{precinct_name} ({precinct_code})",
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - values["sen_dem"], total) if has_senate else 0,
                "repDropoff": pct(values["pres_trump"] - values["sen_rep"], total) if has_senate else 0,
                "coverageMode": "presidentVsSenate" if has_senate else "voteShareOnly",
                "sourceId": review_source.id,
            }
        )

    certified_total = sum(row["totalVotes"] for row in result_rows)
    review_presidential_total = sum(row["totalVotes"] for row in review_rows)
    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": certified_total,
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_section.get("label"),
        "nativeReviewPresidentialVotes": review_presidential_total,
        "nativeReviewCertifiedVoteGap": certified_total - review_presidential_total,
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics


def _wisconsin_turnout_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("turnout")
    if not section:
        return [], {"nativeTurnoutRows": 0}

    if section.get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        return _normalized_turnout_rows(config, sources)

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



def _montana_precinct_xlsx_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "Sheet1"))
    if len(rows) < 2:
        raise ValueError("Montana precinct workbook has too few rows")

    columns = _column_index(rows[0])
    required = ["County ID", "CountyName", "PrecinctName", "Race Name", "Last Name", "Party", "Votes"]
    missing = [name for name in required if name not in columns]
    if missing:
        raise ValueError(f"Montana precinct source missing columns: {', '.join(missing)}")

    president_contest = section.get("presidentContest", "PRESIDENT & VICE PRESIDENT")
    comparison_section = config.raw.get("reviewCharts", {})
    senate_contest = comparison_section.get("comparisonContest", "UNITED STATES SENATOR")
    certified_totals = section.get("statewideTotals", {})

    counties: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str, str], dict[str, int]] = {}

    for row in rows[1:]:
        race = str(_row_value(row, columns, "Race Name") or "").strip()
        if race not in {president_contest, senate_contest}:
            continue

        county = _county_name(_row_value(row, columns, "CountyName"))
        if not county:
            continue
        county_id = str(_row_value(row, columns, "County ID") or "").strip()
        precinct_name = str(_row_value(row, columns, "PrecinctName") or "").strip()
        if not precinct_name:
            continue

        key = (county, county_id, precinct_name)
        values = precincts.setdefault(
            key,
            {
                "pres_harris": 0,
                "pres_other": 0,
                "pres_total": 0,
                "pres_trump": 0,
                "sen_dem": 0,
                "sen_other": 0,
                "sen_rep": 0,
                "sen_total": 0,
            },
        )
        votes = int_text(_row_value(row, columns, "Votes"))
        party = str(_row_value(row, columns, "Party") or "").strip().upper()
        last = str(_row_value(row, columns, "Last Name") or "").strip().upper()

        if race == president_contest:
            bucket = counties.setdefault(county, {"harris": 0, "other": 0, "total": 0, "trump": 0})
            if party == "DEM" or last == "HARRIS":
                bucket["harris"] += votes
                values["pres_harris"] += votes
            elif party == "REP" or last == "TRUMP":
                bucket["trump"] += votes
                values["pres_trump"] += votes
            else:
                bucket["other"] += votes
                values["pres_other"] += votes
            bucket["total"] += votes
            values["pres_total"] += votes
        else:
            if party == "DEM" or last == "TESTER":
                values["sen_dem"] += votes
            elif party == "REP" or last == "SHEEHY":
                values["sen_rep"] += votes
            else:
                values["sen_other"] += votes
            values["sen_total"] += votes

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
        for county, values in sorted(counties.items())
        if values["total"]
    ]

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for (county, county_id, precinct_name), values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        has_senate = bool(values["sen_total"])
        if has_senate:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": f"{precinct_name} ({county_id})" if county_id else precinct_name,
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - values["sen_dem"], total) if has_senate else 0,
                "repDropoff": pct(values["pres_trump"] - values["sen_rep"], total) if has_senate else 0,
                "coverageMode": "presidentVsSenate" if has_senate else "voteShareOnly",
                "comparisonContest": senate_contest,
                "comparisonDemVotes": values["sen_dem"],
                "comparisonRepVotes": values["sen_rep"],
                "comparisonOtherVotes": values["sen_other"],
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    result_total = sum(row["totalVotes"] for row in result_rows)
    trump = sum(row["votes"]["Trump"] for row in result_rows)
    harris = sum(row["votes"]["Harris"] for row in result_rows)
    other = sum(row["votes"]["Other"] for row in result_rows)
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": result_total,
        "nativeTrumpVotes": trump,
        "nativeHarrisVotes": harris,
        "nativeOtherVotes": other,
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": senate_contest,
        "nativeStatewideCertifiedVotes": int_text(certified_totals.get("total")),
        "nativeStatewideCertifiedVoteGap": result_total - int_text(certified_totals.get("total")) if certified_totals.get("total") is not None else 0,
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics
KY_RECAP_PARTIES = {"REP", "DEM", "LIB", "KY", "KEN", "IND"}


def _ky_clean_local(line: str) -> str:
    value = re.sub(r"\s+\d[\d,]*\s+ballots cast$", "", line.strip(), flags=re.IGNORECASE)
    value = re.sub(
        r"\s+\d[\d,]*\s+of\s+[\d,]+\s+registered voters\s*=\s+[\d.]+%$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return value.strip()


def _ky_plausible_local(line: str) -> bool:
    if not line:
        return False
    first = line.split()[0]
    if first in KY_RECAP_PARTIES:
        return False
    if re.search(
        r"Results|Election|Report|Official|Statistics|Registered|Ballots|Turnout|Straight|Vote For|TOTAL|President|Representative|Page|Run ",
        line,
        re.IGNORECASE,
    ):
        return False
    return bool(re.match(r"^[A-Z]\d{3}\b", line) or re.match(r"^[A-Z]\d{3}[- ]", line))


def _ky_chunk_local(lines: list[str]) -> tuple[str, bool]:
    if lines:
        first = _ky_clean_local(lines[0])
        if _ky_plausible_local(first):
            return first, True

    for index, line in enumerate(lines):
        if re.fullmatch(r".+ County(?:,\s*KY)?", line):
            for candidate in lines[index + 1 : index + 8]:
                value = _ky_clean_local(candidate)
                if _ky_plausible_local(value):
                    return value, True

    return "__cumulative__", False


def _ky_int_tokens(value: str) -> list[int]:
    tokens: list[int] = []
    for token in value.split():
        if token.endswith("%"):
            continue
        cleaned = re.sub(r"[^\d-]", "", token)
        if cleaned not in {"", "-"}:
            tokens.append(int(cleaned))
    return tokens


def _ky_numeric_token(value: str) -> bool:
    return bool(re.fullmatch(r"-?[\d,]+(?:\.\d+%?)?", value))


def _ky_parse_candidate_row(line: str) -> tuple[str, str, int] | None:
    parts = line.split()
    if parts and parts[0] in KY_RECAP_PARTIES:
        party = parts[0]
        if len(parts) > 1 and _ky_numeric_token(parts[1]):
            totals = _ky_int_tokens(" ".join(parts[1:]))
            return party, "", totals[-1] if totals else 0
        for index, token in enumerate(parts[1:], start=1):
            if re.fullmatch(r"-?[\d,]+", token):
                return party, " ".join(parts[1:index]), int_text(token)

    match = re.search(r"\b(REP|DEM|LIB|KY|KEN|IND)\b\s+(.+)$", line)
    if not match:
        return None
    totals = _ky_int_tokens(match.group(2))
    return match.group(1), line[: match.start()].strip(), totals[-1] if totals else 0


def _ky_apply_row(target: dict[str, int], contest: str, party: str, candidate: str, total: int) -> None:
    normalized = candidate.upper()
    if contest == "president":
        if "TRUMP" in normalized or party == "REP":
            target["pres_trump"] += total
            target["pres_total"] += total
        elif "HARRIS" in normalized or party == "DEM":
            target["pres_harris"] += total
            target["pres_total"] += total
        else:
            target["pres_other"] += total
            target["pres_total"] += total
        return

    if contest == "house":
        if party == "REP":
            target["house_rep_present"] = 1
            target["house_rep"] += total
            target["house_total"] += total
        elif party == "DEM":
            target["house_dem_present"] = 1
            target["house_dem"] += total
            target["house_total"] += total
        elif total:
            target["house_other"] += total
            target["house_total"] += total


def _kentucky_empty_values() -> dict[str, int]:
    return {
        "house_dem": 0,
        "house_dem_present": 0,
        "house_other": 0,
        "house_rep": 0,
        "house_rep_present": 0,
        "house_total": 0,
        "pres_harris": 0,
        "pres_other": 0,
        "pres_total": 0,
        "pres_trump": 0,
    }


def _kentucky_general_recap_text_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_path = _artifact_path(source)
    text_files = sorted(source_path.glob("*.txt")) if source_path.is_dir() else [source_path]
    if not text_files:
        raise ValueError("Kentucky general recap text source has no text files")

    counties: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str], dict[str, int]] = {}
    missing_counties: list[str] = []
    county_only_counties: list[str] = []

    for path in text_files:
        county = f"{path.stem} County"
        county_precincts: dict[str, dict[str, int]] = {}
        county_cumulative = _kentucky_empty_values()
        found_precinct = False
        text = path.read_text(encoding="utf-8", errors="replace")
        chunks = re.split(r"\n-- \d+ of \d+ --\n", text)

        for chunk in chunks:
            lines = [line.strip() for line in chunk.splitlines() if line.strip() and not line.startswith("#")]
            if not lines:
                continue
            for line in lines:
                ballot_match = re.search(r"OFFICIAL BALLOT FOR (.+?) COUNTY", line, re.IGNORECASE)
                if ballot_match:
                    county = _county_name(ballot_match.group(1))
                elif re.fullmatch(r"[A-Za-z .'\-]+ County(?:,\s*KY)?", line):
                    candidate_county = _county_name(line.replace(", KY", ""))
                    if candidate_county.upper().replace(" COUNTY", "") == path.stem.upper().replace(" COUNTY", ""):
                        county = candidate_county

            local_unit, is_precinct = _ky_chunk_local(lines)
            if is_precinct:
                found_precinct = True
            target = county_precincts.setdefault(local_unit, _kentucky_empty_values()) if is_precinct else county_cumulative
            contest = ""
            candidate_lines: list[str] = []
            index = 0
            while index < len(lines):
                line = lines[index]
                lower = line.lower()
                if "president and vice president" in lower:
                    contest = "president"
                    candidate_lines = []
                    index += 1
                    continue
                if "united states representative" in lower or lower.startswith("u.s. representative"):
                    contest = "house"
                    candidate_lines = []
                    index += 1
                    continue
                if contest and lower.startswith((
                    "total votes cast",
                    "cast votes:",
                    "contest totals",
                    "undervotes:",
                    "overvotes:",
                    "choice party",
                    "vote for",
                    "total election",
                    "total",
                )):
                    if lower.startswith(("total votes cast", "cast votes:", "contest totals")):
                        contest = ""
                    candidate_lines = []
                    index += 1
                    continue

                if contest:
                    parsed = _ky_parse_candidate_row(line)
                    if parsed is None and line in KY_RECAP_PARTIES:
                        lookahead: list[str] = []
                        cursor = index + 1
                        while cursor < len(lines) and len(lookahead) < 16:
                            next_line = lines[cursor]
                            next_lower = next_line.lower()
                            if next_line in KY_RECAP_PARTIES or next_lower.startswith(("total votes cast", "cast votes:", "contest totals", "undervotes:", "overvotes:")):
                                break
                            lookahead.append(next_line)
                            cursor += 1
                        totals = _ky_int_tokens(" ".join(lookahead))
                        parsed = (line, "", totals[-1] if totals else 0)
                        index = max(index, cursor - 1)

                    if parsed:
                        party, row_candidate, total = parsed
                        candidate = " ".join(candidate_lines + [row_candidate])
                        _ky_apply_row(target, contest, party, candidate, total)
                        candidate_lines = []
                    elif not line.startswith(("Write-In", "Not Assigned", "Report generated", "Precinct Summary")):
                        candidate_lines.append(line)
                index += 1

        if found_precinct:
            for local_unit, values in county_precincts.items():
                if values["pres_total"]:
                    bucket = counties.setdefault(county, _kentucky_empty_values())
                    for key, value in values.items():
                        bucket[key] += value
                    precincts[(county, local_unit)] = values
        else:
            if county_cumulative["pres_total"]:
                counties[county] = county_cumulative
                county_only_counties.append(county)

        county_values = counties.get(county)
        if not county_values or not county_values["pres_total"]:
            missing_counties.append(county)

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["pres_trump"],
                "Harris": values["pres_harris"],
                "Other": values["pres_other"],
            },
            "totalVotes": values["pres_total"],
            "margin": values["pres_trump"] - values["pres_harris"],
            "marginPct": pct(values["pres_trump"] - values["pres_harris"], values["pres_total"]),
            "sourceId": source.id,
        }
        for county, values in sorted(counties.items())
        if values["pres_total"]
    ]

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for (county, local_unit), values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        has_house = bool(values["house_total"])
        if has_house:
            comparison_rows += 1
        has_comparable_house = bool(has_house and values["house_dem_present"] and values["house_rep_present"])
        review_rows.append(
            {
                "county": county,
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - values["house_dem"], total) if has_comparable_house else 0,
                "repDropoff": pct(values["pres_trump"] - values["house_rep"], total) if has_comparable_house else 0,
                "coverageMode": "presidentVsHouse" if has_comparable_house else "oneSidedHouseComparison" if has_house else "voteShareOnly",
                "comparisonContest": section.get("comparisonContest", "United States Representative"),
                "comparisonDemVotes": values["house_dem"],
                "comparisonDemCandidatePresent": bool(values["house_dem_present"]),
                "comparisonRepVotes": values["house_rep"],
                "comparisonRepCandidatePresent": bool(values["house_rep_present"]),
                "comparisonOtherVotes": values["house_other"],
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    result_total = sum(row["totalVotes"] for row in result_rows)
    trump = sum(row["votes"]["Trump"] for row in result_rows)
    harris = sum(row["votes"]["Harris"] for row in result_rows)
    other = sum(row["votes"]["Other"] for row in result_rows)
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": result_total,
        "nativeTrumpVotes": trump,
        "nativeHarrisVotes": harris,
        "nativeOtherVotes": other,
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": section.get("comparisonContest", "United States Representative"),
        "nativeKentuckyMissingCountyTextRows": sorted(set(missing_counties)),
        "nativeKentuckyCountyOnlyRows": sorted(set(county_only_counties)),
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics



KS_HOUSE_WIDE_SHEETS = {
    "JOHNSON": {"county": "Johnson", "localUnitColumn": 1, "firstCandidateColumn": 2},
    "SEDGWICK": {"county": "Sedgwick", "localUnitColumn": 0, "firstCandidateColumn": 1},
    "SHAWNEE": {"county": "Shawnee", "localUnitColumn": 1, "firstCandidateColumn": 2},
    "WYANDOTTE": {"county": "Wyandotte", "localUnitColumn": 0, "firstCandidateColumn": 1},
}

KS_HOUSE_WIDE_CANDIDATE_PARTIES = {
    "dem nancy boyda": "dem",
    "dem sharice davids": "dem",
    "esau freeman": "dem",
    "lib john hauer": "other",
    "lib steve roberts": "other",
    "prasanth reddy": "rep",
    "rep derek schmidt": "rep",
    "rep prasanth reddy": "rep",
    "ron estes": "rep",
    "sharice davids": "dem",
    "steve roberts": "other",
    "write-in": "other",
}


def _ks_party_bucket(value: Any) -> str:
    label = " ".join(str(value or "").strip().lower().split())
    if not label:
        return "other"
    if label in KS_HOUSE_WIDE_CANDIDATE_PARTIES:
        return KS_HOUSE_WIDE_CANDIDATE_PARTIES[label]
    if label.startswith(("dem", "democratic")):
        return "dem"
    if label.startswith(("rep", "republican")):
        return "rep"
    return "other"


def _ks_result_values() -> dict[str, int]:
    return {
        "comparison_dem": 0,
        "comparison_other": 0,
        "comparison_rep": 0,
        "comparison_total": 0,
        "pres_harris": 0,
        "pres_other": 0,
        "pres_total": 0,
        "pres_trump": 0,
    }


def _ks_add_presidential_row(target: dict[str, int], party: Any, votes: int) -> None:
    bucket = _ks_party_bucket(party)
    if bucket == "dem":
        target["pres_harris"] += votes
    elif bucket == "rep":
        target["pres_trump"] += votes
    else:
        target["pres_other"] += votes
    target["pres_total"] += votes


def _ks_add_comparison_row(target: dict[str, int], party: Any, votes: int) -> None:
    bucket = _ks_party_bucket(party)
    if bucket == "dem":
        target["comparison_dem"] += votes
    elif bucket == "rep":
        target["comparison_rep"] += votes
    else:
        target["comparison_other"] += votes
    target["comparison_total"] += votes


def _ks_row_text(row: list[Any], columns: dict[str, int], name: str) -> str:
    return str(_row_value(row, columns, name) or "").strip()


def _ks_int_text(value: Any) -> int:
    try:
        return int_text(value)
    except ValueError:
        return 0


def _kansas_president_rows(
    source: SourceConfig,
    sheet_name: str,
) -> tuple[dict[str, dict[str, int]], dict[tuple[str, str], dict[str, int]]]:
    rows = read_xlsx_sheet(_artifact_path(source), sheet_name)
    if not rows:
        raise ValueError("Kansas presidential workbook is empty")
    columns = _column_index(rows[0])
    required = {"County", "Precinct", "Party", "Votes"}
    missing = sorted(required.difference(columns))
    if missing:
        raise ValueError(f"Kansas presidential workbook missing columns: {', '.join(missing)}")

    counties: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str], dict[str, int]] = {}
    for row in rows[1:]:
        county = _county_name(_ks_row_text(row, columns, "County"))
        local_unit = _ks_row_text(row, columns, "Precinct")
        if not county or not local_unit:
            continue
        votes = int_text(_row_value(row, columns, "Votes"))
        county_values = counties.setdefault(county, _ks_result_values())
        precinct_values = precincts.setdefault((county, local_unit), _ks_result_values())
        party = _row_value(row, columns, "Party")
        _ks_add_presidential_row(county_values, party, votes)
        _ks_add_presidential_row(precinct_values, party, votes)

    return counties, precincts


def _kansas_house_rows(source: SourceConfig, section: dict[str, Any]) -> dict[tuple[str, str], dict[str, int]]:
    precincts: dict[tuple[str, str], dict[str, int]] = {}
    rows = read_xlsx_sheet(_artifact_path(source), section.get("sheetName", "OfficialPrecinctLevelResults"))
    if rows:
        columns = _column_index(rows[0])
        required = {"County", "Precinct", "Party", "Votes"}
        missing = sorted(required.difference(columns))
        if missing:
            raise ValueError(f"Kansas U.S. House workbook missing columns: {', '.join(missing)}")
        for row in rows[1:]:
            county = _county_name(_ks_row_text(row, columns, "County"))
            local_unit = _ks_row_text(row, columns, "Precinct")
            if not county or not local_unit:
                continue
            values = precincts.setdefault((county, local_unit), _ks_result_values())
            _ks_add_comparison_row(
                values,
                _row_value(row, columns, "Party"),
                int_text(_row_value(row, columns, "Votes")),
            )

    for sheet_name in section.get("wideSheets", list(KS_HOUSE_WIDE_SHEETS)):
        sheet_config = KS_HOUSE_WIDE_SHEETS[sheet_name]
        county = _county_name(sheet_config["county"])
        rows = read_xlsx_sheet(_artifact_path(source), sheet_name)
        if len(rows) < 2:
            continue
        candidate_header = rows[1]
        local_unit_column = int(sheet_config["localUnitColumn"])
        first_candidate_column = int(sheet_config["firstCandidateColumn"])
        for row in rows[2:]:
            local_unit = str(row[local_unit_column] if len(row) > local_unit_column else "").strip()
            if not local_unit or re.fullmatch(r"county totals", local_unit, re.IGNORECASE):
                continue
            values = precincts.setdefault((county, local_unit), _ks_result_values())
            for column in range(first_candidate_column, max(len(row), len(candidate_header))):
                candidate = candidate_header[column] if len(candidate_header) > column else ""
                if not str(candidate or "").strip():
                    continue
                votes = _ks_int_text(row[column] if len(row) > column else 0)
                _ks_add_comparison_row(values, candidate, votes)

    return precincts


def _kansas_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    certified_section = config.raw["certifiedResults"]
    review_section = config.raw.get("reviewCharts", {})
    president_source = sources[certified_section["sourceId"]]
    house_source = sources[review_section["sourceId"]]
    counties, precincts = _kansas_president_rows(
        president_source,
        certified_section.get("sheetName", "2024 Presidential Results"),
    )
    house_precincts = _kansas_house_rows(house_source, review_section)

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["pres_trump"],
                "Harris": values["pres_harris"],
                "Other": values["pres_other"],
            },
            "totalVotes": values["pres_total"],
            "margin": values["pres_trump"] - values["pres_harris"],
            "marginPct": pct(values["pres_trump"] - values["pres_harris"], values["pres_total"]),
            "sourceId": president_source.id,
        }
        for county, values in sorted(counties.items())
        if values["pres_total"]
    ]

    comparison_rows = 0
    review_rows: list[dict[str, Any]] = []
    for (county, local_unit), values in sorted(precincts.items()):
        total = values["pres_total"]
        if not total:
            continue
        comparison = house_precincts.get((county, local_unit))
        has_comparison = bool(comparison and comparison["comparison_total"])
        if has_comparison:
            comparison_rows += 1
        review_rows.append(
            {
                "county": county,
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - comparison["comparison_dem"], total)
                if has_comparison and comparison
                else 0,
                "repDropoff": pct(values["pres_trump"] - comparison["comparison_rep"], total)
                if has_comparison and comparison
                else 0,
                "coverageMode": review_section.get("coverageMode", "presidentVsUSHouse")
                if has_comparison
                else "voteShareOnly",
                "comparisonContest": review_section.get(
                    "comparisonContest",
                    "United States House of Representatives",
                ),
                "comparisonDemVotes": comparison["comparison_dem"] if comparison else 0,
                "comparisonRepVotes": comparison["comparison_rep"] if comparison else 0,
                "comparisonOtherVotes": comparison["comparison_other"] if comparison else 0,
                "sourceId": house_source.id if has_comparison else president_source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    result_total = sum(row["totalVotes"] for row in result_rows)
    trump = sum(row["votes"]["Trump"] for row in result_rows)
    harris = sum(row["votes"]["Harris"] for row in result_rows)
    other = sum(row["votes"]["Other"] for row in result_rows)
    metrics = {
        "nativeComparisonContest": review_section.get(
            "comparisonContest",
            "United States House of Representatives",
        ),
        "nativeComparisonRows": comparison_rows,
        "nativeHarrisVotes": harris,
        "nativeKansasHousePrecinctRows": len(house_precincts),
        "nativeOtherVotes": other,
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": result_total,
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeTrumpVotes": trump,
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics



def _oklahoma_zip_csv_rows(source: SourceConfig) -> list[dict[str, Any]]:
    archive_path = _artifact_path(source)
    with zipfile.ZipFile(archive_path) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise ValueError(f"expected one Oklahoma CSV in {archive_path}, found {len(csv_names)}")
        with archive.open(csv_names[0]) as handle:
            text = handle.read().decode("utf-8-sig")
    return list(csv.DictReader(text.splitlines()))


def _oklahoma_csv_rows(source: SourceConfig) -> list[dict[str, Any]]:
    with _artifact_path(source).open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def _oklahoma_party_bucket(row: dict[str, Any]) -> str:
    party = str(row.get("cand_party") or "").strip().upper()
    candidate = str(row.get("cand_name") or "").strip().upper()
    if party == "DEM" or "HARRIS" in candidate:
        return "dem"
    if party == "REP" or "TRUMP" in candidate:
        return "rep"
    return "other"


def _oklahoma_empty_values() -> dict[str, int]:
    return {
        "comparison_dem": 0,
        "comparison_dem_present": 0,
        "comparison_other": 0,
        "comparison_rep": 0,
        "comparison_rep_present": 0,
        "comparison_total": 0,
        "pres_harris": 0,
        "pres_other": 0,
        "pres_total": 0,
        "pres_trump": 0,
    }


def _oklahoma_add_presidential_row(values: dict[str, int], row: dict[str, Any]) -> None:
    votes = int_text(row.get("cand_tot_votes"))
    bucket = _oklahoma_party_bucket(row)
    if bucket == "dem":
        values["pres_harris"] += votes
    elif bucket == "rep":
        values["pres_trump"] += votes
    else:
        values["pres_other"] += votes
    values["pres_total"] += votes


def _oklahoma_add_comparison_row(values: dict[str, int], row: dict[str, Any]) -> None:
    votes = int_text(row.get("cand_tot_votes"))
    bucket = _oklahoma_party_bucket(row)
    if bucket == "dem":
        values["comparison_dem"] += votes
        values["comparison_dem_present"] = 1
    elif bucket == "rep":
        values["comparison_rep"] += votes
        values["comparison_rep_present"] = 1
    else:
        values["comparison_other"] += votes
    values["comparison_total"] += votes


def _oklahoma_county_name(value: Any) -> str:
    return _county_name(str(value or "").strip())


def _oklahoma_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    certified_section = config.raw["certifiedResults"]
    review_section = config.raw.get("reviewCharts", {})
    president_race_id = str(certified_section.get("presidentRaceId", "10001"))
    county_codes = {str(code): _county_name(name) for code, name in certified_section.get("countyCodes", {}).items()}
    county_source = sources[certified_section["sourceId"]]
    precinct_source = sources[review_section["sourceId"]]
    race_source = sources[certified_section.get("raceLevelSourceId", certified_section["sourceId"])]

    county_values: dict[str, dict[str, int]] = {}
    for row in _oklahoma_zip_csv_rows(county_source):
        if str(row.get("race_number") or "") != president_race_id:
            continue
        county = _oklahoma_county_name(row.get("county"))
        if not county:
            continue
        values = county_values.setdefault(county, _oklahoma_empty_values())
        _oklahoma_add_presidential_row(values, row)

    race_level_values = _oklahoma_empty_values()
    for row in _oklahoma_csv_rows(race_source):
        if str(row.get("race_number") or "") == president_race_id:
            _oklahoma_add_presidential_row(race_level_values, row)

    result_rows = [
        {
            "jurisdictionName": county,
            "jurisdictionCode": county.upper().replace(" COUNTY", ""),
            "level": "county",
            "votes": {
                "Trump": values["pres_trump"],
                "Harris": values["pres_harris"],
                "Other": values["pres_other"],
            },
            "totalVotes": values["pres_total"],
            "margin": values["pres_trump"] - values["pres_harris"],
            "marginPct": pct(values["pres_trump"] - values["pres_harris"], values["pres_total"]),
            "sourceId": county_source.id,
        }
        for county, values in sorted(county_values.items())
        if values["pres_total"]
    ]

    precincts: dict[tuple[str, str], dict[str, int]] = {}
    comparisons: dict[tuple[str, str], dict[str, int]] = {}
    comparison_contests: dict[tuple[str, str], set[str]] = {}
    comparison_needle = str(review_section.get("comparisonRaceContains", "UNITED STATES REPRESENTATIVE")).upper()
    unknown_county_codes: set[str] = set()

    for row in _oklahoma_zip_csv_rows(precinct_source):
        precinct = str(row.get("precinct") or "").strip()
        if len(precinct) < 2:
            continue
        county = county_codes.get(precinct[:2])
        if not county:
            unknown_county_codes.add(precinct[:2])
            continue
        key = (county, precinct)
        race_number = str(row.get("race_number") or "")
        race_description = str(row.get("race_description") or "")
        if race_number == president_race_id:
            values = precincts.setdefault(key, _oklahoma_empty_values())
            _oklahoma_add_presidential_row(values, row)
        elif comparison_needle in race_description.upper():
            values = comparisons.setdefault(key, _oklahoma_empty_values())
            _oklahoma_add_comparison_row(values, row)
            comparison_contests.setdefault(key, set()).add(race_description)

    review_rows: list[dict[str, Any]] = []
    comparable_rows = 0
    house_rows = 0
    zero_total_presidential_precincts = 0
    for (county, precinct), values in sorted(precincts.items()):
        total = values["pres_total"]
        if total <= 0:
            zero_total_presidential_precincts += 1
            continue
        comparison = comparisons.get((county, precinct))
        has_house = bool(comparison and comparison["comparison_total"])
        has_comparable_house = bool(
            has_house
            and comparison
            and comparison["comparison_dem_present"]
            and comparison["comparison_rep_present"]
        )
        if has_house:
            house_rows += 1
        if has_comparable_house:
            comparable_rows += 1
        contests = sorted(comparison_contests.get((county, precinct), []))
        review_rows.append(
            {
                "county": county,
                "localUnit": precinct,
                "totalVotes": total,
                "harris": values["pres_harris"],
                "trump": values["pres_trump"],
                "harrisShare": pct(values["pres_harris"], total),
                "trumpShare": pct(values["pres_trump"], total),
                "demDropoff": pct(values["pres_harris"] - comparison["comparison_dem"], total)
                if has_comparable_house and comparison
                else 0,
                "repDropoff": pct(values["pres_trump"] - comparison["comparison_rep"], total)
                if has_comparable_house and comparison
                else 0,
                "coverageMode": review_section.get("coverageMode", "presidentVsUSHouse")
                if has_comparable_house
                else "voteShareOnly",
                "comparisonContest": contests[0] if len(contests) == 1 else review_section.get("comparisonContest", "United States Representative"),
                "comparisonDemVotes": comparison["comparison_dem"] if comparison else 0,
                "comparisonDemCandidatePresent": bool(comparison and comparison["comparison_dem_present"]),
                "comparisonRepVotes": comparison["comparison_rep"] if comparison else 0,
                "comparisonRepCandidatePresent": bool(comparison and comparison["comparison_rep_present"]),
                "comparisonOtherVotes": comparison["comparison_other"] if comparison else 0,
                "sourceId": precinct_source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    result_total = sum(row["totalVotes"] for row in result_rows)
    trump = sum(row["votes"]["Trump"] for row in result_rows)
    harris = sum(row["votes"]["Harris"] for row in result_rows)
    other = sum(row["votes"]["Other"] for row in result_rows)
    metrics = {
        "nativeComparisonContest": review_section.get("comparisonContest", "United States Representative"),
        "nativeComparisonRows": comparable_rows,
        "nativeHarrisVotes": harris,
        "nativeOklahomaHousePrecinctRows": house_rows,
        "nativeOklahomaRaceLevelHarrisVotes": race_level_values["pres_harris"],
        "nativeOklahomaRaceLevelOtherVotes": race_level_values["pres_other"],
        "nativeOklahomaRaceLevelTotalVotes": race_level_values["pres_total"],
        "nativeOklahomaRaceLevelTrumpVotes": race_level_values["pres_trump"],
        "nativeOklahomaUnknownCountyCodes": sorted(unknown_county_codes),
        "nativeOklahomaVoteShareOnlyRows": len(review_rows) - comparable_rows,
        "nativeOklahomaZeroTotalPresidentialPrecincts": zero_total_presidential_precincts,
        "nativeOtherVotes": other,
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": result_total,
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeTrumpVotes": trump,
        **turnout_metrics,
    }
    if race_level_values["pres_total"] != result_total:
        raise ValueError(
            f"Oklahoma race-level presidential total {race_level_values['pres_total']} does not match county total {result_total}"
        )
    return result_rows, review_rows, turnout_rows, metrics

def _la_party_from_candidate(candidate: str) -> str:
    match = re.search(r"\(([^)]+)\)\s*$", candidate)
    party = match.group(1).upper() if match else ""
    if party == "DEM":
        return "dem"
    if party == "REP":
        return "rep"
    return "other"


def _louisiana_sos_precinct_csv_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    source_dir = _artifact_path(source)
    president_race_id = str(section.get("presidentRaceId", "67190"))
    president_path = source_dir / f"ByPrecinct_{president_race_id}.csv"
    if not president_path.exists():
        raise FileNotFoundError(f"missing Louisiana presidential precinct CSV: {president_path}")

    candidate_columns = {"harris": "", "trump": "", "other": []}
    parish_values: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str, str], dict[str, int]] = {}
    with president_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        for field in fieldnames:
            normalized = field.lower()
            if "kamala" in normalized and "harris" in normalized:
                candidate_columns["harris"] = field
            elif "donald" in normalized and "trump" in normalized:
                candidate_columns["trump"] = field
            elif field not in {"Office", "Parish", "Ward", "Precinct"}:
                candidate_columns["other"].append(field)

        if not candidate_columns["harris"] or not candidate_columns["trump"]:
            raise ValueError("Louisiana presidential CSV is missing Harris or Trump candidate columns")

        for row in reader:
            parish = str(row.get("Parish") or "").strip()
            ward = str(row.get("Ward") or "").strip()
            precinct = str(row.get("Precinct") or "").strip()
            if not parish:
                continue
            harris = int_text(row.get(candidate_columns["harris"]))
            trump = int_text(row.get(candidate_columns["trump"]))
            other = sum(int_text(row.get(column)) for column in candidate_columns["other"])
            total = harris + trump + other
            parish_bucket = parish_values.setdefault(parish, {"harris": 0, "trump": 0, "other": 0, "total": 0})
            parish_bucket["harris"] += harris
            parish_bucket["trump"] += trump
            parish_bucket["other"] += other
            parish_bucket["total"] += total
            if total:
                precincts[(parish, ward, precinct)] = {"harris": harris, "trump": trump, "other": other, "total": total}

    result_rows = [
        {
            "jurisdictionName": f"{parish} Parish",
            "jurisdictionCode": parish.upper().replace(" ", "-"),
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
        for parish, values in sorted(parish_values.items())
        if values["total"]
    ]

    comparison_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    comparison_rows = 0
    comparable_rows = 0
    for race_id in section.get("comparisonRaceIds", []):
        race_path = source_dir / f"ByPrecinct_{race_id}.csv"
        if not race_path.exists():
            raise FileNotFoundError(f"missing Louisiana comparison precinct CSV: {race_path}")
        with race_path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            vote_columns = [field for field in fieldnames if field not in {"Office", "Parish", "Ward", "Precinct"}]
            for row in reader:
                parish = str(row.get("Parish") or "").strip()
                ward = str(row.get("Ward") or "").strip()
                precinct = str(row.get("Precinct") or "").strip()
                key = (parish, ward, precinct)
                values = {"dem": 0, "rep": 0, "other": 0}
                dem_present = False
                rep_present = False
                for column in vote_columns:
                    votes = int_text(row.get(column))
                    bucket = _la_party_from_candidate(column)
                    values[bucket] += votes
                    dem_present = dem_present or bucket == "dem"
                    rep_present = rep_present or bucket == "rep"
                total = values["dem"] + values["rep"] + values["other"]
                if total:
                    comparison_rows += 1
                if total and dem_present and rep_present:
                    comparable_rows += 1
                comparison_by_key[key] = {
                    **values,
                    "demPresent": dem_present,
                    "repPresent": rep_present,
                    "total": total,
                    "raceId": str(race_id),
                    "office": str(row.get("Office") or ""),
                }

    review_section = config.raw.get("reviewCharts", {})
    review_rows: list[dict[str, Any]] = []
    for (parish, ward, precinct), president in sorted(precincts.items()):
        total = president["total"]
        comparison = comparison_by_key.get((parish, ward, precinct))
        has_comparison = bool(comparison and comparison["total"])
        has_comparable_house = bool(has_comparison and comparison["demPresent"] and comparison["repPresent"])
        local_unit = f"Ward {ward}, Precinct {precinct}" if ward and precinct else ward or precinct or "Parish vote mode"
        review_rows.append(
            {
                "county": f"{parish} Parish",
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": president["harris"],
                "trump": president["trump"],
                "harrisShare": pct(president["harris"], total),
                "trumpShare": pct(president["trump"], total),
                "demDropoff": pct(president["harris"] - comparison["dem"], total) if has_comparable_house else 0,
                "repDropoff": pct(president["trump"] - comparison["rep"], total) if has_comparable_house else 0,
                "coverageMode": "presidentVsHouse" if has_comparable_house else "oneSidedHouseComparison" if has_comparison else "voteShareOnly",
                "comparisonContest": comparison["office"] if comparison else review_section.get("comparisonContest", ""),
                "comparisonDemVotes": comparison["dem"] if comparison else 0,
                "comparisonDemCandidatePresent": bool(comparison and comparison["demPresent"]),
                "comparisonRepVotes": comparison["rep"] if comparison else 0,
                "comparisonRepCandidatePresent": bool(comparison and comparison["repPresent"]),
                "comparisonOtherVotes": comparison["other"] if comparison else 0,
                "comparisonRaceId": comparison["raceId"] if comparison else "",
                "sourceId": source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    result_total = sum(row["totalVotes"] for row in result_rows)
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": result_total,
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparableComparisonRows": comparable_rows,
        "nativeComparisonContest": review_section.get("comparisonContest", "United States Representative"),
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in review_rows),
        "nativeReviewCertifiedVoteGap": result_total - sum(row["totalVotes"] for row in review_rows),
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics
def _ma_pd43_precinct_key(row: dict[str, str]) -> tuple[str, str, str]:
    return (
        str(row.get("City/Town") or "").strip(),
        str(row.get("Ward") or "").strip(),
        str(row.get("Pct") or "").strip(),
    )


def _ma_pd43_local_unit(ward: str, precinct: str) -> str:
    ward_value = ward if ward and ward != "-" else ""
    precinct_value = precinct if precinct and precinct != "-" else ""
    if ward_value and precinct_value:
        return f"Ward {ward_value}, Precinct {precinct_value}"
    if ward_value:
        return f"Ward {ward_value}"
    if precinct_value:
        return f"Precinct {precinct_value}"
    return "Municipality total"


def _massachusetts_pd43_county_result_rows(
    source: SourceConfig,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with _artifact_path(source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "county",
            "harris_votes",
            "trump_votes",
            "other_votes",
            "total_votes",
        }
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Massachusetts PD43+ county totals CSV missing columns: {', '.join(missing)}")

        for index, row in enumerate(reader, start=2):
            county = _county_name(row.get("county"))
            if not county:
                raise ValueError(f"Massachusetts county totals row {index} is missing county")
            harris = int_text(row.get("harris_votes"))
            trump = int_text(row.get("trump_votes"))
            other = int_text(row.get("other_votes"))
            total = int_text(row.get("total_votes"))
            if total != harris + trump + other:
                raise ValueError(f"Massachusetts county totals row {index} total does not equal candidate vote sum")
            rows.append(
                {
                    "jurisdictionName": county,
                    "jurisdictionCode": county.upper(),
                    "level": "county",
                    "votes": {
                        "Trump": trump,
                        "Harris": harris,
                        "Other": other,
                    },
                    "totalVotes": total,
                    "margin": trump - harris,
                    "marginPct": pct(trump - harris, total),
                    "sourceId": source.id,
                }
            )

    return rows


def _massachusetts_pd43_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    certified_section = config.raw["certifiedResults"]
    review_section = config.raw.get("reviewCharts", {})
    president_source = sources[certified_section["sourceId"]]
    senate_source = sources[review_section["sourceId"]]
    comparison_label = review_section.get("comparisonContest", "United States Senator")

    municipalities: dict[str, dict[str, int]] = {}
    precincts: dict[tuple[str, str, str], dict[str, int]] = {}
    with _artifact_path(president_source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "City/Town",
            "Ward",
            "Pct",
            "Harris/ Walz",
            "Trump/ Vance",
            "Total Votes Cast",
        }
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Massachusetts PD43+ presidential CSV missing columns: {', '.join(missing)}")

        for row in reader:
            city, ward, precinct = _ma_pd43_precinct_key(row)
            if not city or city.upper() == "TOTALS":
                continue
            harris = int_text(row.get("Harris/ Walz"))
            trump = int_text(row.get("Trump/ Vance"))
            total = int_text(row.get("Total Votes Cast"))
            if not total:
                continue
            other = max(total - harris - trump, 0)
            values = municipalities.setdefault(city, {"harris": 0, "trump": 0, "other": 0, "total": 0})
            values["harris"] += harris
            values["trump"] += trump
            values["other"] += other
            values["total"] += total
            precincts[(city, ward, precinct)] = {
                "harris": harris,
                "trump": trump,
                "other": other,
                "total": total,
            }

    senate_rows: dict[tuple[str, str, str], dict[str, int]] = {}
    with _artifact_path(senate_source).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "City/Town",
            "Ward",
            "Pct",
            "Elizabeth Ann Warren",
            "John Deaton",
            "All Others",
            "Total Votes Cast",
        }
        missing = sorted(required.difference(set(reader.fieldnames or [])))
        if missing:
            raise ValueError(f"Massachusetts PD43+ U.S. Senate CSV missing columns: {', '.join(missing)}")

        for row in reader:
            key = _ma_pd43_precinct_key(row)
            if not key[0] or key[0].upper() == "TOTALS":
                continue
            total = int_text(row.get("Total Votes Cast"))
            if not total:
                continue
            senate_rows[key] = {
                "dem": int_text(row.get("Elizabeth Ann Warren")),
                "rep": int_text(row.get("John Deaton")),
                "other": int_text(row.get("All Others")),
                "total": total,
            }

    county_source_id = certified_section.get("countySourceId")
    if county_source_id:
        result_rows = _massachusetts_pd43_county_result_rows(sources[county_source_id])
    else:
        result_rows = []
        for city, values in sorted(municipalities.items()):
            total = values["total"]
            if not total:
                continue
            result_rows.append(
                {
                    "jurisdictionName": city,
                    "jurisdictionCode": city.upper(),
                    "level": "city",
                    "votes": {
                        "Trump": values["trump"],
                        "Harris": values["harris"],
                        "Other": values["other"],
                    },
                    "totalVotes": total,
                    "margin": values["trump"] - values["harris"],
                    "marginPct": pct(values["trump"] - values["harris"], total),
                    "sourceId": president_source.id,
                }
            )

    review_rows: list[dict[str, Any]] = []
    comparison_rows = 0
    for (city, ward, precinct), values in sorted(precincts.items()):
        total = values["total"]
        if not total:
            continue
        senate = senate_rows.get((city, ward, precinct))
        if senate:
            comparison_rows += 1
        local_unit = _ma_pd43_local_unit(ward, precinct)
        review_rows.append(
            {
                "county": city,
                "localUnit": local_unit,
                "totalVotes": total,
                "harris": values["harris"],
                "trump": values["trump"],
                "harrisShare": pct(values["harris"], total),
                "trumpShare": pct(values["trump"], total),
                "demDropoff": pct(values["harris"] - senate["dem"], total) if senate else 0,
                "repDropoff": pct(values["trump"] - senate["rep"], total) if senate else 0,
                "coverageMode": "presidentVsSenate" if senate else "voteShareOnly",
                "comparisonContest": comparison_label if senate else "",
                "comparisonDemVotes": senate["dem"] if senate else 0,
                "comparisonRepVotes": senate["rep"] if senate else 0,
                "comparisonOtherVotes": senate["other"] if senate else 0,
                "sourceId": senate_source.id if senate else president_source.id,
            }
        )

    turnout_rows: list[dict[str, Any]] = []
    turnout_metrics: dict[str, Any] = {"nativeTurnoutRows": 0}
    if config.raw.get("turnout", {}).get("format") in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        turnout_rows, turnout_metrics = _normalized_turnout_rows(config, sources)

    certified_total = sum(row["totalVotes"] for row in result_rows)
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": certified_total,
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": review_section.get("warning", ""),
        "nativeComparisonRows": comparison_rows,
        "nativeComparisonContest": comparison_label,
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in review_rows),
        "nativeReviewCertifiedVoteGap": certified_total - sum(row["totalVotes"] for row in review_rows),
        **turnout_metrics,
    }
    return result_rows, review_rows, turnout_rows, metrics


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
    expected_historical_rows = int_text(config.raw.get("expected", {}).get("historicalBaselineRows"))
    if expected_historical_rows and "nativeHistoricalRows" in metrics:
        checks["nativeHistoricalRows"] = expected_historical_rows
    mismatches = {
        key: {"actual": metrics.get(key), "expected": expected}
        for key, expected in checks.items()
        if expected and metrics.get(key) != expected
    }
    if mismatches:
        raise ValueError(f"native {config.code} validation failed: {mismatches}")


def _with_historical_baselines(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    payload: dict[str, Any],
) -> dict[str, Any]:
    section = config.raw.get("historicalBaselines", {})
    if section.get("format") != "historicalPresidentialCsv":
        return payload
    if "historicalRows" in payload:
        return payload

    historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
    return {
        **payload,
        "historicalRows": historical_rows,
        "metrics": {**payload.get("metrics", {}), **historical_metrics},
    }


def _build_native_payload(config: EtlConfig) -> dict[str, Any] | None:
    turnout_format = config.raw.get("turnout", {}).get("format")
    if config.raw.get("turnoutOnly") and turnout_format in {"normalizedTurnoutCsv", "eacTurnoutCsv"}:
        sources = _source_map(config)
        turnout_rows, metrics = _normalized_turnout_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": f"native{turnout_format[0].upper()}{turnout_format[1:]}",
            "resultRows": [],
            "reviewRows": [],
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "SC" and config.raw.get("certifiedResults", {}).get("format") == "southCarolinaElectionHistoryCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _south_carolina_election_history_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeSouthCarolinaElectionHistoryCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "MD" and config.raw.get("certifiedResults", {}).get("format") == "marylandPrecinctCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _maryland_precinct_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMarylandPrecinctCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "MI" and config.raw.get("certifiedResults", {}).get("format") == "michiganCountyTab":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _michigan_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMichiganMvic",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "PA" and config.raw.get("certifiedResults", {}).get("format") == "pennsylvaniaBulkCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _pennsylvania_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativePennsylvaniaBulkCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
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
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **turnout_metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWisconsinWardByWardXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "MT" and config.raw.get("certifiedResults", {}).get("format") == "montanaPrecinctResultsXlsx":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _montana_precinct_xlsx_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMontanaPrecinctResultsXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "NC" and config.raw.get("certifiedResults", {}).get("format") == "northCarolinaPrecinctResultsZip":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _north_carolina_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeNorthCarolinaPrecinctResultsZip",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "AZ" and config.raw.get("certifiedResults", {}).get("format") == "arizonaCanvassCountyCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _arizona_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeArizonaCanvassCountyCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "KY" and config.raw.get("certifiedResults", {}).get("format") == "kentuckyGeneralRecapTextDirectory":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _kentucky_general_recap_text_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeKentuckyGeneralRecapTextDirectory",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "KS" and config.raw.get("certifiedResults", {}).get("format") == "kansasPresidentialResultsXlsx":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _kansas_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeKansasPresidentialHouseXlsx",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "OK" and config.raw.get("certifiedResults", {}).get("format") == "oklahomaOfficialCsvZip":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _oklahoma_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeOklahomaOfficialCsvZip",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "LA" and config.raw.get("certifiedResults", {}).get("format") == "louisianaSosPrecinctCsvDirectory":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _louisiana_sos_precinct_csv_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeLouisianaSosPrecinctCsvDirectory",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "AR" and config.raw.get("certifiedResults", {}).get("format") == "arkansasTotalResultsFederalJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _arkansas_totalresults_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeArkansasTotalResultsFederalJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "IL" and config.raw.get("certifiedResults", {}).get("format") == "illinoisElectionResultsByOfficeCsvDirectory":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _illinois_official_csv_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeIllinoisElectionResultsByOfficeCsvDirectory",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "IN" and config.raw.get("certifiedResults", {}).get("format") == "indianaEnrCountyJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _indiana_enr_county_json_rows(config, sources)
        if config.raw.get("reviewCharts", {}).get("format") == "localComparisonCsv":
            review_rows, review_metrics = _local_comparison_review_rows(
                config,
                sources,
                result_rows,
                missing_label="Indiana MIT/OpenElections supplemental precinct review",
            )
            metrics = {**metrics, **review_metrics}
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeIndianaEnrCountyJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "IA" and config.raw.get("certifiedResults", {}).get("format") == "iowaClarityCountyDetailXmlDirectory":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _wv_clarity_county_detailxml_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeIowaClarityCountyDetailXmlDirectory",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "IA" and config.raw.get("certifiedResults", {}).get("format") == "iowaClarityJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _clarity_county_json_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeIowaClarityJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "WV" and config.raw.get("certifiedResults", {}).get("format") == "westVirginiaClarityCountyDetailXmlDirectory":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _wv_clarity_county_detailxml_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWestVirginiaClarityCountyDetailXmlDirectory",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "WV" and config.raw.get("certifiedResults", {}).get("format") == "clarityCountyJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _clarity_county_json_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWestVirginiaClarityJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "TX" and config.raw.get("certifiedResults", {}).get("format") == "texasCountyJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _texas_county_json_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeTexasCountyJsonVtdReview"
            if config.raw.get("reviewCharts", {}).get("format") == "texasVtdZipPrecinctComparison"
            else "nativeTexasCountyJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "NH" and config.raw.get("certifiedResults", {}).get("format") == "newHampshireTownWardCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _new_hampshire_town_ward_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeNewHampshireTownWardCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "MS" and config.raw.get("certifiedResults", {}).get("format") == "mississippiElectionRecapCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _mississippi_election_recap_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMississippiElectionRecapCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "ID" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="Idaho official county results",
        )
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeIdahoCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.code == "MO" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="Missouri official county results",
            county_normalizer=_missouri_jurisdiction_name,
        )
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMissouriCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "NE" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="Nebraska official canvass",
        )
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeNebraskaCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "NY" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="New York official county results",
        )
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeNewYorkCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "CA" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="California official Statement of Vote",
        )
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeCaliforniaCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "OR" and config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label="Oregon official abstract",
        )
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeOregonCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }
    if config.raw.get("certifiedResults", {}).get("format") == "countyPresidentCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _county_president_csv_rows(
            config,
            sources,
            missing_label=f"{config.name} official county results",
        )
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeCountyPresidentCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "NV" and config.raw.get("certifiedResults", {}).get("format") == "nevadaStatewideGeneralCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _nevada_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeNevadaStatewideGeneralCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "FL" and config.raw.get("certifiedResults", {}).get("format") == "floridaDetailHtml":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _florida_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeFloridaDetailHtml",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "MA" and config.raw.get("certifiedResults", {}).get("format") == "massachusettsPd43PrecinctCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _massachusetts_pd43_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeMassachusettsPd43PrecinctCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "VA" and config.raw.get("certifiedResults", {}).get("format") == "virginiaElectionStatsContestCsv":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _virginia_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeVirginiaElectionStatsContestCsv",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }

    if config.code == "GA" and config.raw.get("certifiedResults", {}).get("format") == "georgiaMediaExportJson":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _georgia_rows(config, sources)
        historical_rows, historical_metrics = _historical_baseline_rows(config, sources)
        metrics = {**metrics, **historical_metrics}
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeGeorgiaMediaExportJson",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "historicalRows": historical_rows,
            "metrics": metrics,
        }
    if config.code == "WA" and config.raw.get("certifiedResults", {}).get("format") == "washingtonCsvExports":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _washington_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeWashingtonCsvExports",
            "resultRows": result_rows,
            "reviewRows": review_rows,
            "turnoutRows": turnout_rows,
            "metrics": metrics,
        }

    if config.code == "DE" and config.raw.get("certifiedResults", {}).get("format") == "delawareOfficialReportHtml":
        sources = _source_map(config)
        result_rows, review_rows, turnout_rows, metrics = _delaware_official_report_rows(config, sources)
        _assert_native_expected(config, metrics)
        return {
            "parser": "nativeDelawareOfficialReportHtml",
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


def build_native_payload(config: EtlConfig) -> dict[str, Any] | None:
    payload = _build_native_payload(config)
    if payload is None:
        return None

    sources = _source_map(config)
    payload = _with_historical_baselines(config, sources, payload)
    _assert_native_expected(config, payload.get("metrics", {}))
    return payload
