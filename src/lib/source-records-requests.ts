import sourceRecordsContacts from "../../data/source-records-request-contacts.json";
import sourceRecordsOperations from "../../data/source-records-request-operations.json";
import sourceRecordsReceivedFiles from "../../data/source-records-request-received-files.json";
import sourceRecordsTracker from "../../data/source-records-request-tracker.json";

export type SourceRecordsRequestTracker = typeof sourceRecordsTracker;
export type SourceRecordsRequestRow = SourceRecordsRequestTracker["requests"][number];
export type SourceRecordsRequestStatus = SourceRecordsRequestRow["status"];

function requestEmailBody(input: {
  contact: (typeof sourceRecordsContacts.states)[number] | undefined;
  request: SourceRecordsRequestRow;
}) {
  const route = input.contact
    ? [
        input.contact.primaryCustodian,
        input.contact.recipientPortalUrl,
        `Lookup/redirect reference: ${input.contact.recipientLookupUrl}`,
        input.contact.notes,
      ].filter(Boolean).join("\n")
    : "Verify the correct state, county, or municipal records custodian before sending.";

  return [
    "Hello,",
    "",
    `I am requesting public records for the ${input.request.stateName} ${input.request.electionYear} general election source records listed below. This is a source-availability and reconciliation request only; it is not an allegation or proof of fraud, misconduct, or tampering.`,
    "",
    "SECTION 1 - REQUESTER ACTION REQUIRED BEFORE SENDING",
    "- Replace the requester placeholders below with your contact information.",
    "- Verify the custodian, email address, or official portal before sending.",
    "- Send this from your own email account or official portal session.",
    "- Save replies, produced files, redirects, fee estimates, denials, and clarification emails.",
    "- Submit received responses through the GitHub records-response form so maintainers can verify and load them.",
    "",
    "Requester:",
    "[requester name]",
    "[organization, if any]",
    "[requester email]",
    "[requester phone, optional]",
    "",
    "SECTION 2 - REQUEST PREPARATION CONTEXT",
    `Tracking ID: ${input.request.requestId}`,
    `Local packet: ${input.request.localPacket}`,
    `Source lead: ${input.request.sourceUrl}`,
    `Evidence summary: ${input.request.evidenceSummary}`,
    `Prepared action: ${input.request.preparedAction}`,
    "",
    "SECTION 3 - PUBLIC RECORDS REQUEST TEXT",
    `Requested records: ${input.request.requestedRecords}`,
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

function mailtoHref(input: { body: string; contact: (typeof sourceRecordsContacts.states)[number] | undefined; subject: string }) {
  const recipient = input.contact?.recipientEmail ?? "";
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`;
}

export function listSourceRecordsRequests(input: {
  state?: string;
  status?: SourceRecordsRequestStatus;
  year?: number;
} = {}) {
  const requestedState = input.state?.toUpperCase();
  const year = input.year ?? 2024;
  const requests = sourceRecordsTracker.requests
    .filter((entry) => entry.electionYear === year)
    .filter((entry) => !requestedState || entry.state === requestedState)
    .filter((entry) => !input.status || entry.status === input.status)
    .sort((a, b) => a.requestId.localeCompare(b.requestId));
  const contacts = sourceRecordsContacts.states.filter((entry) => !requestedState || entry.state === requestedState);
  const contactByState = new Map(contacts.map((entry) => [entry.state, entry]));
  const receivedFiles = sourceRecordsReceivedFiles.receivedFiles.filter((entry) =>
    requests.some((request) => request.requestId === entry.requestId),
  );

  return {
    caveat: sourceRecordsTracker.caveat,
    contacts,
    generatedAt: sourceRecordsTracker.generatedAt,
    operations: sourceRecordsOperations,
    receivedFiles,
    requests,
    summary: {
      draftFiles: sourceRecordsOperations.drafts
        .filter((draft) => !requestedState || draft.state === requestedState)
        .map((draft) => {
          const request = requests.find((entry) => entry.state === draft.state);
          const contact = contactByState.get(draft.state);
          const emailBody = request
            ? requestEmailBody({ contact, request })
            : "Verify the correct records custodian before sending.";
          const recipientHint = contact?.recipientEmail
            ? contact.recipientEmail
            : "Verify recipient email or use the official records portal before sending.";
          const routingHint = contact
            ? `Start with ${contact.primaryCustodian}; use ${contact.recipientLookupUrl} to identify county or local custodians when needed.`
            : "Verify the correct records custodian before sending.";
          return {
            ...draft,
            emailBody,
            mailtoHref: mailtoHref({ body: emailBody, contact, subject: draft.subject }),
            recipientHint,
            routingHint,
          };
        }),
      manualActionRequiredRows: requests.filter((request) => request.manualActionRequired).length,
      requestRows: requests.length,
      rowsByStatus: requests.reduce<Record<string, number>>((counts, request) => {
        counts[request.status] = (counts[request.status] ?? 0) + 1;
        return counts;
      }, {}),
      rowsByState: requests.reduce<Record<string, number>>((counts, request) => {
        counts[request.state] = (counts[request.state] ?? 0) + 1;
        return counts;
      }, {}),
      states: new Set(requests.map((request) => request.state)).size,
    },
  };
}
