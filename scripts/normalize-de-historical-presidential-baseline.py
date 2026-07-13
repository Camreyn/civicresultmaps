from __future__ import annotations

import csv
import json
from html.parser import HTMLParser
from pathlib import Path


REPO_ROOT = Path.cwd()
DATA_DIR = REPO_ROOT / "data"
OUTPUT_CSV = DATA_DIR / "de-historical-presidential-baseline.csv"
SUMMARY_JSON = DATA_DIR / "de-historical-presidential-baseline-summary.json"


class DelawareReportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[dict[str, object]] = []
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
                self.tables.append({"section": self.section, "contest": self.contest, "unit": self.unit, "rows": self._table})
            self._in_table = False


COUNTY_TAGS = {
    "Kent County": "county:10001",
    "New Castle County": "county:10003",
    "Sussex County": "county:10005",
}

COUNTY_COLUMNS = {
    "New Castle": "New Castle County",
    "Wilmington": "New Castle County",
    "Kent": "Kent County",
    "Sussex": "Sussex County",
}

SOURCES = [
    {
        "year": 2016,
        "id": "de-2016-general-statewide-office-by-county",
        "url": "https://elections.delaware.gov/elections/resultsarchive/elect16/elect16_general/data/stwoff_kns.txt",
        "local_file": DATA_DIR / "de-2016-general-statewide-office-by-county.txt",
        "expected": {"row_count": 3, "dem": 235603, "rep": 185127, "other": 20860, "total": 441590},
    },
    {
        "year": 2020,
        "id": "de-2020-general-election-results-report",
        "url": "https://elections.delaware.gov/reports/GE2020.html",
        "local_file": DATA_DIR / "de-2020-general-election-results-report.html",
        "expected": {"row_count": 3, "dem": 296268, "rep": 200603, "other": 7139, "total": 504010},
    },
]


def int_text(value: object) -> int:
    text = "".join(ch for ch in str(value or "") if ch.isdigit() or ch == "-")
    return int(text or "0")


def party_bucket(value: str) -> str:
    normalized = " ".join(str(value or "").lower().split())
    if "democratic" in normalized or normalized == "democrat":
        return "dem"
    if "republican" in normalized:
        return "rep"
    return "other"


def historical_row(source: dict[str, object], county: str, source_display_name: str, votes: dict[str, int]) -> dict[str, object]:
    return {
        "state": "DE",
        "election_year": source["year"],
        "jurisdiction_name": county,
        "source_display_name": source_display_name,
        "source_id": "de-historical-presidential-baseline",
        "source_level": "county",
        "jurisdiction_tag": COUNTY_TAGS[county],
        "row_method": "historicalPresidentialCsv",
        "dem_votes": votes["dem"],
        "rep_votes": votes["rep"],
        "other_votes": votes["other"],
        "total_votes": votes["total"],
        "source_url": source["url"],
    }


def parse_2016(source: dict[str, object]) -> list[dict[str, object]]:
    text = Path(source["local_file"]).read_text(encoding="utf-8-sig")
    cells = [cell.strip() for cell in text.split(";")]
    start = cells.index("PRESIDENT")
    end = cells.index("Office Total", start)
    header = cells[start - 4 : start]
    county_names = [COUNTY_COLUMNS[column] for column in header[:3]]
    totals = {county: {"dem": 0, "rep": 0, "other": 0, "total": 0} for county in county_names}
    index = start + 5
    while index < end:
        candidate = cells[index]
        values = [int_text(cells[index + offset]) for offset in range(1, 4)]
        bucket = "other"
        if "CLINTON" in candidate:
            bucket = "dem"
        elif "TRUMP" in candidate:
            bucket = "rep"
        for county, votes in zip(county_names, values):
            totals[county][bucket] += votes
            totals[county]["total"] += votes
        index += 5
    return [historical_row(source, county, source_name, totals[county]) for county, source_name in zip(county_names, header[:3])]


def parse_2020(source: dict[str, object]) -> list[dict[str, object]]:
    parser = DelawareReportParser()
    parser.feed(Path(source["local_file"]).read_text(encoding="utf-8-sig"))
    table = next(
        (
            table
            for table in parser.tables
            if table["section"] == "By County" and str(table["contest"]).strip() == "President and Vice President"
        ),
        None,
    )
    if not table:
        raise RuntimeError("Delaware 2020 report is missing the By County President table")
    rows = table["rows"]
    columns = {name.strip(): index for index, name in enumerate(rows[0])}
    party_index = columns.get("Party", columns.get("Party Name", 1))
    county_names = ["New Castle County", "Kent County", "Sussex County"]
    source_columns = ["New Castle", "Kent", "Sussex"]
    totals = {county: {"dem": 0, "rep": 0, "other": 0, "total": 0} for county in county_names}
    for row in rows[1:]:
        bucket = party_bucket(row[party_index] if len(row) > party_index else "")
        for county, column in zip(county_names, source_columns):
            votes = int_text(row[columns[column]])
            totals[county][bucket] += votes
            totals[county]["total"] += votes
    return [historical_row(source, county, source_name, totals[county]) for county, source_name in zip(county_names, source_columns)]


def assert_summary(source: dict[str, object], rows: list[dict[str, object]]) -> dict[str, int]:
    totals = {
        "row_count": len(rows),
        "dem": sum(int(row["dem_votes"]) for row in rows),
        "rep": sum(int(row["rep_votes"]) for row in rows),
        "other": sum(int(row["other_votes"]) for row in rows),
        "total": sum(int(row["total_votes"]) for row in rows),
    }
    if totals != source["expected"]:
        raise RuntimeError(f"{source['year']} Delaware totals did not reconcile: {totals} != {source['expected']}")
    return totals


def main() -> None:
    all_rows: list[dict[str, object]] = []
    summary = {
        "authority": "Delaware Department of Elections",
        "parser": "scripts/normalize-de-historical-presidential-baseline.py",
        "caveat": "Official Delaware 2016 raw statewide-office-by-county export and 2020 official report HTML normalized to county baselines. The 2016 raw export labels the New Castle County column as Wilmington.",
        "sources": [],
    }
    for source in SOURCES:
        rows = parse_2016(source) if source["year"] == 2016 else parse_2020(source)
        totals = assert_summary(source, rows)
        all_rows.extend(rows)
        summary["sources"].append(
            {
                "id": source["id"],
                "year": source["year"],
                "url": source["url"],
                "localFile": str(Path(source["local_file"]).relative_to(REPO_ROOT)).replace("\\", "/"),
                "rowCount": totals["row_count"],
                "demVotes": totals["dem"],
                "repVotes": totals["rep"],
                "otherVotes": totals["other"],
                "totalVotes": totals["total"],
            }
        )

    columns = ["state", "election_year", "jurisdiction_name", "source_display_name", "jurisdiction_tag", "source_id", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes", "source_url"]
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(sorted(all_rows, key=lambda row: (int(row["election_year"]), str(row["jurisdiction_name"]))))
    summary["output"] = {"localFile": str(OUTPUT_CSV.relative_to(REPO_ROOT)).replace("\\", "/"), "rowCount": len(all_rows), "years": [2016, 2020]}
    SUMMARY_JSON.write_text(f"{json.dumps(summary, indent=2)}\n", encoding="utf-8")
    print(json.dumps(summary["output"]))


if __name__ == "__main__":
    main()


