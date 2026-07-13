"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Download, FileSearch, Filter, PlusCircle, RadioTower, Search, ShieldQuestion } from "lucide-react";
import type {
  EvidenceRecordCategory,
  EvidenceRecordPriority,
  EvidenceTimelineEvent,
} from "@/lib/evidence-events";

type TimelineSummary = {
  byCategory: Record<string, number>;
  elevated: number;
  events: number;
  sources: number;
  states: number;
};

type SuspiciousTimelineProps = {
  caveat: string;
  events: EvidenceTimelineEvent[];
  summary: TimelineSummary;
};

const severityOptions: Array<{ label: string; value: "all" | EvidenceRecordPriority }> = [
  { label: "All review priorities", value: "all" },
  { label: "Follow-up", value: "elevated" },
  { label: "Priority", value: "critical" },
  { label: "Source note", value: "watch" },
];

const categoryOptions: Array<{ label: string; value: "all" | EvidenceRecordCategory }> = [
  { label: "All categories", value: "all" },
  { label: "Results", value: "results" },
  { label: "Machine logs", value: "machine_logs" },
  { label: "Paper evidence", value: "paper_evidence" },
  { label: "Audit", value: "audit" },
  { label: "Custody", value: "custody" },
  { label: "Records request", value: "records_request" },
];

const githubIssueUrl = "https://github.com/Camreyn/civicresultmaps/issues/new";
const githubTimelineAdditionTemplate = "timeline-addition.yml";

function buildTimelineAdditionUrl() {
  const params = new URLSearchParams({
    event_date: "YYYY-MM-DD",
    event_summary: "Please summarize the source-backed event that should be added to the timeline.",
    labels: "timeline,data-review",
    review_question: "What review question, evidence gap, or source-acquisition checkpoint does this event document?",
    source_url: "https://",
    state_or_scope: "State / county / national",
    template: githubTimelineAdditionTemplate,
    title: "[Timeline addition] ",
  });

  return `${githubIssueUrl}?${params.toString()}`;
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, events: EvidenceTimelineEvent[]) {
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
    "relevance",
    "alternate_explanation",
    "sources",
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
    event.relevance,
    event.alternateExplanation,
    event.sources.map((source) => [source.label, source.url, source.localArtifact].filter(Boolean).join(" | ")).join("; "),
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

function reviewPriorityLabel(value: EvidenceRecordPriority) {
  if (value === "critical") {
    return "priority";
  }

  if (value === "elevated") {
    return "follow-up";
  }

  return "source note";
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function EventIcon({ category }: { category: EvidenceRecordCategory }) {
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
  const [category, setCategory] = useState<"all" | EvidenceRecordCategory>("all");
  const [severity, setSeverity] = useState<"all" | EvidenceRecordPriority>("all");
  const [query, setQuery] = useState("");
  const timelineAdditionUrl = useMemo(() => buildTimelineAdditionUrl(), []);

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
            event.relevance,
            event.alternateExplanation,
            event.scope,
            event.sources.map((source) => [source.label, source.url, source.localArtifact].filter(Boolean).join(" ")).join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;
      return matchesCategory && matchesSeverity && matchesQuery;
    });
  }, [category, events, query, severity]);

  const symptomExamples = useMemo(() => {
    const examples = new Map<EvidenceRecordCategory, EvidenceTimelineEvent>();
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
          <p className="section-label">Evidence &amp; Records Timeline</p>
          <h1>National evidence and records timeline</h1>
          <p>{caveat}</p>
        </div>
        <div className="timeline-scanner" aria-hidden>
          <svg className="timeline-scanner-radar" viewBox="0 0 100 100">
            <circle className="timeline-scanner-ring outer" cx="50" cy="50" r="32" />
            <circle className="timeline-scanner-ring inner" cx="50" cy="50" r="16" />
            <line className="timeline-scanner-axis" x1="50" x2="50" y1="7" y2="93" />
            <line className="timeline-scanner-axis" x1="7" x2="93" y1="50" y2="50" />
            <g className="timeline-scanner-sweep">
              <path d="M50 50 L96.4 37.6 A48 48 0 0 1 96.4 62.4 Z" />
              <line x1="50" x2="96.4" y1="50" y2="62.4" />
            </g>
            <line className="timeline-scanner-row" x1="7" x2="93" y1="28" y2="28" />
            <line className="timeline-scanner-row alt" x1="7" x2="93" y1="68" y2="68" />
            <circle className="timeline-scanner-pulse one" cx="28" cy="32" r="2.1" />
            <circle className="timeline-scanner-pulse two" cx="76" cy="46" r="2.1" />
            <circle className="timeline-scanner-pulse three" cx="44" cy="75" r="2.1" />
          </svg>
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
          <span>Follow-up or priority</span>
          <strong>{summary.elevated.toLocaleString()}</strong>
        </article>
        <article>
          <span>Sources</span>
          <strong>{summary.sources.toLocaleString()}</strong>
        </article>
      </section>

      <section className="timeline-symptom-guide" aria-label="Tracked evidence categories">
        <div className="timeline-symptom-head">
          <div>
            <p className="section-label">Record categories</p>
            <h2>What each tracked record can help reconcile</h2>
          </div>
          <span>Each example is a review hypothesis, not a conclusion.</span>
        </div>
        <div className="timeline-symptom-grid">
          {symptomExamples.map((event) => (
            <article className="timeline-symptom-card" key={event.category}>
              <strong>{statusLabel(event.category)}</strong>
              <div>
                <span>Why this record might matter</span>
                <p>{event.relevance}</p>
              </div>
              <div>
                <span>Other explanations to check</span>
                <p>{event.alternateExplanation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="timeline-console">
        <div className="timeline-console-head">
          <div>
            <h2>Evidence and records stream</h2>
            <span>{filteredEvents.length.toLocaleString()} records visible</span>
          </div>
          <div className="timeline-console-actions">
            <a href={timelineAdditionUrl} rel="noreferrer" target="_blank">
              <PlusCircle aria-hidden size={16} />
              Submit Timeline Addition
            </a>
            <button type="button" onClick={() => downloadCsv("national-evidence-records-timeline.csv", filteredEvents)}>
              <Download aria-hidden size={16} />
              Export CSV
            </button>
          </div>
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
                  <span className={`timeline-severity timeline-severity-${event.severity}`}>{reviewPriorityLabel(event.severity)}</span>
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
                    <span>Why this record might matter</span>
                    <p>{event.relevance}</p>
                  </article>
                  <article>
                    <span>Other explanations to check</span>
                    <p>{event.alternateExplanation}</p>
                  </article>
                </div>
                <div className="timeline-source-row">
                  {event.sources.map((source, sourceIndex) => (
                    <span className="timeline-source-item" key={`${event.id}-source-${sourceIndex}`}>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      ) : (
                        <span>{source.label}</span>
                      )}
                      {source.localArtifact ? <code>{source.localArtifact}</code> : null}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
