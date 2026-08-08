from __future__ import annotations

import csv
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from civic_etl.native import build_native_payload
from civic_etl.pipeline import load_config


CONFIG_PATH = Path("etl/state-configs/wy.json")
OUTPUT_PATH = Path("data/wy-historical-presidential-baseline.csv")
YEARS = (2012, 2016, 2020)


def main() -> None:
    config = load_config(CONFIG_PATH)
    payload = build_native_payload(config)
    if payload is None:
        raise ValueError("Wyoming native payload is unavailable")

    rows = sorted(
        payload.get("historicalRows", []),
        key=lambda row: (row["electionYear"], row["jurisdictionName"]),
    )
    counts_by_year = {
        year: sum(1 for row in rows if row["electionYear"] == year)
        for year in YEARS
    }
    if len(rows) != 69 or any(count != 23 for count in counts_by_year.values()):
        raise ValueError(
            f"Expected 69 Wyoming historical rows and 23 per year, got {len(rows)} and {counts_by_year}"
        )

    columns = [
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
        "notes",
    ]
    warning = config.raw.get("historicalBaselines", {}).get("warning", "")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "state": "WY",
                    "election_year": row["electionYear"],
                    "jurisdiction_name": row["jurisdictionName"],
                    "county": row["jurisdictionName"],
                    "local_unit": row["localUnit"],
                    "source_id": row["sourceId"],
                    "source_level": row["sourceLevel"],
                    "row_method": row["rowMethod"],
                    "source_url": row["sourceUrl"],
                    "dem_votes": row["demVotes"],
                    "rep_votes": row["repVotes"],
                    "other_votes": row["otherVotes"],
                    "total_votes": row["totalVotes"],
                    "notes": warning,
                }
            )

    print(
        json.dumps(
            {
                "output": str(OUTPUT_PATH).replace("\\", "/"),
                "rows": len(rows),
                "rowsByYear": counts_by_year,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
