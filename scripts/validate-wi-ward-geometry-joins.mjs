import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const stagingPath = '.etl/staging/wi-2024-staging.json';
const geometryPath = 'data/wi-2024-ward-geometry.geojson.gz';
const outPath = 'data/wi-2024-ward-geometry-join-report.json';

const TYPE_TO_CTV = {
  City: 'C',
  Town: 'T',
  Village: 'V',
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeCounty(value) {
  return String(value ?? '')
    .replace(/\s+County$/i, '')
    .trim()
    .toUpperCase();
}

function normalizeName(value) {
  let text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .toUpperCase()
    .replace(/\bST\b/g, 'SAINT')
    .replace(/\bMT\b/g, 'MOUNT')
    .replace(/\s+/g, ' ')
    .trim();

  if (text === 'FONTANA ON GENEVA LAKE') {
    text = 'FONTANA';
  }

  return text.replace(/\s+/g, '');
}

function normalizeWardId(value) {
  const match = String(value ?? '').trim().toUpperCase().match(/^0*(\d+)([A-Z]?)$/);
  if (!match) {
    return String(value ?? '').trim().toUpperCase();
  }
  return `${Number(match[1])}${match[2] ?? ''}`;
}

function parseWardSpec(value) {
  const wards = new Set();
  const tokens = String(value ?? '').toUpperCase().split(',').map((token) => token.trim()).filter(Boolean);
  for (const token of tokens) {
    const range = token.match(/^(\d+)([A-Z]?)\s*-\s*(\d+)([A-Z]?)$/);
    if (range) {
      const start = Number(range[1]);
      const startSuffix = range[2] ?? '';
      const end = Number(range[3]);
      const endSuffix = range[4] ?? '';
      if (!startSuffix && !endSuffix) {
        for (let ward = Math.min(start, end); ward <= Math.max(start, end); ward += 1) {
          wards.add(String(ward));
        }
      } else if (!startSuffix && endSuffix && start <= end) {
        for (let ward = start; ward < end; ward += 1) {
          wards.add(String(ward));
        }
        wards.add(`${end}${endSuffix}`);
      } else if (start === end) {
        wards.add(`${start}${startSuffix}`);
        wards.add(`${end}${endSuffix}`);
      }
      continue;
    }
    const single = token.match(/^\d+[A-Z]?$/);
    if (single) {
      wards.add(normalizeWardId(token));
    }
  }
  return [...wards].sort((a, b) => {
    const aMatch = a.match(/^(\d+)([A-Z]?)$/);
    const bMatch = b.match(/^(\d+)([A-Z]?)$/);
    if (!aMatch || !bMatch) {
      return a.localeCompare(b);
    }
    return Number(aMatch[1]) - Number(bMatch[1]) || aMatch[2].localeCompare(bMatch[2]);
  });
}

function parseReviewLocalUnit(localUnit) {
  const match = String(localUnit ?? '').match(/^(City|Town|Village) of (.+?) Wards?\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const [, typeRaw, municipalityRaw, wardsRaw] = match;
  const type = typeRaw[0].toUpperCase() + typeRaw.slice(1).toLowerCase();
  const wards = parseWardSpec(wardsRaw);
  if (wards.length === 0) {
    return null;
  }
  return {
    type,
    ctv: TYPE_TO_CTV[type],
    municipality: municipalityRaw.trim(),
    municipalityKey: normalizeName(municipalityRaw),
    wards,
    wardSpec: wardsRaw.trim(),
  };
}

function geometryKey(county, ctv, municipality) {
  return [normalizeCounty(county), ctv, normalizeName(municipality)].join('|');
}

function sum(features, field) {
  return features.reduce((total, feature) => total + Number(feature.properties[field] ?? 0), 0);
}

function pct(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

const staging = readJson(stagingPath);
const geometry = JSON.parse(zlib.gunzipSync(fs.readFileSync(geometryPath)));
const reviewRows = staging.native.reviewRows;

const geometryByJurisdiction = new Map();
for (const feature of geometry.features) {
  const props = feature.properties;
  const key = geometryKey(props.CNTY_NAME, props.CTV, props.MCD_NAME);
  if (!geometryByJurisdiction.has(key)) {
    geometryByJurisdiction.set(key, new Map());
  }
  const ward = normalizeWardId(props.WARDID);
  geometryByJurisdiction.get(key).set(ward, feature);
}

const matchedRows = [];
const unmatchedRows = [];
const mismatchedRows = [];
const parseFailures = [];

for (const row of reviewRows) {
  const parsed = parseReviewLocalUnit(row.localUnit);
  if (!parsed) {
    parseFailures.push({
      county: row.county,
      localUnit: row.localUnit,
      reason: 'local_unit_pattern_not_parsed',
    });
    continue;
  }

  const key = geometryKey(row.county, parsed.ctv, parsed.municipality);
  const jurisdiction = geometryByJurisdiction.get(key);
  if (!jurisdiction) {
    unmatchedRows.push({
      county: row.county,
      localUnit: row.localUnit,
      reason: 'municipality_not_found_in_geometry',
      parsed,
    });
    continue;
  }

  const selectedFeatures = parsed.wards.map((ward) => jurisdiction.get(ward)).filter(Boolean);
  const missingWards = parsed.wards.filter((ward) => !jurisdiction.has(ward));
  if (missingWards.length > 0) {
    unmatchedRows.push({
      county: row.county,
      localUnit: row.localUnit,
      reason: 'one_or_more_wards_not_found_in_geometry',
      parsed,
      missingWards,
    });
    continue;
  }

  const geometryTotals = {
    totalVotes: sum(selectedFeatures, 'PRETOT24'),
    harris: sum(selectedFeatures, 'PREDEM24'),
    trump: sum(selectedFeatures, 'PREREP24'),
  };
  const deltas = {
    totalVotes: geometryTotals.totalVotes - Number(row.totalVotes ?? 0),
    harris: geometryTotals.harris - Number(row.harris ?? 0),
    trump: geometryTotals.trump - Number(row.trump ?? 0),
  };
  const record = {
    county: row.county,
    localUnit: row.localUnit,
    parsed,
    geometryFeatureCount: selectedFeatures.length,
    geometryLabels: selectedFeatures.map((feature) => feature.properties.LABEL),
    wecTotals: {
      totalVotes: row.totalVotes,
      harris: row.harris,
      trump: row.trump,
    },
    geometryTotals,
    deltas,
  };

  matchedRows.push(record);
  if (deltas.totalVotes !== 0 || deltas.harris !== 0 || deltas.trump !== 0) {
    mismatchedRows.push(record);
  }
}

const exactTotalRows = matchedRows.filter((row) => row.deltas.totalVotes === 0);
const exactMajorPartyRows = matchedRows.filter((row) => row.deltas.harris === 0 && row.deltas.trump === 0);
const mismatchAbsTotal = mismatchedRows.reduce((total, row) => total + Math.abs(row.deltas.totalVotes), 0);

const report = {
  state: 'WI',
  year: 2024,
  generatedAt: new Date().toISOString(),
  status:
    matchedRows.length === reviewRows.length && mismatchedRows.length === 0
      ? 'join_validation_passed'
      : 'candidate_collected_join_validation_needs_review',
  source: {
    stagingPath,
    geometryPath,
    geometrySource: 'https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2024_Election_Data_with_2025_Wards/FeatureServer/0',
  },
  summary: {
    reviewRows: reviewRows.length,
    geometryFeatures: geometry.features.length,
    geometryJurisdictions: geometryByJurisdiction.size,
    matchedReviewRows: matchedRows.length,
    unmatchedReviewRows: unmatchedRows.length,
    parseFailures: parseFailures.length,
    mismatchedMatchedRows: mismatchedRows.length,
    exactPresidentialTotalRows: exactTotalRows.length,
    exactMajorPartyRows: exactMajorPartyRows.length,
    matchedPct: pct(matchedRows.length, reviewRows.length),
    exactPresidentialTotalPctOfMatched: pct(exactTotalRows.length, matchedRows.length),
    exactMajorPartyPctOfMatched: pct(exactMajorPartyRows.length, matchedRows.length),
    mismatchAbsTotal,
  },
  caveats: [
    'The ArcGIS layer is official Wisconsin Legislature/LTSB data for November 2024 results with January 2025 wards.',
    'This report validates row joins and vote totals before the geometry is allowed to power ward-level map rendering.',
    'County-level production indicators remain authoritative; ward geometry is visualization context until this validation passes.',
  ],
  examples: {
    matched: matchedRows.slice(0, 10),
    unmatched: unmatchedRows.slice(0, 25),
    parseFailures: parseFailures.slice(0, 25),
    mismatched: mismatchedRows.slice(0, 25),
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outPath, status: report.status, summary: report.summary }, null, 2));
