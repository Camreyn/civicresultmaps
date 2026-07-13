import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT = "public/data/national-counties.geojson";
const DEFAULT_PRECISION = 4;
const DEFAULT_TOLERANCE = 0.02;

const stateFipsByPostal = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DC: "11",
  DE: "10", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19",
  KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27",
  MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35",
  NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53",
  WV: "54", WI: "55", WY: "56",
};

function parseArguments(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    precision: DEFAULT_PRECISION,
    tolerance: DEFAULT_TOLERANCE,
  };

  for (const argument of argv) {
    if (argument.startsWith("--output=")) {
      options.output = argument.slice("--output=".length);
    } else if (argument.startsWith("--precision=")) {
      options.precision = Number(argument.slice("--precision=".length));
    } else if (argument.startsWith("--tolerance=")) {
      options.tolerance = Number(argument.slice("--tolerance=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 7) {
    throw new Error("--precision must be an integer from 0 through 7.");
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance <= 0 || options.tolerance > 1) {
    throw new Error("--tolerance must be greater than 0 and no more than 1 degree.");
  }

  return options;
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }

  const amount = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = start[0] + amount * dx;
  const projectedY = start[1] + amount * dy;
  return (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
}

function simplifyLine(points, squaredTolerance) {
  if (points.length <= 2) {
    return points;
  }

  let maximumDistance = squaredTolerance;
  let maximumIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], start, end);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      maximumIndex = index;
    }
  }

  if (maximumIndex < 0) {
    return [start, end];
  }

  const left = simplifyLine(points.slice(0, maximumIndex + 1), squaredTolerance);
  const right = simplifyLine(points.slice(maximumIndex), squaredTolerance);
  return [...left.slice(0, -1), ...right];
}

function samePoint(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function quantizeCoordinate(coordinate, precision) {
  const factor = 10 ** precision;
  return [
    Math.round(Number(coordinate[0]) * factor) / factor,
    Math.round(Number(coordinate[1]) * factor) / factor,
  ];
}

function simplifyRing(ring, tolerance, precision) {
  const quantized = ring
    .map((coordinate) => quantizeCoordinate(coordinate, precision))
    .filter((coordinate, index, rows) => index === 0 || !samePoint(coordinate, rows[index - 1]));
  if (quantized.length > 1 && samePoint(quantized[0], quantized[quantized.length - 1])) {
    quantized.pop();
  }
  if (quantized.length < 4) {
    return [...quantized, quantized[0]].filter(Boolean);
  }

  let anchorIndex = 0;
  for (let index = 1; index < quantized.length; index += 1) {
    if (
      quantized[index][0] < quantized[anchorIndex][0]
      || (quantized[index][0] === quantized[anchorIndex][0] && quantized[index][1] < quantized[anchorIndex][1])
    ) {
      anchorIndex = index;
    }
  }

  const rotated = [...quantized.slice(anchorIndex), ...quantized.slice(0, anchorIndex)];
  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < rotated.length; index += 1) {
    const distance = (rotated[index][0] - rotated[0][0]) ** 2 + (rotated[index][1] - rotated[0][1]) ** 2;
    if (distance > splitDistance) {
      splitDistance = distance;
      splitIndex = index;
    }
  }

  const squaredTolerance = tolerance ** 2;
  const firstArc = simplifyLine(rotated.slice(0, splitIndex + 1), squaredTolerance);
  const secondArc = simplifyLine([...rotated.slice(splitIndex), rotated[0]], squaredTolerance);
  const simplified = [...firstArc, ...secondArc.slice(1, -1)];
  const usable = new Set(simplified.map((coordinate) => coordinate.join(","))).size >= 3
    ? simplified
    : rotated;
  return [...usable, usable[0]];
}

function simplifyPolygon(polygon, tolerance, precision) {
  return polygon
    .map((ring) => simplifyRing(ring, tolerance, precision))
    .filter((ring) => ring.length >= 4);
}

function simplifyGeometry(geometry, tolerance, precision) {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: simplifyPolygon(geometry.coordinates, tolerance, precision),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates
        .map((polygon) => simplifyPolygon(polygon, tolerance, precision))
        .filter((polygon) => polygon.length > 0),
    };
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function countCoordinates(value) {
  if (!Array.isArray(value)) {
    return 0;
  }
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return 1;
  }
  return value.reduce((total, child) => total + countCoordinates(child), 0);
}

