import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stateCodes } from "./state-metadata.mjs";

const registryPath = "data/admin-source-packages.json";

function argValue(name, fallback, positionalIndex) {
  const index = process.argv.indexOf(name);
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  const envValue = process.env[envKey] && process.env[envKey] !== "true" ? process.env[envKey] : undefined;
  return index === -1
    ? envValue ?? process.argv[2 + positionalIndex] ?? fallback
    : process.argv[index + 1];
}

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
}

function usage() {
  console.log("Usage: node scripts/collect-equipment-sources.mjs [--state WI|--all] [--year 2024] [--download] [--force]");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function statesToProcess() {
  if (hasFlag("--all")) {
    return stateCodes();
  }

  const stateIndex = process.argv.indexOf("--state");
  const envState = process.env.npm_config_state && process.env.npm_config_state !== "true" ? process.env.npm_config_state : "";
  const explicit = stateIndex === -1 ? envState : process.argv[stateIndex + 1];
  const positional = process.argv
    .slice(2)
    .flatMap((value) => value.split(/[,\s]+/))
    .filter((value) => /^[A-Za-z]{2}$/.test(value))
    .join(",");

  return String(explicit || positional || "WI")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
}

function yearToProcess() {
  const yearIndex = process.argv.indexOf("--year");
  const envYear = process.env.npm_config_year && process.env.npm_config_year !== "true" ? process.env.npm_config_year : "";
  const positional = process.argv.slice(2).find((value) => /^\d{4}$/.test(value));
  return Number(yearIndex === -1 ? envYear || positional || "2024" : process.argv[yearIndex + 1]);
}

async function collectEntry(entry, state, year, shouldDownload, force) {
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

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  const year = yearToProcess();
  const shouldDownload = hasFlag("--download");
  const force = hasFlag("--force");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entries = new Map(
    registry.stateYearStatuses
      .filter((item) => Number(item.electionYear) === year)
      .map((item) => [item.state, item]),
  );

  for (const state of statesToProcess()) {
    await collectEntry(entries.get(state), state, year, shouldDownload, force);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
