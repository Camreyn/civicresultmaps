import {
  listSuspiciousTimelineEvents,
  summarizeSuspiciousTimeline,
} from "./suspicious-events";
import type {
  SuspiciousEventCategory,
  SuspiciousEventSeverity,
  SuspiciousTimelineEvent,
  SuspiciousTimelineSource,
} from "./suspicious-events";

export type EvidenceRecordCategory = SuspiciousEventCategory;
export type EvidenceRecordPriority = SuspiciousEventSeverity;
export type EvidenceTimelineEvent = Omit<SuspiciousTimelineEvent, "tamperingExample"> & {
  relevance: string;
};
export type EvidenceTimelineSource = SuspiciousTimelineSource;

const relevanceByCategory: Record<EvidenceRecordCategory, string> = {
  audit:
    "Audit records document the scope and method of an independent check and support comparison of machine-tabulated outcomes with paper evidence.",
  custody:
    "Custody records help reconstruct who handled ballots, equipment, and removable media, when transfers occurred, and whether required documentation is complete.",
  machine_logs:
    "Tabulator and election-management-system logs help reconstruct configuration, upload, adjudication, and event timing alongside other official records.",
  paper_evidence:
    "Cast-vote records, ballot images where lawful, and retained paper records support comparison of electronic interpretations with voter-mark evidence.",
  records_request:
    "Request records document what was sought, which office holds it, response timing, fees or exemptions, and any remaining access gap.",
  results:
    "Local result rows support reconciliation across precinct, ward, batch, county, and statewide publications and help document corrections or format changes.",
};

export function listEvidenceTimelineEvents(): EvidenceTimelineEvent[] {
  return listSuspiciousTimelineEvents().map(({ tamperingExample: _legacyScenario, ...event }) => ({
    ...event,
    relevance: relevanceByCategory[event.category],
  }));
}

export function summarizeEvidenceTimeline(events: EvidenceTimelineEvent[]) {
  return summarizeSuspiciousTimeline(
    events.map((event) => ({
      ...event,
      tamperingExample: event.relevance,
    })),
  );
}
