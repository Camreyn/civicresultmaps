import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  contacts: "data/electronic-integrity-request-contacts.json",
  draftDir: "data/electronic-integrity-request-email-drafts",
  plan: "data/electronic-integrity-request-plan.json",
  receivedFiles: "data/electronic-integrity-received-files.json",
  registry: "data/electronic-integrity-artifacts.json",
  summaryOut: "data/electronic-integrity-request-operations.json",
  tracker: "data/electronic-integrity-request-tracker.json",
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
    else if (arg === "--registry") options.registry = argv[++index];
    else if (arg === "--contacts") options.contacts = argv[++index];
    else if (arg === "--tracker") options.tracker = argv[++index];
    else if (arg === "--received-files") options.receivedFiles = argv[++index];
    else if (arg === "--draft-dir") options.draftDir = argv[++index];
    else if (arg === "--summary-out") options.summaryOut = argv[++index];
    else if (arg === "--help") {
      console.log("Usage: node scripts/sync-electronic-integrity-request-operations.mjs [--state WI|all] [--dry-run]");
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

function requestId(year, state, type) {
  return `EI-${year}-${state}-${String(type).toUpperCase().replaceAll("_", "-")}`;
}

function artifactLabel(artifactTypes, type) {
  return artifactTypes.find((entry) => entry.type === type)?.label ?? type.replaceAll("_", " ");
}

function contactFor(contacts, stateCode) {
  return contacts.states.find((entry) => entry.state === stateCode);
}

function requestableArtifacts(state) {
  return state.artifacts.filter((artifact) => artifact.requestRequired || artifact.status === "partial" || artifact.status === "blocked");
}

function mergeTrackerRow({ artifact, artifactTypes, contact, electionYear, existing, state }) {
  const id = requestId(electionYear, state.state, artifact.type);
  const prior = existing.get(id) ?? {};
  const receivedFiles = Array.isArray(prior.receivedFiles) ? prior.receivedFiles : [];
  return {
    requestId: id,
    electionYear,
    state: state.state,
    stateName: state.stateName,
    artifactType: artifact.type,
    artifactLabel: artifactLabel(artifactTypes, artifact.type),
    artifactStatus: artifact.status,
    requestRequired: artifact.requestRequired,
    status: statusValues.has(prior.status) ? prior.status : "draft_ready",
    primaryCustodian: contact.primaryCustodian,
    recipientEmail: prior.recipientEmail ?? contact.recipientEmail,
    recipientPortalUrl: contact.recipientPortalUrl,
    recipientLookupUrl: contact.recipientLookupUrl,
    countyCustodianLikely: contact.countyCustodianLikely,
    requestPath: artifact.requestPath ?? "",
    requestedRecords: artifact.tamperDetectionUse,
    preferredFormats: ["original export", "CSV", "XLSX", "JSON", "log bundle", "audit workpaper", "record layout", "data dictionary"],
    sentAt: prior.sentAt ?? "",
    acknowledgedAt: prior.acknowledgedAt ?? "",
    closedAt: prior.closedAt ?? "",
    feeStatus: prior.feeStatus ?? "unknown",
    responseSummary: prior.responseSummary ?? "",
    receivedFiles,
    sourceUrl: artifact.sourceUrl ?? "",
    localArtifact: artifact.localArtifact ?? "",
    notes: prior.notes ?? contact.notes,
  };
}

function mergeReceivedRow({ row, existing }) {
  const prior = existing.get(row.requestId) ?? {};
  return {
    requestId: row.requestId,
    state: row.state,
    artifactType: row.artifactType,
    status: prior.status ?? "none_received",
    receivedAt: prior.receivedAt ?? "",
    files: Array.isArray(prior.files) ? prior.files : [],
    accessionNotes: prior.accessionNotes ?? "",
    normalizedArtifactPath: prior.normalizedArtifactPath ?? "",
    ingestScript: prior.ingestScript ?? "",
  };
}

function requestEmailBody({ artifacts, artifactTypes, contact, electionYear, requester, state }) {
  const evidenceLines = artifacts.map((artifact) => {
    const id = requestId(electionYear, state.state, artifact.type);
    const label = artifactLabel(artifactTypes, artifact.type);
    const custody = artifact.requestPath ? ` Suggested custodian/path: ${artifact.requestPath}` : "";
    return `- ${id} - ${label}: status=${artifact.status}; grain=${artifact.granularity}; reconciliation=${artifact.reconciliationStatus}.${custody}`;
  });

  return `Hello,\n\nI am requesting public records for the ${state.stateName} ${electionYear} general election that can reconcile electronic election-system output against official results, paper/audit evidence, and custody records. This is an evidence-availability request only; it is not an allegation or proof of tampering.\n\nRequester:\n${requester.name}\n${requester.organization}\n${requester.email}\n${requester.phone}\n\nRequested evidence families and tracking IDs:\n${evidenceLines.join("\n")}\n\nPreferred production format: original exports where available, CSV, XLSX, JSON, log bundles, audit workpapers, record layouts, or data dictionaries. Please preserve original filenames, timestamps, export settings, and field definitions.\n\nIf your office does not maintain a requested record, please identify the state, county, municipal, vendor, or other custodian most likely to maintain it. If fees are expected, please provide an estimate before processing.\n\nPrimary custodian path currently recorded for routing:\n${contact.primaryCustodian}\n${contact.recipientPortalUrl}\nLookup/redirect reference: ${contact.recipientLookupUrl}\n\nThank you.\n`;
}

function emailDraft({ artifacts, artifactTypes, contact, electionYear, requester, state }) {
  const to = contact.recipientEmail || "[verify recipient email or paste this body into the official records portal]";
  const subject = `${state.stateName} ${electionYear} electronic election records request`;
  const body = requestEmailBody({ artifacts, artifactTypes, contact, electionYear, requester, state });
  return `To: ${to}\nSubject: ${subject}\n\n${body}`;
}

function markdownDraft({ artifacts, artifactTypes, contact, electionYear, requester, state }) {
  const subject = `${state.stateName} ${electionYear} electronic election records request`;
  return `# ${subject}\n\nTo: ${contact.recipientEmail || "[verify recipient email or use official records portal]"}\n\nPortal/lookup:\n- ${contact.recipientPortalUrl}\n- ${contact.recipientLookupUrl}\n\n\`\`\`text\n${requestEmailBody({ artifacts, artifactTypes, contact, electionYear, requester, state })}\`\`\`\n`;
}

function validate({ contacts, registry, rows }) {
  const failures = [];
  const contactStates = new Set(contacts.states.map((entry) => entry.state));
  for (const state of registry.states) {
    if (!contactStates.has(state.state)) failures.push(`${state.state}: missing request contact metadata`);
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
  for (const row of rows) {
    if (!statusValues.has(row.status)) failures.push(`${row.requestId}: invalid status ${row.status}`);
    if (!row.requestId.startsWith(`EI-${registry.electionYear}-${row.state}-`)) failures.push(`${row.requestId}: invalid request id`);
    if (!row.requestedRecords) failures.push(`${row.requestId}: requestedRecords is required`);
  }
  return failures;
}

const options = parseArgs(process.argv);
const registry = readJson(options.registry);
const contacts = readJson(options.contacts);
const previousTracker = readJsonIfExists(options.tracker, { requests: [] });
const previousReceived = readJsonIfExists(options.receivedFiles, { receivedFiles: [] });
const existingTracker = new Map((previousTracker.requests ?? []).map((row) => [row.requestId, row]));
const existingReceived = new Map((previousReceived.receivedFiles ?? []).map((row) => [row.requestId, row]));

const selectedStates = registry.states.filter((state) => options.state === "all" || state.state === options.state);
const trackerRows = [];
const drafts = [];

for (const state of selectedStates) {
  const contact = contactFor(contacts, state.state);
  if (!contact) continue;
  const artifacts = requestableArtifacts(state);
  if (!artifacts.length) continue;
  for (const artifact of artifacts) {
    trackerRows.push(mergeTrackerRow({ artifact, artifactTypes: registry.artifactTypes, contact, electionYear: registry.electionYear, existing: existingTracker, state }));
  }
  const baseName = `${slug(state.state)}-${registry.electionYear}-electronic-integrity-request`;
  drafts.push({
    state: state.state,
    emailFile: `${options.draftDir}/${baseName}.eml`,
    markdownFile: `${options.draftDir}/${baseName}.md`,
    subject: `${state.stateName} ${registry.electionYear} electronic election records request`,
    requestIds: artifacts.map((artifact) => requestId(registry.electionYear, state.state, artifact.type)),
    emailBody: emailDraft({
      artifacts,
      artifactTypes: registry.artifactTypes,
      contact,
      electionYear: registry.electionYear,
      requester: contacts.defaultRequester,
      state,
    }),
    markdownBody: markdownDraft({
      artifacts,
      artifactTypes: registry.artifactTypes,
      contact,
      electionYear: registry.electionYear,
      requester: contacts.defaultRequester,
      state,
    }),
  });
}

trackerRows.sort((a, b) => a.requestId.localeCompare(b.requestId));
const receivedRows = trackerRows.map((row) => mergeReceivedRow({ row, existing: existingReceived }));
const failures = validate({ contacts, registry, rows: trackerRows });
const summary = {
  caveat: "Request operations track collection workflow only. Missing, partial, denied, or delayed records do not prove electronic tampering.",
  generatedAt: new Date().toISOString().slice(0, 10),
  registry: options.registry,
  contacts: options.contacts,
  tracker: options.tracker,
  receivedFiles: options.receivedFiles,
  draftDir: options.draftDir,
  state: options.state,
  dryRun: options.dryRun,
  failures,
  requestRows: trackerRows.length,
  draftCount: drafts.length,
  rowsByStatus: trackerRows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {}),
  rowsByState: trackerRows.reduce((counts, row) => {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
    return counts;
  }, {}),
  drafts: drafts.map(({ emailBody, markdownBody, ...draft }) => draft),
};

if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

if (!options.dryRun) {
  writeJson(options.tracker, {
    caveat: summary.caveat,
    generatedAt: summary.generatedAt,
    registry: options.registry,
    contacts: options.contacts,
    requests: trackerRows,
  });
  writeJson(options.receivedFiles, {
    caveat: "Received files ledger links raw productions and normalized artifacts to request IDs. Empty rows mean no files have been accessioned yet.",
    generatedAt: summary.generatedAt,
    requestsTracked: trackerRows.length,
    receivedFiles: receivedRows,
  });
  for (const draft of drafts) {
    writeText(draft.emailFile, draft.emailBody);
    writeText(draft.markdownFile, draft.markdownBody);
  }
  writeJson(options.summaryOut, summary);
}

console.log(JSON.stringify(summary, null, 2));
