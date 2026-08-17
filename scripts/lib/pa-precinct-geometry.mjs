import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import shp from "shpjs";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import { parseCsv } from "../normalize-eac-turnout.mjs";

export const PENNSYLVANIA_REVIEWED_AT = "2026-08-16T18:00:00.000Z";

const OFFICIAL_INDEX_URL =
  "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data";
const LRC_GEOGRAPHY_URL =
  "https://www.redistricting.state.pa.us/resources/GISData/Census/2021/2021-DataSet1-WithoutPrisoner/2021%20LRC%20Data%20Release%201b%20-%20Geography.zip";

export const PENNSYLVANIA_LRC_UPSTREAM = Object.freeze({
  url: LRC_GEOGRAPHY_URL,
  byteCount: 338_792_424,
  sha256: "14187001c627c6a16bf967415059408c4ef7007d366fd9105b5be30763250e3b",
});

export const PENNSYLVANIA_PRECINCT_YEAR_SPECS = Object.freeze({
  2012: {
    year: 2012,
    date: "2012-11-06",
    electionId: "2012-11-06-general",
    manifestId: "pa-2012-11-06-precinct-geometry-unavailable-v1",
    base: "data/precinct-geometry/PA/2012-11-06-general",
    resultSourceId: "pa-dos-2012-general-precinct-results",
    resultPath: "data/pa-2012-general-election-returns-precinct.txt",
    readmePath: "data/pa-2012-general-election-returns-readme.txt",
    resultSourceUrl: OFFICIAL_INDEX_URL,
    readmeSourceUrl:
      "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/ElectionReturns_2012_General_ReadMeFile.txt",
    geometryPath:
      "data/precinct-geometry/PA/2012-11-06-general/raw/us-census/tl_2012_42_vtd10.zip",
    geometrySourceUrl:
      "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_42_vtd10.zip",
    geometryKind: "census_2010_vtd_diagnostic",
    geometryFields: {
      state: "STATEFP10",
      county: "COUNTYFP10",
      vtd: "VTDST10",
      name: "NAME10",
    },
    resultFields: {
      municipality: 20,
      breakdown1: 22,
      breakdown2: 24,
      countyFips: 27,
      vtd: 28,
    },
    expected: {
      sourceUnits: 9_246,
      sourceRows: 40_295,
      zeroVoteUnits: 28,
      total: 5_734_022,
      rawFeatures: 9_256,
    },
    rowLevelSafe: false,
  },
  2016: {
    year: 2016,
    date: "2016-11-08",
    electionId: "2016-11-08-general",
    manifestId: "pa-2016-11-08-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/PA/2016-11-08-general",
    resultSourceId: "pa-dos-2016-general-precinct-results",
    resultPath: "data/pa-2016-general-election-returns-precinct.txt",
    readmePath: "data/pa-2016-general-election-returns-readme.txt",
    resultSourceUrl: OFFICIAL_INDEX_URL,
    readmeSourceUrl:
      "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/ElectionReturns_2016_General_ReadMeFile.txt",
    geometryPath:
      "data/precinct-geometry/PA/2016-11-08-general/raw/vest/pa_2016.zip",
    geometrySourceUrl:
      "https://raw.githubusercontent.com/PlanScore/National-Input-Data/b8d27cbdc2e752fbadf8e3432d8eb3c96ba579b7/VEST/pa_2016.zip",
    geometryKind: "vest_2016",
    geometryFields: {
      state: "STATEFP",
      county: "COUNTYFP",
      vtd: "VTDST",
      name: "NAME",
    },
    resultFields: {
      municipality: 20,
      breakdown1: 22,
      breakdown2: 24,
      countyFips: 27,
      vtd: 28,
    },
    vestCandidateFields: [
      { field: "G16PREDCLI", party: "DEM", lastName: "CLINTON" },
      { field: "G16PRERTRU", party: "REP", lastName: "TRUMP" },
      { field: "G16PRELJOH", party: "LIB", lastName: "JOHNSON" },
      { field: "G16PREGSTE", party: "GRN", lastName: "STEIN" },
      { field: "G16PRECCAS", party: "CON", lastName: "CASTLE" },
    ],
    expected: {
      sourceUnits: 9_176,
      sourceRows: 45_880,
      zeroVoteUnits: 14,
      total: 6_114_296,
      rawFeatures: 9_167,
      mappedFeatures: 8_014,
      mappedSourceUnits: 8_018,
      mappedZeroVoteSourceUnits: 4,
      mappedTotal: 5_331_613,
      excludedSourceUnits: 1_158,
      excludedTotal: 782_683,
      noDataFeatures: 1_153,
    },
    rowLevelSafe: true,
  },
  2020: {
    year: 2020,
    date: "2020-11-03",
    electionId: "2020-11-03-general",
    manifestId: "pa-2020-11-03-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/PA/2020-11-03-general",
    resultSourceId: "pa-dos-2020-general-precinct-results",
    resultPath: "data/pa-2020-general-election-returns-precinct.txt",
    readmePath: "data/pa-2020-general-election-returns-readme.txt",
    resultSourceUrl: OFFICIAL_INDEX_URL,
    readmeSourceUrl:
      "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/ElectionReturns_2020_General_ReadMeFile.txt",
    geometryPath:
      "data/precinct-geometry/PA/2020-11-03-general/raw/vest/pa_2020.zip",
    geometrySourceUrl:
      "https://raw.githubusercontent.com/PlanScore/National-Input-Data/4ee0f4724a1e99213c95bd5c00926fb4b0c3d4c6/VEST/pa_2020.zip",
    geometryKind: "vest_2020",
    geometryFields: {
      state: "STATEFP",
      county: "COUNTYFP",
      vtd: "VTDST",
      name: "NAME",
    },
    resultFields: {
      municipality: 22,
      breakdown1: 24,
      breakdown2: 26,
      countyFips: 29,
      vtd: 30,
    },
    vestCandidateFields: [
      { field: "G20PREDBID", party: "DEM", lastName: "BIDEN" },
      { field: "G20PRERTRU", party: "REP", lastName: "TRUMP" },
      { field: "G20PRELJOR", party: "LIB", lastName: "JORGENSEN" },
    ],
    expected: {
      sourceUnits: 9_187,
      sourceRows: 27_561,
      zeroVoteUnits: 27,
      total: 6_916_044,
      rawFeatures: 9_150,
      mappedFeatures: 6_805,
      mappedSourceUnits: 6_827,
      mappedZeroVoteSourceUnits: 18,
      mappedTotal: 5_370_341,
      excludedSourceUnits: 2_360,
      excludedTotal: 1_545_703,
      noDataFeatures: 2_345,
    },
    rowLevelSafe: true,
  },
  2024: {
    year: 2024,
    date: "2024-11-05",
    electionId: "2024-11-05-general",
    manifestId: "pa-2024-11-05-precinct-geometry-unavailable-v1",
    base: "data/precinct-geometry/PA/2024-11-05-general",
    resultSourceId: "pa-dos-2024-general-precinct-results",
    resultPath: "data/pa-2024-general-election-returns-precinct.txt",
    readmePath: "data/pa-2024-general-election-returns-readme.txt",
    resultSourceUrl:
      "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/2024-general-election/er/erstat_2024_g_268768_20250129.txt",
    readmeSourceUrl:
      "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/2024-general-election/er/erstat_2024_g_readme.txt",
    geometryPath:
      "data/precinct-geometry/PA/2024-11-05-general/raw/pa-lrc/pa-lrc-2021-voting-districts.zip",
    geometrySourceUrl: LRC_GEOGRAPHY_URL,
    geometryKind: "pa_lrc_2021_vtd_diagnostic",
    geometryFields: {
      state: "STATEFP20",
      county: "COUNTYFP20",
      vtd: "VTDST20",
      name: "NAME20",
    },
    resultFields: {
      municipality: 22,
      breakdown1: 24,
      breakdown2: 26,
      countyFips: 29,
      vtd: 30,
    },
    expected: {
      sourceUnits: 9_187,
      sourceRows: 36_748,
      zeroVoteUnits: 33,
      total: 7_031_737,
      rawFeatures: 9_178,
    },
    rowLevelSafe: false,
  },
});

