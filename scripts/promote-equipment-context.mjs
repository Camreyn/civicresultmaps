import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { jurisdictionTagForRow } from "../src/lib/jurisdiction-tags.ts";
import { requireState, stateCodes } from "./state-metadata.mjs";

function getDatabaseUrl() {
  return (
    [
      process.env.DATABASE_URL,
      process.env.POSTGRES_DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.POSTGRES_DATABASE_URL_UNPOOLED,
      process.env.CRM_URL,
    ].find((value) => value && value.trim() && value.trim() !== '""') ?? ""
  );
}

function argValue(name, fallback, positionalIndex) {
  const index = process.argv.indexOf(name);
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  const envValue = process.env[envKey] && process.env[envKey] !== "true" ? process.env[envKey] : undefined;
  return index === -1
    ? envValue ?? process.argv[2 + positionalIndex] ?? fallback
    : process.argv[index + 1];
}

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
}

function statesToProcess() {
  if (hasFlag("--all")) {
    return stateCodes();
  }

  const stateIndex = process.argv.indexOf("--state");
  const envState = process.env.npm_config_state && process.env.npm_config_state !== "true" ? process.env.npm_config_state : "";
  const explicit = stateIndex === -1 ? envState : process.argv[stateIndex + 1];
  const positional = process.argv
    .slice(2)
    .flatMap((value) => value.split(/[,\s]+/))
    .filter((value) => /^[A-Za-z]{2}$/.test(value))
    .join(",");

  return String(explicit || positional || "WI")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
}

function yearToProcess() {
  const yearIndex = process.argv.indexOf("--year");
  const envYear = process.env.npm_config_year && process.env.npm_config_year !== "true" ? process.env.npm_config_year : "";
  const positional = process.argv.slice(2).find((value) => /^\d{4}$/.test(value));
  return Number(yearIndex === -1 ? envYear || positional || "2024" : process.argv[yearIndex + 1]);
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows.filter((candidate) => candidate.some((fieldValue) => fieldValue.trim()));
  return values.map((valueRow) => Object.fromEntries(headers.map((header, index) => [header, valueRow[index] ?? ""])));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && String(value).trim() !== "" ? number : null;
}

