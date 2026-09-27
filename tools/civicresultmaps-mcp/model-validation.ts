import { loadStateCatalog } from "./catalog.ts";
import { parseJsonOutput, runAuditedWorkflow, stepPassed, type AuditedRun, type RuntimeContext } from "./runtime.ts";
import { sanitizedTestEnvironment } from "./test-profiles.ts";
import type { WorkflowStep } from "./workflows.ts";

export const MODEL_VALIDATION_CONFIRMATION = "VALIDATE_EXPERIMENTAL_MODEL" as const;
export const MODEL_VALIDATION_OUTPUT_DIRECTORY = ".etl/mcp-runs";

export type ModelValidationInput = {
  states: string[];
  seed?: number;
  confirmation: typeof MODEL_VALIDATION_CONFIRMATION;
};
export type ValidatedModelValidationInput = Required<ModelValidationInput>;

export function validateModelValidationInput(input: ModelValidationInput): ValidatedModelValidationInput {
  if (typeof input !== "object" || input === null || Object.keys(input).some((key) => !["states", "seed", "confirmation"].includes(key))) throw new Error("only states, seed, and confirmation are accepted");
  if (!input || !Array.isArray(input.states) || input.states.length < 1 || input.states.length > 5) throw new Error("states must contain one to five entries");
  const states = input.states.map((state) => String(state).toUpperCase());
  if (states.some((state) => !/^[A-Z]{2}$/.test(state)) || new Set(states).size !== states.length) throw new Error("states must be unique two-letter codes");
  if (input.confirmation !== MODEL_VALIDATION_CONFIRMATION) throw new Error("confirmation must be VALIDATE_EXPERIMENTAL_MODEL");
  const seed = input.seed ?? 20260908;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2_147_483_647) throw new Error("seed must be a bounded safe integer");
  return { states, seed, confirmation: MODEL_VALIDATION_CONFIRMATION };
}

export function modelValidationStep(input: ValidatedModelValidationInput): WorkflowStep {
  return {
    args: ["-m", "civic_etl.model_validation", "--states", input.states.join(","), "--seed", String(input.seed)],
    label: "Run fixed synthetic model QA and staging-readiness inspection",
    runtime: "python",
  };
}

export async function buildModelValidation(context: RuntimeContext, input: ModelValidationInput, signal?: AbortSignal): Promise<{ report: Record<string, unknown>; run: AuditedRun }> {
  const validated = validateModelValidationInput(input);
  const catalog = await loadStateCatalog(context);
  const knownStates = new Set(catalog.states.map((state) => state.code));
  if (validated.states.some((state) => !knownStates.has(state))) throw new Error("states must be present in the CivicResultMaps catalog");
  const run = await runAuditedWorkflow({ context, environment: sanitizedTestEnvironment(context), name: "synthetic-model-validation", signal, steps: [modelValidationStep(validated)], timeoutMs: 120_000 });
  if (!stepPassed(run.steps[0])) return { report: { experimental: true, publicationEligible: false, electionForecastingSupported: false, status: "inconclusive", reason: "fixed synthetic runner failed, timed out, or was cancelled; inspect audited run logs" }, run };
  try {
    const parsed = parseJsonOutput(run.steps[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid report");
    return { report: { ...(parsed as Record<string, unknown>), experimental: true, publicationEligible: false, electionForecastingSupported: false }, run };
  } catch {
    return { report: { experimental: true, publicationEligible: false, electionForecastingSupported: false, status: "inconclusive", reason: "fixed synthetic runner returned an invalid report; inspect audited run logs" }, run };
  }
}

export function experimentalModelWarning() {
  return "Synthetic inference QA plus structural/provenance readiness counts only; no actual election results are fitted, predicted, scored, or ranked.";
}
