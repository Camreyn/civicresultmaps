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

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizedCode(state, rawCode, name) {
  if (rawCode) {
    return `${state}-${String(rawCode).padStart(3, "0")}`;
  }

  return `${state}-${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function systemText(code, popoverCodes) {
  if (!code) {
    return "";
  }

  const key = String(code).toUpperCase();
  return popoverCodes?.[key]?.text ?? key;
}

function paperRecord(code, popoverCodes) {
  const text = systemText(code, popoverCodes).toLowerCase();
  if (text.includes("paper")) {
    return text.includes("hand marked") ? "hand_marked_paper" : "paper_record";
  }

  if (text.includes("vvpat")) {
    return "vvpat";
  }

  return "not_recorded";
}

function primarySystemName(code) {
  const value = String(code ?? "").trim();
  return value.replace(/BMDBREAK/g, " + ").replace(/\s+/g, " ").trim();
}

function rowFromCode(state, year, code, sourceDocumentId, sourceUrl, caveat, popoverCodes) {
  const vendor = String(code.make ?? "").trim();
  const systemName = primarySystemName(code.bmd_makemodel || code.bmd_makemodel2 || code.make || code.pp_system);
  const countyName = String(code.name ?? "").trim();
  return {
    absenteeSystem: systemText(code.abs_system, popoverCodes),
    accessibleSystem: systemText(code.pp_acc_system, popoverCodes),
    caveat,
    electionYear: year,
    equipmentType: code.tabulation || "Election administration equipment context",
    jurisdictionCode: normalizedCode(state, code.county_fips, countyName),
    jurisdictionName: countyName,
    level: String(code.jurisdiction_type ?? "County").toLowerCase(),
    paperRecord: paperRecord(code.pp_system, popoverCodes),
    pollingPlaces: code.current_count_polling_places ?? "",
    pollBookSystem: code.epb_system ?? "",
    precincts: code.current_precincts ?? "",
    registeredVoters: code.current_reg_voters ?? "",
    sourceDocumentId,
    sourceUrl,
    standardSystem: systemText(code.pp_system, popoverCodes),
    state,
    systemName,
    tabulation: code.tabulation ?? "",
    usage: "county_context",
    vendor,
  };
}

async function normalizeEntry(registry, entry, state, year, force) {
  if (!entry?.equipment?.localArtifact || !entry.equipment.normalizedArtifact) {
    throw new Error(`No equipment artifact registration found for ${state} ${year}.`);
  }

  const outputPath = entry.equipment.normalizedArtifact;
  if ((await exists(outputPath)) && !force) {
    console.log(`${outputPath} already exists. Use --force to replace it.`);
    return;
  }

  const payload = JSON.parse(await readFile(entry.equipment.localArtifact, "utf8"));
  const codeValues = Array.isArray(payload.codes) ? payload.codes : Object.values(payload.codes ?? {});
  const rows = codeValues
    .filter(
      (code) =>
        String(code.state ?? "").toUpperCase() === state &&
        (code.county_fips || String(code.jurisdiction_type ?? "").toLowerCase() === "state"),
    )
    .map((code) =>
      rowFromCode(
        state,
        year,
        code,
        entry.equipment.sourceDocumentId,
        entry.equipment.sourceUrl,
        entry.equipment.caveat,
        payload.popover_codes,
      ),
    )
    .sort((a, b) => a.jurisdictionName.localeCompare(b.jurisdictionName));

  if (entry.equipment.expectedJurisdictions && rows.length !== entry.equipment.expectedJurisdictions) {
    throw new Error(`Expected ${entry.equipment.expectedJurisdictions} jurisdictions, normalized ${rows.length}.`);
  }

  const headers = registry.normalizedEquipmentContract.requiredColumns;
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${csv}\n`);
  console.log(`Wrote ${rows.length} equipment rows to ${outputPath}`);
}

async function main() {
  const year = yearToProcess();
  const force = hasFlag("--force");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entries = new Map(
    registry.stateYearStatuses
      .filter((item) => Number(item.electionYear) === year)
      .map((item) => [item.state, item]),
  );

  for (const state of statesToProcess()) {
    await normalizeEntry(registry, entries.get(state), state, year, force);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
