import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/db/url.ts";
import { getCanonicalJurisdictionRegistry, resolveJurisdictionTag } from "../src/lib/jurisdiction-tags.ts";

const ALLOWED_YEARS = [2016, 2020, 2024];
const apply = process.argv.includes("--apply");
const yearText = process.argv.find((arg) => arg.startsWith("--years="))?.slice(8)
  ?? ALLOWED_YEARS.join(",");
const years = [...new Set(yearText.split(",").map(Number))].sort();
const confirmedHash = process.argv.find((arg) => arg.startsWith("--confirm-plan="))?.slice(15);

if (!years.length || years.some((year) => !ALLOWED_YEARS.includes(year))) {
  throw new Error("--years may contain only 2016, 2020, and 2024.");
}
const registry = getCanonicalJurisdictionRegistry();
if (!registry.jurisdictions.length) {
  throw new Error("Canonical jurisdiction registry is empty; refusing to continue.");
}
const registryTags = registry.jurisdictions.map((row) => row.jurisdictionTag);
if (registry.jurisdictions.length !== 3144
  || new Set(registryTags).size !== 3144
  || registryTags.some((tag) => !/^county:\d{5}$/.test(tag))) {
  throw new Error("Canonical jurisdiction registry must contain exactly 3,144 unique county:<GEOID> tags.");
}

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required.");
}
const sql = neon(databaseUrl);
const registryPath = path.join(process.cwd(), "data", "canonical-jurisdictions.json");
const registrySha256 = createHash("sha256").update(readFileSync(registryPath)).digest("hex");

const definitions = [
  { key: "results", table: "result_rows", result: true, value: "votes" },
  { key: "historical", table: "historical_result_rows", level: "source_level", value: "total_votes" },
];

function safeDatabaseIdentity(url) {
  const parsed = new URL(url);
  const hostParts = parsed.hostname.toLowerCase().split(".").filter(Boolean);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || "default";
  const identitySource = [parsed.protocol, parsed.hostname.toLowerCase(), parsed.port || "default", databaseName].join("|");
  return {
    providerHostSuffix: hostParts.slice(-2).join("."),
    databaseName,
    hostFingerprint: createHash("sha256").update(parsed.hostname.toLowerCase()).digest("hex").slice(0, 16),
    identitySha256: createHash("sha256").update(identitySource).digest("hex"),
  };
}

const databaseIdentity = safeDatabaseIdentity(databaseUrl);

function selectSql(definition) {
  if (definition.result) {
    return [
      "select elections.year as election_year, result_rows.id::text as id,",
      "result_rows.state_code as state, result_rows.jurisdiction_code as code,",
      "result_rows.jurisdiction_name as name, result_rows.level as level,",
      "result_rows.jurisdiction_tag as current_tag",
      "from result_rows",
      "inner join contests on result_rows.contest_id = contests.id",
      "inner join elections on contests.election_id = elections.id",
      "where elections.year = any($1::int[])",
      "order by elections.year, result_rows.state_code, result_rows.jurisdiction_code, result_rows.id",
    ].join("\n");
  }
  const level = definition.level ?? "level";
  return [
    "select election_year, id::text as id, state_code as state,",
    "jurisdiction_code as code, jurisdiction_name as name, " + level + " as level,",
    "jurisdiction_tag as current_tag",
    "from " + definition.table,
    "where election_year = any($1::int[])",
    "order by election_year, state_code, jurisdiction_code, id",
  ].join("\n");
}

function snapshotSql(definition) {
  if (definition.result) {
    return [
      "select elections.year as election_year, count(*)::int as row_count,",
      "coalesce(sum(result_rows.votes), 0)::text as value_total",
      "from result_rows",
      "inner join contests on result_rows.contest_id = contests.id",
      "inner join elections on contests.election_id = elections.id",
      "where elections.year = any($1::int[])",
      "group by elections.year order by elections.year",
    ].join("\n");
  }
  return [
    "select election_year, count(*)::int as row_count,",
    "coalesce(sum(" + definition.value + "), 0)::text as value_total",
    "from " + definition.table,
    "where election_year = any($1::int[])",
    "group by election_year order by election_year",
  ].join("\n");
}

function updateSql(definition) {
  const joins = definition.result
    ? [
        "from candidates, contests, elections",
        "where target.id = candidates.id",
        "and target.contest_id = contests.id",
        "and contests.election_id = elections.id",
        "and elections.year = candidates.election_year",
      ]
    : [
        "from candidates",
        "where target.id = candidates.id",
        "and target.election_year = candidates.election_year",
      ];
  const targetLevel = definition.level ?? "level";
  return [
    "with candidates as (",
    "select",
    "(item->>'id')::uuid as id,",
    "(item->>'electionYear')::int as election_year,",
    "item->>'state' as state, item->>'code' as code,",
    "item->>'name' as name, item->>'level' as level,",
    "item->>'currentTag' as current_tag, item->>'proposedTag' as proposed_tag",
    "from jsonb_array_elements($1::jsonb) as item",
    "where item ? 'currentTag' and jsonb_typeof(item->'currentTag') = 'null'",
    "), updated as (",
    "update " + definition.table + " target set jurisdiction_tag = candidates.proposed_tag",
    ...joins,
    "and target.state_code is not distinct from candidates.state",
    "and target.jurisdiction_code is not distinct from candidates.code",
    "and target.jurisdiction_name is not distinct from candidates.name",
    "and target." + targetLevel + " is not distinct from candidates.level",
    "and candidates.election_year = any($2::int[])",
    "and candidates.current_tag is null",
    "and candidates.proposed_tag ~ '^county:[0-9]{5}$'",
    "and target.jurisdiction_tag is null",
    "returning target.id",
    "), checked as (select count(*)::int as updated_rows from updated)",
    "select updated_rows / (case when updated_rows = $3::int then 1 else 0 end) as updated_rows",
    "from checked",
  ].join("\n");
}

