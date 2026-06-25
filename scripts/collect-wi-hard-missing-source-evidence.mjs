import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const defaults = {
  out: 'data/wi-2024-hard-missing-source-evidence.json',
  timeoutMs: 15000,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index];
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help') {
      console.log('Usage: node scripts/collect-wi-hard-missing-source-evidence.mjs [--out <json>] [--timeout-ms <ms>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CivicResultMaps Wisconsin hard-missing source probe' },
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') ?? '',
      contentLength: response.headers.get('content-length') ?? '',
      json,
      textSample: text.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url, timeoutMs) {
  const result = await fetchJson(url, timeoutMs);
  return {
    url,
    ok: result.ok,
    status: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    contentLength: result.contentLength,
    error: result.error,
    blockedByCloudflare: /Just a moment|Cloudflare|cf-browser-verification|challenge-platform/i.test(result.textSample ?? ''),
  };
}

async function arcgisSearch(query, timeoutMs) {
  const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(query)}&f=json&num=20`;
  const result = await fetchJson(url, timeoutMs);
  const rows = (result.json?.results ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    owner: item.owner,
    type: item.type,
    url: item.url ?? '',
    snippet: item.snippet ?? '',
    tags: item.tags ?? [],
  }));
  return {
    query,
    url,
    ok: result.ok,
    status: result.status,
    resultCount: rows.length,
    results: rows,
  };
}

function classifyArcgisResults(searches) {
  const relevantTerms = /(2024|election|ward|registered|voter|audit|cvr|cast vote|crosswalk|jan2025|january 2025)/i;
  const officialOwners = /^(WI_Legislature|WEC|Wisconsin|WI_)/i;
  const flattened = searches.flatMap((search) => search.results.map((result) => ({ ...result, query: search.query })));
  return flattened
    .filter((result) => relevantTerms.test(`${result.title} ${result.snippet} ${result.tags.join(' ')} ${result.url}`))
    .map((result) => {
      const text = `${result.title} ${result.snippet} ${result.tags.join(' ')} ${result.url}`;
      return {
        ...result,
        officialOwnerLikely: officialOwners.test(result.owner),
        hardMissingFamiliesSuggested: {
          wardRegisteredVoterDenominators: /registered|voter/i.test(text),
          rowLevelBallotMode: /cvr|cast vote|absentee|early|mode|method/i.test(text),
          perAuditUnitOutcomes: /audit|discrepanc/i.test(text),
          wardGeometryCrosswalk: /crosswalk|xref|relationship|conversion|old ward|previous ward/i.test(text),
        },
      };
    });
}

async function inspectArcgisLayer(url, timeoutMs) {
  const result = await fetchJson(`${url}?f=json`, timeoutMs);
  const fields = (result.json?.fields ?? []).map((field) => ({ name: field.name, type: field.type, alias: field.alias ?? '' }));
  const fieldText = fields.map((field) => `${field.name} ${field.alias}`).join(' ');
  return {
    url,
    ok: result.ok,
    status: result.status,
    name: result.json?.name ?? '',
    geometryType: result.json?.geometryType ?? '',
    featureCount: result.json?.count ?? null,
    fieldCount: fields.length,
    fields,
    hasRegisteredVoterFields: /reg|registered|voter/i.test(fieldText),
    hasBallotModeFields: /absentee|early|election.?day|provisional|vote.?mode|vote.?method|ballot.?mode|ballot.?method|cvr|cast vote record/i.test(fieldText),
    hasAuditOutcomeFields: /audit|discrep|hand|machine/i.test(fieldText),
    hasWardCrosswalkFields: /crosswalk|xref|relationship|conversion|old|previous/i.test(fieldText),
  };
}

function inspectWorkbookHeaders(file) {
  const workbook = XLSX.readFile(file, { sheetRows: 15 });
  const sheetSummaries = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const nonEmptyRows = rows
      .map((row, index) => ({ rowNumber: index + 1, values: row.filter((value) => String(value).trim() !== '') }))
      .filter((row) => row.values.length > 0)
      .slice(0, 8);
    const sampledText = nonEmptyRows.flatMap((row) => row.values).join(' ');
    return {
      sheetName,
      nonEmptyRows,
      hasRegisteredVoterFields: /\bregistered\b|\bregistered voters?\b|\bvoters?\b/i.test(sampledText),
      hasBallotModeFields: /absentee|early|election.?day|provisional|vote.?mode|vote.?method|ballot.?mode|ballot.?method|cvr|cast vote record/i.test(sampledText),
      hasAuditOutcomeFields: /audit|discrep|hand count|machine total|machine_total/i.test(sampledText),
      sampledText,
    };
  });
  const sampledWorkbookText = sheetSummaries.map((sheet) => sheet.sampledText).join(' ');
  return {
    file,
    sheetCount: workbook.SheetNames.length,
    sampledRowsPerSheet: 15,
    hasRegisteredVoterFields: /\bregistered\b|\bregistered voters?\b|\bvoters?\b/i.test(sampledWorkbookText),
    hasBallotModeFields: /absentee|early|election.?day|provisional|vote.?mode|vote.?method|ballot.?mode|ballot.?method|cvr|cast vote record/i.test(sampledWorkbookText),
    hasAuditOutcomeFields: /audit|discrep|hand count|machine total|machine_total/i.test(sampledWorkbookText),
    sheetSummaries: sheetSummaries.slice(0, 12).map(({ sampledText, ...summary }) => summary),
  };
}

function familyConclusion({ family, publicEvidence, requestPath }) {
  return {
    family,
    publicCollectionStatus: publicEvidence.length > 0 ? 'candidate_public_sources_found_needs_manual_review' : 'no_public_machine_readable_statewide_source_found',
    publicEvidence,
    requestRequired: publicEvidence.length === 0,
    requestPath,
  };
}

const options = parseArgs(process.argv);

const officialUrlProbes = await Promise.all([
  'https://elections.wi.gov/elections/election-results/2024/november-5-general-election',
  'https://elections.wi.gov/about/records-request',
  'https://elections.wi.gov/resources/reports/2024-post-election-voting-equipment-audit-report',
  'https://elections.wi.gov/sites/default/files/documents/Ward%20by%20Ward%20Report%20by%20Congressional%20District_November%205%202024%20General%20Election_Federal%20and%20State%20Contests.xlsx',
].map((url) => probeUrl(url, options.timeoutMs)));

const arcgisQueries = [
  'Wisconsin 2024 registered voters ward',
  'Wisconsin 2024 CVR cast vote record',
  'Wisconsin 2024 audit reporting unit discrepancy',
  'Wisconsin ward crosswalk 2024 2025',
  'Wisconsin 2024 election data wards registration absentee',
  'November_2024_Election_Data_with_Jan2025_Wards',
];
const arcgisSearches = [];
for (const query of arcgisQueries) {
  arcgisSearches.push(await arcgisSearch(query, options.timeoutMs));
}

const wiLegislatureElectionLayer = await inspectArcgisLayer(
  'https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2024_Election_Data_with_2025_Wards/FeatureServer/0',
  options.timeoutMs,
);
const wecWardWorkbook = inspectWorkbookHeaders('data/wi-2024-ward-by-ward-federal-state.xlsx');

const relevantArcgisResults = classifyArcgisResults(arcgisSearches);
const officialCandidateTitles = new Set(relevantArcgisResults.filter((result) => result.officialOwnerLikely).map((result) => result.title));
const geometryLayerFieldEvidence = {
  source: wiLegislatureElectionLayer.url,
  title: wiLegislatureElectionLayer.name,
  fieldsChecked: wiLegislatureElectionLayer.fieldCount,
  hasRegisteredVoterFields: wiLegislatureElectionLayer.hasRegisteredVoterFields,
  hasBallotModeFields: wiLegislatureElectionLayer.hasBallotModeFields,
  hasAuditOutcomeFields: wiLegislatureElectionLayer.hasAuditOutcomeFields,
  hasWardCrosswalkFields: wiLegislatureElectionLayer.hasWardCrosswalkFields,
};
const wecWardWorkbookEvidence = {
  file: wecWardWorkbook.file,
  sheetCount: wecWardWorkbook.sheetCount,
  sampledRowsPerSheet: wecWardWorkbook.sampledRowsPerSheet,
  hasRegisteredVoterFields: wecWardWorkbook.hasRegisteredVoterFields,
  hasBallotModeFields: wecWardWorkbook.hasBallotModeFields,
  hasAuditOutcomeFields: wecWardWorkbook.hasAuditOutcomeFields,
};

const conclusions = {
  wardRegisteredVoterDenominators: familyConclusion({
    family: 'wardRegisteredVoterDenominators',
    publicEvidence: relevantArcgisResults.filter((result) => result.hardMissingFamiliesSuggested.wardRegisteredVoterDenominators),
    requestPath: 'Wisconsin Elections Commission first; county or municipal clerks if WEC identifies local custody.',
  }),
  rowLevelBallotMode: familyConclusion({
    family: 'rowLevelBallotMode',
    publicEvidence: relevantArcgisResults.filter((result) => result.hardMissingFamiliesSuggested.rowLevelBallotMode),
    requestPath: 'WEC/county CVR or ballot-mode records request path; keep EAC vote-method rows as context only.',
  }),
  perAuditUnitOutcomes: familyConclusion({
    family: 'perAuditUnitOutcomes',
    publicEvidence: relevantArcgisResults.filter((result) => result.hardMissingFamiliesSuggested.perAuditUnitOutcomes),
    requestPath: 'WEC first for submitted local audit materials; selected municipal clerks if WEC does not hold per-unit outcome submissions.',
  }),
  wardGeometryCrosswalk: familyConclusion({
    family: 'wardGeometryCrosswalk',
    publicEvidence: relevantArcgisResults.filter((result) => result.hardMissingFamiliesSuggested.wardGeometryCrosswalk),
    requestPath: 'Wisconsin Legislature/LTSB or WEC for a 2024 reporting-ward to January 2025 ward crosswalk.',
  }),
};

const report = {
  state: 'WI',
  electionYear: 2024,
  generatedAt: new Date().toISOString(),
  purpose: 'Collect reproducible public-source evidence for Wisconsin hard-missing items: ward registered-voter denominators, row-level ballot mode/CVR, per-audit-unit outcomes, and exact ward crosswalk needs.',
  searchedFamilies: Object.keys(conclusions),
  summary: {
    officialUrlProbeCount: officialUrlProbes.length,
    officialUrlsReachable: officialUrlProbes.filter((probe) => probe.ok).length,
    officialUrlsBlockedByCloudflare: officialUrlProbes.filter((probe) => probe.blockedByCloudflare).length,
    arcgisQueryCount: arcgisSearches.length,
    relevantArcgisResultCount: relevantArcgisResults.length,
    officialCandidateTitles: [...officialCandidateTitles].sort(),
    wiLegislatureGeometryLayerFieldsChecked: wiLegislatureElectionLayer.fieldCount,
    wecWardWorkbookSheetCount: wecWardWorkbook.sheetCount,
    wecWardWorkbookProvidesHardMissingFields:
      wecWardWorkbook.hasRegisteredVoterFields ||
      wecWardWorkbook.hasBallotModeFields ||
      wecWardWorkbook.hasAuditOutcomeFields,
    geometryLayerProvidesHardMissingFields:
      wiLegislatureElectionLayer.hasRegisteredVoterFields ||
      wiLegislatureElectionLayer.hasBallotModeFields ||
      wiLegislatureElectionLayer.hasAuditOutcomeFields ||
      wiLegislatureElectionLayer.hasWardCrosswalkFields,
    familiesStillRequireRecordsRequests: Object.values(conclusions)
      .filter((conclusion) => conclusion.requestRequired)
      .map((conclusion) => conclusion.family),
  },
  officialUrlProbes,
  arcgisSearches,
  relevantArcgisResults,
  geometryLayerFieldEvidence,
  wecWardWorkbookEvidence,
  conclusions,
  nextAction:
    'No public statewide machine-readable hard-missing source was confirmed by this probe. Submit or track records requests for families marked no_public_machine_readable_statewide_source_found; do not use EAC/context rows as flag inputs.',
};

fs.mkdirSync(path.dirname(options.out), { recursive: true });
fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: options.out, summary: report.summary }, null, 2));
