import { createHash } from "node:crypto";
import type { ToolEnvelope } from "./contracts.ts";
import { requireCatalogState } from "./catalog.ts";
import { repoSnapshot, type RuntimeContext, type AuditedRun } from "./runtime.ts";
import { createEvidenceReader } from "./evidence.ts";
import { buildCoverageGaps, type CoverageGapsInput } from "./coverage-gaps.ts";
import { buildTraceValue, type TraceValueInput } from "./trace-value.ts";
import { buildReleaseReadiness, type ReleaseReadinessInput } from "./release-readiness.ts";
import { buildDeliveryVerification, type DeliveryVerificationInput } from "./delivery-verification.ts";
import { createDeliveryBrowserAdapter } from "./delivery-browser.ts";
import { runTestProfile, type RunTestProfileInput } from "./test-profiles.ts";
import { recordSourceRevision, type SourceRevisionInput } from "./source-revisions.ts";
import { rehearseDatabase, type RehearseDatabaseInput } from "./database-rehearsal.ts";
import { planVerification, type VerificationPlanInput } from "./verification-plan.ts";
import { captureReleaseEvidence, type CaptureReleaseEvidenceInput } from "./release-evidence.ts";
import { buildModelValidation, type ModelValidationInput } from "./model-validation.ts";

export async function handleCoverageGaps(context: RuntimeContext, input: CoverageGapsInput, signal?: AbortSignal) {
  const report = await buildCoverageGaps(context, input, { readPublicApi: createEvidenceReader({ signal }) });
  return reportResult(context, "Coverage gap inventory generated; API observations do not establish browser display.", report);
}
export async function handleTraceValue(context: RuntimeContext, input: TraceValueInput) {
  await requireCatalogState(context, input.state);
  const report = await buildTraceValue(context, input);
  return reportResult(context, "Staged value trace completed; inspect lineage status and missing evidence before treating it as verified.", report);
}
export async function handleReleaseReadiness(context: RuntimeContext, input: ReleaseReadinessInput, signal?: AbortSignal) {
  const report = await buildReleaseReadiness(context, input, { readApi: createEvidenceReader({ signal }) });
  return reportResult(context, `Release readiness: ${report.status}. This is not publication authorization.`, report);
}
export async function handleDeliveryVerification(context: RuntimeContext, input: DeliveryVerificationInput, signal?: AbortSignal) {
  await requireCatalogState(context, input.state);
  const report = await buildDeliveryVerification(context, input, {
    readApi: createEvidenceReader({ signal }),
    browser: createDeliveryBrowserAdapter(context, { signal }),
  });
  return reportResult(context, `State delivery verification: ${report.status}. Review each data and browser check.`, report);
}
export async function handleTestProfile(context: RuntimeContext, input: RunTestProfileInput, signal?: AbortSignal) {
  for (const state of input.states ?? []) await requireCatalogState(context, state);
  const { report, run } = await runTestProfile(context, input, signal);
  return reportResult(context, `Test profile ${input.profile}: ${report.status}.`, report, run);
}

export async function handleSourceRevision(context: RuntimeContext, input: SourceRevisionInput) {
  await requireCatalogState(context, input.state);
  return reportResult(context, "Retained source revision recorded locally; inspect digest and lineage caveats.", await recordSourceRevision(context, input));
}
export async function handleDatabaseRehearsal(context: RuntimeContext, input: RehearseDatabaseInput, signal?: AbortSignal) {
  const report = await rehearseDatabase(context, input, signal);
  return reportResult(context, `Disposable local database rehearsal: ${report.status}.`, report);
}
export async function handleVerificationPlan(context: RuntimeContext, input: VerificationPlanInput) {
  for (const state of input.states ?? []) await requireCatalogState(context, state);
  return reportResult(context, "Change-aware verification plan generated. Recommended checks have not been run.", await planVerification(context, input));
}
export async function handleReleaseEvidence(context: RuntimeContext, input: CaptureReleaseEvidenceInput) {
  for (const state of input.states) await requireCatalogState(context, state);
  return reportResult(context, "Local release-candidate evidence captured; not publication approval.", await captureReleaseEvidence(context, input));
}
export async function handleModelValidation(context: RuntimeContext, input: ModelValidationInput, signal?: AbortSignal) {
  for (const state of input.states) await requireCatalogState(context, state);
  const { report, run } = await buildModelValidation(context, input, signal);
  return reportResult(context, "Synthetic inference diagnostics and data-readiness inspection completed. No election forecast or outcome probability is produced.", report, run);
}

async function reportResult(context: RuntimeContext, summary: string, result: unknown, run?: AuditedRun) {
  const structuredContent: ToolEnvelope = {
    ok: true,
    repo: run?.postRunRepo ?? await repoSnapshot(context),
    result: { ...(result as Record<string, unknown>), reportSha256: createHash("sha256").update(JSON.stringify(result)).digest("hex") },
    ...(run ? { run: run.reference } : {}),
    warnings: ["No production publication or production database mutation was performed. A completed tool call is not a passing verification report."],
  };
  return { content: [{ type: "text" as const, text: summary }], structuredContent };
}
