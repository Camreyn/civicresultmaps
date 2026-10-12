import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initialResearchDocument } from "../../src/lib/connection-research-bootstrap.ts";
import { connectionPath, matchesClaimDate, publicationIssues, publicResearchDocument, publicResearchDocumentSchema, recordsRequestDraft, releaseCoverageIssues, validateResearchDocument, withdrawPublicClaim } from "../../src/lib/connection-research.ts";
import { editResearchDocument } from "../../src/lib/connection-research-policy.ts";
import { assertResearchWrites, researchDatabaseTarget } from "../../src/lib/connection-database-policy.ts";
import { evaluateResultLineage, retainedRevisionForLineage } from "../../src/lib/result-lineage.ts";
import { connectionJsonDigest } from "../../src/lib/connection-json-digest.ts";
import { savedConnectionViews } from "../../src/lib/connection-saved-views.ts";
import { connectionApiPaths, connectionApiSchemas } from "../../src/lib/connection-openapi.ts";
import { publicAddress } from "../../scripts/collect-connection-sources.ts";
import { researchLeads } from "../../src/lib/election-connections.ts";

const at = "2026-10-11T12:00:00.000Z";
const publisher = { id: "reviewer", email: "publisher@example.org", publisher: true };
const researcher = { id: "researcher", email: "researcher@example.org", publisher: false };
function fixture() {
  const doc = initialResearchDocument();
  doc.claims = doc.claims.filter((claim) => claim.id === "ap-cnn");
  doc.evidence = doc.evidence.filter((item) => item.claimId === "ap-cnn");
  doc.contracts = []; doc.questions = [];
  const source = doc.sources.find((item) => item.id === doc.evidence[0].sourceId);
  doc.sources = [source];
  const revision = { id: "synthetic-revision", sourceId: source.id, url: source.url, retrievedAt: at, publishedOn: source.publishedOn, sha256: "a".repeat(64), byteLength: 20, contentType: "text/plain", completeness: "partial", artifactPath: `connection-sources/${source.id}/${"a".repeat(64)}/artifact`, captureMethod: "http" };
  let next = editResearchDocument(doc, { operation: "capture", revision, publicSourceCopy: true, note: "Synthetic fixture only" }, researcher, at);
  next.evidence[0].revisionId = revision.id;
  next = editResearchDocument(next, { operation: "review_source", revisionId: revision.id, decision: "approve", note: "Synthetic review" }, publisher, at);
  next = editResearchDocument(next, { operation: "transition", claimId: "ap-cnn", state: "in_review", note: "Submit fixture" }, researcher, at);
  return next;
}
test("migration keeps all existing relationships and three Texas pilots as unapproved drafts", () => {
  const doc = initialResearchDocument();
  assert.ok(doc.claims.length >= 45);
  assert.ok(doc.claims.every((claim) => claim.state === "draft" && claim.review === null));
  assert.equal(doc.revisions.length, 0);
  const legacyQuestionIds = new Set(researchLeads.map((question) => question.id));
  assert.ok(doc.questions.filter((question) => legacyQuestionIds.has(question.id)).every((question) => question.public && question.status === "open" && !question.finding));
  assert.ok(doc.questions.filter((question) => !legacyQuestionIds.has(question.id)).every((question) => !question.public));
  assert.deepEqual(doc.entities.filter((entity) => entity.identifiers.countyFips).map((entity) => entity.identifiers.countyFips), ["48001", "48201", "48453"]);
  assert.equal(publicResearchDocument(doc, "empty").claims.length, 0);
});
test("publisher approval requires retained reviewed evidence and a separate publication", () => {
  let doc = fixture();
  assert.throws(() => editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "No role" }, researcher, at), /Publisher/);
  doc = editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "Scope checked" }, publisher, at);
  assert.equal(publicResearchDocument(doc, "not-published").claims.length, 0);
  assert.throws(() => editResearchDocument(doc, { operation: "publish", note: "No role" }, researcher, at), /Publisher/);
  doc = editResearchDocument(doc, { operation: "publish", note: "Explicit publication" }, publisher, at);
  assert.equal(publicResearchDocument(doc, "reviewed").claims.length, 1);
});
test("raw saves cannot forge editorial approvals or source reviews", () => {
  const previous = fixture(); const changed = structuredClone(previous);
  changed.claims[0].state = "published";
  changed.claims[0].review = { by: "forged", at, note: "forged", neutralLanguage: true };
  const saved = editResearchDocument(previous, { operation: "save", document: changed, note: "Edit" }, researcher, at);
  assert.equal(saved.claims[0].state, "in_review"); assert.equal(saved.claims[0].review, null);
  changed.sourceReviews[0].by = "forged";
  assert.throws(() => editResearchDocument(previous, { operation: "save", document: changed, note: "Edit" }, researcher, at), /dedicated operations/);
});
test("changed claims, evidence, entity identities and contract scope require renewed review", () => {
  let previous = fixture();
  previous = editResearchDocument(previous, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "Review" }, publisher, at);
  for (const change of [(doc) => { doc.claims[0].establishes += " Changed"; }, (doc) => { doc.evidence[0].locator.section += " Changed"; }, (doc) => { doc.entities.find((item) => item.id === "cnn").label = "Different entity"; }]) {
    const draft = structuredClone(previous); change(draft);
    const result = editResearchDocument(previous, { operation: "save", document: draft, note: "Changed" }, researcher, at);
    assert.equal(result.claims[0].state, "draft"); assert.equal(result.claims[0].review, null);
  }
});
test("source revision bytes/metadata are immutable and a pending comparison blocks advancement", () => {
  const doc = fixture(); const revision = doc.revisions[0];
  assert.throws(() => editResearchDocument(doc, { operation: "capture", revision: { ...revision, byteLength: 21 }, publicSourceCopy: true, note: "Alter" }, researcher, at), /immutable/);
  const changed = editResearchDocument(doc, { operation: "capture", revision: { ...revision, id: "synthetic-new", sha256: "b".repeat(64), artifactPath: `connection-sources/${revision.sourceId}/${"b".repeat(64)}/artifact` }, publicSourceCopy: true, note: "New bytes" }, researcher, at);
  assert.ok(publicationIssues(changed, changed.claims[0]).some((issue) => issue.includes("comparison pending")));
  assert.throws(() => editResearchDocument(changed, { operation: "capture", revision, publicSourceCopy: true, note: "Older capture" }, researcher, at), /older revision/);
  assert.throws(() => editResearchDocument(doc, { operation: "capture", revision, note: "No attestation" }, researcher, at), /attestation/);
  assert.throws(() => editResearchDocument(doc, { operation: "review_source", revisionId: revision.id, decision: "approve", note: "No role" }, researcher, at), /Publisher/);
});
test("public projection excludes private notes, identities, paths and raw document bytes", () => {
  let doc = fixture(); doc = editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "PRIVATE DECISION" }, publisher, at);
  doc = editResearchDocument(doc, { operation: "publish", note: "Publish" }, publisher, at);
  const exported = publicResearchDocument(doc, "release");
  const raw = JSON.stringify(exported);
  for (const privateValue of ["artifactPath", "sourceReviews", "PRIVATE DECISION", "publisher@example.org", "workingNotes", "custodian"]) assert.ok(!raw.includes(privateValue));
  assert.doesNotThrow(() => publicResearchDocumentSchema.parse(exported));
  assert.throws(() => publicResearchDocumentSchema.parse({ ...exported, workingNotes: "private" }));
  assert.throws(() => publicResearchDocumentSchema.parse({ ...exported, revisions: exported.revisions.map((item) => ({ ...item, artifactPath: "private" })) }));
});
test("withdrawal is publisher-only and removes the selected public claim without disabling other records", () => {
  let doc = fixture(); doc = editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "Review" }, publisher, at);
  doc = editResearchDocument(doc, { operation: "publish", note: "Publish" }, publisher, at);
  assert.throws(() => editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "withdrawn", note: "No role" }, researcher, at), /Publisher/);
  assert.throws(() => editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "draft", note: "No role" }, researcher, at), /Publisher/);
  const released = publicResearchDocument(doc, "release");
  released.claims.push({ ...released.claims[0], id: "another-reviewed-claim" });
  const filtered = withdrawPublicClaim(released, "ap-cnn", "withdrawal-release");
  assert.deepEqual(filtered.claims.map((claim) => claim.id), ["another-reviewed-claim"]);
  assert.equal(filtered.releaseId, "withdrawal-release");
});
test("unfinished replacement drafts cannot silently remove relationships from a replacement release", () => {
  let doc = fixture();
  assert.deepEqual(releaseCoverageIssues(doc, ["ap-cnn"]), ["ap-cnn"]);
  doc = editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "Review" }, publisher, at);
  doc = editResearchDocument(doc, { operation: "publish", note: "Publish" }, publisher, at);
  assert.deepEqual(releaseCoverageIssues(doc, ["ap-cnn"]), []);
  const draft = structuredClone(doc); draft.claims[0].label += " Updated";
  const edited = editResearchDocument(doc, { operation: "save", document: draft, note: "Research edit" }, researcher, at);
  assert.deepEqual(releaseCoverageIssues(edited, ["ap-cnn"]), ["ap-cnn"]);
  const withdrawn = editResearchDocument(edited, { operation: "transition", claimId: "ap-cnn", state: "withdrawn", note: "Explicit removal" }, publisher, at);
  assert.deepEqual(releaseCoverageIssues(withdrawn, ["ap-cnn"]), []);
});
test("unknown end dates never mean continuing active relationships", () => {
  const claim = { observedOn: "2025-01-13", effectiveFrom: "2025-01-13", effectiveTo: null };
  assert.equal(matchesClaimDate(claim, "2026-10-11", "active"), false);
  assert.equal(matchesClaimDate(claim, "2024-11-05", "documented"), false);
  assert.equal(matchesClaimDate(claim, "2026-10-11", "documented"), true);
  assert.equal(matchesClaimDate({ ...claim, effectiveTo: "2025-12-31" }, "2025-06-01", "active"), true);
});
test("invalid dates and inverted intervals fail validation", () => {
  const doc = fixture(); doc.claims[0].observedOn = "2026-02-30";
  assert.throws(() => validateResearchDocument(doc));
  doc.claims[0].observedOn = null; doc.claims[0].effectiveFrom = "2026-10-11"; doc.claims[0].effectiveTo = "2025-10-11";
  assert.throws(() => validateResearchDocument(doc));
});
test("paths retain direction for results and do not traverse ownership as a data route", () => {
  const claims = [{ id: "ownership", from: "a", to: "b", kind: "ownership" }, { id: "results", from: "b", to: "c", kind: "results" }];
  assert.deepEqual(connectionPath(claims, "a", "c"), ["ownership", "results"]);
  assert.deepEqual(connectionPath(claims, "a", "c", true), []);
  assert.deepEqual(connectionPath(claims, "c", "b", true), []);
  assert.deepEqual(connectionPath(claims, "b", "c", true), ["results"]);
});
test("records requests are drafts with unverified routing clearly marked", () => {
  const question = initialResearchDocument().questions.at(-1);
  const draft = recordsRequestDraft(question);
  assert.match(draft, /Custodian routing not yet verified/); assert.match(draft, /No request has been sent/); assert.match(draft, /fee estimate before/);
});
test("public question findings require published evidence and clear when their evidence is withdrawn", () => {
  let doc = fixture();
  const question = initialResearchDocument().questions[0];
  doc.questions = [{ ...question, sourceIds: [doc.sources[0].id], public: true, status: "documented", finding: "Synthetic finding", resolutionClaimIds: ["ap-cnn"] }];
  assert.throws(() => publicResearchDocument(doc, "unreviewed"), /published evidence/);
  doc = editResearchDocument(doc, { operation: "transition", claimId: "ap-cnn", state: "approved", note: "Review" }, publisher, at);
  doc = editResearchDocument(doc, { operation: "publish", note: "Publish" }, publisher, at);
  const snapshot = publicResearchDocument(doc, "reviewed");
  assert.equal(snapshot.questions[0].finding, "Synthetic finding");
  const withdrawn = withdrawPublicClaim(snapshot, "ap-cnn", "withdrawn");
  assert.equal(withdrawn.questions[0].status, "open"); assert.equal(withdrawn.questions[0].finding, "");
});
test("research databases need an approved identity, environment and explicit write opt-in", () => {
  const local = { CONNECTIONS_DATABASE_URL: "postgres://localhost:54329/crm_connections_dev", CONNECTIONS_DATABASE_ENVIRONMENT: "local" };
  assert.equal(researchDatabaseTarget(local).driver, "postgres");
  assert.throws(() => assertResearchWrites(local), /disabled/);
  assert.throws(() => assertResearchWrites({ ...local, CONNECTIONS_WRITES_ENABLED: "1" }), /write opt-in/);
  assert.doesNotThrow(() => assertResearchWrites({ ...local, CONNECTIONS_WRITES_ENABLED: "1", CRM_DATABASE_LOCAL_WRITES: "true" }));
  const remote = { CONNECTIONS_DATABASE_URL: "postgres://research.example.org/editorial", CONNECTIONS_DATABASE_ENVIRONMENT: "production", VERCEL_ENV: "production", CONNECTIONS_APPROVED_DATABASE_HOST: "research.example.org", CONNECTIONS_APPROVED_DATABASE_NAME: "editorial", CONNECTIONS_WRITES_ENABLED: "1" };
  assert.throws(() => assertResearchWrites(remote), /separate approval/);
  assert.doesNotThrow(() => assertResearchWrites({ ...remote, CONNECTIONS_PRODUCTION_EDITORIAL_WRITES_APPROVED: "1" }));
  assert.throws(() => researchDatabaseTarget({ ...remote, CONNECTIONS_APPROVED_DATABASE_HOST: "other.example.org" }));
  assert.throws(() => researchDatabaseTarget({ ...local, CONNECTIONS_DATABASE_URL: "postgres://localhost:54329/postgres" }));
  for (const query of ["host=production.example.org", "port=5432", "database=postgres", "options=-c%20role%3Downer"]) {
    assert.throws(() => researchDatabaseTarget({ ...local, CONNECTIONS_DATABASE_URL: `${local.CONNECTIONS_DATABASE_URL}?${query}` }));
    assert.throws(() => researchDatabaseTarget({ ...remote, CONNECTIONS_DATABASE_URL: `${remote.CONNECTIONS_DATABASE_URL}?${query}` }));
  }
  assert.throws(() => researchDatabaseTarget({ ...remote, CONNECTIONS_DATABASE_URL: `${remote.CONNECTIONS_DATABASE_URL}?sslmode=disable` }));
  assert.doesNotThrow(() => researchDatabaseTarget({ ...remote, CONNECTIONS_DATABASE_URL: `${remote.CONNECTIONS_DATABASE_URL}?sslmode=require&channel_binding=require` }));
});
test("collector rejects loopback, private, link-local, carrier NAT and IPv6 addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.1.1", "100.64.1.1", "::1", "::ffff:127.0.0.1"]) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("lineage requires exact raw-source values and canonical county identity, not plausible metadata", () => {
  const source = { "48001": { Races: { "1001": { T: 7, C: { one: { N: "Synthetic", P: "DEM", V: 7 } } } } } };
  const digest = "a".repeat(64);
  const row = { candidate: "Harris", votes: 7, jurisdictionTag: "county:48001", sourceId: "tx-2024-official-county-results", sourceUrl: "https://results.texas-election.com/static/data/election/49664/1012/County.json", authority: "Texas SOS", importRunId: "run", importStatus: "promoted", sourceMetadata: { artifacts: [{ sha256: digest }] }, importSummary: { lineageManifest: { schemaVersion: 1, parser: "nativeTexasCountyJsonVtdReview", sourceArtifacts: { "tx-2024-official-county-results": [{ sha256: digest }] }, stagingSha256: digest, parserCodeSha256: digest, configCanonicalSha256: digest } }, locator: { format: "texasCountyJson", bucket: "Harris", countyFips: "48001", raceId: "1001", totalPointer: "/48001/Races/1001/T", candidateContributions: { Harris: [{ pointer: "/48001/Races/1001/C/one/V", votes: 7 }] } } };
  assert.equal(evaluateResultLineage([row], [digest])[0].status, "incomplete");
  assert.equal(evaluateResultLineage([row], [digest], source)[0].status, "source_and_import_matched");
  assert.equal(evaluateResultLineage([{ ...row, sourceId: "unrelated" }], [digest], source)[0].status, "incomplete");
  assert.equal(evaluateResultLineage([{ ...row, jurisdictionTag: "county:48201" }], [digest], source)[0].status, "incomplete");
  const corrupt = structuredClone(source); corrupt["48001"].Races["1001"].C.one.V = 8;
  assert.equal(evaluateResultLineage([row], [digest], corrupt)[0].checks.rawSourceMatches, false);
  assert.equal(evaluateResultLineage([{ ...row, locator: { ...row.locator, format: "unsupported" } }], [digest], source)[0].status, "incomplete");
  assert.equal(evaluateResultLineage([{ ...row, importSummary: { lineageManifest: { ...row.importSummary.lineageManifest, parser: "anotherParser" } } }], [digest], source)[0].status, "incomplete");
  const revision = { sha256: digest, url: row.sourceUrl, contentType: "application/json", completeness: "complete" };
  assert.equal(retainedRevisionForLineage([row], [revision, { ...revision, sha256: "b".repeat(64) }]), revision);
  assert.equal(retainedRevisionForLineage([row], [{ ...revision, completeness: "partial" }]), undefined);
});
test("immutable release digests survive JSONB key ordering but not value changes", () => {
  assert.equal(connectionJsonDigest({ b: { y: 2, x: 1 }, a: [3, 4] }), connectionJsonDigest({ a: [3, 4], b: { x: 1, y: 2 } }));
  assert.notEqual(connectionJsonDigest({ a: [3, 4] }), connectionJsonDigest({ a: [4, 3] }));
});
test("browser saved views reject corrupt records and nonfinite or oversized coordinates", () => {
  const valid = { name: "My view", url: "/connections?node=ap", releaseId: "legacy", pinned: ["ap"], positions: { ap: { x: 10, y: 20 } } };
  assert.equal(savedConnectionViews(JSON.stringify([valid])).length, 1);
  assert.deepEqual(savedConnectionViews(JSON.stringify([null, { ...valid, positions: { ap: { x: 1e9, y: 0 } } }])), []);
  assert.deepEqual(savedConnectionViews("not JSON"), []);
});
test("OpenAPI exposes public research and lineage contracts but no private editor endpoints", () => {
  assert.deepEqual(Object.keys(connectionApiPaths).sort(), ["/api/v1/connections", "/api/v1/connections/sources/{id}", "/api/v1/result-lineage"]);
  const serialized = JSON.stringify(connectionApiSchemas);
  for (const privateField of ["artifactPath", "workingNotes", "actorEmail", "sourceReviews"]) assert.ok(!serialized.includes(privateField));
  assert.equal(connectionApiSchemas.ResultCandidateLineage.properties.checks.properties.display.const, "not_checked");
  assert.equal(connectionApiSchemas.ConnectionsDocument.properties.schemaVersion.const, 2);
});
test("migration snapshot preserves prior schema and adds only research tables and result locators", () => {
  const before = JSON.parse(readFileSync("drizzle/meta/0009_snapshot.json", "utf8"));
  const after = JSON.parse(readFileSync("drizzle/meta/0010_snapshot.json", "utf8"));
  assert.equal(after.prevId, before.id);
  const tables = structuredClone(after.tables);
  for (const key of Object.keys(tables).filter((key) => key.startsWith("public.connection_"))) delete tables[key];
  delete tables["public.result_rows"].columns.source_locator;
  assert.deepEqual(tables, before.tables);
  assert.equal(Object.keys(after.tables).length - Object.keys(before.tables).length, 4);
});
test("current legacy staging cannot receive retrospective verified lineage", () => {
  const row = { candidate: "Harris", votes: 7, sourceId: "source", sourceUrl: "https://example.org/", authority: "Synthetic fixture", importRunId: null, importStatus: null, importSummary: null, sourceMetadata: null, locator: null };
  assert.equal(evaluateResultLineage([row], [])[0].status, "incomplete");
});
test("route and importer guards retain explicit revisions, no seed substitution, and optimistic conflicts", () => {
  const repository = readFileSync("src/lib/connection-research-repository.ts", "utf8");
  const api = readFileSync("src/app/api/v1/result-lineage/route.ts", "utf8");
  const importer = readFileSync("src/db/native-import.ts", "utf8");
  assert.match(repository, /pg_advisory_xact_lock/); assert.match(repository, /version !== expectedVersion/); assert.match(repository, /Rollback would restore withdrawn claims/);
  assert.match(api, /before !== after/); assert.match(api, /LINEAGE_DISABLED/); assert.doesNotMatch(api, /seedResults/);
  assert.match(importer, /stagingSha256/); assert.match(importer, /source_locator = incoming.source_locator/);
});
