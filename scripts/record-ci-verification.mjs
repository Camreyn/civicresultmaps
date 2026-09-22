import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildVerificationIdentity } from "../tools/civicresultmaps-mcp/verification-plan.ts";
import { createRuntimeContext } from "../tools/civicresultmaps-mcp/runtime.ts";

const required = ["Public-API", "Validate-job", "Typecheck", "Analytics-contract", "MCP", "Layout", "API-contract", "Security", "Equipment-catalog", "ETL", "Native-ETL", "Sources", "Turnout", "Acquisition", "Integrity", "Integrity-requests", "Maps", "Build", "Equipment-browser", "Browser", "Analytics-browser", "Numeric-browser"];
const args = process.argv.slice(2);
if (args.some(value => !/^[A-Za-z-]{1,40}=(success|failure|skipped|cancelled)$/.test(value))) throw new Error("Only fixed gate outcomes are accepted.");
const steps = args.map(value => { const [name, outcome] = value.split("="); return { name, outcome }; });
if (steps.some(step => !required.includes(step.name)) || new Set(steps.map(step => step.name)).size !== steps.length) throw new Error("Unknown or duplicate CI gate.");
const identity = await buildVerificationIdentity(createRuntimeContext());
const trustedContext = process.env.GITHUB_ACTIONS === "true" && /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") && identity.commitSha === process.env.GITHUB_SHA;
const missing = required.filter(name => !steps.some(step => step.name === name));
const record = {
  version: 2, capturedAt: new Date().toISOString(), identity,
  source: trustedContext ? "github_actions_step_outcomes" : "unverified_local_invocation",
  runId: trustedContext ? process.env.GITHUB_RUN_ID : null,
  // This is an outcome-record hash, NOT a hash of CI logs. GitHub retains the logs.
  namedStepOutcomes: steps.map(step => ({ ...step, outcomeRecordSha256: createHash("sha256").update(JSON.stringify(step)).digest("hex") })),
  missingGates: missing,
  ciGateStatus: trustedContext && identity.status === "complete" && !missing.length && steps.every(step => step.outcome === "success") ? "passed" : "unverified_or_failed",
  releaseReady: false,
  deploymentRevision: { status: "unverified" }, databaseRevision: { status: "unverified" },
  caveat: "Records the public API job result and fixed validation-step outcomes, not signed attestations or complete logs. Credential-dependent preview deployment/smoke steps are outside this record. No publication decision, deployment identity, or database revision is established. GitHub run/commit context must match the checkout; local caller-provided outcomes are never verified.",
};
await mkdir(".etl/ci-verification", { recursive: true });
await writeFile(".etl/ci-verification/verification-evidence.json", `${JSON.stringify(record, null, 2)}\n`);
