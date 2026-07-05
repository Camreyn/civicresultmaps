import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const contacts = JSON.parse(readFileSync("data/source-records-request-contacts.json", "utf8"));
const tracker = JSON.parse(readFileSync("data/source-records-request-tracker.json", "utf8"));
const operations = JSON.parse(readFileSync("data/source-records-request-operations.json", "utf8"));
const receivedFiles = JSON.parse(readFileSync("data/source-records-request-received-files.json", "utf8"));
const expectedStates = ["AK", "IN", "NV", "NY", "SD"];

test("source records request operations are generated separately from electronic requests", () => {
  assert.match(tracker.caveat, /do not prove fraud, misconduct, or tampering/);
  assert.equal(tracker.requests.length, 5);
  assert.equal(operations.requestRows, 5);
  assert.equal(operations.manualActionRequiredRows, 5);
  assert.equal(operations.draftCount, 5);
  assert.deepEqual(Object.keys(operations.rowsByState).sort(), expectedStates);
  assert.equal(operations.rowsByStatus.draft_ready, 5);
  assert.equal(receivedFiles.requestsTracked, 5);
  assert.equal(receivedFiles.receivedFiles.length, 5);

  for (const request of tracker.requests) {
    assert.equal(request.requestFamily, "source_records");
    assert.equal(request.preparedByProject, true);
    assert.equal(request.manualActionRequired, true);
    assert.match(request.preparedAction, /Prepared/);
    assert.match(request.manualUserAction, /send|Send|Verify/);
    assert.match(request.responseAction, /Submit/);
  }
});

test("source records contacts keep custodian routing explicit", () => {
  assert.deepEqual(contacts.states.map((entry) => entry.state).sort(), expectedStates);
  for (const contact of contacts.states) {
    assert.match(contact.recipientPortalUrl, /^https:\/\//);
    assert.match(contact.recipientLookupUrl, /^https:\/\//);
    assert.ok(contact.primaryCustodian);
    assert.ok(contact.notes);
  }
  assert.equal(contacts.states.find((entry) => entry.state === "IN").recipientEmail, "elections@iec.in.gov");
  assert.equal(contacts.states.find((entry) => entry.state === "NY").countyCustodianLikely, true);
});

test("source records drafts make prepared and user-send steps obvious", () => {
  for (const draft of operations.drafts) {
    assert.equal(existsSync(draft.emailFile), true, `${draft.emailFile} should exist`);
    assert.equal(existsSync(draft.markdownFile), true, `${draft.markdownFile} should exist`);
    const email = readFileSync(draft.emailFile, "utf8");
    assert.match(email, /SECTION 1 - REQUESTER ACTION REQUIRED BEFORE SENDING/);
    assert.match(email, /SECTION 2 - REQUEST PREPARATION CONTEXT/);
    assert.match(email, /SECTION 3 - PUBLIC RECORDS REQUEST TEXT/);
    assert.match(email, /not an allegation or proof of fraud, misconduct, or tampering/);
  }
  const indianaDraft = readFileSync("data/source-records-request-email-drafts/in-2024-source-records-request.eml", "utf8");
  assert.match(indianaDraft, /To: elections@iec\.in\.gov/);
});

test("source records API and UI are wired as a distinct workflow", () => {
  assert.equal(existsSync("src/app/api/source-records-requests/route.ts"), true);
  assert.equal(existsSync("scripts/sync-source-records-request-operations.mjs"), true);
  const api = readFileSync("src/lib/api.ts", "utf8");
  const route = readFileSync("src/app/api/source-records-requests/route.ts", "utf8");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

  assert.match(api, /listSourceRecordsRequests/);
  assert.match(route, /records-request workflow only/);
  assert.match(route, /fraud, misconduct, or tampering/);
  assert.match(page, /listSourceRecordsRequests/);
  assert.match(page, /sourceRecordsRequests=\{sourceRecordsRequests\}/);
  assert.match(tabs, /Separate source-records requests/);
  assert.match(tabs, /Prepared draft/);
  assert.match(tabs, /Your manual step/);
  assert.match(tabs, /source-records-request-draft/);
  assert.match(tabs, /sourceRecordsResponseUrl/);
  assert.match(tabs, /Copy source request/);
  assert.match(tabs, /Submit source response/);
  assert.match(packageScripts["etl:requests:source-records:sync"], /sync-source-records-request-operations/);
  assert.match(packageScripts["validate:source-records-requests"], /--dry-run/);
});
