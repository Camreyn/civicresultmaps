import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// This command intentionally does not load .env.local. The database guard accepts
// only an explicitly supplied loopback crm_clone_dev URL and local-write opt-in.
process.env.CRM_DATABASE_DRIVER = "postgres";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const yearsArgument = args.find((arg) => arg.startsWith("--years="));
const reportArgument = args.find((arg) => arg.startsWith("--report="));
const allowed = new Set(["--apply"]);
for (const arg of args) {
  if (
    !allowed.has(arg)
    && !arg.startsWith("--years=")
    && !arg.startsWith("--report=")
  ) {
    throw new Error("Unknown Florida GIS setup option: " + arg);
  }
}
const years = yearsArgument
  ? yearsArgument.slice("--years=".length).split(",").map((value) => Number(value.trim()))
  : undefined;

function writeReport(relativePath, value) {
  const etlRoot = path.resolve(".etl");
  const target = path.resolve(relativePath);
  if (target !== etlRoot && !target.startsWith(etlRoot + path.sep)) {
    throw new Error("Florida GIS reports must remain under .etl");
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n", "utf8");
  return path.relative(process.cwd(), target).replaceAll("\\", "/");
}

try {
  const {
    buildFloridaPrecinctGisPlan,
    summarizeFloridaPrecinctGisPlan,
  } = await import("./lib/fl-precinct-gis-plan.mjs");
  const plan = await buildFloridaPrecinctGisPlan({ years });
  const summary = summarizeFloridaPrecinctGisPlan(plan);
  if (!apply) {
    console.log(JSON.stringify({
      mode: "plan",
      productionMutationPerformed: false,
      publicDeliveryAuthorized: false,
      ...summary,
    }, null, 2));
  } else {
    const {
      applyFloridaPrecinctGisPlan,
      validateFloridaPrecinctGisDatabase,
    } = await import("./lib/fl-precinct-gis-db.mjs");
    const applied = await applyFloridaPrecinctGisPlan(plan);
    const validation = await validateFloridaPrecinctGisDatabase(plan);
    const report = {
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      scope: "local-only Florida precinct GIS setup",
      productionMutationPerformed: false,
      publicDeliveryAuthorized: false,
      plan: summary,
      applied,
      validation,
    };
    const reportPath = writeReport(
      reportArgument
        ? reportArgument.slice("--report=".length)
        : ".etl/local-db/fl-precinct-gis-setup-report.json",
      report,
    );
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
