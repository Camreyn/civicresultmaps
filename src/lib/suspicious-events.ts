import electronicIntegrityArtifacts from "../../data/electronic-integrity-artifacts.json";
import electronicIntegrityOperations from "../../data/electronic-integrity-request-operations.json";
import swingStateParity from "../../data/swing-state-2024-parity-status.json";

export type SuspiciousEventSeverity = "watch" | "elevated" | "critical";
export type SuspiciousEventCategory = "audit" | "custody" | "machine_logs" | "paper_evidence" | "records_request" | "results";

export type SuspiciousTimelineSource = {
  label: string;
  url?: string;
  localArtifact?: string;
};

export type SuspiciousTimelineEvent = {
  id: string;
  date: string;
  phase: string;
  state: string;
  stateName: string;
  title: string;
  category: SuspiciousEventCategory;
  severity: SuspiciousEventSeverity;
  status: string;
  scope: string;
  summary: string;
  reviewQuestion: string;
  evidenceNeeded: string;
  sources: SuspiciousTimelineSource[];
  tamperingExample: string;
  alternateExplanation: string;
};

const artifactTimelineMeta: Record<
  string,
  {
    category: SuspiciousEventCategory;
    date: string;
    phase: string;
    reviewQuestion: string;
    sourceLabel: string;
  }
> = {
  audit_results: {
    category: "audit",
    date: "2024-11-20",
    phase: "Post-election audit window",
    reviewQuestion: "Can paper or audit evidence independently confirm the electronic tabulation?",
    sourceLabel: "Audit records",
  },
  ballot_images: {
    category: "paper_evidence",
    date: "2024-11-08",
    phase: "Ballot-image reconciliation",
    reviewQuestion: "Can ballot images be compared against CVR or tabulator interpretation?",
    sourceLabel: "Ballot image records",
  },
  cast_vote_records: {
    category: "paper_evidence",
    date: "2024-11-08",
    phase: "Ballot-level retabulation",
    reviewQuestion: "Can ballot-level machine interpretations be independently retabulated?",
    sourceLabel: "Cast vote records",
  },
  chain_of_custody: {
    category: "custody",
    date: "2024-11-05",
    phase: "Custody and media handling",
    reviewQuestion: "Can custody, seals, transport, and storage explain any machine-output anomaly?",
    sourceLabel: "Custody records",
  },
  logic_accuracy: {
    category: "machine_logs",
    date: "2024-11-04",
    phase: "Pre-election system test",
    reviewQuestion: "Did test decks and configuration evidence show the system counted known ballots correctly?",
    sourceLabel: "Logic and accuracy records",
  },
  reporting_unit_results: {
    category: "results",
    date: "2024-11-06",
    phase: "Local result localization",
    reviewQuestion: "Can suspicious patterns be localized below statewide or county totals?",
    sourceLabel: "Reporting-unit results",
  },
  tabulator_logs: {
    category: "machine_logs",
    date: "2024-11-09",
    phase: "Machine event log review",
    reviewQuestion: "Do tabulator or EMS logs explain timing, upload, adjudication, or media anomalies?",
    sourceLabel: "Tabulator and EMS logs",
  },
};

const categorySymptomExamples: Record<
  SuspiciousEventCategory,
  {
    alternateExplanation: string;
    tamperingExample: string;
  }
> = {
  audit: {
    tamperingExample:
      "Someone trying to harm an election could try to avoid or narrow an audit trail so a machine-count problem is harder to compare against paper evidence.",
    alternateExplanation:
      "Audit gaps can also come from aggregate-only publication, different retention rules, delayed local paperwork, or records that exist but have not been normalized yet.",
  },
  custody: {
    tamperingExample:
      "Someone trying to harm an election could try to exploit weak custody records so ballot containers, equipment, or removable media cannot be cleanly traced.",
    alternateExplanation:
      "Custody gaps can also come from decentralized local recordkeeping, paper forms not yet digitized, clerical omissions, or records held by a different custodian.",
  },
  machine_logs: {
    tamperingExample:
      "Someone trying to harm an election could try to change configuration, upload timing, or machine event records so electronic activity is hard to reconstruct.",
    alternateExplanation:
      "Machine-log gaps can also come from vendor export limits, retention schedules, redaction review, fragmented county systems, or logs that require a formal request.",
  },
  paper_evidence: {
    tamperingExample:
      "Someone trying to harm an election could try to make electronic ballot interpretations diverge from voter-mark evidence, then rely on missing CVRs or images to hide the mismatch.",
    alternateExplanation:
      "Paper-evidence gaps can also come from legal limits on ballot images or CVRs, privacy review, scanner settings, storage practices, or records that are obtainable only locally.",
  },
  records_request: {
    tamperingExample:
      "Someone trying to harm an election could benefit when critical records are delayed, scattered, or routed through unclear custodians because independent checks take longer.",
    alternateExplanation:
      "Records-request delays can also come from normal queue backlogs, fee estimates, custodian handoffs, legal review, holidays, or unclear public-records procedures.",
  },
  results: {
    tamperingExample:
      "Someone trying to harm an election could try to alter or suppress local result rows so suspicious patterns are visible only after precinct, ward, or batch-level reconciliation.",
    alternateExplanation:
      "Result-localization gaps can also come from county-only publication, precinct consolidation, late corrected exports, formatting changes, or dashboards without bulk downloads.",
  },
};
function severityForStatus(status: string): SuspiciousEventSeverity {
  if (status === "blocked") {
    return "critical";
  }

  if (status === "needs_data") {
    return "elevated";
  }

  return "watch";
}

