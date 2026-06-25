import fs from 'node:fs';
import path from 'node:path';

const auditSummaryPath = 'data/wi-2024-audit-summary.json';
const turnoutPackagePath = 'data/wi-2024-turnout-source-package.json';
const adminContextPath = 'data/wi-2024-admin-context-sources.json';
const cvrPath = 'data/wi-2024-cvr-availability.csv';
const collectionTrackerPath = 'data/wi-2024-remaining-data-collection-tracker.json';
const publicSourceInventoryPath = 'data/wi-2024-public-source-inventory.json';
const requestPacketSummaryPath = 'data/wi-2024-records-request-packet-summary.json';
const outPath = 'data/wi-2024-remaining-data-status.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeCountyName(value) {
  return String(value ?? '').replace(/\s+County\s+County$/i, ' County').trim();
}

function normalizeCvrInventory() {
  const text = fs.readFileSync(cvrPath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const header = splitCsvLine(headerLine);
  const rows = lines.filter(Boolean).map((line) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(header.map((column, index) => [column, cells[index] ?? '']));
    if ('jurisdiction_name' in row) {
      row.jurisdiction_name = normalizeCountyName(row.jurisdiction_name);
    }
    if ('county' in row) {
      row.county = normalizeCountyName(row.county);
    }
    return row;
  });
  const output = [header.join(','), ...rows.map((row) => header.map((column) => csvEscape(row[column])).join(','))].join('\n') + '\n';
  fs.writeFileSync(cvrPath, output);
  return rows;
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = row[field] || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

const audit = readJson(auditSummaryPath);
const turnout = readJson(turnoutPackagePath);
const admin = readJson(adminContextPath);
const tracker = readJsonIfExists(collectionTrackerPath);
const publicSourceInventory = readJsonIfExists(publicSourceInventoryPath);
const requestPacketSummary = readJsonIfExists(requestPacketSummaryPath);
const cvrRows = normalizeCvrInventory();
const partialWardSources = turnout.sourceArtifacts.filter((artifact) => artifact.reportingLevel === 'ward');
const collectionTargets = tracker?.targets ?? [];
const collectionFamilies = tracker?.dataFamilies ?? [];

const report = {
  state: 'WI',
  stateName: 'Wisconsin',
  electionYear: 2024,
  generatedAt: new Date().toISOString().slice(0, 10),
  purpose:
    'Track the remaining Wisconsin data items after county, city, and rest-of-county advisory indicators were completed. This report distinguishes loaded context from data that is still not published or not yet collected statewide.',
  summary: {
    status: 'remaining_items_documented_with_available_context_loaded',
    countyFlagsRemainAuthoritative: true,
    advisorySplitScopesRemainAdditionalContext: true,
    noRemainingItemIsCurrentlyUsedAsAFlagInput: true,
    collectionTrackerTargets: collectionTargets.length,
    collectionTrackerFamilies: collectionFamilies.length,
    publicSourceCandidateCount: publicSourceInventory?.summary?.sourceCandidateCount ?? 0,
    requestPacketCount: requestPacketSummary?.packetCount ?? 0,
  },
  collectionPlan: {
    trackerArtifact: collectionTrackerPath,
    publicSourceInventoryArtifact: publicSourceInventoryPath,
    requestPacketSummaryArtifact: requestPacketSummaryPath,
    strategy: tracker?.strategy ?? 'public_downloads_first_then_public_records_requests',
    targetCount: collectionTargets.length,
    countyTargetCount: collectionTargets.filter((target) => target.targetType === 'county_clerk').length,
    stateAgencyTargetCount: collectionTargets.filter((target) => target.targetType === 'state_agency').length,
    dataFamilies: collectionFamilies.map((family) => ({
      id: family.id,
      label: family.label,
      currentStatus: family.currentStatus,
      flagPolicy: family.flagPolicy,
      targetGrain: family.targetGrain,
    })),
    publicSourceCandidates: publicSourceInventory?.sources?.map((source) => ({
      id: source.id,
      families: source.families,
      status: source.status,
      sourceUrl: source.sourceUrl,
      probe: source.probe,
    })) ?? [],
    requestPacketSummary: requestPacketSummary
      ? {
          packetCount: requestPacketSummary.packetCount,
          byTargetType: requestPacketSummary.byTargetType,
          requiredFamilies: requestPacketSummary.requiredFamilies,
          examplePackets: [
            ...(requestPacketSummary.packets ?? []).filter((packet) => packet.targetType === 'state_agency').slice(0, 1),
            ...(requestPacketSummary.packets ?? []).filter((packet) => packet.targetType === 'county_clerk').slice(0, 3),
            ...(requestPacketSummary.packets ?? []).filter((packet) => packet.targetType === 'municipal_clerk').slice(0, 1),
          ],
        }
      : null,
  },
  remainingItems: {
    wardRegisteredVoterDenominators: {
      status: 'statewide_not_found_public',
      implementedContext:
        'Official EAC 2024 EAVS V2 local-jurisdiction registered-voter fallback is loaded. Partial local ward denominator artifacts are cataloged for Milwaukee, Jefferson, and Oneida, but are not statewide coverage.',
      primaryFallback: turnout.officialStatewideDenominatorSource,
      partialWardSources: partialWardSources.map((artifact) => ({
        authority: artifact.authority,
        county: artifact.county,
        denominatorTiming: artifact.denominatorTiming,
        normalizedRows: artifact.normalizedRows,
        rowCount: artifact.rowCount,
        sourceTitle: artifact.sourceTitle,
        sourceUrl: artifact.sourceUrl,
        warningRequired: artifact.warningRequired,
      })),
      flagInputStatus: 'not_used_as_flag_input',
      nextAction:
        'If a statewide official WEC ward-level registered-voter file becomes available, normalize it by county, municipality, and ward and replace the EAC fallback only after reconciliation tests pass.',
    },
    perAuditUnitOutcomes: {
      status: audit.aggregateAuditResults?.perUnitOutcomeStatus ?? 'not_published_in_final_report',
      implementedContext:
        'WEC selected reporting units, equipment, audited ballot totals, statewide findings, and aggregate error-rate discussion are loaded. The final report does not publish a per-reporting-unit discrepancy outcome table.',
      aggregateAuditResults: audit.aggregateAuditResults,
      selectedReportingUnits: audit.selectedReportingUnits,
      selectedMunicipalities: audit.selectedMunicipalities,
      countiesCovered: audit.countiesCovered,
      normalizedSelections: audit.normalizedSelections,
      sourcePdfUrl: audit.sourcePdfUrl,
      flagInputStatus: 'context_only_not_clearance_or_confirmation',
      nextAction: admin.audit.nextAction,
    },
    municipalWardGeometry: {
      status: 'not_loaded',
      implementedContext:
        'The app currently renders Wisconsin county geometry. County, city, and rest-of-county advisory scopes are tabular review scopes, not mapped ward polygons.',
      currentGeometry: 'county_geometry_only',
      flagInputStatus: 'not_used_as_flag_input',
      nextAction:
        'Find an official statewide municipal ward boundary dataset matching the 2024 election wards, normalize it to WEC county/municipality/ward keys, and add geometry join tests before enabling ward-level map rendering.',
    },
    rowLevelBallotMode: {
      status: 'not_available_from_wec_ward_workbook',
      implementedContext:
        'EAC vote-method rows are loaded as denominator/context data only. The WEC ward results workbook does not provide ward-level absentee, early, Election Day, provisional, or CVR-style ballot-mode rows for the current flag policy.',
      cvrAvailabilityInventory: {
        localArtifact: admin.cvr.localArtifact,
        statusCounts: countBy(cvrRows, 'availability_status'),
        rowCount: cvrRows.length,
        badCountyCountyNames: cvrRows.filter((row) => /County County$/i.test(row.jurisdiction_name ?? row.county ?? '')).length,
      },
      flagInputStatus: 'not_used_as_flag_input',
      nextAction: admin.cvr.nextAction,
    },
  },
  sourceStatusNotes: [
    'County-level production flag counts should not change from this report alone.',
    'Audit aggregate findings are explanatory context; the WEC report does not provide per-unit discrepancy outcomes.',
    'Turnout and ballot-mode context remains separate from advisory flag calculations unless row-level data exists at the same review grain.',
    'Municipal/ward geometry remains a future visualization enhancement, not a blocker for current tabular Wisconsin flags.',
  ],
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outPath, cvrRows: cvrRows.length, partialWardSources: partialWardSources.length }, null, 2));
