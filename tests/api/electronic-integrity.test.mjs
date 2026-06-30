import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const registry = JSON.parse(readFileSync("data/electronic-integrity-artifacts.json", "utf8"));
const requestTracker = JSON.parse(readFileSync("data/electronic-integrity-request-tracker.json", "utf8"));
const requestOps = JSON.parse(readFileSync("data/electronic-integrity-request-operations.json", "utf8"));
const receivedFiles = JSON.parse(readFileSync("data/electronic-integrity-received-files.json", "utf8"));
const swingParity = JSON.parse(readFileSync("data/swing-state-2024-parity-status.json", "utf8"));
const expectedStates = ["AZ", "GA", "MA", "MI", "NC", "NV", "PA", "TX", "WI"];
const swingParityStates = ["AZ", "GA", "MI", "NC", "NV", "PA", "TX", "WI"];
const requiredArtifactTypes = [
  "audit_results",
  "ballot_images",
  "cast_vote_records",
  "certified_results",
  "chain_of_custody",
  "logic_accuracy",
  "reporting_unit_results",
  "tabulator_logs",
].sort();

function state(code) {
  return registry.states.find((entry) => entry.state === code);
}

function artifact(code, type) {
  return state(code)?.artifacts.find((entry) => entry.type === type);
}

test("electronic integrity registry covers tracked request states", () => {
  assert.match(registry.description, /does not allege or prove tampering/);
  assert.deepEqual(
    registry.states.map((entry) => entry.state).sort(),
    expectedStates,
  );
  for (const code of expectedStates) {
    assert.equal(artifact(code, "certified_results")?.status, "loaded");
    assert.equal(typeof state(code)?.nextAction, "string");
    assert.deepEqual(state(code).artifacts.map((entry) => entry.type).sort(), requiredArtifactTypes);
  }
});

test("registry distinguishes loaded review evidence from unavailable electronic artifacts", () => {
  assert.equal(artifact("WI", "reporting_unit_results")?.status, "loaded");
  assert.equal(artifact("WI", "audit_results")?.status, "partial");
  assert.equal(artifact("WI", "cast_vote_records")?.status, "partial");
  assert.equal(artifact("MI", "reporting_unit_results")?.status, "loaded");
  assert.equal(artifact("PA", "reporting_unit_results")?.status, "loaded");
  assert.equal(artifact("PA", "cast_vote_records")?.status, "blocked");
  assert.equal(artifact("AZ", "reporting_unit_results")?.reconciliationStatus, "county_only_not_subcounty");
  assert.equal(artifact("NV", "reporting_unit_results")?.reconciliationStatus, "clark_washoe_precinct_cvr_loaded_other_counties_county_only");
  assert.equal(artifact("NV", "cast_vote_records")?.status, "partial");
  assert.equal(registry.states.some((entry) => artifact(entry.state, "cast_vote_records")?.status === "loaded"), false);
  assert.equal(artifact("MI", "tabulator_logs")?.status, "needs_data");
  assert.equal(artifact("NC", "chain_of_custody")?.requestRequired, true);
});

