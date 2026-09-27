export const SERVER_NAME = "civicresultmaps-local-development";
export const SERVER_VERSION = "0.3.0";

export const TOOL_NAMES = [
  "crm_doctor",
  "crm_state_inventory",
  "crm_validate_state",
  "crm_import_staging",
  "crm_report_indicators",
  "crm_compare_staging",
  "crm_run_validator",
  "crm_verify_state_delivery",
  "crm_release_readiness",
  "crm_coverage_gaps",
  "crm_trace_value",
  "crm_run_test_profile",
  "crm_record_source_revision",
  "crm_rehearse_database",
  "crm_plan_verification",
  "crm_capture_release_evidence",
  "crm_validate_model",
] as const;

export const VALIDATOR_NAMES = [
  "admin-packages",
  "electronic-integrity",
  "electronic-integrity-requests",
  "equipment-catalog",
  "equipment-editorial",
  "equipment-production",
  "jurisdiction-tags",
  "maps",
  "provenance",
  "security-incidents",
  "source-acquisition-tiers",
  "source-packages",
  "source-records-requests",
  "turnout-packages",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export type ValidatorName = (typeof VALIDATOR_NAMES)[number];
export type WorkflowMode = "config-only" | "full";
export type CompareTarget = "local" | "production";
export type JsonSchema = Record<string, unknown>;

export type RepoSnapshot = {
  changedFiles: number | null;
  commit: string | null;
  dirty: boolean | null;
  root: string;
};

export type RunReference = {
  auditPath: string;
  durationMs: number;
  id: string;
  status: "failed" | "passed";
};

export type ToolEnvelope = {
  ok: boolean;
  repo: RepoSnapshot;
  result: unknown;
  run?: RunReference;
  warnings: string[];
};

const stateSchema: JsonSchema = {
  description: "Two-letter U.S. state or District of Columbia code.",
  pattern: "^[A-Za-z]{2}$",
  type: "string",
};

const statesSchema: JsonSchema = {
  description: "One to five unique state codes.",
  items: stateSchema,
  maxItems: 5,
  minItems: 1,
  type: "array",
  uniqueItems: true,
};

const reportYearSchema: JsonSchema = { type: "integer", enum: [2012, 2016, 2020, 2024] };
const targetSchema: JsonSchema = { type: "string", enum: ["local", "production"] };
const digestSchema: JsonSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
const selectorSchema: JsonSchema = { type: "string", minLength: 1, maxLength: 240, pattern: "^[^\\u0000\\r\\n]+$" };

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
    type: "object",
  };
}

