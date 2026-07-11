from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PRESIDENT_RACE_NUMBER = "10001"
NORMALIZED_SOURCE_ID = "ok-historical-presidential-baseline"
MAX_CSV_BYTES = 100 * 1024 * 1024

SOURCES = (
    {
        "year": 2016,
        "electionDate": "20161108",
        "archive": "data/ok-2016-official-results/20161108_CountyResults_csv.zip",
        "member": "20161108_CountyResults.csv",
        "sourceId": "ok-2016-general-county-results",
        "sourceUrl": "https://results.okelections.gov/OKERS/enrapi/GetExtract/CLCSV/20161108",
        "discoveryPageUrl": "https://oklahoma.gov/elections/elections-results/election-results/2016-election-results/2016-november-general-election.html",
        "expected": {"rows": 77, "dem": 420375, "rep": 949136, "other": 83481, "total": 1452992},
        "expectedSourceRows": 3667,
        "expectedPresidentRows": 231,
        "expectedSha256": "d4c4411c078ed7d7b3fcdf539b07c65026bb3bd185ff2dc570a53186f667bdf7",
        "expectedTickets": (
            ("DONALD J. TRUMP | MICHAEL R. PENCE", "REP"),
            ("GARY JOHNSON | BILL WELD", "LIB"),
            ("HILLARY CLINTON | TIM KAINE", "DEM"),
        ),
    },
    {
        "year": 2020,
        "electionDate": "20201103",
        "archive": "data/ok-2020-official-results/20201103_CountyResults_csv.zip",
        "member": "20201103_CountyResults.csv",
        "sourceId": "ok-2020-general-county-results",
        "sourceUrl": "https://results.okelections.gov/OKERS/enrapi/GetExtract/CLCSV/20201103",
        "discoveryPageUrl": "https://oklahoma.gov/elections/elections-results/election-results/2020-election-results/2020-november-general-election.html",
        "expected": {"rows": 77, "dem": 503890, "rep": 1020280, "other": 36529, "total": 1560699},
        "expectedSourceRows": 3232,
        "expectedPresidentRows": 462,
        "expectedSha256": "edf1231540b2ddf637b8a2c358fdb6bd4930cc0d12eacf9e2e18f533e3f9ff7b",
        "expectedTickets": (
            ("BROCK PIERCE | KARLA BALLARD", "IND"),
            ("DONALD J. TRUMP | MICHAEL R. PENCE", "REP"),
            ("JADE SIMMONS | CLAUDELIAH J. ROZE", "IND"),
            ("JO JORGENSEN | JEREMY SPIKE COHEN", "LIB"),
            ("JOSEPH R. BIDEN | KAMALA D. HARRIS", "DEM"),
            ("KANYE WEST | MICHELLE TIDBALL", "IND"),
        ),
    },
)

