import argparse
import csv
import re
import zipfile
from collections import defaultdict
from pathlib import Path


DEFAULT_SOURCE_URL = (
    "https://elections.clarkcountynv.gov/electionresultsTV/cvr/24G/"
    "24G_CVRExport_NOV_Final_Confidential.zip"
)


def vote_value(value):
    return str(value or "").strip().strip('="') == "1"


def precinct_name(value):
    text = str(value or "").strip()
    if not text:
        return ""
    match = re.match(r"^(.+?)\s+\((.+?)\)$", text)
    return f"{match.group(1)} ({match.group(2)})" if match else text


def candidate_indexes(contests, candidates, contest_name):
    indexes = {}
    for index, contest in enumerate(contests):
        if str(contest or "").strip().lower().startswith(contest_name):
            indexes[str(candidates[index] or "").strip()] = index
    return indexes


def read_cvr_rows(zip_path):
    with zipfile.ZipFile(zip_path) as archive:
        if len(archive.namelist()) != 1:
            raise ValueError(f"Expected one CSV in {zip_path}, got {archive.namelist()!r}")
        with archive.open(archive.namelist()[0]) as raw:
            lines = (line.decode("utf-8-sig", errors="replace") for line in raw)
            reader = csv.reader(lines)
            next(reader)
            contests = next(reader)
            candidates = next(reader)
            next(reader)

            president = candidate_indexes(contests, candidates, "president ")
            senate = candidate_indexes(contests, candidates, "united states senate")
            required_candidates = {
                "Harris, Kamala D.",
                "Trump, Donald J.",
                "Oliver, Chase",
                "Skousen, Joel",
                "None of These Candidates",
                "Rosen, Jacky S.",
                "Brown, Sam",
                "Cunningham, Chris",
                "Hansen, Janine",
            }
            missing = sorted(required_candidates.difference(set(president) | set(senate)))
            if missing:
                raise ValueError(f"Clark CVR missing expected candidates: {', '.join(missing)}")

            rows = defaultdict(
                lambda: {
                    "pres_harris": 0,
                    "pres_trump": 0,
                    "pres_other": 0,
                    "comparison_dem": 0,
                    "comparison_rep": 0,
                    "comparison_other": 0,
                    "cvr_rows": 0,
                }
            )
            for row in reader:
                if len(row) < 26:
                    continue
                local_unit = precinct_name(row[6])
                if not local_unit:
                    continue
                bucket = rows[local_unit]
                bucket["cvr_rows"] += 1
                if vote_value(row[president["Harris, Kamala D."]]):
                    bucket["pres_harris"] += 1
                if vote_value(row[president["Trump, Donald J."]]):
                    bucket["pres_trump"] += 1
                for candidate in ("Oliver, Chase", "Skousen, Joel", "None of These Candidates"):
                    if vote_value(row[president[candidate]]):
                        bucket["pres_other"] += 1
                if vote_value(row[senate["Rosen, Jacky S."]]):
                    bucket["comparison_dem"] += 1
                if vote_value(row[senate["Brown, Sam"]]):
                    bucket["comparison_rep"] += 1
                for candidate in ("Cunningham, Chris", "Hansen, Janine", "None of These Candidates"):
                    if vote_value(row[senate[candidate]]):
                        bucket["comparison_other"] += 1

            return rows


def write_normalized(rows, output_path, source_url):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
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
        "comparison_total",
        "cvr_rows",
        "source_url",
    ]
    written = 0
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for local_unit in sorted(rows):
            row = rows[local_unit]
            pres_total = row["pres_harris"] + row["pres_trump"] + row["pres_other"]
            comparison_total = row["comparison_dem"] + row["comparison_rep"] + row["comparison_other"]
            if pres_total <= 0:
                continue
            writer.writerow(
                {
                    "state": "NV",
                    "election_year": 2024,
                    "county": "Clark County",
                    "local_unit": local_unit,
                    "pres_harris": row["pres_harris"],
                    "pres_trump": row["pres_trump"],
                    "pres_other": row["pres_other"],
                    "pres_total": pres_total,
                    "comparison_dem": row["comparison_dem"],
                    "comparison_rep": row["comparison_rep"],
                    "comparison_other": row["comparison_other"],
                    "comparison_total": comparison_total,
                    "cvr_rows": row["cvr_rows"],
                    "source_url": source_url,
                }
            )
            written += 1
    return written


def main():
    parser = argparse.ArgumentParser(
        description="Normalize Clark County, Nevada 2024 General CVR rows into local review rows."
    )
    parser.add_argument(
        "--zip",
        default="data/nv-clark-2024-general-cvr.zip",
        help="Path to the downloaded Clark County CVR zip.",
    )
    parser.add_argument(
        "--out",
        default="data/nv-clark-2024-general-cvr-precinct-review.csv",
        help="Normalized localComparisonCsv output path.",
    )
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    args = parser.parse_args()

    rows = read_cvr_rows(Path(args.zip))
    written = write_normalized(rows, Path(args.out), args.source_url)
    print(f"wrote {written} precinct review rows to {args.out}")


if __name__ == "__main__":
    main()
