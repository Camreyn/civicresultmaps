"""Normalize official South Dakota 2012, 2016, and 2020 county presidential results."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/sd-historical-presidential-baseline.csv"
REPORT = ROOT / "data/sd-historical-presidential-baseline-summary.json"
COUNTIES = ROOT / "data/sd-2024-general-president-county.csv"
SOURCE_ID = "sd-historical-presidential-official-county"
ROW_METHOD = "sdOfficialCountyPresidentialPdfTable"
HISTORICAL_COUNTY_ALIASES = {
    (2012, "Shannon"): "Oglala Lakota",
}
FIELDS = [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "source_display_name",
    "source_id",
    "source_level",
    "row_method",
    "source_url",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
]


@dataclass(frozen=True)
class Source:
    year: int
    artifact_id: str
    title: str
    url: str
    local_pdf: str
    byte_count: int
    sha256: str
    pages: int
    table_page: int
    columns: int
    dem_index: int
    rep_index: int
    other_indexes: tuple[int, ...]
    reported_total_index: int | None
    required_text: str
    expected: dict[str, int]

    @property
    def path(self) -> Path:
        return ROOT / self.local_pdf


SOURCES = (
    Source(
        year=2012,
        artifact_id="sd-2012-general-official-statewide-candidates-county",
        title="South Dakota 2012 General Election Official Results - Presidential Electors by County",
        url="https://sdsos.gov/elections-voting/assets/Archive/2012%20Assets/2012generalelectionstatewidecandidatesbycounty.pdf",
        local_pdf="data/sd-2012-general-official-statewide-candidates-county.pdf",
        byte_count=177_676,
        sha256="cd1b353d116b18c24a06c686be793e9310091339e1e1635e934d542cbf816a8b",
        pages=4,
        table_page=1,
        columns=5,
        dem_index=0,
        rep_index=1,
        other_indexes=(2, 3),
        reported_total_index=4,
        required_text="2012 General Election - OFFICIAL RESULTS",
        expected={"rows": 66, "dem": 145_039, "rep": 210_610, "other": 8_166, "total": 363_815},
    ),
    Source(
        year=2016,
        artifact_id="sd-2016-official-election-returns",
        title="South Dakota 2016 Official Election Returns and Registration Figures",
        url="https://sdsos.gov/elections-voting/assets/Archive/Prior%20to%202026/ElectionReturns2016_Web.pdf",
        local_pdf="data/sd-2016-official-election-returns.pdf",
        byte_count=431_448,
        sha256="e9b841ce1b5fd109dc9bead72a3748c6bf9075b08199595d5dc7201d89c3040f",
        pages=48,
        table_page=14,
        columns=4,
        dem_index=2,
        rep_index=0,
        other_indexes=(1, 3),
        reported_total_index=None,
        required_text="2016 GENERAL ELECTION",
        expected={"rows": 66, "dem": 117_458, "rep": 227_721, "other": 24_914, "total": 370_093},
    ),
    Source(
        year=2020,
        artifact_id="sd-2020-general-official-state-canvass",
        title="South Dakota 2020 General Election Official State Canvass Results",
        url="https://sdsos.gov/elections-voting/assets/Archive/2020%20Assests/2020GeneralStateCanvassFinal%26Certificate.pdf",
        local_pdf="data/sd-2020-general-official-state-canvass.pdf",
        byte_count=823_991,
        sha256="34ad25189dd9fb4d6a83d30486a97502ef0a26cfcd09ec1f01f9e5895f2d5d22",
        pages=17,
        table_page=2,
        columns=3,
        dem_index=2,
        rep_index=0,
        other_indexes=(1,),
        reported_total_index=None,
        required_text="General Election - November 3, 2020",
        expected={"rows": 66, "dem": 150_471, "rep": 261_043, "other": 11_095, "total": 422_609},
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Download and verify all pinned official PDFs.")
    parser.add_argument("--check", action="store_true", help="Fail if normalized artifacts are stale.")
    args = parser.parse_args()
    if args.collect and args.check:
        parser.error("use either --collect or --check, not both")
    return args


def canonical_counties() -> set[str]:
    with COUNTIES.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    counties = {row["jurisdiction_name"].removesuffix(" County") for row in rows}
    if len(rows) != 66 or len(counties) != 66:
        raise ValueError(f"Expected 66 unique South Dakota counties, got rows={len(rows)}, unique={len(counties)}")
    return counties


def download(source: Source) -> bytes:
    request = urllib.request.Request(
        source.url,
        headers={"User-Agent": "CivicResultMaps public-source acquisition (CivicResultMaps.org)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise ValueError(f"{source.artifact_id} returned HTTP {response.status}")
        data = response.read()
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"{source.artifact_id} did not return a PDF")
    return data


def source_bytes(source: Source, collect: bool) -> bytes:
    if collect:
        return download(source)
    if not source.path.exists():
        raise FileNotFoundError(f"Missing {source.local_pdf}; rerun with --collect")
    return source.path.read_bytes()


def verify_pdf(source: Source, data: bytes) -> dict[str, int | str]:
    actual = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    expected = {"bytes": source.byte_count, "sha256": source.sha256}
    if actual != expected:
        raise ValueError(f"Pinned {source.artifact_id} PDF drifted: expected={expected}, actual={actual}")
    return actual


def number(value: str) -> int:
    return int(value.replace(",", ""))


def parse_rows(source: Source, data: bytes, counties: set[str]) -> list[dict[str, int | str]]:
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) != source.pages:
        raise ValueError(f"{source.artifact_id} expected {source.pages} pages, got {len(reader.pages)}")
    text = reader.pages[source.table_page - 1].extract_text()
    normalized_text = re.sub(r"\s+", " ", text)
    if source.required_text not in normalized_text or "County" not in text:
        raise ValueError(f"{source.artifact_id} expected presidential county table on PDF page {source.table_page}")

    pattern = re.compile(
        r"^(.*?)\s+" + r"\s+".join(r"([\d,]+)" for _ in range(source.columns)) + r"$"
    )
    parsed: dict[str, dict[str, int | str]] = {}
    for raw_line in text.splitlines():
        match = pattern.match(raw_line.strip())
        if not match:
            continue
        source_county, *raw_values = match.groups()
        county = HISTORICAL_COUNTY_ALIASES.get((source.year, source_county), source_county)
        if county not in counties:
            continue
        if county in parsed:
            raise ValueError(f"{source.year} duplicate official county row: {county}")
        values = [number(value) for value in raw_values]
        dem = values[source.dem_index]
        rep = values[source.rep_index]
        other = sum(values[index] for index in source.other_indexes)
        total = dem + rep + other
        if source.reported_total_index is not None and total != values[source.reported_total_index]:
            raise ValueError(
                f"{source.year} {county} candidate sum {total} differs from reported total "
                f"{values[source.reported_total_index]}"
            )
        county_name = f"{county} County"
        parsed[county] = {
            "state": "SD",
            "election_year": source.year,
            "jurisdiction_name": county_name,
            "county": county_name,
            "local_unit": county_name,
            "source_display_name": f"{source_county} County",
            "source_id": SOURCE_ID,
            "source_level": "county",
            "row_method": ROW_METHOD,
            "source_url": source.url,
            "dem_votes": dem,
            "rep_votes": rep,
            "other_votes": other,
            "total_votes": total,
        }

    missing = sorted(counties - set(parsed))
    unexpected = sorted(set(parsed) - counties)
    if missing or unexpected:
        raise ValueError(f"{source.year} county identity mismatch: missing={missing}, unexpected={unexpected}")
    return [parsed[county] for county in sorted(parsed)]


def totals(rows: list[dict[str, int | str]]) -> dict[str, int]:
    return {
        "rows": len(rows),
        "dem": sum(int(row["dem_votes"]) for row in rows),
        "rep": sum(int(row["rep_votes"]) for row in rows),
        "other": sum(int(row["other_votes"]) for row in rows),
        "total": sum(int(row["total_votes"]) for row in rows),
    }


def csv_bytes(rows: list[dict[str, int | str]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def output_or_check(path: Path, data: bytes, check: bool) -> None:
    if check:
        if not path.exists() or path.read_bytes() != data:
            raise ValueError(f"{path.relative_to(ROOT)} is stale; regenerate without --check")
        return
    path.write_bytes(data)


def main() -> None:
    args = parse_args()
    counties = canonical_counties()
    all_rows: list[dict[str, int | str]] = []
    source_reports: list[dict[str, object]] = []
    retained: list[tuple[Source, bytes]] = []

    for source in SOURCES:
        data = source_bytes(source, args.collect)
        pdf = verify_pdf(source, data)
        rows = parse_rows(source, data, counties)
        actual_totals = totals(rows)
        if actual_totals != source.expected:
            raise ValueError(
                f"{source.year} official totals did not reconcile: "
                f"expected={source.expected}, actual={actual_totals}"
            )
        all_rows.extend(rows)
        retained.append((source, data))
        source_reports.append(
            {
                "id": source.artifact_id,
                "year": source.year,
                "sourceTitle": source.title,
                "sourceUrl": source.url,
                "localPdf": source.local_pdf,
                "pdf": pdf,
                "pdfPages": source.pages,
                "tablePage": source.table_page,
                "reportingGrain": "county",
                "totals": actual_totals,
            }
        )

    normalized = csv_bytes(all_rows)
    report = {
        "schemaVersion": 1,
        "state": "SD",
        "sourceAuthority": "South Dakota Secretary of State",
        "sourceId": SOURCE_ID,
        "parserOrNormalizationPath": "scripts/normalize_sd_historical_presidential_baseline.py",
        "sources": source_reports,
        "normalizedArtifact": {
            "localFile": str(OUT.relative_to(ROOT)).replace("\\", "/"),
            "rowCount": len(all_rows),
            "years": [source.year for source in SOURCES],
            "byteCount": len(normalized),
            "sha256": hashlib.sha256(normalized).hexdigest(),
        },
        "caveat": (
            "These are official county presidential baselines for historical context. "
            "The 2012 source's Shannon County row is normalized to Oglala Lakota County, "
            "the county's current canonical name. "
            "They do not establish 2024 precinct geometry or a 2024 result-to-feature crosswalk."
        ),
    }
    report_bytes = (json.dumps(report, indent=2) + "\n").encode("utf-8")

    if args.collect and not args.check:
        for source, data in retained:
            source.path.write_bytes(data)
    output_or_check(OUT, normalized, args.check)
    output_or_check(REPORT, report_bytes, args.check)
    print(
        json.dumps(
            {
                "mode": "check" if args.check else "collect" if args.collect else "normalize",
                "historicalRows": len(all_rows),
                "years": [source.year for source in SOURCES],
                "outputs": [str(OUT.relative_to(ROOT)), str(REPORT.relative_to(ROOT))],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
