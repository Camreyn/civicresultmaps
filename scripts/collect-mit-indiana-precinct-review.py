from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen


DATA_FILE_ID = 13731143
DATA_FILE_NAME = "2024-in-precinct-general.tab"
DATA_URL = f"https://dataverse.harvard.edu/api/access/datafile/{DATA_FILE_ID}"
REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_OUT = REPO_ROOT / "data" / "in-2024-mit-precinct-president-senate.csv"
REVIEW_OUT = REPO_ROOT / "data" / "in-2024-mit-local-review.csv"
MANIFEST_OUT = REPO_ROOT / "data" / "in-2024-mit-local-review-manifest.json"


def int_votes(value: str | None) -> int:
    text = str(value or "").strip()
    if not text or text == "*":
        return 0
    return int(float(text.replace(",", "")))


def norm_county(value: str) -> str:
    value = " ".join(str(value or "").strip().title().split())
    aliases = {"St Joseph": "St. Joseph"}
    value = aliases.get(value, value)
    return value if value.endswith(" County") else f"{value} County"


def key_for(row: dict[str, str]) -> tuple[str, str, str]:
    return (
        str(row.get("county_fips") or "").strip(),
        str(row.get("county_name") or "").strip(),
        str(row.get("precinct") or "").strip(),
    )


def collect_raw() -> dict[str, object]:
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    request = Request(DATA_URL, headers={"User-Agent": "CivicResultMaps Indiana collector"})
    kept = 0
    seen = 0
    fieldnames: list[str] | None = None
    with urlopen(request, timeout=120) as response:
        text_stream = io.TextIOWrapper(response, encoding="utf-8", newline="")
        reader = csv.DictReader(text_stream, delimiter="\t")
        fieldnames = list(reader.fieldnames or [])
        if "state_po" not in fieldnames or "office" not in fieldnames:
            raise ValueError("MIT precinct TSV header did not contain expected fields")
        with RAW_OUT.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in reader:
                seen += 1
                if seen % 1_000_000 == 0:
                    print(f"scanned {seen:,} rows; kept {kept:,} Indiana President/Senate rows", file=sys.stderr)
                if row.get("state_po") != "IN":
                    continue
                if row.get("year") != "2024" or row.get("stage") != "GEN":
                    continue
                if row.get("office") not in {"US PRESIDENT", "US SENATE"}:
                    continue
                writer.writerow(row)
                kept += 1
    return {"inputRowsScanned": seen, "rawRowsKept": kept, "rawColumns": fieldnames}


def build_review() -> dict[str, object]:
    rows = list(csv.DictReader(RAW_OUT.open("r", encoding="utf-8-sig", newline="")))
    county_modes: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        county_modes[str(row.get("county_fips") or "")].add(str(row.get("mode") or "").upper())

    totals: dict[tuple[str, str, str], dict[str, object]] = {}
    modes_used: dict[str, str] = {}
    for row in rows:
        county_fips = str(row.get("county_fips") or "")
        mode = str(row.get("mode") or "").upper()
        if "TOTAL" in county_modes[county_fips]:
            if mode != "TOTAL":
                continue
            modes_used[county_fips] = "TOTAL"
        else:
            modes_used[county_fips] = "SUM_NON_TOTAL_MODES"

        key = key_for(row)
        bucket = totals.setdefault(
            key,
            {
                "county": norm_county(str(row.get("county_name") or "")),
                "county_fips": county_fips,
                "precinct": str(row.get("precinct") or "").strip(),
                "pres": defaultdict(int),
                "senate": defaultdict(int),
            },
        )
        office = str(row.get("office") or "")
        party = str(row.get("party_simplified") or "").upper()
        votes = int_votes(row.get("votes"))
        if office == "US PRESIDENT":
            bucket["pres"][party] += votes
        elif office == "US SENATE":
            bucket["senate"][party] += votes

    output_fields = [
        "state",
        "election_year",
        "county",
        "local_unit",
        "pres_harris",
        "pres_trump",
        "pres_other",
        "pres_total",
        "comparison_dem",
        "comparison_rep",
        "comparison_other",
        "source_mode",
        "source_county_fips",
    ]
    review_rows = []
    omitted_missing = 0
    omitted_zero = 0
    for item in totals.values():
        pres = item["pres"]
        senate = item["senate"]
        pres_harris = pres.get("DEMOCRAT", 0)
        pres_trump = pres.get("REPUBLICAN", 0)
        comparison_dem = senate.get("DEMOCRAT", 0)
        comparison_rep = senate.get("REPUBLICAN", 0)
        if not (pres_harris or pres_trump) or not (comparison_dem or comparison_rep):
            omitted_missing += 1
            continue
        pres_total = sum(pres.values())
        if pres_total <= 0:
            omitted_zero += 1
            continue
        county_fips = str(item["county_fips"])
        review_rows.append(
            {
                "state": "IN",
                "election_year": "2024",
                "county": item["county"],
                "local_unit": item["precinct"],
                "pres_harris": str(pres_harris),
                "pres_trump": str(pres_trump),
                "pres_other": str(pres_total - pres_harris - pres_trump),
                "pres_total": str(pres_total),
                "comparison_dem": str(comparison_dem),
                "comparison_rep": str(comparison_rep),
                "comparison_other": str(sum(senate.values()) - comparison_dem - comparison_rep),
                "source_mode": modes_used.get(county_fips, ""),
                "source_county_fips": county_fips,
            }
        )

    review_rows.sort(key=lambda row: (row["county"], row["local_unit"]))
    with REVIEW_OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=output_fields)
        writer.writeheader()
        writer.writerows(review_rows)

    county_count = len({row["county"] for row in review_rows})
    return {
        "reviewRows": len(review_rows),
        "reviewCountyCount": county_count,
        "omittedUnitsMissingPresidentOrSenate": omitted_missing,
        "omittedZeroPresidentUnits": omitted_zero,
        "modePolicy": "Use TOTAL mode per county where present; otherwise sum all reported non-total modes.",
        "sourceRowsByModePolicy": dict(sorted(modes_used.items())),
    }


def main() -> None:
    raw_summary = collect_raw()
    review_summary = build_review()
    manifest = {
        "source": {
            "title": "MIT Election Data and Science Lab Precinct-Level Returns 2024 by Individual State",
            "datasetUrl": "https://doi.org/10.7910/DVN/NYTPDU",
            "dataFileName": DATA_FILE_NAME,
            "dataFileUrl": DATA_URL,
            "dataFileId": DATA_FILE_ID,
            "upstreamSources": [
                "https://enr.indianavoters.in.gov/archive/2024General/index.html",
                "https://github.com/openelections/openelections-data-in/tree/master/2024/counties",
            ],
            "caveat": "MIT warns Indiana's precinct file has major completeness and accuracy caveats: Senate/Governor totals are overreported in some counties, and some counties reuse precinct labels for distinct ballot batches.",
        },
        **raw_summary,
        **review_summary,
    }
    MANIFEST_OUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
