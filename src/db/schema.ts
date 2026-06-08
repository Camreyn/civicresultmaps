import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
