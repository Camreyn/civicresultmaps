import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { WorkspaceLayoutManifestV1 } from "../lib/workspace-layout";

export const importStatus = pgEnum("import_status", [
  "staged",
  "validated",
  "promoted",
  "failed",
]);

export const sourceStatus = pgEnum("source_status", [
  "loaded",
  "candidate",
  "needs_data",
  "superseded",
  "documented_exclusion",
]);

export const uiLayoutEnvironment = pgEnum("ui_layout_environment", ["preview", "production"]);
export const uiLayoutChannel = pgEnum("ui_layout_channel", ["candidate", "stable"]);
export const uiLayoutPublicationAction = pgEnum("ui_layout_publication_action", ["stage", "promote", "rollback"]);
export const uiLayoutPublicationStatus = pgEnum("ui_layout_publication_status", [
  "requested",
  "dispatched",
  "publishing",
  "published",
  "failed",
]);

export const uiLayoutRevisions = pgTable(
  "ui_layout_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemaVersion: integer("schema_version").notNull(),
    registryVersion: integer("registry_version").notNull(),
    manifest: jsonb("manifest").$type<WorkspaceLayoutManifestV1>().notNull(),
    manifestDigest: text("manifest_digest").notNull(),
    parentRevisionId: uuid("parent_revision_id").references((): AnyPgColumn => uiLayoutRevisions.id),
    changeSummary: text("change_summary").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIndex: index("ui_layout_revisions_created_at_idx").on(table.createdAt),
    digestIndex: index("ui_layout_revisions_manifest_digest_idx").on(table.manifestDigest),
    schemaVersionCheck: check("ui_layout_revisions_schema_version_check", sql`${table.schemaVersion} = 1`),
    registryVersionCheck: check("ui_layout_revisions_registry_version_check", sql`${table.registryVersion} = 1`),
    parentRevisionUnique: unique("ui_layout_revisions_parent_revision_unique")
      .on(table.parentRevisionId)
      .nullsNotDistinct(),
  }),
);

export const uiLayoutPublications = pgTable(
  "ui_layout_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id").notNull().references(() => uiLayoutRevisions.id),
    environment: uiLayoutEnvironment("environment").notNull(),
    channel: uiLayoutChannel("channel").notNull(),
    action: uiLayoutPublicationAction("action").notNull(),
    status: uiLayoutPublicationStatus("status").notNull().default("requested"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    workflowRunId: text("workflow_run_id"),
    edgeDigest: text("edge_digest"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    requestedAtIndex: index("ui_layout_publications_requested_at_idx").on(table.requestedAt),
    revisionIndex: index("ui_layout_publications_revision_id_idx").on(table.revisionId),
  }),
);

export const uiLayoutAuditEvents = pgTable(
  "ui_layout_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    revisionId: uuid("revision_id").references(() => uiLayoutRevisions.id),
    publicationId: uuid("publication_id").references(() => uiLayoutPublications.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIndex: index("ui_layout_audit_events_created_at_idx").on(table.createdAt),
  }),
);

