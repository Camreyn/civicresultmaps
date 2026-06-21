import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const registryPath = "data/admin-source-packages.json";

function argValue(name, fallback, positionalIndex) {
  const index = process.argv.indexOf(name);
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return index === -1
    ? process.env[envKey] ?? process.argv[2 + positionalIndex] ?? fallback
    : process.argv[index + 1];
}

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
}

function usage() {
  console.log("Usage: node scripts/collect-equipment-sources.mjs [--state WI] [--year 2024] [--download] [--force]");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  const state = String(argValue("--state", "WI", 0)).toUpperCase();
  const year = Number(argValue("--year", "2024", 1));
  const shouldDownload = hasFlag("--download");
  const force = hasFlag("--force");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entry = registry.stateYearStatuses.find(
    (item) => item.state === state && Number(item.electionYear) === year,
  );

  if (!entry?.equipment?.apiUrl) {
    throw new Error(`No equipment API source is registered for ${state} ${year}.`);
  }

  const artifactPath = entry.equipment.localArtifact;
  const artifactExists = await exists(artifactPath);

  if (artifactExists && !force) {
    console.log(`${artifactPath} already exists. Use --force to replace it.`);
    return;
  }

  if (!shouldDownload) {
    console.log(`${artifactPath} ${artifactExists ? "exists" : "is missing"}. Add --download to fetch it.`);
    return;
  }

  const response = await fetch(entry.equipment.apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${entry.equipment.apiUrl}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  JSON.parse(text);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  console.log(`Wrote ${artifactPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