function categoryLabel(category: SuspiciousEventCategory) {
  return category.replaceAll("_", " ");
}

function eventSourceLabel(source: SuspiciousTimelineSource) {
  return [source.label, source.url, source.localArtifact].filter(Boolean).join(" ");
}

function isDefinedSource(source: SuspiciousTimelineSource | undefined): source is SuspiciousTimelineSource {
  return source !== undefined;
}

function dedupeSources(sources: SuspiciousTimelineSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = eventSourceLabel(source);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function registrySources(label: string, sourceUrl: string | undefined, localArtifact: string | undefined): SuspiciousTimelineSource[] {
  return dedupeSources([
    sourceUrl ? { label, url: sourceUrl } : { label: "Electronic integrity registry", localArtifact: "data/electronic-integrity-artifacts.json" },
    localArtifact ? { label: "Local artifact", localArtifact } : { label: "Electronic integrity registry", localArtifact: "data/electronic-integrity-artifacts.json" },
  ]);
}

function paritySeverity(status: string): SuspiciousEventSeverity {
  if (status.includes("missing") || status.includes("partial")) {
    return "elevated";
  }

  return "watch";
}

function listSourceCollectionEvents(): SuspiciousTimelineEvent[] {
  return swingStateParity.states.map((state) => {
    const coverage = state.nativeCoverage;
    const sourceUrls = state.sourceAcquisition.sourceUrls ?? [];
    const comparison = coverage.comparisonContest ? ` against ${coverage.comparisonContest}` : "";
    const rowSummary = `${coverage.resultRows.toLocaleString()} result rows, ${coverage.reviewRows.toLocaleString()} review rows, ${coverage.turnoutRows.toLocaleString()} turnout rows`;

    return {
      id: `source-collection-${state.state}`,
      alternateExplanation: categorySymptomExamples.results.alternateExplanation,
      category: "results",
      tamperingExample: categorySymptomExamples.results.tamperingExample,
      date: swingStateParity.generatedAt,
      evidenceNeeded: `${rowSummary}. Next action: ${state.nextAction}`,
      phase: "Source collection snapshot",
      reviewQuestion: `What official source grain supports ${state.stateName}'s current local review workflow?`,
      scope: `${coverage.reportingGrain} ${coverage.sourceTier}`,
      severity: paritySeverity(state.parityStatus),
      sources: dedupeSources([
        ...sourceUrls.map((url) => ({ label: `${state.stateName} official source`, url })),
        { label: "Swing-state parity registry", localArtifact: "data/swing-state-2024-parity-status.json" },
      ]),
      state: state.state,
      stateName: state.stateName,
      status: state.parityStatus,
      summary: `${coverage.parserStatus}. ${coverage.reviewWarning}`,
      title: `${state.stateName}: ${coverage.reportingGrain} review coverage${comparison}`,
    };
  });
}

function listAdministrationContextEvents(): SuspiciousTimelineEvent[] {
  return swingStateParity.states.flatMap((state) => {
    const contextEntries = [
      { category: "audit" as const, label: "Audit context", phase: "Audit context snapshot", value: state.administrationContext.audit },
      { category: "paper_evidence" as const, label: "CVR context", phase: "CVR availability snapshot", value: state.administrationContext.cvr },
      { category: "custody" as const, label: "Incident and custody context", phase: "Incident context snapshot", value: state.administrationContext.incidents },
    ];

    return contextEntries
      .filter(({ value }) => value.status !== "needs_data" && ("sourceUrl" in value || "localArtifact" in value))
      .map(({ category, label, phase, value }) => ({
        id: `admin-context-${state.state}-${category}`,
        alternateExplanation: categorySymptomExamples[category].alternateExplanation,
        category,
        tamperingExample: categorySymptomExamples[category].tamperingExample,
        date: swingStateParity.generatedAt,
        evidenceNeeded: value.why,
        phase,
        reviewQuestion: `What administration context is already documented for ${state.stateName}, and what remains incomplete?`,
        scope: "state administration context",
        severity: value.status === "partial" ? "elevated" : "watch",
        sources: dedupeSources(
          ([
            "sourceUrl" in value && value.sourceUrl ? { label: `${state.stateName} ${label}`, url: value.sourceUrl } : undefined,
            "localArtifact" in value && value.localArtifact ? { label: "Local artifact", localArtifact: value.localArtifact } : undefined,
            { label: "Swing-state parity registry", localArtifact: "data/swing-state-2024-parity-status.json" },
          ] as Array<SuspiciousTimelineSource | undefined>).filter(isDefinedSource),
        ),
        state: state.state,
        stateName: state.stateName,
        status: value.status,
        summary: "caveat" in value && value.caveat ? `${value.why} ${value.caveat}` : value.why,
        title: `${state.stateName}: ${label}`,
      }));
  });
}

export function listSuspiciousTimelineEvents() {
  const events: SuspiciousTimelineEvent[] = electronicIntegrityArtifacts.states.flatMap((state) =>
    state.artifacts
      .filter((artifact) => artifact.requestRequired || artifact.status === "partial" || artifact.status === "blocked")
      .filter((artifact) => artifact.type in artifactTimelineMeta)
      .map((artifact) => {
        const meta = artifactTimelineMeta[artifact.type];
        return {
          id: `${state.state}-${artifact.type}`,
          alternateExplanation: categorySymptomExamples[meta.category].alternateExplanation,
          category: meta.category,
          tamperingExample: categorySymptomExamples[meta.category].tamperingExample,
          date: meta.date,
          evidenceNeeded: artifact.tamperDetectionUse,
          phase: meta.phase,
          reviewQuestion: meta.reviewQuestion,
          scope: artifact.granularity,
          severity: severityForStatus(artifact.status),
          sources: registrySources(meta.sourceLabel, artifact.sourceUrl, artifact.localArtifact),
          state: state.state,
          stateName: state.stateName,
          status: artifact.status,
          summary: artifact.reconciliationStatus.replaceAll("_", " "),
          title: `${state.stateName}: ${meta.sourceLabel}`,
        };
      }),
  );

  events.push({
    id: "national-records-request-drafts",
    alternateExplanation: categorySymptomExamples.records_request.alternateExplanation,
    category: "records_request",
    tamperingExample: categorySymptomExamples.records_request.tamperingExample,
    date: electronicIntegrityOperations.generatedAt,
    evidenceNeeded: "Send and track public-records requests for unresolved electronic evidence families.",
    phase: "Records request operation",
    reviewQuestion: "Which unresolved evidence gaps have draft records requests ready to send?",
    scope: "multi-state evidence inventory",
    severity: "watch",
    sources: [
      { label: "Electronic integrity request tracker", localArtifact: electronicIntegrityOperations.tracker },
      { label: "Request operation snapshot", localArtifact: "data/electronic-integrity-request-operations.json" },
    ],
    state: "ALL",
    stateName: "National",
    status: "draft_ready",
    summary: `${electronicIntegrityOperations.requestRows} draft-ready request rows across ${Object.keys(electronicIntegrityOperations.rowsByState).length} states`,
    title: "National: draft request packet generated",
  });

  events.push(...listSourceCollectionEvents(), ...listAdministrationContextEvents());

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.state.localeCompare(b.state) || a.title.localeCompare(b.title));
}

export function summarizeSuspiciousTimeline(events: SuspiciousTimelineEvent[]) {
  const states = new Set(events.filter((event) => event.state !== "ALL").map((event) => event.state));
  const elevated = events.filter((event) => event.severity === "elevated" || event.severity === "critical").length;
  const sources = new Set(events.flatMap((event) => event.sources.map(eventSourceLabel)).filter(Boolean));
  const byCategory = events.reduce<Record<string, number>>((summary, event) => {
    const label = categoryLabel(event.category);
    summary[label] = (summary[label] ?? 0) + 1;
    return summary;
  }, {});

  return {
    byCategory,
    elevated,
    events: events.length,
    sources: sources.size,
    states: states.size,
  };
}
