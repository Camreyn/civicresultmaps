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

type ElectronicIntegrityTimelineArtifact = {
  granularity: string;
  localArtifact?: string;
  reconciliationStatus: string;
  requestRequired?: boolean;
  sourceUrl?: string;
  status: string;
  tamperDetectionUse: string;
  type: string;
};
type ElectronicIntegrityTimelineState = {
  artifacts: ElectronicIntegrityTimelineArtifact[];
  state: string;
  stateName: string;
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
      "Audit records document the scope and method of an independent check and support comparison of machine-tabulated outcomes with paper evidence.",
    alternateExplanation:
      "Audit gaps can also come from aggregate-only publication, different retention rules, delayed local paperwork, or records that exist but have not been normalized yet.",
  },
  custody: {
    tamperingExample:
      "Custody records help reconstruct who handled ballots, equipment, and removable media, when transfers occurred, and whether required documentation is complete.",
    alternateExplanation:
      "Custody gaps can also come from decentralized local recordkeeping, paper forms not yet digitized, clerical omissions, or records held by a different custodian.",
  },
  machine_logs: {
    tamperingExample:
      "Tabulator and election-management-system logs help reconstruct configuration, upload, adjudication, and event timing alongside other official records.",
    alternateExplanation:
      "Machine-log gaps can also come from vendor export limits, retention schedules, redaction review, fragmented county systems, or logs that require a formal request.",
  },
  paper_evidence: {
    tamperingExample:
      "Cast-vote records, ballot images where lawful, and retained paper records support comparison of electronic interpretations with voter-mark evidence.",
    alternateExplanation:
      "Paper-evidence gaps can also come from legal limits on ballot images or CVRs, privacy review, scanner settings, storage practices, or records that are obtainable only locally.",
  },
  records_request: {
    tamperingExample:
      "Request records document what was sought, which office holds it, response timing, fees or exemptions, and any remaining access gap.",
    alternateExplanation:
      "Records-request delays can also come from normal queue backlogs, fee estimates, custodian handoffs, legal review, holidays, or unclear public-records procedures.",
  },
  results: {
    tamperingExample:
      "Local result rows support reconciliation across precinct, ward, batch, county, and statewide publications and help document corrections or format changes.",
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


const externalReviewTimelineEvents: SuspiciousTimelineEvent[] = [
  {
    id: "external-review-smart-elections-2024-update",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2024-11-05",
    evidenceNeeded: "Official precinct results, certified canvass records, CVRs where available, turnout files, and post-election audit records that can confirm or reject the questioned drop-off pattern.",
    phase: "External 2024 election review prompt",
    reviewQuestion: "Which jurisdictions and contests drive the drop-off questions Smart Elections flags, and do official precinct-level records support a benign explanation?",
    scope: "national 2024 general-election review",
    severity: "watch",
    sources: [{ label: "Smart Elections 2024 election update", url: "https://smartelections.us/2024-election-update" }],
    state: "ALL",
    stateName: "National",
    status: "external_review",
    summary: "Smart Elections maintains a 2024 election update page focused on drop-off questions. This timeline records the page as a source-backed review prompt, not as a confirmed finding.",
    title: "Smart Elections: 2024 election update",
  },
  {
    id: "external-review-smart-elections-dropoff",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2024-11-05",
    evidenceNeeded: "Contest-level and precinct-level official results, ballot roll-off baselines, turnout by voting method, and comparable down-ballot contest data.",
    phase: "External multi-state drop-off comparison",
    reviewQuestion: "Do the multi-state drop-off comparisons remain unusual after controlling for race visibility, uncontested contests, undervotes, ballot order, and county reporting practices?",
    scope: "multi-state drop-off comparison",
    severity: "watch",
    sources: [{ label: "Smart Elections multi-state drop-off comparison", url: "https://smartelections.us/dropoff" }],
    state: "ALL",
    stateName: "National",
    status: "external_review",
    summary: "Smart Elections publishes a multi-state 2024 general-presidential drop-off comparison. The entry marks the comparison as a hypothesis to test against official local data.",
    title: "Smart Elections: multi-state drop-off comparison",
  },
  {
    id: "external-review-smart-elections-county-dropoff",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2024-11-05",
    evidenceNeeded: "County canvass exports, precinct-level results, ballot-style data, and official turnout totals that explain county-level presidential drop-off patterns.",
    phase: "External county drop-off comparison",
    reviewQuestion: "Which counties appear most anomalous in Smart Elections' county drop-off page, and are those counties explainable by official ballot-style or turnout evidence?",
    scope: "county-level drop-off review",
    severity: "watch",
    sources: [{ label: "Smart Elections drop-off by county", url: "https://smartelections.us/drop-off-by-county" }],
    state: "ALL",
    stateName: "National",
    status: "external_review",
    summary: "Smart Elections publishes a county drop-off page for the 2024 election. This creates a county-prioritization point for official-record reconciliation.",
    title: "Smart Elections: county drop-off review",
  },
  {
    id: "external-review-smart-elections-rockland-lawsuit",
    alternateExplanation: categorySymptomExamples.records_request.alternateExplanation,
    category: "records_request",
    tamperingExample: categorySymptomExamples.records_request.tamperingExample,
    date: "2025-06-26",
    evidenceNeeded: "Court filings, county canvass records, ballot-preservation records, machine logs, CVRs if available, and any audit or recount records cited in the Rockland County case.",
    phase: "External litigation checkpoint",
    reviewQuestion: "What election records and judicial findings are actually at issue in the Rockland County, New York lawsuit and appeal?",
    scope: "Rockland County litigation",
    severity: "elevated",
    sources: [{ label: "Smart Elections lawsuits page", url: "https://smartelections.us/lawsuits-1" }],
    state: "NY",
    stateName: "New York",
    status: "external_litigation",
    summary: "Smart Elections states that it filed an appeal in a Rockland County, New York lawsuit challenging the 2024 election, with page dates showing June 26, 2025 and May 29, 2025 milestones.",
    title: "New York: Rockland County lawsuit appeal noted",
  },
  {
    id: "external-review-smart-elections-expressvote-xl-letter",
    alternateExplanation: categorySymptomExamples.machine_logs.alternateExplanation,
    category: "machine_logs",
    tamperingExample: categorySymptomExamples.machine_logs.tamperingExample,
    date: "2020-08-21",
    evidenceNeeded: "Certification records, risk-limiting audit compatibility evidence, voter-verifiable paper record guidance, and jurisdiction-specific ExpressVote XL deployment records.",
    phase: "Historical voting-system concern",
    reviewQuestion: "Where are ExpressVote XL systems used in current election data, and what audit evidence is needed to evaluate machine-count questions in those jurisdictions?",
    scope: "voting-system context",
    severity: "watch",
    sources: [{ label: "Smart Elections ExpressVote XL letter", url: "https://smartelections.us/expressvotexl-letter" }],
    state: "ALL",
    stateName: "National",
    status: "external_context",
    summary: "Smart Elections' dated ExpressVote XL letter is added as historical voting-system context for jurisdictions using ballot-marking/tabulation systems that may require machine-log and audit follow-up.",
    title: "Smart Elections: ExpressVote XL machine concern letter",
  },
  {
    id: "external-review-eta-2024-analysis-index",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2025-06-28",
    evidenceNeeded: "Official source data for each analysis page, reproducible scripts or notebooks, and county/precinct result exports matching the versions used by ETA.",
    phase: "External analysis collection",
    reviewQuestion: "Which ETA 2024 analysis pages map to states already in this timeline, and can each be reproduced from official published data?",
    scope: "multi-state ETA analysis index",
    severity: "watch",
    sources: [{ label: "Election Truth Alliance 2024 analyses", url: "https://electiontruthalliance.org/2024-us-election-analysis/" }],
    state: "ALL",
    stateName: "National",
    status: "external_review",
    summary: "Election Truth Alliance publishes a 2024 U.S. election analysis index. This entry links that source collection for reproducibility review.",
    title: "ETA: 2024 election analysis index",
  },
  {
    id: "external-review-eta-nevada-analysis",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2025-06-29",
    evidenceNeeded: "Clark County precinct results, turnout files, ballot-style or contest participation data, CVRs if available, and official audit documentation.",
    phase: "External state analysis",
    reviewQuestion: "Can ETA's Nevada analysis be reproduced from Clark County official results, and do official administrative records explain the highlighted pattern?",
    scope: "Clark County, Nevada analysis",
    severity: "watch",
    sources: [{ label: "Election Truth Alliance Nevada analysis", url: "https://electiontruthalliance.org/analysis/clark-county-nevada/" }],
    state: "NV",
    stateName: "Nevada",
    status: "external_review",
    summary: "Election Truth Alliance publishes a Nevada analysis page focused on Clark County. The timeline treats it as a source-backed state review prompt.",
    title: "Nevada: ETA Clark County analysis",
  },
  {
    id: "external-review-eta-pennsylvania-analysis",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2025-06-30",
    evidenceNeeded: "Pennsylvania precinct results, county canvass exports, voting-method turnout, ballot-style data, CVRs where available, and official audit or recount records.",
    phase: "External state analysis",
    reviewQuestion: "Which Pennsylvania counties drive ETA's published concerns, and are the patterns reproducible from official county and state data?",
    scope: "Pennsylvania analysis",
    severity: "watch",
    sources: [{ label: "Election Truth Alliance Pennsylvania analysis", url: "https://electiontruthalliance.org/analysis/pennsylvania/" }],
    state: "PA",
    stateName: "Pennsylvania",
    status: "external_review",
    summary: "Election Truth Alliance publishes a Pennsylvania analysis page. This creates a sourced checkpoint for reproducing the analysis against official Pennsylvania records.",
    title: "Pennsylvania: ETA state analysis",
  },
  {
    id: "external-review-eta-integrity-concerns",
    alternateExplanation: categorySymptomExamples.records_request.alternateExplanation,
    category: "records_request",
    tamperingExample: categorySymptomExamples.records_request.tamperingExample,
    date: "2025-08-13",
    evidenceNeeded: "Outstanding public-records request logs, CVR availability records, tabulator incident reports, chain-of-custody documentation, and official responses from the jurisdictions named by ETA.",
    phase: "External integrity-concerns statement",
    reviewQuestion: "Which ETA-listed concerns are tied to specific official records, and which remain general advocacy claims needing jurisdiction-level evidence?",
    scope: "national integrity-concerns statement",
    severity: "elevated",
    sources: [{ label: "Election Truth Alliance 2024 U.S. integrity concerns", url: "https://electiontruthalliance.org/2024-us-integrity-concerns/" }],
    state: "ALL",
    stateName: "National",
    status: "external_records_concern",
    summary: "Election Truth Alliance's dated integrity-concerns page flags precinct-pattern, CVR-availability, chain-of-custody, and public-records issues as items it says merit investigation.",
    title: "ETA: 2024 U.S. integrity concerns",
  },
  {
    id: "external-review-eta-north-carolina-analysis",
    alternateExplanation: categorySymptomExamples.results.alternateExplanation,
    category: "results",
    tamperingExample: categorySymptomExamples.results.tamperingExample,
    date: "2025-08-20",
    evidenceNeeded: "North Carolina precinct results, county canvass data, ballot-style and turnout records, machine logs where relevant, and official audit documentation.",
    phase: "External state analysis",
    reviewQuestion: "Can ETA's North Carolina analysis be reproduced from official data, and do official election-administration records explain the highlighted precinct patterns?",
    scope: "North Carolina analysis",
    severity: "watch",
    sources: [{ label: "Election Truth Alliance North Carolina analysis", url: "https://electiontruthalliance.org/analysis/north-carolina/" }],
    state: "NC",
    stateName: "North Carolina",
    status: "external_review",
    summary: "Election Truth Alliance publishes a longform North Carolina 2024 analysis page. The entry marks it as a reproducibility and official-record review target.",
    title: "North Carolina: ETA longform analysis",
  },
  {
    id: "external-review-eta-pennsylvania-legal-summary",
    alternateExplanation: categorySymptomExamples.records_request.alternateExplanation,
    category: "records_request",
    tamperingExample: categorySymptomExamples.records_request.tamperingExample,
    date: "2025-11-11",
    evidenceNeeded: "Filed complaint, docket entries, relief requested, cited election records, and any official state or county responses to the lawsuit's factual allegations.",
    phase: "External litigation checkpoint",
    reviewQuestion: "What claims and source records are actually presented in ETA's Pennsylvania legal summary and linked filing?",
    scope: "Pennsylvania legal summary",
    severity: "elevated",
    sources: [{ label: "Election Truth Alliance Pennsylvania legal summary", url: "https://electiontruthalliance.org/legal/pennsylvania-legal-summary/" }],
    state: "PA",
    stateName: "Pennsylvania",
    status: "external_litigation",
    summary: "Election Truth Alliance publishes a Pennsylvania legal summary with a dated filing checkpoint and links to lawsuit materials. The timeline records it as a litigation-source milestone.",
    title: "Pennsylvania: ETA legal summary and filing checkpoint",
  },
];

export function listSuspiciousTimelineEvents() {
  const artifactStates = electronicIntegrityArtifacts.states as unknown as ElectronicIntegrityTimelineState[];
  const events: SuspiciousTimelineEvent[] = artifactStates.flatMap((state) =>
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

  events.push(...externalReviewTimelineEvents, ...listSourceCollectionEvents(), ...listAdministrationContextEvents());

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
