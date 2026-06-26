import fs from "node:fs";
import path from "node:path";

const defaults = {
  registry: "data/electronic-integrity-artifacts.json",
  outDir: "data/electronic-integrity-request-packets",
  summaryOut: "data/electronic-integrity-request-plan.json",
  state: "all",
};

function parseArgs(argv) {
  const options = { ...defaults, dryRun: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--registry") options.registry = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--summary-out") options.summaryOut = argv[++index];
    else if (arg === "--state") options.state = argv[++index].toUpperCase();
    else if (arg === "--help") {
      console.log("Usage: node scripts/create-electronic-integrity-request-packets.mjs [--state WI|all] [--dry-run]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function artifactLabel(artifactTypes, type) {
  return artifactTypes.find((entry) => entry.type === type)?.label ?? type.replaceAll("_", " ");
}

function requestBody({ artifactTypes, electionYear, state, artifacts }) {
  const lines = artifacts.map((artifact) => {
    const label = artifactLabel(artifactTypes, artifact.type);
    const source = artifact.requestPath ? ` Suggested custodian/path: ${artifact.requestPath}` : "";
    return `- ${label}: status=${artifact.status}; grain=${artifact.granularity}; reconciliation=${artifact.reconciliationStatus}.${source}`;
  });

  return `# ${state.stateName} ${electionYear} Electronic Integrity Records Request\n\nThis request seeks machine-readable records that can reconcile electronic election-system output against official results, paper/audit evidence, and custody records. Existing advisory indicators are not allegations or proof of tampering.\n\nRequested evidence families:\n${lines.join("\n")}\n\nPreferred production format: original exports where available, CSV, XLSX, JSON, log bundles, audit workpapers, or record layouts/data dictionaries. Please preserve original filenames, timestamps, export settings, and field definitions.\n\nIf your office does not maintain a requested record, please identify the state, county, municipal, vendor, or other custodian most likely to maintain it. If fees are expected, please provide an estimate before processing.\n`;
}

const options = parseArgs(process.argv);
const registry = readJson(options.registry);
const selectedStates = registry.states.filter((state) => options.state === "all" || state.state === options.state);
const packets = [];

for (const state of selectedStates) {
  const artifacts = state.artifacts.filter((artifact) => artifact.requestRequired || artifact.status === "partial" || artifact.status === "blocked");
  if (!artifacts.length) continue;
  const fileName = `${slug(state.state)}-${registry.electionYear}-electronic-integrity-request.md`;
  const outputFile = `${options.outDir.replace(/\\/g, "/").replace(/\/$/, "")}/${fileName}`;
  packets.push({
    artifactTypes: artifacts.map((artifact) => artifact.type),
    outputFile,
    requestRequiredRows: artifacts.filter((artifact) => artifact.requestRequired).length,
    state: state.state,
    stateName: state.stateName,
    statuses: artifacts.reduce((counts, artifact) => {
      counts[artifact.status] = (counts[artifact.status] ?? 0) + 1;
      return counts;
    }, {}),
    body: requestBody({ artifactTypes: registry.artifactTypes, electionYear: registry.electionYear, state, artifacts }),
  });
}

const summary = {
  caveat: "Request packets track evidence collection only. Missing, partial, or blocked evidence does not prove tampering.",
  generatedAt: new Date().toISOString().slice(0, 10),
  registry: options.registry,
  outDir: options.outDir,
  state: options.state,
  dryRun: options.dryRun,
  packetCount: packets.length,
  requestRequiredRows: packets.reduce((sum, packet) => sum + packet.requestRequiredRows, 0),
  byState: packets.map(({ body, ...packet }) => packet),
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
