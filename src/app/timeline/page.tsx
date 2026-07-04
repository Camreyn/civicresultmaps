import type { Metadata } from "next";
import { ArrowLeft, Database, Map, Radar } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { listSuspiciousTimelineEvents, summarizeSuspiciousTimeline } from "@/lib/suspicious-events";
import { SuspiciousTimeline } from "./suspicious-timeline";

export const metadata: Metadata = {
  title: "Suspicious Event Timeline | Civic Result Maps",
  description: "A national timeline of election review prompts, unresolved evidence gaps, and records-request checkpoints.",
};

const caveat =
  "This timeline tracks review prompts and evidence gaps only. Missing, partial, denied, delayed, or constrained records do not prove tampering; they show where independent reconciliation still needs source evidence.";

export default function TimelinePage() {
  const events = listSuspiciousTimelineEvents();
  const summary = summarizeSuspiciousTimeline(events);

  return (
    <main className="timeline-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <BrandMark />
          <div>
            <strong>Civic Result Maps</strong>
            <span>Suspicious event timeline</span>
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
        <a aria-current="page" href="/timeline">
          <Radar aria-hidden size={16} />
          Timeline
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
