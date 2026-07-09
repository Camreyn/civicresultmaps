from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from civic_etl.xlsx import read_xlsx_sheet


WORKBOOK = REPO_ROOT / "data" / "mt-2020-general-precinct-by-precinct.xlsx"
GEOMETRY = REPO_ROOT / "data" / "mt-counties.geojson"
OUTPUT = REPO_ROOT / "data" / "mt-historical-presidential-baseline.csv"
SOURCE_ID = "mt-2020-historical-presidential-official-county"
SOURCE_URL = "https://sosmt.gov/wp-content/uploads/2020_General_Precinct-by-Precinct.xlsx"


def clean_county(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    titled = text.title() if text.isupper() else text
    return titled if re.search(r"\bcounty\b$", titled, re.IGNORECASE) else f"{titled} County"


def join_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower().replace("&", "and").replace(" county", ""))


def load_county_tags() -> dict[str, str]:
    geojson = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    tags: dict[str, str] = {}
    for feature in geojson.get("features", []):
        properties = feature.get("properties", {})
        geoid = str(properties.get("GEOID") or "").strip()
        if not geoid:
            continue
        for name_field in ("NAME", "BASENAME"):
            name = str(properties.get(name_field) or "").strip()
            if name:
                tags[join_key(name)] = f"county:{geoid}"
    return tags


def row_value(row: list[object], columns: dict[str, int], name: str) -> object:
    index = columns[name]
    return row[index] if len(row) > index else ""


def main() -> None:
    rows = read_xlsx_sheet(WORKBOOK, "Sheet1")
    header_index = next(
        index
        for index, row in enumerate(rows)
        if {"CountyName", "RaceName", "PartyCode", "Votes"}.issubset({str(cell) for cell in row})
    )
    header = [str(cell) for cell in rows[header_index]]
    columns = {name: index for index, name in enumerate(header)}
    tags = load_county_tags()

    counties: dict[str, dict[str, object]] = {}
    for row in rows[header_index + 1 :]:
        if str(row_value(row, columns, "RaceName") or "").strip().upper() != "PRESIDENT":
            continue
        source_display_name = str(row_value(row, columns, "CountyName") or "").strip()
        county = clean_county(source_display_name)
        if not county:
            continue
        bucket = counties.setdefault(
            county,
            {
                "source_display_name": source_display_name,
                "dem_votes": 0,
                "rep_votes": 0,
                "other_votes": 0,
            },
        )
        votes = int(row_value(row, columns, "Votes") or 0)
        party = str(row_value(row, columns, "PartyCode") or "").strip().upper()
        if party == "DEM":
            bucket["dem_votes"] = int(bucket["dem_votes"]) + votes
        elif party == "REP":
            bucket["rep_votes"] = int(bucket["rep_votes"]) + votes
        else:
            bucket["other_votes"] = int(bucket["other_votes"]) + votes

    output_rows = []
    missing_tags = []
    for county in sorted(counties):
        values = counties[county]
        tag = tags.get(join_key(county))
        if not tag:
            missing_tags.append(county)
        dem = int(values["dem_votes"])
        rep = int(values["rep_votes"])
        other = int(values["other_votes"])
        output_rows.append(
            {
                "state": "MT",
                "election_year": 2020,
                "jurisdiction_name": county,
                "local_unit": county,
                "source_id": SOURCE_ID,
                "source_level": "county",
                "row_method": "montanaOfficialPrecinctWorkbookCountyAggregate",
                "jurisdiction_tag": tag or "",
                "source_display_name": values["source_display_name"],
                "dem_votes": dem,
                "rep_votes": rep,
                "other_votes": other,
                "total_votes": dem + rep + other,
                "source_url": SOURCE_URL,
            }
        )

    if missing_tags:
        raise SystemExit(f"missing Montana county GEOID tags: {', '.join(missing_tags)}")
    if len(output_rows) != 56:
        raise SystemExit(f"expected 56 Montana county rows, got {len(output_rows)}")

    totals = {
        "dem_votes": sum(int(row["dem_votes"]) for row in output_rows),
        "rep_votes": sum(int(row["rep_votes"]) for row in output_rows),
        "other_votes": sum(int(row["other_votes"]) for row in output_rows),
        "total_votes": sum(int(row["total_votes"]) for row in output_rows),
    }
    expected = {"dem_votes": 244786, "rep_votes": 343602, "other_votes": 15252, "total_votes": 603640}
    if totals != expected:
        raise SystemExit(f"Montana 2020 presidential totals mismatch: {totals} != {expected}")

    fieldnames = [
        "state",
        "election_year",
        "jurisdiction_name",
        "local_unit",
        "source_id",
        "source_level",
        "row_method",
        "jurisdiction_tag",
        "source_display_name",
        "dem_votes",
        "rep_votes",
        "other_votes",
        "total_votes",
        "source_url",
    ]
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(output_rows)

    print(json.dumps({"output": str(OUTPUT.relative_to(REPO_ROOT)), "rows": len(output_rows), **totals}, sort_keys=True))


if __name__ == "__main__":
    main()