test("electronic integrity API and validation scripts are wired", () => {
  assert.equal(existsSync("src/app/api/electronic-integrity/route.ts"), true);
  assert.equal(existsSync("src/app/api/electronic-integrity-requests/route.ts"), true);
  assert.equal(existsSync("scripts/validate-electronic-integrity-artifacts.mjs"), true);
  assert.equal(existsSync("scripts/report-electronic-integrity-reconciliation.mjs"), true);
  assert.equal(existsSync("scripts/create-electronic-integrity-request-packets.mjs"), true);
  assert.equal(existsSync("scripts/sync-electronic-integrity-request-operations.mjs"), true);
  const api = readFileSync("src/lib/api.ts", "utf8");
  const route = readFileSync("src/app/api/electronic-integrity/route.ts", "utf8");
  const requestRoute = readFileSync("src/app/api/electronic-integrity-requests/route.ts", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(api, /listElectronicIntegrityArtifacts/);
  assert.match(api, /listElectronicIntegrityRequests/);
  assert.match(route, /does not prove tampering/);
  assert.match(requestRoute, /records-request workflow only/);
  assert.match(tabs, /Electronic Integrity/);
  assert.match(tabs, /Open records queue/);
  assert.match(tabs, /Request workflow/);
  assert.match(tabs, /Records request guide/);
  assert.match(tabs, /request-attention-banner/);
  assert.match(tabs, /tab-alert-badge/);
  assert.match(tabs, /site does not automatically submit requests/);
  assert.match(tabs, /Copy email draft/);
  assert.match(tabs, /Open mail app/);
  assert.match(tabs, /Find custodian/);
  assert.match(scripts["validate:electronic-integrity"], /validate-electronic-integrity-artifacts/);
  assert.match(scripts["etl:status:electronic-integrity"], /report-electronic-integrity-reconciliation/);
  assert.match(scripts["etl:requests:electronic-integrity"], /create-electronic-integrity-request-packets/);
  assert.match(scripts["etl:requests:electronic-integrity:sync"], /sync-electronic-integrity-request-operations/);
  assert.match(scripts["validate:electronic-integrity-requests"], /--dry-run/);
  assert.match(workflow, /validate:electronic-integrity/);
});

test("electronic reconciliation report records limits and request queues", () => {
  const report = JSON.parse(readFileSync("data/electronic-integrity-reconciliation-status.json", "utf8"));
  assert.match(report.caveat, /not proof of electronic tampering/);
  assert.deepEqual(report.summary.canRecomputeFromCvrStates, []);
  assert.equal(report.summary.requestRequiredRows, 58);
  assert.ok(report.summary.statesWithReviewRows.includes("WI"));
  const wi = report.states.find((entry) => entry.state === "WI");
  assert.equal(wi.cvrStatus, "partial");
  assert.equal(wi.auditStatus, "partial");
  assert.equal(wi.canRecomputeFromCvr, false);
  assert.ok(wi.staging.reviewRows > 0);
});

test("electronic request plan creates one packet per tracked request state", () => {
  const plan = JSON.parse(readFileSync("data/electronic-integrity-request-plan.json", "utf8"));
  assert.match(plan.caveat, /does not prove tampering/);
  assert.equal(plan.packetCount, 9);
  assert.equal(plan.requestRequiredRows, 58);
  assert.deepEqual(plan.byState.map((entry) => entry.state).sort(), expectedStates);
  assert.equal(plan.byState.find((entry) => entry.state === "WI").statuses.partial, 2);
  assert.equal(plan.byState.find((entry) => entry.state === "PA").statuses.blocked, 1);
  for (const entry of plan.byState) {
    assert.equal(existsSync(entry.outputFile), true, `${entry.outputFile} should exist`);
  }
});


test("electronic request operations create sendable drafts and track per-artifact requests", () => {
  assert.match(requestTracker.caveat, /do not prove electronic tampering/);
  assert.equal(requestTracker.requests.length, 58);
  assert.equal(receivedFiles.requestsTracked, 58);
  assert.equal(receivedFiles.receivedFiles.length, 58);
  assert.equal(requestOps.requestRows, 58);
  assert.equal(requestOps.draftCount, 9);
  assert.deepEqual(Object.keys(requestOps.rowsByState).sort(), expectedStates);
  assert.equal(requestOps.rowsByStatus.draft_ready, 58);

  const wiCvr = requestTracker.requests.find((entry) => entry.requestId === "EI-2024-WI-CAST-VOTE-RECORDS");
  assert.equal(wiCvr.status, "draft_ready");
  assert.equal(wiCvr.primaryCustodian, "Wisconsin Elections Commission");
  assert.equal(wiCvr.recipientPortalUrl, "https://elections.wi.gov/");
  assert.equal(wiCvr.countyCustodianLikely, true);

  const wiDraft = requestOps.drafts.find((entry) => entry.state === "WI");
  assert.equal(existsSync(wiDraft.emailFile), true);
  assert.equal(existsSync(wiDraft.markdownFile), true);
  const wiEmail = readFileSync(wiDraft.emailFile, "utf8");
  assert.match(wiEmail, /Subject: Wisconsin 2024 electronic election records request/);
  assert.match(wiEmail, /EI-2024-WI-CAST-VOTE-RECORDS/);
  assert.match(wiEmail, /verify recipient email/);
});



test("timeline source collection events are backed by explicit source records", () => {
  const source = readFileSync("src/lib/suspicious-events.ts", "utf8");
  const component = readFileSync("src/app/timeline/suspicious-timeline.tsx", "utf8");
  const timelineTemplate = readFileSync(".github/ISSUE_TEMPLATE/timeline-addition.yml", "utf8");

  assert.match(source, /swing-state-2024-parity-status\.json/);
  assert.match(source, /listSourceCollectionEvents/);
  assert.match(source, /sources: dedupeSources/);
  assert.match(source, /externalReviewTimelineEvents/);
  assert.match(source, /smartelections\.us/);
  assert.match(source, /electiontruthalliance\.org/);
  assert.doesNotMatch(component, /event\.sourceLabel/);
  assert.doesNotMatch(component, /event\.sourceUrl/);
  assert.match(component, /event\.sources\.map/);
  assert.match(component, /timeline-addition\.yml/);
  assert.match(component, /Submit Timeline Addition/);
  assert.match(timelineTemplate, /Source URL/);
  assert.match(timelineTemplate, /Event date/);
  assert.match(timelineTemplate, /Timeline category/);
  assert.match(timelineTemplate, /not proof of misconduct/);

  assert.equal(swingParity.states.length, swingParityStates.length);
  for (const entry of swingParity.states) {
    assert.ok(swingParityStates.includes(entry.state), `${entry.state} should be in the timeline source batch`);
    assert.ok(entry.nativeCoverage.reviewRows > 0, `${entry.state} should expose review row counts`);
    assert.ok(entry.nativeCoverage.parserStatus, `${entry.state} should expose parser status`);
    assert.ok(entry.sourceAcquisition.sourceUrls.length > 0, `${entry.state} should include source URLs`);
    for (const sourceUrl of entry.sourceAcquisition.sourceUrls) {
      assert.match(sourceUrl, /^https:\/\//, `${entry.state} source URL should be HTTPS`);
    }
  }
});

test("electronic request API exposes browser-ready email body and routing hints", () => {
  const source = readFileSync("src/lib/electronic-integrity-requests.ts", "utf8");
  assert.match(source, /requestEmailBody/);
  assert.match(source, /mailtoHref/);
  assert.match(source, /recipientHint/);
  assert.match(source, /routingHint/);
  assert.match(source, /Verify recipient email/);
});
