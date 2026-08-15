import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";

const ROOT = process.cwd();
const STATE_FIPS = "26";
export const MICHIGAN_PRECINCT_YEAR_SPECS = Object.freeze({
  2012: {
    electionId: "2012-11-06-general",
    geometry:
      "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/2012-precinct-candidate-wgs84.geojson.gz",
    results:
      "data/precinct-geometry/MI/2012-11-06-general/raw/mi-sos-mvic/2012GEN.zip",
    geometryId: "VP",
    county: "CountyFips",
    municipality: "JurisdictionFips",
    ward: "Ward",
    precinct: "Precinct",
    geometryName: null,
  },
  2016: {
    electionId: "2016-11-08-general",
    geometry:
      "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/2016-voting-precincts-wgs84.geojson.gz",
    results:
      "data/precinct-geometry/MI/2016-11-08-general/raw/mi-sos-mvic/2016GEN.zip",
    geometryId: "VTD2016",
    county: "CountyFips",
    municipality: "Jurisdicti",
    ward: null,
    precinct: null,
    geometryName: "Label",
  },
  2020: {
    electionId: "2020-11-03-general",
    geometry:
      "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/2020-voting-precincts-wgs84.geojson.gz",
    results:
      "data/precinct-geometry/MI/2020-11-03-general/raw/mi-sos-mvic/2020GEN.zip",
    geometryId: "PRECINCTID",
    county: "COUNTYFIPS",
    municipality: "MCDFIPS",
    ward: "WARD",
    precinct: "PRECINCT",
    geometryName: null,
  },
  2024: {
    electionId: "2024-11-05-general",
    geometry:
      "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/2024-voting-precincts-wgs84.geojson.gz",
    results:
      "data/precinct-geometry/MI/2024-11-05-general/raw/mi-sos-mvic/2024GEN.zip",
    geometryId: "PRECINCTID",
    county: "COUNTYFIPS",
    municipality: "MCDFIPS",
    ward: "WARD",
    precinct: "PRECINCT",
    geometryName: "Precinct_Long_Name",
    resultMunicipalityOverrides: Object.freeze({
      "WASHTENAW|938": "50660",
    }),
  },
});

const readJson = (relativePath) =>
  JSON.parse(readFileSync(`${ROOT}/${relativePath}`, "utf8"));

function normalizeWords(value) {
  let normalized = String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases = new Map([
    ["GD TRAVERSE", "GRAND TRAVERSE"],
    ["GUNPLAIN", "GUN PLAIN"],
    ["GROSS POINTE SHORES", "GROSSE POINTE SHORES"],
    ["COLD SPRINGS", "COLDSPRINGS"],
    ["L ANSE", "LANSE"],
    ["DE WITT", "DEWITT"],
    ["LA GRANGE", "LAGRANGE"],
    ["PLEASANTVIEW", "PLEASANT VIEW"],
  ]);
  normalized = aliases.get(normalized) ?? normalized;
  return normalized.replace(/^MT /, "MOUNT ").replace(/^ST /, "SAINT ");
}

function municipalityIdentity(value) {
  const normalized = normalizeWords(value);
  const patterns = [
    [/^CITY OF THE VILLAGE OF (.+)$/, "CITY"],
    [/^CITY OF (.+)$/, "CITY"],
    [/^VILLAGE OF (.+) CITY$/, "CITY"],
    [/^(.+) CITY$/, "CITY"],
    [/^CHARTER TOWNSHIP OF (.+)$/, "TOWNSHIP"],
    [/^TOWNSHIP OF (.+)$/, "TOWNSHIP"],
    [/^(.+) CHARTER TWP$/, "TOWNSHIP"],
    [/^(.+) CHARTER TOWNSHIP$/, "TOWNSHIP"],
    [/^(.+) TOWNSHIP$/, "TOWNSHIP"],
    [/^(.+) TWP$/, "TOWNSHIP"],
  ];
  for (const [pattern, type] of patterns) {
    const match = normalized.match(pattern);
    if (match) return { type, name: normalizeWords(match[1]) };
  }
  return { type: "OTHER", name: normalized };
}

function numericToken(value, width) {
  const normalized = String(value ?? "").trim().toUpperCase();
  const match = normalized.match(/^(\d+)([A-Z]*)$/);
  if (!match) return normalized;
  return `${String(Number(match[1])).padStart(width, "0")}${match[2]}`;
}

