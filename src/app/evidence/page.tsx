import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { listEvidenceTimelineEvents, summarizeEvidenceTimeline } from "@/lib/evidence-events";
import { SuspiciousTimeline } from "../timeline/suspicious-timeline";

export const metadata: Metadata = pageMetadata({
  title: "Evidence & Records Timeline",
  description: "A neutral, source-backed timeline of election records, review questions, evidence gaps, and public-records checkpoints.",
  path: "/evidence",
});

const caveat =
  "This timeline organizes source-backed records, review questions, and evidence gaps. Missing, partial, denied, delayed, or constrained records do not establish fraud or misconduct; they identify where independent reconciliation still needs source evidence.";

export default function EvidencePage() {
  const events = listEvidenceTimelineEvents();
  const summary = summarizeEvidenceTimeline(events);

  return (
    <main className="timeline-shell">


      <SuspiciousTimeline caveat={caveat} events={events} summary={summary} />
    </main>
  );
}
