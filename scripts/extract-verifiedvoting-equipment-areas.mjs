import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stateCodes } from "./state-metadata.mjs";

const registryPath = "data/admin-source-packages.json";

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
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

async function extractState(entry, state, year) {
  if (!entry?.equipment?.localArtifact) {
    throw new Error(`No Verified Voting equipment artifact registered for ${state} ${year}.`);
  }

  const payload = JSON.parse(await readFile(entry.equipment.localArtifact, "utf8"));
  const area =
    typeof payload.area === "string"
      ? JSON.parse(payload.area)
      : payload.area && typeof payload.area === "object"
        ? payload.area
        : null;

  if (!area || area.type !== "FeatureCollection" || !Array.isArray(area.features)) {
    throw new Error(`No Verifier area FeatureCollection found in ${entry.equipment.localArtifact}.`);
  }

  const outputPath = `data/verifiedvoting-${state.toLowerCase()}-${year}-equipment-areas.geojson`;
  const enriched = {
    ...area,
    features: area.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        sourceDocumentId: entry.equipment.sourceDocumentId,
        sourceUrl: entry.equipment.sourceUrl,
      },
    })),
    properties: {
      electionYear: year,
      source: "Verified Voting Verifier area geometry",
      sourceDocumentId: entry.equipment.sourceDocumentId,
      sourceUrl: entry.equipment.sourceUrl,
      state,
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(enriched)}\n`);
  console.log(`Wrote ${enriched.features.length} Verifier area features to ${outputPath}`);
}

async function main() {
  const year = yearToProcess();
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entries = new Map(
    registry.stateYearStatuses
      .filter((item) => Number(item.electionYear) === year)
      .map((item) => [item.state, item]),
  );

  for (const state of statesToProcess()) {
    await extractState(entries.get(state), state, year);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
