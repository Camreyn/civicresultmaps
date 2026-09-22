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
const reportedGitHubContext = process.env.GITHUB_ACTIONS === "true" && /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") && identity.commitSha === process.env.GITHUB_SHA;
const missing = required.filter(name => !steps.some(step => step.name === name));
const record = {
  version: 2, capturedAt: new Date().toISOString(), identity,
  source: reportedGitHubContext ? "reported_github_actions_context" : "unverified_local_invocation",
  runId: reportedGitHubContext ? process.env.GITHUB_RUN_ID : null,
  // This is an outcome-record hash, NOT a hash of CI logs. GitHub retains the logs.
  namedStepOutcomes: steps.map(step => ({ ...step, outcomeRecordSha256: createHash("sha256").update(JSON.stringify(step)).digest("hex") })),
  missingGates: missing,
  ciGateStatus: reportedGitHubContext && identity.status === "complete" && !missing.length && steps.every(step => step.outcome === "success") ? "reported_passed" : "unverified_or_failed",
  provenance: { status: "unverified_in_payload", verification: "Retrieve this JSON as the verification-evidence artifact from the matching GitHub Actions run and commit." },
  releaseReady: false,
  deploymentRevision: { status: "unverified" }, databaseRevision: { status: "unverified" },
  caveat: "Records reported public API and fixed validation outcomes, not signed attestations or complete logs. Environment variables are caller-settable, so this payload never labels itself verified or passed; provenance comes from retrieval as the artifact of the matching GitHub-hosted run. Credential-dependent preview deployment/smoke steps are outside this record. No publication decision, deployment identity, or database revision is established.",
};
await mkdir(".etl/ci-verification", { recursive: true });
await writeFile(".etl/ci-verification/verification-evidence.json", `${JSON.stringify(record, null, 2)}\n`);
