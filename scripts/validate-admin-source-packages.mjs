import { readFile } from "node:fs/promises";
import { stateCodes } from "./state-metadata.mjs";

const registry = JSON.parse(await readFile("data/admin-source-packages.json", "utf8"));
const validStatuses = new Set(["loaded", "partial", "candidate", "needs_data", "blocked", "documented_exclusion"]);
const errors = [];

if (!Array.isArray(registry.stateYearStatuses)) {
  errors.push("stateYearStatuses must be an array.");
}

const expected2024States = new Set(stateCodes());
const actual2024States = new Set(
  (registry.stateYearStatuses ?? [])
    .filter((entry) => Number(entry.electionYear) === 2024)
    .map((entry) => entry.state),
);

if (actual2024States.size !== expected2024States.size) {
  errors.push(`2024 admin source package registry must include all 50 states; found ${actual2024States.size}.`);
}

for (const state of expected2024States) {
  if (!actual2024States.has(state)) {
    errors.push(`Missing 2024 admin source package entry for ${state}.`);
  }
}

for (const entry of registry.stateYearStatuses ?? []) {
  if (!entry.state || !/^[A-Z]{2}$/.test(entry.state)) {
    errors.push(`Invalid state code: ${entry.state}`);
  }
  if (!Number.isInteger(entry.electionYear)) {
    errors.push(`${entry.state ?? "unknown"} electionYear must be an integer.`);
  }
  if (!validStatuses.has(entry.status)) {
    errors.push(`${entry.state} ${entry.electionYear} has invalid status ${entry.status}.`);
  }
  for (const family of ["equipment", "audit", "cvr", "incidents"]) {
    if (entry[family] && !validStatuses.has(entry[family].status)) {
      errors.push(`${entry.state} ${entry.electionYear} ${family} has invalid status ${entry[family].status}.`);
    }
  }
  if (entry.equipment?.status === "loaded") {
    for (const field of ["sourceDocumentId", "sourceUrl", "apiUrl", "localArtifact", "normalizedArtifact", "parser"]) {
      if (!entry.equipment[field]) {
        errors.push(`${entry.state} ${entry.electionYear} loaded equipment is missing ${field}.`);
      }
    }
  }
  if (Number(entry.electionYear) === 2024 && entry.equipment?.parser === "verifiedVotingEquipment") {
    for (const field of ["sourceDocumentId", "sourceUrl", "apiUrl", "localArtifact", "normalizedArtifact", "caveat"]) {
      if (!entry.equipment[field]) {
        errors.push(`${entry.state} ${entry.electionYear} VerifiedVoting equipment is missing ${field}.`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${registry.stateYearStatuses.length} admin source package entries.`);
}