export const PENNSYLVANIA_RAW_SOURCE_PINS = Object.freeze({
  "data/pa-2012-general-election-returns-precinct.txt": [
    29_126_226,
    "b3c4c87e4963d3cb17d984ca46f755f67be4fe48208ffca29a0fdfcf10cd4063",
  ],
  "data/pa-2012-general-election-returns-readme.txt": [
    4_355,
    "b47960283bfaa059d5891c7997f630e67e22c4be6aaf1df16f2645a98caa45ca",
  ],
  "data/precinct-geometry/PA/2012-11-06-general/raw/us-census/tl_2012_42_vtd10.zip": [
    18_978_398,
    "d6efe39b359692235ca711d8c42bbcd27d8ae01f05b5ec8165169bb3c8020864",
  ],
  "data/pa-2016-general-election-returns-precinct.txt": [
    29_062_839,
    "1f91168dcba029b424e3b3f627e28f2e55f7f05de2579eea26ab0a97ac4cf39c",
  ],
  "data/pa-2016-general-election-returns-readme.txt": [
    4_284,
    "e6f62869a181fd677c6738b5a49712e3f8556307fbc01dac4dafd807e3b39a4a",
  ],
  "data/precinct-geometry/PA/2016-11-08-general/raw/vest/pa_2016.zip": [
    20_771_693,
    "156d833b813bef4ef5f095299b1283e1c843e646198c6b5b2fead4cd238fb991",
  ],
  "data/precinct-geometry/PA/2016-11-08-general/raw/review/pa_vest_16_validation_report.pdf": [
    73_752,
    "04647f0a402e4b381a826927affb1a308b51dd259e84da735961b45b817408c4",
  ],
  "data/precinct-geometry/PA/2016-11-08-general/raw/vest/documentation.txt": [
    156_582,
    "1feba4a879741eec2d3138da1e71e0d5da735ec8c9b5ba5718ef0a3b4251ae0d",
  ],
  "data/pa-2020-general-election-returns-precinct.txt": [
    28_738_883,
    "e01ab230eeaecf8fd5c090661029494e3e822ee65953f99265d7c409d086da56",
  ],
  "data/pa-2020-general-election-returns-readme.txt": [
    4_431,
    "5a6ce9021313462951a0bb6c9c46c39562225a9d1a276df0c5a2a23308407e80",
  ],
  "data/precinct-geometry/PA/2020-11-03-general/raw/vest/pa_2020.zip": [
    20_887_385,
    "8c05f2724f0b0c015eb5ba504b33892acbb78057f4a546aa66a7d453277d8d48",
  ],
  "data/precinct-geometry/PA/2020-11-03-general/raw/review/pa_vest_20_validation_report.pdf": [
    62_162,
    "78688e8ccdb287f3d9422a752c7421256275069cea21cc265909e99688d39cbb",
  ],
  "data/precinct-geometry/PA/2020-11-03-general/raw/vest/documentation.txt": [
    146_959,
    "fb784900056495c3dbf846dffb3410a71f72d2f8e06350ff66b5962aa3c1d1cc",
  ],
  "data/pa-2024-general-election-returns-precinct.txt": [
    42_907_408,
    "34339122238fe82272c52717a4065dbd3949e00eeb98320332797853c96f3b6c",
  ],
  "data/pa-2024-general-election-returns-readme.txt": [
    4_437,
    "b0d9e221deab9acd982982d187e4f16e7fae43d59b360b867cd89fad559eb632",
  ],
  "data/precinct-geometry/PA/2024-11-05-general/raw/pa-lrc/pa-lrc-2021-voting-districts.zip": [
    21_060_413,
    "7d3dad7f046a07fd9f7d944ae1d3c5f47be49b9e09a4b7b487dda8c350924098",
  ],
  "data/precinct-geometry/PA/2024-11-05-general/raw/pa-lrc/2021-lrc-data-certification-transcript.pdf": [
    1_006_750,
    "33dcbcd053adfc20c19d95aa14168b3d2883791d23d899a7e9b02d3a973700fa",
  ],
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absolute(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

export function rawSourcePathsForYear(year) {
  const spec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[year];
  if (!spec) throw new Error("Unsupported Pennsylvania precinct year: " + year);
  return Object.keys(PENNSYLVANIA_RAW_SOURCE_PINS).filter((relativePath) =>
    relativePath === spec.resultPath
    || relativePath === spec.readmePath
    || relativePath.includes("/" + spec.electionId + "/"),
  );
}

export function verifyPennsylvaniaRawSources(root, year) {
  for (const relativePath of rawSourcePathsForYear(year)) {
    const [expectedBytes, expectedSha256] =
      PENNSYLVANIA_RAW_SOURCE_PINS[relativePath];
    const bytes = readFileSync(absolute(root, relativePath));
    if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) {
      throw new Error(
        "Pennsylvania raw source drifted before derived writes: " + relativePath,
      );
    }
  }
}

function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .trim();
}

function pad(value, length) {
  return clean(value).toUpperCase().padStart(length, "0");
}

function finiteInteger(value, context) {
  const parsed = Number(clean(value).replaceAll(",", ""));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      context + " is not a nonnegative integer: " + JSON.stringify(value),
    );
  }
  return parsed;
}

