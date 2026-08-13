import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Validation is local-only and uses a read-only startup session.
process.env.CRM_DATABASE_DRIVER = "postgres";

const args = process.argv.slice(2);
const yearsArgument = args.find((arg) => arg.startsWith("--years="));
const reportArgument = args.find((arg) => arg.startsWith("--report="));
for (const arg of args) {
  if (!arg.startsWith("--years=") && !arg.startsWith("--report=")) {
    throw new Error("Unknown Iowa GIS validation option: " + arg);
  }
}
const years = yearsArgument
  ? yearsArgument.slice("--years=".length).split(",").map((value) => Number(value.trim()))
  : undefined;

function writeReport(relativePath, value) {
  const etlRoot = path.resolve(".etl");
  const target = path.resolve(relativePath);
  if (target !== etlRoot && !target.startsWith(etlRoot + path.sep)) {
    throw new Error("Iowa GIS reports must remain under .etl");
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n", "utf8");
  return path.relative(process.cwd(), target).replaceAll("\\", "/");
}

try {
  const {
    buildIowaPrecinctGisPlan,
    summarizeIowaPrecinctGisPlan,
  } = await import("./lib/ia-precinct-gis-plan.mjs");
  const { validateIowaPrecinctGisDatabase } =
    await import("./lib/ia-precinct-gis-db.mjs");
  const plan = await buildIowaPrecinctGisPlan({ years });
  const validation = await validateIowaPrecinctGisDatabase(plan);
  const report = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    scope: "local-only Iowa precinct GIS validation",
    productionMutationPerformed: false,
    publicDeliveryAuthorized: false,
    plan: summarizeIowaPrecinctGisPlan(plan),
    validation,
  };
  const reportPath = writeReport(
    reportArgument
      ? reportArgument.slice("--report=".length)
      : ".etl/local-db/ia-precinct-gis-validation.json",
    report,
  );
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
