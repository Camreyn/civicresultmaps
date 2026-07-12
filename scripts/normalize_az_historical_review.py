#!/usr/bin/env python3
"""Normalize official Arizona 2016/2020 county President-vs-Senate rows.

The 2016 signed canvass is a scanned, text-layer PDF. Most numeric glyphs are
available through the text layer, but 38 printed one-vote cells are absent from
that layer. Those cells are identified below by candidate and county after
visual review of rendered pages 1-11. Every candidate row must reconcile to the
statewide total printed in the official canvass or this script fails closed.

The 2020 source is the official detailed election-result XML ZIP. All choices
other than the named Democratic and Republican nominees are summed into the
"other" bucket for each contest.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from zipfile import ZipFile


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_2016_PDF = REPO_ROOT / "data" / "az-2016-general-official-signed-state-canvass.pdf"
DEFAULT_2020_ZIP = REPO_ROOT / "data" / "az-2020-general-results-detail.xml.zip"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "az-historical-review-rows.csv"
DEFAULT_RECONCILIATION = REPO_ROOT / "data" / "az-historical-review-reconciliation.json"

SOURCE_2016_ID = "az-2016-general-official-signed-state-canvass"
SOURCE_2016_URL = (
    "https://apps.azsos.gov/election/2016/General/"
    "Official%20Signed%20State%20Canvass.pdf"
)
SOURCE_2020_ID = "az-2020-general-results-detail-xml"
SOURCE_2020_URL = "https://apps.azsos.gov/election/2020/resultsdetail_2020generalxml.zip"

EXPECTED_SOURCE_ARTIFACTS = {
    2016: {
        "bytes": 9_624_192,
        "sha256": "a765b3d03bcbdcaba4e3e869bd24cbb6dc2288841d7848eaa18b46e099ccaada",
    },
    2020: {
        "bytes": 1_808_603,
        "sha256": "542f2e4d60463d6ad23b78e2de0f73759806945c6bcaedc6c0a7dd7aec422c06",
    },
}

COUNTIES = [
    ("Apache", "04001"),
    ("Cochise", "04003"),
    ("Coconino", "04005"),
    ("Gila", "04007"),
    ("Graham", "04009"),
    ("Greenlee", "04011"),
    ("La Paz", "04012"),
    ("Maricopa", "04013"),
    ("Mohave", "04015"),
    ("Navajo", "04017"),
    ("Pima", "04019"),
    ("Pinal", "04021"),
    ("Santa Cruz", "04023"),
    ("Yavapai", "04025"),
    ("Yuma", "04027"),
]
COUNTY_NAMES = [name for name, _ in COUNTIES]

# Right edges of the 15 county columns and statewide TOTAL column in the
# landscape 2016 canvass. The scan is slightly skewed, so a small tolerance is
# applied when assigning text-layer words to these columns.
PDF_COLUMN_RIGHT_EDGES = [
    200.5,
    238.5,
    276.7,
    315.0,
    353.1,
    391.3,
    429.4,
    467.3,
    504.1,
    543.0,
    580.9,
    619.0,
    656.5,
    694.4,
    732.6,
    771.5,
]


@dataclass(frozen=True)
class LayoutRow:
    name: str
    probe: str
    page: int
    top: float


PRESIDENT_2016_ROWS = [
    LayoutRow("Robert L. Buchanan", "ROBERT L. BUCHANAN", 1, 168.6),
    LayoutRow("Willie Felix Carter", "WILLIE FELIX CARTER", 1, 374.2),
    LayoutRow("Darrell Castle", "DARRELL CASTLE", 2, 92.7),
    LayoutRow("Hillary Clinton", "HILLARY CLINTON", 2, 298.6),
    LayoutRow("Michael Corsetti", "MICHAEL CORSETTI", 3, 90.9),
    LayoutRow("Rocky Roque De La Fuente", "ROQUE DE LA FUENTE", 3, 297.7),
    LayoutRow("Cherunda Fox", "CHERUNDA FOX", 4, 90.1),
    LayoutRow("Ben Hartnell", "BEN HARTNELL", 4, 296.8),
    LayoutRow("Tom Hoefling", "TOM HOEFLING", 5, 91.2),
    LayoutRow("Mitchell In-Albon", "MITCHELL IN-ALBON", 5, 297.8),
    LayoutRow("Gary Johnson", "GARY JOHNSON", 6, 90.1),
    LayoutRow("Laurence Kotlikoff", "LAURENCE KOTLIKOFF", 6, 296.5),
    LayoutRow("Joseph Maldonado", "JOSEPH MALDONADO", 7, 90.7),
    LayoutRow("Evan McMullin", "EVAN MCMULLIN", 7, 297.1),
    LayoutRow("Marshall Schoenke", "MARSHALL SCHOENKE", 8, 92.1),
    LayoutRow("Mike Smith", "MIKE SMITH", 8, 298.2),
    LayoutRow("Jill Stein", "JILL STEIN", 9, 90.1),
    LayoutRow("Delano Steinacker", "DELANO STEINACKER", 9, 297.4),
    LayoutRow("Sheila Samm Titile", "SHEILA \"SAMM\" TITILE", 10, 90.8),
    LayoutRow("Donald J. Trump", "DONALD J. TRUMP", 10, 297.1),
]

SENATE_2016_ROWS = [
    LayoutRow("Sheila Bilyeu", "SHEILA BILYEU", 11, 90.4),
    LayoutRow("Ann Kirkpatrick", "ANN KIRKPATRICK", 11, 104.8),
    LayoutRow("Gene Scott II", "GENE SCOTT II", 11, 119.8),
    LayoutRow("Gary Swing", "GARY SWING", 11, 134.1),
    LayoutRow("Sydney Dudikoff", "SYDNEY DUDIKOFF", 11, 148.4),
    LayoutRow("John McCain", "JOHN MCCAIN", 11, 162.8),
    LayoutRow("Anthony Camboni", "ANTHONY CAMBONI", 11, 177.3),
    LayoutRow("Santos Chavez", "SANTOS CHAVEZ", 11, 191.5),
    LayoutRow("Leonard Clark", "LEONARD CLARK", 11, 205.8),
    LayoutRow("Selena Lopez", "SELENA LOPEZ", 11, 220.0),
    LayoutRow("Pat Quinn", "PAT QUINN", 11, 234.2),
]

# The official page images visibly contain these one-vote cells, but the PDF's
# hidden text layer omits their glyphs. No other numeric correction is allowed.
TEXT_LAYER_SINGLE_VOTE_CORRECTIONS_2016 = {
    ("Robert L. Buchanan", "Navajo"),
    ("Robert L. Buchanan", "Yavapai"),
    ("Willie Felix Carter", "Coconino"),
    ("Willie Felix Carter", "Navajo"),
    ("Willie Felix Carter", "Pinal"),
    ("Darrell Castle", "Greenlee"),
    ("Rocky Roque De La Fuente", "Navajo"),
    ("Cherunda Fox", "Apache"),
    ("Cherunda Fox", "Navajo"),
    ("Ben Hartnell", "Navajo"),
    ("Ben Hartnell", "Pima"),
    ("Ben Hartnell", "Yavapai"),
    ("Tom Hoefling", "Coconino"),
    ("Tom Hoefling", "Mohave"),
    ("Tom Hoefling", "Navajo"),
    ("Tom Hoefling", "Yuma"),
    ("Mitchell In-Albon", "Mohave"),
    ("Laurence Kotlikoff", "Cochise"),
    ("Joseph Maldonado", "Apache"),
    ("Joseph Maldonado", "Coconino"),
    ("Joseph Maldonado", "Navajo"),
    ("Joseph Maldonado", "Pinal"),
    ("Marshall Schoenke", "Coconino"),
    ("Mike Smith", "Cochise"),
    ("Mike Smith", "Yuma"),
    ("Delano Steinacker", "Yuma"),
    ("Sheila Samm Titile", "Pinal"),
    ("Sheila Bilyeu", "Coconino"),
    ("Sheila Bilyeu", "Pinal"),
    ("Sheila Bilyeu", "Yuma"),
    ("Gene Scott II", "Yuma"),
    ("Sydney Dudikoff", "Santa Cruz"),
    ("Anthony Camboni", "Apache"),
    ("Anthony Camboni", "Coconino"),
    ("Anthony Camboni", "Yuma"),
    ("Leonard Clark", "Pinal"),
    ("Leonard Clark", "Yuma"),
    ("Selena Lopez", "Coconino"),
}

FIELDNAMES = [
    "state",
    "election_year",
    "county",
    "jurisdiction_tag",
    "local_unit",
    "level",
    "dem_candidate",
    "rep_candidate",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "comparison_contest",
    "comparison_dem_candidate",
    "comparison_rep_candidate",
    "comparison_dem_votes",
    "comparison_rep_votes",
    "comparison_other_votes",
    "coverage_mode",
    "source_id",
    "comparison_source_id",
    "source_url",
]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def assert_source_artifact(path: Path, year: int) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing official Arizona {year} artifact: {path}")
    actual = {"bytes": path.stat().st_size, "sha256": file_sha256(path)}
    expected = EXPECTED_SOURCE_ARTIFACTS[year]
    if actual != expected:
        raise ValueError(
            f"Arizona {year} artifact identity mismatch: expected {expected}, got {actual}"
        )
    return actual


def normalized_probe(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def extract_2016_layout_rows(pdf_path: Path) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    try:
        import pdfplumber  # type: ignore[import-not-found]
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "pdfplumber is required for the 2016 layout-aware canvass parser. "
            "Use the bundled Codex PDF runtime or install pdfplumber."
        ) from exc

    all_specs = PRESIDENT_2016_ROWS + SENATE_2016_ROWS
    parsed: dict[str, list[int]] = {}
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != 23:
            raise ValueError(f"Expected 23 pages in Arizona 2016 canvass, got {len(pdf.pages)}")
        for spec in all_specs:
            page = pdf.pages[spec.page - 1]
            page_text = normalized_probe(page.extract_text(layout=True) or "")
            if normalized_probe(spec.probe) not in page_text:
                raise ValueError(
                    f"Could not confirm {spec.name!r} on Arizona 2016 canvass page {spec.page}"
                )

            values = [0] * 16
            assigned: set[int] = set()
            for word in page.extract_words(use_text_flow=False, keep_blank_chars=False):
                text = str(word.get("text") or "")
                if abs(float(word["top"]) - spec.top) > 2.3:
                    continue
                if not re.fullmatch(r"\d[\d,]*", text):
                    continue
                if float(word["x1"]) <= 175:
                    continue
                column = min(
                    range(len(PDF_COLUMN_RIGHT_EDGES)),
                    key=lambda index: abs(float(word["x1"]) - PDF_COLUMN_RIGHT_EDGES[index]),
                )
                distance = abs(float(word["x1"]) - PDF_COLUMN_RIGHT_EDGES[column])
                if distance > 8.0:
                    continue
                if column in assigned:
                    raise ValueError(
                        f"Duplicate text-layer value for {spec.name}, column {column}: {text}"
                    )
                values[column] = int(text.replace(",", ""))
                assigned.add(column)

            for county_index, county in enumerate(COUNTY_NAMES):
                if (spec.name, county) not in TEXT_LAYER_SINGLE_VOTE_CORRECTIONS_2016:
                    continue
                if county_index in assigned or values[county_index] != 0:
                    raise ValueError(
                        f"Visual one-vote correction would overwrite extracted data: "
                        f"{spec.name}, {county}"
                    )
                values[county_index] = 1

            county_total = sum(values[:15])
            statewide_total = values[15]
            if not statewide_total or county_total != statewide_total:
                raise ValueError(
                    f"Arizona 2016 {spec.name} row does not reconcile: "
                    f"county sum {county_total}, printed total {statewide_total}"
                )
            parsed[spec.name] = values[:15]

    president = {spec.name: parsed[spec.name] for spec in PRESIDENT_2016_ROWS}
    senate = {spec.name: parsed[spec.name] for spec in SENATE_2016_ROWS}
    return president, senate


def contest_by_name(root: ET.Element, contest_name: str) -> ET.Element:
    contests = root.find("contests")
    if contests is None:
        raise ValueError("Arizona 2020 XML is missing contests")
    matches = [
        contest
        for contest in contests.findall("contest")
        if contest.attrib.get("contestLongName") == contest_name
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one 2020 contest {contest_name!r}, found {len(matches)}")
    return matches[0]


def extract_2020_contest_choices(contest: ET.Element) -> dict[str, list[int]]:
    choices = contest.find("choices")
    if choices is None:
        raise ValueError(f"Contest {contest.attrib.get('contestLongName')!r} is missing choices")
    expected_jurisdictions = {"State", *COUNTY_NAMES}
    result: dict[str, list[int]] = {}
    for choice in choices.findall("choice"):
        choice_name = str(choice.attrib.get("choiceName") or "").strip()
        jurisdictions = choice.find("jurisdictions")
        if not choice_name or jurisdictions is None:
            raise ValueError("Arizona 2020 choice is missing a name or jurisdictions")
        votes_by_name = {
            str(jurisdiction.attrib.get("name") or "").strip(): int(
                jurisdiction.attrib.get("votes") or 0
            )
            for jurisdiction in jurisdictions.findall("jurisdiction")
        }
        if set(votes_by_name) != expected_jurisdictions:
            raise ValueError(
                f"Arizona 2020 {choice_name} jurisdiction mismatch: "
                f"{sorted(set(votes_by_name).symmetric_difference(expected_jurisdictions))}"
            )
        county_values = [votes_by_name[county] for county in COUNTY_NAMES]
        printed_total = int(choice.attrib.get("totalVotes") or 0)
        if sum(county_values) != votes_by_name["State"] or printed_total != votes_by_name["State"]:
            raise ValueError(
                f"Arizona 2020 {choice_name} does not reconcile: counties={sum(county_values)}, "
                f"State={votes_by_name['State']}, choice total={printed_total}"
            )
        result[choice_name] = county_values
    return result


def extract_2020_rows(xml_zip_path: Path) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    with ZipFile(xml_zip_path) as archive:
        members = archive.namelist()
        if members != ["Results.Detail_2020General.xml"]:
            raise ValueError(f"Unexpected Arizona 2020 ZIP members: {members}")
        with archive.open(members[0]) as handle:
            root = ET.parse(handle).getroot()
    if root.tag != "electionResult":
        raise ValueError(f"Unexpected Arizona 2020 XML root: {root.tag!r}")
    president = extract_2020_contest_choices(
        contest_by_name(root, "President of the United States")
    )
    senate = extract_2020_contest_choices(
        contest_by_name(root, "U.S. Senator (Term Expires Jan. 2023)")
    )
    return president, senate


def candidate_bucket(
    choices: dict[str, list[int]],
    dem_name: str,
    rep_name: str,
) -> tuple[list[int], list[int], list[int]]:
    if dem_name not in choices or rep_name not in choices:
        raise ValueError(f"Missing named candidates: {dem_name!r}, {rep_name!r}")
    dem = choices[dem_name]
    rep = choices[rep_name]
    other_names = sorted(set(choices) - {dem_name, rep_name})
    other = [sum(choices[name][index] for name in other_names) for index in range(15)]
    return dem, rep, other


def build_year_rows(
    *,
    year: int,
    president: dict[str, list[int]],
    president_dem: str,
    president_rep: str,
    senate: dict[str, list[int]],
    senate_dem: str,
    senate_rep: str,
    comparison_contest: str,
    source_id: str,
    source_url: str,
) -> list[dict[str, Any]]:
    dem, rep, other = candidate_bucket(president, president_dem, president_rep)
    comparison_dem, comparison_rep, comparison_other = candidate_bucket(
        senate, senate_dem, senate_rep
    )
    rows = []
    for index, (county, geoid) in enumerate(COUNTIES):
        county_label = f"{county} County"
        total = dem[index] + rep[index] + other[index]
        rows.append(
            {
                "state": "AZ",
                "election_year": year,
                "county": county_label,
                "jurisdiction_tag": f"county:{geoid}",
                "local_unit": county_label,
                "level": "county",
                "dem_candidate": president_dem,
                "rep_candidate": president_rep,
                "dem_votes": dem[index],
                "rep_votes": rep[index],
                "other_votes": other[index],
                "total_votes": total,
                "comparison_contest": comparison_contest,
                "comparison_dem_candidate": senate_dem,
                "comparison_rep_candidate": senate_rep,
                "comparison_dem_votes": comparison_dem[index],
                "comparison_rep_votes": comparison_rep[index],
                "comparison_other_votes": comparison_other[index],
                "coverage_mode": "presidentVsUSSenateCounty",
                "source_id": source_id,
                "comparison_source_id": source_id,
                "source_url": source_url,
            }
        )
    return rows


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "rowCount": len(rows),
        "president": {
            "dem": sum(int(row["dem_votes"]) for row in rows),
            "rep": sum(int(row["rep_votes"]) for row in rows),
            "other": sum(int(row["other_votes"]) for row in rows),
            "total": sum(int(row["total_votes"]) for row in rows),
        },
        "comparison": {
            "dem": sum(int(row["comparison_dem_votes"]) for row in rows),
            "rep": sum(int(row["comparison_rep_votes"]) for row in rows),
            "other": sum(int(row["comparison_other_votes"]) for row in rows),
            "total": sum(
                int(row["comparison_dem_votes"])
                + int(row["comparison_rep_votes"])
                + int(row["comparison_other_votes"])
                for row in rows
            ),
        },
    }


def build_rows(
    pdf_path: Path = DEFAULT_2016_PDF,
    xml_zip_path: Path = DEFAULT_2020_ZIP,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    source_2016 = assert_source_artifact(pdf_path, 2016)
    source_2020 = assert_source_artifact(xml_zip_path, 2020)
    president_2016, senate_2016 = extract_2016_layout_rows(pdf_path)
    president_2020, senate_2020 = extract_2020_rows(xml_zip_path)

    rows_2016 = build_year_rows(
        year=2016,
        president=president_2016,
        president_dem="Hillary Clinton",
        president_rep="Donald J. Trump",
        senate=senate_2016,
        senate_dem="Ann Kirkpatrick",
        senate_rep="John McCain",
        comparison_contest="U.S. Senator",
        source_id=SOURCE_2016_ID,
        source_url=SOURCE_2016_URL,
    )
    rows_2020 = build_year_rows(
        year=2020,
        president=president_2020,
        president_dem="Biden, Joseph",
        president_rep="Trump, Donald J.",
        senate=senate_2020,
        senate_dem="Kelly, Mark",
        senate_rep="McSally, Martha",
        comparison_contest="U.S. Senator (Term Expires Jan. 2023)",
        source_id=SOURCE_2020_ID,
        source_url=SOURCE_2020_URL,
    )
    rows = rows_2016 + rows_2020
    if len(rows) != 30 or len({row["jurisdiction_tag"] for row in rows}) != 15:
        raise ValueError("Arizona historical review must contain 15 canonical county rows per year")

    expected_totals = {
        2016: {
            "rowCount": 15,
            "president": {"dem": 1_161_167, "rep": 1_252_401, "other": 159_597, "total": 2_573_165},
            "comparison": {"dem": 1_031_245, "rep": 1_359_267, "other": 140_218, "total": 2_530_730},
        },
        2020: {
            "rowCount": 15,
            "president": {"dem": 1_672_143, "rep": 1_661_686, "other": 53_497, "total": 3_387_326},
            "comparison": {"dem": 1_716_467, "rep": 1_637_661, "other": 1_189, "total": 3_355_317},
        },
    }
    totals_by_year = {
        year: summarize_rows([row for row in rows if row["election_year"] == year])
        for year in (2016, 2020)
    }
    if totals_by_year != expected_totals:
        raise ValueError(
            f"Arizona historical review statewide reconciliation failed: {totals_by_year}"
        )

    reconciliation = {
        "state": "AZ",
        "electionYears": [2016, 2020],
        "checkedAt": "2026-07-12",
        "generatedBy": "scripts/normalize_az_historical_review.py",
        "reportingGrain": "county",
        "rowCount": len(rows),
        "rowCountsByYear": {"2016": 15, "2020": 15},
        "sourceArtifacts": [
            {
                "electionYear": 2016,
                "authority": "Arizona Secretary of State",
                "sourceUrl": SOURCE_2016_URL,
                "localFile": "data/az-2016-general-official-signed-state-canvass.pdf",
                "format": "signed official canvass PDF",
                **source_2016,
            },
            {
                "electionYear": 2020,
                "authority": "Arizona Secretary of State",
                "sourceUrl": SOURCE_2020_URL,
                "localFile": "data/az-2020-general-results-detail.xml.zip",
                "format": "detailed election-result XML ZIP",
                "member": "Results.Detail_2020General.xml",
                **source_2020,
            },
        ],
        "totalsByYear": {str(year): totals_by_year[year] for year in (2016, 2020)},
        "pdfVisualQa": {
            "renderedPages": list(range(1, 12)),
            "dpi": 200,
            "status": "passed",
            "noOcrUsed": True,
            "legibility": "All President pages 1-10 and U.S. Senate page 11 are sharp, aligned, and legible with no clipped columns.",
            "textLayerSingleVoteCorrections": [
                {"candidate": candidate, "county": county, "votes": 1}
                for candidate, county in sorted(TEXT_LAYER_SINGLE_VOTE_CORRECTIONS_2016)
            ],
            "notes": "Each correction is a printed one-vote cell visible in the rendered official page image but absent from the hidden text layer; every candidate row reconciles to its printed statewide total.",
        },
        "caveats": [
            "Historical advisory rows compare county-level President and U.S. Senate totals; they are not precinct-level scatter-plot inputs.",
            "All non-major and write-in choices are retained in the candidate-neutral other buckets.",
            "Advisory indicators are public-interest screening signals only, not findings of fraud or misconduct.",
        ],
    }
    return rows, reconciliation


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_2016_PDF)
    parser.add_argument("--xml-zip", type=Path, default=DEFAULT_2020_ZIP)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--reconciliation", type=Path, default=DEFAULT_RECONCILIATION)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows, reconciliation = build_rows(args.pdf, args.xml_zip)
    write_csv(args.out, rows)
    write_json(args.reconciliation, reconciliation)
    print(
        f"Wrote {args.out} ({len(rows)} rows: 15 for 2016, 15 for 2020) and "
        f"{args.reconciliation}."
    )


if __name__ == "__main__":
    main()
