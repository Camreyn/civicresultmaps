from __future__ import annotations

import re
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .models import EtlConfig, SourceConfig
from .xlsx import read_xlsx_sheet_bytes, xlsx_sheet_names_bytes


def _int_text(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = re.sub(r"[^\d.-]", "", str(value))
    return 0 if cleaned in {"", "-", "."} else int(float(cleaned))


def _pct(numerator: int, denominator: int) -> float:
    return round((numerator / denominator) * 100, 4) if denominator else 0


def _artifact_path(source: SourceConfig) -> Path:
    path = Path(source.local_file)
    if not path.exists():
        raise FileNotFoundError(f"missing local artifact for {source.id}: {source.local_file}")
    return path


def _value(row: list[Any], index: int) -> Any:
    return row[index] if index < len(row) else ""


def _label(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").split())


def _county_name(raw: Any) -> str:
    value = _label(raw)
    if not value or value.lower().startswith(("total", "percentage")):
        return ""
    titled = value.title() if value.isupper() else value
    return titled if re.search(r"\bcounty\b$", titled, re.IGNORECASE) else f"{titled} County"


def _candidate_bucket(label: Any) -> str | None:
    normalized = _label(label).lower()
    if not normalized or "over" in normalized or "under" in normalized:
        return None
    if any(name in normalized for name in {"harris", "biden", "clinton", "obama"}):
        return "dem"
    if any(name in normalized for name in {"trump", "romney"}):
        return "rep"
    return "other"


def _contest_columns(
    contest_row: list[Any],
    header_row: list[Any],
    contest_label: str,
    fallback_candidate_contains: tuple[str, ...] = (),
) -> list[tuple[int, str]]:
    normalized_label = contest_label.lower()
    starts = [index for index, value in enumerate(contest_row) if normalized_label in _label(value).lower()]
    if starts:
        start = starts[0]
        end = len(header_row)
        for index in range(start + 1, min(len(contest_row), len(header_row))):
            value = _label(_value(contest_row, index))
            if value and normalized_label not in value.lower():
                end = index
                break
    else:
        start = next(
            (
                index
                for index, value in enumerate(header_row)
                if any(needle.lower() in _label(value).lower() for needle in fallback_candidate_contains)
            ),
            -1,
        )
        if start < 0:
            raise ValueError(f"could not find Wyoming contest columns for {contest_label!r}")
        end = len(header_row)
        for index in range(start + 1, len(header_row)):
            if "under" in _label(_value(header_row, index)).lower():
                end = index + 1
                break

    columns = [
        (index, _label(_value(header_row, index)))
        for index in range(start, end)
        if _label(_value(header_row, index))
    ]
    if not columns:
        raise ValueError(f"Wyoming contest {contest_label!r} has no candidate columns")
    return columns


def _workbook_rows(archive: zipfile.ZipFile, entry_name: str, sheet_name: str | None = None) -> list[list[Any]]:
    data = archive.read(entry_name)
    sheets = xlsx_sheet_names_bytes(data)
    sheet = sheet_name if sheet_name in sheets else sheets[0]
    return read_xlsx_sheet_bytes(data, sheet)


def _president_header_index(rows: list[list[Any]]) -> int:
    header_index = next(
        (
            index
            for index, row in enumerate(rows[:-1])
            if any("United States President" in _label(value) for value in row)
        ),
        None,
    )
    if header_index is not None:
        return header_index
    header_index = next(
        (
            index
            for index in range(len(rows) - 1)
            if any("romney" in _label(value).lower() for value in rows[index + 1])
            and any("obama" in _label(value).lower() for value in rows[index + 1])
        ),
        None,
    )
    if header_index is None:
        raise ValueError("could not locate Wyoming President header row")
    return header_index


def _presidential_result_rows(
    rows: list[list[Any]],
    source_id: str,
    county_override: str | None = None,
) -> list[dict[str, Any]]:
    header_index = _president_header_index(rows)
    contest_row = rows[header_index]
    candidate_row = rows[header_index + 1]
    columns = _contest_columns(
        contest_row,
        candidate_row,
        "United States President",
        fallback_candidate_contains=("romney", "obama"),
    )
    totals: dict[str, dict[str, int]] = {}
    for row in rows[header_index + 2 :]:
        county = _county_name(county_override or _value(row, 0))
        if not county:
            continue
        bucket_totals = totals.setdefault(county, {"dem": 0, "rep": 0, "other": 0})
        for index, label in columns:
            bucket = _candidate_bucket(label)
            if bucket:
                bucket_totals[bucket] += _int_text(_value(row, index))

    output = []
    for county, votes in totals.items():
        total = votes["dem"] + votes["rep"] + votes["other"]
        if total <= 0:
            continue
        output.append(
            {
                "jurisdictionName": county,
                "jurisdictionCode": county.upper().replace(" COUNTY", ""),
                "level": "county",
                "votes": {"Trump": votes["rep"], "Harris": votes["dem"], "Other": votes["other"]},
                "totalVotes": total,
                "margin": votes["rep"] - votes["dem"],
                "marginPct": _pct(votes["rep"] - votes["dem"], total),
                "sourceId": source_id,
            }
        )
    return sorted(output, key=lambda row: row["jurisdictionName"])


def _county_from_2012_entry(entry_name: str) -> str:
    name = Path(entry_name).stem
    name = re.sub(r"^2012_", "", name)
    name = re.sub(r"_General_PbP$", "", name)
    return _county_name(name.replace("_", " "))


def _result_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> list[dict[str, Any]]:
    section = config.raw["certifiedResults"]
    source = sources[section["sourceId"]]
    with zipfile.ZipFile(_artifact_path(source)) as archive:
        rows = _workbook_rows(archive, section["summaryEntry"], section.get("summarySheet"))
    return _presidential_result_rows(rows, source.id)


def _precinct_label(value: Any) -> str:
    if isinstance(value, (int, float)) and value >= 40000:
        return (datetime(1899, 12, 30) + timedelta(days=int(value))).strftime("%m-%d")
    return _label(value)


def _review_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw["reviewCharts"]
    source = sources[section["sourceId"]]
    comparison_label = section.get("comparisonContest", "U.S. Senate")
    comparison_source_label = section.get("comparisonSourceLabel", "United States Senator")
    review_rows: list[dict[str, Any]] = []
    zero_presidential_rows = 0

    with zipfile.ZipFile(_artifact_path(source)) as archive:
        workbook_data = archive.read(section["precinctEntry"])
    for sheet in xlsx_sheet_names_bytes(workbook_data):
        rows = read_xlsx_sheet_bytes(workbook_data, sheet)
        try:
            header_index = _president_header_index(rows)
        except ValueError:
            continue
        contest_row = rows[header_index]
        candidate_row = rows[header_index + 1]
        president_columns = _contest_columns(contest_row, candidate_row, "United States President")
        comparison_columns = _contest_columns(contest_row, candidate_row, comparison_source_label)
        county = _county_name(sheet)

        for row in rows[header_index + 2 :]:
            local_unit = _precinct_label(_value(row, 0))
            if not local_unit or local_unit.lower().startswith("total"):
                continue
            president = {"dem": 0, "rep": 0, "other": 0}
            comparison = {"dem": 0, "rep": 0, "other": 0}
            for index, label in president_columns:
                bucket = _candidate_bucket(label)
                if bucket:
                    president[bucket] += _int_text(_value(row, index))
            for index, label in comparison_columns:
                bucket = _candidate_bucket(label)
                if bucket:
                    comparison[bucket] += _int_text(_value(row, index))
            total = president["dem"] + president["rep"] + president["other"]
            if total <= 0:
                zero_presidential_rows += 1
                continue
            review_rows.append(
                {
                    "county": county,
                    "localUnit": local_unit,
                    "totalVotes": total,
                    "harris": president["dem"],
                    "trump": president["rep"],
                    "harrisShare": _pct(president["dem"], total),
                    "trumpShare": _pct(president["rep"], total),
                    "demDropoff": _pct(president["dem"] - comparison["dem"], total),
                    "repDropoff": _pct(president["rep"] - comparison["rep"], total),
                    "coverageMode": section.get("coverageMode", "presidentVsSenate"),
                    "comparisonContest": comparison_label,
                    "comparisonDemVotes": comparison["dem"],
                    "comparisonRepVotes": comparison["rep"],
                    "comparisonOtherVotes": comparison["other"],
                    "sourceId": source.id,
                }
            )

    return sorted(review_rows, key=lambda row: (row["county"], row["localUnit"])), {
        "nativeComparisonRows": len(review_rows),
        "nativeComparisonContest": comparison_label,
        "nativeReviewPresidentialVotes": sum(row["totalVotes"] for row in review_rows),
        "nativeZeroPresidentialPrecinctRows": zero_presidential_rows,
    }


def _historical_rows(config: EtlConfig, sources: dict[str, SourceConfig]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    section = config.raw.get("historicalBaselines", {})
    if section.get("format") != "wyomingSosGeneralZip":
        return [], {"nativeHistoricalRows": 0}
    rows: list[dict[str, Any]] = []
    for source_id in section.get("sourceIds", []):
        source = sources[source_id]
        year_match = re.search(r"wy-(\d{4})-", source_id)
        if not year_match:
            raise ValueError(f"Wyoming historical source id lacks year: {source_id}")
        year = int(year_match.group(1))
        with zipfile.ZipFile(_artifact_path(source)) as archive:
            if year in {2016, 2020}:
                entry = next(
                    name for name in archive.namelist()
                    if "Statewide_Candidates_Summary" in name or "Statewide Candidates" in name
                )
                result_rows = _presidential_result_rows(_workbook_rows(archive, entry), source.id)
            else:
                result_rows = []
                for entry in archive.namelist():
                    lowered = entry.lower()
                    if not lowered.endswith(".xlsx") or "pbp" not in lowered or "tbc" in lowered:
                        continue
                    result_rows.extend(
                        _presidential_result_rows(
                            _workbook_rows(archive, entry),
                            source.id,
                            _county_from_2012_entry(entry),
                        )
                    )
        for result in result_rows:
            rows.append(
                {
                    "electionYear": year,
                    "sourceId": source.id,
                    "sourceLevel": "county",
                    "rowMethod": "wyomingSosGeneralZip",
                    "jurisdictionName": result["jurisdictionName"],
                    "localUnit": result["jurisdictionName"],
                    "demVotes": result["votes"]["Harris"],
                    "repVotes": result["votes"]["Trump"],
                    "otherVotes": result["votes"]["Other"],
                    "totalVotes": result["totalVotes"],
                    "sourceUrl": source.url,
                    "sourceDocumentId": source.id,
                }
            )
    expected_rows = _int_text(section.get("expected", {}).get("rowCount"))
    if expected_rows and len(rows) != expected_rows:
        raise ValueError(f"Wyoming historical baseline expected {expected_rows} rows, got {len(rows)}")
    return sorted(rows, key=lambda row: (row["electionYear"], row["jurisdictionName"])), {
        "nativeHistoricalRows": len(rows),
        "nativeHistoricalYears": sorted({row["electionYear"] for row in rows}),
        "nativeHistoricalWarning": section.get("warning", ""),
    }


def build_wyoming_sos_general_zip_rows(
    config: EtlConfig,
    sources: dict[str, SourceConfig],
    turnout_loader,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    result_rows = _result_rows(config, sources)
    review_rows, review_metrics = _review_rows(config, sources)
    turnout_rows, turnout_metrics = turnout_loader(config, sources)
    historical_rows, historical_metrics = _historical_rows(config, sources)
    metrics = {
        "nativeResultRows": len(result_rows),
        "nativeResultTotalVotes": sum(row["totalVotes"] for row in result_rows),
        "nativeTrumpVotes": sum(row["votes"]["Trump"] for row in result_rows),
        "nativeHarrisVotes": sum(row["votes"]["Harris"] for row in result_rows),
        "nativeOtherVotes": sum(row["votes"]["Other"] for row in result_rows),
        "nativeReviewRows": len(review_rows),
        "nativeReviewWarning": config.raw.get("reviewCharts", {}).get("warning", ""),
        **review_metrics,
        **turnout_metrics,
        **historical_metrics,
    }
    metrics["nativeReviewCertifiedVoteGap"] = metrics["nativeResultTotalVotes"] - metrics["nativeReviewPresidentialVotes"]
    return result_rows, review_rows, turnout_rows, historical_rows, metrics
