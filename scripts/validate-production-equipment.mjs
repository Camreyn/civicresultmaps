import adminPackages from "../data/admin-source-packages.json" with { type: "json" };

const defaultBaseUrl = "http://localhost:3000";
const swingStates = ["AZ", "GA", "MI", "NC", "NV", "PA", "WI"];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  const envValue = process.env[envKey] && process.env[envKey] !== "true" ? process.env[envKey] : undefined;
  return index === -1 ? envValue ?? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
}

function statesToCheck() {
  if (hasFlag("--all")) {
    return adminPackages.stateYearStatuses.map((entry) => entry.state);
  }

  const explicit = argValue("--states", "");
  const positional = process.argv
    .slice(2)
    .flatMap((value) => value.split(/[,\s]+/))
    .filter((value) => /^[A-Za-z]{2}$/.test(value))
    .join(",");

  return String(explicit || positional || swingStates.join(","))
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
}

function baseUrlToCheck() {
  const explicit = argValue("--base-url", "");
  const positionalUrl = process.argv.slice(2).find((value) => /^https?:\/\//i.test(value));
  return String(explicit || positionalUrl || defaultBaseUrl).replace(/\/$/, "");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  const baseUrl = baseUrlToCheck();
  const year = Number(argValue("--year", "2024"));
  const states = statesToCheck();
  const registryByState = new Map(
    adminPackages.stateYearStatuses
      .filter((entry) => Number(entry.electionYear) === year)
      .map((entry) => [entry.state, entry]),
  );

  const adminSources = await fetchJson(`${baseUrl}/api/admin-sources?year=${year}`);
  const loadedEquipment = adminSources.data?.familySummary?.equipment?.loaded ?? 0;
  const expectedStates = adminPackages.stateYearStatuses.filter((entry) => Number(entry.electionYear) === year).length;
  const errors = [];

  if (loadedEquipment !== expectedStates) {
    errors.push(`Expected ${expectedStates} loaded equipment states, API reported ${loadedEquipment}.`);
  }

  const checked = [];
  for (const state of states) {
    const expected = registryByState.get(state)?.equipment?.expectedJurisdictions;
    const equipment = await fetchJson(`${baseUrl}/api/equipment?state=${state}&year=${year}&limit=20000`);
    const rowCount = equipment.meta?.rowCount ?? equipment.data?.length ?? 0;
    checked.push({ expected, rowCount, state });

    if (typeof expected === "number" && rowCount !== expected) {
      errors.push(`${state} expected ${expected} equipment rows, API returned ${rowCount}.`);
    }

    if (!equipment.meta?.caveat || !String(equipment.meta.caveat).includes("not turnout or vote-result")) {
      errors.push(`${state} equipment API caveat is missing or too weak.`);
    }
  }

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ baseUrl, checked, loadedEquipment, year }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
