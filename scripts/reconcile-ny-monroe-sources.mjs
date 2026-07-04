import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeMonroeReconciliationSummary } from "./ny-monroe-official-detail.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "data", "ny-2024-monroe-reconciliation-summary.json");

const summary = await writeMonroeReconciliationSummary({ repoRoot, outPath: outputPath });

console.log(`Monroe official detail rows: ${summary.rowCount}`);
console.log(`President detail total: ${summary.detailTotals.president.pres_total}`);
console.log(`Senate comparison candidate total: ${summary.detailTotals.senate.comparison_dem + summary.detailTotals.senate.comparison_rep + summary.detailTotals.senate.comparison_other}`);
if (summary.turnoutLead) {
  console.log(`Monroe turnout lead: ${summary.turnoutLead.totalVoters} voters / ${summary.turnoutLead.registeredVoters} registered`);
}
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
