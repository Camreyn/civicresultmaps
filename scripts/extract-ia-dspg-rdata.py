"""Extract the reviewed Iowa precinct supplements published by DSPG-ISU.

This is a source-acquisition helper, not the production normalizer. It requires
the third-party ``rdata`` and ``numpy`` packages and converts the two small R
data objects used by the Iowa precinct pipeline into stable JSON inputs:

* ``ia_precincts.rda`` -> the 2014 SOS geometry-to-2016 result-name review table
  or its geometry-bearing GeoJSON form
* ``ia_election_2020.rda`` -> the Iowa subset of the MIT-licensed NYT map

The production collector pins and replays the extracted bytes. Keeping this
conversion explicit avoids treating a hand-edited JSON file as source data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import rdata


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and np.isnan(value):
        return None
    return value


def coordinates(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return coordinates(value.tolist())
    if isinstance(value, (list, tuple)):
        return [coordinates(item) for item in value]
    return scalar(value)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False)
    path.write_text(f"{payload}\n", encoding="utf-8", newline="\n")


def extract_2014_crosswalk(source: Path, output: Path) -> None:
    frame = rdata.read_rda(source)["ia_precincts"]
    expected = {
        "COUNTY",
        "DISTRICT",
        "precinct",
        "NAME",
        "POPULATION",
        "Votes16",
        "PctRep16",
        "PctDem16",
        "PctLib16",
        "PctOther16",
        "House_Dist",
        "Senate_Dis",
        "Congressio",
        "AREA",
        "Shape_Leng",
        "geometry",
    }
    if set(map(str, frame.columns)) != expected or len(frame) != 1690:
        raise ValueError("Unexpected ia_precincts.rda schema or row count")

    rows = []
    for _, row in frame.iterrows():
        rows.append(
            {
                "county": str(row["COUNTY"]),
                "district": str(row["DISTRICT"]),
                "reviewed2016ResultLabel": str(row["precinct"]),
                "geometryName": str(row["NAME"]),
                "population": scalar(row["POPULATION"]),
                "presidentBallots2016": scalar(row["Votes16"]),
                "percentRepublican2016": scalar(row["PctRep16"]),
                "percentDemocratic2016": scalar(row["PctDem16"]),
                "percentLibertarian2016": scalar(row["PctLib16"]),
                "percentOther2016": scalar(row["PctOther16"]),
            }
        )
    rows.sort(key=lambda row: (row["county"], row["district"], row["geometryName"]))
    write_json(
        output,
        {
            "schemaVersion": 1,
            "sourceObject": "ia_precincts",
            "sourceSha256": sha256(source),
            "sourceRowCount": len(rows),
            "role": "Secondary reviewed conversion between Iowa SOS 2014 geometry labels and 2016 official result labels; official vote totals are not taken from this artifact.",
            "rows": rows,
        },
    )


def extract_2014_geojson(source: Path, output: Path) -> None:
    frame = rdata.read_rda(source)["ia_precincts"]
    expected = {
        "COUNTY",
        "DISTRICT",
        "precinct",
        "NAME",
        "POPULATION",
        "Votes16",
        "PctRep16",
        "PctDem16",
        "PctLib16",
        "PctOther16",
        "House_Dist",
        "Senate_Dis",
        "Congressio",
        "AREA",
        "Shape_Leng",
        "geometry",
    }
    if set(map(str, frame.columns)) != expected or len(frame) != 1690:
        raise ValueError("Unexpected ia_precincts.rda schema or row count")

    features = []
    for _, row in frame.iterrows():
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "COUNTY": str(row["COUNTY"]),
                    "DISTRICT": str(row["DISTRICT"]),
                    "REVIEWED_2016_RESULT_LABEL": str(row["precinct"]),
                    "NAME": str(row["NAME"]),
                },
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": coordinates(row["geometry"]),
                },
            }
        )
    features.sort(
        key=lambda feature: (
            feature["properties"]["COUNTY"],
            feature["properties"]["DISTRICT"],
            feature["properties"]["NAME"],
        )
    )
    write_json(
        output,
        {
            "type": "FeatureCollection",
            "metadata": {
                "schemaVersion": 1,
                "sourceObject": "ia_precincts",
                "sourceSha256": sha256(source),
                "sourceFeatureCount": len(features),
                "role": "Secondary reviewed Iowa SOS 2014 geometry used only to reproduce historical identity relationships; public geometry is sourced from retained government artifacts.",
            },
            "features": features,
        },
    )


def extract_2020_geojson(source: Path, output: Path) -> None:
    frame = rdata.read_rda(source)["ia_election_2020"]
    expected = {
        "GEOID",
        "votes_total",
        "votes_dem",
        "votes_rep",
        "pct_dem_lead",
        "votes_per_sqkm",
        "geometry",
    }
    if set(map(str, frame.columns)) != expected or len(frame) != 1597:
        raise ValueError("Unexpected ia_election_2020.rda schema or row count")

    features = []
    for _, row in frame.iterrows():
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "GEOID": str(row["GEOID"]),
                    "votes_total": int(row["votes_total"]),
                    "votes_dem": int(row["votes_dem"]),
                    "votes_rep": int(row["votes_rep"]),
                    "pct_dem_lead": scalar(row["pct_dem_lead"]),
                    "votes_per_sqkm": scalar(row["votes_per_sqkm"]),
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": coordinates(row["geometry"]),
                },
            }
        )
    features.sort(key=lambda feature: feature["properties"]["GEOID"])
    write_json(
        output,
        {
            "type": "FeatureCollection",
            "metadata": {
                "schemaVersion": 1,
                "sourceObject": "ia_election_2020",
                "sourceSha256": sha256(source),
                "sourceFeatureCount": len(features),
                "role": "Secondary Iowa subset of the MIT-licensed NYT 2020 precinct map; candidate totals are used only to reconcile joins to official Iowa SOS results.",
            },
            "features": features,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--kind",
        choices=("2014-crosswalk", "2014-geojson", "2020-geojson"),
        required=True,
    )
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--expected-source-sha256", required=True)
    args = parser.parse_args()

    actual = sha256(args.source)
    if actual.lower() != args.expected_source_sha256.lower():
        raise ValueError(f"Source SHA-256 mismatch: expected {args.expected_source_sha256}, found {actual}")
    if args.out.exists():
        raise FileExistsError(f"Refusing to replace existing extraction: {args.out}")

    if args.kind == "2014-crosswalk":
        extract_2014_crosswalk(args.source, args.out)
    elif args.kind == "2014-geojson":
        extract_2014_geojson(args.source, args.out)
    else:
        extract_2020_geojson(args.source, args.out)


if __name__ == "__main__":
    main()
