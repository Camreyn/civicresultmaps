import argparse
import csv
import re
import zipfile
from collections import defaultdict
from contextlib import contextmanager
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


def candidate_indexes(contests, candidates, contest_names):
    if isinstance(contest_names, str):
        contest_names = (contest_names,)
    indexes = {}
    for index, contest in enumerate(contests):
        contest_text = str(contest or "").strip().lower()
        if any(contest_text.startswith(contest_name) for contest_name in contest_names):
            indexes[str(candidates[index] or "").strip()] = index
    return indexes


@contextmanager
def open_cvr_csv(input_path):
    if input_path.suffix.lower() == ".zip":
        with zipfile.ZipFile(input_path) as archive:
            csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
            if len(csv_names) != 1:
                raise ValueError(f"Expected one CSV in {input_path}, got {archive.namelist()!r}")
            with archive.open(csv_names[0]) as raw:
                yield (line.decode("utf-8-sig", errors="replace") for line in raw)
    else:
        with input_path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
            yield handle


def find_candidate(indexes, label):
    normalized_label = label.lower()
    matches = [index for candidate, index in indexes.items() if candidate.lower().startswith(normalized_label)]
    if not matches:
        raise ValueError(f"CVR missing expected candidate prefix: {label}")
    return matches[0]


def read_cvr_rows(input_path):
    with open_cvr_csv(input_path) as lines:
        reader = csv.reader(lines)
        next(reader)
        contests = next(reader)
        candidates = next(reader)
        next(reader)

        president = candidate_indexes(contests, candidates, "president ")
        senate = candidate_indexes(contests, candidates, ("united states senate", "united states senator"))
        indexes = {
            "pres_harris": find_candidate(president, "Harris, Kamala D."),
            "pres_trump": find_candidate(president, "Trump, Donald J."),
            "pres_oliver": find_candidate(president, "Oliver, Chase"),
            "pres_skousen": find_candidate(president, "Skousen, Joel"),
            "pres_none": find_candidate(president, "None of"),
            "senate_rosen": find_candidate(senate, "Rosen, Jacky S."),
            "senate_brown": find_candidate(senate, "Brown, Sam"),
            "senate_cunningham": find_candidate(senate, "Cunningham, Chris"),
            "senate_hansen": find_candidate(senate, "Hansen, Janine"),
            "senate_none": find_candidate(senate, "None of"),
        }

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
            if len(row) <= max(indexes.values()):
                continue
            local_unit = precinct_name(row[6])
            if not local_unit:
                continue
            bucket = rows[local_unit]
            bucket["cvr_rows"] += 1
            if vote_value(row[indexes["pres_harris"]]):
                bucket["pres_harris"] += 1
            if vote_value(row[indexes["pres_trump"]]):
                bucket["pres_trump"] += 1
            for key in ("pres_oliver", "pres_skousen", "pres_none"):
                if vote_value(row[indexes[key]]):
                    bucket["pres_other"] += 1
            if vote_value(row[indexes["senate_rosen"]]):
                bucket["comparison_dem"] += 1
            if vote_value(row[indexes["senate_brown"]]):
                bucket["comparison_rep"] += 1
            for key in ("senate_cunningham", "senate_hansen", "senate_none"):
                if vote_value(row[indexes[key]]):
                    bucket["comparison_other"] += 1

        return rows


def write_normalized(rows, output_path, county, source_url):
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
                    "county": county,
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
        description="Normalize Nevada 2024 General CVR rows into local review rows."
    )
    parser.add_argument(
        "--input",
        default="data/nv-clark-2024-general-cvr.zip",
        help="Path to the downloaded county CVR CSV or ZIP.",
    )
    parser.add_argument("--zip", dest="zip_path", help=argparse.SUPPRESS)
    parser.add_argument("--county", default="Clark County")
    parser.add_argument(
        "--out",
        default="data/nv-clark-2024-general-cvr-precinct-review.csv",
        help="Normalized localComparisonCsv output path.",
    )
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    args = parser.parse_args()

    input_path = Path(args.zip_path or args.input)
    rows = read_cvr_rows(input_path)
    written = write_normalized(rows, Path(args.out), args.county, args.source_url)
    print(f"wrote {written} precinct review rows to {args.out}")


if __name__ == "__main__":
    main()
