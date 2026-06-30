"""Normalize Idaho 2024 official U.S. House map data to county comparison rows."""

from __future__ import annotations

import csv
import html
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path


CONGRESSIONAL_URL = "https://archive.voteidaho.gov/results/2024/general/congressional.html"
OUTPUT = Path("data/id-2024-general-us-house.csv")
EXPECTED_COUNTIES = 44
EXPECTED_TOTALS = {"comparison_dem": 244_885, "comparison_rep": 581_168, "comparison_other": 47_641}


class ScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_script = False
        self._attrs: dict[str, str] = {}
        self._parts: list[str] = []
        self.scripts: list[tuple[dict[str, str], str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script":
            self._in_script = True
            self._attrs = {key: value or "" for key, value in attrs}
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_script:
            self.scripts.append((self._attrs, "".join(self._parts)))
            self._in_script = False


def _clean_html_cell(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return re.sub(r"\s+", " ", text).strip()


def _parse_votes(value: str) -> int:
    return int(value.replace(",", "").strip())


def _county_from_caption(caption: str) -> str:
    # The congressional page uses county captions; keep the guard for split labels.
    return re.sub(r" County(?: .*)?$", " County", caption)


def _parse_popup(popup: str) -> tuple[str, list[tuple[str, int]]]:
    caption_match = re.search(r"<caption>(.*?)</caption>", popup, re.IGNORECASE | re.DOTALL)
    if not caption_match:
        raise ValueError("Map popup is missing a county caption")
    county = _county_from_caption(_clean_html_cell(caption_match.group(1)))

    cells = [
        _clean_html_cell(cell)
        for cell in re.findall(r"<td[^>]*>(.*?)</td>", popup, re.IGNORECASE | re.DOTALL)
    ]
    cells = [cell for cell in cells if cell]
    rows: list[tuple[str, int]] = []
    for index in range(0, len(cells), 3):
        if index + 2 >= len(cells):
            continue
        rows.append((cells[index], _parse_votes(cells[index + 1])))
    return county, rows


def _party_bucket(candidate: str) -> str:
    if "(DEM)" in candidate:
        return "comparison_dem"
    if "(REP)" in candidate:
        return "comparison_rep"
    return "comparison_other"


def fetch_congressional_page() -> str:
    request = urllib.request.Request(CONGRESSIONAL_URL, headers={"User-Agent": "CivicResultMaps ETL"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_rows(page_html: str) -> list[dict[str, str | int]]:
    parser = ScriptParser()
    parser.feed(page_html)

    by_county: dict[str, Counter[str]] = defaultdict(Counter)
    popup_count = 0
    for _, script in parser.scripts:
        try:
            widget = json.loads(script)
        except json.JSONDecodeError:
            continue
        calls = widget.get("x", {}).get("calls", []) if isinstance(widget, dict) else []
        for call in calls:
            if not isinstance(call, dict) or call.get("method") != "addPolygons":
                continue
            popups = []
            for argument in call.get("args", []):
                if isinstance(argument, list) and argument and isinstance(argument[0], str) and "<table" in argument[0]:
                    popups = argument
                    break
            for popup in popups:
                popup_count += 1
                county, candidate_rows = _parse_popup(popup)
                for candidate, votes in candidate_rows:
                    by_county[county][_party_bucket(candidate)] += votes

    if popup_count == 0:
        raise ValueError("No congressional map popups found in Idaho official results page")
    if len(by_county) != EXPECTED_COUNTIES:
        raise ValueError(f"Expected {EXPECTED_COUNTIES} counties, found {len(by_county)}")

    totals = {
        key: sum(counts[key] for counts in by_county.values())
        for key in EXPECTED_TOTALS
    }
    if totals != EXPECTED_TOTALS:
        raise ValueError(f"Unexpected congressional totals: {totals!r}")

    return [
        {
            "state": "ID",
            "election_year": 2024,
            "jurisdiction_name": county,
            "comparison_dem": counts["comparison_dem"],
            "comparison_rep": counts["comparison_rep"],
            "comparison_other": counts["comparison_other"],
        }
        for county, counts in sorted(by_county.items())
    ]


def write_rows(rows: list[dict[str, str | int]]) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "state",
                "election_year",
                "jurisdiction_name",
                "comparison_dem",
                "comparison_rep",
                "comparison_other",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    rows = extract_rows(fetch_congressional_page())
    write_rows(rows)
    print(f"Wrote {len(rows)} Idaho U.S. House county comparison rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
