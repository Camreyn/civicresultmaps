import electronicIntegrityContacts from "../../data/electronic-integrity-request-contacts.json";
import electronicIntegrityOperations from "../../data/electronic-integrity-request-operations.json";
import electronicIntegrityReceivedFiles from "../../data/electronic-integrity-received-files.json";
import electronicIntegrityTracker from "../../data/electronic-integrity-request-tracker.json";

export type ElectronicIntegrityRequestTracker = typeof electronicIntegrityTracker;
export type ElectronicIntegrityRequestRow = ElectronicIntegrityRequestTracker["requests"][number];
export type ElectronicIntegrityRequestStatus = ElectronicIntegrityRequestRow["status"];

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
      draftFiles: electronicIntegrityOperations.drafts.filter((draft) => !requestedState || draft.state === requestedState),
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
