from __future__ import annotations

import csv
import html
import re
import sys
import zipfile
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree


STATE = "ID"
SOURCE_ID = "id-historical-presidential-baseline"
OUTPUT = Path("data/id-historical-presidential-baseline.csv")

OFFICIAL_2012 = Path("data/id-2012-general-president-by-county.html")
OFFICIAL_2016 = Path("data/id-2016-general-president-by-county.html")
OFFICIAL_2020_STATEWIDE = Path("data/id-2020-general-statewide.html")
OFFICIAL_2020_STATISTICS = Path("data/id-2020-general-statistics.html")
OFFICIAL_2020_ABSTRACTS = Path("data/id-2020-general-county-abstracts.zip")
SECONDARY_2020_COUNTIES = Path("data/id-2020-general-president-by-county-wikipedia.html")
CURRENT_COUNTIES = Path("data/id-2024-general-president.csv")

EXPECTED = {
    2012: {"rows": 44, "dem_votes": 212_787, "rep_votes": 420_911, "other_votes": 18_576, "total_votes": 652_274},
    2016: {"rows": 44, "dem_votes": 189_765, "rep_votes": 409_055, "other_votes": 91_435, "total_votes": 690_255},
    2020: {"rows": 44, "dem_votes": 287_021, "rep_votes": 554_119, "other_votes": 26_794, "total_votes": 867_934},
}

XLSX_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_cell = False
        self._cell: list[str] = []
        self._row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"td", "th"}:
            self._in_cell = True
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._in_cell:
            value = clean_text("".join(self._cell))
            self._row.append(value)
            self._in_cell = False
        elif tag == "tr":
            if self._row:
                self.rows.append(self._row)
            self._row = []


