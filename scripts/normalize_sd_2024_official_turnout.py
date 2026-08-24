"""Normalize South Dakota's official 2024 county active-voter turnout table."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "data/sd-2024-official-election-returns.pdf"
OUT = ROOT / "data/sd-2024-official-active-voter-turnout.csv"
REPORT = ROOT / "data/sd-2024-official-turnout-reconciliation.json"
ENR = ROOT / "data/sd-2024-general-turnout-enr.json"
COUNTIES = ROOT / "data/sd-2024-general-president-county.csv"
URL = (
    "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
    "Post-Election-Audit-General/ElectionReturns2024.pdf"
)
PIN = {
    "bytes": 1_864_655,
    "sha256": "4e424a7b53972963b81e49a3fef63e8e66e37bdb00431d894b3a55da041887d0",
}
EXPECTED = {
    "rows": 66,
    "active_voters": 624_175,
    "ballots_cast": 436_478,
}
FIELDS = [
    "state",
    "election_year",
    "jurisdiction_name",
    "county",
    "local_unit",
    "level",
    "ballots_cast",
    "registered_voters",
    "turnout_pct",
    "denominator_type",
    "denominator_timing",
    "denominator_note",
    "warning_required",
    "source_url",
    "source_title",
    "source_status",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Download and verify the pinned official PDF.")
    parser.add_argument("--check", action="store_true", help="Fail if normalized artifacts are stale.")
    args = parser.parse_args()
    if args.collect and args.check:
        parser.error("use either --collect or --check, not both")
    return args


def source_bytes(collect: bool) -> bytes:
    if not collect:
        if not PDF.exists():
            raise FileNotFoundError(f"Missing {PDF.relative_to(ROOT)}; rerun with --collect")
        return PDF.read_bytes()
    request = urllib.request.Request(
        URL,
        headers={"User-Agent": "CivicResultMaps public-source acquisition (CivicResultMaps.org)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise ValueError(f"Official PDF request returned HTTP {response.status}")
        data = response.read()
    if not data.startswith(b"%PDF-"):
        raise ValueError("Official source did not return a PDF")
    return data


def verify_pdf(data: bytes) -> dict[str, int | str]:
    actual = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    if actual != PIN:
        raise ValueError(f"Pinned official returns PDF drifted: expected={PIN}, actual={actual}")
    return actual


def number(value: str) -> int:
    return int(value.replace(",", ""))


def canonical_counties() -> set[str]:
    with COUNTIES.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != EXPECTED["rows"]:
        raise ValueError(f"Expected 66 certified county rows, got {len(rows)}")
    return {row["jurisdiction_name"].removesuffix(" County") for row in rows}


def turnout_rows(pdf_bytes: bytes) -> list[dict[str, int | float | str]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if len(reader.pages) != 63:
        raise ValueError(f"Expected 63 official-return pages, got {len(reader.pages)}")
    text = reader.pages[22].extract_text()
    if "2024 GENERAL ELECTION" not in text or "Voter Turnout" not in text:
        raise ValueError("Expected 2024 General Election turnout table on PDF page 23")
    text = re.sub(r"Oglala\s*\nLakota", "Oglala Lakota", text)
    pattern = re.compile(r"^([A-Za-z][A-Za-z ]*?)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s*$")
    rows: list[dict[str, int | float | str]] = []
    reported_total: tuple[int, int, float] | None = None
    for raw_line in text.splitlines():
        match = pattern.match(raw_line.strip())
        if not match:
            continue
        county, denominator, ballots, turnout = match.groups()
        values = (number(denominator), number(ballots), float(turnout))
        if county == "TOTAL":
            reported_total = values
            continue
        rows.append(
            {
                "county": county,
                "active_voters": values[0],
                "ballots_cast": values[1],
                "turnout_pct": values[2],
            }
        )
    if len(rows) != EXPECTED["rows"]:
        raise ValueError(f"Expected 66 official turnout rows, got {len(rows)}")
    if {str(row["county"]) for row in rows} != canonical_counties():
        raise ValueError("Official turnout and certified-result county names differ")
    if reported_total != (EXPECTED["active_voters"], EXPECTED["ballots_cast"], 69.93):
        raise ValueError(f"Unexpected official turnout total row: {reported_total}")
    if sum(int(row["active_voters"]) for row in rows) != EXPECTED["active_voters"]:
        raise ValueError("Official county active-voter rows do not sum to the reported total")
    if sum(int(row["ballots_cast"]) for row in rows) != EXPECTED["ballots_cast"]:
        raise ValueError("Official county ballots-cast rows do not sum to the reported total")
    for row in rows:
        calculated = round((int(row["ballots_cast"]) / int(row["active_voters"])) * 100, 2)
        if calculated != row["turnout_pct"]:
            raise ValueError(f"Turnout percentage mismatch for {row['county']}: {calculated} != {row['turnout_pct']}")
    return sorted(rows, key=lambda row: str(row["county"]))


def registration_semantics(pdf_bytes: bytes) -> dict[str, object]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = "\n".join((reader.pages[index].extract_text() or "") for index in (19, 20))
    if "Voter Registration Totals as of November 5, 2024" not in text:
        raise ValueError("Official registration table is missing its election-day timing label")
    if "Inactive Total Active" not in text:
        raise ValueError("Official registration table is missing its Inactive and Total Active columns")
    normalized = re.sub(r"\s+", " ", text)
    expected_total = "Total 145,984 316,496 960 67,301 2,976 63,901 624,175 90,381 77"
    if expected_total not in normalized:
        raise ValueError("Official registration table total row does not match the reviewed active/inactive totals")
    return {
        "pdfPages": [20, 21],
        "asOf": "November 5, 2024",
        "inactiveVoters": 63901,
        "totalActiveVoters": EXPECTED["active_voters"],
        "relationshipToTurnoutTable": "The turnout-table denominator total exactly matches the registration table's Total Active total.",
    }


def source_county(value: object) -> str:
    return re.sub(r"\s*\(Vote Center\)\s*$", "", str(value or ""), flags=re.IGNORECASE).strip()


def enr_reconciliation(rows: list[dict[str, int | float | str]]) -> dict[str, object]:
    payload = json.loads(ENR.read_text(encoding="utf-8"))
    source_rows = payload.get("d")
    if not isinstance(source_rows, list) or len(source_rows) != EXPECTED["rows"]:
        raise ValueError("Retained ElectionID 684 turnout payload must contain 66 county rows")
    enr_by_county = {source_county(row.get("CountyName")): row for row in source_rows}
    if len(enr_by_county) != EXPECTED["rows"]:
        raise ValueError("Retained ElectionID 684 turnout county keys are not unique")
    comparisons = []
    for row in rows:
        county = str(row["county"])
        source = enr_by_county.get(county)
        if source is None:
            raise ValueError(f"Retained ElectionID 684 turnout is missing {county}")
        comparisons.append(
            {
                "county": county,
                "officialActiveVoters": row["active_voters"],
                "enrVoters": int(source["Voters"]),
                "enrVotersMinusOfficialActive": int(source["Voters"]) - int(row["active_voters"]),
                "officialBallotsCast": row["ballots_cast"],
                "enrCalcVoterTurnout": int(source["calcVoterTurnout"]),
                "ballotsCastDelta": int(source["calcVoterTurnout"]) - int(row["ballots_cast"]),
            }
        )
    exact_ballot_rows = sum(row["ballotsCastDelta"] == 0 for row in comparisons)
    if exact_ballot_rows != EXPECTED["rows"]:
        raise ValueError(f"ElectionID 684 ballots do not match the official returns in {EXPECTED['rows'] - exact_ballot_rows} counties")
    return {
        "rows": comparisons,
        "summary": {
            "countyRows": len(comparisons),
            "exactBallotsCastRows": exact_ballot_rows,
            "enrBallotsCast": sum(int(row["enrCalcVoterTurnout"]) for row in comparisons),
            "officialBallotsCast": sum(int(row["officialBallotsCast"]) for row in comparisons),
            "enrVoters": sum(int(row["enrVoters"]) for row in comparisons),
            "officialActiveVoters": sum(int(row["officialActiveVoters"]) for row in comparisons),
            "enrVotersMinusOfficialActive": sum(int(row["enrVotersMinusOfficialActive"]) for row in comparisons),
        },
    }


def csv_bytes(rows: list[dict[str, int | float | str]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        county = f"{row['county']} County"
        writer.writerow(
            {
                "state": "SD",
                "election_year": 2024,
                "jurisdiction_name": county,
                "county": county,
                "local_unit": county,
                "level": "jurisdiction",
                "ballots_cast": row["ballots_cast"],
                "registered_voters": row["active_voters"],
                "turnout_pct": f"{float(row['turnout_pct']):.2f}",
                "denominator_type": "activeVoters",
                "denominator_timing": "electionDay",
                "denominator_note": "Official SOS active-voter denominator as of November 5, 2024; the turnout table labels the column Registered Voters and the registration table identifies the corresponding values as Total Active.",
                "warning_required": "false",
                "source_url": URL,
                "source_title": "South Dakota Official Election Returns and Registration Figures",
                "source_status": "official",
            }
        )
    return buffer.getvalue().encode("utf-8")


def output_or_check(path: Path, data: bytes, check: bool) -> None:
    if check:
        if not path.exists() or path.read_bytes() != data:
            raise ValueError(f"{path.relative_to(ROOT)} is stale; regenerate without --check")
        return
    path.write_bytes(data)


def main() -> None:
    args = parse_args()
    pdf_bytes = source_bytes(args.collect)
    pdf = verify_pdf(pdf_bytes)
    rows = turnout_rows(pdf_bytes)
    registration = registration_semantics(pdf_bytes)
    normalized = csv_bytes(rows)
    enr = enr_reconciliation(rows)
    report = {
        "schemaVersion": 1,
        "state": "SD",
        "electionId": "2024-11-05-general",
        "sourceAuthority": "South Dakota Secretary of State",
        "sourceUrl": URL,
        "localPdf": str(PDF.relative_to(ROOT)).replace("\\", "/"),
        "pdf": pdf,
        "parserOrNormalizationPath": "scripts/normalize_sd_2024_official_turnout.py",
        "sourceTable": {
            "pdfPage": 23,
            "reportingGrain": "county",
            "rowCount": len(rows),
            "denominatorType": "activeVoters",
            "denominatorTiming": "November 5, 2024",
            "activeVoters": EXPECTED["active_voters"],
            "ballotsCast": EXPECTED["ballots_cast"],
            "turnoutPct": 69.93,
            "registrationSemanticsEvidence": registration,
        },
        "normalizedArtifact": {
            "localFile": str(OUT.relative_to(ROOT)).replace("\\", "/"),
            "byteCount": len(normalized),
            "sha256": hashlib.sha256(normalized).hexdigest(),
        },
        "electionId684Comparison": enr,
        "activeSourceDecision": {
            "decision": "activate_official_active_voter_turnout",
            "reason": "The official returns provide complete county rows, election-day timing, and an active-voter denominator. ElectionID 684 calcVoterTurnout matches all 66 official ballots-cast rows, while its Voters field remains a separate untimestamped lead 1,017 above the official active total.",
            "eacDisposition": "Retain EAC total-registration turnout as fallback provenance, not the active South Dakota denominator.",
        },
        "caveats": [
            "Turnout percentages use active voters, not all registered voters; the website must label the denominator accordingly.",
            "The ElectionID 684 Voters field is not substituted for the official-return active-voter table because it totals 1,017 higher and has no snapshot timestamp.",
            "The 739-vote difference from EAC ballots cast is a cross-source reporting difference, not an error or misconduct claim.",
        ],
    }
    report_bytes = (json.dumps(report, indent=2) + "\n").encode("utf-8")
    if args.collect and not args.check:
        PDF.write_bytes(pdf_bytes)
    output_or_check(OUT, normalized, args.check)
    output_or_check(REPORT, report_bytes, args.check)
    print(
        json.dumps(
            {
                "mode": "check" if args.check else "collect" if args.collect else "normalize",
                "turnoutRows": len(rows),
                "activeVoters": EXPECTED["active_voters"],
                "ballotsCast": EXPECTED["ballots_cast"],
                "enrComparison": enr["summary"],
                "outputs": [str(OUT.relative_to(ROOT)), str(REPORT.relative_to(ROOT))],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
