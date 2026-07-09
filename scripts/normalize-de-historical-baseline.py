from __future__ import annotations

import csv
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


INPUT_HTML = Path("data/de-2020-general-election-results-report.html")
CROSSCHECK_CSV = Path("data/de-2020-general-election-results-report.csv")
OUTPUT = Path("data/de-historical-presidential-baseline.csv")
SOURCE_ID = "de-2020-official-results-report"
SOURCE_URL = "https://elections.delaware.gov/reports/GE2020.html"

COUNTIES = [
    ("New Castle", "county:10003"),
    ("Kent", "county:10001"),
    ("Sussex", "county:10005"),
]


class DelawareReportParser(HTMLParser):
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


def int_text(value: Any) -> int:
    return int(str(value or "0").replace(",", "").strip() or "0")


def party_bucket(party: str) -> str:
    normalized = " ".join(party.lower().split())
    if "democratic" in normalized:
        return "dem_votes"
    if "republican" in normalized:
        return "rep_votes"
    return "other_votes"


def column_index(header: list[str]) -> dict[str, int]:
    return {name.strip(): index for index, name in enumerate(header)}


def parse_county_rows() -> list[dict[str, str | int]]:
    parser = DelawareReportParser()
    parser.feed(INPUT_HTML.read_text(encoding="utf-8-sig"))
    table = next(
        (
            item
            for item in parser.tables
            if item["section"] == "By County" and item["contest"] == "President and Vice President"
        ),
        None,
    )
    if not table:
        raise RuntimeError("GE2020 report is missing the By County President and Vice President table")

    columns = column_index(table["rows"][0])
    rows: list[dict[str, str | int]] = []
    for county_name, jurisdiction_tag in COUNTIES:
        totals = {"dem_votes": 0, "rep_votes": 0, "other_votes": 0}
        for row in table["rows"][1:]:
            bucket = party_bucket(row[columns["Party"]])
            totals[bucket] += int_text(row[columns[county_name]])
        total_votes = sum(totals.values())
        rows.append(
            {
                "state": "DE",
                "election_year": 2020,
                "jurisdiction_name": county_name,
                "source_jurisdiction_name": county_name,
                "jurisdiction_tag": jurisdiction_tag,
                "source_id": SOURCE_ID,
                "source_level": "county",
                "row_method": "delawareOfficialReportHtmlCountyHistorical",
                "dem_votes": totals["dem_votes"],
                "rep_votes": totals["rep_votes"],
                "other_votes": totals["other_votes"],
                "total_votes": total_votes,
                "source_url": SOURCE_URL,
            }
        )
    return rows


def official_csv_president_total() -> int:
    with CROSSCHECK_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return sum(
            int_text(row["totalvotessum"])
            for row in reader
            if row.get("office") == "President and Vice President"
        )


def write_csv(rows: list[dict[str, str | int]]) -> None:
    fields = [
        "state",
        "election_year",
        "jurisdiction_name",
        "source_jurisdiction_name",
        "jurisdiction_tag",
        "source_id",
        "source_level",
        "row_method",
        "dem_votes",
        "rep_votes",
        "other_votes",
        "total_votes",
        "source_url",
    ]
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows = parse_county_rows()
    county_total = sum(int(row["total_votes"]) for row in rows)
    csv_total = official_csv_president_total()
    if county_total != csv_total:
        raise RuntimeError(f"County total {county_total} does not match official CSV total {csv_total}")
    write_csv(rows)
    print(f"Wrote {len(rows)} Delaware 2020 county historical rows totaling {county_total} votes to {OUTPUT}")


if __name__ == "__main__":
    main()
