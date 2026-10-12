import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const text = z.string().trim().min(1).max(6000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const nullableDate = date.nullable();
const publicUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash
    && url.hostname.includes(".") && !/^\d+(\.\d+)*$/.test(url.hostname)
    && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
    && !/\.(local|internal)$/i.test(url.hostname)
    && ![...url.searchParams.keys()].some((key) => /token|secret|password|signature|credential/i.test(key));
}, "A public HTTPS source URL without credentials is required");
const review = z.object({ by: text, at: z.string().datetime(), note: text, neutralLanguage: z.literal(true) }).strict();

export const entitySchema = z.object({
  id, label: text, category: text, description: text, geography: z.string().max(120).default("national"),
  identifiers: z.record(z.string().max(200)).default({}),
}).strict();
export const sourceSchema = z.object({
  id, authority: text, title: text, url: publicUrl,
  sourceClass: z.enum(["official", "issuer", "independent", "supplemental"]),
  publishedOn: nullableDate, eventOn: nullableDate,
  latestRevisionId: id.nullable(), legacyCheck: z.object({ checkedOn: date, locator: text, note: text }).strict().nullable(),
}).strict();
export const sourceRevisionSchema = z.object({
  id, sourceId: id, url: publicUrl, retrievedAt: z.string().datetime().nullable(), publishedOn: nullableDate,
  capturedAt: z.string().datetime().optional(), captureMethod: z.enum(["http", "retained_local", "researcher_copy"]).default("http"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive().max(20 * 1024 * 1024),
  contentType: z.enum(["application/pdf", "text/html", "text/plain", "application/json"]),
  completeness: z.enum(["complete", "partial"]),
  artifactPath: z.string().regex(/^connection-sources\/[a-z0-9-]+\/[a-f0-9]{64}\/artifact$/),
}).strict().superRefine((revision, context) => {
  if (revision.artifactPath !== `connection-sources/${revision.sourceId}/${revision.sha256}/artifact`) {
    context.addIssue({ code: "custom", message: "Artifact path must match source and digest" });
  }
});
export const evidenceSchema = z.object({
  id, claimId: id, sourceId: id, revisionId: id.nullable(),
  relation: z.enum(["supports", "contradicts", "context"]),
  locator: z.object({ page: z.number().int().positive().nullable(), section: text, pointer: z.string().max(1000).nullable() }).strict(),
  excerpt: z.string().max(1600), attribution: z.enum(["official_record", "issuer_statement", "independent_reporting", "supplemental"]),
}).strict();
export const claimSchema = z.object({
  id, from: id, to: id, label: text,
  kind: z.enum(["results", "survey", "ownership", "role", "technology", "contract", "inventory"]),
  view: z.enum(["reporting", "ownership", "technology"]), geography: z.string().max(120),
  establishes: text, limitation: text, dated: text,
  observedOn: nullableDate, effectiveFrom: nullableDate, effectiveTo: nullableDate,
  scope: z.enum(["documented", "certified", "procured", "fielded"]),
  state: z.enum(["draft", "in_review", "approved", "published", "superseded", "withdrawn"]),
  review: review.nullable(),
  ownership: z.object({ economicPct: z.number().min(0).max(100).nullable(), votingPct: z.number().min(0).max(100).nullable() }).strict().nullable(),
}).strict().superRefine((claim, context) => {
  if (claim.effectiveFrom && claim.effectiveTo && claim.effectiveTo < claim.effectiveFrom) {
    context.addIssue({ code: "custom", message: "End precedes start" });
  }
  if (claim.scope === "fielded" && (!claim.observedOn || claim.geography === "national")) {
    context.addIssue({ code: "custom", message: "Fielded claims need a dated jurisdiction-specific observation" });
  }
});
export const contractSchema = z.object({
  id, claimId: id, awardId: text, buyer: id, supplier: id, scope: text, currency: z.literal("USD"),
  ceiling: z.number().nonnegative().nullable(), obligated: z.number().nonnegative().nullable(), spent: z.number().nonnegative().nullable(),
  signedOn: nullableDate, startsOn: nullableDate, endsOn: nullableDate,
  amendment: z.string().max(1000),
}).strict();
export const researchQuestionSchema = z.object({
  id, title: text, question: text, needed: text, sourceIds: z.array(id).max(100),
  status: z.enum(["open", "researching", "awaiting_records", "documented", "contradicted", "inconclusive"]),
  geography: z.string().max(120), public: z.boolean(), finding: z.string().max(6000),
  resolutionClaimIds: z.array(id).max(100).default([]),
  searchHistory: z.array(z.object({ date, query: text, outcome: text }).strict()).max(200),
  owner: z.string().max(300), workingNotes: z.string().max(12000),
  custodian: z.object({ name: z.string().max(300), url: publicUrl.nullable(), routingVerifiedOn: nullableDate }).strict(),
}).strict();
export const researchDocumentSchema = z.object({
  schemaVersion: z.literal(2), reviewedOn: date,
  entities: z.array(entitySchema).max(2000), sources: z.array(sourceSchema).max(2000),
  revisions: z.array(sourceRevisionSchema).max(5000), evidence: z.array(evidenceSchema).max(10000),
  claims: z.array(claimSchema).max(5000), contracts: z.array(contractSchema).max(5000), questions: z.array(researchQuestionSchema).max(2000),
  sourceReviews: z.array(z.object({ sourceId: id, revisionId: id, decision: z.enum(["approve", "reject"]), by: text, at: z.string().datetime(), note: text }).strict()).max(10000),
}).strict();
export type ResearchDocument = z.infer<typeof researchDocumentSchema>;
export type ResearchClaim = z.infer<typeof claimSchema>;
export type ResearchEntity = z.infer<typeof entitySchema>;
export type ResearchSourceRevision = z.infer<typeof sourceRevisionSchema>;
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>;
export type ResearchActor = { id: string; email: string; publisher: boolean };

export function validateResearchDocument(input: unknown): ResearchDocument {
  const document = researchDocumentSchema.parse(input);
  for (const records of [document.entities, document.sources, document.revisions, document.evidence, document.claims, document.contracts, document.questions]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate record IDs");
  }
  const entities = new Set(document.entities.map((record) => record.id));
  const sources = new Map(document.sources.map((record) => [record.id, record]));
  const revisions = new Map(document.revisions.map((record) => [record.id, record]));
  const claims = new Map(document.claims.map((record) => [record.id, record]));
  for (const source of document.sources) if (source.latestRevisionId && revisions.get(source.latestRevisionId)?.sourceId !== source.id) throw new Error("Invalid latest source revision");
  for (const revision of document.revisions) if (revision.url !== sources.get(revision.sourceId)?.url) throw new Error("Revision does not match registered source URL");
  for (const claim of document.claims) if (!entities.has(claim.from) || !entities.has(claim.to)) throw new Error("Unknown relationship entity");
  for (const evidence of document.evidence) {
    if (!claims.has(evidence.claimId) || !sources.has(evidence.sourceId)) throw new Error("Unknown evidence claim or source");
    if (evidence.revisionId && revisions.get(evidence.revisionId)?.sourceId !== evidence.sourceId) throw new Error("Evidence revision/source mismatch");
  }
  for (const item of document.sourceReviews) if (revisions.get(item.revisionId)?.sourceId !== item.sourceId) throw new Error("Unknown reviewed source revision");
  for (const contract of document.contracts) if (claims.get(contract.claimId)?.kind !== "contract" || !entities.has(contract.buyer) || !entities.has(contract.supplier)) throw new Error("Contract needs a contract claim and known parties");
  for (const question of document.questions) {
    if (question.sourceIds.some((sourceId) => !sources.has(sourceId))) throw new Error("Unknown research source");
    if (question.resolutionClaimIds.some((claimId) => !claims.has(claimId))) throw new Error("Unknown question resolution claim");
  }
  return document;
}

export function publicationIssues(document: ResearchDocument, claim: ResearchClaim) {
  const issues: string[] = [];
  if (!claim.review?.neutralLanguage) issues.push("Editorial review required");
  const evidence = document.evidence.filter((item) => item.claimId === claim.id);
  if (!evidence.some((item) => item.relation === "supports" && item.attribution !== "supplemental")) issues.push("Primary or independent supporting evidence required");
  for (const item of evidence) {
    const revision = document.revisions.find((record) => record.id === item.revisionId);
    if (!revision) { issues.push(`Retained revision required: ${item.sourceId}`); continue; }
    const decision = document.sourceReviews.filter((record) => record.revisionId === revision.id).at(-1);
    if (decision?.decision !== "approve") issues.push(`Source review required: ${item.sourceId}`);
    const latest = document.sources.find((record) => record.id === item.sourceId)?.latestRevisionId;
    const latestDecision = document.sourceReviews.filter((record) => record.revisionId === latest).at(-1);
    if (latest !== revision.id && latestDecision?.decision !== "approve") issues.push(`Source comparison pending: ${item.sourceId}`);
    if (!item.locator.section.trim()) issues.push("Exact evidence locator required");
  }
  return [...new Set(issues)];
}

/** Whitelist projection: never serialize the private workspace into a public response. */
export function publicResearchDocument(document: ResearchDocument, releaseId: string) {
  const claims = document.claims.filter((claim) => claim.state === "published");
  for (const claim of claims) {
    const issues = publicationIssues(document, claim);
    if (issues.length) throw new Error(`${claim.id}: ${issues.join("; ")}`);
  }
  const claimIds = new Set(claims.map((claim) => claim.id));
  const evidence = document.evidence.filter((item) => claimIds.has(item.claimId));
  const questions = document.questions.filter((question) => question.public);
  for (const question of questions) {
    if ((question.finding.trim() || ["documented", "contradicted"].includes(question.status)) && (!question.resolutionClaimIds.length || question.resolutionClaimIds.some((id) => !claimIds.has(id)))) {
      throw new Error(`Question finding requires published evidence relationships: ${question.id}`);
    }
  }
  const sourceIds = new Set([...evidence.map((item) => item.sourceId), ...questions.flatMap((item) => item.sourceIds)]);
  const revisionIds = new Set(evidence.map((item) => item.revisionId));
  for (const source of document.sources.filter((item) => sourceIds.has(item.id))) {
    const decision = document.sourceReviews.filter((item) => item.revisionId === source.latestRevisionId).at(-1);
    if (decision?.decision === "approve") revisionIds.add(source.latestRevisionId);
  }
  const entityIds = new Set(claims.flatMap((claim) => [claim.from, claim.to]));
  return {
    schemaVersion: 2 as const, releaseId, reviewedOn: document.reviewedOn,
    entities: document.entities.filter((entity) => entityIds.has(entity.id)).map(({ id, label, category, description, geography, identifiers }) => ({ id, label, category, description, geography, identifiers })),
    claims: claims.map(({ review: _review, state: _state, ...claim }) => claim),
    sources: document.sources.filter((source) => sourceIds.has(source.id)).map(({ id, authority, title, url, sourceClass, publishedOn, eventOn }) => ({ id, authority, title, url, sourceClass, publishedOn, eventOn })),
    revisions: document.revisions.filter((revision) => revisionIds.has(revision.id)).map(({ artifactPath: _path, ...revision }) => revision),
    evidence: evidence.map(({ id, claimId, sourceId, revisionId, relation, locator, excerpt, attribution }) => ({ id, claimId, sourceId, revisionId, relation, locator, excerpt, attribution })),
    contracts: document.contracts.filter((contract) => claimIds.has(contract.claimId)),
    questions: questions.map(({ id, title, question, needed, sourceIds, status, geography, finding, resolutionClaimIds }) => ({ id, title, question, needed, sourceIds, status, geography, finding, resolutionClaimIds })),
  };
}
export type PublicResearchDocument = ReturnType<typeof publicResearchDocument>;

/** A replacement release must not silently erase an existing public relationship. */
export function releaseCoverageIssues(document: ResearchDocument, requiredClaimIds: string[]) {
  return requiredClaimIds.filter((id) => !document.claims.some((claim) => claim.id === id && ["published", "withdrawn"].includes(claim.state)));
}

/** Strict public DTO gate protects reads even against a malformed manually inserted release. */
export const publicResearchDocumentSchema = z.object({
  schemaVersion: z.literal(2), releaseId: text, reviewedOn: date,
  entities: z.array(entitySchema),
  claims: z.array(claimSchema.innerType().omit({ state: true, review: true }).strict()),
  sources: z.array(sourceSchema.omit({ latestRevisionId: true, legacyCheck: true }).strict()),
  revisions: z.array(sourceRevisionSchema.innerType().omit({ artifactPath: true }).strict()),
  evidence: z.array(evidenceSchema), contracts: z.array(contractSchema),
  questions: z.array(researchQuestionSchema.omit({ owner: true, workingNotes: true, custodian: true, searchHistory: true, public: true }).strict()),
}).strict();

export function withdrawPublicClaim(snapshot: PublicResearchDocument, claimId: string, releaseId: string): PublicResearchDocument {
  const claims = snapshot.claims.filter((claim) => claim.id !== claimId);
  const evidence = snapshot.evidence.filter((item) => item.claimId !== claimId);
  const entities = new Set(claims.flatMap((claim) => [claim.from, claim.to]));
  const sources = new Set([...evidence.map((item) => item.sourceId), ...snapshot.questions.flatMap((question) => question.sourceIds)]);
  return publicResearchDocumentSchema.parse({
    ...snapshot, releaseId, claims, evidence,
    questions: snapshot.questions.map((question) => question.resolutionClaimIds.includes(claimId) ? { ...question, status: "open", finding: "", resolutionClaimIds: [] } : question),
    entities: snapshot.entities.filter((entity) => entities.has(entity.id)),
    sources: snapshot.sources.filter((source) => sources.has(source.id)),
    revisions: snapshot.revisions.filter((revision) => sources.has(revision.sourceId)),
    contracts: snapshot.contracts.filter((contract) => contract.claimId !== claimId),
  });
}

export function matchesClaimDate(claim: Pick<ResearchClaim, "observedOn" | "effectiveFrom" | "effectiveTo">, asOf: string, mode: "documented" | "active") {
  if (mode === "active") return Boolean(claim.effectiveFrom && claim.effectiveTo && claim.effectiveFrom <= asOf && claim.effectiveTo >= asOf);
  return Boolean(claim.observedOn && claim.observedOn <= asOf);
}

export function connectionPath(claims: PublicResearchDocument["claims"], from: string, to: string, dataRoute = false): string[] {
  if (from === to) return [];
  const queue = [{ node: from, path: [] as string[] }];
  const visited = new Set([from]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= 6) continue;
    for (const claim of [...claims].sort((a, b) => a.id.localeCompare(b.id))) {
      if (dataRoute && claim.kind !== "results") continue;
      const next = claim.from === current.node ? claim.to : !dataRoute && claim.to === current.node ? claim.from : null;
      if (!next || visited.has(next)) continue;
      const path = [...current.path, claim.id];
      if (next === to) return path;
      visited.add(next); queue.push({ node: next, path });
    }
  }
  return [];
}

export function recordsRequestDraft(question: Pick<ResearchQuestion, "question" | "needed" | "custodian">) {
  const routing = question.custodian.routingVerifiedOn && question.custodian.name ? question.custodian.name : "Custodian routing not yet verified";
  return `${routing}\n\nPlease provide existing public records that document:\n${question.needed}\n\nResearch question: ${question.question}\n\nPlease provide records electronically where available. If records are held by another custodian, please identify the appropriate office. Please provide a fee estimate before incurring charges.\n\nThis is a draft for manual review and submission. No request has been sent.`;
}