export function normalizePennsylvaniaVtd(value) {
  const normalized = pad(value, 6);
  if (!normalized || /^0+$/.test(normalized)) return null;
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    throw new Error("Pennsylvania VTD code is invalid: " + JSON.stringify(value));
  }
  return normalized;
}

function parseCountyCodes(readmeText) {
  const codes = new Map();
  let inTable = false;
  for (const line of readmeText.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped === "County Code Table") {
      inTable = true;
      continue;
    }
    if (!inTable || (stripped && /^-+$/.test(stripped))) continue;
    if (!stripped) {
      if (codes.size > 0) break;
      continue;
    }
    const match = /^(\d{2})\s+(.+?)\s*$/.exec(stripped);
    if (!match) continue;
    const code = match[1];
    if (Number(code) >= 1 && Number(code) <= 67) {
      codes.set(code, match[2] + " County");
    }
  }
  if (codes.size !== 67) {
    throw new Error(
      "Expected 67 Pennsylvania county codes, got " + codes.size,
    );
  }
  return codes;
}

function sourceDisplayName(row, fields, precinctCode) {
  return [
    row[fields.municipality],
    row[fields.breakdown1],
    row[fields.breakdown2],
  ].map(clean).filter(Boolean).join(" ") || "Precinct " + precinctCode;
}

function canonicalOfficialUnitCode(spec, row) {
  return reportingUnitCode({
    state: "PA",
    electionId: spec.electionId,
    reportingGrain: "precinct",
    parentGeoid: row.parentGeoid,
    sourceUnitId: row.sourceUnitId,
  });
}

function canonicalMappedUnitCode(spec, row) {
  return reportingUnitCode({
    state: "PA",
    electionId: spec.electionId,
    reportingGrain: "precinct",
    parentGeoid: row.parentGeoid,
    sourceUnitId: row.sourceUnitId,
  });
}

function summarizeVotes(rows) {
  return rows.reduce((summary, row) => ({
    democratic: summary.democratic + row.democratic,
    republican: summary.republican + row.republican,
    other: summary.other + row.other,
    total: summary.total + row.total,
  }), { democratic: 0, republican: 0, other: 0, total: 0 });
}