export const TOOL_INPUT_SCHEMAS: Record<ToolName, JsonSchema> = {
  crm_doctor: objectSchema({}),
  crm_state_inventory: objectSchema({ state: stateSchema }, ["state"]),
  crm_validate_state: objectSchema({
    state: stateSchema,
    workflow: {
      default: "full",
      description: "Use the reviewed full state workflow or only the config-driven Python validator.",
      enum: ["full", "config-only"],
      type: "string",
    },
  }, ["state"]),
  crm_import_staging: objectSchema({
    state: stateSchema,
    workflow: {
      default: "full",
      description: "Use the reviewed full state workflow or only the config-driven Python importer.",
      enum: ["full", "config-only"],
      type: "string",
    },
  }, ["state"]),
  crm_report_indicators: objectSchema({
    states: statesSchema,
    year: {
      default: 2024,
      description: "Election year to evaluate from current or historical review rows.",
      enum: [2016, 2020, 2024],
      type: "integer",
    },
  }, ["states"]),
  crm_compare_staging: objectSchema({
    states: statesSchema,
    target: {
      default: "production",
      description: "Fixed read-only API base used for the live side of the comparison.",
      enum: ["production", "local"],
      type: "string",
    },
  }, ["states"]),
  crm_run_validator: objectSchema({
    validator: {
      description: "Reviewed repository validator. Arbitrary package scripts are not accepted.",
      enum: [...VALIDATOR_NAMES],
      type: "string",
    },
  }, ["validator"]),
  crm_verify_state_delivery: objectSchema({
    state: stateSchema, year: reportYearSchema, target: targetSchema,
    browser: { type: "boolean", default: false, description: "Also launch an isolated unauthenticated browser and save a local screenshot. Does not start a dev server." },
    browserMode: { type: "string", enum: ["values", "smoke"], default: "values", description: "values reconciles rendered county table cells, joined map tooltips, and up to five drawers with staging-verified API rows; smoke checks page structure only." },
    expectedStagingSha256: digestSchema,
  }, ["state", "year", "target"]),
  crm_release_readiness: objectSchema({
    states: statesSchema,
    target: { ...targetSchema, default: "production" },
    expectedArtifactHashes: { type: "object", maxProperties: 5, propertyNames: { pattern: "^[A-Za-z]{2}$" }, additionalProperties: digestSchema },
    maxArtifactAgeHours: { type: "integer", minimum: 1, maximum: 168, default: 24 },
  }, ["states"]),
  crm_coverage_gaps: objectSchema({
    states: { ...statesSchema, description: "Optional one-to-five-state filter. Omit for the complete state/DC catalog." },
    years: { type: "array", items: reportYearSchema, minItems: 1, maxItems: 4, uniqueItems: true, default: [2024] },
    target: { type: "string", enum: ["none", "local", "production"], default: "none", description: "none reads retained evidence only; other choices also perform bounded public API reads." },
  }),
  crm_trace_value: objectSchema({
    state: stateSchema, year: reportYearSchema,
    family: { type: "string", enum: ["results", "review", "turnout", "historical"] },
    field: { type: "string", enum: ["votes", "totalVotes", "harris", "trump", "demVotes", "repVotes", "otherVotes", "harrisShare", "trumpShare", "demShare", "repShare", "demDropoff", "repDropoff", "ballotsCast", "registeredVoters", "turnoutPct", "comparisonDemVotes", "comparisonRepVotes", "comparisonOtherVotes"] },
    candidate: selectorSchema, jurisdictionTag: selectorSchema, jurisdictionName: selectorSchema, sourceId: selectorSchema,
    expectedArtifactDigest: digestSchema,
    sourceRevisionSha256: digestSchema,
  }, ["state", "year", "family", "field"]),
  crm_run_test_profile: objectSchema({
    profile: { type: "string", enum: ["mcp-contract", "api-contract"] },
    states: statesSchema,
    confirmation: { type: "string", const: "RUN_TEST_PROFILE" },
  }, ["profile", "confirmation"]),
  crm_record_source_revision: objectSchema({ state: stateSchema, sourceId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$" }, confirmation: { type: "string", const: "RECORD_SOURCE_REVISION" } }, ["state", "sourceId", "confirmation"]),
  crm_rehearse_database: objectSchema({ profile: { type: "string", enum: ["native-import"] }, confirmation: { type: "string", const: "REHEARSE_LOCAL_DATABASE" } }, ["profile", "confirmation"]),
  crm_plan_verification: objectSchema({ states: statesSchema }),
  crm_capture_release_evidence: objectSchema({ states: statesSchema, testRunIds: { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$" } }, expectedAuditHashes: { type: "object", maxProperties: 20, propertyNames: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$" }, additionalProperties: digestSchema }, confirmation: { type: "string", const: "CAPTURE_RELEASE_EVIDENCE" } }, ["states", "confirmation"]),
  crm_validate_model: objectSchema({ states: statesSchema, seed: { type: "integer", minimum: 0, maximum: 2147483647, default: 20260908 }, confirmation: { type: "string", const: "VALIDATE_EXPERIMENTAL_MODEL" } }, ["states", "confirmation"]),
};

export const TOOL_OUTPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    repo: {
      additionalProperties: false,
      properties: {
        changedFiles: { type: ["integer", "null"] },
        commit: { type: ["string", "null"] },
        dirty: { type: ["boolean", "null"] },
        root: { type: "string" },
      },
      required: ["changedFiles", "commit", "dirty", "root"],
      type: "object",
    },
    result: {},
    run: {
      additionalProperties: false,
      properties: {
        auditPath: { type: "string" },
        durationMs: { minimum: 0, type: "integer" },
        id: { type: "string" },
        status: { enum: ["failed", "passed"], type: "string" },
      },
      required: ["auditPath", "durationMs", "id", "status"],
      type: "object",
    },
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: ["ok", "repo", "result", "warnings"],
  type: "object",
};
