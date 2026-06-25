import fs from 'node:fs';
import path from 'node:path';

const defaults = {
  tracker: 'data/wi-2024-remaining-data-collection-tracker.json',
  outDir: '.etl/wi-records-requests',
  summaryOut: 'data/wi-2024-records-request-packet-summary.json',
  mode: 'all',
};

function parseArgs(argv) {
  const options = { ...defaults, dryRun: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--tracker') options.tracker = argv[++index];
    else if (arg === '--out-dir') options.outDir = argv[++index];
    else if (arg === '--summary-out') options.summaryOut = argv[++index];
    else if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--help') {
      console.log('Usage: node scripts/create-wi-records-request-packets.mjs [--dry-run] [--mode all|wec|county|municipal] [--out-dir <dir>]');
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

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function familyById(tracker) {
  return new Map(tracker.dataFamilies.map((family) => [family.id, family]));
}

function requestBody({ tracker, target, families }) {
  const familyLines = families.map((family) => {
    const fields = family.targetFields.join(', ');
    return `- ${family.label}: please provide records for the ${tracker.electionYear} November General Election at ${family.targetGrain} grain where available. Target fields for machine-readable production are: ${fields}.`;
  });

  const custodyNote = target.targetType === 'state_agency'
    ? 'If WEC does not maintain one or more requested records centrally, please identify the custodian or local jurisdiction that maintains them.'
    : 'If your office does not maintain one or more requested records, please identify the municipal or state custodian most likely to maintain them.';

  return `# Wisconsin ${tracker.electionYear} Remaining Election Data Request\n\nTarget: ${target.name}\nJurisdiction: ${target.jurisdiction}\n\nThis request seeks machine-readable records needed to reconcile and explain Wisconsin ${tracker.electionYear} election review context. Existing county-level production flags remain advisory and are not being treated as proof of misconduct.\n\nRequested records:\n${familyLines.join('\n')}\n\nPreferred format: CSV, XLSX, JSON, GeoJSON, shapefile ZIP, or original exported audit/CVR files where available. Please include record layouts, field definitions, and source timestamps when available.\n\n${custodyNote}\n\nPlease preserve original filenames and export metadata where practical. If fees are expected, please provide an estimate before processing.\n`;
}

function shouldIncludeTarget(target, mode) {
  if (mode === 'all') return true;
  if (mode === 'wec') return target.targetType === 'state_agency';
  if (mode === 'county') return target.targetType === 'county_clerk';
  if (mode === 'municipal') return false;
  throw new Error(`Unknown mode: ${mode}`);
}

const options = parseArgs(process.argv);
const tracker = readJson(options.tracker);
const families = familyById(tracker);
const packets = [];

for (const target of tracker.targets.filter((candidate) => shouldIncludeTarget(candidate, options.mode))) {
  const familyIds = Object.entries(target.families ?? {})
    .filter(([, status]) => status.collectionStatus !== 'loaded')
    .map(([familyId]) => familyId);
  const selectedFamilies = familyIds.map((familyId) => families.get(familyId)).filter(Boolean);
  if (!selectedFamilies.length) continue;

  const fileName = target.targetType === 'state_agency'
    ? 'wec-statewide-remaining-data-request.md'
    : `${slug(target.county ?? target.name)}-remaining-data-request.md`;
  packets.push({
    targetId: target.id,
    targetType: target.targetType,
    targetName: target.name,
    county: target.county ?? '',
    familyIds,
    outputFile: path.join(options.outDir, fileName),
    body: requestBody({ tracker, target, families: selectedFamilies }),
  });
}

const municipalTemplate = tracker.requestTemplates.find((template) => template.id === 'municipal-audit-submission');
if ((options.mode === 'all' || options.mode === 'municipal') && municipalTemplate) {
  const selectedFamilies = municipalTemplate.families.map((familyId) => families.get(familyId)).filter(Boolean);
  packets.push({
    targetId: 'WI-MUNICIPAL-AUDIT-TEMPLATE',
    targetType: 'municipal_clerk',
    targetName: municipalTemplate.targetName,
    county: '',
    familyIds: municipalTemplate.families,
    outputFile: path.join(options.outDir, municipalTemplate.outputFile),
    body: requestBody({
      tracker,
      target: { name: municipalTemplate.targetName, jurisdiction: 'selected WEC Appendix B municipality', targetType: 'municipal_clerk' },
      families: selectedFamilies,
    }),
  });
}

const summary = {
  state: tracker.state,
  electionYear: tracker.electionYear,
  generatedAt: new Date().toISOString().slice(0, 10),
  tracker: options.tracker,
  outDir: options.outDir,
  mode: options.mode,
  dryRun: options.dryRun,
  packetCount: packets.length,
  byTargetType: packets.reduce((counts, packet) => {
    counts[packet.targetType] = (counts[packet.targetType] ?? 0) + 1;
    return counts;
  }, {}),
  requiredFamilies: tracker.dataFamilies.map((family) => family.id),
  packets: packets.map(({ body, ...packet }) => packet),
};

if (!options.dryRun) {
  fs.mkdirSync(options.outDir, { recursive: true });
  for (const packet of packets) {
    fs.writeFileSync(packet.outputFile, packet.body);
  }
  fs.mkdirSync(path.dirname(options.summaryOut), { recursive: true });
  fs.writeFileSync(options.summaryOut, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
