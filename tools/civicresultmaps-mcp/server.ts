import {
  McpServer,
  fromJsonSchema,
  type JsonSchemaType,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVER_NAME,
  SERVER_VERSION,
  TOOL_INPUT_SCHEMAS,
  TOOL_OUTPUT_SCHEMA,
  type CompareTarget,
  type ToolEnvelope,
  type ValidatorName,
  type WorkflowMode,
} from "./contracts.ts";
import { createRuntimeContext, type RuntimeContext } from "./runtime.ts";
import { handleCoverageGaps, handleTraceValue, handleReleaseReadiness, handleDeliveryVerification, handleTestProfile, handleSourceRevision, handleDatabaseRehearsal, handleVerificationPlan, handleReleaseEvidence, handleModelValidation } from "./workflow-tools.ts";
import type { SourceRevisionInput } from "./source-revisions.ts";
import type { RehearseDatabaseInput } from "./database-rehearsal.ts";
import type { VerificationPlanInput } from "./verification-plan.ts";
import type { CaptureReleaseEvidenceInput } from "./release-evidence.ts";
import type { ModelValidationInput } from "./model-validation.ts";
import type { CoverageGapsInput } from "./coverage-gaps.ts";
import type { TraceValueInput } from "./trace-value.ts";
import type { ReleaseReadinessInput } from "./release-readiness.ts";
import type { DeliveryVerificationInput } from "./delivery-verification.ts";
import type { RunTestProfileInput } from "./test-profiles.ts";
import {
  errorResult,
  handleCompareStaging,
  handleDoctor,
  handleImportStaging,
  handleReportIndicators,
  handleRunValidator,
  handleStateInventory,
  handleValidateState,
} from "./tools.ts";

type EmptyArgs = Record<string, never>;
type StateArgs = { state: string };
type StateWorkflowArgs = { state: string; workflow?: WorkflowMode };
type IndicatorArgs = { states: string[]; year?: 2016 | 2020 | 2024 };
type CompareArgs = { states: string[]; target?: CompareTarget };
type ValidatorArgs = { validator: ValidatorName };

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};

const ACTION_ANNOTATIONS: ToolAnnotations = {
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  readOnlyHint: false,
};

