import fs from 'node:fs';
import path from 'node:path';

const defaults = {
  tracker: 'data/wi-2024-remaining-data-collection-tracker.json',
  out: 'data/wi-2024-public-source-inventory.json',
  timeoutMs: 12000,
};

function parseArgs(argv) {
  const options = { ...defaults, probe: false, updateTracker: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--probe') options.probe = true;
    else if (arg === '--update-tracker') options.updateTracker = true;
    else if (arg === '--tracker') options.tracker = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help') {
      console.log('Usage: node scripts/collect-wi-public-source-inventory.mjs [--probe] [--update-tracker] [--tracker <json>] [--out <json>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function probeUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'CivicResultMaps Wisconsin source inventory' },
    });
    return {
      checked: true,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') ?? '',
      contentLength: response.headers.get('content-length') ?? '',
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      status: null,
      finalUrl: url,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function familyStatuses(tracker) {
  return Object.fromEntries(
    tracker.dataFamilies.map((family) => {
      const targetRows = tracker.targets.map((target) => target.families?.[family.id]).filter(Boolean);
      const statusCounts = targetRows.reduce((counts, row) => {
        const status = row.collectionStatus || 'unknown';
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {});
      return [family.id, { label: family.label, statusCounts, targetFields: family.targetFields, flagPolicy: family.flagPolicy }];
    }),
  );
}

function sourceRecommendation(source) {
  if (source.status === 'loaded_partial_context' || source.status === 'loaded_fallback_context') {
    return 'Keep as context; do not mark remaining family complete from this source alone.';
  }
  if (source.status === 'request_path') {
    return 'Use this as the official request path for records not posted as public downloads.';
  }
  return 'Probe or manually inspect this candidate before creating new local-source rows.';
}

const options = parseArgs(process.argv);
const tracker = readJson(options.tracker);
const sourceRows = [];

for (const source of tracker.publicSourceCandidates) {
  const probe = options.probe ? await probeUrl(source.sourceUrl, options.timeoutMs) : { checked: false, ok: null, status: null };
  sourceRows.push({
    ...source,
    probe,
    recommendation: sourceRecommendation(source),
  });
}

const report = {
  state: tracker.state,
  stateName: tracker.stateName,
  electionYear: tracker.electionYear,
  generatedAt: new Date().toISOString().slice(0, 10),
  probeEnabled: options.probe,
  tracker: options.tracker,
  summary: {
    sourceCandidateCount: sourceRows.length,
    requestPathCount: sourceRows.filter((row) => row.status === 'request_path').length,
    loadedContextCount: sourceRows.filter((row) => row.status.startsWith('loaded_')).length,
    familyStatuses: familyStatuses(tracker),
  },
  sources: sourceRows,
  nextAction:
    'Inspect any reachable public candidates first, then generate records request packets for families that remain missing or partial.',
};

fs.mkdirSync(path.dirname(options.out), { recursive: true });
fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);

if (options.updateTracker) {
  tracker.lastPublicSourceInventory = {
    generatedAt: report.generatedAt,
    artifact: options.out,
    probeEnabled: options.probe,
    sourceCandidateCount: sourceRows.length,
  };
  fs.writeFileSync(options.tracker, `${JSON.stringify(tracker, null, 2)}\n`);
}

console.log(JSON.stringify({ output: options.out, sourceCandidateCount: sourceRows.length, probeEnabled: options.probe }, null, 2));
