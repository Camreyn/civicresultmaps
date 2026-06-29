from __future__ import annotations

import csv
import re
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


XML_INDEX_URL = "https://archive.voteidaho.gov/results/2024/general/xml.html"
PRESIDENTIAL_URL = "https://archive.voteidaho.gov/results/2024/general/presidential.html"
OUTPUT_PATH = Path("data/id-2024-general-president.csv")
STATE = "ID"
ELECTION_YEAR = "2024"

# Five official XML links in the Vote Idaho XML index currently return stale test/placeholder data.
# These fallback Other totals come from the public county table that cites the same Vote Idaho archive.
FALLBACK_OTHER_TOTALS = {
    "Bear Lake": 71,
    "Bonner": 708,
    "Clark": 3,
    "Franklin": 202,
    "Idaho": 259,
}

CANDIDATE_COLUMNS = {
    "Donald J. Trump": "trump",
    "Kamala D. Harris": "harris",
    "Robert F Kennedy Jr.": "kennedy",
    "Chase Oliver": "oliver",
    "Jill Stein": "stein",
    "Joel Skousen": "skousen",
    "Claudia De la Cruz": "delacruz",
    "Randall Terry": "terry",
    "Shiva Ayyadurai": "ayyadurai",
}

OUTPUT_COLUMNS = [
    "state",
    "election_year",
    "jurisdiction_name",
    "jurisdiction_code",
    "level",
    "trump",
    "harris",
    "other",
    "source_mode",
    "generated_date",
    "source_url",
]


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._current_href: str | None = None
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self._current_href = href

    def handle_data(self, data: str) -> None:
        if self._current_href:
            label = data.strip()
            if label:
                self.links.append((label, self._current_href))

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a":
            self._current_href = None


class ScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_script = False
        self.attrs: dict[str, str | None] = {}
        self.buffer: list[str] = []
        self.scripts: list[tuple[dict[str, str | None], str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            self.in_script = True
            self.attrs = dict(attrs)
            self.buffer = []

    def handle_data(self, data: str) -> None:
        if self.in_script:
            self.buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self.in_script:
            self.scripts.append((self.attrs, "".join(self.buffer)))
            self.in_script = False


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "CivicResultMaps ETL/1.0 (+https://civicresultmaps.org)",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8-sig")


def county_links() -> list[tuple[str, str]]:
    parser = LinkParser()
    parser.feed(fetch_text(XML_INDEX_URL))
    return [
        (label, urljoin(XML_INDEX_URL, href))
        for label, href in parser.links
        if label != "Statewide" and "summary_133.xml" in href
    ]


def text(table: ET.Element, tag: str) -> str:
    value = table.findtext(tag)
    return value.strip() if value else ""


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def popup_major_party_rows() -> dict[str, dict[str, int]]:
    import json

    parser = ScriptParser()
    parser.feed(fetch_text(PRESIDENTIAL_URL))
    leaflet_script = next(
        script
        for attrs, script in parser.scripts
        if str(attrs.get("data-for") or "").startswith("htmlwidget-d")
    )
    widget = json.loads(leaflet_script)
    add_polygons = next(call for call in widget["x"]["calls"] if call["method"] == "addPolygons")
    popups = add_polygons["args"][6]

    output: dict[str, dict[str, int]] = {}
    for popup in popups:
        caption = re.search(r"<caption>(.*?)</caption>", popup, re.S)
        if not caption:
            continue
        county = re.sub(r"\s+County$", "", caption.group(1).strip())
        values = {"trump": 0, "harris": 0}
        for row in re.findall(r"<tr>(.*?)</tr>", popup, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            if len(cells) < 3:
                continue
            candidate = re.sub(r"<.*?>", "", cells[1]).strip()
            votes = int(re.sub(r"\D", "", cells[2]) or "0")
            if candidate.startswith("Donald J. Trump"):
                values["trump"] = votes
            elif candidate.startswith("Kamala D. Harris"):
                values["harris"] = votes
        output[county] = values
    return output


def presidential_row(county: str, url: str, popup_rows: dict[str, dict[str, int]]) -> dict[str, str]:
    root = ET.fromstring(fetch_text(url))
    values = {"trump": 0, "harris": 0, "other": 0}
    complete_xml = False

    for table in root.findall("Table"):
        if text(table, "GroupName") != "United States President":
            continue
        candidate = normalize_name(text(table, "ContestantName")).removesuffix(" (Write-In)")
        if "rejected" in candidate.lower():
            continue
        votes = int(text(table, "TotalVotes") or "0")
        column = CANDIDATE_COLUMNS.get(candidate)
        if column == "trump":
            values["trump"] += votes
        elif column == "harris":
            values["harris"] += votes
        else:
            values["other"] += votes

    if values["trump"] and values["harris"]:
        complete_xml = True
    else:
        fallback = popup_rows.get(county)
        if not fallback or county not in FALLBACK_OTHER_TOTALS:
            raise ValueError(f"missing presidential totals for {county}: {url}")
        values["trump"] = fallback["trump"]
        values["harris"] = fallback["harris"]
        values["other"] = FALLBACK_OTHER_TOTALS[county]

    return {
        "state": STATE,
        "election_year": ELECTION_YEAR,
        "jurisdiction_name": f"{county} County",
        "jurisdiction_code": county,
        "level": "county",
        "trump": str(values["trump"]),
        "harris": str(values["harris"]),
        "other": str(values["other"]),
        "source_mode": "official_xml" if complete_xml else "official_html_with_county_table_other_fallback",
        "generated_date": root.findtext("GeneratedDate") or "",
        "source_url": url if complete_xml else PRESIDENTIAL_URL,
    }


def main() -> int:
    popup_rows = popup_major_party_rows()
    rows = [presidential_row(county, url, popup_rows) for county, url in county_links()]
    rows.sort(key=lambda item: item["jurisdiction_name"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    totals = {
        "trump": sum(int(row["trump"]) for row in rows),
        "harris": sum(int(row["harris"]) for row in rows),
        "other": sum(int(row["other"]) for row in rows),
    }
    totals["total"] = sum(totals.values())
    print(f"wrote {len(rows)} rows to {OUTPUT_PATH}")
    print(totals)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())