export function parsePennsylvaniaOfficialResults(root, spec) {
  const countyNames = parseCountyCodes(
    readFileSync(absolute(root, spec.readmePath), "utf8"),
  );
  const sourceRows = parseCsv(
    readFileSync(absolute(root, spec.resultPath), "utf8"),
  );
  const units = new Map();
  let presidentSourceRows = 0;

  for (const row of sourceRows) {
    if (clean(row[8]).toUpperCase() !== "USP") continue;
    presidentSourceRows += 1;
    const countyCode = pad(row[2], 2);
    const precinctCode = pad(row[3], 7);
    const countyName = countyNames.get(countyCode);
    if (!countyName) {
      throw new Error(
        "Pennsylvania " + spec.year + " has unknown county code " + countyCode,
      );
    }
    const countyFips = pad(row[spec.resultFields.countyFips], 3);
    if (!/^\d{3}$/.test(countyFips)) {
      throw new Error(
        "Pennsylvania " + spec.year + " has invalid county FIPS " + countyFips,
      );
    }
    const parentGeoid = "42" + countyFips;
    const rawKey = countyCode + "|" + precinctCode;
    const vtdCode = normalizePennsylvaniaVtd(row[spec.resultFields.vtd]);
    const displayName = sourceDisplayName(
      row,
      spec.resultFields,
      precinctCode,
    );
    const unit = units.get(rawKey) ?? {
      rawKey,
      countyCode,
      countyFips,
      countyName,
      parentGeoid,
      sourceUnitId: precinctCode,
      displayNames: new Map(),
      vtdCode,
      candidates: new Map(),
    };
    if (
      unit.parentGeoid !== parentGeoid
      || unit.vtdCode !== vtdCode
    ) {
      throw new Error(
        "Pennsylvania " + spec.year
        + " result metadata drifted within " + rawKey,
      );
    }
    unit.displayNames.set(
      displayName,
      (unit.displayNames.get(displayName) ?? 0) + 1,
    );
    const party = clean(row[9]).toUpperCase();
    const lastName = clean(row[11]).toUpperCase();
    const firstName = clean(row[12]).toUpperCase();
    const candidateKey = [party, lastName, firstName].join("|");
    const votes = finiteInteger(
      row[15],
      "Pennsylvania " + spec.year + " presidential votes",
    );
    const candidate = unit.candidates.get(candidateKey) ?? {
      party,
      lastName,
      firstName,
      votes: 0,
      sourceRowCount: 0,
    };
    candidate.votes += votes;
    candidate.sourceRowCount += 1;
    unit.candidates.set(candidateKey, candidate);
    units.set(rawKey, unit);
  }

  const rows = [...units.values()].map((unit) => {
    const candidates = [...unit.candidates.values()].sort((left, right) =>
      (left.party + "|" + left.lastName + "|" + left.firstName).localeCompare(
        right.party + "|" + right.lastName + "|" + right.firstName,
      ),
    );
    const democratic = candidates
      .filter((candidate) => candidate.party === "DEM")
      .reduce((sum, candidate) => sum + candidate.votes, 0);
    const republican = candidates
      .filter((candidate) => candidate.party === "REP")
      .reduce((sum, candidate) => sum + candidate.votes, 0);
    const other = candidates
      .filter((candidate) => !["DEM", "REP"].includes(candidate.party))
      .reduce((sum, candidate) => sum + candidate.votes, 0);
    const candidateVotes = new Map();
    for (const candidate of candidates) {
      const key = candidate.party + "|" + candidate.lastName;
      candidateVotes.set(
        key,
        (candidateVotes.get(key) ?? 0) + candidate.votes,
      );
    }
    const sourceDisplayName = [...unit.displayNames]
      .sort((left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0][0];
    return {
      rawKey: unit.rawKey,
      countyCode: unit.countyCode,
      countyFips: unit.countyFips,
      countyName: unit.countyName,
      parentGeoid: unit.parentGeoid,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName,
      vtdCode: unit.vtdCode,
      candidates,
      candidateVotes,
      democratic,
      republican,
      other,
      total: democratic + republican + other,
      sourceComponentUnitIds: [unit.sourceUnitId],
    };
  }).sort((left, right) => left.rawKey.localeCompare(right.rawKey));

  const totals = summarizeVotes(rows);
  const expected = spec.expected;
  for (const [actual, wanted, label] of [
    [rows.length, expected.sourceUnits, "source units"],
    [presidentSourceRows, expected.sourceRows, "presidential source rows"],
    [rows.filter((row) => row.total === 0).length, expected.zeroVoteUnits, "zero-vote units"],
    [totals.total, expected.total, "presidential candidate votes"],
  ]) {
    if (actual !== wanted) {
      throw new Error(
        "Pennsylvania " + spec.year + " expected " + wanted + " " + label
        + ", got " + actual,
      );
    }
  }
  if (new Set(rows.map((row) => row.parentGeoid)).size !== 67) {
    throw new Error(
      "Pennsylvania " + spec.year + " official results must cover 67 counties",
    );
  }

  return {
    year: spec.year,
    rows,
    totals,
    sourceUnitCount: rows.length,
    zeroVoteUnitCount: rows.filter((row) => row.total === 0).length,
    presidentSourceRows,
    countyNames,
  };
}

function parsedCollection(value, context) {
  const collection = Array.isArray(value) ? value[0] : value;
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(context + " did not parse as a FeatureCollection");
  }
  return collection;
}