function emptyCounts() {
  return {
    rows: 0,
    canonicalCountyRows: 0,
    persistedCountyRowsBefore: 0,
    alreadyCorrectRows: 0,
    pendingRows: 0,
    conflictingRows: 0,
    unresolvedCountyLevelRows: 0,
    outsideFipsScopeRows: 0,
  };
}

function isCountyLevel(level) {
  const value = String(level ?? "").toLowerCase().replaceAll("_", " ");
  return /county|parish|borough|census area|planning region/.test(value)
    || ["independent city", "city and county", "consolidated municipality"].includes(value);
}

function increment(counts, bucket, currentTag, resolvedTag) {
  counts.rows += 1;
  if (resolvedTag?.startsWith("county:")) counts.canonicalCountyRows += 1;
  if (currentTag?.startsWith("county:")) counts.persistedCountyRowsBefore += 1;
  counts[bucket] += 1;
}

function manifestRow(row, currentTag, proposedTag, reason) {
  return {
    table: row.table,
    id: row.id,
    electionYear: row.electionYear,
    state: row.state,
    code: row.code,
    name: row.name,
    level: row.level,
    currentTag,
    proposedTag,
    reason,
  };
}

async function audit() {
  const reports = [];
  const candidatesByTable = new Map();
  const conflicts = [];
  const unresolved = [];
  const outside = new Map();

  for (const definition of definitions) {
    const rows = await sql.query(selectSql(definition), [years]);
    const counts = emptyCounts();
    const stateCounts = new Map();
    const candidates = [];

    for (const source of rows) {
      const row = {
        table: definition.table,
        electionYear: Number(source.election_year),
        id: String(source.id),
        state: String(source.state),
        code: String(source.code),
        name: String(source.name),
        level: String(source.level),
      };
      const currentIsNull = source.current_tag === null || source.current_tag === undefined;
      const currentTag = currentIsNull ? null : String(source.current_tag).trim() || null;
      const resolution = resolveJurisdictionTag({
        state: row.state,
        jurisdictionCode: row.code,
        jurisdictionName: row.name,
        level: row.level,
      });
      const resolvedTag = resolution.jurisdictionTag;
      let bucket;

      if (!currentIsNull && currentTag === null) {
        bucket = "conflictingRows";
        conflicts.push(manifestRow(row, "", resolvedTag, "blank_non_null_current_tag"));
      } else if (resolvedTag && !/^county:\d{5}$/.test(resolvedTag)) {
        bucket = "unresolvedCountyLevelRows";
        unresolved.push(manifestRow(row, currentTag, resolvedTag, "non_fips_canonical_tag"));
      } else if (currentTag && currentTag !== resolvedTag) {
        bucket = "conflictingRows";
        conflicts.push(manifestRow(row, currentTag, resolvedTag, resolution.reason));
      } else if (resolvedTag && currentTag === resolvedTag) {
        bucket = "alreadyCorrectRows";
      } else if (resolvedTag && currentIsNull) {
        bucket = "pendingRows";
        candidates.push(manifestRow(row, null, resolvedTag, resolution.reason));
      } else if (isCountyLevel(row.level)) {
        bucket = "unresolvedCountyLevelRows";
        unresolved.push(manifestRow(row, currentTag, null, resolution.reason));
      } else {
        bucket = "outsideFipsScopeRows";
        const reason = resolution.reason;
        const key = [row.table, row.electionYear, row.state, row.code, row.name, row.level, reason].join("|");
        const summary = outside.get(key) ?? {
          table: row.table,
          electionYear: row.electionYear,
          state: row.state,
          code: row.code,
          name: row.name,
          level: row.level,
          reason,
          rows: 0,
        };
        summary.rows += 1;
        outside.set(key, summary);
      }

      increment(counts, bucket, currentTag, resolvedTag);
      const stateKey = row.electionYear + ":" + row.state;
      const state = stateCounts.get(stateKey) ?? {
        electionYear: row.electionYear,
        state: row.state,
        ...emptyCounts(),
      };
      increment(state, bucket, currentTag, resolvedTag);
      stateCounts.set(stateKey, state);
    }

    candidatesByTable.set(definition.table, candidates);
    reports.push({
      key: definition.key,
      table: definition.table,
      ...counts,
      states: [...stateCounts.values()].sort(
        (left, right) => left.electionYear - right.electionYear || left.state.localeCompare(right.state),
      ),
    });
  }
  return {
    reports,
    candidatesByTable,
    conflicts,
    unresolved,
    outside: [...outside.values()].sort(
      (left, right) => left.electionYear - right.electionYear
        || left.state.localeCompare(right.state)
        || left.table.localeCompare(right.table)
        || left.code.localeCompare(right.code),
    ),
  };
}