OUTPUT_COLUMNS = (
    "state",
    "election_year",
    "jurisdiction_name",
    "jurisdiction_tag",
    "local_unit",
    "source_id",
    "source_level",
    "row_method",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source_url",
    "notes",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def county_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = re.sub(r"\bCOUNTY\b", "", text, flags=re.IGNORECASE)
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def nonnegative_integer(value: Any, label: str) -> int:
    text = str(value or "").strip()
    if not re.fullmatch(r"\d+", text):
        raise ValueError(f"{label} is not a nonnegative integer: {value!r}")
    number = int(text)
    if number > 2**53 - 1:
        raise ValueError(f"{label} exceeds the safe integer range: {number}")
    return number


def read_exact_root_csv(archive_path: Path, expected_member: str) -> tuple[bytes, dict[str, Any]]:
    if not expected_member or PurePosixPath(expected_member).name != expected_member or "\\" in expected_member:
        raise ValueError(f"Expected ZIP member must be a root filename: {expected_member!r}")
    archive_bytes = archive_path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        members = archive.infolist()
        names = [member.filename for member in members]
        if names != [expected_member]:
            raise ValueError(
                f"{archive_path} must contain only exact root member {expected_member!r}; found {names!r}"
            )
        member = members[0]
        path = PurePosixPath(member.filename)
        if member.is_dir() or path.is_absolute() or ".." in path.parts or path.name != member.filename:
            raise ValueError(f"Unsafe ZIP member path in {archive_path}: {member.filename!r}")
        if member.flag_bits & 0x1:
            raise ValueError(f"Encrypted ZIP member is not supported: {member.filename}")
        unix_type = (member.external_attr >> 16) & 0o170000
        if unix_type == 0o120000:
            raise ValueError(f"Symlink ZIP member is not supported: {member.filename}")
        if member.file_size > MAX_CSV_BYTES:
            raise ValueError(f"ZIP member exceeds {MAX_CSV_BYTES} bytes: {member.filename}")
        csv_bytes = archive.read(member)
        if len(csv_bytes) != member.file_size:
            raise ValueError(f"ZIP member size mismatch for {member.filename}")
    return csv_bytes, {
        "localFile": archive_path.relative_to(REPO_ROOT).as_posix(),
        "sha256": sha256(archive_bytes),
        "byteLength": len(archive_bytes),
        "archiveMember": expected_member,
        "memberCrc32": f"{member.CRC:08x}",
        "memberByteLength": member.file_size,
        "memberCompressedByteLength": member.compress_size,
    }


def load_counties(repo_root: Path) -> tuple[dict[str, dict[str, str]], dict[str, Any]]:
    geometry_path = repo_root / "data/ok-counties.geojson"
    geometry_bytes = geometry_path.read_bytes()
    geometry_payload = json.loads(geometry_bytes.decode("utf-8"))
    counties: dict[str, dict[str, str]] = {}
    tags: set[str] = set()
    for feature in geometry_payload.get("features", []):
        properties = feature.get("properties", {})
        basename = str(properties.get("BASENAME") or "").strip()
        name = str(properties.get("NAME") or "").strip()
        geoid = str(properties.get("GEOID") or "").strip()
        key = county_key(basename)
        tag = f"county:{geoid}"
        if not key or not name or not re.fullmatch(r"40\d{3}", geoid):
            raise ValueError(f"Invalid Oklahoma county geometry properties: {properties!r}")
        if key in counties or tag in tags:
            raise ValueError(f"Duplicate Oklahoma county geometry key/tag: {key} / {tag}")
        counties[key] = {"name": name, "basename": basename, "tag": tag}
        tags.add(tag)
    if len(counties) != 77:
        raise ValueError(f"Expected 77 Oklahoma county geometry features, got {len(counties)}")

    config = json.loads((repo_root / "etl/state-configs/ok.json").read_text(encoding="utf-8"))
    county_codes = config.get("certifiedResults", {}).get("countyCodes", {})
    code_names = [str(name).strip() for name in county_codes.values()]
    if len(county_codes) != 77 or len({county_key(name) for name in code_names}) != 77:
        raise ValueError("Oklahoma certifiedResults.countyCodes must contain 77 unique county names")
    geometry_keys = set(counties)
    config_keys = {county_key(name) for name in code_names}
    if config_keys != geometry_keys:
        raise ValueError(
            f"Oklahoma config/geometry county mismatch: missing={sorted(geometry_keys - config_keys)}, "
            f"extra={sorted(config_keys - geometry_keys)}"
        )
    return counties, {
        "authority": "U.S. Census Bureau",
        "sourceUrl": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1",
        "localFile": "data/ok-counties.geojson",
        "sha256": sha256(geometry_bytes),
        "featureCount": len(counties),
        "jurisdictionTagPattern": "county:<GEOID>",
    }


def parse_source(repo_root: Path, source: dict[str, Any], counties: dict[str, dict[str, str]]) -> dict[str, Any]:
    archive_path = repo_root / source["archive"]
    csv_bytes, archive_summary = read_exact_root_csv(archive_path, source["member"])
    if archive_summary["sha256"] != source["expectedSha256"]:
        raise ValueError(
            f"{archive_path} SHA-256 mismatch: expected {source['expectedSha256']}, "
            f"got {archive_summary['sha256']}"
        )
    try:
        text = csv_bytes.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError as error:
        raise ValueError(f"{archive_path} CSV is not valid UTF-8: {error}") from error
    reader = csv.DictReader(io.StringIO(text, newline=""))
    required = {"county", "race_number", "cand_name", "cand_party", "cand_tot_votes"}
    missing = sorted(required.difference(reader.fieldnames or []))
    if missing:
        raise ValueError(f"{archive_path} is missing required columns: {', '.join(missing)}")

    county_rows: dict[str, dict[str, Any]] = {}
    candidate_totals: dict[tuple[str, str], int] = {}
    candidate_keys_by_county: dict[str, set[tuple[str, str]]] = {}
    source_row_count = 0
    president_row_count = 0
    seen_candidate_rows: set[tuple[str, str, str]] = set()
    for line_number, row in enumerate(reader, start=2):
        source_row_count += 1
        if str(row.get("race_number") or "").strip() != PRESIDENT_RACE_NUMBER:
            continue
        president_row_count += 1
        raw_county = str(row.get("county") or "").strip()
        key = county_key(raw_county)
        county = counties.get(key)
        if county is None:
            raise ValueError(f"{archive_path}:{line_number} has unknown county {raw_county!r}")
        candidate = str(row.get("cand_name") or "").strip()
        party = str(row.get("cand_party") or "").strip().upper()
        if not candidate:
            raise ValueError(f"{archive_path}:{line_number} is missing cand_name")
        votes = nonnegative_integer(row.get("cand_tot_votes"), f"{archive_path}:{line_number} cand_tot_votes")
        duplicate_key = (key, candidate, party)
        if duplicate_key in seen_candidate_rows:
            raise ValueError(f"{archive_path}:{line_number} duplicates {duplicate_key!r}")
        seen_candidate_rows.add(duplicate_key)
        candidate_key = (candidate, party)
        candidate_keys_by_county.setdefault(key, set()).add(candidate_key)
        candidate_totals[candidate_key] = candidate_totals.get(candidate_key, 0) + votes
        bucket = county_rows.setdefault(
            key,
            {"county": county, "localUnit": raw_county, "dem": 0, "rep": 0, "other": 0},
        )
        if bucket["localUnit"] != raw_county:
            raise ValueError(f"{archive_path} has inconsistent display names for {county['name']}")
        if party == "DEM":
            bucket["dem"] += votes
        elif party == "REP":
            bucket["rep"] += votes
        else:
            bucket["other"] += votes

    if len(county_rows) != 77 or set(county_rows) != set(counties):
        raise ValueError(
            f"{archive_path} expected all 77 counties; got {len(county_rows)}, "
            f"missing={sorted(set(counties) - set(county_rows))}"
        )
    if source_row_count != source["expectedSourceRows"] or president_row_count != source["expectedPresidentRows"]:
        raise ValueError(
            f"{archive_path} source/president row mismatch: expected "
            f"{source['expectedSourceRows']}/{source['expectedPresidentRows']}, got "
            f"{source_row_count}/{president_row_count}"
        )
    expected_tickets = set(source["expectedTickets"])
    actual_tickets = set(candidate_totals)
    if actual_tickets != expected_tickets:
        raise ValueError(
            f"{archive_path} presidential ticket mismatch: "
            f"missing={sorted(expected_tickets - actual_tickets)}, "
            f"extra={sorted(actual_tickets - expected_tickets)}"
        )
    for key, candidates in candidate_keys_by_county.items():
        if candidates != expected_tickets:
            raise ValueError(
                f"{archive_path} {county_rows[key]['localUnit']} presidential slate mismatch: "
                f"missing={sorted(expected_tickets - candidates)}, "
                f"extra={sorted(candidates - expected_tickets)}"
            )
        dem_count = sum(1 for _, party in candidates if party == "DEM")
        rep_count = sum(1 for _, party in candidates if party == "REP")
        if dem_count != 1 or rep_count != 1:
            raise ValueError(
                f"{archive_path} {county_rows[key]['localUnit']} expected one DEM and one REP candidate; "
                f"got DEM={dem_count}, REP={rep_count}"
            )

    rows = []
    for bucket in county_rows.values():
        total = bucket["dem"] + bucket["rep"] + bucket["other"]
        rows.append(
            {
                "state": "OK",
                "election_year": source["year"],
                "jurisdiction_name": bucket["county"]["name"],
                "jurisdiction_tag": bucket["county"]["tag"],
                "local_unit": bucket["localUnit"],
                "source_id": NORMALIZED_SOURCE_ID,
                "source_level": "county",
                "row_method": "oklahomaSbeCountyResultsCsvZip",
                "dem_votes": bucket["dem"],
                "rep_votes": bucket["rep"],
                "other_votes": bucket["other"],
                "total_votes": total,
                "source_url": source["sourceUrl"],
                "notes": (
                    "Official Oklahoma State Election Board county export for President race 10001; "
                    "all non-Democratic/non-Republican candidate votes are other_votes."
                ),
            }
        )
    rows.sort(key=lambda row: row["jurisdiction_name"])
    totals = {
        "rows": len(rows),
        "dem": sum(row["dem_votes"] for row in rows),
        "rep": sum(row["rep_votes"] for row in rows),
        "other": sum(row["other_votes"] for row in rows),
        "total": sum(row["total_votes"] for row in rows),
    }
    if totals != source["expected"]:
        raise ValueError(
            f"Oklahoma {source['year']} President totals mismatch: expected={source['expected']}, actual={totals}"
        )
    if sum(candidate_totals.values()) != totals["total"]:
        raise ValueError(f"Oklahoma {source['year']} candidate totals do not reconcile to county totals")
    return {
        "rows": rows,
        "summary": {
            "sourceId": source["sourceId"],
            "year": source["year"],
            "electionDate": source["electionDate"],
            "sourceAuthority": "Oklahoma State Election Board",
            "sourceUrl": source["sourceUrl"],
            "discoveryPageUrl": source["discoveryPageUrl"],
            **archive_summary,
            "sourceRowCount": source_row_count,
            "presidentRaceNumber": int(PRESIDENT_RACE_NUMBER),
            "presidentCandidateCountyRows": president_row_count,
            "sourceCountyCount": len(county_rows),
            "countyDisplayNames": sorted(bucket["localUnit"] for bucket in county_rows.values()),
            "candidateTotals": [
                {"candidate": candidate, "party": party or None, "votes": votes}
                for (candidate, party), votes in sorted(
                    candidate_totals.items(), key=lambda item: (-item[1], item[0][0], item[0][1])
                )
            ],
            "normalized": totals,
        },
    }


def csv_text(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def normalize(
    repo_root: Path = REPO_ROOT,
    output_path: Path | None = None,
    summary_path: Path | None = None,
) -> dict[str, Any]:
    output_path = output_path or repo_root / "data/ok-historical-presidential-baseline.csv"
    summary_path = summary_path or repo_root / "data/ok-historical-presidential-baseline-summary.json"
    counties, county_reference = load_counties(repo_root)
    parsed = [parse_source(repo_root, source, counties) for source in SOURCES]
    rows = sorted(
        [row for item in parsed for row in item["rows"]],
        key=lambda row: (row["election_year"], row["jurisdiction_name"]),
    )
    if len(rows) != 154:
        raise ValueError(f"Expected 154 Oklahoma historical rows, got {len(rows)}")
    for year in (2016, 2020):
        year_rows = [row for row in rows if row["election_year"] == year]
        tags = [row["jurisdiction_tag"] for row in year_rows]
        if len(tags) != 77 or len(set(tags)) != 77:
            raise ValueError(f"Oklahoma {year} expected 77 unique canonical county tags")

    summary = {
        "schemaVersion": 1,
        "sourceAuthority": "Oklahoma State Election Board",
        "parserOrNormalizationPath": "scripts/normalize-ok-historical-presidential-baseline.py",
        "reportingGrain": "county",
        "collectionMethod": (
            "Official county CSV exports retrieved through the public Oklahoma Election Results application. "
            "The short-lived bearer token used by that public export flow is not logged or persisted."
        ),
        "countyReference": county_reference,
        "sources": [item["summary"] for item in parsed],
        "output": {
            "localFile": output_path.relative_to(repo_root).as_posix()
            if output_path.is_relative_to(repo_root)
            else str(output_path),
            "rowCount": len(rows),
            "rowsPerYear": {"2016": 77, "2020": 77},
            "jurisdictionTagPattern": "county:<GEOID>",
        },
        "caveats": [
            "These official county candidate-vote rows are contextual historical baselines, not 2024 certified-result rows.",
            "The source exports do not represent blank, undervote, or overvote records as candidate votes.",
            "Official 2012 Oklahoma county presidential baselines remain uncollected in this pass.",
            "Historical jurisdiction_name uses canonical Census county display names while local_unit preserves the official export label; county:40079 therefore normalizes source LEFLORE to Le Flore County.",
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(csv_text(rows), encoding="utf-8", newline="")
    summary_path.write_text(f"{json.dumps(summary, indent=2)}\n", encoding="utf-8", newline="")
    return summary


def main() -> int:
    summary = normalize()
    print(json.dumps(summary["output"], sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