function inspectArchive(root, spec) {
  const bytes = readFileSync(absolute(root, spec.geometryPath));
  const entries = unzipSync(bytes);
  const members = Object.entries(entries)
    .map(([name, memberBytes]) => ({
      name,
      byteCount: memberBytes.length,
      sha256: sha256(memberBytes),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const projection = Object.entries(entries).find(([name]) =>
    name.toLowerCase().endsWith(".prj"),
  );
  return {
    byteCount: bytes.length,
    sha256: sha256(bytes),
    members,
    sourceCrs: projection
      ? Buffer.from(projection[1]).toString("utf8").trim()
      : null,
  };
}

function geometrySourceKey(spec, feature) {
  const properties = feature.properties ?? {};
  const state = pad(properties[spec.geometryFields.state], 2);
  const countyFips = pad(properties[spec.geometryFields.county], 3);
  const rawVtdCode = pad(properties[spec.geometryFields.vtd], 6);
  const vtdCode = normalizePennsylvaniaVtd(rawVtdCode);
  if (state !== "42" || !/^\d{3}$/.test(countyFips)) {
    throw new Error(
      "Pennsylvania " + spec.year + " geometry has invalid state/county identity",
    );
  }
  return {
    state,
    countyFips,
    parentGeoid: "42" + countyFips,
    rawVtdCode,
    vtdCode,
    key: countyFips + "|" + rawVtdCode,
    sourceName: clean(properties[spec.geometryFields.name]) || rawVtdCode,
  };
}

function byOfficialVtd(official) {
  const grouped = new Map();
  for (const row of official.rows) {
    if (!row.vtdCode) continue;
    const key = row.countyFips + "|" + row.vtdCode;
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }
  return grouped;
}

function candidateKeyDiagnostics(spec, collection, official) {
  const geometryGroups = new Map();
  for (const feature of collection.features) {
    const identity = geometrySourceKey(spec, feature);
    if (!identity.vtdCode) continue;
    const features = geometryGroups.get(identity.key) ?? [];
    features.push(feature);
    geometryGroups.set(identity.key, features);
  }
  const resultGroups = byOfficialVtd(official);
  const intersectionKeys = [...geometryGroups.keys()].filter((key) =>
    resultGroups.has(key),
  );
  return {
    officialResultUnits: official.sourceUnitCount,
    officialUnitsWithNonzeroVtd: official.rows.filter((row) => row.vtdCode).length,
    officialUnitsWithZeroVtd: official.rows.filter((row) => !row.vtdCode).length,
    officialVtdKeys: resultGroups.size,
    duplicateOfficialVtdKeys: [...resultGroups.values()].filter((rows) => rows.length > 1).length,
    geometryFeatures: collection.features.length,
    geometryVtdKeys: geometryGroups.size,
    duplicateGeometryVtdKeys: [...geometryGroups.values()].filter((features) => features.length > 1).length,
    candidateIntersectingVtdKeys: intersectionKeys.length,
    candidateResultUnitsOnIntersectingKeys: intersectionKeys.reduce(
      (sum, key) => sum + resultGroups.get(key).length,
      0,
    ),
    approvedRelationships: 0,
  };
}

function sourceFeatureId(year, identity, ordinal) {
  return [
    "pa",
    year,
    identity.parentGeoid,
    identity.rawVtdCode.toLowerCase(),
    String(ordinal).padStart(2, "0"),
  ].join(":");
}

function sourceFeatureKey(feature) {
  return feature.properties.CRM_PARENT_GEOID
    + "|" + feature.properties.CRM_FEATURE_ID;
}

function forbiddenElectionProperties(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      forbiddenElectionProperties(child, context + "[" + index + "]"),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:G\d{2}|VOTES?|TOTALVOTES?|CANDIDATE|PARTY|PCT_DEM|PCT_REP)/i.test(key)) {
      throw new Error(context + " retained election-value property " + key);
    }
    forbiddenElectionProperties(child, context + "." + key);
  }
}

function normalizedGeometryFeature(spec, source, mapped, noDataReason) {
  const properties = {
    CRM_FEATURE_ID: source.crmFeatureId,
    CRM_PARENT_GEOID: source.identity.parentGeoid,
    CRM_RESULT_UNIT_CODE: mapped?.resultUnitCode ?? null,
    SOURCE_VTD_CODE: source.identity.rawVtdCode,
    SOURCE_NAME: source.identity.sourceName,
    SOURCE_FEATURE_ORDINAL: source.ordinal,
    SOURCE_COMPONENT_COUNT: mapped?.sourceComponentUnitIds.length ?? 0,
    SOURCE_COMPONENT_IDS: mapped
      ? mapped.sourceComponentUnitIds.join("|")
      : "",
    SOURCE_GEOMETRY_AUTHORITY:
      "Voting and Election Science Team (VEST) election-specific reconstruction",
    SOURCE_GEOMETRY_METHOD: mapped
      ? "official_vtd_and_complete_vote_signature"
      : "reviewed_no_data",
    SOURCE_NO_DATA_REASON: mapped ? null : noDataReason,
  };
  forbiddenElectionProperties(
    properties,
    "Pennsylvania " + spec.year + " normalized feature",
  );
  return {
    type: "Feature",
    properties,
    geometry: source.feature.geometry,
  };
}

function officialCandidateSignature(spec, rows) {
  return spec.vestCandidateFields.map(({ party, lastName }) =>
    rows.reduce(
      (sum, row) => sum + (row.candidateVotes.get(party + "|" + lastName) ?? 0),
      0,
    ),
  );
}

function hasCompleteOfficialCandidateRoster(spec, rows) {
  const expected = spec.vestCandidateFields
    .map(({ party, lastName }) => party + "|" + lastName)
    .sort();
  return rows.every((row) => {
    const actual = [...new Set(row.candidates.map((candidate) =>
      candidate.party + "|" + candidate.lastName
    ))].sort();
    return actual.length === expected.length
      && actual.every((key, index) => key === expected[index]);
  });
}

function geometryCandidateSignature(spec, feature) {
  return spec.vestCandidateFields.map(({ field }) =>
    finiteInteger(
      feature.properties?.[field],
      "Pennsylvania " + spec.year + " VEST " + field,
    ),
  );
}

function signaturesEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function aggregateMappedRow(spec, source, components) {
  const democratic = components.reduce((sum, row) => sum + row.democratic, 0);
  const republican = components.reduce((sum, row) => sum + row.republican, 0);
  const other = components.reduce((sum, row) => sum + row.other, 0);
  const row = {
    sourceUnitId: source.identity.rawVtdCode,
    sourceDisplayName: source.identity.sourceName,
    parentGeoid: source.identity.parentGeoid,
    parentSourceName: components[0].countyName,
    democratic,
    republican,
    other,
    total: democratic + republican + other,
    sourceComponentUnitIds: components
      .map((component) => component.sourceUnitId)
      .sort(),
    sourceComponentResultUnitCodes: components
      .map((component) => canonicalOfficialUnitCode(spec, component))
      .sort(),
  };
  row.resultUnitCode = canonicalMappedUnitCode(spec, row);
  return row;
}

function safeGeometryModel(spec, collection, official) {
  const officialGroups = byOfficialVtd(official);
  const sourceGroups = new Map();
  for (const [index, feature] of collection.features.entries()) {
    if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
      throw new Error(
        "Pennsylvania " + spec.year + " geometry feature " + index
        + " is not polygonal",
      );
    }
    const identity = geometrySourceKey(spec, feature);
    const group = sourceGroups.get(identity.key) ?? [];
    group.push({ feature, identity, sourceIndex: index });
    sourceGroups.set(identity.key, group);
  }

  const sources = [];
  for (const group of sourceGroups.values()) {
    for (const [index, entry] of group.entries()) {
      const ordinal = index + 1;
      sources.push({
        ...entry,
        ordinal,
        duplicateSourceIdentity: group.length > 1,
        crmFeatureId: sourceFeatureId(spec.year, entry.identity, ordinal),
      });
    }
  }
  sources.sort((left, right) =>
    (left.identity.parentGeoid + "|" + left.crmFeatureId).localeCompare(
      right.identity.parentGeoid + "|" + right.crmFeatureId,
    ),
  );

  const usedOfficial = new Set();
  const mappedRows = [];
  const features = [];
  const noDataFeatureIds = [];
  const exclusionReasons = new Map();
  const methods = {
    exactOfficialVtdAndCompleteVoteSignature: 0,
    officialSourceComponentAggregation: 0,
  };

  for (const source of sources) {
    let components = [];
    let noDataReason = "no_official_result_vtd_key";
    if (!source.identity.vtdCode) {
      noDataReason = "zero_or_blank_vtd_code";
    } else if (source.duplicateSourceIdentity) {
      noDataReason = "duplicate_geometry_vtd_code";
    } else {
      components = officialGroups.get(source.identity.key) ?? [];
      if (components.length > 0) {
        if (!hasCompleteOfficialCandidateRoster(spec, components)) {
          noDataReason = "complete_candidate_roster_mismatch";
          components = [];
        } else {
          const officialSignature = officialCandidateSignature(spec, components);
          const sourceSignature = geometryCandidateSignature(spec, source.feature);
          if (!signaturesEqual(officialSignature, sourceSignature)) {
            noDataReason = "complete_vote_signature_mismatch";
            components = [];
          }
        }
      }
    }

    let mapped = null;
    if (components.length > 0) {
      if (components.some((row) => usedOfficial.has(row.rawKey))) {
        throw new Error(
          "Pennsylvania " + spec.year
          + " attempted to reuse an official source component",
        );
      }
      components.forEach((row) => usedOfficial.add(row.rawKey));
      mapped = aggregateMappedRow(spec, source, components);
      mappedRows.push({
        ...mapped,
        sourceFeatureId:
          source.identity.parentGeoid + "|" + source.crmFeatureId,
        components,
      });
      methods.exactOfficialVtdAndCompleteVoteSignature += 1;
      if (components.length > 1) {
        methods.officialSourceComponentAggregation += 1;
      }
    } else {
      noDataFeatureIds.push(
        source.identity.parentGeoid + "|" + source.crmFeatureId,
      );
    }
    const normalized = normalizedGeometryFeature(
      spec,
      source,
      mapped,
      noDataReason,
    );
    features.push(normalized);
  }

  for (const row of official.rows) {
    if (usedOfficial.has(row.rawKey)) continue;
    let reason = "no_reviewed_result_to_geometry_relationship";
    if (!row.vtdCode) {
      reason = "zero_or_blank_vtd_code";
    } else {
      const sourceGroup = sourceGroups.get(row.countyFips + "|" + row.vtdCode);
      if (!sourceGroup) reason = "no_geometry_vtd_key";
      else if (sourceGroup.length > 1) reason = "duplicate_geometry_vtd_code";
      else reason = "complete_vote_signature_mismatch";
    }
    exclusionReasons.set(row.rawKey, reason);
  }

  const exclusions = official.rows.filter((row) => !usedOfficial.has(row.rawKey));
  const mappedSourceUnitCount = usedOfficial.size;
  const mappedZeroVoteSourceUnitCount = official.rows.filter(
    (row) => usedOfficial.has(row.rawKey) && row.total === 0,
  ).length;
  const mappedTotals = summarizeVotes(
    official.rows.filter((row) => usedOfficial.has(row.rawKey)),
  );
  const excludedTotals = summarizeVotes(exclusions);
  const expected = spec.expected;
  for (const [actual, wanted, label] of [
    [features.length, expected.rawFeatures, "normalized features"],
    [mappedRows.length, expected.mappedFeatures, "mapped features"],
    [mappedSourceUnitCount, expected.mappedSourceUnits, "mapped source units"],
    [mappedZeroVoteSourceUnitCount, expected.mappedZeroVoteSourceUnits, "mapped zero-vote source units"],
    [mappedTotals.total, expected.mappedTotal, "mapped votes"],
    [exclusions.length, expected.excludedSourceUnits, "excluded source units"],
    [excludedTotals.total, expected.excludedTotal, "excluded votes"],
    [noDataFeatureIds.length, expected.noDataFeatures, "reviewed no-data features"],
  ]) {
    if (actual !== wanted) {
      throw new Error(
        "Pennsylvania " + spec.year + " expected " + wanted + " " + label
        + ", got " + actual,
      );
    }
  }

  const uniqueFeatureKeys = new Set(features.map(sourceFeatureKey));
  if (uniqueFeatureKeys.size !== features.length) {
    throw new Error(
      "Pennsylvania " + spec.year + " normalized feature identities are not unique",
    );
  }
  mappedRows.sort((left, right) =>
    left.resultUnitCode.localeCompare(right.resultUnitCode),
  );

  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    mappedSourceUnitCount,
    mappedZeroVoteSourceUnitCount,
    exclusions,
    exclusionReasons,
    noDataFeatureIds: noDataFeatureIds.sort(),
    methods,
    diagnostics: {
      ...candidateKeyDiagnostics(spec, collection, official),
      approvedRelationships: mappedRows.length,
    },
    mappedTotals,
    excludedTotals,
    sourceAuthority:
      "Voting and Election Science Team (VEST) election-specific reconstruction",
  };
}

