// Deliberately fixed-interface launcher: it does not load .env.local and it
// accepts no database URL, SQL, Docker image, path, or arbitrary command.
const profile = process.argv[2] ?? "";
const confirmation = process.argv[3] ?? "";
if (profile !== "native-import" || confirmation !== "REHEARSE_LOCAL_DATABASE" || process.argv.length !== 4) {
  console.error("Usage: node --experimental-strip-types scripts/run-database-rehearsal.mjs native-import REHEARSE_LOCAL_DATABASE");
  process.exitCode = 2;
} else {
  const { createRuntimeContext } = await import("../tools/civicresultmaps-mcp/runtime.ts");
  const { rehearseDatabase } = await import("../tools/civicresultmaps-mcp/database-rehearsal.ts");
  const report = await rehearseDatabase(createRuntimeContext(), { profile, confirmation });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "passed" ? 0 : 3;
}