function trueString(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function listFromPipe(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function promoteState(sql, registry, state, year) {
  const stateMeta = requireState(state);
  const entry = registry.stateYearStatuses.find(
    (item) => item.state === stateMeta.code && Number(item.electionYear) === year,
  );
  if (!entry?.equipment?.normalizedArtifact) {
    throw new Error(`No normalized equipment artifact registered for ${state} ${year}.`);
  }

  const rows = parseCsv(await readFile(entry.equipment.normalizedArtifact, "utf8"));

  await sql`
    insert into states (code, name, authority)
    values (${stateMeta.code}, ${stateMeta.name}, ${`${stateMeta.name} election authority`})
    on conflict (code) do nothing
  `;

  const [source] = await sql`
    insert into source_documents (
      slug,
      state_code,
      election_year,
      category,
      title,
      source_url,
      authority,
      local_artifact,
      parser,
      timestamp_basis,
      confidence,
      status,
      metadata
    )
    values (
      ${`${state.toLowerCase()}-${year}-${entry.equipment.sourceDocumentId}`},
      ${state},
      ${year},
      'equipment_context',
      ${`Verified Voting Verifier ${state} ${year} equipment context`},
      ${entry.equipment.sourceUrl},
      'Verified Voting',
      ${entry.equipment.localArtifact},
      ${entry.equipment.parser},
      'Verified Voting Verifier public API payload collected from the registered source URL.',
      ${entry.equipment.caveat},
      'loaded',
      ${JSON.stringify({
        apiUrl: entry.equipment.apiUrl,
        normalizedArtifact: entry.equipment.normalizedArtifact,
        reportingLevel: entry.equipment.reportingLevel,
      })}::jsonb
    )
    on conflict (slug) do update set
      category = excluded.category,
      title = excluded.title,
      source_url = excluded.source_url,
      authority = excluded.authority,
      local_artifact = excluded.local_artifact,
      parser = excluded.parser,
      timestamp_basis = excluded.timestamp_basis,
      confidence = excluded.confidence,
      status = excluded.status,
      metadata = excluded.metadata
    returning id
  `;

  const [importRun] = await sql`
    insert into import_runs (
      state_code,
      election_year,
      parser,
      source_document_id,
      status,
      summary
    )
    values (
      ${state},
      ${year},
      'equipment-context',
      ${source.id},
      'staged',
      ${JSON.stringify({ source: "Verified Voting Verifier", rows: rows.length })}::jsonb
    )
    returning id
  `;

  await sql`
    delete from equipment_rows
    where state_code = ${state}
      and election_year = ${year}
  `;

  for (const row of rows) {
    const resolvedTag = jurisdictionTagForRow({
      state,
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.jurisdictionName,
      level: row.level || "county",
    });
    const jurisdictionTag = resolvedTag?.startsWith("county:") ? resolvedTag : null;

    await sql`
      insert into jurisdictions (state_code, code, name, level)
      values (${state}, ${row.jurisdictionCode}, ${row.jurisdictionName}, ${row.level || "county"})
      on conflict (state_code, level, code) do update set name = excluded.name
    `;

    await sql`
      insert into equipment_rows (
        import_run_id,
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        jurisdiction_tag,
        level,
        vendor,
        system_name,
        equipment_type,
        usage,
        paper_record,
        standard_system,
        accessible_system,
        absentee_system,
        poll_book_system,
        tabulation,
        registered_voters,
        precincts,
        polling_places,
        metrics,
        source_document_id
      )
      values (
        ${importRun.id},
        ${state},
        ${year},
        ${row.jurisdictionCode},
        ${row.jurisdictionName},
        ${jurisdictionTag},
        ${row.level || "county"},
        ${row.vendor},
        ${row.systemName},
        ${row.equipmentType},
        ${row.usage},
        ${row.paperRecord},
        ${row.standardSystem},
        ${row.accessibleSystem},
        ${row.absenteeSystem},
        ${row.pollBookSystem},
        ${row.tabulation},
        ${numberOrNull(row.registeredVoters)},
        ${numberOrNull(row.precincts)},
        ${numberOrNull(row.pollingPlaces)},
        ${JSON.stringify({
          caveat: row.caveat,
          configurationSignals: listFromPipe(row.configurationSignals),
          sourceGranularity: row.sourceGranularity,
          sourceUrl: row.sourceUrl,
          uniformityNote: row.uniformityNote,
          uniformityWarningRequired: trueString(row.uniformityWarningRequired),
        })}::jsonb,
        ${source.id}
      )
      on conflict (state_code, election_year, level, jurisdiction_code, usage)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        jurisdiction_tag = excluded.jurisdiction_tag,
        vendor = excluded.vendor,
        system_name = excluded.system_name,
        equipment_type = excluded.equipment_type,
        paper_record = excluded.paper_record,
        standard_system = excluded.standard_system,
        accessible_system = excluded.accessible_system,
        absentee_system = excluded.absentee_system,
        poll_book_system = excluded.poll_book_system,
        tabulation = excluded.tabulation,
        registered_voters = excluded.registered_voters,
        precincts = excluded.precincts,
        polling_places = excluded.polling_places,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
  }

  await sql`
    update import_runs
    set
      status = 'promoted',
      finished_at = now(),
      summary = ${JSON.stringify({ source: "Verified Voting Verifier", storedEquipmentRows: rows.length })}::jsonb
    where id = ${importRun.id}
  `;

  console.log(`Promoted ${rows.length} ${state} ${year} equipment context rows.`);
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to promote equipment context.");
  }

  const year = yearToProcess();
  const registry = JSON.parse(await readFile("data/admin-source-packages.json", "utf8"));
  const sql = neon(databaseUrl);

  for (const state of statesToProcess()) {
    await promoteState(sql, registry, state, year);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
