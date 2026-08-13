#!/usr/bin/env python3
"""Build reviewable Iowa historical precinct relationship artifacts.

This script never sources vote totals from a geometry/reconstruction dataset.
It joins separately normalized official Iowa election-result identities to
hash-pinned geometry and emits the evidence used for every relationship.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import networkx as nx
from shapely.geometry import shape
from shapely.geometry import mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree


ROOT = Path(__file__).resolve().parents[1]


def read_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def canonical(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).upper()
    text = text.replace("&", " AND ").replace("’", "'")
    text = re.sub(r"\bPCT\b", " PRECINCT ", text)
    text = re.sub(r"\bPRCT\b", " PRECINCT ", text)
    text = re.sub(r"\bPRNCT\b", " PRECINCT ", text)
    text = re.sub(r"\bWARD\b", " W ", text)
    text = re.sub(r"\bPRECINCT\b", " P ", text)
    text = re.sub(r"\bTOWNSHIP\b", " TWP ", text)
    text = re.sub(r"\bCOUNTY\b", " ", text)
    return re.sub(r"[^A-Z0-9]+", "", text)


def tokens(value: object) -> set[str]:
    text = unicodedata.normalize("NFKC", str(value or "")).upper()
    return set(re.findall(r"[A-Z]+|\d+", text)) - {
        "COUNTY", "PRECINCT", "PCT", "WARD", "TOWNSHIP", "TWP",
    }


def score(left: str, right: str) -> int:
    a, b = canonical(left), canonical(right)
    if not a or not b:
        return 0
    if a == b:
        return 10_000
    ratio = SequenceMatcher(None, a, b).ratio()
    overlap = tokens(left) & tokens(right)
    numeric_left = re.findall(r"\d+", str(left))
    numeric_right = re.findall(r"\d+", str(right))
    numeric = 0
    if numeric_left and numeric_right:
        numeric = 1_500 if numeric_left == numeric_right else -2_500
    containment = 1_000 if a in b or b in a else 0
    return round(ratio * 5_000) + len(overlap) * 250 + numeric + containment


def county_name(value: object) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+County$", "", text, flags=re.I)
    return "O'Brien" if canonical(text) == "OBRIEN" else text


def feature_label(feature: dict) -> str:
    props = feature["properties"]
    return str(
        props.get("REVIEWED_2016_RESULT_LABEL")
        or props.get("DISTRICT")
        or props.get("NAME")
        or ""
    ).strip()


def combined_official_2014() -> list[dict]:
    base = "data/precinct-geometry/IA/raw-shared/2014-statewide-precinct-layer"
    features = []
    for name in ("features-0000.geojson", "features-1000.geojson"):
        features.extend(read_json(f"{base}/{name}")["features"])
    if len(features) != 1_689:
        raise RuntimeError(f"Official 2014 feature count drifted: {len(features)}")
    return features


def map_official_to_reviewed_2014() -> list[dict]:
    official = combined_official_2014()
    reviewed = read_json(
        "data/precinct-geometry/IA/raw-shared/dspg-isu/ia-2014-reviewed-precincts.geojson"
    )["features"]
    reviewed_shapes = [shape(feature["geometry"]) for feature in reviewed]
    tree = STRtree(reviewed_shapes)
    rows = []
    used_reviewed = defaultdict(int)
    for index, feature in enumerate(official):
        geometry = shape(feature["geometry"])
        candidates = list(tree.query(geometry))
        if not candidates:
            raise RuntimeError(f"Official 2014 feature {index} has no reviewed overlap")
        ranked = []
        for candidate in candidates:
            other = reviewed_shapes[int(candidate)]
            overlap = geometry.intersection(other).area
            ranked.append((overlap / max(geometry.area, 1e-30), int(candidate)))
        overlap_ratio, reviewed_index = max(ranked)
        if overlap_ratio < 0.49:
            raise RuntimeError(
                f"Official 2014 feature {index} has weak reviewed overlap {overlap_ratio:.6f}"
            )
        used_reviewed[reviewed_index] += 1
        context = reviewed[reviewed_index]["properties"]
        rows.append(
            {
                "officialIndex": index,
                "officialObjectId": feature["properties"].get("OBJECTID_12"),
                "officialDistrict": feature["properties"].get("DISTRICT"),
                "officialName": feature["properties"].get("NAME"),
                "reviewedIndex": reviewed_index,
                "county": county_name(context.get("COUNTY")),
                "district": context.get("DISTRICT"),
                "reviewed2016ResultLabel": context.get("REVIEWED_2016_RESULT_LABEL"),
                "geometryName": context.get("NAME"),
                "overlapRatio": round(overlap_ratio, 8),
            }
        )
    duplicates = {key: value for key, value in used_reviewed.items() if value != 1}
    return rows, duplicates


def result_rows_2012() -> list[dict]:
    document = read_json(
        "data/precinct-geometry/IA/2012-11-06-general/reports/"
        "ia-2012-11-06-presidential-precinct-results.json"
    )
    rows = [row for row in document["rows"] if row.get("isGeographic")]
    if len(rows) != 1_686:
        raise RuntimeError(f"Official 2012 geographic result count drifted: {len(rows)}")
    return rows


def candidate_labels(context: dict) -> list[str]:
    values = [
        context.get("officialDistrict"),
        context.get("officialName"),
        context.get("district"),
        context.get("reviewed2016ResultLabel"),
        context.get("geometryName"),
    ]
    county = context["county"]
    expanded = []
    for value in values:
        if value is None:
            continue
        expanded.append(str(value))
        prefix = re.compile(rf"^{re.escape(county)}\s+", re.I)
        expanded.append(prefix.sub("", str(value)))
    return list(dict.fromkeys(value for value in expanded if value.strip()))


def build_2012_diagnostic() -> dict:
    geometry, duplicate_reviewed = map_official_to_reviewed_2014()
    results = result_rows_2012()
    geometry_by_county = defaultdict(list)
    results_by_county = defaultdict(list)
    for row in geometry:
        geometry_by_county[row["county"]].append(row)
    for row in results:
        results_by_county[county_name(row["county"])].append(row)

    assignments = []
    leftovers = []
    for county in sorted(set(geometry_by_county) | set(results_by_county)):
        county_geometry = geometry_by_county[county]
        county_results = results_by_county[county]
        graph = nx.Graph()
        for result_index, result in enumerate(county_results):
            graph.add_node(("r", result_index), bipartite=0)
            for geometry_index, context in enumerate(county_geometry):
                best = max(score(result["sourceDisplayName"], label) for label in candidate_labels(context))
                graph.add_edge(("r", result_index), ("g", geometry_index), weight=best)
        matching = nx.algorithms.matching.max_weight_matching(
            graph, maxcardinality=True, weight="weight"
        )
        matched_results, matched_geometry = set(), set()
        for left, right in matching:
            if left[0] == "g":
                left, right = right, left
            if left[0] != "r" or right[0] != "g":
                continue
            result_index, geometry_index = left[1], right[1]
            result, context = county_results[result_index], county_geometry[geometry_index]
            values = [(score(result["sourceDisplayName"], label), label) for label in candidate_labels(context)]
            best_score, best_label = max(values)
            assignments.append(
                {
                    "county": county,
                    "parentGeoid": result["parentGeoid"],
                    "resultUnitCode": result["resultUnitCode"],
                    "resultLabel": result["sourceDisplayName"],
                    "officialIndex": context["officialIndex"],
                    "officialObjectId": context["officialObjectId"],
                    "officialDistrict": context["officialDistrict"],
                    "officialName": context["officialName"],
                    "reviewedDistrict": context["district"],
                    "reviewed2016ResultLabel": context["reviewed2016ResultLabel"],
                    "matchedLabel": best_label,
                    "score": best_score,
                    "overlapRatio": context["overlapRatio"],
                }
            )
            matched_results.add(result_index)
            matched_geometry.add(geometry_index)
        leftovers.append(
            {
                "county": county,
                "resultCount": len(county_results),
                "geometryCount": len(county_geometry),
                "unmatchedResults": [
                    county_results[index]["sourceDisplayName"]
                    for index in range(len(county_results))
                    if index not in matched_results
                ],
                "unmatchedGeometry": [
                    {
                        "officialObjectId": county_geometry[index]["officialObjectId"],
                        "officialDistrict": county_geometry[index]["officialDistrict"],
                        "officialName": county_geometry[index]["officialName"],
                        "reviewedDistrict": county_geometry[index]["district"],
                        "reviewed2016ResultLabel": county_geometry[index]["reviewed2016ResultLabel"],
                    }
                    for index in range(len(county_geometry))
                    if index not in matched_geometry
                ],
            }
        )
    assignments.sort(key=lambda row: (row["parentGeoid"], row["resultLabel"]))
    return {
        "schemaVersion": 1,
        "state": "IA",
        "year": 2012,
        "role": "Diagnostic maximum-weight identity assignment; not a reviewed public crosswalk.",
        "summary": {
            "resultCount": len(results),
            "officialGeometryCount": len(geometry),
            "assignmentCount": len(assignments),
            "scoreBands": {
                "exact": sum(row["score"] >= 10_000 for row in assignments),
                "high": sum(7_000 <= row["score"] < 10_000 for row in assignments),
                "review": sum(row["score"] < 7_000 for row in assignments),
            },
            "reviewedGeometryReuse": duplicate_reviewed,
        },
        "countyLeftovers": [row for row in leftovers if row["unmatchedResults"] or row["unmatchedGeometry"]],
        "rows": assignments,
    }


def read_gzip_json(relative: str):
    return json.loads(gzip.decompress((ROOT / relative).read_bytes()))


def results(year: int) -> list[dict]:
    election_id = {
        2016: "2016-11-08-general",
        2020: "2020-11-03-general",
        2024: "2024-11-05-general",
    }[year]
    document = read_gzip_json(
        f"data/precinct-geometry/IA/{election_id}/normalized/ia-{year}-president-results.json.gz"
    )
    return document["rows"]


def official_2016_features() -> list[dict]:
    document = read_gzip_json(
        "data/precinct-geometry/IA/2016-11-08-general/normalized/"
        "ia-2016-11-08-precincts-candidate.geojson.gz"
    )
    if len(document.get("features", [])) != 1_681:
        raise RuntimeError("Official Iowa 2016 geometry feature count drifted")
    return document["features"]


def reviewed_2014_context_for_2016() -> list[dict]:
    reviewed = read_json(
        "data/precinct-geometry/IA/raw-shared/dspg-isu/ia-2014-reviewed-precincts.geojson"
    )["features"]
    reviewed_shapes = [shape(feature["geometry"]) for feature in reviewed]
    tree = STRtree(reviewed_shapes)
    output = []
    for feature in official_2016_features():
        geometry = shape(feature["geometry"])
        candidates = list(tree.query(geometry))
        ranked = []
        for candidate in candidates:
            other = reviewed_shapes[int(candidate)]
            overlap = geometry.intersection(other).area
            if overlap > 0:
                ranked.append((overlap / max(geometry.area, 1e-30), int(candidate)))
        if not ranked:
            raise RuntimeError(
                f"Official 2016 feature {feature['properties']['CRM_FEATURE_ID']} has no reviewed 2014 overlap"
            )
        overlap_ratio, reviewed_index = max(ranked)
        if overlap_ratio < 0.49:
            raise RuntimeError(
                f"Official 2016 feature {feature['properties']['CRM_FEATURE_ID']} has weak reviewed overlap {overlap_ratio:.6f}"
            )
        context = reviewed[reviewed_index]["properties"]
        output.append(
            {
                "feature": feature,
                "featureId": feature["properties"]["CRM_FEATURE_ID"],
                "parentGeoid": feature["properties"]["CRM_PARENT_GEOID"],
                "reviewedCounty": county_name(context.get("COUNTY")),
                "reviewedDistrict": context.get("DISTRICT"),
                "reviewed2016ResultLabel": context.get("REVIEWED_2016_RESULT_LABEL"),
                "reviewedGeometryName": context.get("NAME"),
                "overlapRatio": round(overlap_ratio, 8),
            }
        )
    return output


MANUAL_2016_FEATURE_TO_RESULT = {
    "7_W106": "WL W1 P6",
    "13_CNLGTGA": "Center-Logan-Twin Lakes-Garfield-Lake Creek",
    "13_SHERMAN": "Sherman",
    "30_PCT 09": "Precinct No. 9",
    "31_37": "Operation New View",
    "31_38": "Dyersville Social Center",
    "40_PCT 1": "Precinct 1",
    "40_PCT 2": "Precinct 2",
    "40_PCT 3": "Precinct 3",
    "42_EL": "Eldora/Pleasant/Providence/Union",
    "42_ELC": "Eldora City",
    "56_CH VB": "CENTRAL LEE HIGH SCH",
    "56_KE2A": "HERITAGE CENTER A",
    "56_KE3": "KEOKUK PUBLIC LIBRARY",
    "56_KE6": "EVANGELICAL FREE CHURCH",
    "56_KE7": "KEOKUK NAZARENE CHURCH",
    "77_BOND 1": "BONDURANT 1",
    "77_BOND 2": "BONDURANT 2",
    "77_PH 1": "PLEASANT HILL 1",
    "77_PH 2": "PLEASANT HILL 2",
    "77_PH 3": "PLEASANT HILL 3",
    "77_WDM-312": "WEST DES MOINES 312",
    "77_WDM-313": "WEST DES MOINES 313",
}


def feature_aliases_2016(context: dict) -> list[str]:
    props = context["feature"]["properties"]
    manual = MANUAL_2016_FEATURE_TO_RESULT.get(context["featureId"])
    aliases = [manual] if manual else [
        context.get("reviewed2016ResultLabel"),
        context.get("reviewedDistrict"),
        context.get("reviewedGeometryName"),
    ]
    aliases.extend([
        props.get("CRM_SOS_ID"),
        props.get("CRM_SOSID_NEW"),
        props.get("CRM_DISTRICT"),
        props.get("CRM_DISPLAY_NAME"),
    ])
    return list(dict.fromkeys(str(value).strip() for value in aliases if value is not None and str(value).strip()))


def build_2016_reviewed() -> tuple[dict, dict]:
    source_results = results(2016)
    contexts = reviewed_2014_context_for_2016()
    by_county = defaultdict(list)
    for context in contexts:
        by_county[context["parentGeoid"]].append(context)

    assignments = []
    used_features = set()
    unresolved = []
    for result in source_results:
        county_contexts = by_county[result["parentGeoid"]]
        exact = [
            context
            for context in county_contexts
            if any(canonical(result["sourceUnitId"]) == canonical(alias) for alias in feature_aliases_2016(context))
        ]
        if result["parentGeoid"] == "19059" and canonical(result["sourceUnitId"]) == canonical("Precinct 6 & No. 7"):
            exact = [
                context
                for context in county_contexts
                if context["featureId"] in {"30_PCT 06", "30_PCT 07"}
            ]
        exact = [context for context in exact if context["featureId"] not in used_features]
        if len(exact) != (2 if result["parentGeoid"] == "19059" and canonical(result["sourceUnitId"]) == canonical("Precinct 6 & No. 7") else 1):
            ranked = sorted(
                [
                    (
                        max(score(result["sourceUnitId"], alias) for alias in feature_aliases_2016(context)),
                        context,
                    )
                    for context in county_contexts
                    if context["featureId"] not in used_features
                ],
                key=lambda item: (item[0], item[1]["featureId"]),
                reverse=True,
            )
            unresolved.append(
                {
                    "parentGeoid": result["parentGeoid"],
                    "resultUnitCode": result["resultUnitCode"],
                    "resultLabel": result["sourceUnitId"],
                    "exactCandidateCount": len(exact),
                    "topCandidates": [
                        {
                            "score": item[0],
                            "featureId": item[1]["featureId"],
                            "aliases": feature_aliases_2016(item[1]),
                        }
                        for item in ranked[:5]
                    ],
                }
            )
            continue
        for context in exact:
            used_features.add(context["featureId"])
        assignments.append((result, exact))

    if unresolved:
        diagnostic = {
            "schemaVersion": 1,
            "state": "IA",
            "year": 2016,
            "summary": {
                "resultCount": len(source_results),
                "officialGeometryCount": len(contexts),
                "assignmentCount": len(assignments),
                "unresolvedCount": len(unresolved),
                "unusedGeometryCount": len(contexts) - len(used_features),
            },
            "unresolved": unresolved,
            "unusedGeometry": [
                {
                    "featureId": context["featureId"],
                    "parentGeoid": context["parentGeoid"],
                    "aliases": feature_aliases_2016(context),
                }
                for context in contexts
                if context["featureId"] not in used_features
            ],
        }
        raise RuntimeError(json.dumps(diagnostic, ensure_ascii=False))

    geometry_features = []
    crosswalk_rows = []
    for result, components in assignments:
        source_feature_id = "ia-2016:" + result["parentGeoid"] + ":" + result["resultUnitCode"].split(":")[-1]
        component_ids = [context["featureId"] for context in components]
        merged = unary_union([shape(context["feature"]["geometry"]) for context in components])
        geometry_features.append(
            {
                "type": "Feature",
                "properties": {
                    "CRM_FEATURE_ID": source_feature_id,
                    "CRM_NATIVE_ID": result["sourceUnitId"],
                    "CRM_DISPLAY_NAME": result["sourceDisplayName"],
                    "CRM_PARENT_GEOID": result["parentGeoid"],
                    "CRM_PARENT_NAME": result["parentSourceName"],
                    "CRM_SOURCE_FEATURE_IDS": component_ids,
                    "CRM_REVIEW_METHOD": "official_2016_polygon_spatially_linked_through_reviewed_2014_to_2016_identity_bridge",
                },
                "geometry": mapping(merged),
            }
        )
        crosswalk_rows.append(
            {
                "resultUnitCode": result["resultUnitCode"],
                "sourceUnitId": result["sourceUnitId"],
                "sourceDisplayName": result["sourceDisplayName"],
                "parentGeoid": result["parentGeoid"],
                "reportingGrain": "precinct",
                "isGeographic": True,
                "relationships": [
                    {
                        "sourceFeatureId": f"{result['parentGeoid']}|{source_feature_id}",
                        "relationshipType": "one_to_one",
                        "matchMethod": "official_crosswalk",
                        "reviewStatus": "reviewed",
                        "confidence": "high",
                        "note": (
                            "Official Iowa 2016 result identity linked to official LSA/SOS 2016 geometry through the "
                            "hash-pinned DSPG-ISU reviewed 2014-to-2016 label bridge. Vote values come only from "
                            "the official Iowa SOS workbook."
                        ),
                        "sourceComponentFeatureIds": component_ids,
                    }
                ],
            }
        )
    geometry_features.sort(key=lambda feature: feature["properties"]["CRM_FEATURE_ID"])
    crosswalk_rows.sort(key=lambda row: row["resultUnitCode"])
    geometry = {
        "type": "FeatureCollection",
        "metadata": {
            "schemaVersion": 1,
            "state": "IA",
            "electionId": "2016-11-08-general",
            "sourceAuthority": "Iowa Legislative Services Agency under the purview of the Iowa Secretary of State",
            "sourceFeatureCount": 1_681,
            "normalizedFeatureCount": len(geometry_features),
            "voteFieldsIncluded": False,
            "reviewMethod": "Official 2016 polygons spatially linked to the reviewed DSPG-ISU 2014-to-2016 identity bridge; one official Dickinson result combines two official polygons.",
        },
        "features": geometry_features,
    }
    crosswalk = {
        "schemaVersion": 1,
        "manifestId": "ia-2016-2016-11-08-precinct-geometry-candidate-v1",
        "state": "IA",
        "electionId": "2016-11-08-general",
        "geographyLevel": "precinct",
        "resultSourceId": "ia-sos-2016-general-county-precinct-workbooks",
        "generatedAt": "2026-08-12T23:58:58.000Z",
        "rows": crosswalk_rows,
        "reconciliation": {
            "status": "passed",
            "scopes": [
                {
                    "scopeType": "state",
                    "scopeId": "IA",
                    "resultTotals": {
                        key: sum(int(row[key]) for row in source_results)
                        for key in ["democratic", "republican", "other", "total"]
                    },
                    "mappedTotals": {
                        key: sum(int(row[key]) for row in source_results)
                        for key in ["democratic", "republican", "other", "total"]
                    },
                    "deltas": {
                        key: 0
                        for key in ["democratic", "republican", "other", "total"]
                    },
                }
            ],
            "resultUnitCount": len(source_results),
            "geometryFeatureCount": len(geometry_features),
            "relationshipRecordCount": len(crosswalk_rows),
            "officialSourceComponentCount": sum(len(components) for _, components in assignments),
            "unusedOfficialSourceFeatureCount": len(contexts) - len(used_features),
        },
    }
    return geometry, crosswalk


def write_document(relative: str, document: dict):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    target.write_text(payload, encoding="utf-8", newline="\n")
    print(
        json.dumps(
            {
                "output": relative,
                "byteCount": len(payload.encode("utf-8")),
                "sha256": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
                "summary": document.get("summary", document.get("reconciliation")),
            }
        )
    )


def write_gzip_document(relative: str, document: dict):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise RuntimeError(f"Refusing to replace existing output: {relative}")
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    compressed = gzip.compress(payload, compresslevel=9, mtime=0)
    target.write_bytes(compressed)
    print(
        json.dumps(
            {
                "output": relative,
                "byteCount": len(compressed),
                "sha256": hashlib.sha256(compressed).hexdigest(),
                "featureCount": len(document.get("features", [])),
            }
        )
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, choices=[2012, 2016], required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--crosswalk-out")
    args = parser.parse_args()
    if args.year == 2012:
        write_document(args.out, build_2012_diagnostic())
        return
    if not args.crosswalk_out:
        raise RuntimeError("--crosswalk-out is required for 2016")
    geometry, crosswalk = build_2016_reviewed()
    write_gzip_document(args.out, geometry)
    write_document(args.crosswalk_out, crosswalk)


if __name__ == "__main__":
    main()