def clean_text(value: str) -> str:
    text = html.unescape(value)
    text = re.sub(r"\[[0-9]+\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def int_value(value: object) -> int:
    text = str(value or "").replace("\xa0", " ")
    normalized = re.sub(r"[^0-9-]", "", text)
    return int(normalized) if normalized else 0


def county_name(value: str) -> str:
    name = clean_text(value)
    name = re.sub(r"\s+County$", "", name)
    return f"{name} County"


def known_counties() -> set[str]:
    with CURRENT_COUNTIES.open("r", encoding="utf-8-sig", newline="") as handle:
        return {row["jurisdiction_name"] for row in csv.DictReader(handle)}


def parse_tables(path: Path) -> list[list[str]]:
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser.rows


def official_archive_rows(path: Path, year: int, dem_candidate: str, rep_candidate: str) -> list[dict[str, object]]:
    rows = parse_tables(path)
    header = next(row for row in rows if row and row[0] == "Counties")
    dem_index = header.index(dem_candidate)
    rep_index = header.index(rep_candidate)
    counties = known_counties()
    data_rows = []

    for row in rows:
        county = county_name(row[0]) if row else ""
        if len(row) != len(header) or county not in counties:
            continue
        values = [int_value(value) for value in row[1:]]
        dem_votes = values[dem_index - 1]
        rep_votes = values[rep_index - 1]
        total_votes = sum(values)
        data_rows.append(
            {
                "state": STATE,
                "election_year": year,
                "jurisdiction_name": county,
                "county": county,
                "local_unit": county,
                "source_id": SOURCE_ID,
                "source_level": "county",
                "row_method": "officialIdahoArchiveHtmlCountyHistorical",
                "source_url": source_url(year),
                "dem_votes": dem_votes,
                "rep_votes": rep_votes,
                "other_votes": total_votes - dem_votes - rep_votes,
                "total_votes": total_votes,
            }
        )
    return data_rows


def source_url(year: int) -> str:
    if year == 2012:
        return "https://archive.sos.idaho.gov/ELECT/results/2012/General/cnty_USPres.htm"
    if year == 2016:
        return "https://archive.sos.idaho.gov/ELECT/results/2016/General/president_by_county.html"
    return "https://sos.idaho.gov/elections-division/2020-results-statistics/"


def official_2020_statistics_rows() -> list[dict[str, object]]:
    rows = parse_tables(OFFICIAL_2020_STATISTICS)
    counties = known_counties()
    data_rows = []
    in_president_table = False

    for row in rows:
        if row and any("Joseph R. Biden" in cell for cell in row) and any("Donald J. Trump" in cell for cell in row):
            in_president_table = True
            continue
        if in_president_table and row and row[0] == "TOTAL":
            break
        if not in_president_table:
            continue

        county = county_name(row[0]) if row else ""
        if len(row) != 9 or county not in counties:
            continue
        dem_votes = int_value(row[1])
        rep_votes = int_value(row[6])
        other_votes = sum(int_value(value) for index, value in enumerate(row[1:], start=1) if index not in {1, 6})
        data_rows.append(
            {
                "state": STATE,
                "election_year": 2020,
                "jurisdiction_name": county,
                "county": county,
                "local_unit": county,
                "source_id": SOURCE_ID,
                "source_level": "county",
                "row_method": "officialIdahoSosStatisticsHtmlCountyHistorical",
                "source_url": source_url(2020),
                "dem_votes": dem_votes,
                "rep_votes": rep_votes,
                "other_votes": other_votes,
                "total_votes": dem_votes + rep_votes + other_votes,
            }
        )
    return data_rows


def parse_2020_secondary_rows() -> list[dict[str, object]]:
    rows = parse_tables(SECONDARY_2020_COUNTIES)
    county_rows = []
    for row in rows:
        if len(row) < 10 or row[0] in {"County", "Totals"}:
            continue
        total = int_value(row[9])
        if not total:
            continue
        county_rows.append(
            {
                "state": STATE,
                "election_year": 2020,
                "jurisdiction_name": county_name(row[0]),
                "county": county_name(row[0]),
                "local_unit": county_name(row[0]),
                "source_id": SOURCE_ID,
                "source_level": "county",
                "row_method": "secondaryWikipediaCountyTableOfficialStatewideAndXlsxCrosscheck",
                "source_url": source_url(2020),
                "dem_votes": int_value(row[3]),
                "rep_votes": int_value(row[1]),
                "other_votes": int_value(row[5]),
                "total_votes": total,
            }
        )
    if len(county_rows) != 44:
        raise ValueError(f"Expected 44 Wikipedia 2020 county rows, found {len(county_rows)}")
    return county_rows


def xlsx_text(element: ElementTree.Element | None) -> str:
    return "" if element is None else "".join(element.itertext())


def xlsx_column(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    index = 0
    for letter in letters:
        index = (index * 26) + (ord(letter) - ord("A") + 1)
    return index - 1


def xlsx_rows(payload: bytes, sheet_name: str) -> list[list[str]]:
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("pkgrel:Relationship", XLSX_NS)}
        sheet_path = ""
        sheets = workbook.findall("main:sheets/main:sheet", XLSX_NS)
        selected_sheet = next((sheet for sheet in sheets if sheet.attrib.get("name") == sheet_name), None)
        if selected_sheet is None:
            selected_sheet = next(
                (sheet for sheet in sheets if str(sheet.attrib.get("name") or "").strip().startswith(sheet_name)),
                None,
            )
        if selected_sheet is None:
            available = [sheet.attrib.get("name", "") for sheet in sheets]
            raise ValueError(f"worksheet {sheet_name!r} not found; available sheets: {available}")
        rel_id = selected_sheet.attrib[f"{{{XLSX_NS['rel']}}}id"]
        target = rel_targets[rel_id].lstrip("/")
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"

        try:
            strings_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = [xlsx_text(item) for item in strings_root.findall("main:si", XLSX_NS)]
        except KeyError:
            strings = []
        worksheet = ElementTree.fromstring(archive.read(sheet_path))

    rows: list[list[str]] = []
    for row in worksheet.findall("main:sheetData/main:row", XLSX_NS):
        values: list[str] = []
        for cell in row.findall("main:c", XLSX_NS):
            ref = cell.attrib.get("r", "")
            column = xlsx_column(ref) if ref else len(values)
            while len(values) <= column:
                values.append("")
            raw = xlsx_text(cell.find("main:v", XLSX_NS))
            values[column] = strings[int(raw)] if cell.attrib.get("t") == "s" and raw else raw
        while values and values[-1] == "":
            values.pop()
        rows.append(values)
    return rows


def official_2020_xlsx_totals() -> dict[str, tuple[int, int, int, int]]:
    output = {}
    with zipfile.ZipFile(OFFICIAL_2020_ABSTRACTS) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".xlsx"):
                continue
            rows = xlsx_rows(archive.read(name), "Pres")
            total = next(row for row in rows if row and str(row[0]).strip() == "Co. Total")
            dem = int_value(total[1])
            rep = int_value(total[6])
            other = sum(int_value(value) for index, value in enumerate(total[1:8], start=1) if index not in {1, 6})
            output[county_name(Path(name).stem)] = (dem, rep, other, dem + rep + other)
    return output


