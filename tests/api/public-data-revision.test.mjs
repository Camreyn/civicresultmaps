import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  transactionSql,
  withTransactionClient,
} from "../../src/db/neon-transaction.ts";
import {
  bumpPublicDataRevision,
  readPublicDataRevision,
} from "../../src/db/public-data-revision.ts";

function template(...parts) {
  return Object.assign(parts, { raw: [...parts] });
}

function fakeClient(options = {}) {
  const events = [];
  let connected = false;
  return {
    events,
    async connect() {
      connected = true;
      events.push({ text: "connect", values: [] });
    },
    async end() {
      events.push({ text: "end", values: [] });
    },
    async query(text, values = []) {
      assert.equal(connected, true);
      events.push({ text, values });
      if (options.failOn?.(text)) {
        throw new Error(options.failureMessage ?? "injected failure");
      }
      return { rows: options.rowsFor?.(text) ?? [] };
    },
  };
}

test("transaction SQL preserves placeholder order and casts", async () => {
  const client = fakeClient({
    rowsFor: () => [{ value: "ready" }],
  });
  await client.connect();
  const sql = transactionSql(client);
  const rows = await sql(template("select ", "::text as value, ", "::int as count"), "ready", 14);
  await client.end();

  assert.deepEqual(rows, [{ value: "ready" }]);
  assert.equal(client.events[1].text, "select $1::text as value, $2::int as count");
  assert.deepEqual(client.events[1].values, ["ready", 14]);
});

test("transaction client commits successful work and always closes", async () => {
  const client = fakeClient({
    rowsFor: (text) => text.startsWith("select") ? [{ ok: true }] : [],
  });
  const result = await withTransactionClient(client, async (sql) => {
    const [row] = await sql(template("select ", "::text as value"), "ok");
    return row;
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    client.events.map((event) => event.text),
    ["connect", "begin", "select $1::text as value", "commit", "end"],
  );
});

test("transaction client rolls back failures and never commits partial work", async () => {
  const client = fakeClient({
    failOn: (text) => text.startsWith("insert"),
    failureMessage: "mid-promotion failure",
  });

  await assert.rejects(
    withTransactionClient(client, async (sql) => {
      await sql(template("insert into result_rows (votes) values (", ")"), 1);
    }),
    /mid-promotion failure/,
  );
  assert.deepEqual(
    client.events.map((event) => event.text),
    ["connect", "begin", "insert into result_rows (votes) values ($1)", "rollback", "end"],
  );
});

test("public revision read and bump use a monotonic singleton", async () => {
  const readClient = fakeClient({
    rowsFor: (text) => text.includes("select revision::text") ? [{ revision: "42" }] : [],
  });
  await readClient.connect();
  assert.equal(await readPublicDataRevision(transactionSql(readClient)), "public:42");
  await readClient.end();

  const bumpClient = fakeClient({
    rowsFor: (text) => text.includes("insert into public_data_revisions")
      ? [{ revision: "43", updated_at: "2026-07-13T00:00:00.000Z" }]
      : [],
  });
  await bumpClient.connect();
  assert.deepEqual(
    await bumpPublicDataRevision(transactionSql(bumpClient), "native-promotion:NC:2024"),
    { revision: "43", updatedAt: "2026-07-13T00:00:00.000Z" },
  );
  await bumpClient.end();

  const bumpQuery = bumpClient.events[1];
  assert.ok(bumpQuery.text.includes("revision = public_data_revisions.revision + 1"));
  assert.deepEqual(bumpQuery.values, ["public", "native-promotion:NC:2024"]);
});

test("every public database writer advances the dedicated revision", () => {
  const migration = readFileSync("drizzle/0003_deep_landau.sql", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const nativeImport = readFileSync("src/db/native-import.ts", "utf8");
  const legacyImport = readFileSync("src/db/legacy-import.ts", "utf8");
  const starterSeed = readFileSync("src/db/starter-seed.ts", "utf8");
  const equipment = readFileSync("scripts/promote-equipment-context.mjs", "utf8");
  const geometry = readFileSync("scripts/promote-map-geometry-sources.mjs", "utf8");
  const backfill = readFileSync("scripts/backfill-jurisdiction-tags.mjs", "utf8");
  const setup = readFileSync("src/app/api/admin/setup-database/route.ts", "utf8");

  assert.match(migration, /CREATE TABLE "public_data_revisions"/);
  assert.ok(migration.includes("public_data_revisions_scope_check"));
  assert.match(migration, /INSERT INTO "public_data_revisions"/);
  assert.match(dataAccess, /readPublicDataRevision/);
  assert.doesNotMatch(dataAccess, /promotedCount/);

  assert.match(nativeImport, /runNeonTransaction/);
  assert.match(nativeImport, /pg_advisory_xact_lock/);
  assert.ok(nativeImport.includes("native-promotion:"));
  assert.equal(nativeImport.includes("const sql = neon(databaseUrl)"), false);
  assert.match(starterSeed, /runNeonTransaction/);
  assert.ok(starterSeed.includes("starter-seed"));

  for (const reason of [
    "legacy-cleanup:",
    "legacy-indicators:",
    "legacy-historical:",
    "legacy-import-failed:",
    "legacy-import:",
  ]) {
    assert.ok(legacyImport.includes(reason), "missing revision reason " + reason);
  }
  assert.ok(equipment.includes("equipment-promotion:"));
  assert.ok(geometry.includes("!dryRun && records.length > 0"));
  assert.ok(geometry.includes("map-geometry-promotion:"));
  assert.ok(backfill.includes("transaction.query("));
  assert.ok(backfill.includes("bumpPublicDataRevisionSql"));
  assert.ok(setup.includes("readdirSync(migrationDirectory)"));
  assert.ok(setup.includes("sql.transaction(statements.map"));
  assert.equal(setup.includes("0000_fancy_secret_warriors.sql"), false);
});