export const publicDataRevisions = pgTable(
  "public_data_revisions",
  {
    scope: text("scope").primaryKey().default("public"),
    revision: bigint("revision", { mode: "bigint" }).notNull().default(sql`1`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull().default("migration"),
  },
  (table) => ({
    scopeCheck: check("public_data_revisions_scope_check", sql`${table.scope} = 'public'`),
    revisionCheck: check("public_data_revisions_revision_check", sql`${table.revision} >= 1`),
  }),
);
export const states = pgTable("states", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  authority: text("authority").notNull(),
  countyLabel: text("county_label").notNull().default("County"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jurisdictions = pgTable(
  "jurisdictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateCode: text("state_code").notNull().references(() => states.code),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: text("level").notNull(),
    geometryKey: text("geometry_key"),
  },
  (table) => ({
    uniqueJurisdiction: uniqueIndex("jurisdictions_state_code_level_code_idx").on(
      table.stateCode,
      table.level,
      table.code,
    ),
  }),
);

export const elections = pgTable(
  "elections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    office: text("office").notNull(),
    electionDate: text("election_date").notNull(),
    label: text("label").notNull(),
  },
  (table) => ({
    uniqueElection: uniqueIndex("elections_year_office_idx").on(table.year, table.office),
  }),
);

export const contests = pgTable(
  "contests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id").notNull().references(() => elections.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    office: text("office").notNull(),
    title: text("title").notNull(),
  },
  (table) => ({
    uniqueContest: uniqueIndex("contests_election_state_office_idx").on(
      table.electionId,
      table.stateCode,
      table.office,
    ),
  }),
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id").notNull().references(() => contests.id),
    name: text("name").notNull(),
    party: text("party").notNull(),
    ballotOrder: integer("ballot_order").notNull().default(0),
  },
  (table) => ({
    uniqueCandidate: uniqueIndex("candidates_contest_name_party_idx").on(
      table.contestId,
      table.name,
      table.party,
    ),
  }),
);

export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  stateCode: text("state_code").notNull().references(() => states.code),
  electionYear: integer("election_year").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull(),
  authority: text("authority").notNull(),
  localArtifact: text("local_artifact"),
  parser: text("parser"),
  timestampBasis: text("timestamp_basis").notNull(),
  confidence: text("confidence").notNull(),
  status: sourceStatus("status").notNull().default("candidate"),
  metadata: jsonb("metadata").notNull().default({}),
});

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateCode: text("state_code").notNull().references(() => states.code),
  electionYear: integer("election_year").notNull(),
  parser: text("parser").notNull(),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  status: importStatus("status").notNull().default("staged"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: jsonb("summary").notNull().default({}),
});

export const resultRows = pgTable(
  "result_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    contestId: uuid("contest_id").notNull().references(() => contests.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    level: text("level").notNull(),
    candidateName: text("candidate_name").notNull(),
    party: text("party").notNull(),
    votes: integer("votes").notNull(),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  },
  (table) => ({
    uniqueResult: uniqueIndex("result_rows_contest_jurisdiction_candidate_idx").on(
      table.contestId,
      table.level,
      table.jurisdictionCode,
      table.candidateName,
      table.party,
    ),
  }),
);

export const turnoutRows = pgTable(
  "turnout_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    level: text("level").notNull(),
    ballotsCast: integer("ballots_cast").notNull(),
    registeredVoters: integer("registered_voters"),
    turnoutPct: numeric("turnout_pct", { precision: 8, scale: 4 }),
    denominatorNote: text("denominator_note").notNull(),
    warningRequired: boolean("warning_required").notNull().default(false),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  },
  (table) => ({
    uniqueTurnout: uniqueIndex("turnout_rows_state_year_level_jurisdiction_idx").on(
      table.stateCode,
      table.electionYear,
      table.level,
      table.jurisdictionCode,
    ),
  }),
);

export const reviewRows = pgTable(
  "review_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    localUnit: text("local_unit").notNull().default(""),
    level: text("level").notNull().default("local"),
    demCandidate: text("dem_candidate"),
    repCandidate: text("rep_candidate"),
    demVotes: integer("dem_votes"),
    repVotes: integer("rep_votes"),
    demShare: numeric("dem_share", { precision: 8, scale: 4 }),
    repShare: numeric("rep_share", { precision: 8, scale: 4 }),
    harrisVotes: integer("harris_votes"),
    trumpVotes: integer("trump_votes"),
    totalVotes: integer("total_votes"),
    harrisShare: numeric("harris_share", { precision: 8, scale: 4 }),
    trumpShare: numeric("trump_share", { precision: 8, scale: 4 }),
    demDropoff: numeric("dem_dropoff", { precision: 8, scale: 4 }),
    repDropoff: numeric("rep_dropoff", { precision: 8, scale: 4 }),
    metrics: jsonb("metrics").notNull().default({}),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  },
  (table) => ({
    uniqueReviewRow: uniqueIndex("review_rows_state_year_jurisdiction_local_idx").on(
      table.stateCode,
      table.electionYear,
      table.jurisdictionCode,
      table.localUnit,
    ),
  }),
);