function geometryParts(properties, spec) {
  const sourceId = String(properties[spec.geometryId] ?? "").trim();
  const countyFips = String(properties[spec.county] ?? "").padStart(3, "0");
  const municipalityFips = String(properties[spec.municipality] ?? "").padStart(
    5,
    "0",
  );
  const dashed = sourceId.match(/^WP-(\d{3})-(\d{5})-(\d{2})(.+)$/);
  const compact = sourceId.replace(/^P/, "");
  const ward = dashed
    ? numericToken(dashed[3], 2)
    : numericToken(compact.slice(8, 10), 2);
  const precinct = dashed
    ? numericToken(dashed[4], 3)
    : numericToken(compact.slice(10), 3);
  return {
    sourceId,
    parentGeoid: `${STATE_FIPS}${countyFips}`,
    countyFips,
    municipalityFips,
    ward,
    precinct,
  };
}

function censusMunicipalityCatalog() {
  const subdivisions = readJson(
    "data/precinct-geometry/MI/raw/census-2020-geographic-codes/county-subdivisions.json",
  );
  const places = readJson(
    "data/precinct-geometry/MI/raw/census-2020-geographic-codes/incorporated-places.json",
  );
  const rows = [...(subdivisions.features ?? []), ...(places.features ?? [])];
  const aliasesByCode = new Map();
  for (const feature of rows) {
    const attributes = feature.attributes ?? feature.properties ?? {};
    const countyFips = String(attributes.COUNTY ?? "").padStart(3, "0");
    const code = String(attributes.COUSUB ?? attributes.PLACE ?? "").padStart(
      5,
      "0",
    );
    if (!/^\d{3}$/.test(countyFips) || !/^\d{5}$/.test(code)) continue;
    const key = `${STATE_FIPS}${countyFips}|${code}`;
    const aliases = aliasesByCode.get(key) ?? [];
    for (const value of [attributes.NAME, attributes.BASENAME]) {
      const identity = municipalityIdentity(value);
      if (identity.name) aliases.push(identity);
    }
    aliasesByCode.set(key, aliases);
  }
  return aliasesByCode;
}

function addAlias(index, key, municipalityFips) {
  if (!key || key.endsWith("|OTHER|")) return;
  const current = index.get(key) ?? new Set();
  current.add(municipalityFips);
  index.set(key, current);
}

function geometryMunicipalityIndexes(features, spec) {
  const censusAliases = censusMunicipalityCatalog();
  const byParentName = new Map();
  const byStateName = new Map();
  for (const feature of features) {
    const parts = geometryParts(feature.properties ?? {}, spec);
    const aliases = [...(censusAliases.get(
      `${parts.parentGeoid}|${parts.municipalityFips}`,
    ) ?? [])];
    if (spec.geometryName && aliases.length === 0) {
      const raw = String(feature.properties?.[spec.geometryName] ?? "");
      const name = raw.split(",")[0];
      if (name) aliases.push(municipalityIdentity(name));
    }
    for (const alias of aliases) {
      addAlias(
        byParentName,
        `${parts.parentGeoid}|${alias.type}|${alias.name}`,
        parts.municipalityFips,
      );
      addAlias(
        byStateName,
        `${alias.type}|${alias.name}`,
        parts.municipalityFips,
      );
    }
  }
  return { byParentName, byStateName };
}

