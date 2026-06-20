import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const configDir = path.join("etl", "state-configs");
const registryFile = path.join("data", "turnout-source-packages.json");
const eacSummaryFile = path.join("data", "eac-2024-state-turnout", "summary.json");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readConfigs() {
  const configs = new Map();
  for (const fileName of readdirSync(configDir)) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    const config = readJson(path.join(configDir, fileName));
    configs.set(config.code, config);
  }
  return configs;
}

const registry = readJson(registryFile);
const configs = readConfigs();
const eacSummary = new Map(readJson(eacSummaryFile).states.map((state) => [state.state, state]));

registry.checkedAt = new Date().toISOString().slice(0, 10);
registry.stateYearStatuses = registry.stateYearStatuses.map((row) => {
  if (row.year !== 2024) {
    return row;
  }

  const config = configs.get(row.state);
  if (!config?.capabilities?.turnout || !config.turnout || !config.expected?.turnoutRows) {
    return row;
  }

  const turnoutSource = config.sources.find((source) => source.id === config.turnout.sourceId);
  const eacCoverage = eacSummary.get(row.state);
  const isEacFallback = config.turnout.format === "eacTurnoutCsv";
  return {
    ...row,
    status: "loaded",
    sourceLevel: config.turnout.sourceLevel ?? row.sourceLevel,
    denominatorType: config.turnout.denominatorType ?? row.denominatorType,
    denominatorTiming: config.turnout.registrationDenominatorTiming ?? row.denominatorTiming,
    sourceTitle: turnoutSource?.category ?? row.sourceTitle,
    sourceUrl: turnoutSource?.url ?? row.sourceUrl,
    localFile: turnoutSource?.localFile ?? row.localFile,
    parser: turnoutSource?.parser ?? config.turnout.format ?? row.parser,
    expectedTurnoutRows: config.expected.turnoutRows,
    statusNote: isEacFallback
      ? "Official EAC 2024 EAVS fallback turnout rows are validated in ETL and promoted to the database; prefer state-native denominator artifacts when available."
      : "Promoted 2024 turnout rows are available from the configured official turnout source.",
    nextAction: isEacFallback
      ? "Prefer official state election office turnout/registration artifact when available; keep the EAC fallback visibly caveated until then."
      : "Keep source link and denominator caveats visible in the app.",
    coverage: {
      jurisdictionRows: config.expected.turnoutRows,
      registeredVoterDenominatorFile: eacCoverage?.denominatorJsonFile ?? row.coverage?.registeredVoterDenominatorFile ?? "",
      registeredVoters: config.turnout.expected?.registeredVoters ?? row.coverage?.registeredVoters ?? null,
      ballotsCast: config.turnout.expected?.ballotsCast ?? row.coverage?.ballotsCast ?? null,
      warningRows: eacCoverage?.warningRows ?? row.coverage?.warningRows ?? 0,
    },
  };
});

const loadedStates = new Set(registry.stateYearStatuses.filter((row) => row.year === 2024 && row.status === "loaded").map((row) => row.state));
registry.remainingStatesNeedingPackages = registry.remainingStatesNeedingPackages.filter((state) => !loadedStates.has(state));

writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      loaded2024States: loadedStates.size,
      remainingStatesNeedingPackages: registry.remainingStatesNeedingPackages.length,
    },
    null,
    2,
  ),
);