def official_2020_statewide_totals() -> tuple[int, int, int, int]:
    rows = parse_tables(OFFICIAL_2020_STATEWIDE)
    values = {"dem": 0, "rep": 0, "other": 0}
    in_president = False
    for row in rows:
        if row and row[0] == "Party" and any("Joseph R. Biden" in cell for cell in row):
            in_president = True
        elif in_president and row and row[0] == "Party":
            break
        if not in_president:
            continue

        cells = row[5:] if row[0] == "Party" else row
        if len(cells) < 3:
            continue
        votes = int_value(cells[2])
        if "Joseph R. Biden" in cells[1]:
            values["dem"] += votes
        elif "Donald J. Trump" in cells[1]:
            values["rep"] += votes
        else:
            values["other"] += votes
    return values["dem"], values["rep"], values["other"], sum(values.values())


def assert_expected(rows: list[dict[str, object]], year: int) -> None:
    totals = {
        "rows": len(rows),
        "dem_votes": sum(int(row["dem_votes"]) for row in rows),
        "rep_votes": sum(int(row["rep_votes"]) for row in rows),
        "other_votes": sum(int(row["other_votes"]) for row in rows),
        "total_votes": sum(int(row["total_votes"]) for row in rows),
    }
    if totals != EXPECTED[year]:
        raise ValueError(f"{year} totals mismatch: expected {EXPECTED[year]!r}, got {totals!r}")


def assert_2020_official_crosschecks(rows: list[dict[str, object]]) -> None:
    statewide = official_2020_statewide_totals()
    expected = EXPECTED[2020]
    expected_tuple = (expected["dem_votes"], expected["rep_votes"], expected["other_votes"], expected["total_votes"])
    if statewide != expected_tuple:
        raise ValueError(f"2020 official statewide cross-check mismatch: {statewide!r}")

    assert_expected(rows, 2020)

    xlsx_totals = official_2020_xlsx_totals()
    missing_counties = {county for county in known_counties() if county not in xlsx_totals}
    if missing_counties != {"Butte County", "Camas County", "Custer County", "Gem County", "Idaho County", "Owyhee County"}:
        raise ValueError(f"Unexpected 2020 official abstract XLSX/PDF split: {sorted(missing_counties)}")

    by_county = {str(row["jurisdiction_name"]): row for row in rows}
    for county, (dem_votes, rep_votes, other_votes_without_writeins, _) in xlsx_totals.items():
        row = by_county[county]
        if int(row["dem_votes"]) != dem_votes or int(row["rep_votes"]) != rep_votes:
            raise ValueError(f"2020 statistics/XLSX major-party mismatch for {county}")
        if int(row["other_votes"]) < other_votes_without_writeins:
            raise ValueError(f"2020 statistics other total is below XLSX candidate total for {county}")


def write_rows(rows: list[dict[str, object]]) -> None:
    headers = [
        "state",
        "election_year",
        "jurisdiction_name",
        "county",
        "local_unit",
        "source_id",
        "source_level",
        "row_method",
        "source_url",
        "dem_votes",
        "rep_votes",
        "other_votes",
        "total_votes",
    ]
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    rows = []
    rows_2012 = official_archive_rows(OFFICIAL_2012, 2012, "Barack Obama", "Mitt Romney")
    rows_2016 = official_archive_rows(OFFICIAL_2016, 2016, "Hillary Rodham Clinton", "Donald J. Trump")
    rows_2020 = official_2020_statistics_rows()
    for year, year_rows in [(2012, rows_2012), (2016, rows_2016)]:
        assert_expected(year_rows, year)
        rows.extend(year_rows)
    assert_2020_official_crosschecks(rows_2020)
    rows.extend(rows_2020)

    rows.sort(key=lambda row: (int(row["election_year"]), str(row["jurisdiction_name"])))
    write_rows(rows)
    print(f"Wrote {len(rows)} Idaho historical presidential baseline rows to {OUTPUT}")
    print("2020 loaded from the official Idaho SOS county statistics page and reconciled to statewide totals.")
    return 0


if __name__ == "__main__":
    sys.exit(main())



