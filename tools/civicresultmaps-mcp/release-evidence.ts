import { createHash } from "node:crypto";
import { lstat, open, readFile } from "node:fs/promises";
import path from "node:path";
import { buildVerificationIdentity, type VerificationIdentity } from "./verification-plan.ts";
import { TEST_PROFILES, type TestProfileName } from "./test-profiles.ts";
import { ensureDirectoryInsideRepo, McpToolError, relativeToRepo, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";

export type CaptureReleaseEvidenceInput = { states: string[]; testRunIds?: string[]; expectedAuditHashes?: Record<string, string>; confirmation: "CAPTURE_RELEASE_EVIDENCE" };
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SHA = /^[a-f0-9]{64}$/;

/** Local evidence capture, not signed CI attestation or publication authorization. */
export async function captureReleaseEvidence(context: RuntimeContext, input: CaptureReleaseEvidenceInput) {
  if (!input || input.confirmation !== "CAPTURE_RELEASE_EVIDENCE" || !Array.isArray(input.states) || input.states.length < 1 || input.states.length > 5 || input.states.some((s) => typeof s !== "string" || !/^[A-Za-z]{2}$/.test(s)) || new Set(input.states.map(s => s.toUpperCase())).size !== input.states.length) throw new McpToolError("invalid_release_evidence_input", "Use one to five unique states and exact CAPTURE_RELEASE_EVIDENCE confirmation.", "Resubmit the bounded release candidate.");
  const ids = input.testRunIds ?? [];
  if (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !RUN_ID.test(id))) throw new McpToolError("invalid_run_id", "testRunIds must be unique bounded audit run IDs.", "Use IDs returned by local audited test profiles.");
  if (input.expectedAuditHashes && (Object.keys(input.expectedAuditHashes).some(id => !ids.includes(id)) || Object.values(input.expectedAuditHashes).some(sha => typeof sha !== "string" || !SHA.test(sha)))) throw new McpToolError("invalid_audit_hash", "Expected audit hashes must be SHA-256 values keyed by selected run ID.", "Use the manifest digest returned by crm_run_test_profile.");
  const identity = await buildVerificationIdentity(context, input.states);
  const runs = await Promise.all(ids.map(id => readRun(context, id, identity, input.expectedAuditHashes?.[id])));
  const localBlockers = [...identity.caveats, ...runs.flatMap(run => run.blockers), ...(!ids.length ? ["No audited test runs were supplied."] : [])];
  const after = await buildVerificationIdentity(context, input.states);
  if (!sameIdentity(identity, after)) localBlockers.push("Candidate identity changed while release evidence was being captured.");
  const record = {
    version: 2, recordedAt: new Date().toISOString(), candidateIdentity: identity,
    testRuns: runs.map(({ retained: _retained, ...run }) => run),
    localEvidenceStatus: localBlockers.length ? "incomplete" : "verified", releaseReady: false,
    deploymentRevision: { status: "unverified" }, databaseRevision: { status: "unverified" },
    blockers: [...localBlockers, "Complete release gates, deployment identity, and database revision have not been verified by this local capture tool."],
    caveat: "Content hashes detect changed evidence relative to a reviewed digest. Local files are not a cryptographic attestation against a malicious filesystem owner. Contract profiles do not replace full CI, data validators, browser verification, or publication approval.",
  };
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`); const sha = digest(bytes);
  const dir = await ensureDirectoryInsideRepo(context, `.etl/release-evidence/${sha}`);
  for (const run of runs) for (const file of run.retained) {
    const runDir = await ensureDirectoryInsideRepo(context, `.etl/release-evidence/${sha}/${run.id}`);
    await immutable(path.join(runDir, file.name), file.bytes, digest(file.bytes));
  }
  const file = path.join(dir, "manifest.json"); await immutable(file, bytes, sha);
  return { status: "local_evidence_recorded_not_release_ready", manifestPath: relativeToRepo(context, file), sha256: sha, record };
}

async function readRun(context: RuntimeContext, id: string, candidate: VerificationIdentity, expectedHash?: string) {
  const blockers: string[] = []; const retained: Array<{ name: string; bytes: Buffer }> = [];
  let manifest: any; let manifestSha256: string | null = null;
  try { const bytes = await safeRead(context, `.etl/mcp-runs/${id}/manifest.json`, 16 * 1024 * 1024); manifestSha256 = digest(bytes); manifest = JSON.parse(bytes.toString("utf8")); retained.push({ name: "manifest.json", bytes }); }
  catch { return { id, manifestSha256, blockers: [`Audit manifest is unavailable or unreadable: ${id}.`], retained }; }
  if (!expectedHash) blockers.push(`Audit run ${id} has no externally retained expected manifest digest.`);
  else if (manifestSha256 !== expectedHash) blockers.push(`Audit run ${id} manifest digest does not match the reviewed digest.`);
  const profile = manifest.profile as TestProfileName;
  const definition = Object.hasOwn(TEST_PROFILES, profile) ? TEST_PROFILES[profile] : null;
  if (!definition || manifest.name !== `test-profile-${profile}`) blockers.push(`Audit run ${id} is not a reviewed test profile.`);
  if (manifest.runId !== id || manifest.status !== "passed") blockers.push(`Audit run ${id} did not pass.`);
  const steps = Array.isArray(manifest.steps) ? manifest.steps : [];
  if (!definition || steps.length !== definition.steps.length || steps.some((step: any, index: number) => step.exitCode !== 0 || step.timedOut !== false || step.wasCancelled !== false || step.outputLimitExceeded !== false || step.spawnError !== null || JSON.stringify(step.args) !== JSON.stringify(definition?.steps[index]?.args) || step.label !== definition?.steps[index]?.label)) blockers.push(`Audit run ${id} is missing successful exact reviewed steps.`);
  const before = manifest.verificationIdentityBefore, after = manifest.verificationIdentityAfter;
  if (!sameIdentity(before, after)) blockers.push(`Audit run ${id} has incomplete identity or changed during execution.`);
  if (!matchesCandidate(candidate, before)) blockers.push(`Audit run ${id} did not test the exact candidate code and selected staging artifacts.`);
  const logs = Array.isArray(manifest.logHashes) ? manifest.logHashes : [];
  const expectedLogs = steps.flatMap((_step: unknown, index: number) => ["stdout", "stderr"].map(stream => `${String(index + 1).padStart(2, "0")}-${stream}.log`));
  if (!expectedLogs.length || logs.length !== expectedLogs.length || new Set(logs.map((log: any) => log.path)).size !== logs.length || logs.some((log: any) => !expectedLogs.includes(log.path) || !SHA.test(log.sha256))) blockers.push(`Audit run ${id} has an incomplete or malformed log inventory.`);
  for (const log of logs) try {
    if (!expectedLogs.includes(log.path) || !SHA.test(log.sha256)) throw new Error();
    const bytes = await safeRead(context, `.etl/mcp-runs/${id}/${log.path}`, 8 * 1024 * 1024);
    if (digest(bytes) !== log.sha256) blockers.push(`Audit run ${id} log hash mismatch: ${log.path}.`);
    retained.push({ name: log.path, bytes });
  } catch { blockers.push(`Audit run ${id} log is unavailable or unsafe.`); }
  return { id, manifestSha256, profile: definition ? profile : null, verificationIdentityBefore: before ?? null, verificationIdentityAfter: after ?? null, logHashes: logs, blockers, retained };
}
function sameIdentity(a: VerificationIdentity | undefined, b: VerificationIdentity | undefined) { return Boolean(a?.status === "complete" && b?.status === "complete" && a.commitSha === b.commitSha && a.worktreeSha256 === b.worktreeSha256 && JSON.stringify(a.staging) === JSON.stringify(b.staging)); }
function matchesCandidate(candidate: VerificationIdentity, tested: VerificationIdentity | undefined) { return Boolean(tested?.status === "complete" && candidate.status === "complete" && candidate.commitSha === tested.commitSha && candidate.worktreeSha256 === tested.worktreeSha256 && Object.entries(candidate.staging).every(([state, item]) => item.status === "present" && tested.staging?.[state]?.sha256 === item.sha256)); }
async function safeRead(context: RuntimeContext, relative: string, maximum: number) {
  const original = path.join(context.repoRoot, relative); const before = await lstat(original);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw new Error("unsafe evidence file");
  const bytes = await readFile(await resolveReadableInsideRepo(context, relative)); const after = await lstat(original);
  if (!after.isFile() || after.isSymbolicLink() || after.mtimeMs !== before.mtimeMs || after.size !== before.size || bytes.length !== before.size) throw new Error("evidence changed during read");
  return bytes;
}
async function immutable(file: string, bytes: Buffer, sha: string) {
  try { const handle = await open(file, "wx"); try { await handle.writeFile(bytes); } finally { await handle.close(); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes.length || digest(await readFile(file)) !== sha) throw new McpToolError("immutable_evidence_mismatch", "Existing release evidence does not match its content address or is unsafe.", "Do not overwrite evidence."); }
}
function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