function featureGeoid(state, properties) {
  const direct = String(properties.GEOID || "").trim();
  if (direct) {
    return direct.padStart(5, "0");
  }
  const county = String(properties.COUNTY || properties.county_fips55_code || properties.county_code || "").trim();
  return county && stateFipsByPostal[state]
    ? `${stateFipsByPostal[state]}${county.padStart(3, "0")}`
    : "";
}

export async function buildNationalCountyGeometry({
  cwd = process.cwd(),
  output = DEFAULT_OUTPUT,
  precision = DEFAULT_PRECISION,
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  const registryPath = path.join(cwd, "data", "canonical-jurisdictions.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const canonicalRows = registry.jurisdictions ?? [];
  const canonicalByGeoid = new Map(canonicalRows.map((row) => [row.geoid, row]));
  if (canonicalRows.length !== 3144 || canonicalByGeoid.size !== canonicalRows.length) {
    throw new Error(`Expected 3,144 unique canonical county equivalents; found ${canonicalRows.length}.`);
  }

  const features = [];
  let inputCoordinates = 0;
  let outputCoordinates = 0;

  for (const state of Object.keys(stateFipsByPostal).sort()) {
    const file = `${state.toLowerCase()}-counties.geojson`;
    const sourcePath = path.join(cwd, "data", file);
    const source = JSON.parse(await readFile(sourcePath, "utf8"));
    if (source.type !== "FeatureCollection") {
      throw new Error(`${file} is ${source.type || "missing a type"}; expected FeatureCollection.`);
    }

    for (const feature of source.features ?? []) {
      const geoid = featureGeoid(state, feature.properties ?? {});
      const canonical = canonicalByGeoid.get(geoid);
      if (!canonical) {
        throw new Error(`${file} contains a feature without a canonical GEOID match: ${geoid || "missing GEOID"}.`);
      }
      if (!feature.geometry) {
        throw new Error(`${file} / ${geoid} has no geometry.`);
      }

      inputCoordinates += countCoordinates(feature.geometry.coordinates);
      const geometry = simplifyGeometry(feature.geometry, tolerance, precision);
      outputCoordinates += countCoordinates(geometry.coordinates);
      features.push({
        type: "Feature",
        properties: {
          GEOID: geoid,
          STATE: canonical.state,
          NAME: canonical.displayName,
        },
        geometry,
      });
    }
  }

  features.sort((left, right) => left.properties.GEOID.localeCompare(right.properties.GEOID));
  const geoids = new Set(features.map((feature) => feature.properties.GEOID));
  const missing = canonicalRows.filter((row) => !geoids.has(row.geoid));
  if (features.length !== canonicalRows.length || geoids.size !== features.length || missing.length > 0) {
    throw new Error(
      `National geometry integrity failure: ${features.length} features, ${geoids.size} unique GEOIDs, ${missing.length} missing registry rows.`,
    );
  }

  const collection = {
    type: "FeatureCollection",
    name: "Civic Result Maps national county and county-equivalent geometry",
    metadata: {
      featureCount: features.length,
      source: "Committed data/<state>-counties.geojson files derived from official/Census geometry",
      registry: "data/canonical-jurisdictions.json",
      registryGeneratedAt: registry.generatedAt,
      simplificationToleranceDegrees: tolerance,
      coordinatePrecision: precision,
      includesAlaskaCountyEquivalents: features.filter((feature) => feature.properties.STATE === "AK").length,
    },
    features,
  };

  const serialized = `${JSON.stringify(collection)}\n`;
  const outputPath = path.resolve(cwd, output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");

  return {
    featureCount: features.length,
    alaskaFeatureCount: collection.metadata.includesAlaskaCountyEquivalents,
    inputCoordinates,
    outputCoordinates,
    reductionPct: Number((100 * (1 - outputCoordinates / inputCoordinates)).toFixed(2)),
    bytes: Buffer.byteLength(serialized),
    outputPath,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const options = parseArguments(process.argv.slice(2));
  buildNationalCountyGeometry(options)
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
