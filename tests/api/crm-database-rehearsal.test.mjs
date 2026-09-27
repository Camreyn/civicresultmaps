import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertInput, rehearseDatabase, semanticHash } from "../../tools/civicresultmaps-mcp/database-rehearsal.ts";
import { loadRehearsalDataAccess } from "../../tools/civicresultmaps-mcp/rehearsal-data-access.ts";

const migrations = ["0000_fancy_secret_warriors.sql", "0001_dry_luminals.sql", "0002_historical_review_candidates.sql", "0003_deep_landau.sql", "0004_uneven_hellcat.sql", "0005_lazy_human_torch.sql", "0006_broad_quicksilver.sql", "0007_sudden_agent_brand.sql", "0008_typical_thunderbolts.sql", "0009_public_wolfpack.sql"];

test("database rehearsal rejects missing confirmation and unreviewed profiles before any dependency is used", async () => {
  assert.throws(() => assertInput({ profile: "native-import", confirmation: "no" }), /exact REHEARSE_LOCAL_DATABASE/);
  assert.throws(() => assertInput({ profile: "other", confirmation: "REHEARSE_LOCAL_DATABASE" }), /not reviewed/);
});

test("database rehearsal reports unavailable Docker as inconclusive without invoking the host Docker", async () => {
  const fixture = await rehearsalFixture();
  try {
    const calls = [];
    let writes = 0;
    const report = await rehearseDatabase(fixture.context, {
      profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE",
    }, undefined, { runCommand: async (command, args) => { calls.push({ command, args }); return { code: 1, stdout: "", stderr: "deterministic unavailable" }; }, writeAudit: async (_path, value) => { writes++; assert.equal(value.status, "inconclusive"); }, writeFixture: async () => {} });
    assert.equal(writes, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ["info"]);
    assert.equal(report.status, "inconclusive");
    assert.match(report.blocker, /Docker daemon is unavailable/);
  } finally { await fixture.close(); }
});

test("database rehearsal cancellation before start performs no Docker calls", async () => {
  const fixture = await rehearsalFixture();
  try {
    const controller = new AbortController(); controller.abort();
    const calls = [];
    const report = await rehearseDatabase(fixture.context, { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE" }, controller.signal, {
      runCommand: async (...args) => { calls.push(args); return { code: 0, stdout: "", stderr: "" }; },
      writeAudit: async (_path, value) => assert.equal(value.status, "inconclusive"), writeFixture: async () => { throw new Error("fixture should not be written"); },
    });
    assert.equal(report.status, "inconclusive");
    assert.match(report.blocker, /cancelled/i);
    assert.deepEqual(calls, []);
  } finally { await fixture.close(); }
});

test("migration failure cleanup confirms the exact label before audit persistence", async () => {
  const fixture = await rehearsalFixture();
  try {
    const fake = commandFixture({ migrationFailure: true });
    const events = [];
    let saved;
    const report = await rehearseDatabase(fixture.context, { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE" }, undefined, {
      runCommand: async (command, args) => {
        const phase = args[0] === "exec" && args.includes("psql") ? "migration"
          : args[0] === "inspect" && args[2]?.includes(".Config.Labels") ? "cleanup-label" : args[0];
        events.push(`command:${phase}`); return fake.run(command, args);
      },
      writeAudit: async (_path, value) => { events.push("audit"); saved = value; }, writeFixture: async () => {},
    });
    assert.equal(report.status, "failed");
    assert.equal(report.evidence.cleanup, "owned_container_and_anonymous_volumes_removed");
    assert.equal(saved.evidence.cleanup, "owned_container_and_anonymous_volumes_removed");
    const removal = fake.calls.find((entry) => entry.args[0] === "rm");
    assert.deepEqual(removal.args.slice(0, 3), ["rm", "-f", "-v"]);
    assert.match(removal.args[3], /^crm-rehearsal-/);
    assert.ok(events.indexOf("command:migration") < events.indexOf("command:cleanup-label"));
    assert.ok(events.indexOf("command:cleanup-label") < events.indexOf("command:rm"));
    assert.ok(events.indexOf("command:rm") < events.indexOf("audit"));
  } finally { await fixture.close(); }
});

test("foreign cleanup label skips rm and persists a warning", async () => {
  const fixture = await rehearsalFixture();
  try {
    const fake = commandFixture({ migrationFailure: true, cleanupLabel: "database-rehearsal-foreign" });
    const calls = [];
    let saved;
    const report = await rehearseDatabase(fixture.context, { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE" }, undefined, {
      runCommand: async (command, args) => { calls.push(args[0]); return fake.run(command, args); },
      writeAudit: async (_path, value) => { saved = value; }, writeFixture: async () => {},
    });
    assert.equal(report.status, "failed");
    assert.equal(report.evidence.cleanup, "unverified");
    assert.equal(saved.evidence.cleanup, "unverified");
    assert.equal(calls.includes("rm"), false);
    assert.ok(report.warnings.some((warning) => /exact generated label was not confirmed/.test(warning)));
  } finally { await fixture.close(); }
});

