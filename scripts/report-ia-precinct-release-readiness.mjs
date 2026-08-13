import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildIowaPrecinctReleaseReadiness } from "./lib/ia-precinct-release-readiness.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const reportArgument = args.find((arg) => arg.startsWith("--report="));
for (const arg of args) {
  if (arg !== "--write" && !arg.startsWith("--report=")) {
    throw new Error(`Unknown Iowa release-readiness option: ${arg}`);
  }
}

const report = await buildIowaPrecinctReleaseReadiness();
let reportPath = null;
if (write) {
  const relativePath = reportArgument
    ? reportArgument.slice("--report=".length)
    : ".etl/precinct-release-readiness/IA/ia-four-election-readiness.json";
  const etlRoot = path.resolve(".etl");
  const target = path.resolve(relativePath);
  if (target !== etlRoot && !target.startsWith(etlRoot + path.sep)) {
    throw new Error("Iowa release-readiness reports must remain under .etl");
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n", "utf8");
  reportPath = path.relative(process.cwd(), target).replaceAll("\\", "/");
}

console.log(JSON.stringify({ ...report, reportPath }, null, 2));