export const historicalResultRows = pgTable(
  "historical_result_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLevel: text("source_level").notNull(),
    rowMethod: text("row_method").notNull().default(""),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    localUnit: text("local_unit").notNull().default(""),
    demVotes: integer("dem_votes"),
    repVotes: integer("rep_votes"),
    otherVotes: integer("other_votes"),
    totalVotes: integer("total_votes"),
    metrics: jsonb("metrics").notNull().default({}),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  },
  (table) => ({
    uniqueHistoricalRow: uniqueIndex("historical_rows_state_year_source_local_idx").on(
      table.stateCode,
      table.electionYear,
      table.sourceId,
      table.jurisdictionCode,
      table.localUnit,
    ),
  }),
);

export const equipmentRows = pgTable(
  "equipment_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    level: text("level").notNull().default("county"),
    vendor: text("vendor").notNull().default(""),
    systemName: text("system_name").notNull().default(""),
    equipmentType: text("equipment_type").notNull().default(""),
    usage: text("usage").notNull().default("context"),
    paperRecord: text("paper_record").notNull().default("not_recorded"),
    standardSystem: text("standard_system").notNull().default(""),
    accessibleSystem: text("accessible_system").notNull().default(""),
    absenteeSystem: text("absentee_system").notNull().default(""),
    pollBookSystem: text("poll_book_system").notNull().default(""),
    tabulation: text("tabulation").notNull().default(""),
    registeredVoters: integer("registered_voters"),
    precincts: integer("precincts"),
    pollingPlaces: integer("polling_places"),
    metrics: jsonb("metrics").notNull().default({}),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
  },
  (table) => ({
    uniqueEquipmentRow: uniqueIndex("equipment_rows_state_year_jurisdiction_usage_idx").on(
      table.stateCode,
      table.electionYear,
      table.level,
      table.jurisdictionCode,
      table.usage,
    ),
  }),
);

export const capabilityFlags = pgTable(
  "capability_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    certifiedResults: boolean("certified_results").notNull().default(false),
    map: boolean("map").notNull().default(false),
    reviewGraphs: boolean("review_graphs").notNull().default(false),
    turnout: boolean("turnout").notNull().default(false),
    historicalBaseline: boolean("historical_baseline").notNull().default(false),
    sourcePlanner: boolean("source_planner").notNull().default(true),
    notes: text("notes").notNull().default(""),
  },
  (table) => ({
    uniqueCapabilities: uniqueIndex("capability_flags_state_year_idx").on(
      table.stateCode,
      table.electionYear,
    ),
  }),
);

export const validationReports = pgTable("validation_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  stateCode: text("state_code").notNull().references(() => states.code),
  electionYear: integer("election_year").notNull(),
  passed: boolean("passed").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  errors: jsonb("errors").notNull().default([]),
  warnings: jsonb("warnings").notNull().default([]),
  metrics: jsonb("metrics").notNull().default({}),
});

export const analysisIndicators = pgTable(
  "analysis_indicators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateCode: text("state_code").notNull().references(() => states.code),
    electionYear: integer("election_year").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    jurisdictionTag: text("jurisdiction_tag"),
    level: text("level").notNull(),
    indicatorType: text("indicator_type").notNull(),
    severity: numeric("severity", { precision: 10, scale: 4 }).notNull(),
    label: text("label").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    metrics: jsonb("metrics").notNull().default({}),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueIndicator: uniqueIndex("analysis_indicators_unique_idx").on(
      table.stateCode,
      table.electionYear,
      table.level,
      table.jurisdictionCode,
      table.indicatorType,
      table.label,
    ),
  }),
);
