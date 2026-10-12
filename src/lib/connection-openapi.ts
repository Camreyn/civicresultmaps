const string = { type: "string" };
const id = { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,119}$" };
const date = { type: ["string", "null"], format: "date" };
const dateTime = { type: ["string", "null"], format: "date-time" };
const hash = { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" };
const url = { type: "string", format: "uri", pattern: "^https://" };
const enumeration = (...values: string[]) => ({ type: "string", enum: values });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const array = (name: string) => ({ type: "array", items: ref(name) });
const record = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const amount = { type: ["number", "null"], minimum: 0 };
const response = (description: string, name: string) => ({ description, content: { "application/json": { schema: ref(name) } } });
const failure = (description: string) => response(description, "ErrorEnvelope");
const envelope = (name: string, schemaVersion: string) => record({ data: ref(name), meta: { allOf: [ref("EnvelopeMeta"), { properties: { schemaVersion: { const: schemaVersion } } }] } });

export const connectionApiPaths = {
  "/api/v1/connections": { get: {
    tags: ["Connections"], operationId: "getReviewedConnections", summary: "Get the currently published documentary connections release",
    description: "Explicitly enabled, publisher-reviewed snapshots only. Disabled or unavailable releases return 503; private drafts and the legacy catalog are never substituted. Full retained documents remain private.",
    responses: { "200": response("Reviewed connections with pinned source revisions and exact passages.", "ConnectionsEnvelope"), "503": failure("Releases disabled, unconfigured, or unavailable.") },
  } },
  "/api/v1/connections/sources/{id}": { get: {
    tags: ["Connections"], operationId: "getPublishedConnectionSourceRevision", summary: "Get metadata and passages for one published source revision",
    parameters: [{ name: "id", in: "path", required: true, description: "Immutable revision ID, not the source registry ID.", schema: id }],
    responses: { "200": response("Public metadata and short passages; no private copies or storage paths.", "ConnectionSourceRevisionEnvelope"), "404": failure("Revision is not in the current public release."), "503": failure("Reviewed releases are disabled or unavailable.") },
  } },
  "/api/v1/result-lineage": { get: {
    tags: ["Connections"], operationId: "inspectResultLineage", summary: "Inspect Texas 2024 county presidential candidate source and import checks",
    description: "Feature-gated initial pilot. A stable stored data revision is required. Exact raw County.json pointers, an approved retained JSON revision, and recorded import fingerprints are checked separately. The browser must independently compare these votes to its displayed values. No seed or inferred chain is substituted.",
    parameters: [
      { name: "state", in: "query", required: true, schema: { const: "TX" } },
      { name: "year", in: "query", required: true, schema: { const: "2024" } },
      { name: "office", in: "query", required: true, schema: { const: "president" } },
      { name: "level", in: "query", required: true, schema: { const: "county" } },
      { name: "jurisdictionCode", in: "query", required: true, description: "Stored jurisdiction code, county:48xxx tag, or five-digit Texas county FIPS.", schema: { type: "string", minLength: 1, maxLength: 100 } },
      { name: "dataRevision", in: "query", description: "Optional expected revision returned by /api/results; stale tokens return 409.", schema: string },
    ],
    responses: { "200": response("Candidate checks; incomplete lineage is reported as incomplete, not verified.", "ResultLineageEnvelope"), "400": failure("Unsupported selection."), "404": failure("Matching official county rows are absent."), "409": failure("Requested revision is stale or the public-data revision changed during inspection."), "503": failure("Pilot disabled, database unavailable, migration absent, or rows ambiguous.") },
  } },
};

export const connectionApiSchemas = {
  ConnectionEntity: record({ id, label: string, category: string, description: string, geography: string, identifiers: { type: "object", additionalProperties: string } }),
  ConnectionSource: record({ id, authority: string, title: string, url, sourceClass: enumeration("official", "issuer", "independent", "supplemental"), publishedOn: date, eventOn: date }),
  ConnectionSourceRevision: record({
    id, sourceId: id, url, retrievedAt: dateTime, publishedOn: date,
    capturedAt: { type: "string", format: "date-time" }, captureMethod: enumeration("http", "retained_local", "researcher_copy"),
    sha256: { ...hash, type: "string" }, byteLength: { type: "integer", minimum: 1, maximum: 20971520 },
    contentType: enumeration("application/pdf", "text/html", "text/plain", "application/json"), completeness: enumeration("complete", "partial"),
  }, ["id", "sourceId", "url", "retrievedAt", "publishedOn", "captureMethod", "sha256", "byteLength", "contentType", "completeness"]),
  ConnectionEvidence: record({ id, claimId: id, sourceId: id, revisionId: { ...id, type: ["string", "null"] }, relation: enumeration("supports", "contradicts", "context"), locator: record({ page: { type: ["integer", "null"], minimum: 1 }, section: string, pointer: { type: ["string", "null"] } }), excerpt: { type: "string", maxLength: 1600 }, attribution: enumeration("official_record", "issuer_statement", "independent_reporting", "supplemental") }),
  ConnectionClaim: record({
    id, from: id, to: id, label: string, kind: enumeration("results", "survey", "ownership", "role", "technology", "contract", "inventory"), view: enumeration("reporting", "ownership", "technology"), geography: string,
    establishes: string, limitation: string, dated: string, observedOn: date, effectiveFrom: date, effectiveTo: date, scope: enumeration("documented", "certified", "procured", "fielded"),
    ownership: { type: ["object", "null"], properties: { economicPct: { type: ["number", "null"], minimum: 0, maximum: 100 }, votingPct: { type: ["number", "null"], minimum: 0, maximum: 100 } }, required: ["economicPct", "votingPct"], additionalProperties: false },
  }),
  ConnectionContract: record({ id, claimId: id, awardId: string, buyer: id, supplier: id, scope: string, currency: { const: "USD" }, ceiling: amount, obligated: amount, spent: amount, signedOn: date, startsOn: date, endsOn: date, amendment: string }),
  ConnectionQuestion: record({ id, title: string, question: string, needed: string, sourceIds: { type: "array", items: id }, status: enumeration("open", "researching", "awaiting_records", "documented", "contradicted", "inconclusive"), geography: string, finding: string, resolutionClaimIds: { type: "array", items: id } }),
  ConnectionsDocument: record({ schemaVersion: { const: 2 }, releaseId: string, reviewedOn: { type: "string", format: "date" }, entities: array("ConnectionEntity"), claims: array("ConnectionClaim"), sources: array("ConnectionSource"), revisions: array("ConnectionSourceRevision"), evidence: array("ConnectionEvidence"), contracts: array("ConnectionContract"), questions: array("ConnectionQuestion") }),
  ConnectionsEnvelope: envelope("ConnectionsDocument", "connections/2"),
  ConnectionSourceRevisionData: record({ revision: ref("ConnectionSourceRevision"), source: ref("ConnectionSource"), passages: array("ConnectionEvidence") }),
  ConnectionSourceRevisionEnvelope: envelope("ConnectionSourceRevisionData", "connections/2"),
  ResultCandidateLineage: record({
    candidate: string, votes: { type: "integer", minimum: 0 },
    source: record({ id: string, url, authority: string, sha256: hash, reviewStatus: enumeration("reviewed_revision", "review_not_established") }),
    import: record({ id: { type: ["string", "null"] }, status: { type: ["string", "null"] }, stagingSha256: hash, parser: { type: ["string", "null"] }, parserCodeSha256: hash, configCanonicalSha256: hash }),
    locator: { type: ["object", "null"], description: "Whitelisted county/race/total pointer and candidate contributions, when stored.", additionalProperties: true },
    checks: record({ officialSource: { type: "boolean" }, sourceDigestMatches: { type: "boolean" }, sourceReviewed: { type: "boolean" }, aggregationMatches: { type: "boolean" }, rawSourceMatches: { type: "boolean" }, importManifestRecorded: { type: "boolean" }, display: { const: "not_checked" } }),
    status: enumeration("source_and_import_matched", "incomplete"),
  }),
  ResultLineageData: record({ selection: record({ state: { const: "TX" }, year: { const: "2024" }, office: { const: "president" }, level: { const: "county" }, jurisdictionCode: string }), candidates: array("ResultCandidateLineage"), displayVerification: { const: "not_checked" }, caveat: string }),
  ResultLineageEnvelope: envelope("ResultLineageData", "result-lineage/1"),
};
