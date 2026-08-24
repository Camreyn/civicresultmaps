"""Audit South Dakota's published 2024 certified local canvass bundles and polling-place list."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = ROOT / ".etl/sd-2024-certified-local-canvasses"
OUTPUT = ROOT / "data/sd-2024-certified-local-canvass-publication-audit.json"
COUNTY_RESULTS = ROOT / "data/sd-2024-general-president-county.csv"
POLLING_PATH = (
    ROOT
    / "data/precinct-geometry/SD/2024-11-05-general/raw/"
    "sd-2024-general-precincts-and-polling-places.pdf"
)
SOURCE_PAGE = (
    "https://sdsos.gov/elections-voting/election-resources/election-history/"
    "2024_Election_History.aspx"
)
POLLING_URL = (
    "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
    "2024GeneralPollingLocation.pdf"
)


@dataclass(frozen=True)
class Bundle:
    filename: str
    url: str
    byte_count: int
    sha256: str
    pages: int


BUNDLES = (
    Bundle(
        filename="Aurora-Clark.pdf",
        url=(
            "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
            "Recount-Canvass-and-Canvass-Docs-General/Aurora-Clark.pdf"
        ),
        byte_count=19_372_145,
        sha256="432c68f2d62031c9692af6f7c5fc22bc0f57c36211805ed8afe6898056203759",
        pages=112,
    ),
    Bundle(
        filename="Clay-Faulk.pdf",
        url=(
            "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
            "Recount-Canvass-and-Canvass-Docs-General/Clay-Faulk.pdf"
        ),
        byte_count=16_895_877,
        sha256="5bfec72afec250e3f6ee61469288a18320c905b60d5f0acd3a44a847d845f2bf",
        pages=87,
    ),
    Bundle(
        filename="Grant-Lyman.pdf",
        url=(
            "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
            "Recount-Canvass-and-Canvass-Docs-General/Grant-Lyman.pdf"
        ),
        byte_count=28_844_325,
        sha256="6dfd44263ae01edd2af256083545e7579b3c2b2a12fc441cbffb4ca1d9abd42a",
        pages=153,
    ),
    Bundle(
        filename="Marshall-Ziebach.pdf",
        url=(
            "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/"
            "Recount-Canvass-and-Canvass-Docs-General/Marshall-Ziebach.pdf"
        ),
        byte_count=43_617_360,
        sha256="df59610614bb65ecff19caa1d3afb1330cc47dfe229d7b5ffef75f86268726d6",
        pages=203,
    ),
)

POLLING_EXPECTED = {
    "byteCount": 835_498,
    "sha256": "622cb1dd85feac493d1fb8ba78cf486244bf261cc209d44cfc187fb50cf27667",
    "pdfPages": 48,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Download and hash-check the official PDFs.")
    parser.add_argument("--check", action="store_true", help="Fail if the committed audit summary is stale.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Directory containing the four county-canvass bundles.",
    )
    args = parser.parse_args()
    if args.collect and args.check:
        parser.error("use either --collect or --check, not both")
    if not args.source_dir.is_absolute():
        args.source_dir = ROOT / args.source_dir
    return args


def official_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "CivicResultMaps public-source acquisition (CivicResultMaps.org)"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise ValueError(f"Official PDF returned HTTP {response.status}: {url}")
        data = response.read()
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"Official URL did not return a PDF: {url}")
    return data


def verify_bytes(label: str, data: bytes, byte_count: int, sha256: str) -> None:
    actual = {"byteCount": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    expected = {"byteCount": byte_count, "sha256": sha256}
    if actual != expected:
        raise ValueError(f"Pinned {label} PDF drifted: expected={expected}, actual={actual}")


def canonical_counties() -> list[str]:
    with COUNTY_RESULTS.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    counties = sorted(row["jurisdiction_name"].removesuffix(" County") for row in rows)
    if len(counties) != 66 or len(set(counties)) != 66:
        raise ValueError(f"Expected 66 unique South Dakota counties, got {len(counties)}")
    return counties


def certificate_county(text: str, counties: list[str]) -> str | None:
    if not re.search(r"canvass|certificate", text, re.IGNORECASE):
        return None
    matches: list[str] = []
    for county in counties:
        escaped = re.escape(county)
        patterns = (
            rf"County Board of Canvassers in\s+{escaped}\s+County",
            rf"jurisdiction of\s+{escaped}\s+[Cc]ounty",
            rf"{escaped}\s+County,\s+South Dakota",
            rf"(?:C|G)OUNTY\s+OF\s*:?\s*{escaped}(?:\s|$)",
        )
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns):
            matches.append(county)
    if len(matches) > 1:
        raise ValueError(f"Ambiguous county certificate page: {matches}")
    return matches[0] if matches else None


def audit_bundle(bundle: Bundle, data: bytes, counties: list[str]) -> tuple[dict[str, object], list[str]]:
    verify_bytes(bundle.filename, data, bundle.byte_count, bundle.sha256)
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) != bundle.pages:
        raise ValueError(f"{bundle.filename} expected {bundle.pages} pages, got {len(reader.pages)}")

    certificates: list[dict[str, object]] = []
    full_text: list[str] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        full_text.append(text)
        county = certificate_county(text, counties)
        if county:
            certificates.append({"county": county, "certificatePage": page_number})

    joined = "\n".join(full_text)
    return (
        {
            "url": bundle.url,
            "stagingFile": f".etl/sd-2024-certified-local-canvasses/{bundle.filename}",
            "byteCount": bundle.byte_count,
            "sha256": bundle.sha256,
            "pdfPages": bundle.pages,
            "certificates": certificates,
        },
        [term for term in ("CountyID", "StatePrecinctID") if term.lower() in joined.lower()],
    )


def polling_report(data: bytes) -> dict[str, object]:
    verify_bytes(
        "2024GeneralPollingLocation.pdf",
        data,
        int(POLLING_EXPECTED["byteCount"]),
        str(POLLING_EXPECTED["sha256"]),
    )
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) != POLLING_EXPECTED["pdfPages"]:
        raise ValueError(
            f"Polling PDF expected {POLLING_EXPECTED['pdfPages']} pages, got {len(reader.pages)}"
        )
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    required_header = "County Precinct Name Polling Place Address City Instructions"
    if required_header not in text:
        raise ValueError("Polling PDF no longer exposes the expected tabular header")
    forbidden_identity_terms = [
        term for term in ("CountyID", "StatePrecinctID", "GEOID") if term.lower() in text.lower()
    ]
    return {
        "sourceUrl": POLLING_URL,
        "localFile": str(POLLING_PATH.relative_to(ROOT)).replace("\\", "/"),
        **POLLING_EXPECTED,
        "observedFields": ["County", "Precinct Name", "Polling Place", "Address", "City", "Instructions"],
        "stableResultOrFeatureIdTermsObserved": forbidden_identity_terms,
        "geometryFieldsObserved": [],
        "decision": "not_geometry_or_authoritative_result_unit_crosswalk",
    }


def output_or_check(data: bytes, check: bool) -> None:
    if check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != data:
            raise ValueError(f"{OUTPUT.relative_to(ROOT)} is stale; regenerate without --check")
        return
    OUTPUT.write_bytes(data)


def main() -> None:
    args = parse_args()
    counties = canonical_counties()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    bundle_reports: list[dict[str, object]] = []
    observed_identity_terms: set[str] = set()
    certificate_counties: list[str] = []

    for bundle in BUNDLES:
        path = args.source_dir / bundle.filename
        data = official_bytes(bundle.url) if args.collect else path.read_bytes()
        if args.collect:
            path.write_bytes(data)
        report, identity_terms = audit_bundle(bundle, data, counties)
        bundle_reports.append(report)
        observed_identity_terms.update(identity_terms)
        certificate_counties.extend(
            str(certificate["county"]) for certificate in report["certificates"]
        )

    polling_data = official_bytes(POLLING_URL) if args.collect else POLLING_PATH.read_bytes()
    if args.collect:
        POLLING_PATH.parent.mkdir(parents=True, exist_ok=True)
        POLLING_PATH.write_bytes(polling_data)
    polling = polling_report(polling_data)

    counts = Counter(certificate_counties)
    present = sorted(counts)
    missing = sorted(set(counties) - set(present))
    duplicated = sorted(county for county, count in counts.items() if count > 1)
    if len(present) != 64 or missing != ["Buffalo", "Stanley"] or duplicated != ["Brule"]:
        raise ValueError(
            "Certified-local publication coverage drifted: "
            f"present={len(present)}, missing={missing}, duplicated={duplicated}"
        )
    if observed_identity_terms:
        raise ValueError(f"Unexpected ENR identity terms appeared in certified bundles: {observed_identity_terms}")

    report = {
        "schemaVersion": 1,
        "state": "SD",
        "electionDate": "2024-11-05",
        "sourceAuthority": "South Dakota Secretary of State and county boards of canvassers",
        "sourcePage": SOURCE_PAGE,
        "parserOrNormalizationPath": "scripts/audit_sd_2024_certified_local_canvasses.py",
        "auditedAt": "2026-08-24",
        "bundles": bundle_reports,
        "coverage": {
            "publishedBundleCount": len(bundle_reports),
            "certificateRecords": len(certificate_counties),
            "distinctCountiesPresent": len(present),
            "countiesPresent": present,
            "missingCounties": missing,
            "duplicatedCounties": duplicated,
        },
        "identityAssessment": {
            "observedFields": ["county", "visible precinct name"],
            "enrIdentityTermsObserved": sorted(observed_identity_terms),
            "missingIdentityFields": [
                "ElectionID 684 CountyID",
                "ElectionID 684 StatePrecinctID",
                "geometry feature ID",
            ],
        },
        "pollingLocationEvidence": polling,
        "decision": "fail_closed_no_certified_local_or_geometry_activation",
        "blocker": (
            "The published bundles have county canvass certificate sections for 64 distinct "
            "counties but omit Buffalo and Stanley, and their local-result pages do not expose "
            "ElectionID 684 unit IDs. The official polling-location PDF is not geometry. "
            "An authoritative result-unit crosswalk and election-effective 2024 precinct "
            "geometry are still required."
        ),
    }
    output = (json.dumps(report, indent=2) + "\n").encode("utf-8")
    output_or_check(output, args.check)
    print(
        json.dumps(
            {
                "mode": "check" if args.check else "collect" if args.collect else "audit",
                "distinctCountiesPresent": len(present),
                "missingCounties": missing,
                "duplicatedCounties": duplicated,
                "output": str(OUTPUT.relative_to(ROOT)),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
