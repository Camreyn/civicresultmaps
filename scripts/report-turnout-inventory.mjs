import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(repoRoot, "etl", "state-configs");

const states = [
  ["AK", "Alaska"],
  ["AL", "Alabama"],
  ["AR", "Arkansas"],
  ["AZ", "Arizona"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["IA", "Iowa"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["MA", "Massachusetts"],
  ["MD", "Maryland"],
  ["ME", "Maine"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MO", "Missouri"],
  ["MS", "Mississippi"],
  ["MT", "Montana"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["NE", "Nebraska"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NV", "Nevada"],
  ["NY", "New York"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VA", "Virginia"],
  ["VT", "Vermont"],
  ["WA", "Washington"],
  ["WI", "Wisconsin"],
  ["WV", "West Virginia"],
  ["WY", "Wyoming"],
];

function readConfigs() {
  const configs = new Map();
  for (const fileName of readdirSync(configDir)) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const config = JSON.parse(readFileSync(path.join(configDir, fileName), "utf8"));
    configs.set(config.code, config);
  }
  return configs;
}

async function readDatabaseTurnoutCounts() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!databaseUrl) {
    return { available: false, counts: new Map() };
  }

  const sql = neon(databaseUrl);
  const rows = await sql`
    select state_code, count(*)::int as turnout_rows
    from turnout_rows
    where election_year = 2024
    group by state_code
  `;

  return {
    available: true,
    counts: new Map(rows.map((row) => [row.state_code, Number(row.turnout_rows)])),
  };
}

function sourceFor(config, sourceId) {
  return config?.sources?.find((source) => source.id === sourceId) ?? null;
}

function classify(row) {
  if (row.databaseTurnoutRows > 0) {
    return "loaded";
  }

  if (row.configTurnoutEnabled && row.expectedTurnoutRows > 0) {
    return "configured_not_loaded";
  }

  if (row.hasNativeConfig) {
    return "native_config_missing_turnout";
  }

  return "needs_native_turnout_package";
}

function missingNote(row) {
  if (row.status === "loaded") {
    return "Turnout rows are present in the database.";
  }

  if (row.state === "WI") {
    return "Need official Wisconsin registered-voter denominator data. Current WEC workbook supports ward result/review rows, but turnout screening is disabled because no denominator source is mapped.";
  }

  if (row.status === "configured_not_loaded") {
    return "Native ETL config declares a turnout parser and expected rows, but the database currently has no turnout rows for this state.";
  }

  if (row.hasNativeConfig) {
    return "Native ETL config exists, but turnout is disabled or expected turnout rows are zero.";
  }

  return "Need official turnout/registration source package: source URL, local artifact, reporting level, ballots-cast field, denominator field, expected row count, parser hint, caveats, and validation total.";
}

function toMarkdown(report) {
  const lines = [
    "# Turnout Collection Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This is an internal collection inventory. It is not rendered in the Civic Result Maps web app.",
    "",
    "## Summary",
    "",
    `- States checked: ${report.summary.statesChecked}`,
    `- Turnout loaded in database: ${report.summary.loaded}`,
    `- Configured but not loaded: ${report.summary.configuredNotLoaded}`,
    `- Native config present but missing turnout: ${report.summary.nativeConfigMissingTurnout}`,
    `- Need native turnout package: ${report.summary.needsNativeTurnoutPackage}`,
    "",
    "## State Status",
    "",
    "| State | Status | DB rows | Expected rows | Source level | Denominator | Local artifact | Note |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- |",
  ];

  for (const row of report.states) {
    lines.push(
      `| ${row.state} ${row.name} | ${row.status} | ${row.databaseTurnoutRows} | ${row.expectedTurnoutRows ?? ""} | ${row.sourceLevel ?? ""} | ${row.denominatorType ?? ""} | ${row.localFile ?? ""} | ${row.note} |`,
    );
  }

  lines.push(
    "",
    "## Standard Missing-State Request",
    "",
    "For each missing state, ask for:",
    "",
    "- Official turnout or voter participation source URL.",
    "- Local artifact committed to `data/`.",
    "- Reporting level: precinct, ward, county, municipality, or other.",
    "- Ballots-cast field or calculation.",
    "- Registration/eligible-voter denominator field and timing.",
    "- Expected row count.",
    "- Expected statewide ballots-cast total if available.",
    "- Parser hints: sheet/table name, header row, join keys, county field, precinct/ward field.",
    "- Caveats: inactive-voter treatment, election-day registration, provisional/absentee handling, overseas/federal-only ballots, or reporting-unit mismatch.",
  );

  return `${lines.join("\n")}\n`;
}

const configs = readConfigs();
const database = await readDatabaseTurnoutCounts();
const generatedAt = new Date().toISOString();

const rows = states.map(([state, fallbackName]) => {
  const config = configs.get(state);
  const turnoutSource = sourceFor(config, config?.turnout?.sourceId);
  const databaseTurnoutRows = database.counts.get(state) ?? 0;
  const row = {
    state,
    name: config?.name ?? fallbackName,
    hasNativeConfig: Boolean(config),
    configTurnoutEnabled: Boolean(config?.capabilities?.turnout),
    databaseTurnoutRows,
    expectedTurnoutRows: config?.expected?.turnoutRows ?? null,
    sourceId: config?.turnout?.sourceId ?? null,
    sourceLevel: config?.turnout?.sourceLevel ?? null,
    denominatorType: config?.turnout?.denominatorType ?? null,
    localFile: turnoutSource?.localFile ?? null,
    localFilePresent: turnoutSource?.localFile ? existsSync(path.join(repoRoot, turnoutSource.localFile)) : false,
  };
  return { ...row, status: classify(row), note: missingNote({ ...row, status: classify(row) }) };
});

const summary = {
  statesChecked: rows.length,
  loaded: rows.filter((row) => row.status === "loaded").length,
  configuredNotLoaded: rows.filter((row) => row.status === "configured_not_loaded").length,
  nativeConfigMissingTurnout: rows.filter((row) => row.status === "native_config_missing_turnout").length,
  needsNativeTurnoutPackage: rows.filter((row) => row.status === "needs_native_turnout_package").length,
};

const report = {
  generatedAt,
  databaseAvailable: database.available,
  summary,
  states: rows,
};

if (process.argv.includes("--markdown")) {
  console.log(toMarkdown(report));
} else {
  console.log(JSON.stringify(report, null, 2));
}
