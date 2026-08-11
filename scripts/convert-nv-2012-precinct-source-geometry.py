"""Deterministically convert the reviewed Nevada 2012 source geometry.

This preprocessing step needs Fiona, Shapely, and pyproj because Clark County
publishes its historical precincts in an Esri File Geodatabase. Washoe proxy
review stays in the fail-closed collector and is not silently converted here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path

import fiona
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform


EXPECTED = {
    "clark": (8_604_501, "97cd8af08bd142263a5c956c1b818be42f5703d51e71fa87ed32fe24ae06bd2e"),
}


def verify(path: Path, label: str) -> None:
    expected_size, expected_sha = EXPECTED[label]
    payload = path.read_bytes()
    actual = (len(payload), hashlib.sha256(payload).hexdigest())
    if actual != (expected_size, expected_sha):
        raise RuntimeError(f"{label} source drifted: {actual}")


def round_coordinates(value, digits: int = 7):
    if isinstance(value, (list, tuple)):
        return [round_coordinates(item, digits) for item in value]
    if isinstance(value, float):
        rounded = round(value, digits)
        return 0 if rounded == 0 else rounded
    return value


def feature(properties: dict, geometry) -> dict:
    output = mapping(geometry)
    output["coordinates"] = round_coordinates(output["coordinates"])
    return {"type": "Feature", "properties": properties, "geometry": output}


def write_geojson(path: Path, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = {"type": "FeatureCollection", "features": features}
    path.write_bytes((json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode())


def convert_clark(archive: Path) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="crm-nv-clark-") as temp:
        with zipfile.ZipFile(archive) as handle:
            handle.extractall(temp)
        databases = list(Path(temp).rglob("*.gdb"))
        if len(databases) != 1:
            raise RuntimeError(f"Expected one File Geodatabase; found {databases}")
        with fiona.open(databases[0], layer="prec2012_p") as source:
            if source.crs.to_epsg() != 3421 or len(source) != 1_154:
                raise RuntimeError("Clark prec2012_p schema or feature count drifted")
            transformer = Transformer.from_crs(source.crs, "EPSG:4326", always_xy=True)
            rows = []
            for row in source:
                precinct = str(int(row["properties"]["PREC"]))
                geometry = transform(transformer.transform, shape(row["geometry"]))
                if geometry.is_empty or not geometry.is_valid:
                    raise RuntimeError(f"Clark precinct {precinct} has invalid converted geometry")
                rows.append(feature({"PREC": precinct}, geometry))
    rows.sort(key=lambda row: int(row["properties"]["PREC"]))
    if len({row["properties"]["PREC"] for row in rows}) != 1_154:
        raise RuntimeError("Clark prec2012_p contains duplicate PREC identities")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clark-archive", required=True, type=Path)
    parser.add_argument("--clark-output", required=True, type=Path)
    args = parser.parse_args()

    verify(args.clark_archive, "clark")
    write_geojson(args.clark_output, convert_clark(args.clark_archive))

    summary = {
        "clarkOutput": str(args.clark_output),
        "clarkFeatures": 1_154,
    }
    print(json.dumps(summary, separators=(",", ":")))


if __name__ == "__main__":
    main()
