"""Verify current South Dakota county staging rows against the official 2024 canvass PDF."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "data/sd-2024-general-canvass-certificate.pdf"
PRESIDENT = ROOT / "data/sd-2024-general-president-county.csv"
HOUSE = ROOT / "data/sd-2024-general-us-house-county.csv"
OUT = ROOT / "data/sd-2024-general-canvass-reconciliation.json"
URL = "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/Recount-Canvass-and-Canvass-Docs-General/2024GeneralElectionCanvassWithCert.pdf"
PIN = {"bytes": 801624, "sha256": "a9be018609c45e97c5b9b9c41d7f53dffc9c3390746486c115739e6d6d072c9c"}


def number(value: str) -> int:
    text = value.replace(",", "")
    if not text.isdigit():
        raise ValueError(f"Invalid certified count: {value!r}")
    return int(text)


def current_rows(path: Path, fields: tuple[str, ...]) -> dict[str, tuple[int, ...]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        raw_rows = list(reader)
    if len(raw_rows) != 66:
        raise ValueError(f"Expected 66 current rows in {path.name}, got {len(raw_rows)}")
    rows: dict[str, tuple[int, ...]] = {}
    for row in raw_rows:
        county = row["jurisdiction_name"].removesuffix(" County")
        if county in rows:
            raise ValueError(f"Duplicate current county row: {county}")
        rows[county] = tuple(number(row[field]) for field in fields)
    return rows


def table_rows(pages: tuple[int, int], columns: int) -> dict[str, tuple[int, ...]]:
    lines = []
    reader = PdfReader(PDF)
    for page in pages:
        lines.extend(reader.pages[page].extract_text().splitlines())
    output: dict[str, tuple[int, ...]] = {}
    pattern = re.compile(r"^(.*?)\s+" + r"\s+".join(r"([\d,]+)" for _ in range(columns)) + r"$")
    for line in lines:
        match = pattern.match(line.strip())
        if not match:
            continue
        county, *values = match.groups()
        if county == "Total":
            continue
        if county in output:
            raise ValueError(f"Duplicate certified county row: {county}")
        output[county] = tuple(number(value) for value in values)
    if len(output) != 66:
        raise ValueError(f"Expected 66 certified county rows, got {len(output)}")
    return output


def assert_exact(label: str, certified: dict[str, tuple[int, ...]], current: dict[str, tuple[int, ...]]) -> dict[str, int]:
    if set(certified) != set(current):
        raise ValueError(f"{label} county names differ: certified-only={sorted(set(certified) - set(current))}; current-only={sorted(set(current) - set(certified))}")
    mismatches = {county: {"certified": certified[county], "current": current[county]} for county in certified if certified[county] != current[county]}
    if mismatches:
        raise ValueError(f"{label} county values differ: {mismatches}")
    return {"rows": len(certified), "totals": [sum(row[index] for row in certified.values()) for index in range(len(next(iter(certified.values()))))]}


def main() -> None:
    bytes_ = PDF.read_bytes()
    actual = {"bytes": len(bytes_), "sha256": hashlib.sha256(bytes_).hexdigest()}
    if actual != PIN:
        raise ValueError(f"Pinned certified canvass PDF drifted: expected={PIN}, actual={actual}")
    # PDF pages 2-3 contain President (four candidate columns); pages 4-5 contain U.S. House.
    certified_president = table_rows((1, 2), 4)
    certified_house = table_rows((3, 4), 2)
    president = current_rows(PRESIDENT, ("harris", "trump", "other"))
    # The certificate exposes Libertarian and Independent separately; the
    # current source contract intentionally combines them as Other.
    certified_president_combined = {
        county: (values[0], values[2], values[1] + values[3])
        for county, values in certified_president.items()
    }
    house = current_rows(HOUSE, ("comparison_dem", "comparison_rep"))
    report = {
        "sourceAuthority": "South Dakota Secretary of State State Board of Canvassers",
        "sourceUrl": URL,
        "localPdf": str(PDF.relative_to(ROOT)).replace("\\", "/"),
        "pdf": actual,
        "election": {"date": "2024-11-05", "type": "General"},
        "certification": "The PDF certificate states that the attached returns are a true and correct record of votes certified to the Secretary of State.",
        "president": assert_exact("President", certified_president_combined, president),
        "usHouse": assert_exact("U.S. House", certified_house, house),
        "caveat": "The certificate validates county candidate totals, not the ElectionID 684 turnout/registration fields. EAC remains the active turnout source until compatible certified voter-participation and registration rows are collected.",
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
