import type { Metadata } from "next";
import { ArrowLeft, Database, Map, Radar } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { listEvidenceTimelineEvents, summarizeEvidenceTimeline } from "@/lib/evidence-events";
import { SuspiciousTimeline } from "../timeline/suspicious-timeline";

export const metadata: Metadata = {
  title: "Evidence & Records Timeline",
  description: "A neutral, source-backed timeline of election records, review questions, evidence gaps, and public-records checkpoints.",
  alternates: { canonical: "/evidence" },
};

const caveat =
  "This timeline organizes source-backed records, review questions, and evidence gaps. Missing, partial, denied, delayed, or constrained records do not establish fraud or misconduct; they identify where independent reconciliation still needs source evidence.";

export default function EvidencePage() {
  const events = listEvidenceTimelineEvents();
  const summary = summarizeEvidenceTimeline(events);

  return (
    <main className="timeline-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <BrandMark />
          <div>
            <strong>Civic Result Maps</strong>
            <span>Evidence &amp; records timeline</span>
          </div>
        </a>
        <div className="topbar-actions">
          <a className="topbar-link" href="/">
            <ArrowLeft aria-hidden size={15} />
            Workspace
          </a>
          <a className="topbar-link" href="/readiness">
            <Database aria-hidden size={15} />
            Readiness
          </a>
          <span className="domain">civicresultmaps.org</span>
        </div>
      </header>

      <nav className="timeline-app-switcher" aria-label="Civic Result Maps apps">
        <a href="/">
          <Map aria-hidden size={16} />
          State app
        </a>
        <a aria-current="page" href="/evidence">
          <Radar aria-hidden size={16} />
          Evidence
        </a>
        <a href="/readiness">
          <Database aria-hidden size={16} />
          Readiness
        </a>
      </nav>

      <SuspiciousTimeline caveat={caveat} events={events} summary={summary} />
    </main>
  );
}