export async function buildPennsylvaniaGeometryModel(root, spec, official) {
  const collection = parsedCollection(
    await shp(readFileSync(absolute(root, spec.geometryPath))),
    "Pennsylvania " + spec.year + " geometry",
  );
  if (collection.features.length !== spec.expected.rawFeatures) {
    throw new Error(
      "Pennsylvania " + spec.year + " expected " + spec.expected.rawFeatures
      + " source features, got " + collection.features.length,
    );
  }
  const archive = inspectArchive(root, spec);
  if (spec.rowLevelSafe) {
    return { ...safeGeometryModel(spec, collection, official), archive };
  }
  return {
    rawFeatureCount: collection.features.length,
    features: [],
    mappedRows: [],
    mappedSourceUnitCount: 0,
    mappedZeroVoteSourceUnitCount: 0,
    exclusions: official.rows,
    exclusionReasons: new Map(
      official.rows.map((row) => [
        row.rawKey,
        "complete_election_effective_geometry_unavailable",
      ]),
    ),
    noDataFeatureIds: [],
    methods: {},
    diagnostics: candidateKeyDiagnostics(spec, collection, official),
    mappedTotals: summarizeVotes([]),
    excludedTotals: official.totals,
    sourceAuthority: spec.year === 2012
      ? "U.S. Census Bureau 2010 VTD statistical geography (diagnostic only)"
      : "Pennsylvania Legislative Reapportionment Commission 2021 corrected voting-district geography (diagnostic only)",
    archive,
  };
}

function publicMappedResultRow(row) {
  return {
    resultUnitCode: row.resultUnitCode,
    sourceUnitId: row.sourceUnitId,
    sourceDisplayName: row.sourceDisplayName,
    parentGeoid: row.parentGeoid,
    parentSourceName: row.parentSourceName,
    democratic: row.democratic,
    republican: row.republican,
    other: row.other,
    total: row.total,
    sourceComponentUnitIds: row.sourceComponentUnitIds,
    sourceComponentResultUnitCodes: row.sourceComponentResultUnitCodes,
  };
}

function publicExclusion(spec, row, reason) {
  return {
    resultUnitCode: canonicalOfficialUnitCode(spec, row),
    sourceUnitId: row.sourceUnitId,
    sourceDisplayName: row.sourceDisplayName,
    parentGeoid: row.parentGeoid,
    parentSourceName: row.countyName,
    vtdCode: row.vtdCode,
    democratic: row.democratic,
    republican: row.republican,
    other: row.other,
    total: row.total,
    sourceComponentUnitIds: [row.sourceUnitId],
    exclusionReason: reason,
  };
}

function mappedCrosswalkRow(spec, mapped) {
  return {
    resultUnitCode: mapped.resultUnitCode,
    sourceUnitId: mapped.sourceUnitId,
    sourceDisplayName: mapped.sourceDisplayName,
    parentGeoid: mapped.parentGeoid,
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: [{
      sourceFeatureId: mapped.sourceFeatureId,
      relationshipType: "one_to_one",
      matchMethod: "official_crosswalk",
      reviewStatus: "reviewed",
      confidence: "high",
      note:
        "County-qualified DOS VTD code and the complete presidential candidate vector exactly match one unique VEST polygon. Displayed values sum only the complete official DOS source components "
        + mapped.sourceComponentUnitIds.join(", ")
        + "; no value is allocated or copied from VEST.",
    }],
  };
}

function blockedCrosswalkRow(spec, row) {
  return {
    resultUnitCode: canonicalOfficialUnitCode(spec, row),
    sourceUnitId: row.sourceUnitId,
    sourceDisplayName: row.sourceDisplayName,
    parentGeoid: row.parentGeoid,
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: [{
      sourceFeatureId: null,
      relationshipType: "unmatched",
      matchMethod: "official_crosswalk",
      reviewStatus: "pending",
      confidence: "high",
      note: spec.year === 2012
        ? "Official Pennsylvania result retained without geometry. Census 2010 VTDs do not establish the November 6, 2012 election precinct edition."
        : "Official Pennsylvania result retained without geometry. The corrected 2021 LRC layer is not backcast or forward-cast to the November 5, 2024 election.",
    }],
  };
}