export function createCivicResultMapsMcpServer(context: RuntimeContext = createRuntimeContext()): McpServer {
  const server = new McpServer(
    {
      description: "Guarded local development and verification tools for CivicResultMaps",
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: "Local CivicResultMaps development only. Inspect first; keep election claims source-driven and advisory. Action tools may write local artifacts or rehearse only a newly created disposable local database and require approval. No production promotion, existing-clone/database mutation, arbitrary shell, SQL, URL, path, or Git publication input is exposed. Synthetic model QA does not forecast elections or produce election outcome probabilities.",
    },
  );

  const outputSchema = fromJsonSchema<ToolEnvelope>(TOOL_OUTPUT_SCHEMA as JsonSchemaType);

  server.registerTool(
    "crm_doctor",
    {
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Inspect the local MCP/runtime setup, state/config coverage, reviewed workflow registry, drift, and deliberately disabled production actions.",
      inputSchema: fromJsonSchema<EmptyArgs>(TOOL_INPUT_SCHEMAS.crm_doctor as JsonSchemaType),
      outputSchema,
      title: "CivicResultMaps MCP doctor",
    },
    async (_args, request) => guarded(context, () => handleDoctor(context), request.mcpReq.signal),
  );

  server.registerTool(
    "crm_state_inventory",
    {
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Summarize one state's metadata, ETL config, source inventories, reviewed workflows, and staging artifact without changing files.",
      inputSchema: fromJsonSchema<StateArgs>(TOOL_INPUT_SCHEMAS.crm_state_inventory as JsonSchemaType),
      outputSchema,
      title: "Inspect state data inventory",
    },
    async ({ state }, request) => guarded(context, () => handleStateInventory(context, state), request.mcpReq.signal),
  );

  server.registerTool(
    "crm_validate_state",
    {
      annotations: ACTION_ANNOTATIONS,
      description: "Run a state's direct ETL validation or its reviewed full preparation/collection and validation workflow. Changed compound workflows are refused.",
      inputSchema: fromJsonSchema<StateWorkflowArgs>(TOOL_INPUT_SCHEMAS.crm_validate_state as JsonSchemaType),
      outputSchema,
      title: "Validate state ETL",
    },
    async ({ state, workflow = "full" }, request) => guarded(
      context,
      () => handleValidateState(context, state, workflow, request.mcpReq.signal),
      request.mcpReq.signal,
    ),
  );

  server.registerTool(
    "crm_import_staging",
    {
      annotations: ACTION_ANNOTATIONS,
      description: "Build one reviewed .etl/staging artifact, verify its identity and digest, and immediately report its advisory-indicator calculation path. Never promotes data.",
      inputSchema: fromJsonSchema<StateWorkflowArgs>(TOOL_INPUT_SCHEMAS.crm_import_staging as JsonSchemaType),
      outputSchema,
      title: "Build state staging artifact",
    },
    async ({ state, workflow = "full" }, request) => guarded(
      context,
      () => handleImportStaging(context, state, workflow, request.mcpReq.signal),
      request.mcpReq.signal,
    ),
  );

  server.registerTool(
    "crm_report_indicators",
    {
      annotations: READ_ONLY_ANNOTATIONS,
      description: "Read current staging artifacts and report review rows, calculated advisory indicators, flagged jurisdictions/areas, indicator types, and evaluation caveats.",
      inputSchema: fromJsonSchema<IndicatorArgs>(TOOL_INPUT_SCHEMAS.crm_report_indicators as JsonSchemaType),
      outputSchema,
      title: "Report staging advisory indicators",
    },
    async ({ states, year = 2024 }, request) => guarded(
      context,
      () => handleReportIndicators(context, states, year),
      request.mcpReq.signal,
    ),
  );

  server.registerTool(
    "crm_compare_staging",
    {
      annotations: ACTION_ANNOTATIONS,
      description: "Run fixed live-versus-staging 2016 coverage and flip reports, require the exact staging overlay, and flag live year or row reductions. Read-only toward production.",
      inputSchema: fromJsonSchema<CompareArgs>(TOOL_INPUT_SCHEMAS.crm_compare_staging as JsonSchemaType),
      outputSchema,
      title: "Compare staging with live data",
    },
    async ({ states, target = "production" }, request) => guarded(
      context,
      () => handleCompareStaging(context, states, target, request.mcpReq.signal),
      request.mcpReq.signal,
    ),
  );

  server.registerTool(
    "crm_run_validator",
    {
      annotations: ACTION_ANNOTATIONS,
      description: "Run one reviewed repository data validator from a fixed enum and direct argv steps. Arbitrary package scripts and production mutations are unavailable.",
      inputSchema: fromJsonSchema<ValidatorArgs>(TOOL_INPUT_SCHEMAS.crm_run_validator as JsonSchemaType),
      outputSchema,
      title: "Run reviewed repository validator",
    },
    async ({ validator }, request) => guarded(
      context,
      () => handleRunValidator(context, validator, request.mcpReq.signal),
      request.mcpReq.signal,
    ),
  );

  server.registerTool("crm_verify_state_delivery", {
    annotations: ACTION_ANNOTATIONS,
    description: "Compare one state/year's reviewed staging with the fixed public API; optionally save isolated browser evidence locally. Seed, capped, unavailable, or unsupported checks stay inconclusive. Never publishes or starts a dev server.",
    inputSchema: fromJsonSchema<DeliveryVerificationInput>(TOOL_INPUT_SCHEMAS.crm_verify_state_delivery as JsonSchemaType),
    outputSchema, title: "Verify state data delivery",
  }, async (args, request) => guarded(context, () => handleDeliveryVerification(context, args, request.mcpReq.signal), request.mcpReq.signal));
  server.registerTool("crm_release_readiness", {
    annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
    description: "Read-only exact candidate-state projection with values, row removals, historical preservation, provenance, and artifact identities. Reports blockers and unperformed checks; does not run validators or authorize publication.",
    inputSchema: fromJsonSchema<ReleaseReadinessInput>(TOOL_INPUT_SCHEMAS.crm_release_readiness as JsonSchemaType),
    outputSchema, title: "Inspect release readiness",
  }, async (args, request) => guarded(context, () => handleReleaseReadiness(context, args, request.mcpReq.signal), request.mcpReq.signal));
  server.registerTool("crm_coverage_gaps", {
    annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
    description: "Aggregate national or selected state/year evidence by data family and explain next-work priorities. Optional fixed API observations never imply browser display or official certification.",
    inputSchema: fromJsonSchema<CoverageGapsInput>(TOOL_INPUT_SCHEMAS.crm_coverage_gaps as JsonSchemaType),
    outputSchema, title: "Inspect national coverage gaps",
  }, async (args, request) => guarded(context, () => handleCoverageGaps(context, args, request.mcpReq.signal), request.mcpReq.signal));
  server.registerTool("crm_trace_value", {
    annotations: READ_ONLY_ANNOTATIONS,
    description: "Trace a selected staged numeric field through recorded source/parser/artifact evidence. Reports ambiguity and missing lineage; verifies retained hashes only against declared reviewed digests. Does not claim public display or infer page/cell references.",
    inputSchema: fromJsonSchema<TraceValueInput>(TOOL_INPUT_SCHEMAS.crm_trace_value as JsonSchemaType),
    outputSchema, title: "Trace a staged value to its source",
  }, async (args, request) => guarded(context, () => handleTraceValue(context, args), request.mcpReq.signal));
  server.registerTool("crm_run_test_profile", {
    annotations: ACTION_ANNOTATIONS,
    description: "Run a fixed reviewed local test profile with an explicit confirmation and credential-stripped child environment. Saves redacted audit logs. No arbitrary command, argument, environment, or production test input.",
    inputSchema: fromJsonSchema<RunTestProfileInput>(TOOL_INPUT_SCHEMAS.crm_run_test_profile as JsonSchemaType),
    outputSchema, title: "Run a reviewed test profile",
  }, async (args, request) => guarded(context, () => handleTestProfile(context, args, request.mcpReq.signal), request.mcpReq.signal));
  server.registerTool("crm_record_source_revision", {
    annotations: { ...ACTION_ANNOTATIONS, openWorldHint: false },
    description: "Record immutable copies of one config-selected retained source and its parser/staging/config evidence; compare recorded revisions. No fetching, arbitrary paths, or inferred row/page/cell lineage.",
    inputSchema: fromJsonSchema<SourceRevisionInput>(TOOL_INPUT_SCHEMAS.crm_record_source_revision as JsonSchemaType), outputSchema, title: "Record an immutable source revision",
  }, async (args, request) => guarded(context, () => handleSourceRevision(context, args), request.mcpReq.signal));
  server.registerTool("crm_rehearse_database", {
    annotations: ACTION_ANNOTATIONS,
    description: "Run the fixed migration/import/idempotence/rollback/restore rehearsal in a newly labelled disposable loopback Docker database. Existing clones and production cannot be selected. Requires Docker; saves local evidence and cleans up owned resources.",
    inputSchema: fromJsonSchema<RehearseDatabaseInput>(TOOL_INPUT_SCHEMAS.crm_rehearse_database as JsonSchemaType), outputSchema, title: "Rehearse a disposable local database",
  }, async (args, request) => guarded(context, () => handleDatabaseRehearsal(context, args, request.mcpReq.signal), request.mcpReq.signal));
  server.registerTool("crm_plan_verification", {
    annotations: READ_ONLY_ANNOTATIONS, description: "Inspect changed files and exact candidate identities; recommend focused checks while retaining global release gates. Does not run tests or authorize release.",
    inputSchema: fromJsonSchema<VerificationPlanInput>(TOOL_INPUT_SCHEMAS.crm_plan_verification as JsonSchemaType), outputSchema, title: "Plan change-aware verification",
  }, async (args, request) => guarded(context, () => handleVerificationPlan(context, args), request.mcpReq.signal));
  server.registerTool("crm_capture_release_evidence", {
    annotations: { ...ACTION_ANNOTATIONS, openWorldHint: false }, description: "Capture immutable local candidate/test evidence using actual audited profiles, reviewed manifest hashes, and exact code/staging identity matches. Missing or stale evidence blocks local verification; deployment and database revisions remain unverified. Never release approval.",
    inputSchema: fromJsonSchema<CaptureReleaseEvidenceInput>(TOOL_INPUT_SCHEMAS.crm_capture_release_evidence as JsonSchemaType), outputSchema, title: "Capture release-candidate evidence",
  }, async (args, request) => guarded(context, () => handleReleaseEvidence(context, args), request.mcpReq.signal));
  server.registerTool("crm_validate_model", {
    annotations: { ...ACTION_ANNOTATIONS, openWorldHint: false }, description: "Run fixed synthetic nonpolitical inference-algorithm diagnostics and inspect staging structure/provenance readiness. Does not fit actual election results, predict outcomes, or assign party/candidate scores or probabilities. Always experimental, never publication eligible.",
    inputSchema: fromJsonSchema<ModelValidationInput>(TOOL_INPUT_SCHEMAS.crm_validate_model as JsonSchemaType), outputSchema, title: "Run synthetic statistical QA",
  }, async (args, request) => guarded(context, () => handleModelValidation(context, args, request.mcpReq.signal), request.mcpReq.signal));
  return server;
}

async function guarded(
  context: RuntimeContext,
  operation: () => ReturnType<typeof handleDoctor>,
  signal?: AbortSignal,
) {
  try {
    if (signal?.aborted) throw new DOMException("The MCP request was cancelled.", "AbortError");
    return await operation();
  } catch (error) {
    return errorResult(context, error);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  serveStdio(() => createCivicResultMapsMcpServer(), {
    legacy: "serve",
    onerror(error) {
      console.error(`[${SERVER_NAME}]`, error);
    },
  });
  console.error(`${SERVER_NAME} ${SERVER_VERSION} running over stdio`);
}