test("migration registry drift blocks Docker before start", async () => {
  const fixture = await rehearsalFixture({ drift: true });
  try {
    const calls = [];
    const report = await rehearseDatabase(fixture.context, { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE" }, undefined, {
      runCommand: async (...args) => { calls.push(args); return { code: 0, stdout: "", stderr: "" }; },
      writeAudit: async () => {}, writeFixture: async () => {},
    });
    assert.equal(report.status, "failed");
    assert.match(report.blocker, /Migration registry drift/);
    assert.deepEqual(calls, []);
  } finally { await fixture.close(); }
});

for (const [name, options, expected] of [
  ["image identity failure", { imageFailure: true }, /image content identity/],
  ["malformed port", { malformedPort: true }, /no loopback port mapping/],
  ["failed rm", { migrationFailure: true, removeFailure: true }, /migration failed/],
]) {
  test(`database rehearsal handles ${name} without connecting to PostgreSQL`, async () => {
    const fixture = await rehearsalFixture();
    try {
      const fake = commandFixture(options);
      let saved;
      const report = await rehearseDatabase(fixture.context, { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE" }, undefined, {
        runCommand: (command, args) => fake.run(command, args), writeAudit: async (_path, value) => { saved = value; }, writeFixture: async () => {},
      });
      assert.equal(report.status, "failed");
      assert.match(report.blocker, expected);
      assert.equal(saved.status, "failed");
      if (options.removeFailure) {
        assert.equal(report.evidence.cleanup, "unverified");
        assert.ok(report.warnings.some((warning) => /Removing the owned rehearsal container and anonymous volumes failed/.test(warning)));
      }
    } finally { await fixture.close(); }
  });
}

test("rehearsal data access loads the fixed source-local functions without opening SQL", async () => {
  const access = await loadRehearsalDataAccess();
  for (const name of ["listResults", "listReviewRows", "listTurnoutRows", "listHistoricalResultRows"]) assert.equal(typeof access[name], "function", name);
});

test("semantic hashes ignore object key order, array order, and revision-like ordering", () => {
  assert.equal(semanticHash([{ revision: 9, county: "A" }, { revision: 2, county: "B" }]), semanticHash([{ county: "B", revision: 2 }, { county: "A", revision: 9 }]));
});

async function rehearsalFixture({ drift = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-database-rehearsal-test-"));
  await mkdir(path.join(root, "drizzle"), { recursive: true });
  for (const migration of migrations) await writeFile(path.join(root, "drizzle", migration), "-- test migration\n");
  if (drift) await writeFile(path.join(root, "drizzle", "9999_unreviewed.sql"), "-- drift\n");
  return { context: { repoRoot: root, nodeExecutable: process.execPath, pythonExecutable: "python" }, close: () => rm(root, { recursive: true, force: true }) };
}

function commandFixture({ migrationFailure = false, imageFailure = false, malformedPort = false, cleanupLabel = "exact", removeFailure = false } = {}) {
  const calls = [];
  const runId = () => {
    const run = calls.find((entry) => entry.args[0] === "run");
    const label = run?.args[run.args.indexOf("--label") + 1] ?? "";
    return label.replace(/^com\.civicresultmaps\.rehearsal=/, "");
  };
  return {
    calls,
    async run(command, args) {
      calls.push({ command, args });
      if (args[0] === "info") return { code: 0, stdout: "Docker OK", stderr: "" };
      if (args[0] === "run") return { code: 0, stdout: "container", stderr: "" };
      if (args[0] === "inspect" && args[2]?.includes(".Image")) return imageFailure
        ? { code: 0, stdout: "not-a-sha", stderr: "" }
        : { code: 0, stdout: `sha256:${"a".repeat(64)}`, stderr: "" };
      if (args[0] === "port") return malformedPort ? { code: 0, stdout: "5432/tcp -> 0.0.0.0:5432", stderr: "" } : { code: 0, stdout: "5432/tcp -> 127.0.0.1:55432", stderr: "" };
      if (args[0] === "exec" && args.includes("pg_isready")) return { code: 0, stdout: "accepting connections", stderr: "" };
      if (args[0] === "exec" && args.includes("psql") && migrationFailure) return { code: 1, stdout: "", stderr: "migration failed" };
      if (args[0] === "inspect" && args[2]?.includes(".Config.Labels")) return { code: 0, stdout: cleanupLabel === "exact" ? runId() : cleanupLabel, stderr: "" };
      if (args[0] === "rm") return removeFailure ? { code: 1, stdout: "", stderr: "rm failed" } : { code: 0, stdout: "removed", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
  };
}