function mergeGeometries(features) {
  const polygons = [];
  for (const feature of features) {
    if (feature.geometry?.type === "Polygon") {
      if (feature.geometry.coordinates?.length) {
        polygons.push(feature.geometry.coordinates);
      }
    } else if (feature.geometry?.type === "MultiPolygon") {
      polygons.push(
        ...feature.geometry.coordinates.filter((polygon) => polygon?.length),
      );
    } else {
      throw new Error(`Unsupported Michigan geometry ${feature.geometry?.type}.`);
    }
  }
  if (polygons.length === 0) {
    throw new Error("Michigan geometry identity contains no polygon rings.");
  }
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function buildGeometryIndex(document, spec) {
  const rawBySourceId = new Map();
  for (const feature of document.features ?? []) {
    const parts = geometryParts(feature.properties ?? {}, spec);
    if (!parts.sourceId || !/^26\d{3}$/.test(parts.parentGeoid)) {
      throw new Error(`Invalid Michigan geometry identity ${parts.sourceId}.`);
    }
    const current = rawBySourceId.get(parts.sourceId) ?? [];
    current.push(feature);
    rawBySourceId.set(parts.sourceId, current);
  }
  const geometryUnits = [...rawBySourceId]
    .map(([sourceId, features]) => {
      const parts = geometryParts(features[0].properties ?? {}, spec);
      return {
        ...parts,
        sourceIds: features.map((feature) =>
          String(feature.properties?.[spec.geometryId]),
        ),
        rawFeatureCount: features.length,
        geometry: mergeGeometries(features),
        sourceProperties: features.map((feature) => feature.properties ?? {}),
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const byExactKey = new Map();
  const byMunicipalityPrecinct = new Map();
  for (const unit of geometryUnits) {
    const key = [
      unit.parentGeoid,
      unit.municipalityFips,
      unit.ward,
      unit.precinct,
    ].join("|");
    const current = byExactKey.get(key) ?? [];
    current.push(unit);
    byExactKey.set(key, current);
    const fallbackKey = [
      unit.parentGeoid,
      unit.municipalityFips,
      unit.precinct,
    ].join("|");
    const fallback = byMunicipalityPrecinct.get(fallbackKey) ?? [];
    fallback.push(unit);
    byMunicipalityPrecinct.set(fallbackKey, fallback);
  }
  return { geometryUnits, byExactKey, byMunicipalityPrecinct };
}

async function readZipTable(zip, member) {
  const file = zip.file(member);
  if (!file) throw new Error(`Michigan result ZIP is missing ${member}.`);
  return (await file.async("string"))
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split("\t"));
}

async function parseResults(year, spec) {
  const zip = await JSZip.loadAsync(readFileSync(`${ROOT}/${spec.results}`));
  const prefix = year === 2024 ? "2024GEN/" : "";
  const [countyRows, cityRows, candidateRows, voteRows] = await Promise.all([
    readZipTable(zip, `${prefix}county.txt`),
    readZipTable(zip, `${prefix}${year}city.txt`),
    readZipTable(zip, `${prefix}${year}name.txt`),
    readZipTable(zip, `${prefix}${year}vote.txt`),
  ]);
  const countyNames = new Map(countyRows.map((row) => [row[0], row[1]]));
  const municipalityNames = new Map(
    cityRows.map((row) => [`${row[2]}|${row[3]}`, row[4]]),
  );
  const candidates = new Map(
    candidateRows
      .filter((row) => row[2] === "1")
      .map((row) => [
        row[5],
        {
          id: row[5],
          lastName: row[6].trim(),
          firstName: row[7].trim(),
          middleName: row[8].trim(),
          partyCode: row[9].trim(),
        },
      ]),
  );
  const sourceUnits = new Map();
  for (const row of voteRows) {
    if (row[2] !== "1") continue;
    const [countyCode, municipalityCode, ward, precinct, label] = row.slice(
      6,
      11,
    );
    const key = [countyCode, municipalityCode, ward, precinct, label].join("|");
    const countyName = countyNames.get(countyCode);
    const municipalityName = municipalityNames.get(
      `${countyCode}|${municipalityCode}`,
    );
    if (!countyName || !municipalityName) {
      throw new Error(`Missing Michigan result labels for ${key}.`);
    }
    const current = sourceUnits.get(key) ?? {
      key,
      countyCode,
      countyName,
      municipalityCode,
      municipalityName,
      ward: numericToken(ward, 2),
      precinct: numericToken(precinct, 3),
      label: String(label ?? "").trim().toUpperCase(),
      candidateVotes: new Map(),
      totalVotes: 0,
    };
    const votes = Number(row[11]);
    if (!Number.isSafeInteger(votes)) {
      throw new Error(`Invalid Michigan vote value ${row[11]} for ${key}.`);
    }
    current.candidateVotes.set(
      row[5],
      (current.candidateVotes.get(row[5]) ?? 0) + votes,
    );
    current.totalVotes += votes;
    sourceUnits.set(key, current);
  }
  return { candidates, sourceUnits: [...sourceUnits.values()] };
}

function countyGeoidsByName() {
  const counties = readJson("data/mi-counties.geojson");
  return new Map(
    (counties.features ?? []).map((feature) => [
      normalizeWords(feature.properties?.BASENAME),
      String(feature.properties?.GEOID),
    ]),
  );
}

function isNonGeographic(unit) {
  return (
    unit.municipalityCode === "9999"
    || Number(unit.precinct.replace(/\D/g, "")) >= 900
    || unit.label === "AVCB"
  );
}

function resolveResultUnit(
  unit,
  spec,
  geometry,
  municipalityIndexes,
  parentGeoids,
) {
  const sourceParentGeoid = parentGeoids.get(normalizeWords(unit.countyName));
  const identity = municipalityIdentity(unit.municipalityName);
  let parentMcds = municipalityIndexes.byParentName.get(
    `${sourceParentGeoid}|${identity.type}|${identity.name}`,
  ) ?? new Set();
  const explicitMunicipalityFips = spec.resultMunicipalityOverrides?.[
    `${normalizeWords(unit.countyName)}|${unit.municipalityCode}`
  ];
  if (explicitMunicipalityFips) {
    parentMcds = new Set([explicitMunicipalityFips]);
  }
  const statewideMcds = municipalityIndexes.byStateName.get(
    `${identity.type}|${identity.name}`,
  ) ?? new Set();
  const label = unit.label && unit.label !== "AVCB" ? unit.label : "";
  const precinctTokens = [
    `${unit.precinct}${label}`,
    ...(label && Number(unit.precinct.replace(/\D/g, "")) === 0
      ? [numericToken(label, 3)]
      : []),
    ...(label ? [unit.precinct] : []),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const findCandidates = (municipalityFipsValues, statewide) => {
    for (const precinct of precinctTokens) {
      const exactKeys = [];
      for (const municipalityFips of municipalityFipsValues) {
        exactKeys.push(
          [sourceParentGeoid, municipalityFips, unit.ward, precinct].join("|"),
        );
        if (statewide) {
          for (const key of geometry.byExactKey.keys()) {
            const [, keyMcd, keyWard, keyPrecinct] = key.split("|");
            if (
              keyMcd === municipalityFips
              && keyWard === unit.ward
              && keyPrecinct === precinct
            ) {
              exactKeys.push(key);
            }
          }
        }
      }
      const exactCandidates = [
        ...new Set(exactKeys.flatMap((key) => geometry.byExactKey.get(key) ?? [])),
      ];
      if (exactCandidates.length) {
        return {
          candidates: exactCandidates,
          matchKind: statewide ? "statewide_exact_composite" : "parent_exact_composite",
          precinctToken: precinct,
        };
      }
    }

    for (const precinct of precinctTokens) {
      const fallbackKeys = [];
      for (const municipalityFips of municipalityFipsValues) {
        fallbackKeys.push(
          [sourceParentGeoid, municipalityFips, precinct].join("|"),
        );
        if (statewide) {
          for (const key of geometry.byMunicipalityPrecinct.keys()) {
            const [, keyMcd, keyPrecinct] = key.split("|");
            if (keyMcd === municipalityFips && keyPrecinct === precinct) {
              fallbackKeys.push(key);
            }
          }
        }
      }
      const fallbackCandidates = [
        ...new Set(
        fallbackKeys.flatMap(
          (key) => geometry.byMunicipalityPrecinct.get(key) ?? [],
        ),
        ),
      ];
      if (fallbackCandidates.length) {
        return {
          candidates: fallbackCandidates,
          matchKind: statewide
            ? "statewide_unique_municipality_precinct"
            : "parent_unique_municipality_precinct",
          precinctToken: precinct,
        };
      }
    }
    return { candidates: [], matchKind: null, precinctToken: null };
  };

  let municipalityCandidates = [...parentMcds].sort();
  let match = findCandidates(municipalityCandidates, false);
  if (match.candidates.length === 0) {
    municipalityCandidates = [...statewideMcds].sort();
    match = findCandidates(municipalityCandidates, true);
  }
  return {
    sourceParentGeoid,
    identity,
    municipalityCandidates,
    geometryCandidates: match.candidates,
    matchKind: match.matchKind,
    precinctToken: match.precinctToken,
    explicitMunicipalityFips: explicitMunicipalityFips ?? null,
  };
}

function addVotes(target, source) {
  for (const [candidateId, votes] of source.candidateVotes) {
    target.set(candidateId, (target.get(candidateId) ?? 0) + votes);
  }
}

export async function buildMichiganPrecinctJoinModel(year) {
  const spec = MICHIGAN_PRECINCT_YEAR_SPECS[year];
  const rawGeometry = JSON.parse(
    gunzipSync(readFileSync(`${ROOT}/${spec.geometry}`)).toString("utf8"),
  );
  const geometry = buildGeometryIndex(rawGeometry, spec);
  const municipalityIndexes = geometryMunicipalityIndexes(
    rawGeometry.features,
    spec,
  );
  const results = await parseResults(year, spec);
  const parentGeoids = countyGeoidsByName();
  const assigned = new Map();
  const nonGeographic = [];
  const unmatched = [];
  const ambiguous = [];
  for (const unit of results.sourceUnits) {
    if (isNonGeographic(unit)) {
      nonGeographic.push(unit);
      continue;
    }
    const resolution = resolveResultUnit(
      unit,
      spec,
      geometry,
      municipalityIndexes,
      parentGeoids,
    );
    if (resolution.geometryCandidates.length !== 1) {
      const detail = {
        sourceUnit: unit,
        identity: resolution.identity,
        municipalityCandidates: resolution.municipalityCandidates,
        candidateGeometryIds: resolution.geometryCandidates.map(
          (candidate) => candidate.sourceId,
        ),
      };
      (resolution.geometryCandidates.length ? ambiguous : unmatched).push(detail);
      continue;
    }
    const [geometryUnit] = resolution.geometryCandidates;
    const current = assigned.get(geometryUnit.sourceId) ?? {
      geometryUnit,
      sourceUnits: [],
      resolutions: [],
      candidateVotes: new Map(),
      totalVotes: 0,
    };
    current.sourceUnits.push(unit);
    current.resolutions.push(resolution);
    addVotes(current.candidateVotes, unit);
    current.totalVotes += unit.totalVotes;
    assigned.set(geometryUnit.sourceId, current);
  }
  const rawTotals = results.sourceUnits.reduce(
    (sum, unit) => sum + unit.totalVotes,
    0,
  );
  const nonGeographicTotals = nonGeographic.reduce(
    (sum, unit) => sum + unit.totalVotes,
    0,
  );
  const matchedTotals = [...assigned.values()].reduce(
    (sum, unit) => sum + unit.totalVotes,
    0,
  );
  const unmatchedTotals = [...unmatched, ...ambiguous].reduce(
    (sum, detail) => sum + detail.sourceUnit.totalVotes,
    0,
  );
  const unlinkedGeometry = geometry.geometryUnits.filter(
    (unit) => !assigned.has(unit.sourceId),
  );
  const matchMethodCounts = {};
  for (const assignment of assigned.values()) {
    for (const resolution of assignment.resolutions) {
      const key = resolution.matchKind ?? "unknown";
      matchMethodCounts[key] = (matchMethodCounts[key] ?? 0) + 1;
    }
  }
  const summary = {
    year,
    electionId: spec.electionId,
    rawGeometryFeatures: rawGeometry.features.length,
    geometryUnits: geometry.geometryUnits.length,
    duplicateGeometryParts:
      rawGeometry.features.length - geometry.geometryUnits.length,
    officialResultUnits: results.sourceUnits.length,
    officialResultVotes: rawTotals,
    nonGeographicResultUnits: nonGeographic.length,
    nonGeographicVotes: nonGeographicTotals,
    matchedSourceResultUnits: [...assigned.values()].reduce(
      (sum, unit) => sum + unit.sourceUnits.length,
      0,
    ),
    matchedGeometryUnits: assigned.size,
    matchedVotes: matchedTotals,
    unmatchedResultUnits: unmatched.length,
    ambiguousResultUnits: ambiguous.length,
    unmatchedVotes: unmatchedTotals,
    unlinkedGeometryUnits: unlinkedGeometry.length,
    aggregatedGeometryUnits: [...assigned.values()].filter(
      (unit) => unit.sourceUnits.length > 1,
    ).length,
    matchMethodCounts,
    unmatched: unmatched.slice(0, 100),
    ambiguous: ambiguous.slice(0, 100),
    unlinkedGeometry: unlinkedGeometry.slice(0, 100).map((unit) => ({
      sourceId: unit.sourceId,
      parentGeoid: unit.parentGeoid,
      municipalityFips: unit.municipalityFips,
      ward: unit.ward,
      precinct: unit.precinct,
    })),
  };
  return {
    year,
    spec,
    rawGeometry,
    geometry,
    results,
    parentGeoids,
    assigned,
    nonGeographic,
    unmatched,
    ambiguous,
    unlinkedGeometry,
    summary,
  };
}

export async function auditMichiganOfficialPrecinctJoins(years) {
  const selectedYears = years?.length ? years : [2012, 2016, 2020, 2024];
  for (const year of selectedYears) {
    if (!MICHIGAN_PRECINCT_YEAR_SPECS[year]) {
      throw new Error(`Unsupported Michigan year ${year}.`);
    }
  }
  const audits = [];
  for (const year of selectedYears) {
    audits.push((await buildMichiganPrecinctJoinModel(year)).summary);
  }
  return { schemaVersion: 1, audits };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const years = process.argv
    .filter((value) => value.startsWith("--year="))
    .flatMap((value) => value.slice(7).split(","))
    .map(Number);
  process.stdout.write(
    `${JSON.stringify(await auditMichiganOfficialPrecinctJoins(years), null, 2)}\n`,
  );
}
