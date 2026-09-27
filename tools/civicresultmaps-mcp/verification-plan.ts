import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { McpToolError, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";

export type VerificationPlanInput = { states?: string[] };
export type VerificationIdentity = { commitSha: string | null; worktreeSha256: string | null; relevantFiles: Array<{ path: string; sha256: string }>; staging: Record<string, { sha256: string | null; status: "present" | "missing" | "unreadable" }>; status: "complete" | "inconclusive"; caveats: string[] };
const STATE = /^[A-Za-z]{2}$/; const MAX_STATES = 5;
const RELEVANT_ROOTS = ["src", "tools", "tests", "etl", "scripts", ".github", "drizzle", "civic_etl"];
const MAX_HASH_BYTES = 4 * 1024 * 1024 * 1024;

/** Read-only, conservative verifier selection. Unknown/core changes always retain the full gate. */
export async function planVerification(context: RuntimeContext, input: VerificationPlanInput = {}) {
  const states = validateStates(input.states); let changed: string[]; let changedUnavailable = false; try { changed = await changedPaths(context); } catch { changed = ["<git-status-unavailable>"]; changedUnavailable = true; }
  const identity = await buildVerificationIdentity(context, states);
  const full = changedUnavailable || changed.some((file) => isGlobal(file) || !isKnownFocused(file));
  const focused = new Set<string>();
  for (const file of changed) {
    if (file.startsWith("tools/civicresultmaps-mcp/") || file.startsWith("tests/api/")) focused.add("mcp-contract");
    if (file.startsWith("src/app/api/") || file.startsWith("tests/api/")) focused.add("api-contract");
    if (file.startsWith("etl/") || file.startsWith("civic_etl/")) focused.add("etl");
  }
  return { status: identity.status === "complete" ? "planned" : "inconclusive", changedPaths: changed, identity, recommendations: { focusedProfiles: [...focused].sort(), requiredGlobalGates: ["typecheck", "test", "build", "validate:source-packages", "validate:turnout-packages", "validate:maps", "validate:provenance"], fullTestRequired: full, caveat: full ? "A shared, unknown, data-rule, CI, or core path changed; focused checks never replace the full test requirement." : "Focused recommendations are additive and do not establish release readiness." } };
}

/** Identity binds a commit, relevant checked-out contents (including dirty/untracked files), and exact state staging bytes. */
export async function buildVerificationIdentity(context: RuntimeContext, states: string[] = []): Promise<VerificationIdentity> {
  const selected = validateStates(states); const caveats: string[] = []; let commitSha: string | null = null;
  try { commitSha = (await git(context, ["rev-parse", "HEAD"])).trim(); if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error(); } catch { caveats.push("Full Git commit identity is unavailable."); }
  let files: string[] = [];
  try { files = await relevantFiles(context); } catch { caveats.push("Relevant worktree paths could not be enumerated safely."); }
  const hashedFiles: Array<{ path: string; sha256: string }> = []; let hashedBytes = 0;
  const started = Date.now(); const signatures = new Map<string, { size: number; mtimeMs: number }>();
  for (const file of files) try {
    const original = path.join(context.repoRoot, file); const info = await lstat(original);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024 * 1024 || (hashedBytes += info.size) > MAX_HASH_BYTES || Date.now() - started > 60_000) throw new Error();
    const target = await resolveReadableInsideRepo(context, file); const bytes = await readFile(target); const after = await lstat(original);
    if (after.isSymbolicLink() || after.size !== info.size || after.mtimeMs !== info.mtimeMs || bytes.length !== info.size) throw new Error();
    hashedFiles.push({ path: file, sha256: digest(bytes) });
    signatures.set(file, { size: after.size, mtimeMs: after.mtimeMs });
  } catch { caveats.push(`Relevant worktree file is unreadable, changed, unsafe, or over the 4 GiB/60-second/256 MiB-per-file bound: ${file}`); }
  try {
    if (JSON.stringify(await relevantFiles(context)) !== JSON.stringify(files)) caveats.push("Relevant path inventory changed during hashing.");
    for (const [file, signature] of signatures) { const now = await lstat(path.join(context.repoRoot, file)); if (now.isSymbolicLink() || now.size !== signature.size || now.mtimeMs !== signature.mtimeMs) throw new Error(); }
  } catch { caveats.push("Relevant worktree contents changed during the identity scan."); }
  if (!files.length) caveats.push("No relevant worktree files were available for deterministic identity.");
  const staging: VerificationIdentity["staging"] = {};
  for (const state of selected) { const relative = `.etl/staging/${state.toLowerCase()}-2024-staging.json`; try { staging[state] = { sha256: digest(await readFile(await resolveReadableInsideRepo(context, relative))), status: "present" }; } catch { staging[state] = { sha256: null, status: "missing" }; caveats.push(`Candidate staging artifact is unavailable for ${state}.`); } }
  const worktreeSha256 = hashedFiles.length === files.length && files.length ? digest(Buffer.from(hashedFiles.sort((a, b) => a.path.localeCompare(b.path)).map((item) => `${item.path}\0${item.sha256}\n`).join(""))) : null;
  return { commitSha, worktreeSha256, relevantFiles: hashedFiles.sort((a,b) => a.path.localeCompare(b.path)), staging, status: commitSha && worktreeSha256 && !caveats.length ? "complete" : "inconclusive", caveats };
}
async function changedPaths(context: RuntimeContext) {
  const parts = (await git(context, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0"); const names: string[] = [];
  for (let index = 0; index < parts.length; index++) { const entry = parts[index]; if (!entry) continue; names.push(entry.slice(3)); if (/[RC]/.test(entry.slice(0, 2)) && parts[index + 1]) names.push(parts[++index]); }
  return [...new Set(names.map((file) => file.replaceAll("\\", "/")))].sort();
}
async function relevantFiles(context: RuntimeContext) { const tracked = (await git(context, ["ls-files", "-z"])).split("\0"); const untracked = (await git(context, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0"); const deleted = new Set((await git(context, ["ls-files", "--deleted", "-z"])).split("\0")); return [...new Set([...tracked, ...untracked].filter((file) => file && !deleted.has(file) && relevant(file)))].sort(); }
function relevant(file: string) { return (!file.includes("/") && !/\.(md|png|svg|ico)$/i.test(file) && !file.startsWith(".env")) || RELEVANT_ROOTS.some((root) => file.startsWith(`${root}/`)) || (file.startsWith("data/") && /\.(json|geojson|mjs|js|ts)$/i.test(file)); }
function isGlobal(file: string) { return file.startsWith(".github/") || file === "package.json" || file === "package-lock.json" || file.startsWith("src/lib/") || file.startsWith("civic_etl/"); }
function isKnownFocused(file: string) { return file.startsWith("tools/civicresultmaps-mcp/") || file.startsWith("tests/api/") || file.startsWith("src/app/api/") || file.startsWith("etl/") || file.startsWith("scripts/"); }
function validateStates(states: string[] | undefined) { const value = states ?? []; if (!Array.isArray(value) || value.length > MAX_STATES || value.some((x) => typeof x !== "string" || !STATE.test(x)) || new Set(value.map((x) => x.toUpperCase())).size !== value.length) throw new McpToolError("invalid_verification_plan_input", "states must contain up to five unique two-letter codes.", "Use a bounded state list."); return value.map((x) => x.toUpperCase()).sort(); }
async function git(context: RuntimeContext, args: string[]) { return await new Promise<string>((resolve, reject) => execFile("git", args, { cwd: context.repoRoot, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout))); }
function digest(value: Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
