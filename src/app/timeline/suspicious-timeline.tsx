"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Download, FileSearch, Filter, RadioTower, Search, ShieldQuestion } from "lucide-react";
import type { SuspiciousEventCategory, SuspiciousEventSeverity, SuspiciousTimelineEvent } from "@/lib/suspicious-events";

type TimelineSummary = {
  byCategory: Record<string, number>;
  elevated: number;
  events: number;
  states: number;
};

type SuspiciousTimelineProps = {
  caveat: string;
  events: SuspiciousTimelineEvent[];
  summary: TimelineSummary;
};

const severityOptions: Array<{ label: string; value: "all" | SuspiciousEventSeverity }> = [
  { label: "All severity", value: "all" },
  { label: "Elevated", value: "elevated" },
  { label: "Critical", value: "critical" },
  { label: "Watch", value: "watch" },
];

const categoryOptions: Array<{ label: string; value: "all" | SuspiciousEventCategory }> = [
  { label: "All categories", value: "all" },
  { label: "Results", value: "results" },
  { label: "Machine logs", value: "machine_logs" },
  { label: "Paper evidence", value: "paper_evidence" },
  { label: "Audit", value: "audit" },
  { label: "Custody", value: "custody" },
  { label: "Records request", value: "records_request" },
];

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, events: SuspiciousTimelineEvent[]) {
  const headers = [
    "date",
    "phase",
    "state",
    "state_name",
    "title",
    "category",
    "severity",
    "status",
    "scope",
    "summary",
    "review_question",
    "evidence_needed",
    "tampering_example",
    "alternate_explanation",
    "source_label",
    "source_url",
    "local_artifact",
  ];
  const rows = events.map((event) => [
    event.date,
    event.phase,
    event.state,
    event.stateName,
    event.title,
    event.category,
    event.severity,
    event.status,
    event.scope,
    event.summary,
    event.reviewQuestion,
    event.evidenceNeeded,
    event.tamperingExample,
    event.alternateExplanation,
    event.sourceLabel,
    event.sourceUrl,
    event.localArtifact,
  ]);
  const content = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function EventIcon({ category }: { category: SuspiciousEventCategory }) {
  if (category === "machine_logs") {
    return <RadioTower aria-hidden size={18} />;
  }

  if (category === "custody") {
    return <ShieldQuestion aria-hidden size={18} />;
  }

  if (category === "records_request") {
    return <FileSearch aria-hidden size={18} />;
  }

  if (category === "audit") {
    return <Activity aria-hidden size={18} />;
  }

  return <AlertTriangle aria-hidden size={18} />;
}

export function SuspiciousTimeline({ caveat, events, summary }: SuspiciousTimelineProps) {
  const [category, setCategory] = useState<"all" | SuspiciousEventCategory>("all");
  const [severity, setSeverity] = useState<"all" | SuspiciousEventSeverity>("all");
  const [query, setQuery] = useState("");

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory = category === "all" || event.category === category;
      const matchesSeverity = severity === "all" || event.severity === severity;
      const matchesQuery = normalizedQuery
        ? [
            event.title,
            event.state,
            event.stateName,
            event.phase,
            event.summary,
            event.reviewQuestion,
            event.evidenceNeeded,
            event.tamperingExample,
            event.alternateExplanation,
            event.scope,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;
      return matchesCategory && matchesSeverity && matchesQuery;
    });
  }, [category, events, query, severity]);

  const symptomExamples = useMemo(() => {
    const examples = new Map<SuspiciousEventCategory, SuspiciousTimelineEvent>();
    for (const event of events) {
      if (!examples.has(event.category)) {
        examples.set(event.category, event);
      }
    }
    return Array.from(examples.values()).sort((a, b) => statusLabel(a.category).localeCompare(statusLabel(b.category)));
  }, [events]);

  return (
    <>
      <section className="timeline-hero">
        <div>
          <p className="section-label">Suspicious Event Timeline</p>
          <h1>National evidence-gap timeline</h1>
          <p>{caveat}</p>
        </div>
        <div className="timeline-scanner" aria-hidden>
          <span className="timeline-scanner-sweep" />
          <span className="timeline-scanner-row" />
          <span className="timeline-scanner-row alt" />
          <span className="timeline-scanner-pulse one" />
          <span className="timeline-scanner-pulse two" />
          <span className="timeline-scanner-pulse three" />
        </div>
      </section>

      <section className="timeline-metrics" aria-label="Timeline summary">
        <article>
          <span>Events</span>
          <strong>{summary.events.toLocaleString()}</strong>
        </article>
        <article>
          <span>States</span>
          <strong>{summary.states.toLocaleString()}</strong>
        </article>
        <article>
          <span>Elevated or critical</span>
          <strong>{summary.elevated.toLocaleString()}</strong>
        </article>
        <article>
          <span>Categories</span>
          <strong>{Object.keys(summary.byCategory).length.toLocaleString()}</strong>
        </article>
      </section>

      <section className="timeline-symptom-guide" aria-label="Tracked symptom examples">
        <div className="timeline-symptom-head">
          <div>
            <p className="section-label">Symptom Examples</p>
            <h2>What each tracked type could mean</h2>
          </div>
          <span>Each example is a review hypothesis, not a conclusion.</span>
        </div>
        <div className="timeline-symptom-grid">
          {symptomExamples.map((event) => (
            <article className="timeline-symptom-card" key={event.category}>
              <strong>{statusLabel(event.category)}</strong>
              <div>
                <span>One tampering scenario</span>
                <p>{event.tamperingExample}</p>
              </div>
              <div>
                <span>Other common explanations</span>
                <p>{event.alternateExplanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="timeline-console">
        <div className="timeline-console-head">
          <div>
            <h2>Review stream</h2>
            <span>{filteredEvents.length.toLocaleString()} events visible</span>
          </div>
          <button type="button" onClick={() => downloadCsv("national-suspicious-event-timeline.csv", filteredEvents)}>
            <Download aria-hidden size={16} />
            Export CSV
          </button>
        </div>

        <div className="timeline-toolbar" aria-label="Timeline filters">
          <label className="timeline-search">
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search state, phase, evidence, status"
              type="search"
              value={query}
            />
          </label>
          <label className="timeline-select">
            <Filter aria-hidden size={16} />
            <select onChange={(event) => setCategory(event.target.value as typeof category)} value={category}>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="timeline-select">
            <AlertTriangle aria-hidden size={16} />
            <select onChange={(event) => setSeverity(event.target.value as typeof severity)} value={severity}>
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="timeline-stage">
          <span className="timeline-rail" aria-hidden />
          {filteredEvents.map((event, index) => (
            <article
              className={`timeline-event timeline-event-${event.severity}`}
              key={event.id}
              style={{ "--timeline-delay": `${Math.min(index * 45, 900)}ms` } as CSSProperties}
            >
              <div className="timeline-node">
                <EventIcon category={event.category} />
              </div>
              <div className="timeline-date">
                <time dateTime={event.date}>{dateLabel(event.date)}</time>
                <span>{event.phase}</span>
              </div>
              <div className="timeline-event-body">
                <div className="timeline-event-title">
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {event.state} / {statusLabel(event.status)} / {statusLabel(event.category)}
                    </span>
                  </div>
                  <span className={`timeline-severity timeline-severity-${event.severity}`}>{event.severity}</span>
                </div>
                <p>{event.reviewQuestion}</p>
                <dl className="timeline-facts">
                  <div>
                    <dt>Scope</dt>
                    <dd>{statusLabel(event.scope)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{event.summary}</dd>
                  </div>
                  <div>
                    <dt>Evidence needed</dt>
                    <dd>{event.evidenceNeeded}</dd>
                  </div>
                </dl>
                <div className="timeline-interpretation">
                  <article>
                    <span>One tampering scenario</span>
                    <p>{event.tamperingExample}</p>
                  </article>
                  <article>
                    <span>Other common explanations</span>
                    <p>{event.alternateExplanation}</p>
                  </article>
                </div>
                <div className="timeline-source-row">
                  {event.sourceUrl ? (
                    <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                      {event.sourceLabel}
                    </a>
                  ) : (
                    <span>{event.sourceLabel}</span>
                  )}
                  {event.localArtifact ? <code>{event.localArtifact}</code> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
