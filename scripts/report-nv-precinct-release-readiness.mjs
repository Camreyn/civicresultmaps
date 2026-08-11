import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildNevadaPrecinctReleaseReadiness } from "./lib/nv-precinct-release-readiness.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const reportArgument = args.find((arg) => arg.startsWith("--report="));
for (const arg of args) {
  if (arg !== "--write" && !arg.startsWith("--report=")) {
    throw new Error(`Unknown Nevada release-readiness option: ${arg}`);
  }
}

const report = await buildNevadaPrecinctReleaseReadiness();
let reportPath = null;
if (write) {
  const relativePath = reportArgument
    ? reportArgument.slice("--report=".length)
    : ".etl/precinct-release-readiness/NV/nv-four-election-readiness.json";
  const etlRoot = path.resolve(".etl");
  const target = path.resolve(relativePath);
  if (target !== etlRoot && !target.startsWith(etlRoot + path.sep)) {
    throw new Error("Nevada release-readiness reports must remain under .etl");
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n", "utf8");
  reportPath = path.relative(process.cwd(), target).replaceAll("\\", "/");
}

console.log(JSON.stringify({ ...report, reportPath }, null, 2));
