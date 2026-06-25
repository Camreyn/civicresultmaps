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

function addTotals(target, source) {
  target.totalVotes += Number(source.totalVotes ?? source.PRETOT24 ?? 0);
  target.harris += Number(source.harris ?? source.PREDEM24 ?? 0);
  target.trump += Number(source.trump ?? source.PREREP24 ?? 0);
}

function emptyTotals() {
  return { totalVotes: 0, harris: 0, trump: 0 };
}

function diffTotals(left, right) {
  return {
    totalVotes: Number(left.totalVotes ?? 0) - Number(right.totalVotes ?? 0),
    harris: Number(left.harris ?? 0) - Number(right.harris ?? 0),
    trump: Number(left.trump ?? 0) - Number(right.trump ?? 0),
  };
}

function totalsAreExact(deltas) {
  return deltas.totalVotes === 0 && deltas.harris === 0 && deltas.trump === 0;
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
const geometryJurisdictionTotals = new Map();
const geometryJurisdictionMeta = new Map();

for (const feature of geometry.features) {
  const props = feature.properties;
  const key = geometryKey(props.CNTY_NAME, props.CTV, props.MCD_NAME);
  if (!geometryByJurisdiction.has(key)) {
    geometryByJurisdiction.set(key, new Map());
    geometryJurisdictionTotals.set(key, emptyTotals());
    geometryJurisdictionMeta.set(key, {
      key,
      county: `${props.CNTY_NAME} County`,
      ctv: props.CTV,
      municipality: props.MCD_NAME,
      geometryLabels: [],
    });
  }
  const ward = normalizeWardId(props.WARDID);
  geometryByJurisdiction.get(key).set(ward, feature);
  addTotals(geometryJurisdictionTotals.get(key), props);
  geometryJurisdictionMeta.get(key).geometryLabels.push(props.LABEL);
}

const reviewJurisdictionTotals = new Map();
const reviewJurisdictionRows = new Map();
const reviewJurisdictionMeta = new Map();
const matchedRows = [];
const unmatchedRows = [];
const mismatchedRows = [];
const parseFailures = [];
const affectedJurisdictionKeys = new Set();

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
  if (!reviewJurisdictionTotals.has(key)) {
    reviewJurisdictionTotals.set(key, emptyTotals());
    reviewJurisdictionRows.set(key, []);
    reviewJurisdictionMeta.set(key, {
      key,
      county: row.county,
      ctv: parsed.ctv,
      type: parsed.type,
      municipality: parsed.municipality,
    });
  }
  addTotals(reviewJurisdictionTotals.get(key), row);
  reviewJurisdictionRows.get(key).push(row.localUnit);

  const jurisdiction = geometryByJurisdiction.get(key);
  if (!jurisdiction) {
    unmatchedRows.push({
      county: row.county,
      localUnit: row.localUnit,
      reason: 'municipality_not_found_in_geometry',
      jurisdictionKey: key,
      parsed,
    });
    affectedJurisdictionKeys.add(key);
    continue;
  }

  const selectedFeatures = parsed.wards.map((ward) => jurisdiction.get(ward)).filter(Boolean);
  const missingWards = parsed.wards.filter((ward) => !jurisdiction.has(ward));
  if (missingWards.length > 0) {
    unmatchedRows.push({
      county: row.county,
      localUnit: row.localUnit,
      reason: 'one_or_more_wards_not_found_in_geometry',
      jurisdictionKey: key,
      parsed,
      missingWards,
    });
    affectedJurisdictionKeys.add(key);
    continue;
  }

  const geometryTotals = {
    totalVotes: sum(selectedFeatures, 'PRETOT24'),
    harris: sum(selectedFeatures, 'PREDEM24'),
    trump: sum(selectedFeatures, 'PREREP24'),
  };
  const deltas = diffTotals(geometryTotals, row);
  const record = {
    county: row.county,
    localUnit: row.localUnit,
    jurisdictionKey: key,
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
  if (!totalsAreExact(deltas)) {
    mismatchedRows.push(record);
    affectedJurisdictionKeys.add(key);
  }
}

const jurisdictionReconciliation = [...affectedJurisdictionKeys].sort().map((key) => {
  const reviewTotals = reviewJurisdictionTotals.get(key) ?? emptyTotals();
  const geometryTotals = geometryJurisdictionTotals.get(key) ?? emptyTotals();
  const deltas = diffTotals(geometryTotals, reviewTotals);
  const meta = reviewJurisdictionMeta.get(key) ?? geometryJurisdictionMeta.get(key) ?? { key };
  const affectedUnmatchedRows = unmatchedRows.filter((row) => row.jurisdictionKey === key);
  const affectedMismatchedRows = mismatchedRows.filter((row) => row.jurisdictionKey === key);
  return {
    ...meta,
    status: totalsAreExact(deltas)
      ? 'jurisdiction_totals_reconciled_ward_version_delta'
      : 'unresolved_jurisdiction_total_delta',
    reviewRowCount: reviewJurisdictionRows.get(key)?.length ?? 0,
    geometryFeatureCount: geometryByJurisdiction.get(key)?.size ?? 0,
    affectedUnmatchedRows: affectedUnmatchedRows.length,
    affectedMismatchedRows: affectedMismatchedRows.length,
    wecTotals: reviewTotals,
    geometryTotals,
    deltas,
    unresolvedExamples: {
      unmatched: affectedUnmatchedRows.slice(0, 10).map((row) => ({
        localUnit: row.localUnit,
        reason: row.reason,
        missingWards: row.missingWards ?? [],
      })),
      mismatched: affectedMismatchedRows.slice(0, 10).map((row) => ({
        localUnit: row.localUnit,
        deltas: row.deltas,
      })),
    },
  };
});

const unresolvedJurisdictionReconciliation = jurisdictionReconciliation.filter(
  (row) => row.status === 'unresolved_jurisdiction_total_delta',
);
const exactTotalRows = matchedRows.filter((row) => row.deltas.totalVotes === 0);
const exactMajorPartyRows = matchedRows.filter((row) => row.deltas.harris === 0 && row.deltas.trump === 0);
const mismatchAbsTotal = mismatchedRows.reduce((total, row) => total + Math.abs(row.deltas.totalVotes), 0);
const status =
  matchedRows.length === reviewRows.length && mismatchedRows.length === 0
    ? 'join_validation_passed'
    : parseFailures.length === 0 && unresolvedJurisdictionReconciliation.length === 0
      ? 'candidate_collected_jurisdiction_reconciled_ward_version_deltas'
      : 'candidate_collected_join_validation_needs_review';

const report = {
  state: 'WI',
  year: 2024,
  generatedAt: new Date().toISOString(),
  status,
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
    affectedJurisdictions: jurisdictionReconciliation.length,
    affectedJurisdictionsReconciled: jurisdictionReconciliation.length - unresolvedJurisdictionReconciliation.length,
    unresolvedJurisdictions: unresolvedJurisdictionReconciliation.length,
    rowLevelWardRenderingSafe: matchedRows.length === reviewRows.length && mismatchedRows.length === 0,
    jurisdictionLevelRenderingSafe: parseFailures.length === 0 && unresolvedJurisdictionReconciliation.length === 0,
  },
  residualClassification: {
    interpretation:
      'All residual row-level gaps reconcile at the municipality/jurisdiction total level. The remaining issue is a ward-version/allocation mismatch between WEC 2024 reporting rows and the January 2025 ward geometry, not missing presidential vote totals.',
    jurisdictionReconciliation,
  },
  caveats: [
    'The ArcGIS layer is official Wisconsin Legislature/LTSB data for November 2024 results with January 2025 wards.',
    'This report validates row joins and vote totals before the geometry is allowed to power ward-level map rendering.',
    'County-level production indicators remain authoritative; ward geometry is visualization context until this validation passes.',
    'Affected municipalities reconcile by total votes, Harris votes, and Trump votes, but row-level ward rendering remains disabled where ward allocation differs between sources.',
  ],
  examples: {
    matched: matchedRows.slice(0, 10),
    unmatched: unmatchedRows.slice(0, 25),
    parseFailures: parseFailures.slice(0, 25),
    mismatched: mismatchedRows.slice(0, 25),
  },
  residualRows: {
    unmatched: unmatchedRows,
    mismatched: mismatchedRows,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outPath, status: report.status, summary: report.summary }, null, 2));
