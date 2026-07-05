import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  contacts: "data/source-records-request-contacts.json",
  draftDir: "data/source-records-request-email-drafts",
  receivedFiles: "data/source-records-request-received-files.json",
  summaryOut: "data/source-records-request-operations.json",
  tracker: "data/source-records-request-tracker.json",
};

const statusValues = new Set([
  "draft_ready",
  "not_sent",
  "sent",
  "acknowledged",
  "fee_requested",
  "received",
  "denied",
  "redirected",
  "closed",
]);

function parseArgs(argv) {
  const options = { ...defaults, dryRun: false, state: "all" };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--state") options.state = argv[++index].toUpperCase();
    else if (arg === "--contacts") options.contacts = argv[++index];
    else if (arg === "--tracker") options.tracker = argv[++index];
    else if (arg === "--received-files") options.receivedFiles = argv[++index];
    else if (arg === "--draft-dir") options.draftDir = argv[++index];
    else if (arg === "--summary-out") options.summaryOut = argv[++index];
    else if (arg === "--help") {
      console.log("Usage: node scripts/sync-source-records-request-operations.mjs [--state AK|all] [--dry-run]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/^\uFEFF/, ""));
}

function readJsonIfExists(relativePath, fallback) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(relativePath, value) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(relativePath, value) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, value);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function contactFor(contacts, stateCode) {
  return contacts.states.find((entry) => entry.state === stateCode);
}

function requestEmailBody({ contact, request, requester }) {
  const route = [
    contact.primaryCustodian,
    contact.recipientPortalUrl,
    `Lookup/redirect reference: ${contact.recipientLookupUrl}`,
    contact.notes,
  ].filter(Boolean).join("\n");

  return [
    "Hello,",
    "",
    `I am requesting public records for the ${request.stateName} ${request.electionYear} general election source records listed below. This is a source-availability and reconciliation request only; it is not an allegation or proof of fraud, misconduct, or tampering.`,
    "",
    "SECTION 1 - REQUESTER ACTION REQUIRED BEFORE SENDING",
    "- Replace the requester placeholders below with your contact information.",
    "- Verify the custodian, email address, or official portal before sending.",
    "- Send this from your own email account or official portal session.",
    "- Save replies, produced files, redirects, fee estimates, denials, and clarification emails.",
    "- Submit received responses through the GitHub records-response form so maintainers can verify and load them.",
    "",
    "Requester:",
    requester.name,
    requester.organization,
    requester.email,
    requester.phone,
    "",
    "SECTION 2 - CODEX-PREPARED SOURCE CONTEXT",
    `Tracking ID: ${request.requestId}`,
    `Local packet: ${request.localPacket}`,
    `Source lead: ${request.sourceUrl}`,
    `Evidence summary: ${request.evidenceSummary}`,
    `Codex-prepared action: ${request.codexPreparedAction}`,
    "",
    "SECTION 3 - PUBLIC RECORDS REQUEST TEXT",
    `Requested records: ${request.requestedRecords}`,
    "",
    "Preferred production format: original exports where available, CSV, XLSX, JSON, PDF, shapefile/GeoJSON, record layouts, data dictionaries, or stable public URLs. Please preserve original filenames, timestamps, export settings, certification/finality labels, and field definitions.",
    "",
    "If your office does not maintain a requested record, please identify the state, county, municipal, vendor, or other custodian most likely to maintain it. If fees are expected, please provide an estimate before processing.",
    "",
    "Routing hint currently recorded for this request:",
    route,
    "",
    "Thank you.",
  ].join("\n");
}

function emailDraft({ contact, request, requester }) {
  const to = contact.recipientEmail || "[verify recipient email or paste this body into the official records portal]";
  const subject = `${request.stateName} ${request.electionYear} source records request - ${request.requestId}`;
  const body = requestEmailBody({ contact, request, requester });
  return {
    body,
    eml: `To: ${to}\nSubject: ${subject}\n\n${body}\n`,
    markdown: `# ${subject}\n\nTo: ${contact.recipientEmail || "[verify recipient email or use official records portal]"}\n\nPortal/lookup:\n- ${contact.recipientPortalUrl}\n- ${contact.recipientLookupUrl}\n\n\`\`\`text\n${body}\n\`\`\`\n`,
    subject,
  };
}

function mergeReceivedRow({ existing, request }) {
  const prior = existing.get(request.requestId) ?? {};
  return {
    requestId: request.requestId,
    state: request.state,
    requestFamily: request.requestFamily,
    status: prior.status ?? "none_received",
    receivedAt: prior.receivedAt ?? "",
    files: Array.isArray(prior.files) ? prior.files : [],
    accessionNotes: prior.accessionNotes ?? "",
    normalizedArtifactPath: prior.normalizedArtifactPath ?? "",
    ingestScript: prior.ingestScript ?? "",
  };
}

function validate({ contacts, requests }) {
  const failures = [];
  const contactStates = new Set(contacts.states.map((entry) => entry.state));
  for (const request of requests) {
    if (!contactStates.has(request.state)) failures.push(`${request.requestId}: missing contact metadata`);
    if (!statusValues.has(request.status)) failures.push(`${request.requestId}: invalid status ${request.status}`);
    for (const field of ["requestId", "state", "stateName", "requestedRecords", "evidenceSummary", "manualUserAction", "responseAction"]) {
      if (!request[field]) failures.push(`${request.requestId || request.state}: ${field} is required`);
    }
    if (!request.manualActionRequired) failures.push(`${request.requestId}: manualActionRequired must be true`);
  }
  for (const contact of contacts.states) {
    if (!contact.primaryCustodian) failures.push(`${contact.state}: primaryCustodian is required`);
    if (!contact.recipientPortalUrl) failures.push(`${contact.state}: recipientPortalUrl is required`);
    if (!contact.recipientLookupUrl) failures.push(`${contact.state}: recipientLookupUrl is required`);
    for (const field of ["recipientPortalUrl", "recipientLookupUrl"]) {
      try {
        const url = new URL(contact[field]);
        if (url.protocol !== "https:") failures.push(`${contact.state}: ${field} must use https`);
      } catch {
        failures.push(`${contact.state}: ${field} is not a valid URL`);
      }
    }
  }
  return failures;
}

const options = parseArgs(process.argv);
const contacts = readJson(options.contacts);
const tracker = readJson(options.tracker);
const previousReceived = readJsonIfExists(options.receivedFiles, { receivedFiles: [] });
const existingReceived = new Map((previousReceived.receivedFiles ?? []).map((row) => [row.requestId, row]));
const selectedRequests = tracker.requests
  .filter((request) => options.state === "all" || request.state === options.state)
  .sort((a, b) => a.requestId.localeCompare(b.requestId));
const drafts = [];

for (const request of selectedRequests) {
  const contact = contactFor(contacts, request.state);
  if (!contact) continue;
  const baseName = `${slug(request.state)}-${request.electionYear}-source-records-request`;
  const draft = emailDraft({ contact, request, requester: contacts.defaultRequester });
  drafts.push({
    state: request.state,
    emailFile: `${options.draftDir}/${baseName}.eml`,
    markdownFile: `${options.draftDir}/${baseName}.md`,
    subject: draft.subject,
    requestIds: [request.requestId],
    emailBody: draft.eml,
    markdownBody: draft.markdown,
  });
}

const receivedRows = selectedRequests.map((request) => mergeReceivedRow({ existing: existingReceived, request }));
const failures = validate({ contacts, requests: selectedRequests });
const summary = {
  caveat: "Source-records request operations track collection workflow only. Missing, partial, denied, delayed, or redirected records do not prove fraud, misconduct, or tampering.",
  generatedAt: new Date().toISOString().slice(0, 10),
  contacts: options.contacts,
  tracker: options.tracker,
  receivedFiles: options.receivedFiles,
  draftDir: options.draftDir,
  state: options.state,
  dryRun: options.dryRun,
  failures,
  requestRows: selectedRequests.length,
  manualActionRequiredRows: selectedRequests.filter((request) => request.manualActionRequired).length,
  draftCount: drafts.length,
  rowsByStatus: selectedRequests.reduce((counts, request) => {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
    return counts;
  }, {}),
  rowsByState: selectedRequests.reduce((counts, request) => {
    counts[request.state] = (counts[request.state] ?? 0) + 1;
    return counts;
  }, {}),
  drafts: drafts.map(({ emailBody, markdownBody, ...draft }) => draft),
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

if (!options.dryRun) {
  writeJson(options.receivedFiles, {
    caveat: "Received source-record files ledger links raw productions and normalized artifacts to request IDs. Empty rows mean no files have been accessioned yet.",
    generatedAt: summary.generatedAt,
    requestsTracked: selectedRequests.length,
    receivedFiles: receivedRows,
  });
  for (const draft of drafts) {
    writeText(draft.emailFile, draft.emailBody);
    writeText(draft.markdownFile, draft.markdownBody);
  }
  writeJson(options.summaryOut, summary);
}

console.log(JSON.stringify(summary, null, 2));