async function snapshot() {
  const output = {};
  for (const definition of definitions) {
    output[definition.table] = await sql.query(snapshotSql(definition), [years]);
  }
  return output;
}

function plannedRows(auditResult) {
  return definitions.flatMap((definition) => auditResult.candidatesByTable.get(definition.table) ?? [])
    .sort((left, right) => left.table.localeCompare(right.table)
      || left.electionYear - right.electionYear
      || left.state.localeCompare(right.state)
      || left.code.localeCompare(right.code)
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id));
}

function buildManifest(auditResult) {
  return {
    schemaVersion: 1,
    years,
    registry: {
      sha256: registrySha256,
      jurisdictionRows: registry.jurisdictions.length,
    },
    database: databaseIdentity,
    rows: plannedRows(auditResult),
  };
}

async function applyPlan(manifest, planHash) {
  if (confirmedHash !== planHash) {
    throw new Error("Applying requires --confirm-plan=" + planHash + ".");
  }

  const chunks = [];
  for (const definition of definitions) {
    const candidates = manifest.rows.filter((row) => row.table === definition.table);
    for (let index = 0; index < candidates.length; index += 5000) {
      chunks.push({ definition, rows: candidates.slice(index, index + 5000) });
    }
  }
  if (!chunks.length) {
    return 0;
  }

  const results = await sql.transaction(
    (transaction) => chunks.map((chunk) => transaction.query(
      updateSql(chunk.definition),
      [JSON.stringify(chunk.rows), years, chunk.rows.length],
    )),
    { isolationLevel: "Serializable", readOnly: false },
  );
  const updated = results.reduce((sum, result) => sum + Number(result[0]?.updated_rows ?? 0), 0);
  if (updated !== manifest.rows.length) {
    throw new Error("Serializable backfill transaction returned " + updated + " rows; expected " + manifest.rows.length + ".");
  }
  return updated;
}

const beforeSnapshot = await snapshot();
const before = await audit();
const manifest = buildManifest(before);
const planHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const blockerCount = before.conflicts.length + before.unresolved.length;
let appliedRows = 0;

if (apply) {
  if (blockerCount) {
    throw new Error(
      "Refusing to apply with " + before.conflicts.length + " conflicts and "
      + before.unresolved.length + " unresolved county-level rows.",
    );
  }
  appliedRows = await applyPlan(manifest, planHash);
}

const after = apply ? await audit() : before;
const afterSnapshot = apply ? await snapshot() : beforeSnapshot;
if (apply && JSON.stringify(afterSnapshot) !== JSON.stringify(beforeSnapshot)) {
  throw new Error("Row-count or value-total invariant changed during backfill.");
}
if (apply && (after.conflicts.length || after.unresolved.length
  || after.reports.some((report) => report.pendingRows))) {
  throw new Error("Post-apply audit did not converge to zero pending/conflicting county rows.");
}

const totals = {
  rows: before.reports.reduce((sum, item) => sum + item.rows, 0),
  canonicalCountyRows: before.reports.reduce((sum, item) => sum + item.canonicalCountyRows, 0),
  persistedCountyRowsBefore: before.reports.reduce((sum, item) => sum + item.persistedCountyRowsBefore, 0),
  pendingRows: manifest.rows.length,
  appliedRows,
  conflicts: before.conflicts.length,
  unresolvedCountyLevelRows: before.unresolved.length,
  outsideFipsScopeRows: before.reports.reduce((sum, item) => sum + item.outsideFipsScopeRows, 0),
};
const report = {
  apply,
  generatedAt: new Date().toISOString(),
  years,
  planHash,
  manifest,
  totals,
  tables: before.reports,
  conflicts: before.conflicts,
  unresolvedCountyLevel: before.unresolved,
  outsideFipsScope: before.outside,
  invariants: {
    rowAndValueTotalsUnchanged: JSON.stringify(afterSnapshot) === JSON.stringify(beforeSnapshot),
    before: beforeSnapshot,
    after: afterSnapshot,
  },
};

mkdirSync(path.join(process.cwd(), ".etl", "jurisdiction-tags"), { recursive: true });
const mode = apply ? "applied" : "dry-run";
const reportPath = path.join(
  process.cwd(),
  ".etl",
  "jurisdiction-tags",
  "fips-" + years.join("-") + "-" + mode + ".json",
);
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  apply,
  reportPath,
  years,
  planHash,
  database: databaseIdentity,
  registrySha256,
  totals,
  tables: report.tables.map(({ states: _states, ...table }) => table),
}, null, 2));

if (!apply && blockerCount) {
  process.exitCode = 1;
}
