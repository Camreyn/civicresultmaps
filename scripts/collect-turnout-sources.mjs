import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repoRoot, "data", "turnout-source-packages.json");

function usage() {
  console.log("Usage: node scripts/collect-turnout-sources.mjs [--state XX] [--year 2024] [--download] [--force]");
}

function parseArgs(argv) {
  const args = { download: false, force: false, state: null, year: 2024 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--download") {
      args.download = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--state") {
      args.state = argv[++index]?.toUpperCase();
    } else if (arg === "--year") {
      args.year = Number(argv[++index]);
    } else if (arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readRegistry() {
  return JSON.parse(readFileSync(packagePath, "utf8"));
}

async function collectTurnoutSources(options) {
  const registry = readRegistry();
  const rows = registry.stateYearStatuses
    .filter((entry) => entry.year === options.year)
    .filter((entry) => !options.state || entry.state === options.state);
  const results = [];

  for (const row of rows) {
    const localFile = row.localFile?.trim();
    const absolutePath = localFile ? path.join(repoRoot, localFile) : "";
    const present = Boolean(localFile && existsSync(absolutePath));
    const item = {
      state: row.state,
      year: row.year,
      status: row.status,
      sourceUrl: row.sourceUrl,
      localFile,
      present,
      action: "verified",
    };

    if (!localFile) {
      results.push({ ...item, action: "needs_local_file" });
      continue;
    }

    if (present && !options.force) {
      results.push(item);
      continue;
    }

    if (!options.download) {
      results.push({ ...item, action: present ? "present_not_replaced" : "missing_download_not_requested" });
      continue;
    }

    const response = await fetch(row.sourceUrl);
    if (!response.ok) {
      throw new Error(`${row.state} download failed: ${response.status} ${response.statusText}`);
    }

    mkdirSync(path.dirname(absolutePath), { recursive: true });
    const payload = Buffer.from(await response.arrayBuffer());
    writeFileSync(absolutePath, payload);
    results.push({ ...item, action: present ? "replaced" : "downloaded", bytes: payload.byteLength, present: true });
  }

  return {
    checkedAt: new Date().toISOString(),
    download: options.download,
    force: options.force,
    results,
    state: options.state,
    year: options.year,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      usage();
      process.exit(0);
    }
    console.log(JSON.stringify(await collectTurnoutSources(args), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { collectTurnoutSources, parseArgs };
