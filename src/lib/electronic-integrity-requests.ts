import electronicIntegrityContacts from "../../data/electronic-integrity-request-contacts.json";
import electronicIntegrityOperations from "../../data/electronic-integrity-request-operations.json";
import electronicIntegrityReceivedFiles from "../../data/electronic-integrity-received-files.json";
import electronicIntegrityTracker from "../../data/electronic-integrity-request-tracker.json";

export type ElectronicIntegrityRequestTracker = typeof electronicIntegrityTracker;
export type ElectronicIntegrityRequestRow = ElectronicIntegrityRequestTracker["requests"][number];
export type ElectronicIntegrityRequestStatus = ElectronicIntegrityRequestRow["status"];

function requestEmailBody(input: {
  contact: (typeof electronicIntegrityContacts.states)[number] | undefined;
  requests: ElectronicIntegrityRequestRow[];
  state: string | undefined;
  year: number;
}) {
  const stateName = input.requests[0]?.stateName ?? input.state ?? "the selected state";
  const lines = input.requests.map((request) => {
    const custody = request.requestPath ? ` Suggested custodian/path: ${request.requestPath}` : "";
    return `- ${request.requestId} - ${request.artifactLabel}: status=${request.artifactStatus}; request status=${request.status}. ${request.requestedRecords}${custody}`;
  });
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
    `I am requesting public records for the ${stateName} ${input.year} general election that can reconcile electronic election-system output against official results, paper/audit evidence, and custody records. This is an evidence-availability request only; it is not an allegation or proof of tampering.`,
    "",
    "Requester:",
    "[requester name]",
    "[organization, if any]",
    "[requester email]",
    "[requester phone, optional]",
    "",
    "Requested evidence families and tracking IDs:",
    ...lines,
    "",
    "Preferred production format: original exports where available, CSV, XLSX, JSON, log bundles, audit workpapers, record layouts, or data dictionaries. Please preserve original filenames, timestamps, export settings, and field definitions.",
    "",
    "If your office does not maintain a requested record, please identify the state, county, municipal, vendor, or other custodian most likely to maintain it. If fees are expected, please provide an estimate before processing.",
    "",
    "Routing hint currently recorded for this state:",
    route,
    "",
    "Thank you.",
  ].join("\n");
}

function mailtoHref(input: { body: string; contact: (typeof electronicIntegrityContacts.states)[number] | undefined; subject: string }) {
  const recipient = input.contact?.recipientEmail ?? "";
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`;
}

export function listElectronicIntegrityRequests(input: {
  state?: string;
  status?: ElectronicIntegrityRequestStatus;
  year?: number;
} = {}) {
  const requestedState = input.state?.toUpperCase();
  const year = input.year ?? 2024;
  const requests = electronicIntegrityTracker.requests
    .filter((entry) => entry.electionYear === year)
    .filter((entry) => !requestedState || entry.state === requestedState)
    .filter((entry) => !input.status || entry.status === input.status)
    .sort((a, b) => a.requestId.localeCompare(b.requestId));
  const contacts = electronicIntegrityContacts.states.filter((entry) => !requestedState || entry.state === requestedState);
  const contactByState = new Map(contacts.map((entry) => [entry.state, entry]));
  const receivedFiles = electronicIntegrityReceivedFiles.receivedFiles.filter((entry) =>
    requests.some((request) => request.requestId === entry.requestId),
  );

  return {
    caveat: electronicIntegrityTracker.caveat,
    contacts,
    generatedAt: electronicIntegrityTracker.generatedAt,
    operations: electronicIntegrityOperations,
    receivedFiles,
    requests,
    summary: {
      draftFiles: electronicIntegrityOperations.drafts
        .filter((draft) => !requestedState || draft.state === requestedState)
        .map((draft) => {
          const stateRequests = requests.filter((request) => request.state === draft.state);
          const contact = contactByState.get(draft.state);
          const emailBody = requestEmailBody({ contact, requests: stateRequests, state: draft.state, year });
          const recipientHint = contact?.recipientEmail
            ? contact.recipientEmail
            : "Verify recipient email or use the official records portal before sending.";
          const routingHint = contact
            ? `Start with ${contact.primaryCustodian}; use ${contact.recipientLookupUrl} to identify county or municipal custodians when needed.`
            : "Verify the correct records custodian before sending.";
          return {
            ...draft,
            emailBody,
            mailtoHref: mailtoHref({ body: emailBody, contact, subject: draft.subject }),
            recipientHint,
            routingHint,
          };
        }),
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
