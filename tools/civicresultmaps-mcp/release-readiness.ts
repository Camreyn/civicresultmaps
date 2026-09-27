import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { repoSnapshot, resolveReadableInsideRepo, type RuntimeContext } from "./runtime.ts";
import { loadStateCatalog } from "./catalog.ts";
import { calculateStagedIndicators, compareFamilyRows, sourceProjectionContext, type ProjectionFamily } from "./projection.ts";
import { RESULT_LEVELS } from "./evidence.ts";
type Json = Record<string, unknown>;
type Family = ProjectionFamily;
type Target = "local" | "production";
export type PublicApiRead = {
    rows: Json[];
    complete: boolean;
    source: string | null;
    endpoint: string;
    capturedAt: string;
    error?: string;
    meta?: Json;
};
export type ReleaseReadinessInput = {
    states: string[];
    target?: Target;
    expectedArtifactHashes?: Record<string, string>;
    maxArtifactAgeHours?: number;
};
export type ReleaseReadinessDependencies = {
    readApi?: (request: {
        target: Target;
        state: string;
        year?: number;
        family: Family | "jurisdictions";
        level?: string;
    }) => Promise<PublicApiRead>;
    now?: () => Date;
};
const MAX_AGE_HOURS = 24;
/** Read-only projection for human review; a pass never authorizes publication. */
export async function buildReleaseReadiness(context: RuntimeContext, input: ReleaseReadinessInput, dependencies: ReleaseReadinessDependencies = {}) {
    const target = input.target ?? "production";
    if (target !== "local" && target !== "production")
        throw new Error("target must be local or production.");
    const states = await normalizeStates(context, input.states), maxAgeHours = validateMaxAge(input.maxArtifactAgeHours);
    validateExpectedHashes(input.expectedArtifactHashes, states);
    const now = dependencies.now?.() ?? new Date(), repository = await repoSnapshot(context), reports = await Promise.all(states.map(s => inspectState(context, s, target, input, dependencies, now, maxAgeHours)));
    const blockers = reports.flatMap(r => r.blockers.map(m => `${r.state}: ${m}`));
    if (repository.dirty !== false)
        blockers.push("Repository state is dirty or unavailable; the staged artifact cannot be tied reproducibly to the reviewed source tree.");
    const status = blockers.length ? (reports.some(r => r.status === "inconclusive") ? "inconclusive" : "fail") : "pass";
    return { status, generatedAt: now.toISOString(), target, candidateStates: states, publishAuthorization: false, message: status === "pass" ? "Readiness checks passed. This report is not authorization to publish and does not perform a promotion." : "Readiness is blocked or incomplete; no publication action was taken.", repository, blockers, unperformedChecks: ["No importer, validator suite, database write, production promotion, SQL query, or website mutation was run."], states: reports };
}
async function inspectState(context: RuntimeContext, state: string, target: Target, input: ReleaseReadinessInput, deps: ReleaseReadinessDependencies, now: Date, maxAgeHours: number) {
    const path = `.etl/staging/${state.toLowerCase()}-2024-staging.json`;
    let file: string;
    try {
        file = await resolveReadableInsideRepo(context, path);
    }
    catch {
        return stateFailure(state, path, "Staging artifact is missing, unreadable, or resolves outside the trusted repository.");
    }
    let bytes: Buffer, modifiedAt: string, artifact: Json;
    try {
        [bytes, modifiedAt] = await Promise.all([readFile(file), stat(file).then(x => x.mtime.toISOString())]);
        artifact = JSON.parse(bytes.toString("utf8")) as Json;
    }
    catch {
        return stateFailure(state, path, "Staging artifact is malformed or unreadable.");
    }
    const native = asRecord(artifact.native);
    if (!native || code(asRecord(artifact.state)?.code) !== state || Number(asRecord(artifact.election)?.year) !== 2024)
        return stateFailure(state, path, "Staging artifact identity or native section is invalid.");
    const sha256 = digest(bytes), blockers: string[] = [];
    const expected = Object.entries(input.expectedArtifactHashes ?? {}).find(([key]) => code(key) === state)?.[1];
    if (expected && expected !== sha256)
        blockers.push("Artifact SHA-256 does not match expectedArtifactHashes.");
    const ageHours = (now.getTime() - new Date(modifiedAt).getTime()) / 3600000;
    if (!Number.isFinite(ageHours) || ageHours < -.1 || ageHours > maxAgeHours)
        blockers.push("Artifact is stale or has an invalid modification time.");
    const validation = asRecord(artifact.validation);
    if (validation?.passed !== true)
        blockers.push("Artifact does not record validation.passed === true.");
    const sources = rows(artifact.sources);
    if (!sources.length)
        blockers.push("Artifact has no source records.");
    blockers.push(...sourceMetadata(artifact.sources, sources), ...sourceLinkage(native, sources));
    let plans: Plan[];
    try {
        plans = await plansFor(context, artifact, native, state);
    }
    catch (error) {
        blockers.push(`Source projection context is invalid: ${error instanceof Error ? error.message : String(error)}.`);
        plans = [];
    }
    const checks = await Promise.all(plans.map(p => checkPlan(state, target, p, deps.readApi)));
    for (const check of checks)
        if (check.status !== "pass")
            blockers.push(...check.blockers);
    try {
        if (digest(await readFile(await resolveReadableInsideRepo(context, path))) !== sha256)
            blockers.push("Artifact changed while readiness evidence was being collected.");
    }
    catch {
        blockers.push("Artifact became unreadable or resolves outside the repository while readiness evidence was being collected.");
    }
    return { state, status: blockers.length ? (checks.some(c => c.status === "inconclusive") ? "inconclusive" : "fail") : "pass", artifact: { path, sha256, modifiedAt, ageHours, maxAgeHours, validationPassed: validation?.passed === true, expectedHashMatched: expected ? expected === sha256 : null }, replacementSemantics: semantics(native), checks, blockers: unique(blockers), validationEvidence: validation ?? null };
}
type Plan = {
    family: Family;
    year: number;
    level?: string;
    staged: Json[];
    semantic: "replace" | "upsert";
    sourceSlugs?: Record<string, string>;
    unsupported?: string;
};
async function plansFor(context: RuntimeContext, artifact: Json, native: Json, state: string): Promise<Plan[]> {
    const results = rows(native.resultRows), review = rows(native.reviewRows), historyReview = rows(native.historicalReviewRows), turnout = rows(native.turnoutRows), history = rows(native.historicalRows), sources = rows(artifact.sources), metrics = asRecord(native.metrics), sourceContext = sourceProjectionContext(artifact, state), plans: Plan[] = [];
    const scoped = (value: Omit<Plan, "sourceSlugs">): Plan => ({ ...value, sourceSlugs: sourceContext.sourceSlugs });
    if (results.length)
        for (const level of RESULT_LEVELS)
            plans.push(scoped({ family: "results", year: 2024, level, staged: results.filter(r => (text(r.level) ?? "county") === level), semantic: "replace" }));
    const current = review.length > 0 || (results.length > 0 && Object.hasOwn(metrics ?? {}, "nativeReviewRows"));
    if (current) {
        plans.push(scoped({ family: "review", year: 2024, staged: review, semantic: "replace" }));
        plans.push({ ...await indicatorPlan(context, artifact, state, 2024), sourceSlugs: sourceContext.sourceSlugs });
    }
    for (const year of unique(historyReview.map(r => Number(r.electionYear)).filter(Number.isInteger))) {
        plans.push(scoped({ family: "review", year, staged: historyReview.filter(r => Number(r.electionYear) === year), semantic: "replace" }));
        plans.push({ ...await indicatorPlan(context, artifact, state, year), sourceSlugs: sourceContext.sourceSlugs });
    }
    if (turnout.length)
        plans.push(scoped({ family: "turnout", year: 2024, staged: turnout, semantic: "replace" }));
    if (history.length)
        plans.push(scoped({ family: "historical", year: 2024, staged: history, semantic: "replace" }));
    for (const year of sourceContext.sourceYears)
        plans.push(scoped({ family: "sources", year, staged: sources.filter(row => sourceContext.sourceYearById[String(row.id ?? "")] === year), semantic: "upsert" }));
    return plans;
}
async function indicatorPlan(context: RuntimeContext, artifact: Json, state: string, year: number): Promise<Plan> { try {
    return { family: "indicators", year, staged: await calculateStagedIndicators(context, artifact, state, year), semantic: "replace" };
}
catch (e) {
    return { family: "indicators", year, staged: [], semantic: "replace", unsupported: e instanceof Error ? e.message : String(e) };
} }
async function checkPlan(state: string, target: Target, plan: Plan, readApi: ReleaseReadinessDependencies["readApi"]) {
    const label = `${plan.family}:${plan.year}${plan.level ? `:${plan.level}` : ""}`;
    if (plan.unsupported)
        return inconclusive(plan, label, `Unable to calculate exact staged projection: ${plan.unsupported}`);
    if (!readApi)
        return inconclusive(plan, label, "Fixed public API reader is unavailable.");
    let live: PublicApiRead;
    try {
        live = await readApi({ target, state, family: plan.family, year: plan.family === "historical" ? undefined : plan.year, ...(plan.level ? { level: plan.level } : {}) });
    }
    catch (e) {
        return inconclusive(plan, label, `Public API reader failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!live.complete || live.source !== "database")
        return inconclusive(plan, label, !live.complete ? `Public API read is incomplete${live.error ? `: ${live.error}` : ""}.` : `Public API source is ${live.source ?? "unknown"}, not database.`, live);
    const compared = compareFamilyRows(plan.family, plan.staged, live.rows, { state, year: plan.year, sourceSlugs: plan.sourceSlugs }), blockers = [...compared.duplicates, ...compared.tagConflicts];
    if (plan.semantic === "replace" && compared.removed.length)
        blockers.push(`${label} would remove ${compared.removed.length} public row(s); review the exact bounded samples.`);
    return { family: plan.family, year: plan.year, ...(plan.level ? { level: plan.level } : {}), status: blockers.length ? "fail" : "pass", semantic: plan.semantic, endpoint: live.endpoint, source: live.source, capturedAt: live.capturedAt, complete: true, counts: compared.counts, samples: compared.samples, hashes: compared.sha256, comparisonContract: compared.comparisonContract, blockers, duplicates: compared.duplicates, tagConflicts: compared.tagConflicts };
}
function inconclusive(plan: Plan, label: string, message: string, live?: PublicApiRead) { return { family: plan.family, year: plan.year, ...(plan.level ? { level: plan.level } : {}), status: "inconclusive", semantic: plan.semantic, endpoint: live?.endpoint ?? null, source: live?.source ?? null, capturedAt: live?.capturedAt ?? null, complete: false, counts: null, samples: { added: [], removed: [], changed: [] }, blockers: [`${label}: ${message}`], duplicates: [], tagConflicts: [] }; }
function sourceMetadata(raw: unknown, sources: Json[]) { const issues: string[] = []; if (!Array.isArray(raw) || raw.length !== sources.length)
    issues.push("Artifact sources contains malformed non-object records."); for (const source of sources) {
    if (!text(source.id) || !text(source.authority) || !(text(source.sourceUrl) ?? text(source.url)) || !(text(source.localArtifact) ?? text(source.localFile)) || !text(source.parser))
        issues.push(`Source ${text(source.id) ?? "<missing id>"} lacks required id, authority, URL, retained artifact, or parser metadata.`);
} return unique(issues); }
function sourceLinkage(native: Json, sources: Json[]) { const known = new Set(sources.map(s => text(s.id)).filter(Boolean)), issues: string[] = []; for (const family of ["resultRows", "reviewRows", "historicalReviewRows", "turnoutRows", "historicalRows"]) {
    if (native[family] === undefined && ["historicalRows", "historicalReviewRows"].includes(family))
        continue;
    if (!Array.isArray(native[family])) {
        issues.push(`${family} is missing or malformed.`);
        continue;
    }
    if ((native[family] as unknown[]).length !== rows(native[family]).length)
        issues.push(`${family} contains malformed non-object records.`);
    for (const row of rows(native[family])) {
        const id = text(row.sourceDocumentId) ?? text(row.sourceId);
        if (!id || !known.has(id))
            issues.push(`${family} row has unknown source linkage ${id ?? "<missing>"}.`);
    }
} return unique(issues); }
function semantics(n: Json) { const r = rows(n.resultRows), v = rows(n.reviewRows), h = rows(n.historicalReviewRows), m = asRecord(n.metrics); return { results: r.length ? "replace_all_2024_contest_levels" : "preserve_live_when_empty", review: v.length || (r.length && Object.hasOwn(m ?? {}, "nativeReviewRows")) ? "replace_2024_review_and_indicators" : "preserve_live_when_empty", historicalReview: h.length ? `replace_explicit_years:${unique(h.map(x => String(x.electionYear))).join(",")}` : "preserve_live_when_empty", turnout: rows(n.turnoutRows).length ? "replace_2024_turnout" : "preserve_live_when_empty", historical: rows(n.historicalRows).length ? "replace_all_historical_years" : "preserve_live_when_empty", sources: "upsert_source_documents_by_id" }; }
async function normalizeStates(context: RuntimeContext, values: string[]) { if (!Array.isArray(values) || values.length < 1 || values.length > 5)
    throw new Error("states is required and must contain one to five states."); const states = values.map(code); if (states.some(s => !s) || new Set(states).size !== states.length)
    throw new Error("states must contain unique two-letter codes."); const supported = new Set((await loadStateCatalog(context)).states.map(x => x.code)), bad = states.filter(s => !supported.has(s)); if (bad.length)
    throw new Error(`Unsupported state code(s): ${bad.join(", ")}.`); return states.sort(); }
function validateMaxAge(v: unknown) { const h = v ?? MAX_AGE_HOURS; if (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > 168)
    throw new Error("maxArtifactAgeHours must be an integer from 1 through 168."); return h; }
function validateExpectedHashes(v: unknown, states: string[]) { if (v === undefined)
    return; if (!record(v))
    throw new Error("expectedArtifactHashes must be a state-to-SHA-256 mapping."); const seen = new Set<string>(); for (const [k, d] of Object.entries(v)) {
    const state = code(k);
    if (seen.has(state) || !states.includes(state) || typeof d !== "string" || !/^[a-f0-9]{64}$/.test(d))
        throw new Error("expectedArtifactHashes must contain one lowercase SHA-256 digest per candidate state, without case-colliding keys.");
    seen.add(state);
} }
function stateFailure(state: string, path: string, blocker: string) { return { state, status: "fail", artifact: { path }, replacementSemantics: null, checks: [], blockers: [blocker], validationEvidence: null }; }
function rows(v: unknown): Json[] { return Array.isArray(v) ? v.filter(record) : []; }
function record(v: unknown): v is Json { return Boolean(v) && typeof v === "object" && !Array.isArray(v); }
function asRecord(v: unknown): Json | null { return record(v) ? v : null; }
function text(v: unknown) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function code(v: unknown) { const r = String(v ?? "").toUpperCase(); return /^[A-Z]{2}$/.test(r) ? r : ""; }
function unique<T>(v: T[]) { return [...new Set(v)]; }
function digest(v: Buffer) { return createHash("sha256").update(v).digest("hex"); }