function reconciliationScopes(rows) {
  const stateTotals = summarizeVotes(rows);
  const byParent = new Map();
  for (const row of rows) {
    const parentRows = byParent.get(row.parentGeoid) ?? [];
    parentRows.push(row);
    byParent.set(row.parentGeoid, parentRows);
  }
  const scope = (scopeType, scopeId, totals) => ({
    scopeType,
    scopeId,
    resultTotals: totals,
    mappedTotals: totals,
    deltas: Object.fromEntries(Object.keys(totals).map((key) => [key, 0])),
  });
  return [
    scope("state", "PA", stateTotals),
    ...[...byParent]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([parentGeoid, parentRows]) =>
        scope("parent", parentGeoid, summarizeVotes(parentRows)),
      ),
  ];
}

export async function buildPennsylvaniaCanonicalDocuments(root, spec) {
  const official = parsePennsylvaniaOfficialResults(root, spec);
  const geometryModel = await buildPennsylvaniaGeometryModel(
    root,
    spec,
    official,
  );
  const mappedRows = geometryModel.mappedRows.map(publicMappedResultRow);
  const exclusions = geometryModel.exclusions.map((row) =>
    publicExclusion(
      spec,
      row,
      geometryModel.exclusionReasons.get(row.rawKey),
    ),
  );
  const mappedTotals = summarizeVotes(mappedRows);
  const excludedTotals = summarizeVotes(exclusions);
  const results = {
    schemaVersion: 1,
    state: "PA",
    electionId: spec.electionId,
    reportingGrain: "precinct",
    sourceUnitCount: official.sourceUnitCount,
    colorableUnitCount: mappedRows.length,
    mappedSourceComponentCount: geometryModel.mappedSourceUnitCount,
    mappedZeroVoteSourceComponentCount:
      geometryModel.mappedZeroVoteSourceUnitCount,
    excludedUnitCount: exclusions.length,
    zeroVoteUnitCount: official.zeroVoteUnitCount,
    mappedZeroVoteUnitCount: mappedRows.filter((row) => row.total === 0).length,
    totals: official.totals,
    mappedTotals,
    excludedTotals,
    collection: {
      authority: "Pennsylvania Department of State",
      sourceUrl: spec.resultSourceUrl,
      localArtifactPath: spec.resultPath,
      candidateVotePolicy:
        "Every USP candidate row is retained; DEM and REP party rows form the major-party buckets and every other party row forms other.",
      aggregationPolicy:
        "Only complete official source units sharing one county-qualified VTD code may be summed when their complete candidate vector exactly matches one unique polygon. No vote is estimated, distributed, or copied from geometry.",
      resultIdentity:
        "The canonical official source identity is County Code plus Precinct Code. VTD is used only as a corroborated crosswalk field and never replaces that source identity.",
    },
    rows: mappedRows,
    exclusions,
  };

  const geometry = spec.rowLevelSafe
    ? {
      type: "FeatureCollection",
      metadata: {
        schemaVersion: 1,
        state: "PA",
        electionId: spec.electionId,
        sourceAuthority: geometryModel.sourceAuthority,
        sourceUrl: spec.geometrySourceUrl,
        sourceFeatureCount: geometryModel.rawFeatureCount,
        normalizedFeatureCount: geometryModel.features.length,
        reviewedNoDataFeatureCount: geometryModel.noDataFeatureIds.length,
        voteFieldsIncluded: false,
        reviewMethods: geometryModel.methods,
      },
      features: geometryModel.features,
    }
    : {
      schemaVersion: 1,
      state: "PA",
      electionId: spec.electionId,
      disposition: "blocked",
      normalizedFeatureCount: 0,
      diagnosticCandidateFeatureCount: geometryModel.rawFeatureCount,
      reason: spec.year === 2012
        ? "The 2010 Census VTD layer is statistical geography and does not establish Pennsylvania's November 6, 2012 election precinct boundaries or result crosswalk."
        : "The corrected 2021 LRC VTD layer does not establish Pennsylvania's November 5, 2024 election precinct boundaries or result crosswalk.",
    };

  const crosswalkRows = spec.rowLevelSafe
    ? geometryModel.mappedRows.map((row) => mappedCrosswalkRow(spec, row))
    : official.rows.map((row) => blockedCrosswalkRow(spec, row));
  crosswalkRows.sort((left, right) =>
    left.resultUnitCode.localeCompare(right.resultUnitCode),
  );
  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: "PA",
    electionId: spec.electionId,
    geographyLevel: "precinct",
    resultSourceId: spec.resultSourceId,
    generatedAt: PENNSYLVANIA_REVIEWED_AT,
    rows: crosswalkRows,
    reconciliation: {
      status: spec.rowLevelSafe ? "passed" : "not_run",
      scopes: spec.rowLevelSafe ? reconciliationScopes(mappedRows) : [],
      sourceResultUnitCount: official.sourceUnitCount,
      normalizedResultUnitCount: mappedRows.length,
      mappedSourceComponentCount: geometryModel.mappedSourceUnitCount,
      geometryFeatureCount: geometryModel.features.length,
      reviewedRelationshipRecordCount: mappedRows.length,
      reviewedNoDataFeatureCount: geometryModel.noDataFeatureIds.length,
      excludedSourceUnitCount: exclusions.length,
      sourceTotals: official.totals,
      mappedTotals,
      excludedTotals,
      sourceTotalsReconciled: Object.keys(official.totals).every((key) =>
        official.totals[key] === mappedTotals[key] + excludedTotals[key],
      ),
      methods: geometryModel.methods,
    },
  };

  return {
    official,
    geometryModel,
    results,
    geometry,
    crosswalk,
  };
}
