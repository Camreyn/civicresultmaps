import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const names = [
  "CRM_DATABASE_DRIVER",
  "CRM_DATABASE_ENVIRONMENT",
  "CRM_DATABASE_LOCAL_WRITES",
  "DATABASE_URL",
  "POSTGRES_URL",
];
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

function restore() {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
}

function local(url = "postgres://postgres@127.0.0.1:54329/crm_clone_dev") {
  process.env.CRM_DATABASE_DRIVER = "postgres";
  process.env.CRM_DATABASE_ENVIRONMENT = "local";
  process.env.DATABASE_URL = url;
  process.env.CRM_DATABASE_LOCAL_WRITES = "true";
}

test.after(restore);

test("native import local driver selects only the explicitly opted-in clone", async () => {
  const { resolveNativeImportDatabaseTarget } = await import("../../src/db/database-driver.ts");
  restore();
  local();
  assert.deepEqual(resolveNativeImportDatabaseTarget(), {
    driver: "postgres",
    databaseUrl: "postgres://postgres@127.0.0.1:54329/crm_clone_dev",
  });

  delete process.env.CRM_DATABASE_LOCAL_WRITES;
  assert.throws(() => resolveNativeImportDatabaseTarget(), /CRM_DATABASE_LOCAL_WRITES=true/);
  process.env.CRM_DATABASE_LOCAL_WRITES = "true";

  process.env.CRM_DATABASE_ENVIRONMENT = "production";
  assert.throws(() => resolveNativeImportDatabaseTarget(), /CRM_DATABASE_ENVIRONMENT=local/);
  local();
  delete process.env.DATABASE_URL;
  process.env.POSTGRES_URL = "postgres://postgres@127.0.0.1:54329/crm_clone_dev";
  assert.throws(() => resolveNativeImportDatabaseTarget(), /explicit DATABASE_URL/);

  local("postgres://postgres@db.example.test:54329/crm_clone_dev");
  assert.throws(() => resolveNativeImportDatabaseTarget(), /only permits localhost/);
  local("postgres://postgres@127.0.0.1:5432/crm_clone_dev");
  assert.throws(() => resolveNativeImportDatabaseTarget(), /port 54329/);
  local("postgres://postgres@127.0.0.1:54329/crm_clone_snapshot");
  assert.throws(() => resolveNativeImportDatabaseTarget(), /database crm_clone_dev/);
});

test("native import keeps Neon as its default driver and local command cannot load .env.local", async () => {
  const { resolveNativeImportDatabaseTarget } = await import("../../src/db/database-driver.ts");
  restore();
  delete process.env.CRM_DATABASE_DRIVER;
  process.env.DATABASE_URL = "https://example.test/neon";
  assert.deepEqual(resolveNativeImportDatabaseTarget(), {
    driver: "neon-http",
    databaseUrl: "https://example.test/neon",
  });

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const wrapper = readFileSync("scripts/promote-native-staging-local.mjs", "utf8");
  const transactions = readFileSync("src/db/neon-transaction.ts", "utf8");
  assert.doesNotMatch(packageJson.scripts["native:promote:local"], /env-file/);
  assert.match(wrapper, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(transactions, /sql\.begin\(/);
  assert.match(transactions, /sql\.end\(\{ timeout: 5 \}\)/);
});

test("database rehearsal target is distinct from the guarded persistent clone", async () => {
  const { resolveDatabaseRehearsalTarget } = await import("../../src/db/database-driver.ts");
  const runId = "database-rehearsal-01234567-89ab-4def-8123-456789abcdef";
  restore();
  const input = { runId, mappedPort: 55432, databaseUrl: "postgres://crm_rehearsal:ephemeral@127.0.0.1:55432/crm_rehearsal_01234567-89ab-4def-8123-456789abcdef" };
  assert.equal(resolveDatabaseRehearsalTarget(input).rehearsalRunId, runId);
  const target = resolveDatabaseRehearsalTarget(input);
  assert.throws(() => { target.databaseUrl = "postgres://crm_rehearsal:x@127.0.0.1:54329/crm_clone_dev"; }, /read only/);
  assert.throws(() => resolveDatabaseRehearsalTarget({ ...input, databaseUrl: `${input.databaseUrl}?host=db.example.test` }), /query/);
  assert.throws(() => resolveDatabaseRehearsalTarget({ ...input, databaseUrl: input.databaseUrl.replace("crm_rehearsal_", "crm_rehearsal_%63") }), /exact generated/);
  assert.throws(() => resolveDatabaseRehearsalTarget({ ...input, mappedPort: 54329 }), /non-clone mapped port/);
  assert.throws(() => resolveDatabaseRehearsalTarget({ ...input, runId: "database-rehearsal-not-a-uuid" }), /generated rehearsal/);
  assert.throws(() => resolveDatabaseRehearsalTarget({ ...input, databaseUrl: input.databaseUrl.replace("127.0.0.1", "db.example.test") }), /loopback/);
});

test("native importer refuses a forged injected rehearsal target", async () => {
  const { promoteNativeStagingArtifact } = await import("../../src/db/native-import.ts");
  const { resolveDatabaseRehearsalTarget } = await import("../../src/db/database-driver.ts");
  const runId = "database-rehearsal-01234567-89ab-4def-8123-456789abcdef";
  const target = resolveDatabaseRehearsalTarget({ runId, mappedPort: 55432, databaseUrl: "postgres://crm_rehearsal:ephemeral@127.0.0.1:55432/crm_rehearsal_01234567-89ab-4def-8123-456789abcdef" });
  const copiedAndRetargeted = Object.freeze({ ...target, databaseUrl: "postgres://crm_rehearsal:ephemeral@127.0.0.1:55432/crm_clone_dev" });
  await assert.rejects(promoteNativeStagingArtifact("does-not-matter.json", { databaseTarget: copiedAndRetargeted }), /must be created by the labelled database rehearsal target resolver/);
  await assert.rejects(
    promoteNativeStagingArtifact("does-not-matter.json", { databaseTarget: { driver: "postgres", databaseUrl: "postgres://x", rehearsalRunId: "database-rehearsal-01234567-89ab-4def-8123-456789abcdef" } }),
    /must be created by the labelled database rehearsal target resolver/,
  );
});
