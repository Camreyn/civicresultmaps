"use client";

import JSZip from "jszip";
import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileCheck2,
  GitBranch,
  Github,
  HeartHandshake,
  History,
  ListChecks,
  Mail,
  MapIcon,
  Megaphone,
  Search,
  Send,
  ShieldCheck,
  Server,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { Eli5 } from "./eli5";
import { GuidedTour, type TourStep } from "./guided-tour";
import { ResultsExplorer } from "./results-explorer";
import { equipmentClusterDiagnostics } from "@/lib/equipment-diagnostics";
import type {
  AnalysisIndicator,
  AdminSourceStatusSummary,
  CompletenessSummary,
  CoverageSummary,
  ElectronicIntegrityStateSummary,
  ElectronicIntegrityRequestOperationSummary,
  SourceRecordsRequestOperationSummary,
  SourceRecordsRequestSummary,
  EquipmentClusterDiagnostic,
  EquipmentRowSummary,
  HistoricalResultRowSummary,
  ImportRunSummary,
  ResultRow,
  ReviewRowSummary,
  SecurityIncidentSummary,
  SourceSummary,
  StateSummary,
  TurnoutRowSummary,
  VoteMethodRowSummary,
} from "@/lib/types";

type WorkspaceTabsProps = {
  adminSourceStatus: AdminSourceStatusSummary | undefined;
  coverage: CoverageSummary | null;
  countyLabel: string;
  electronicIntegrityStatus: ElectronicIntegrityStateSummary | undefined;
  electronicIntegrityRequests: ElectronicIntegrityRequestOperationSummary;
  sourceRecordsRequests: SourceRecordsRequestOperationSummary;
  equipmentRows: EquipmentRowSummary[];
  securityIncidents: SecurityIncidentSummary[];
  historicalRows: HistoricalResultRowSummary[];
  importRuns: ImportRunSummary[];
  indicators: AnalysisIndicator[];
  reviewRows: ReviewRowSummary[];
  results: ResultRow[];
  statewideResultRows: ResultRow[];
  selectedCompleteness: CompletenessSummary | undefined;
  selectedState: StateSummary | undefined;
  selectedStateCode: string;
  sources: SourceSummary[];
  totalVotes: number;
  turnoutRows: TurnoutRowSummary[];
  voteMethodRows: VoteMethodRowSummary[];
};

type TabKey =
  | "map"
  | "review"
  | "history"
  | "electronic"
  | "planner"
  | "data"
  | "methodology"
  | "exports"
  | "imports"
  | "support"
  | "contact";
type ScreeningGraphType = "voteShareScatter" | "dropoffHistogram";
type HistoricalGraphType = "share" | "margin" | "movement" | "klimek" | "shpilkin";
type ReviewView = "overview" | "tools" | "screening" | "indicators" | "methodology";
type ChartQualityStatus = "ready" | "acknowledgement_required" | "blocked";
type QualityBadgeStatus = "ready" | "partial" | "proxy" | "missing" | "blocked";
type ChartQualityDiagnostic = {
  acknowledgementKey: string;
  checked: string[];
  issues: string[];
  rowCount: number;
  status: ChartQualityStatus;
  summary: string;
  title: string;
};
type DataNoteSection = {
  detail: string;
  evidence: string;
  key: string;
  label: string;
  status: QualityBadgeStatus;
  why: string;
};
type EvidenceReviewDimension = {
  detail: string;
  label: string;
  score: number;
  status: QualityBadgeStatus;
  why: string;
};
type FlagExplanation = {
  auditContext: string;
  denominatorContext: string;
  jurisdiction: string;
  label: string;
  missingEvidence: string[];
  priority: string;
  scope: string;
  sourceContext: string;
  summary: string;
};
type StateDataNoteOverride = Partial<Pick<DataNoteSection, "detail" | "evidence" | "status" | "why">> & {
  key: DataNoteSection["key"];
};
type GlossaryEntry = {
  definition: string;
  term: string;
};
type ReviewerChecklistItem = {
  item: string;
};
type WorkspaceTourContext = {
  hasCoverage: boolean;
  hasElectronicDraft: boolean;
  hasElectronicRequestRows: boolean;
  hasSourceRecordsDraft: boolean;
  hasSourceRecordsRequestRows: boolean;
  hasEquipmentRows: boolean;
  hasHistoricalRows: boolean;
  hasImportRuns: boolean;
  hasResults: boolean;
  hasReviewRows: boolean;
  hasSources: boolean;
  hasVoteMethodRows: boolean;
  stateName: string;
};
type TourFeature = {
  build: (context: WorkspaceTourContext) => TourStep[];
  key: string;
};
type MethodologySourceLink = {
  detail: string;
  href: string;
  label: string;
};
type MethodologyGuide = {
  caveat: string;
  guide: string[];
  id: string;
  links: MethodologySourceLink[];
  summary: string;
  title: string;
};
type FlagMethodologyGuide = {
  alternativeExplanations: string;
  calculatedFrom: string;
  id: string;
  label: string;
  threshold: string;
  validation: string;
};

const tabs: Array<{ icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; key: TabKey; label: string }> = [
  { icon: MapIcon, key: "map", label: "Map" },
  { icon: BarChart3, key: "review", label: "Review Center" },
  { icon: History, key: "history", label: "History" },
  { icon: Server, key: "electronic", label: "Electronic Integrity" },
  { icon: ListChecks, key: "planner", label: "Source Planner" },
  { icon: FileCheck2, key: "data", label: "Data & Sources" },
  { icon: BookOpen, key: "methodology", label: "Review Guide" },
  { icon: Download, key: "exports", label: "Exports & API" },
  { icon: GitBranch, key: "imports", label: "Import Runs" },
  { icon: HeartHandshake, key: "support", label: "Support" },
  { icon: Mail, key: "contact", label: "Contact" },
];

const reviewViewOptions: Array<{ key: ReviewView; label: string; summary: string }> = [
  { key: "overview", label: "Overview", summary: "Status, readiness, top flags, and next actions" },
  { key: "tools", label: "Evidence Tools", summary: "Readiness gaps and flag explainability" },
  { key: "screening", label: "Screening", summary: "Charts, ticket-splitting proxy, and caveats" },
  { key: "indicators", label: "Indicators", summary: "Search, filter, and inspect advisory rows" },
  { key: "methodology", label: "Methodology", summary: "How each advisory flag is calculated" },
];

const flagMethodologyGuides: FlagMethodologyGuide[] = [
  {
    alternativeExplanations:
      "Large and small reporting units can differ by population composition, urban or rural geography, campus or military populations, registration mix, vote method mix, or how local units are grouped.",
    calculatedFrom:
      "Vote-share correlation: computes Pearson correlation between local candidate vote count and that candidate's vote share across the county's imported local rows.",
    id: "vote-share-pattern",
    label: "Vote-share pattern",
    threshold:
      "Flags when either major candidate's absolute correlation is at least 0.35, after the county has at least 8 local rows.",
    validation:
      "Compare against precinct demographics, urban/rural split, vote method reporting, historical baselines, and the source workbook's reporting-unit definitions.",
  },
  {
    alternativeExplanations:
      "Split-ticket voting, uncontested or weak comparison races, candidate incumbency, local campaign effects, and undervotes can create real down-ballot gaps.",
    calculatedFrom:
      "Averages the percent gap between presidential votes and same-party comparison-contest votes across imported local rows.",
    id: "average-down-ballot-difference",
    label: "Average down-ballot difference",
    threshold:
      "Flags when the Democratic or Republican average gap reaches 6 percent. Vote-share-only imports do not emit this flag.",
    validation:
      "Check the comparison contest, undervote totals, local candidate strength, recount/canvas notes, and whether every local row has the same contest coverage.",
  },
  {
    alternativeExplanations:
      "Localized split-ticket behavior, incomplete comparison contests, small local rows, reporting-unit boundaries, or data-entry quirks can make individual rows look unusual.",
    calculatedFrom:
      "Counts local rows where same-party presidential-versus-comparison difference is at least 15 percent and the candidate has at least 100 votes in that row.",
    id: "down-ballot-outliers",
    label: "Down-ballot outliers",
    threshold:
      "Flags when outlier rows reach at least 3 rows or 5 percent of the county's imported local rows, whichever is larger. Vote-share-only imports do not emit this flag.",
    validation:
      "Open the source rows, check candidate and contest coverage, compare neighboring units, and look for official correction notes before drawing conclusions.",
  },
];

const reviewerChecklist: ReviewerChecklistItem[] = [
  { item: "Open the official source link or local artifact reference before sharing a finding." },
  { item: "Check whether the relevant chart or table is ready, partial, proxy, missing, or blocked." },
  { item: "Read the selected state's Data Notes and import caveats." },
  { item: "Consider normal explanations such as geography, demographics, vote method, contest differences, and reporting-unit grouping." },
  { item: "Compare against historical baselines, nearby jurisdictions, or official canvass notes when those records are available." },
  { item: "Save the exact state, jurisdiction, chart/table name, source document, and date reviewed." },
];

const glossaryEntries: GlossaryEntry[] = [
  {
    term: "Review row",
    definition:
      "A local reporting-unit row used for screening charts, usually precinct, ward, municipality, or county depending on the source.",
  },
  {
    term: "Turnout denominator",
    definition:
      "The registered-voter count used under ballots cast when calculating turnout. Timing and active/inactive voter rules can change comparisons.",
  },
  {
    term: "Comparison contest",
    definition:
      "A same-row down-ballot race used to compare presidential votes against another contest such as U.S. Senate or Governor.",
  },
  {
    term: "Source tier",
    definition:
      "A compact lineage label describing whether rows came from native official imports, legacy bundles, mixed imports, seed fallback, or pending data.",
  },
  {
    term: "Native import",
    definition:
      "A source-first parser built for current official artifacts and promoted through the app's ETL validation path.",
  },
  {
    term: "Legacy import",
    definition:
      "Rows imported from older static app-data bundles. Useful context, but less source-first than native official imports.",
  },
  {
    term: "Proxy chart",
    definition:
      "A chart that substitutes a weaker available variable because the preferred source field is missing.",
  },
  {
    term: "Advisory flag",
    definition:
      "A triage marker that says a pattern deserves human review. It is not proof of fraud, tampering, or misconduct.",
  },
  {
    term: "Vote-share correlation",
    definition:
      "A Pearson correlation check between local candidate vote count and that candidate's vote share across imported local rows.",
  },
  {
    term: "Down-ballot difference",
    definition:
      "The same-party gap between presidential votes and a comparison contest in the same reporting unit.",
  },
];

const githubIssueUrl = "https://github.com/Camreyn/civicresultmaps/issues/new";
const githubDataReviewTemplate = "data-review.yml";
const githubRecordsResponseTemplate = "records-response.yml";

const tourFeatureRegistry: TourFeature[] = [
  {
    key: "workspace",
    build: (context) => [
      {
        body: "Use these tabs as the main workspace. The tour will switch tabs for you and point at the important controls.",
        id: "tabs",
        target: "[data-tour='tab-bar']",
        title: "Start with the workspace tabs",
      },
      {
        body: `Pick a state here. The rest of the page reloads around ${context.stateName}'s results, source records, and data status.`,
        fallbackTarget: "[data-tour='workspace']",
        id: "states",
        target: "[data-tour='state-sidebar']",
        title: "Choose a state",
      },
      {
        body: "These compact badges summarize the selected state's data families at a glance: results, sources, map, review rows, turnout, and historical coverage. Loaded, partial, and missing describe what the app can currently show.",
        fallbackTarget: "[data-tour='state-sidebar']",
        id: "state-badges",
        target: "[data-tour='selected-state-badges']",
        title: "Read state data badges",
      },
      {
        body: "Use this legend when scanning states. A full marker means loaded, a warning marker means partial, and a missing marker means the app is still waiting on that data family.",
        fallbackTarget: "[data-tour='state-sidebar']",
        id: "state-badge-legend",
        target: "[data-tour='state-data-legend']",
        title: "Decode badge status",
      },
      {
        body: context.hasCoverage
          ? "This summary shows national loading progress and the broad readiness posture before you drill into one state."
          : "National loading progress appears here when the coverage summary is available.",
        fallbackTarget: "[data-tour='workspace']",
        id: "overview",
        target: ".national-overview",
        title: "Check national coverage",
      },
      {
        body: "The Readiness page is the wider audit dashboard. It lists parser coverage, source status, validation counts, and blockers across states.",
        fallbackTarget: "[data-tour='workspace']",
        id: "readiness-link",
        target: "[data-tour='readiness-link']",
        title: "Open the readiness dashboard",
      },
      {
        body: "Data Notes explain what is present, what is partial, and why missing pieces are not loaded yet. This is the first stop before interpreting a map or chart.",
        fallbackTarget: "[data-tour='workspace']",
        id: "data-notes",
        target: "[data-tour='data-notes']",
        title: "Start with Data Notes",
      },
      {
        body: "If a value, caveat, source, or status looks wrong, this link opens a prefilled GitHub issue so reviewers can report the exact thing to check.",
        fallbackTarget: "[data-tour='data-notes']",
        id: "report-data-issue",
        target: "[data-tour='report-data-issue']",
        title: "Report data issues",
      },
    ],
  },
  {
    key: "map",
    build: (context) => [
      {
        body: context.hasResults
          ? "Winner, Margin, Votes, and Method change how the map is shaded. The readout next to the buttons updates when you hover or select a boundary."
          : "Map controls appear here once certified result rows are loaded for the selected state.",
        fallbackTarget: "[data-tour='map-panel']",
        id: "map-controls",
        tab: "map",
        target: "[data-tour='map-controls']",
        title: "Change the map mode",
      },
      ...(context.hasVoteMethodRows
        ? [
            {
              body: "Select Method to shade counties by EAC-reported participation method, such as mail votes or in-person early voting. It is participation data, not a candidate-by-method breakdown.",
              fallbackTarget: "[data-tour='map-controls']",
              id: "vote-method-layer",
              tab: "map" as const,
              target: "[data-tour='method-mode-button']",
              title: "Use the vote-method layer",
            },
          ]
        : []),
      ...(context.hasResults
        ? [
            {
              body: "Click or keyboard-select a county to pin it. Blue and red come from the loaded winner; intensity comes from margin or vote volume depending on the mode.",
              fallbackTarget: "[data-tour='map-panel']",
              id: "map",
              tab: "map" as const,
              target: "[data-tour='county-map']",
              title: "Read the county map",
            },
            {
              body: "This drawer is the receipt for the selected place: candidate votes, winner margin, source link, and advisory indicators when they exist.",
              fallbackTarget: "[data-tour='map-panel']",
              id: "drawer",
              tab: "map" as const,
              target: "[data-tour='jurisdiction-drawer']",
              title: "Inspect one jurisdiction",
            },
            {
              body: "The table is the same data as the map in spreadsheet form. Sort by margin or vote total, filter by name, and jump back to a source record.",
              fallbackTarget: "[data-tour='map-panel']",
              id: "results-table",
              tab: "map" as const,
              target: "[data-tour='results-table']",
              title: "Use the results table",
            },
          ]
        : []),
    ],
  },
  {
    key: "review",
    build: (context) =>
      context.hasReviewRows
        ? [
            {
              body: "The Review Center collects advisory indicators. These are triage prompts for human review, not claims by themselves.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "review",
              reviewView: "overview",
              tab: "review",
              target: "[data-tour='review-overview']",
              title: "Review flagged patterns",
            },
            {
              body: "The Evidence Review Toolkit shows whether this state has enough source-backed inputs for responsible advisory review. Treat the score as readiness, not risk or proof.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "evidence-toolkit",
              reviewView: "tools",
              tab: "review",
              target: "[data-tour='evidence-toolkit']",
              title: "Open the evidence toolkit",
            },
            {
              body: "The readiness score combines certified results, source provenance, local review rows, comparison contests, turnout denominators, geometry, history, and audit/CVR/equipment context. Low score means collect evidence before interpreting flags.",
              fallbackTarget: "[data-tour='evidence-toolkit']",
              id: "evidence-readiness-score",
              reviewView: "tools",
              tab: "review",
              target: "[data-tour='evidence-readiness-score']",
              title: "Check review readiness first",
            },
            {
              body: "The flag explainability panel links top advisory flags to source context, denominator context, audit context, and remaining evidence needs. Use it to decide the next source check, not to declare conclusions.",
              fallbackTarget: "[data-tour='evidence-toolkit']",
              id: "flag-explainability-panel",
              reviewView: "tools",
              tab: "review",
              target: "[data-tour='flag-explainability-panel']",
              title: "Explain flags before escalating",
            },
            {
              body: "This guide is the table of contents for advisory flags. It explains how Vote-Share Pattern, Down-ballot Difference, and Down-ballot Outliers are calculated and what normal explanations to check first.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "flag-guide",
              reviewView: "methodology",
              tab: "review",
              target: "[data-tour='flag-guide']",
              title: "Use the flag guide",
            },
            {
              body: "The scatterplot compares local vote totals against vote share. Outliers are places worth inspecting against sources and local context.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "scatter",
              reviewView: "screening",
              tab: "review",
              target: "[data-tour='review-scatter']",
              title: "Read the vote-share scatterplot",
            },
            {
              body: "When the app detects missing rows, partial coverage, fragile counts, or unreconciled source context, charts are faded until the user acknowledges those limits. The listed reasons are specific to the selected chart.",
              fallbackTarget: "[data-tour='review-scatter']",
              id: "chart-caveat-gate",
              reviewView: "screening",
              skipIfMissing: true,
              tab: "review",
              target: "[data-tour='chart-caveat-gate']",
              title: "Acknowledge chart caveats",
            },
            {
              body: "The drop-off histogram buckets local drop-off values. It is useful for seeing whether a pattern is isolated or appears across many rows.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "dropoff",
              reviewView: "screening",
              tab: "review",
              target: "[data-tour='review-dropoff']",
              title: "Read the drop-off histogram",
            },
            {
              body: "Use this issue link when a review chart, flag, or row looks off. It includes the selected state and review context so a follow-up can start from the right source family.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "report-review-issue",
              tab: "review",
              target: "[data-tour='report-review-issue']",
              title: "Report review findings carefully",
            },
          ]
        : [
            {
              body: `${context.stateName} does not currently have statistical screening rows loaded, so the tour stops at the empty-state panel instead of highlighting missing charts.`,
              fallbackTarget: "[data-tour='workspace']",
              id: "review-empty",
              tab: "review",
              target: "[data-tour='review-panel']",
              title: "Review coverage depends on rows",
            },
            {
              body: "The Evidence Review Toolkit still works when charts are missing. It shows which source families are blocking responsible advisory review and what evidence to collect next.",
              fallbackTarget: "[data-tour='review-panel']",
              id: "evidence-toolkit-empty",
              reviewView: "tools",
              tab: "review",
              target: "[data-tour='evidence-toolkit']",
              title: "Use tools before charts are ready",
            },
            {
              body: "Even when charts are not loaded, the Data Notes and Source Planner explain why. Missing review rows usually means the state still needs lower-level official data before advisory charts can be shown.",
              fallbackTarget: "[data-tour='workspace']",
              id: "review-empty-data-notes",
              tab: "review",
              target: "[data-tour='data-notes']",
              title: "Check why review is missing",
            },
          ],
  },
  {
    key: "history",
    build: (context) =>
      context.hasHistoricalRows
        ? [
            {
              body: "Historical charts compare older county results with the current import. Use the toggles to include or remove specific years and graph families.",
              fallbackTarget: "[data-tour='history-panel']",
              id: "history",
              tab: "history",
              target: "[data-tour='history-charts']",
              title: "Compare historical baselines",
            },
            {
              body: "Fingerprint and Shpilkin-style views are diagnostic visualizations. Treat them as prompts for review, not as conclusions.",
              fallbackTarget: "[data-tour='history-panel']",
              id: "fingerprints",
              tab: "history",
              target: "[data-tour='history-fingerprints']",
              title: "Use diagnostic graph views carefully",
            },
          ]
        : [
            {
              body: `${context.stateName} does not currently have historical baseline rows loaded, so this tour step points to the empty-state panel.`,
              fallbackTarget: "[data-tour='workspace']",
              id: "history-empty",
              tab: "history",
              target: "[data-tour='history-panel']",
              title: "Historical coverage depends on rows",
            },
          ],
  },
  {
    key: "electronic",
    build: (context) => [
      {
        body: "Electronic Integrity tracks records needed to reconcile electronic outputs against official totals, paper or audit evidence, and custody records. Missing rows mean records still need to be requested or loaded, not that misconduct occurred.",
        fallbackTarget: "[data-tour='workspace']",
        id: "electronic-integrity",
        tab: "electronic",
        target: "[data-tour='electronic-integrity']",
        title: "Open the electronic records workflow",
      },
      {
        body: "Start with the Request guide. It explains what the records request asks for, normal outcomes such as fees or redirects, and why sending a request is not an allegation.",
        fallbackTarget: "[data-tour='electronic-integrity']",
        id: "request-guide",
        tab: "electronic",
        target: "[data-tour='request-guide-button']",
        title: "Read the request guide first",
      },
      ...(context.hasElectronicRequestRows
        ? [
            {
              body: "This banner appears when the selected state has records requests that need review. Use it to open the guide or jump into the prepared request draft.",
              fallbackTarget: "[data-tour='electronic-integrity']",
              id: "request-queue",
              tab: "electronic" as const,
              target: "[data-tour='request-attention-banner']",
              title: "Find requests that need review",
            },
          ]
        : []),
      ...(context.hasElectronicDraft
        ? [
            {
              body: "Use Copy email draft when you want to paste the request into your own email account or records portal. Review the recipient and custodian before sending.",
              fallbackTarget: "[data-tour='request-draft-panel']",
              id: "copy-request-email",
              tab: "electronic" as const,
              target: "[data-tour='request-copy-email']",
              title: "Copy the request email text",
            },
          ]
        : []),
      ...(context.hasSourceRecordsRequestRows
        ? [
            {
              body: "Source-records requests are separate from electronic-integrity evidence requests. The app prepares the draft and packet context here; you verify the custodian, send it yourself, and submit replies through the response form.",
              fallbackTarget: "[data-tour='electronic-integrity']",
              id: "source-records-request-draft",
              tab: "electronic" as const,
              target: "[data-tour='source-records-request-draft']",
              title: "Use the separate source-records flow",
            },
          ]
        : []),
      ...(context.hasElectronicRequestRows
        ? [
            {
              body: "After an office replies, use this GitHub form to submit the response, files, portal link, fee estimate, denial, redirect, or follow-up notes so maintainers can verify and load the source evidence.",
              fallbackTarget: "[data-tour='request-draft-panel']",
              id: "submit-records-response",
              tab: "electronic" as const,
              target: "[data-tour='request-submit-response']",
              title: "Submit received records or replies",
            },
          ]
        : []),
    ],
  },
  {
    key: "planner",
    build: () => [
      {
        body: "The Source Planner shows which data families are ready, pending, or waiting on better source files for the selected state.",
        fallbackTarget: "[data-tour='workspace']",
        id: "planner",
        tab: "planner",
        target: "[data-tour='source-planner']",
        title: "Check source readiness",
      },
    ],
  },
  {
    key: "data",
    build: (context) => [
      {
        body: context.hasSources
          ? "Data and Sources is the bibliography. Open official links, review parser names, and confirm whether a source is loaded or still a candidate."
          : "Source records appear here when an imported source package is available for the selected state.",
        fallbackTarget: "[data-tour='data-sources']",
        id: "sources",
        tab: "data",
        target: "[data-tour='source-links']",
        title: "Trace numbers back to sources",
      },
      {
        body: context.hasVoteMethodRows
          ? "Vote Methods summarizes EAC participation-method rows. These values can also be viewed as a county map layer from the Map tab."
          : `${context.stateName} does not currently have normalized EAC vote-method rows loaded, so the Method map step is skipped for this state.`,
        fallbackTarget: "[data-tour='data-sources']",
        id: "vote-method-summary",
        tab: "data",
        target: "[data-tour='vote-method-summary']",
        title: "Review vote methods",
      },
      {
        body: context.hasEquipmentRows
          ? "Equipment summarizes county-level administration context such as vendor, voting system, tabulation, paper record, and poll-book fields."
          : `${context.stateName} does not currently have normalized equipment context rows loaded.`,
        fallbackTarget: "[data-tour='data-sources']",
        id: "equipment-context",
        tab: "data",
        target: "[data-tour='equipment-context']",
        title: "Check equipment context",
      },
      {
        body: "Candidate-by-method needs an official source that reports candidate totals split by ballot method. The current EAC method rows describe how people voted, not who each method selected.",
        fallbackTarget: "[data-tour='vote-method-summary']",
        id: "candidate-method-note",
        tab: "data",
        target: "[data-tour='candidate-method-note']",
        title: "Separate candidate by method",
      },
    ],
  },
  {
    key: "methodology",
    build: () => [
      {
        body: "Methodology explains what the app is allowed to claim, what the indicators mean, and what should not be overinterpreted.",
        fallbackTarget: "[data-tour='workspace']",
        id: "methodology",
        tab: "methodology",
        target: "[data-tour='methodology']",
        title: "Read the methodology",
      },
      {
        body: "The reviewer checklist and glossary are the public-review rules of the road. Use them before sharing or escalating anything from a flag or chart.",
        fallbackTarget: "[data-tour='methodology']",
        id: "reviewer-checklist",
        tab: "methodology",
        target: "[data-tour='reviewer-checklist']",
        title: "Use the reviewer checklist",
      },
    ],
  },
  {
    key: "exports",
    build: () => [
      {
        body: "Export buttons create browser-side CSVs from the selected state, and the API list gives direct JSON endpoints for external checks.",
        fallbackTarget: "[data-tour='workspace']",
        id: "exports",
        tab: "exports",
        target: "[data-tour='exports']",
        title: "Export data or use the API",
      },
    ],
  },
  {
    key: "imports",
    build: (context) => [
      {
        body: context.hasImportRuns
          ? "Import Runs show when ETL promotion happened and whether it finished cleanly. This is useful for auditing freshness."
          : "Import Runs will list ETL promotion history when a selected-state import run has been recorded.",
        fallbackTarget: "[data-tour='workspace']",
        id: "imports",
        tab: "imports",
        target: "[data-tour='import-runs']",
        title: "Check import history",
      },
    ],
  },
  {
    key: "support",
    build: () => [
      {
        body: "The Support tab explains how contributions help with hosting, database costs, source collection, validation, and continued development.",
        fallbackTarget: "[data-tour='workspace']",
        id: "support",
        tab: "support",
        target: "[data-tour='support-card']",
        title: "Support the project",
      },
    ],
  },
];

function buildWorkspaceTourSteps(context: WorkspaceTourContext) {
  return tourFeatureRegistry.flatMap((feature) => feature.build(context));
}

const methodologyGuides: MethodologyGuide[] = [
  {
    caveat: "A scatterplot can show places that deserve audit follow-up, but it cannot prove tampering. Confirm any pattern against official canvass rows, reporting-unit definitions, recount/audit records, and local election administration notes.",
    guide: [
      "Use the vote-share scatterplot to find local reporting units where candidate share is unusual for the number of votes reported.",
      "Check whether outliers are explained by normal geography, precinct size, campus or military populations, late-counted ballot groups, or reporting-unit aggregation.",
      "Escalate only when a pattern survives source reconciliation and appears inconsistent with official canvass, audit, or recount records.",
    ],
    id: "vote-share-scatterplot",
    links: [
      {
        detail: "Federal voting-system standards and NIST voting-program context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
      {
        detail: "Federal voting-system certification standards",
        href: "https://www.eac.gov/voting-equipment/voluntary-voting-system-guidelines",
        label: "EAC Voluntary Voting System Guidelines",
      },
      {
        detail: "Official collection of state and local voting-system reports",
        href: "https://www.eac.gov/voting-equipment/voting-system-reports-collection",
        label: "EAC Voting System Reports Collection",
      },
    ],
    summary: "Use vote share versus vote count to find local rows that need source-level review.",
    title: "Vote-share scatterplot",
  },
  {
    caveat: "Drop-off can reflect ballot roll-off, undervotes, candidate-specific behavior, or reporting differences. Treat it as a comparison screen, not an accusation.",
    guide: [
      "Compare presidential votes with a same-row comparison contest where the source supports it.",
      "Look for broad distribution shifts, isolated reporting units with extreme same-party drop-off, and mismatch between presidential and comparison-contest totals.",
      "Verify that the comparison contest is valid for the same geography and ballot population before treating a drop-off pattern as meaningful.",
    ],
    id: "dropoff-histogram",
    links: [
      {
        detail: "Official voting-system testing and certification program",
        href: "https://www.eac.gov/election-technology/testing-certification-program-tc",
        label: "EAC Testing and Certification",
      },
      {
        detail: "Federal voting standards and cybersecurity research context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
      {
        detail: "Voting-system anomaly reporting and formal investigation records",
        href: "https://www.eac.gov/voting-equipment/quality-monitoring-program",
        label: "EAC Quality Monitoring Program",
      },
    ],
    summary: "Use presidential-versus-comparison drop-off to find unusual contest-to-contest movement.",
    title: "Drop-off histogram",
  },
  {
    caveat: "Turnout screens are only as good as their denominator. Do not compare jurisdictions until registration timing, same-day registration, inactive voters, and ballot-count definitions are understood.",
    guide: [
      "Check whether turnout uses registered voters, voting-eligible population, or another denominator.",
      "Flag impossible or near-impossible turnout values first, then inspect high-turnout clusters against source notes and local registration rules.",
      "Use turnout anomalies to request audit records, ballot accounting, or denominator clarification rather than to infer candidate effects directly.",
    ],
    id: "turnout-registration",
    links: [
      {
        detail: "Official EAVS data and codebook source for turnout and participation fields",
        href: "https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys",
        label: "EAC Datasets, Codebooks, and Surveys",
      },
      {
        detail: "Federal voting-system guidance and research context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
      {
        detail: "Voting-system quality monitoring and anomaly reporting",
        href: "https://www.eac.gov/voting-equipment/quality-monitoring-program",
        label: "EAC Quality Monitoring Program",
      },
    ],
    summary: "Use turnout and registration denominators to find accounting questions before candidate-level claims.",
    title: "Turnout and registration checks",
  },
  {
    caveat: "Historical movement is context, not evidence by itself. Large shifts can be real and should be checked against demographic, turnout, candidate, redistricting, and reporting-unit changes.",
    guide: [
      "Compare the current result with prior years at the same geography whenever possible.",
      "Prioritize counties or local units with large movement plus other independent flags, such as source reconciliation gaps or unusual drop-off.",
      "Check whether boundaries, reporting units, party coalitions, ballot access, and turnout composition changed before escalating.",
    ],
    id: "historical-baselines",
    links: [
      {
        detail: "Official federal voting and election-administration datasets",
        href: "https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys",
        label: "EAC Datasets, Codebooks, and Surveys",
      },
      {
        detail: "Official state/local voting-system reports posted by EAC",
        href: "https://www.eac.gov/voting-equipment/voting-system-reports-collection",
        label: "EAC Voting System Reports Collection",
      },
      {
        detail: "Federal voting-system standards and research context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
    ],
    summary: "Use prior elections to separate normal political movement from rows needing review.",
    title: "Historical baseline movement",
  },
  {
    caveat: "This app currently labels these as Klimek-style when true turnout denominators are unavailable. A proxy fingerprint should never be treated as a complete forensic test.",
    guide: [
      "Use a true vote fingerprint only when candidate share and turnout percentage are available for the same reporting units.",
      "Look for dense bands, tails, or clusters that combine very high turnout with one-sided vote share, then verify against source denominators.",
      "Treat proxy fingerprints as visualization aids that tell you where to collect better turnout or ballot-accounting data.",
    ],
    id: "klimek-fingerprint",
    links: [
      {
        detail: "Official EAC source family for turnout and participation denominators",
        href: "https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys",
        label: "EAC Datasets, Codebooks, and Surveys",
      },
      {
        detail: "Voting-system standards and election-technology research context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
      {
        detail: "Official voting-system quality monitoring and anomaly records",
        href: "https://www.eac.gov/voting-equipment/quality-monitoring-program",
        label: "EAC Quality Monitoring Program",
      },
    ],
    summary: "Use vote fingerprints cautiously to compare vote share with turnout or turnout proxies.",
    title: "Klimek-style fingerprints",
  },
  {
    caveat: "Shpilkin-style views are sensitive to binning, geography size, and turnout definition. They can highlight suspicious distribution shapes, but official audits and source reconciliation are still required.",
    guide: [
      "Bucket reporting units by candidate vote share and inspect whether vote totals pile up in unnatural bands.",
      "Compare the shape across years, parties, and turnout sources before treating a spike as suspicious.",
      "Use any strong pattern to guide document requests: ballot accounting, audit reports, recount records, and official canvass detail.",
    ],
    id: "shpilkin-diagnostics",
    links: [
      {
        detail: "Official voting-system reports and studies submitted to EAC",
        href: "https://www.eac.gov/voting-equipment/voting-system-reports-collection",
        label: "EAC Voting System Reports Collection",
      },
      {
        detail: "Official EAC data and survey source family for turnout context",
        href: "https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys",
        label: "EAC Datasets, Codebooks, and Surveys",
      },
      {
        detail: "Federal voting-system standards and research context",
        href: "https://www.nist.gov/itl/voting",
        label: "NIST Voting Program",
      },
    ],
    summary: "Use vote-share distribution shapes to find clusters that need source-level verification.",
    title: "Shpilkin-style diagnostics",
  },
];

function formatCapability(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function statusLabel(value: boolean | undefined) {
  return value ? "Available" : "Pending";
}

function indicatorLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function indicatorExplanation(type: string) {
  if (type.includes("margin")) {
    return "Margin-related indicators compare the size of the local winner margin against the imported review metrics.";
  }

  if (type.includes("turnout")) {
    return "Turnout indicators should be read against the state source denominator and any local reporting notes.";
  }

  if (type.includes("vote") || type.includes("share")) {
    return "Vote-share indicators highlight unusual candidate-share or total-vote patterns for human review.";
  }

  if (type.includes("missing")) {
    return "Missing-data indicators mean a required input was absent or could not be reconciled in the imported bundle.";
  }

  return "This advisory indicator marks a pattern from the imported review data that deserves human review.";
}


function indicatorScopeLabel(indicator: AnalysisIndicator) {
  if (indicator.level === "city") {
    return "Major city";
  }
  if (indicator.level === "rest_of_county") {
    return "Rest of county";
  }
  return indicator.level === "county" ? "County" : indicator.level;
}

function auditContextSummary(indicator: AnalysisIndicator) {
  const audit = indicator.metrics.auditContext as
    | {
        aggregateAuditResults?: {
          finalEquipmentErrorRate?: string;
          locallyReportedPotentialEquipmentIssueErrors?: number;
          perUnitOutcomeStatus?: string;
        } | null;
        auditedBallots?: number;
        caveat?: string;
        matchedSelectionRows?: number;
        sourceUrl?: string;
        statewideFinding?: string;
        topEquipment?: string[];
      }
    | undefined
    | null;

  if (!audit) {
    return "No audit context loaded for this indicator.";
  }

  if (!audit.matchedSelectionRows) {
    return "No WEC audit selected reporting units matched this review scope.";
  }

  const equipment = audit.topEquipment?.length ? ` Equipment: ${audit.topEquipment.join(" - ")}.` : "";
  const aggregate = audit.aggregateAuditResults
    ? ` Statewide WEC audit context: final equipment error rate ${audit.aggregateAuditResults.finalEquipmentErrorRate ?? "not reported"}; ${audit.aggregateAuditResults.locallyReportedPotentialEquipmentIssueErrors ?? 0} reported potential equipment-issue errors were reviewed as partially or completely human-factor issues.`
    : "";
  const caveat = audit.caveat ? ` ${audit.caveat}` : " WEC report gives statewide findings, not per-unit discrepancy outcomes.";
  return `${audit.matchedSelectionRows.toLocaleString()} WEC audit selection row${audit.matchedSelectionRows === 1 ? "" : "s"}; ${(audit.auditedBallots ?? 0).toLocaleString()} audited ballots.${equipment}${aggregate}${caveat}`;
}

function denominatorContextSummary(indicator: AnalysisIndicator) {
  const denominator = indicator.metrics.denominatorContext as
    | {
        ballotModeContext?: string;
        defaultTurnoutDenominator?: string;
        missingDenominator?: string;
      }
    | undefined
    | null;

  if (!denominator) {
    return "No denominator caveat loaded.";
  }

  return `${denominator.defaultTurnoutDenominator ?? "Turnout denominator not recorded"}. ${denominator.missingDenominator ?? ""}`.trim();
}

function readinessStatus(score: number): QualityBadgeStatus {
  if (score >= 0.9) return "ready";
  if (score >= 0.5) return "partial";
  if (score > 0) return "proxy";
  return "missing";
}

function readinessGateLabel(score: number, blockerCount: number) {
  if (blockerCount > 0 && score < 0.5) return "Blocked for responsible flag review";
  if (score >= 0.8 && blockerCount === 0) return "Strong review support";
  if (score >= 0.55) return "Partial review support";
  if (score > 0) return "Weak review support";
  return "Waiting on source data";
}

function scoreFromNote(note: DataNoteSection | undefined) {
  if (!note) return 0;
  if (note.status === "ready") return 1;
  if (note.status === "partial") return 0.55;
  if (note.status === "proxy") return 0.35;
  return 0;
}

function buildEvidenceReadinessDimensions(input: {
  adminSourceStatus: AdminSourceStatusSummary | undefined;
  coverage: CoverageSummary | null;
  dataNotes: DataNoteSection[];
  electronicIntegrityStatus: ElectronicIntegrityStateSummary | undefined;
  historicalRows: HistoricalResultRowSummary[];
  indicators: AnalysisIndicator[];
  reviewRows: ReviewRowSummary[];
  sourceRecordsRequestRows: SourceRecordsRequestSummary[];
  sources: SourceSummary[];
  turnoutRows: TurnoutRowSummary[];
}) {
  const noteByKey = new Map(input.dataNotes.map((note) => [note.key, note]));
  const comparisonRows = input.reviewRows.filter((row) => row.demDropoff !== null || row.repDropoff !== null).length;
  const sourceUrlGaps = input.sources.filter((source) => !source.sourceUrl.trim()).length;
  const loadedElectronicArtifacts = input.electronicIntegrityStatus?.artifacts.filter((artifact) => artifact.status === "loaded").length ?? 0;
  const requestRows = input.sourceRecordsRequestRows.length;
  const adminFamiliesLoaded = [
    input.adminSourceStatus?.audit?.status,
    input.adminSourceStatus?.cvr?.status,
    input.adminSourceStatus?.incidents?.status,
    input.adminSourceStatus?.equipment?.status,
  ].filter((status) => status === "loaded" || status === "partial").length;
  const dimensions: EvidenceReviewDimension[] = [
    {
      detail: noteByKey.get("results")?.detail ?? "Certified result rows are not loaded.",
      label: "Certified results",
      score: scoreFromNote(noteByKey.get("results")),
      status: noteByKey.get("results")?.status ?? "missing",
      why: noteByKey.get("results")?.why ?? "Official results are the baseline for every review tool.",
    },
    {
      detail: `${input.sources.length.toLocaleString()} source record${input.sources.length === 1 ? "" : "s"}; ${sourceUrlGaps.toLocaleString()} missing URL${sourceUrlGaps === 1 ? "" : "s"}.`,
      label: "Source provenance",
      score: input.sources.length ? (sourceUrlGaps ? 0.55 : 1) : 0,
      status: input.sources.length ? (sourceUrlGaps ? "partial" : "ready") : "missing",
      why: "Every advisory signal should trace back to public source records before it is escalated.",
    },
    {
      detail: noteByKey.get("review")?.detail ?? "No review rows are loaded.",
      label: "Local review rows",
      score: scoreFromNote(noteByKey.get("review")),
      status: noteByKey.get("review")?.status ?? "missing",
      why: noteByKey.get("review")?.why ?? "Flags need same-state local reporting-unit rows, not just statewide totals.",
    },
    {
      detail: comparisonRows ? `${comparisonRows.toLocaleString()} review row${comparisonRows === 1 ? "" : "s"} include same-grain comparison-contest values.` : "No same-grain comparison contest values are loaded.",
      label: "Comparison contest",
      score: comparisonRows ? (comparisonRows === input.reviewRows.length ? 1 : 0.65) : 0,
      status: comparisonRows ? (comparisonRows === input.reviewRows.length ? "ready" : "partial") : "missing",
      why: "President-versus-Senate/Governor/House comparisons make drop-off flags more interpretable than vote-share alone.",
    },
    {
      detail: noteByKey.get("turnout")?.detail ?? "No turnout denominator rows are loaded.",
      label: "Turnout denominator",
      score: scoreFromNote(noteByKey.get("turnout")),
      status: noteByKey.get("turnout")?.status ?? "missing",
      why: noteByKey.get("turnout")?.why ?? "Turnout denominators help separate accounting questions from candidate-level patterns.",
    },
    {
      detail: noteByKey.get("map")?.detail ?? "Map geometry is not loaded.",
      label: "Geometry and joins",
      score: scoreFromNote(noteByKey.get("map")),
      status: noteByKey.get("map")?.status ?? "missing",
      why: noteByKey.get("map")?.why ?? "Maps need validated geometry joins before geographic clusters should be interpreted.",
    },
    {
      detail: input.historicalRows.length ? `${input.historicalRows.length.toLocaleString()} historical baseline row${input.historicalRows.length === 1 ? "" : "s"} loaded.` : "No historical baseline rows are loaded.",
      label: "Historical baselines",
      score: scoreFromNote(noteByKey.get("history")),
      status: noteByKey.get("history")?.status ?? "missing",
      why: noteByKey.get("history")?.why ?? "Historical rows provide context, not proof, for unusual 2024 movement.",
    },
    {
      detail: `${loadedElectronicArtifacts.toLocaleString()} electronic evidence artifact${loadedElectronicArtifacts === 1 ? "" : "s"} loaded; ${adminFamiliesLoaded.toLocaleString()} admin context famil${adminFamiliesLoaded === 1 ? "y" : "ies"} loaded or partial.`,
      label: "Audit, CVR, equipment context",
      score: Math.min(1, (loadedElectronicArtifacts + adminFamiliesLoaded) / 5),
      status: readinessStatus(Math.min(1, (loadedElectronicArtifacts + adminFamiliesLoaded) / 5)),
      why: "CVRs, audits, recounts, incidents, and equipment records are follow-up evidence families, not automatic confirmation or clearance.",
    },
    {
      detail: requestRows ? `${requestRows.toLocaleString()} prepared source-record request${requestRows === 1 ? "" : "s"} remain in the queue.` : "No prepared source-record requests are queued for this state.",
      label: "Remaining records queue",
      score: requestRows ? 0.35 : 1,
      status: requestRows ? "proxy" : "ready",
      why: requestRows ? "Open source-record requests identify evidence still needed before stronger review conclusions are responsible." : "No source-record request rows are currently queued for this state.",
    },
  ];
  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length;
  const blockerCount = dimensions.filter((dimension) => dimension.status === "missing" || dimension.status === "blocked").length;
  return { blockerCount, dimensions, label: readinessGateLabel(totalScore, blockerCount), score: totalScore };
}

function buildFlagExplanation(input: {
  dataNotes: DataNoteSection[];
  indicator: AnalysisIndicator;
  reviewRows: ReviewRowSummary[];
  sources: SourceSummary[];
}): FlagExplanation {
  const relatedRows = input.reviewRows.filter((row) => row.jurisdictionCode === input.indicator.jurisdictionCode);
  const relatedSourceIds = [...new Set(relatedRows.map((row) => row.sourceId).filter(Boolean))];
  const relatedSources = relatedSourceIds
    .map((sourceId) => input.sources.find((candidate) => candidate.id === sourceId))
    .filter((source): source is SourceSummary => Boolean(source));
  const comparisonRows = relatedRows.filter((row) => row.demDropoff !== null || row.repDropoff !== null).length;
  const missingEvidence = input.dataNotes
    .filter((note) => note.status !== "ready")
    .slice(0, 4)
    .map((note) => `${note.label}: ${note.why}`);
  if (relatedRows.length && relatedSources.length === 0) {
    missingEvidence.unshift("Related review rows cite source IDs that are not present in the selected state's source list.");
  }
  if (!relatedRows.length) {
    missingEvidence.unshift("Related review rows were not found for this indicator's jurisdiction in the current state payload.");
  }
  if (!comparisonRows) {
    missingEvidence.unshift("Same-grain comparison contest values are missing for this jurisdiction, so read this as vote-share or source-coverage review only.");
  }
  return {
    auditContext: auditContextSummary(input.indicator),
    denominatorContext: denominatorContextSummary(input.indicator),
    jurisdiction: input.indicator.jurisdictionName,
    label: input.indicator.label,
    missingEvidence,
    priority: severityBucket(input.indicator.severity),
    scope: indicatorScopeLabel(input.indicator),
    sourceContext: relatedSources.length
      ? relatedSources.map((source) => `${source.authority}: ${source.title}. ${source.sourceUrl || "No direct URL recorded."}`).join(" - ")
      : relatedSourceIds.length
        ? `Source IDs ${relatedSourceIds.join(" - ")} are not present in the selected state's source list.`
        : "No related review-row source ID is available for this indicator.",
    summary: `${input.indicator.summary} ${indicatorExplanation(input.indicator.type)}`,
  };
}
function severityBucket(severity: number) {
  if (severity >= 0.85) {
    return "High review priority";
  }

  if (severity >= 0.55) {
    return "Medium review priority";
  }

  return "Low review priority";
}

function pct(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(2)}%` : "0.00%";
}

function summaryValue(value: unknown) {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return "";
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csvContent(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(" - ")).join(" - ");
}

function downloadBlob(filename: string, content: BlobPart[], type: string) {
  const blob = new Blob(content, { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  downloadBlob(filename, [csvContent(headers, rows)], "text/csv;charset=utf-8");
}

function downloadTextFile(filename: string, content: string, type: string) {
  downloadBlob(filename, [content], type);
}

function jsonContent(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return null;
  }

  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return { intercept, slope };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizePct(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function percentDelta(storedShare: number | null, votes: number | null, totalVotes: number | null) {
  if (
    storedShare === null ||
    votes === null ||
    totalVotes === null ||
    !Number.isFinite(storedShare) ||
    !Number.isFinite(votes) ||
    !Number.isFinite(totalVotes) ||
    totalVotes <= 0
  ) {
    return null;
  }

  return Math.abs(storedShare - (votes / totalVotes) * 100);
}

function chartStatusLabel(status: ChartQualityStatus) {
  if (status === "ready") {
    return "Automated check passed";
  }

  if (status === "blocked") {
    return "Chart unavailable";
  }

  return "Acknowledgement required";
}

function staticChartDiagnostic(input: {
  acknowledgementKey: string;
  checked?: string[];
  issues: string[];
  rowCount: number;
  status?: ChartQualityStatus;
  summary: string;
  title: string;
}): ChartQualityDiagnostic {
  const status = input.status ?? (input.rowCount <= 0 ? "blocked" : input.issues.length ? "acknowledgement_required" : "ready");
  return {
    acknowledgementKey: input.acknowledgementKey,
    checked: input.checked ?? [],
    issues: input.issues,
    rowCount: input.rowCount,
    status,
    summary: input.summary,
    title: input.title,
  };
}
function qualityBadgeLabel(status: QualityBadgeStatus) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "partial") {
    return "Partial";
  }

  if (status === "proxy") {
    return "Proxy";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Missing";
}

function QualityBadge({ detail, status }: { detail: string; status: QualityBadgeStatus }) {
  return (
    <span className={`quality-badge ${status}`} title={detail}>
      {qualityBadgeLabel(status)}
    </span>
  );
}

function hasNativeImport(importRuns: ImportRunSummary[]) {
  return importRuns.some((run) => run.parser.toLowerCase().includes("native"));
}

function hasLegacyImport(importRuns: ImportRunSummary[]) {
  return importRuns.some((run) => run.parser.toLowerCase().includes("legacy"));
}

function summaryWarnings(summary: Record<string, unknown> | null | undefined) {
  if (!summary) {
    return [];
  }

  return Object.entries(summary)
    .filter(([key, value]) => key.toLowerCase().includes("warning") && typeof value === "string" && value.trim())
    .map(([, value]) => String(value));
}

function reviewCoverageModes(rows: ReviewRowSummary[]) {
  return new Set(
    rows
      .map((row) => (typeof row.metrics.coverageMode === "string" ? row.metrics.coverageMode : ""))
      .filter(Boolean),
  );
}

function comparisonContestFromCoverageMode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("senate")) {
    return "United States Senator";
  }

  if (normalized.includes("governor")) {
    return "Governor";
  }

  if (normalized.includes("representative") || normalized.includes("house")) {
    return "United States Representative";
  }

  return "";
}

function comparisonContestLabel(row: ReviewRowSummary) {
  return typeof row.metrics.comparisonContest === "string" && row.metrics.comparisonContest
    ? row.metrics.comparisonContest
    : comparisonContestFromCoverageMode(row.metrics.coverageMode);
}

function reviewComparisonContests(rows: ReviewRowSummary[]) {
  return new Set(rows.map(comparisonContestLabel).filter(Boolean));
}

function formatSignedPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return (value > 0 ? "+" : "") + value.toFixed(1) + "%";
}

function buildTicketSplitSummary(rows: ReviewRowSummary[]) {
  const values = rows
    .filter((row) => comparisonContestLabel(row))
    .map((row) => ({
      demDropoff: normalizePct(row.demDropoff),
      repDropoff: normalizePct(row.repDropoff),
    }))
    .filter(
      (row): row is { demDropoff: number; repDropoff: number } =>
        row.demDropoff !== null && row.repDropoff !== null,
    );
  const rowCount = values.length;
  const averageDemDropoff = rowCount ? values.reduce((sum, row) => sum + row.demDropoff, 0) / rowCount : null;
  const averageRepDropoff = rowCount ? values.reduce((sum, row) => sum + row.repDropoff, 0) / rowCount : null;
  const thresholdPct = 5;

  return {
    averageDemDropoff,
    averageRepDropoff,
    comparisonContests: [...reviewComparisonContests(rows)],
    demAheadRows: values.filter((row) => row.demDropoff > 0).length,
    materialRows: values.filter(
      (row) => Math.abs(row.demDropoff) >= thresholdPct || Math.abs(row.repDropoff) >= thresholdPct,
    ).length,
    repAheadRows: values.filter((row) => row.repDropoff > 0).length,
    rowCount,
    thresholdPct,
  };
}

function comparableReviewUnitName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(County|Parish|Borough)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function reviewRowLooksCountyLevel(row: ReviewRowSummary) {
  return row.localUnit === row.jurisdictionName || comparableReviewUnitName(row.localUnit) === comparableReviewUnitName(row.jurisdictionName);
}

function countyLevelReviewIssue(rows: ReviewRowSummary[]) {
  const modes = reviewCoverageModes(rows);
  const contests = reviewComparisonContests(rows);
  const hasCountyComparison = [...modes].some((mode) => mode.toLowerCase().includes("presidentvs"));
  const allRowsLookCountyLevel = rows.length > 0 && rows.every(reviewRowLooksCountyLevel);
  const rowsByJurisdiction = new Map<string, number>();

  for (const row of rows) {
    rowsByJurisdiction.set(row.jurisdictionCode, (rowsByJurisdiction.get(row.jurisdictionCode) ?? 0) + 1);
  }

  const maxRowsPerJurisdiction = Math.max(0, ...rowsByJurisdiction.values());

  if (!allRowsLookCountyLevel || (!hasCountyComparison && maxRowsPerJurisdiction > 1)) {
    return null;
  }

  const contestLabel = contests.size ? ` against ${[...contests].join(" - ")}` : "";
  return `These rows are county-level presidential comparison rows${contestLabel}, not precinct, ward, or municipal reporting-unit rows. Advisory flag generation requires multiple local rows inside a county, so this state should be read as county context only.`;
}

function buildReportIssueUrl(input: {
  chart?: string;
  context: string;
  jurisdiction?: string;
  sourceUrl?: string;
  stateCode: string;
  stateName: string;
}) {
  const title = `[Data issue] ${input.stateCode}${input.jurisdiction ? ` ${input.jurisdiction}` : ""}`;
  const area = input.jurisdiction ?? "Statewide / not selected";
  const chartOrTable = input.chart ?? input.context;
  const params = new URLSearchParams({
    issue_type: input.chart ? "Chart caveat or warning" : "Other data review",
    labels: "data-review",
    jurisdiction: area,
    state: `${input.stateName} (${input.stateCode})`,
    template: githubDataReviewTemplate,
    title,
    what_looks_wrong: `Context: ${chartOrTable}. Please describe the exact app value, chart, flag, source, or status text that should be reviewed.`,
  });

  if (input.sourceUrl) {
    params.set("source_url", input.sourceUrl);
  }

  return `${githubIssueUrl}?${params.toString()}`;
}

function buildRecordsResponseUrl(input: {
  custodian?: string;
  requestId?: string;
  stateCode: string;
  stateName: string;
}) {
  const params = new URLSearchParams({
    custodian: input.custodian ?? "",
    labels: "records-request,data-review",
    request_id: input.requestId ?? "",
    response_summary: "Paste or summarize the official response here. Include links, filenames, dates, fee notes, denials, redirects, or records produced.",
    state: `${input.stateName} (${input.stateCode})`,
    template: githubRecordsResponseTemplate,
    title: `[Records response] ${input.stateCode}${input.requestId ? ` ${input.requestId}` : ""}`,
  });

  return `${githubIssueUrl}?${params.toString()}`;
}

function dataNoteStatus(hasRows: boolean, capability?: boolean, partial?: boolean): QualityBadgeStatus {
  if (hasRows && partial) {
    return "partial";
  }

  if (hasRows) {
    return "ready";
  }

  if (capability || partial) {
    return "partial";
  }

  return "missing";
}

function adminStatusLabel(status: AdminSourceStatusSummary["status"] | undefined) {
  if (!status) {
    return "Untracked";
  }

  return {
    blocked: "Blocked",
    candidate: "Candidate",
    documented_exclusion: "Excluded",
    loaded: "Loaded",
    needs_data: "Needs data",
    partial: "Partial",
  }[status];
}

function adminQualityStatus(status: AdminSourceStatusSummary["status"] | undefined): QualityBadgeStatus {
  if (status === "loaded") {
    return "ready";
  }

  if (status === "partial" || status === "candidate") {
    return "partial";
  }

  if (status === "blocked") {
    return "blocked";
  }

  return "missing";
}

function adminFamilyWhy(status: AdminSourceStatusSummary | undefined, family: "audit" | "cvr" | "incidents") {
  return status?.[family]?.why ?? `${family.toUpperCase()} source status has not been registered for this state.`;
}

function electronicQualityStatus(status: string | undefined): QualityBadgeStatus {
  if (status === "loaded") {
    return "ready";
  }

  if (status === "partial" || status === "candidate") {
    return "partial";
  }

  if (status === "blocked") {
    return "blocked";
  }

  return "missing";
}

function electronicArtifactLabel(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" - ");
}

function evidenceStatusLabel(status: string | undefined) {
  return status ? status.replaceAll("_", " ") : "missing";
}

function isMapGeometrySource(source: SourceSummary) {
  if (source.status !== "loaded") {
    return false;
  }

  const category = source.category.toLowerCase();
  const localArtifact = source.localArtifact.toLowerCase();
  const parser = source.parser.toLowerCase();
  return (
    localArtifact.endsWith(".geojson") ||
    parser.includes("geojson") ||
    (category.includes("boundar") && category.includes("count"))
  );
}

const stateDataNoteOverrides: Record<string, StateDataNoteOverride[]> = {
  AZ: [
    {
      key: "sources",
      evidence: "Arizona SOS signed statewide canvass county presidential rows are loaded from the official canvass table.",
      status: "partial",
      why: "The direct signed-canvass PDF source remains linked for verification, but the local machine-readable artifact is a county CSV transcribed from that official PDF because the PDF host still blocks scripted downloads.",
    },
    {
      key: "review",
      evidence: "Arizona native data is county-level signed canvass data only.",
      status: "missing",
      why: "Precinct/reporting-unit presidential rows and same-row down-ballot comparison fields are not in the signed canvass PDF, so review graphs remain disabled until a lower-level official export is collected.",
    },
    {
      key: "turnout",
      evidence: "Arizona signed canvass Total Eligible Registration and Total Ballots Cast rows are loaded for county turnout.",
      status: "ready",
      why: "Turnout now uses the state canvass denominator rather than the EAC fallback, while the EAC rows remain available as a national benchmark source.",
    },
  ],
  GA: [
    {
      key: "sources",
      evidence: "Georgia SOS media export JSON is loaded as the official 2024 result/review source, official SOS media exports now provide 2012/2016/2020 county historical baselines, Census county geometry is joined for maps, and EAC 2024 V2 remains the turnout denominator fallback.",
      status: "partial",
      why: "Source coverage is mixed: Georgia county and precinct presidential rows, county historical baselines, and county map geometry are loaded from official/public artifacts, while turnout denominators still come from EAC fallback data; county presidential candidate rows sum 19 votes higher than the statewide presidential contest total and 17 zero-total precinct entries are omitted from review charts.",
    },
    {
      key: "map",
      evidence: "Census county geometry is joined to the 159 Georgia county result rows.",
      status: "ready",
      why: "The map is county-level only. Precinct review rows remain source-table and graph evidence because precinct boundary overlays are not included in this package.",
    },
    {
      key: "review",
      evidence: "Georgia native review rows use official media-export precinct presidential rows paired with U.S. House comparison rows where comparable.",
      status: "partial",
      why: "U.S. House is district-based and candidate-specific, so directional screens remain low-confidence advisory context; one-sided and multi-district House rows are excluded from down-ballot dropoff calculations.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 fallback is the current denominator backbone.",
      status: "partial",
      why: "Georgia native turnout sources still need to be collected and normalized before the turnout card can be marked ready.",
    },
  ],
  FL: [
    {
      key: "sources",
      evidence: "Florida Department of State official presidential county table is loaded for county result rows; EAC 2024 V2 remains the turnout denominator fallback.",
      status: "partial",
      why: "Florida now has source-first county presidential results, but the package does not yet include a state-native turnout denominator artifact or lower-level review rows.",
    },
    {
      key: "review",
      evidence: "Florida native data is county-level presidential results only.",
      status: "missing",
      why: "Precinct/reporting-unit presidential rows and same-row down-ballot comparison fields are not loaded yet, so review graphs remain disabled until a lower-level official export is collected.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 fallback is the current registered-voter denominator source.",
      status: "partial",
      why: "Florida needs a state-native official registered-voter/ballots-cast denominator package mapped before turnout can be treated as complete in this app.",
    },
  ],
  MD: [
    {
      key: "sources",
      evidence: "Maryland State Board of Elections all-precinct CSV is loaded for official President and U.S. Senate local rows; Census county geometry is joined for maps, and EAC 2024 V2 remains the turnout denominator fallback.",
      status: "partial",
      why: "Maryland now has source-first county result rows and precinct review rows from an official statewide CSV, but turnout still uses EAC fallback data and precinct boundary overlays are not included.",
    },
    {
      key: "review",
      evidence: "Maryland native review rows support precinct-level President-versus-U.S. Senate same-party drop-off screening.",
      status: "ready",
      why: "The review screen uses 1,958 official precinct/election-district rows with Harris/Trump presidential votes paired to Alsobrooks/Hogan Senate votes at the same local reporting grain.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 jurisdiction fallback rows are loaded while a state-native denominator package is pending.",
      status: "partial",
      why: "Maryland needs official state-native registered-voter/ballots-cast denominator rows mapped before turnout can be treated as complete in this app.",
    },
  ],  MI: [
    {
      key: "review",
      evidence: "Michigan native review rows support presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      why: "The review graphs are local-reporting-unit screens. They do not include precinct boundary geometry, so map inspection remains county/result based.",
    },
  ],
  MN: [
    {
      key: "review",
      evidence: "Minnesota native review rows support presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      why: "Precinct review data is loaded, but precinct boundary overlays are not sourced yet, so graph outliers need source-row inspection.",
    },
  ],
  MS: [
    {
      key: "review",
      evidence: "Mississippi statewide recap CSV rows are loaded for county-level President-versus-U.S. Senate review.",
      status: "partial",
      why: "The current review rows are county-level advisory screening inputs, not precinct-level scatter plots. The reviewed OCR path still reports 11 import-ready Mississippi OCR counties, 61 review-required counties, and 10 missing-OCR counties before any precinct promotion.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 county/jurisdiction fallback rows are loaded while Mississippi-native turnout remains pending.",
      status: "partial",
      why: "The SOS Active Voter Count Reports page is an official denominator lead, but active-voter counts still need an official ballots-cast or voter-participation partner before replacing the EAC turnout fallback.",
    },
    {
      key: "history",
      evidence: "The SOS election-results archive exposes 2020, 2016, and 2012 election result pages, but no source-cited county presidential artifacts are committed yet.",
      status: "missing",
      why: "Historical baseline charts stay disabled until official SOS county presidential artifacts are collected from archive iframe targets, direct recap files, or the SOS request path and parsed with provenance.",
    },
  ],
  NE: [
    {
      key: "review",
      evidence: "Nebraska review rows use official county-level President-versus-U.S. Senate two-year special election canvass rows.",
      status: "partial",
      why: "The current Nebraska review screen is county context only. The source inventory did not identify a public statewide precinct/subcounty President plus U.S. Senate export or matching reporting-unit geometry/crosswalk.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 county fallback rows are loaded; the Nebraska canvass voting-statistics reconciliation reports 965,236 Total Voting versus 965,145 EAC ballots cast.",
      status: "partial",
      why: "The generated Nebraska reconciliation shows a 91-vote canvass-minus-EAC difference across 34 county rows with no registered-voter denominator delta, so EAC fallback remains active until replacement semantics are reviewed.",
    },
    {
      key: "equipment",
      evidence: "Nebraska equipment context is loaded from supplemental Verified Voting rows while official equipment records remain a request-path item.",
      status: "partial",
      why: "Use the equipment rows as jurisdiction-level administration context only; request official Nebraska SOS or county equipment records before treating them as source-native equipment provenance.",
    },
  ],
  NC: [
    {
      key: "map",
      evidence: "Census county geometry is joined to the 100 North Carolina county result rows.",
      status: "ready",
      why: "The map is county-level only. Real Precinct=Y review rows remain source-table and graph evidence because precinct boundary overlays are not included in this package.",
    },
    {
      key: "review",
      evidence: "North Carolina uses official Real Precinct=Y rows with President-versus-Governor same-party drop-off; 2024 had no U.S. Senate race.",
      why: "Certified county totals include early voting, absentee, provisional, transfer, and other non-real reporting units, but review charts filter to NCSBE Real Precinct=Y rows covering 3,923,739 of 5,699,141 presidential votes.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 fallback rows are loaded while a native denominator package is pending.",
      status: "partial",
      why: "North Carolina needs a state-native official registered-voter denominator mapped into the turnout contract before turnout can be marked ready.",
    },
  ],
  NV: [
    {
      key: "sources",
      evidence: "Nevada Secretary of State archived statewide general election results are loaded for county presidential rows.",
      status: "partial",
      why: "The live NVSOS and Silver State hosts still return Incapsula challenge pages to scripted collection, so the machine-readable artifact is transcribed from an archived capture of the official NVSOS results page.",
    },
    {
      key: "review",
      evidence: "Clark County, Washoe County, and Humboldt County official CVR precinct President-versus-U.S. Senate review rows are loaded alongside Nevada statewide county totals.",
      status: "partial",
      why: "Clark County, Washoe County, and Humboldt County now support precinct-level advisory screening, but the other 14 Nevada jurisdictions remain county-only until local exports or records-request productions are collected. County CVR totals may differ from certified county totals, so source-row inspection remains required.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 fallback is the current denominator backbone.",
      status: "partial",
      why: "Nevada native registered-voter/ballots-cast denominator rows are still pending, so turnout remains a fallback data layer.",
    },
  ],
  OH: [
    {
      key: "review",
      evidence: "Ohio native review rows support presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      status: "partial",
      why: "The comparison uses the Ohio Secretary of State precinct-level U.S. Senate rows from the same workbook; review graphs remain advisory screening views, not ballot-level ticket-splitting evidence.",
    },
  ],
  PA: [
    {
      key: "review",
      evidence: "Pennsylvania native review rows support presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      why: "Two presidential precinct groups do not have matching Senate rows and stay vote-share-only; source rows should be inspected before treating a flag as meaningful.",
    },
  ],
  VA: [
    {
      key: "sources",
      evidence: "Virginia Department of Elections presidential locality and precinct rows are loaded from the official Elections Database contest CSV, with official ENR all-contest precinct results, ENR turnout rows, and Census county-equivalent geometry joined for maps.",
      status: "partial",
      why: "Virginia now has source-first locality results, same-precinct President-versus-U.S. Senate review rows, state-native turnout denominators, and map geometry, but precinct boundary overlays and dedicated audit/recount/CVR/litigation records still need collection.",
    },
    {
      key: "map",
      evidence: "Virginia result rows are locality-level rows covering counties and independent cities.",
      status: "ready",
      why: "The map uses Census county-equivalent geometry joined to Virginia counties and independent cities. It does not include precinct boundary overlays.",
    },
    {
      key: "review",
      evidence: "Virginia official ENR precinct rows support presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      status: "partial",
      why: "The comparison uses the Virginia Department of Elections ENR U.S. Senate precinct rows from the same all-contest export; review graphs remain advisory screening views, not ballot-level ticket-splitting evidence.",
    },
    {
      key: "turnout",
      evidence: "Virginia Department of Elections ENR precinct turnout rows are loaded with ballots cast, total registered voters, active registered voters, and inactive registered voters.",
      status: "ready",
      why: "ENR turnout is election-level turnout by precinct, so ballots cast can exceed presidential-contest votes; use it as a turnout denominator, not as a presidential vote total.",
    },
  ],
  WA: [
    {
      key: "review",
      evidence: "Washington participating-county precinct rows aggregate to 3,918,934 presidential votes versus 3,924,243 certified county votes, a 5,309 vote gap.",
      status: "partial",
      why: "This is a participating-precinct screening package, not a fully reconciled statewide precinct dataset. Use it to find rows worth checking, not to make statewide claims.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 fallback rows are loaded while a state-native registered-voter denominator package is pending.",
      status: "partial",
      why: "Washington needs official state-native turnout denominators mapped before turnout can be treated as complete in this app.",
    },
    {
      key: "history",
      why: "Washington historical official-result rows have not been backfilled yet, so historical graphs may be unavailable or incomplete.",
    },
  ],
  WI: [
    {
      key: "review",
      evidence: "Wisconsin native review rows use WEC ward-level presidential vote-share and President-versus-U.S. Senate same-party drop-off screening.",
      why: "Ward-level review rows are available for advisory screening, but flags still need source-row inspection and local context before drawing conclusions.",
    },
    {
      key: "turnout",
      evidence: "EAC 2024 V2 local-jurisdiction fallback is used because the WEC ward results workbook does not include registered-voter denominator fields; partial local ward denominators are cataloged but not statewide coverage.",
      status: "partial",
      why: "Wisconsin turnout has registered-voter denominators from official EAC fallback data, while statewide ward-level registered-voter denominators and row-level ballot-mode inputs remain unavailable from the WEC ward workbook.",
    },
    {
      key: "audit",
      evidence: "WEC selected reporting units and statewide aggregate audit findings are loaded, including the final zero equipment error rate from the published report.",
      status: "partial",
      why: "The published WEC report does not include per-reporting-unit discrepancy outcome rows, so audit context is explanatory and not a per-unit clearance or confirmation signal.",
    },
  ],
};

function applyStateDataNoteOverrides(stateCode: string, sections: DataNoteSection[]): DataNoteSection[] {
  const overrides = stateDataNoteOverrides[stateCode.toUpperCase()] ?? [];
  if (!overrides.length) {
    return sections;
  }

  return sections.map((section) => {
    const override = overrides.find((candidate) => candidate.key === section.key);
    return override ? { ...section, ...override, key: section.key } : section;
  });
}

function buildDataNoteSections(input: {
  adminSourceStatus: AdminSourceStatusSummary | undefined;
  completeness: CompletenessSummary | undefined;
  coverage: CoverageSummary | null;
  historicalRows: HistoricalResultRowSummary[];
  importRuns: ImportRunSummary[];
  reviewRows: ReviewRowSummary[];
  results: ResultRow[];
  sources: SourceSummary[];
  stateCode: string;
  turnoutRows: TurnoutRowSummary[];
  voteMethodRows: VoteMethodRowSummary[];
  equipmentRows: EquipmentRowSummary[];
}): DataNoteSection[] {
  const capabilities = input.completeness?.capabilities ?? input.coverage?.capabilities;
  const latestNativeRun = input.importRuns.find((run) => run.parser.toLowerCase().includes("native"));
  const latestRun = input.importRuns[0];
  const importWarnings = [
    ...summaryWarnings(input.completeness?.latestNativeImportSummary),
    ...summaryWarnings(input.completeness?.latestImportSummary),
    ...summaryWarnings(latestNativeRun?.summary),
    ...summaryWarnings(latestRun?.summary),
  ];
  const sourceUrlGaps = input.sources.filter((source) => !source.sourceUrl.trim()).length;
  const turnoutWarningRows = input.turnoutRows.filter((row) => row.warningRequired).length;
  const reviewIsPartial =
    input.reviewRows.length > 0 && input.results.length > 0 && new Set(input.reviewRows.map((row) => row.jurisdictionCode)).size < input.results.length;
  const reviewModes = [...reviewCoverageModes(input.reviewRows)];
  const reviewModeEvidence = reviewModes.length ? `Coverage mode: ${reviewModes.join(" - ")}.` : null;
  const reviewCountyLevelIssue = countyLevelReviewIssue(input.reviewRows);
  const eacTurnoutFallback = input.turnoutRows.some((row) => row.sourceId.toLowerCase().includes("eac"));
  const verifiedVotingEquipment = input.equipmentRows.some((row) => row.sourceId.toLowerCase().includes("verified-voting"));
  const equipmentRegistryStatus = input.adminSourceStatus?.equipment?.status;
  const legacyOnly = input.completeness ? input.completeness.legacyImportCount > 0 && input.completeness.nativeImportCount === 0 : false;
  const mapGeometrySourceCount =
    input.completeness?.mapGeometrySourceCount ?? input.sources.filter(isMapGeometrySource).length;
  const hasResultRows = input.results.length > 0;
  const mapIsReady = Boolean(hasResultRows && capabilities?.map && mapGeometrySourceCount > 0);
  const mapIsPartial = Boolean(hasResultRows && (capabilities?.map || mapGeometrySourceCount > 0));

  const sections: DataNoteSection[] = [
    {
      detail: input.results.length
        ? `${input.results.length.toLocaleString()} result rows across ${(input.coverage?.loadedJurisdictions ?? input.results.length).toLocaleString()} jurisdictions.`
        : "No certified result rows are loaded for this state.",
      evidence: input.completeness?.sourceTier ? `Source tier: ${input.completeness.sourceTier.replaceAll("_", " ")}` : "Source tier not recorded.",
      key: "results",
      label: "Results",
      status: dataNoteStatus(input.results.length > 0, capabilities?.certifiedResults),
      why: input.results.length
        ? "Official result rows are present. Review still depends on the linked source documents and validation notes."
        : "The importer has not received a normalized official results package for this state yet.",
    },
    {
      detail: `${input.sources.length.toLocaleString()} source document record${input.sources.length === 1 ? "" : "s"}.`,
      evidence: sourceUrlGaps ? `${sourceUrlGaps.toLocaleString()} source URL${sourceUrlGaps === 1 ? "" : "s"} missing.` : "All loaded source records expose URLs.",
      key: "sources",
      label: "Sources",
      status: input.sources.length && !sourceUrlGaps ? "ready" : input.sources.length ? "partial" : "missing",
      why: input.sources.length
        ? sourceUrlGaps
          ? "Some source records were imported before direct public URLs were recorded, so they need source-link cleanup."
          : "Source records are present and link back to auditable public documents."
        : "No source manifest has been loaded for this state yet.",
    },
    {
      detail: mapIsReady
        ? `County map geometry is available from ${mapGeometrySourceCount.toLocaleString()} loaded geometry source${mapGeometrySourceCount === 1 ? "" : "s"}.`
        : !hasResultRows
          ? "Result-map geometry is unavailable until certified result rows are loaded."
          : capabilities?.map
            ? "A map capability flag exists, but no loaded geometry source is tracked."
            : "Map geometry is not available for this state.",
      evidence: input.coverage?.validation.warnings.length
        ? input.coverage.validation.warnings.join(" - ")
        : mapIsReady
          ? "No map-join warning is currently reported."
          : !hasResultRows
            ? "There are no loaded result rows to join to map boundaries."
            : "Loaded county geometry source evidence is missing.",
      key: "map",
      label: "Map",
      status: mapIsReady ? (input.coverage?.validation.passed === false ? "partial" : "ready") : mapIsPartial ? "partial" : "missing",
      why: mapIsReady
        ? "The map can be used, but any join warning means boundaries and result rows should be checked before relying on shading."
        : !hasResultRows
          ? "Collect certified result rows before treating boundary geometry or equipment geography as a result map."
          : capabilities?.map
            ? "The database map flag is not enough by itself; a loaded geometry source must be tracked before this state should appear map-ready."
            : "County boundary geometry or name matching has not been validated for this state yet.",
    },
    {
      detail: input.reviewRows.length
        ? `${input.reviewRows.length.toLocaleString()} local review rows and ${input.completeness?.countyIndicatorCount ?? input.completeness?.indicatorCount ?? 0} county advisory flags.`
        : "No local review rows are loaded.",
      evidence:
        importWarnings.find((warning) => warning.toLowerCase().includes("review")) ??
        reviewCountyLevelIssue ??
        reviewModeEvidence ??
        (legacyOnly ? "Legacy-only review bundle." : "Review import status inferred from row counts."),
      key: "review",
      label: "Review",
      status: dataNoteStatus(input.reviewRows.length > 0, capabilities?.reviewGraphs, Boolean(reviewCountyLevelIssue) || reviewIsPartial || legacyOnly),
      why: input.reviewRows.length
        ? reviewCountyLevelIssue
          ? reviewCountyLevelIssue
          : reviewIsPartial
          ? "Review rows exist, but they do not cover every loaded result jurisdiction, so charts are screening views rather than complete statewide coverage."
          : legacyOnly
            ? "Review data is loaded from a legacy bundle; use it as context until a newer source-first native parser is available."
            : "Local review rows are loaded and available for advisory screening."
        : "The app needs precinct, ward, municipality, or comparable local reporting-unit rows before it can build review charts.",
    },
    {
      detail: input.turnoutRows.length
        ? `${input.turnoutRows.length.toLocaleString()} turnout rows; ${turnoutWarningRows.toLocaleString()} denominator warning rows.`
        : "No turnout denominator rows are loaded.",
      evidence: eacTurnoutFallback ? "Rows reference EAC fallback data." : "Turnout source status inferred from row counts.",
      key: "turnout",
      label: "Turnout",
      status: dataNoteStatus(input.turnoutRows.length > 0, capabilities?.turnout, eacTurnoutFallback || turnoutWarningRows > 0),
      why: input.turnoutRows.length
        ? eacTurnoutFallback
          ? "Turnout is using EAC fallback rows because a state-native denominator source has not been fully mapped yet."
          : turnoutWarningRows
            ? "Some denominator rows need review because registered-voter counts are missing or zero."
            : "Turnout rows include ballots cast and registered-voter denominators."
        : "The importer still needs an official registered-voter denominator source before turnout charts can be considered ready.",
    },
    {
      detail: input.voteMethodRows.length
        ? `${input.voteMethodRows.length.toLocaleString()} EAC participation-method rows.`
        : "No vote-method rows are loaded.",
      evidence: "Candidate-by-method is blocked unless an official source reports candidate totals split by method.",
      key: "vote-methods",
      label: "Vote Methods",
      status: input.voteMethodRows.length ? "partial" : "missing",
      why: input.voteMethodRows.length
        ? "EAC participation rows show how voters cast ballots, but they cannot be multiplied into Harris/Trump method totals."
        : "EAC participation-method extraction has not been loaded for this state yet.",
    },
    {
      detail: input.equipmentRows.length
        ? `${input.equipmentRows.length.toLocaleString()} equipment-context rows; registry status: ${adminStatusLabel(equipmentRegistryStatus)}.`
        : "No election equipment context rows are loaded.",
      evidence: verifiedVotingEquipment
        ? "Rows reference Verified Voting Verifier equipment data across the national 2024 registry."
        : "Equipment context status inferred from row counts.",
      key: "equipment",
      label: "Equipment",
      status: input.equipmentRows.length ? "partial" : adminQualityStatus(equipmentRegistryStatus),
      why: input.equipmentRows.length
        ? `Equipment rows document administration context by jurisdiction. They are useful for clustering checks, but they are not vote or turnout rows and cannot prove causation. Still missing: ${adminFamilyWhy(input.adminSourceStatus, "audit")} ${adminFamilyWhy(input.adminSourceStatus, "cvr")} ${adminFamilyWhy(input.adminSourceStatus, "incidents")}`
        : "The app still needs a normalized equipment source, usually Verified Voting Verifier or official state/county equipment records.",
    },
    {
      detail: input.historicalRows.length
        ? `${input.historicalRows.length.toLocaleString()} historical baseline rows.`
        : "No historical baseline rows are loaded.",
      evidence: input.historicalRows.length ? "Historical rows are available for comparison charts." : "Historical backfill remains pending.",
      key: "history",
      label: "History",
      status: dataNoteStatus(input.historicalRows.length > 0, capabilities?.historicalBaseline),
      why: input.historicalRows.length
        ? "Historical context is available, but it remains context and should not be treated as evidence by itself."
        : "The historical official-result backfill has not been loaded for this state yet.",
    },
  ];

  return applyStateDataNoteOverrides(input.stateCode, sections);
}

function buildVoteShareScatterDiagnostic(input: {
  importRuns: ImportRunSummary[];
  jurisdictionName: string;
  resultJurisdictions: number;
  reviewJurisdictions: number;
  rows: ReviewRowSummary[];
  scatterRows: ReviewRowSummary[];
  stateCode: string;
}): ChartQualityDiagnostic {
  const checked: string[] = [];
  const issues: string[] = [];
  const sourceIds = new Set(input.rows.map((row) => row.sourceId).filter(Boolean));
  const shareMismatchRows = input.rows.filter((row) => {
    const harrisDelta = percentDelta(row.harrisShare, row.harrisVotes, row.totalVotes);
    const trumpDelta = percentDelta(row.trumpShare, row.trumpVotes, row.totalVotes);
    return (harrisDelta !== null && harrisDelta > 0.15) || (trumpDelta !== null && trumpDelta > 0.15);
  });
  const missingInputRows = input.rows.filter(
    (row) =>
      row.harrisVotes === null ||
      row.trumpVotes === null ||
      row.totalVotes === null ||
      row.harrisShare === null ||
      row.trumpShare === null,
  );
  const nonPositiveRows = input.rows.filter(
    (row) => (row.harrisVotes ?? 0) <= 0 || (row.trumpVotes ?? 0) <= 0 || (row.totalVotes ?? 0) <= 0,
  );

  if (input.scatterRows.length > 0) {
    checked.push(`${input.scatterRows.length.toLocaleString()} rows have both candidate vote counts and vote shares.`);
  }

  if (shareMismatchRows.length === 0) {
    checked.push("Stored Harris and Trump shares match candidate votes divided by total row votes within 0.15 percentage points.");
  } else {
    issues.push(
      `${shareMismatchRows.length.toLocaleString()} rows have stored vote shares that do not match the loaded vote totals.`,
    );
  }

  if (missingInputRows.length > 0) {
    issues.push(`${missingInputRows.length.toLocaleString()} rows are missing candidate votes, total votes, or stored shares.`);
  }

  if (nonPositiveRows.length > 0) {
    issues.push(`${nonPositiveRows.length.toLocaleString()} rows have zero or non-positive candidate/total vote values and are omitted.`);
  }

  const countyIssue = countyLevelReviewIssue(input.rows);
  if (countyIssue) {
    issues.push(countyIssue);
  }

  if (input.resultJurisdictions > 0 && input.reviewJurisdictions < input.resultJurisdictions) {
    issues.push(
      `Review rows exist for ${input.reviewJurisdictions.toLocaleString()} of ${input.resultJurisdictions.toLocaleString()} loaded result jurisdictions, so this is not statewide coverage.`,
    );
  } else if (input.resultJurisdictions > 0) {
    checked.push("Every loaded result jurisdiction has at least one review row.");
  }

  if (sourceIds.size === 0 || sourceIds.has("database")) {
    issues.push("One or more rows do not expose a linked source document id.");
  } else {
    checked.push(`Rows reference ${sourceIds.size.toLocaleString()} source document id${sourceIds.size === 1 ? "" : "s"}.`);
  }

  if (hasLegacyImport(input.importRuns) && !hasNativeImport(input.importRuns)) {
    issues.push("This state is still using the legacy static review bundle, not a newer source-first native parser.");
  } else if (hasNativeImport(input.importRuns)) {
    checked.push("A native/source-first import run is present for this state.");
  }

  let status: ChartQualityStatus = "ready";
  if (input.scatterRows.length === 0) {
    status = "blocked";
    issues.unshift("No rows are currently drawable for this scatterplot.");
  } else if (issues.length > 0 || input.scatterRows.length < 10) {
    status = "acknowledgement_required";
    if (input.scatterRows.length > 0 && input.scatterRows.length < 10) {
      issues.push("Fewer than 10 drawable rows are available, so the trend line is fragile.");
    }
  }

  return {
    acknowledgementKey: `scatter:${input.stateCode}:${input.jurisdictionName}:${input.rows.length}:${input.scatterRows.length}`,
    checked,
    issues,
    rowCount: input.scatterRows.length,
    status,
    summary:
      status === "ready"
        ? "This plot passed the app's row-level arithmetic and coverage checks. It is still a screening view, not evidence by itself."
        : "This plot has data-quality limits for the selected state or jurisdiction. Read the specific missing items before using it.",
    title: `${input.jurisdictionName} vote-share scatter`,
  };
}

function buildDropoffDiagnostic(input: {
  importRuns: ImportRunSummary[];
  jurisdictionName: string;
  resultJurisdictions: number;
  reviewJurisdictions: number;
  rows: ReviewRowSummary[];
  stateCode: string;
}): ChartQualityDiagnostic {
  const checked: string[] = [];
  const issues: string[] = [];
  const drawableRows = input.rows.filter(
    (row) =>
      row.demDropoff !== null &&
      row.repDropoff !== null &&
      Number.isFinite(row.demDropoff) &&
      Number.isFinite(row.repDropoff),
  );
  const missingRows = input.rows.length - drawableRows.length;
  const sourceIds = new Set(input.rows.map((row) => row.sourceId).filter(Boolean));

  if (drawableRows.length > 0) {
    checked.push(`${drawableRows.length.toLocaleString()} rows have both DEM and REP comparison drop-off values.`);
  }

  if (missingRows > 0) {
    issues.push(`${missingRows.toLocaleString()} rows are missing one or both comparison-contest drop-off values.`);
  }

  const countyIssue = countyLevelReviewIssue(input.rows);
  if (countyIssue) {
    issues.push(countyIssue);
  }

  if (input.resultJurisdictions > 0 && input.reviewJurisdictions < input.resultJurisdictions) {
    issues.push(
      `Review rows exist for ${input.reviewJurisdictions.toLocaleString()} of ${input.resultJurisdictions.toLocaleString()} loaded result jurisdictions, so this is not statewide coverage.`,
    );
  } else if (input.resultJurisdictions > 0) {
    checked.push("Every loaded result jurisdiction has at least one review row.");
  }

  if (sourceIds.size === 0 || sourceIds.has("database")) {
    issues.push("One or more rows do not expose a linked source document id.");
  } else {
    checked.push(`Rows reference ${sourceIds.size.toLocaleString()} source document id${sourceIds.size === 1 ? "" : "s"}.`);
  }

  if (hasLegacyImport(input.importRuns) && !hasNativeImport(input.importRuns)) {
    issues.push("This state is still using the legacy static review bundle, not a newer source-first native parser.");
  } else if (hasNativeImport(input.importRuns)) {
    checked.push("A native/source-first import run is present for this state.");
  }

  let status: ChartQualityStatus = "ready";
  if (drawableRows.length === 0) {
    status = "blocked";
    issues.unshift("No rows are currently drawable for this histogram.");
  } else if (issues.length > 0 || drawableRows.length < 10) {
    status = "acknowledgement_required";
    if (drawableRows.length > 0 && drawableRows.length < 10) {
      issues.push("Fewer than 10 drawable rows are available, so the distribution is fragile.");
    }
  }

  return {
    acknowledgementKey: `dropoff:${input.stateCode}:${input.jurisdictionName}:${drawableRows.length}`,
    checked,
    issues,
    rowCount: drawableRows.length,
    status,
    summary:
      status === "ready"
        ? "This histogram passed the app's row availability and coverage checks. It is still a screening view, not evidence by itself."
        : "This histogram has data-quality limits for the selected state or jurisdiction. Read the specific missing items before using it.",
    title: `${input.jurisdictionName} drop-off histogram`,
  };
}

function ChartQualityNotice({ diagnostic }: { diagnostic: ChartQualityDiagnostic }) {
  return (
    <div className={`chart-quality-notice ${diagnostic.status}`} role="status">
      <div>
        <span>{chartStatusLabel(diagnostic.status)}</span>
        <strong>{diagnostic.summary}</strong>
      </div>
      {diagnostic.issues.length > 0 && (
        <ul>
          {diagnostic.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {diagnostic.checked.length > 0 && (
        <details>
          <summary>Automated checks that passed</summary>
          <ul>
            {diagnostic.checked.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ChartGate({
  acknowledged,
  diagnostic,
  onAcknowledge,
}: {
  acknowledged: boolean;
  diagnostic: ChartQualityDiagnostic;
  onAcknowledge: () => void;
}) {
  if (diagnostic.status === "ready" || acknowledged) {
    return null;
  }

  return (
    <div className="screening-chart-gate" data-tour="chart-caveat-gate">
      <TriangleAlert aria-hidden size={22} />
      <strong>{diagnostic.status === "blocked" ? "This chart cannot be evaluated yet" : "Read this before viewing"}</strong>
      <p>{diagnostic.summary}</p>
      {diagnostic.issues.length > 0 && (
        <ul>
          {diagnostic.issues.slice(0, 4).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {diagnostic.status !== "blocked" && (
        <button className="secondary-button" onClick={onAcknowledge} type="button">
          I acknowledge these limits
        </button>
      )}
    </div>
  );
}

function DataNotesPanel({
  dataIssueUrl,
  isCollapsed,
  notes,
  onToggle,
  stateName,
}: {
  dataIssueUrl: string;
  isCollapsed: boolean;
  notes: DataNoteSection[];
  onToggle: () => void;
  stateName: string;
}) {
  const limitedCount = notes.filter((note) => note.status !== "ready").length;

  return (
    <aside
      className={`workspace-notes ${isCollapsed ? "is-collapsed" : ""}`}
      data-tour="data-notes"
      aria-label={`${stateName} data notes`}
    >
      <button
        aria-expanded={!isCollapsed}
        className="notes-rail-button"
        onClick={onToggle}
        type="button"
      >
        <BookOpen aria-hidden size={16} />
        <span>Data Notes</span>
        {limitedCount > 0 && <strong>{limitedCount}</strong>}
      </button>
      <section className="panel data-notes-panel" aria-label={`${stateName} data notes detail`}>
        <div className="panel-header">
          <div>
            <h2>Data Notes</h2>
            <span>What is present, what is partial, and why missing pieces are not here yet</span>
          </div>
          <div className="header-actions">
            <Eli5>
              This is the health label for the selected state. It explains which data families are loaded and why a
              missing section is missing instead of leaving people to guess.
            </Eli5>
            <button className="secondary-button" onClick={onToggle} type="button">
              <BookOpen aria-hidden size={14} />
              Collapse
            </button>
            <a className="secondary-link" data-tour="report-data-issue" href={dataIssueUrl} rel="noreferrer" target="_blank">
              Report Data Issue
            </a>
          </div>
        </div>
        <div className="data-note-grid">
          {notes.map((note) => (
            <article className={`data-note-card ${note.status}`} key={note.key}>
              <div className="data-note-head">
                <strong>{note.label}</strong>
                <QualityBadge detail={note.detail} status={note.status} />
              </div>
              <p>{note.detail}</p>
              <span>{note.evidence}</span>
              <div>
                <span className="section-label">Why this is missing or limited</span>
                <p>{note.why}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

function dateLabel(value: string | null) {
  if (!value) {
    return "Not finished";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkspaceTabs({
  adminSourceStatus,
  electronicIntegrityStatus,
  electronicIntegrityRequests,
  sourceRecordsRequests,
  coverage,
  countyLabel,
  equipmentRows,
  securityIncidents,
  historicalRows,
  importRuns,
  indicators,
  reviewRows,
  results,
  statewideResultRows,
  selectedCompleteness,
  selectedState,
  selectedStateCode,
  sources,
  totalVotes,
  turnoutRows,
  voteMethodRows,
}: WorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("map");
  const [copiedElectronicDraft, setCopiedElectronicDraft] = useState(false);
  const [copiedSourceRecordsDraft, setCopiedSourceRecordsDraft] = useState(false);
  const [enabledScreeningGraphs, setEnabledScreeningGraphs] = useState<ScreeningGraphType[]>([
    "voteShareScatter",
    "dropoffHistogram",
  ]);
  const [screeningJurisdiction, setScreeningJurisdiction] = useState("");
  const [enabledHistoricalYears, setEnabledHistoricalYears] = useState<number[]>([]);
  const [enabledHistoricalGraphs, setEnabledHistoricalGraphs] = useState<HistoricalGraphType[]>([
    "share",
    "margin",
    "movement",
    "klimek",
    "shpilkin",
  ]);
  const [acknowledgedChartKeys, setAcknowledgedChartKeys] = useState<string[]>([]);
  const [requestGuideOpen, setRequestGuideOpen] = useState(false);
  const [isDataNotesCollapsed, setIsDataNotesCollapsed] = useState(true);
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewType, setReviewType] = useState("all");
  const [reviewView, setReviewView] = useState<ReviewView>("overview");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && tabs.some((item) => item.key === tab)) {
      setActiveTab(tab);
    }
  }, []);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("state", selectedStateCode);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  };

  const syncReviewTourStep = (step: TourStep) => {
    if (step.reviewView && reviewViewOptions.some((option) => option.key === step.reviewView)) {
      setReviewView(step.reviewView as ReviewView);
    }
  };

  const stateName = selectedState?.name ?? selectedStateCode;
  const indicatorTypes = useMemo(
    () => Array.from(new Set(indicators.map((indicator) => indicator.type))).sort(),
    [indicators],
  );

  const filteredIndicators = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();
    return indicators.filter((indicator) => {
      const typeMatches = reviewType === "all" || indicator.type === reviewType;
      const queryMatches =
        !query ||
        indicator.jurisdictionName.toLowerCase().includes(query) ||
        indicator.label.toLowerCase().includes(query) ||
        indicator.summary.toLowerCase().includes(query);
      return typeMatches && queryMatches;
    });
  }, [indicators, reviewQuery, reviewType]);

  const countyIndicators = useMemo(() => indicators.filter((indicator) => indicator.level === "county"), [indicators]);
  const flaggedCountyCount = useMemo(
    () => new Set(countyIndicators.map((indicator) => indicator.jurisdictionCode)).size,
    [countyIndicators],
  );
  const flaggedAreaCount = useMemo(
    () => new Set(indicators.map((indicator) => `${indicator.level}:${indicator.jurisdictionCode}`)).size,
    [indicators],
  );

  const groupedIndicatorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const indicator of indicators) {
      counts.set(indicator.label, (counts.get(indicator.label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [indicators]);

  const reviewJurisdictionOptions = useMemo(() => {
    const counts = new Map<string, { jurisdictionName: string; rows: number }>();

    for (const row of reviewRows) {
      const current = counts.get(row.jurisdictionCode) ?? {
        jurisdictionName: row.jurisdictionName,
        rows: 0,
      };
      current.rows += 1;
      counts.set(row.jurisdictionCode, current);
    }

    return Array.from(counts.entries())
      .map(([jurisdictionCode, entry]) => ({
        jurisdictionCode,
        jurisdictionName: entry.jurisdictionName,
        rows: entry.rows,
      }))
      .sort((a, b) => b.rows - a.rows || a.jurisdictionName.localeCompare(b.jurisdictionName));
  }, [reviewRows]);

  useEffect(() => {
    const fallback = reviewJurisdictionOptions[0]?.jurisdictionCode ?? "";
    setScreeningJurisdiction((current) =>
      current && reviewJurisdictionOptions.some((option) => option.jurisdictionCode === current) ? current : fallback,
    );
  }, [reviewJurisdictionOptions]);

  const selectedReviewRows = useMemo(
    () => reviewRows.filter((row) => row.jurisdictionCode === screeningJurisdiction),
    [reviewRows, screeningJurisdiction],
  );
  const selectedReviewJurisdiction = reviewJurisdictionOptions.find(
    (option) => option.jurisdictionCode === screeningJurisdiction,
  );
  const reviewGraphCoverageIsPartial =
    reviewRows.length > 0 && reviewJurisdictionOptions.length < Math.max(1, results.length);
  const reviewLimitation = countyLevelReviewIssue(reviewRows);
  const selectedReviewJurisdictionName = selectedReviewJurisdiction?.jurisdictionName ?? stateName;
  const screeningGraphOptions: Array<{ key: ScreeningGraphType; label: string }> = [
    { key: "voteShareScatter", label: "Vote-Share Scatterplot" },
    { key: "dropoffHistogram", label: "Drop-Off Histogram" },
  ];
  const scatterRows = selectedReviewRows.filter(
    (row) =>
      (row.harrisVotes ?? 0) > 0 &&
      (row.trumpVotes ?? 0) > 0 &&
      normalizePct(row.harrisShare) !== null &&
      normalizePct(row.trumpShare) !== null,
  );
  const scatterMaxVotes = Math.max(
    1,
    ...scatterRows.flatMap((row) => [row.harrisVotes ?? 0, row.trumpVotes ?? 0]),
  );
  const harrisScatterPoints = scatterRows.map((row) => ({
    id: row.id,
    label: row.localUnit,
    votes: row.harrisVotes ?? 0,
    x: row.harrisVotes ?? 0,
    y: normalizePct(row.harrisShare) ?? 0,
  }));
  const trumpScatterPoints = scatterRows.map((row) => ({
    id: row.id,
    label: row.localUnit,
    votes: row.trumpVotes ?? 0,
    x: row.trumpVotes ?? 0,
    y: normalizePct(row.trumpShare) ?? 0,
  }));
  const harrisTrend = linearRegression(harrisScatterPoints);
  const trumpTrend = linearRegression(trumpScatterPoints);
  const scatterDiagnostic = buildVoteShareScatterDiagnostic({
    importRuns,
    jurisdictionName: selectedReviewJurisdictionName,
    resultJurisdictions: results.length,
    reviewJurisdictions: reviewJurisdictionOptions.length,
    rows: selectedReviewRows,
    scatterRows,
    stateCode: selectedStateCode,
  });
  const dropoffDiagnostic = buildDropoffDiagnostic({
    importRuns,
    jurisdictionName: selectedReviewJurisdictionName,
    resultJurisdictions: results.length,
    reviewJurisdictions: reviewJurisdictionOptions.length,
    rows: selectedReviewRows,
    stateCode: selectedStateCode,
  });
  const statewideTicketSplitSummary = useMemo(() => buildTicketSplitSummary(reviewRows), [reviewRows]);
  const selectedTicketSplitSummary = useMemo(() => buildTicketSplitSummary(selectedReviewRows), [selectedReviewRows]);
  const ticketSplitComparisonLabel = statewideTicketSplitSummary.comparisonContests.length
    ? statewideTicketSplitSummary.comparisonContests.join(" - ")
    : "No comparison contest loaded";
  const reviewElectionYearLabel = reviewRows[0]?.electionYear ?? "selected election";
  const scatterAcknowledged = acknowledgedChartKeys.includes(scatterDiagnostic.acknowledgementKey);
  const dropoffAcknowledged = acknowledgedChartKeys.includes(dropoffDiagnostic.acknowledgementKey);
  const acknowledgeChart = (key: string) => {
    setAcknowledgedChartKeys((current) => (current.includes(key) ? current : [...current, key]));
  };
  const dropoffBucketSize = 5;
  const dropoffBuckets = Array.from({ length: 13 }, (_, index) => {
    const low = -30 + index * dropoffBucketSize;
    return {
      dem: 0,
      high: low + dropoffBucketSize,
      label: `${low}% to ${low + dropoffBucketSize}%`,
      low,
      rep: 0,
    };
  });

  for (const row of selectedReviewRows) {
    const demDropoff = normalizePct(row.demDropoff);
    const repDropoff = normalizePct(row.repDropoff);

    for (const [key, value] of [
      ["dem", demDropoff],
      ["rep", repDropoff],
    ] as const) {
      if (value === null) {
        continue;
      }

      const bucketIndex = clamp(Math.floor((clamp(value, -30, 30) + 30) / dropoffBucketSize), 0, dropoffBuckets.length - 1);
      dropoffBuckets[bucketIndex][key] += 1;
    }
  }

  const maxDropoffBucket = Math.max(1, ...dropoffBuckets.flatMap((bucket) => [bucket.dem, bucket.rep]));

  const candidateTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of statewideResultRows) {
      for (const [candidate, votes] of Object.entries(row.votes)) {
        totals.set(candidate, (totals.get(candidate) ?? 0) + votes);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [statewideResultRows]);

  const historicalYears = useMemo(
    () => Array.from(new Set(historicalRows.map((row) => row.electionYear))).sort((a, b) => a - b),
    [historicalRows],
  );

  useEffect(() => {
    setEnabledHistoricalYears(historicalYears);
  }, [historicalYears.join(" - ")]);

  const historicalYearSummaries = useMemo(() => {
    const summaries = new Map<
      number,
      {
        demVotes: number;
        otherVotes: number;
        repVotes: number;
        rows: number;
        sourceIds: Set<string>;
        totalVotes: number;
      }
    >();

    for (const row of historicalRows) {
      const summary = summaries.get(row.electionYear) ?? {
        demVotes: 0,
        otherVotes: 0,
        repVotes: 0,
        rows: 0,
        sourceIds: new Set<string>(),
        totalVotes: 0,
      };
      summary.demVotes += row.demVotes ?? 0;
      summary.repVotes += row.repVotes ?? 0;
      summary.otherVotes += row.otherVotes ?? 0;
      summary.totalVotes += row.totalVotes ?? 0;
      summary.rows += 1;
      summary.sourceIds.add(row.sourceId);
      summaries.set(row.electionYear, summary);
    }

    return Array.from(summaries.entries())
      .map(([year, summary]) => {
        const marginVotes = Math.abs(summary.demVotes - summary.repVotes);
        const winner = summary.demVotes >= summary.repVotes ? "Democratic" : "Republican";
        return {
          ...summary,
          marginPct: summary.totalVotes > 0 ? (marginVotes / summary.totalVotes) * 100 : 0,
          marginVotes,
          sourceCount: summary.sourceIds.size,
          winner,
          year,
        };
      })
      .sort((a, b) => b.year - a.year);
  }, [historicalRows]);

  const visibleHistoricalYearSet = useMemo(
    () => new Set(enabledHistoricalYears),
    [enabledHistoricalYears],
  );
  const filteredHistoricalSummaries = historicalYearSummaries.filter((summary) => visibleHistoricalYearSet.has(summary.year));
  const filteredHistoricalRows = historicalRows.filter((row) => visibleHistoricalYearSet.has(row.electionYear));
  const visibleHistoricalRows = filteredHistoricalRows.slice(0, 150);
  const maxHistoricalMargin = Math.max(1, ...filteredHistoricalSummaries.map((summary) => summary.marginPct));
  const historicalGraphOptions: Array<{ key: HistoricalGraphType; label: string }> = [
    { key: "share", label: "Vote Share" },
    { key: "margin", label: "Margin Trend" },
    { key: "movement", label: "County Movement" },
    { key: "klimek", label: "Klimek Fingerprints" },
    { key: "shpilkin", label: "Shpilkin Diagnostics" },
  ];
  const historicalCountyTrends = useMemo(() => {
    const rowsByCounty = new Map<string, HistoricalResultRowSummary[]>();

    for (const row of filteredHistoricalRows) {
      rowsByCounty.set(row.jurisdictionName, [...(rowsByCounty.get(row.jurisdictionName) ?? []), row]);
    }

    return Array.from(rowsByCounty.entries())
      .map(([county, rows]) => {
        const sorted = rows.sort((a, b) => a.electionYear - b.electionYear);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstDemShare = first?.totalVotes ? ((first.demVotes ?? 0) / first.totalVotes) * 100 : 0;
        const lastDemShare = last?.totalVotes ? ((last.demVotes ?? 0) / last.totalVotes) * 100 : 0;
        return {
          county,
          demShareChange: lastDemShare - firstDemShare,
          rows: sorted,
          totalVotes: sorted.reduce((sum, row) => sum + (row.totalVotes ?? 0), 0),
        };
      })
      .filter((trend) => trend.rows.length >= 2)
      .sort((a, b) => Math.abs(b.demShareChange) - Math.abs(a.demShareChange))
      .slice(0, 12);
  }, [filteredHistoricalRows]);
  const historicalRowsByYear = useMemo(() => {
    const rowsByYear = new Map<number, HistoricalResultRowSummary[]>();

    for (const row of filteredHistoricalRows) {
      rowsByYear.set(row.electionYear, [...(rowsByYear.get(row.electionYear) ?? []), row]);
    }

    return Array.from(rowsByYear.entries())
      .map(([year, rows]) => ({
        maxTotalVotes: Math.max(1, ...rows.map((row) => row.totalVotes ?? 0)),
        rows: rows
          .filter((row) => (row.totalVotes ?? 0) > 0)
          .sort((a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0)),
        year,
      }))
      .sort((a, b) => a.year - b.year);
  }, [filteredHistoricalRows]);
  const shpilkinRowsByYear = useMemo(
    () =>
      historicalRowsByYear.map((yearGroup) => {
        const buckets = Array.from({ length: 10 }, (_, index) => {
          const low = index * 10;
          const high = low + 10;
          const rows = yearGroup.rows.filter((row) => {
            const demShare = row.totalVotes ? ((row.demVotes ?? 0) / row.totalVotes) * 100 : 0;
            return index === 9 ? demShare >= low && demShare <= high : demShare >= low && demShare < high;
          });
          const totalVotes = rows.reduce((sum, row) => sum + (row.totalVotes ?? 0), 0);
          const demVotes = rows.reduce((sum, row) => sum + (row.demVotes ?? 0), 0);
          const repVotes = rows.reduce((sum, row) => sum + (row.repVotes ?? 0), 0);
          return {
            demVotes,
            high,
            label: `${low}-${high}%`,
            low,
            repVotes,
            rows: rows.length,
            totalVotes,
          };
        });

        return {
          buckets,
          maxBucketVotes: Math.max(1, ...buckets.map((bucket) => bucket.totalVotes)),
          year: yearGroup.year,
        };
      }),
    [historicalRowsByYear],
  );
  const topIndicators = filteredIndicators.slice(0, 6);
  const voteMethodSummaries = useMemo(() => {
    const summaries = new Map<
      string,
      {
        label: string;
        reportedRows: number;
        totalVoters: number;
        unavailableRows: number;
        voters: number;
      }
    >();

    for (const row of voteMethodRows) {
      const current = summaries.get(row.method) ?? {
        label: row.methodLabel,
        reportedRows: 0,
        totalVoters: 0,
        unavailableRows: 0,
        voters: 0,
      };
      if (row.valueStatus === "reported" && row.voters !== null) {
        current.reportedRows += 1;
        current.voters += row.voters;
        current.totalVoters += row.totalVoters ?? 0;
      } else {
        current.unavailableRows += 1;
      }
      summaries.set(row.method, current);
    }

    return Array.from(summaries.entries())
      .map(([method, summary]) => ({
        ...summary,
        method,
        share: summary.totalVoters > 0 ? (summary.voters / summary.totalVoters) * 100 : null,
      }))
      .sort((a, b) => b.voters - a.voters);
  }, [voteMethodRows]);
  const voteMethodJurisdictions = new Set(voteMethodRows.map((row) => row.jurisdictionCode || row.jurisdictionName)).size;
  const voteMethodUnavailableRows = voteMethodRows.filter((row) => row.valueStatus !== "reported").length;
  const equipmentJurisdictions = new Set(equipmentRows.map((row) => row.jurisdictionCode || row.jurisdictionName)).size;
  const equipmentUniformityWarnings = equipmentRows.filter((row) => row.uniformityWarningRequired).length;
  const electronicArtifacts = electronicIntegrityStatus?.artifacts ?? [];
  const electronicLoadedArtifacts = electronicArtifacts.filter((artifact) => artifact.status === "loaded").length;
  const electronicRequestRequired = electronicArtifacts.filter((artifact) => artifact.requestRequired).length;
  const electronicCvrArtifact = electronicArtifacts.find((artifact) => artifact.type === "cast_vote_records");
  const electronicAuditArtifact = electronicArtifacts.find((artifact) => artifact.type === "audit_results");
  const electronicRequestArtifacts = electronicArtifacts.filter((artifact) => artifact.requestRequired);
  const electronicRequestRows = electronicIntegrityRequests.requests;
  const electronicRequestQueueCount = electronicRequestRows.length;
  const electronicDraftFiles = electronicIntegrityRequests.summary.draftFiles;
  const electronicStateDraft = electronicDraftFiles.find((draft) => draft.state === selectedStateCode);
  const electronicRequestStatusCounts = electronicRequestRows.reduce<Record<string, number>>((counts, request) => {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
    return counts;
  }, {});
  const sourceRecordsRequestRows = sourceRecordsRequests.requests;
  const sourceRecordsRequestQueueCount = sourceRecordsRequestRows.length;
  const totalRecordsRequestQueueCount = electronicRequestQueueCount + sourceRecordsRequestQueueCount;
  const sourceRecordsDraftFiles = sourceRecordsRequests.summary.draftFiles;
  const sourceRecordsStateDraft = sourceRecordsDraftFiles.find((draft) => draft.state === selectedStateCode);
  const sourceRecordsRequestStatusCounts = sourceRecordsRequestRows.reduce<Record<string, number>>((counts, request) => {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
    return counts;
  }, {});

  const copyElectronicDraft = async () => {
    if (!electronicStateDraft?.emailBody) return;
    try {
      await navigator.clipboard.writeText(electronicStateDraft.emailBody);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = electronicStateDraft.emailBody;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedElectronicDraft(true);
    window.setTimeout(() => setCopiedElectronicDraft(false), 2200);
  };

  const copySourceRecordsDraft = async () => {
    if (!sourceRecordsStateDraft?.emailBody) return;
    try {
      await navigator.clipboard.writeText(sourceRecordsStateDraft.emailBody);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = sourceRecordsStateDraft.emailBody;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedSourceRecordsDraft(true);
    window.setTimeout(() => setCopiedSourceRecordsDraft(false), 2200);
  };
  const electronicStatusCounts = electronicArtifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.status] = (counts[artifact.status] ?? 0) + 1;
    return counts;
  }, {});
  const equipmentDiagnostics = useMemo(
    () => equipmentClusterDiagnostics({ equipmentRows, indicators, reviewRowCount: reviewRows.length }).slice(0, 8),
    [equipmentRows, indicators, reviewRows.length],
  );
  const equipmentVendorSummaries = useMemo(() => {
    const summaries = new Map<
      string,
      {
        jurisdictions: Set<string>;
        pollBooks: Set<string>;
        systems: Set<string>;
        vendor: string;
      }
    >();

    for (const row of equipmentRows) {
      const key = row.vendor || "Not recorded";
      const current =
        summaries.get(key) ??
        {
          jurisdictions: new Set<string>(),
          pollBooks: new Set<string>(),
          systems: new Set<string>(),
          vendor: key,
        };
      current.jurisdictions.add(row.jurisdictionCode || row.jurisdictionName);
      if (row.systemName) {
        current.systems.add(row.systemName);
      }
      if (row.pollBookSystem) {
        current.pollBooks.add(row.pollBookSystem);
      }
      summaries.set(key, current);
    }

    return Array.from(summaries.values())
      .map((summary) => ({
        jurisdictionCount: summary.jurisdictions.size,
        pollBookCount: summary.pollBooks.size,
        systemCount: summary.systems.size,
        vendor: summary.vendor,
      }))
      .sort((a, b) => b.jurisdictionCount - a.jurisdictionCount || a.vendor.localeCompare(b.vendor));
  }, [equipmentRows]);
  const capabilityEntries = coverage
    ? Object.entries(coverage.capabilities).filter(([key]) => key !== "notes")
    : [];
  const pendingCapabilities = capabilityEntries.filter(([, value]) => !value);
  const readyCapabilities = capabilityEntries.filter(([, value]) => value);
  const selectedImportRuns = importRuns.filter((run) => run.state === selectedStateCode);
  const latestRun = selectedImportRuns[0];
  const sourcesWithoutUrls = sources.filter((source) => !source.sourceUrl.trim());
  const currentImportIsLegacyOnly = hasLegacyImport(selectedImportRuns) && !hasNativeImport(selectedImportRuns);
  const reviewCompletenessIssues = [
    reviewGraphCoverageIsPartial
      ? `Review charts cover ${reviewJurisdictionOptions.length.toLocaleString()} of ${results.length.toLocaleString()} loaded result jurisdictions, so this is not complete statewide chart coverage.`
      : "",
    reviewLimitation ?? "",
    currentImportIsLegacyOnly ? "This state is still using a legacy static review bundle rather than a source-first native parser." : "",
  ].filter(Boolean) as string[];
  const flagMixDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `flag-mix:${selectedStateCode}:${groupedIndicatorCounts.length}:${reviewRows.length}:${results.length}` ,
    checked: reviewCompletenessIssues.length ? [] : ["Flag mix uses the currently loaded advisory indicators for this state."],
    issues: reviewCompletenessIssues,
    rowCount: groupedIndicatorCounts.length,
    status: groupedIndicatorCounts.length === 0 ? "blocked" : reviewCompletenessIssues.length ? "acknowledgement_required" : "ready",
    summary:
      reviewCompletenessIssues.length > 0
        ? "This flag-mix chart is based on partial or caveated review data. Read the limits before interpreting the counts."
        : "This flag-mix chart is based on the currently loaded advisory indicators for the selected state.",
    title: `${stateName} flag mix`,
  });
  const historicalContextDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `history-context:${selectedStateCode}:${filteredHistoricalRows.length}:${enabledHistoricalYears.join(" - ")}` ,
    checked: [`${filteredHistoricalRows.length.toLocaleString()} historical baseline rows are loaded for the enabled years.`],
    issues: [
      "Historical baseline charts are context views, not a complete audit or ballot-accounting record.",
      "They should not be used as evidence by themselves, especially when source coverage or turnout denominators are missing.",
    ],
    rowCount: filteredHistoricalRows.length,
    status: filteredHistoricalRows.length ? "acknowledgement_required" : "blocked",
    summary: "Historical charts use contextual baseline rows. Read the source and coverage limits before comparing years.",
    title: `${stateName} historical context charts`,
  });
  const klimekProxyDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `klimek-proxy:${selectedStateCode}:${filteredHistoricalRows.length}:${enabledHistoricalYears.join(" - ")}` ,
    checked: [`${historicalRowsByYear.length.toLocaleString()} enabled year panels can be drawn.`],
    issues: [
      "This is a proxy graph, not a complete Klimek fingerprint.",
      "It uses county vote volume because true turnout percentages are not imported for these historical rows.",
      "Do not interpret it as a complete turnout-fingerprint test.",
    ],
    rowCount: historicalRowsByYear.reduce((sum, yearGroup) => sum + yearGroup.rows.length, 0),
    status: historicalRowsByYear.length ? "acknowledgement_required" : "blocked",
    summary: "This Klimek-style view uses proxy inputs. Read the limits before viewing the fingerprint panels.",
    title: `${stateName} Klimek-style proxy fingerprints`,
  });
  const shpilkinProxyDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `shpilkin-proxy:${selectedStateCode}:${filteredHistoricalRows.length}:${enabledHistoricalYears.join(" - ")}` ,
    checked: [`${shpilkinRowsByYear.length.toLocaleString()} enabled year panels can be drawn.`],
    issues: [
      "This groups county vote volume by vote-share buckets, not precinct-level or ballot-level distributions.",
      "It does not replace turnout-based review or official source reconciliation when those data are missing.",
    ],
    rowCount: shpilkinRowsByYear.reduce((sum, yearGroup) => sum + yearGroup.buckets.length, 0),
    status: shpilkinRowsByYear.length ? "acknowledgement_required" : "blocked",
    summary: "This Shpilkin-style diagnostic uses limited county-level inputs. Read the limits before viewing the bucket charts.",
    title: `${stateName} Shpilkin-style diagnostics`,
  });
  const voteMethodDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `vote-method:${selectedStateCode}:${voteMethodRows.length}:${voteMethodUnavailableRows}` ,
    checked: voteMethodRows.length ? [`${voteMethodRows.length.toLocaleString()} participation-method rows are loaded.`] : [],
    issues: [
      "EAC participation-method rows describe how voters cast ballots; they do not split candidate votes by method.",
      voteMethodUnavailableRows ? `${voteMethodUnavailableRows.toLocaleString()} method rows have unavailable values.` : "",
    ].filter(Boolean) as string[],
    rowCount: voteMethodRows.length,
    status: voteMethodRows.length ? "acknowledgement_required" : "blocked",
    summary: "Vote-method charts are partial context only. Read the limits before using them beside candidate results.",
    title: `${stateName} vote-method context`,
  });
  const equipmentContextDiagnostic = staticChartDiagnostic({
    acknowledgementKey: `equipment-context:${selectedStateCode}:${equipmentRows.length}:${equipmentDiagnostics.length}` ,
    checked: equipmentRows.length ? [`${equipmentRows.length.toLocaleString()} equipment-context rows are loaded.`] : [],
    issues: [
      "Equipment charts are administration context only; they do not prove causation for vote patterns.",
      "They may not prove every precinct inside a county used the same setup.",
      equipmentUniformityWarnings ? `${equipmentUniformityWarnings.toLocaleString()} rows carry uniformity warning notes.` : "",
    ].filter(Boolean) as string[],
    rowCount: equipmentRows.length,
    status: equipmentRows.length ? "acknowledgement_required" : "blocked",
    summary: "Equipment charts are partial context. Read the limits before comparing equipment groups to flagged jurisdictions.",
    title: `${stateName} equipment context`,
  });
  const flagMixAcknowledged = acknowledgedChartKeys.includes(flagMixDiagnostic.acknowledgementKey);
  const historicalContextAcknowledged = acknowledgedChartKeys.includes(historicalContextDiagnostic.acknowledgementKey);
  const klimekProxyAcknowledged = acknowledgedChartKeys.includes(klimekProxyDiagnostic.acknowledgementKey);
  const shpilkinProxyAcknowledged = acknowledgedChartKeys.includes(shpilkinProxyDiagnostic.acknowledgementKey);
  const voteMethodAcknowledged = acknowledgedChartKeys.includes(voteMethodDiagnostic.acknowledgementKey);
  const equipmentContextAcknowledged = acknowledgedChartKeys.includes(equipmentContextDiagnostic.acknowledgementKey);
  const dataNoteSections = buildDataNoteSections({
    adminSourceStatus,
    completeness: selectedCompleteness,
    coverage,
    historicalRows,
    importRuns: selectedImportRuns,
    equipmentRows,
    results,
    reviewRows,
    sources,
    stateCode: selectedStateCode,
    turnoutRows,
    voteMethodRows,
  });
  const evidenceReadiness = useMemo(
    () =>
      buildEvidenceReadinessDimensions({
        adminSourceStatus,
        coverage,
        dataNotes: dataNoteSections,
        electronicIntegrityStatus,
        historicalRows,
        indicators,
        reviewRows,
        sourceRecordsRequestRows,
        sources,
        turnoutRows,
      }),
    [
      adminSourceStatus,
      coverage,
      dataNoteSections,
      electronicIntegrityStatus,
      historicalRows,
      indicators,
      reviewRows,
      sourceRecordsRequestRows,
      sources,
      turnoutRows,
    ],
  );
  const evidenceReadinessScorePct = Math.round(evidenceReadiness.score * 100);
  const evidenceGapPriorities = evidenceReadiness.dimensions
    .filter((dimension) => dimension.score < 1)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const flagExplanations = useMemo(
    () =>
      topIndicators.slice(0, 3).map((indicator) =>
        buildFlagExplanation({
          dataNotes: dataNoteSections,
          indicator,
          reviewRows,
          sources,
        }),
      ),
    [dataNoteSections, reviewRows, sources, topIndicators],
  );
  const dataIssueUrl = buildReportIssueUrl({
    context: "Selected state workspace",
    sourceUrl: sources[0]?.sourceUrl || undefined,
    stateCode: selectedStateCode,
    stateName,
  });
  const reviewIssueUrl = buildReportIssueUrl({
    chart: "Review Center",
    context: "Review Center",
    jurisdiction: selectedReviewJurisdictionName,
    sourceUrl: sources[0]?.sourceUrl || undefined,
    stateCode: selectedStateCode,
    stateName,
  });
  const recordsResponseUrl = buildRecordsResponseUrl({
    custodian: electronicRequestRows[0]?.primaryCustodian,
    requestId: electronicRequestRows[0]?.requestId,
    stateCode: selectedStateCode,
    stateName,
  });
  const sourceRecordsResponseUrl = buildRecordsResponseUrl({
    custodian: sourceRecordsRequests.contacts[0]?.primaryCustodian,
    requestId: sourceRecordsRequestRows[0]?.requestId,
    stateCode: selectedStateCode,
    stateName,
  });
  const validationChecks = [
    {
      detail: `${coverage?.loadedJurisdictions ?? results.length} loaded jurisdictions`,
      label: "Result rows loaded",
      passed: results.length > 0,
    },
    {
      detail: `${sources.length} source document record${sources.length === 1 ? "" : "s"}`,
      label: "Source provenance",
      passed: sources.length > 0,
    },
    {
      detail: coverage?.validation.passed ? "Coverage summary passes" : "Coverage summary has gaps",
      label: "Coverage validation",
      passed: Boolean(coverage?.validation.passed),
    },
    {
      detail: "Covered by npm run validate:maps before release",
      label: "Map join validation",
      passed: Boolean(selectedState?.capabilities.map),
    },
    {
      detail: indicators.length ? `${indicators.length} indicators loaded` : "Waiting on review rows",
      label: "Review data",
      passed: indicators.length > 0,
    },
  ];

  const workspaceTourSteps = useMemo(
    () =>
      buildWorkspaceTourSteps({
        hasCoverage: Boolean(coverage),
        hasElectronicDraft: Boolean(electronicStateDraft),
        hasElectronicRequestRows: electronicRequestRows.length > 0,
        hasSourceRecordsDraft: Boolean(sourceRecordsStateDraft),
        hasSourceRecordsRequestRows: sourceRecordsRequestRows.length > 0,
        hasHistoricalRows: historicalRows.length > 0,
        hasImportRuns: selectedImportRuns.length > 0,
        hasResults: results.length > 0,
        hasReviewRows: reviewRows.length > 0,
        hasSources: sources.length > 0,
        hasVoteMethodRows: voteMethodRows.length > 0,
        hasEquipmentRows: equipmentRows.length > 0,
        stateName,
      }),
    [
      coverage,
      electronicRequestRows.length,
      electronicStateDraft,
      sourceRecordsRequestRows.length,
      sourceRecordsStateDraft,
      historicalRows.length,
      results.length,
      reviewRows.length,
      selectedImportRuns.length,
      sources.length,
      stateName,
      voteMethodRows.length,
      equipmentRows.length,
    ],
  );
  const exportSlug = `${selectedStateCode.toLowerCase()}-2024-president`;
  const resultExportHeaders = ["jurisdiction", "winner", "harris", "trump", "other", "total", "margin_votes", "margin_pct", "source"];
  const resultExportRows = results.map((row) => [
    row.jurisdictionName,
    row.winner,
    row.votes.Harris ?? 0,
    row.votes.Trump ?? 0,
    row.votes.Other ?? 0,
    row.totalVotes,
    row.marginVotes,
    row.marginPct,
    row.sourceId,
  ]);
  const indicatorExportHeaders = ["jurisdiction", "label", "type", "severity", "summary", "detail"];
  const indicatorExportRows = indicators.map((indicator) => [
    indicator.jurisdictionName,
    indicator.label,
    indicator.type,
    indicator.severity,
    indicator.summary,
    indicator.detail,
  ]);
  const reviewRowExportHeaders = [
    "jurisdiction",
    "local_unit",
    "level",
    "harris_votes",
    "trump_votes",
    "total_votes",
    "harris_share",
    "trump_share",
    "dem_dropoff",
    "rep_dropoff",
    "source",
  ];
  const reviewRowExportRows = reviewRows.map((row) => [
    row.jurisdictionName,
    row.localUnit,
    row.level,
    row.harrisVotes ?? "",
    row.trumpVotes ?? "",
    row.totalVotes ?? "",
    row.harrisShare ?? "",
    row.trumpShare ?? "",
    row.demDropoff ?? "",
    row.repDropoff ?? "",
    row.sourceId,
  ]);
  const turnoutExportHeaders = [
    "jurisdiction",
    "level",
    "ballots_cast",
    "registered_voters",
    "turnout_pct",
    "denominator_note",
    "warning_required",
    "source",
  ];
  const turnoutExportRows = turnoutRows.map((row) => [
    row.jurisdictionName,
    row.level,
    row.ballotsCast,
    row.registeredVoters ?? "",
    row.turnoutPct ?? "",
    row.denominatorNote,
    row.warningRequired ? "true" : "false",
    row.sourceId,
  ]);
  const historicalExportHeaders = [
    "year",
    "jurisdiction",
    "local_unit",
    "source_level",
    "dem_votes",
    "rep_votes",
    "other_votes",
    "total_votes",
    "source",
  ];
  const historicalExportRows = historicalRows.map((row) => [
    row.electionYear,
    row.jurisdictionName,
    row.localUnit,
    row.sourceLevel,
    row.demVotes ?? "",
    row.repVotes ?? "",
    row.otherVotes ?? "",
    row.totalVotes ?? "",
    row.sourceId,
  ]);
  const sourceExportHeaders = ["category", "title", "authority", "source_url", "local_artifact", "parser", "timestamp_basis", "confidence", "status"];
  const sourceExportRows = sources.map((source) => [
    source.category,
    source.title,
    source.authority,
    source.sourceUrl,
    source.localArtifact,
    source.parser,
    source.timestampBasis,
    source.confidence,
    source.status,
  ]);
  const coverageExportHeaders = ["state", "expected_jurisdictions", "loaded_jurisdictions", "result_rows", "sources", "validation", "warnings"];
  const coverageExportRows = [
    [
      selectedStateCode,
      coverage?.expectedJurisdictions ?? "",
      coverage?.loadedJurisdictions ?? results.length,
      coverage?.resultRows ?? results.length,
      coverage?.sourceCount ?? sources.length,
      coverage?.validation.passed ? "pass" : "gap",
      coverage?.validation.warnings.join(" - ") ?? "",
    ],
  ];
  const voteMethodExportHeaders = [
    "jurisdiction",
    "county",
    "method",
    "method_label",
    "voters",
    "method_share_pct",
    "total_voters",
    "value_status",
    "source_field",
  ];
  const voteMethodExportRows = voteMethodRows.map((row) => [
    row.jurisdictionName,
    row.county,
    row.method,
    row.methodLabel,
    row.voters ?? "",
    row.methodSharePct ?? "",
    row.totalVoters ?? "",
    row.valueStatus,
    row.sourceField,
  ]);
  const equipmentExportHeaders = [
    "jurisdiction",
    "level",
    "vendor",
    "system_name",
    "equipment_type",
    "usage",
    "paper_record",
    "standard_system",
    "accessible_system",
    "absentee_system",
    "poll_book_system",
    "tabulation",
    "registered_voters",
    "precincts",
    "polling_places",
    "source_granularity",
    "uniformity_warning_required",
    "uniformity_note",
    "configuration_signals",
    "source",
    "source_url",
  ];
  const equipmentExportRows = equipmentRows.map((row) => [
    row.jurisdictionName,
    row.level,
    row.vendor,
    row.systemName,
    row.equipmentType,
    row.usage,
    row.paperRecord,
    row.standardSystem,
    row.accessibleSystem,
    row.absenteeSystem,
    row.pollBookSystem,
    row.tabulation,
    row.registeredVoters ?? "",
    row.precincts ?? "",
    row.pollingPlaces ?? "",
    row.sourceGranularity,
    row.uniformityWarningRequired ? "true" : "false",
    row.uniformityNote,
    row.configurationSignals.join(" - "),
    row.sourceId,
    row.sourceUrl,
  ]);
  const sourceManifest = {
    dataNotes: dataNoteSections,
    equipmentDiagnostics,
    generatedAt: new Date().toISOString(),
    sources,
    state: selectedStateCode,
    stateName,
    year: 2024,
  };
  const importSummary = {
    completeness: selectedCompleteness ?? null,
    coverage,
    dataNotes: dataNoteSections,
    equipmentDiagnostics,
    latestRun: latestRun ?? null,
    selectedImportRuns,
    state: selectedStateCode,
    stateName,
    year: 2024,
  };

  const exportResults = () =>
    downloadCsv(
      `${exportSlug}-results.csv`,
      resultExportHeaders,
      resultExportRows,
    );

  const exportIndicators = () =>
    downloadCsv(
      `${exportSlug}-review-indicators.csv`,
      indicatorExportHeaders,
      indicatorExportRows,
    );

  const exportReviewRows = () =>
    downloadCsv(`${exportSlug}-review-rows.csv`, reviewRowExportHeaders, reviewRowExportRows);

  const exportTurnoutRows = () =>
    downloadCsv(`${exportSlug}-turnout.csv`, turnoutExportHeaders, turnoutExportRows);

  const exportHistoricalRows = () =>
    downloadCsv(`${exportSlug}-historical-rows.csv`, historicalExportHeaders, historicalExportRows);

  const exportSources = () =>
    downloadCsv(
      `${exportSlug}-sources.csv`,
      sourceExportHeaders,
      sourceExportRows,
    );

  const exportCoverage = () =>
    downloadCsv(
      `${exportSlug}-coverage.csv`,
      coverageExportHeaders,
      coverageExportRows,
    );

  const exportVoteMethods = () =>
    downloadCsv(
      `${exportSlug}-vote-methods.csv`,
      voteMethodExportHeaders,
      voteMethodExportRows,
    );

  const exportEquipmentRows = () =>
    downloadCsv(
      `${exportSlug}-equipment-context.csv`,
      equipmentExportHeaders,
      equipmentExportRows,
    );

  const exportSourceManifest = () =>
    downloadTextFile(`${exportSlug}-source-manifest.json`, jsonContent(sourceManifest), "application/json;charset=utf-8");

  const exportImportSummary = () =>
    downloadTextFile(`${exportSlug}-import-summary.json`, jsonContent(importSummary), "application/json;charset=utf-8");

  const exportReviewPackage = async () => {
    const zip = new JSZip();
    const readme = [
      `Civic Result Maps review package for ${stateName} (${selectedStateCode}), 2024 President`,
      "",
      "Use these normalized files with the source manifest. Advisory flags and screening charts are triage prompts, not proof by themselves.",
      "",
      "Included files:",
      "- results.csv",
      "- review-indicators.csv",
      "- review-rows.csv",
      "- turnout.csv",
      "- vote-methods.csv",
      "- equipment-context.csv",
      "- historical-rows.csv",
      "- sources.csv",
      "- coverage.csv",
      "- source-manifest.json",
      "- import-summary.json",
      "",
      "Data notes:",
      ...dataNoteSections.map((note) => `- ${note.label}: ${qualityBadgeLabel(note.status)}. ${note.why}`),
      "",
    ].join(" - ");

    zip.file("README.txt", readme);
    zip.file("results.csv", csvContent(resultExportHeaders, resultExportRows));
    zip.file("review-indicators.csv", csvContent(indicatorExportHeaders, indicatorExportRows));
    zip.file("review-rows.csv", csvContent(reviewRowExportHeaders, reviewRowExportRows));
    zip.file("turnout.csv", csvContent(turnoutExportHeaders, turnoutExportRows));
    zip.file("vote-methods.csv", csvContent(voteMethodExportHeaders, voteMethodExportRows));
    zip.file("equipment-context.csv", csvContent(equipmentExportHeaders, equipmentExportRows));
    zip.file("historical-rows.csv", csvContent(historicalExportHeaders, historicalExportRows));
    zip.file("sources.csv", csvContent(sourceExportHeaders, sourceExportRows));
    zip.file("coverage.csv", csvContent(coverageExportHeaders, coverageExportRows));
    zip.file("source-manifest.json", jsonContent(sourceManifest));
    zip.file("import-summary.json", jsonContent(importSummary));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${exportSlug}-review-package.zip`, [blob], "application/zip");
  };

  const downloadSvgElement = (elementId: string, filename: string) => {
    const svg = document.getElementById(elementId);
    if (!svg) {
      return;
    }

    const content = new XMLSerializer().serializeToString(svg);
    downloadTextFile(filename, content, "image/svg+xml;charset=utf-8");
  };

  const screeningSlug = `${selectedStateCode.toLowerCase()}-${screeningJurisdiction.toLowerCase() || "review"}`;
  const scatterSvgId = `${screeningSlug}-vote-share-scatter`;
  const dropoffSvgId = `${screeningSlug}-dropoff-histogram`;
  const scatterX = (votes: number) => 52 + (votes / scatterMaxVotes) * 438;
  const scatterY = (share: number) => 246 - (share / 100) * 210;
  const trendY = (trend: { intercept: number; slope: number } | null, x: number) =>
    trend ? scatterY(clamp(trend.intercept + trend.slope * x, 0, 100)) : null;

  return (
    <section className="workspace-tabs" data-tour="workspace" aria-label={`${stateName} workspace`}>
      <nav className="tab-bar" data-tour="tab-bar" aria-label="Workspace sections">
        <GuidedTour activeTab={activeTab} onSelectTab={selectTab} onStepChange={syncReviewTourStep} steps={workspaceTourSteps} />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              aria-selected={activeTab === tab.key}
              className="tab-button"
              data-tour={`tab-${tab.key}`}
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              type="button"
            >
              <Icon aria-hidden size={16} />
              <span>{tab.label}</span>
              {tab.key === "electronic" && totalRecordsRequestQueueCount > 0 && (
                <span className="tab-alert-badge" aria-label={`${totalRecordsRequestQueueCount} records requests need review`}>
                  {totalRecordsRequestQueueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className={`workspace-body ${isDataNotesCollapsed ? "notes-collapsed" : ""}`}>
        <main className="workspace-main">
          {activeTab === "map" && (
        <div className="tab-panel-content">
          <div className="content-grid">
            <ResultsExplorer
              countyLabel={countyLabel}
              equipmentRows={equipmentRows}
              securityIncidents={securityIncidents}
              indicators={indicators}
              results={results}
              reviewRows={reviewRows}
              selectedState={selectedStateCode}
              sources={sources}
              voteMethodRows={voteMethodRows}
            />
            <div className="detail-stack">
              <section className="panel" aria-label="Provenance">
                <div className="panel-header">
                  <div>
                    <h2>Source Provenance</h2>
                    <span>Authority, parser, and confidence</span>
                  </div>
                  <div className="header-actions">
                    <Eli5>
                      This is the ingredient label for the data. It says where the numbers came from, what parser read
                      them, and how confident the import record is.
                    </Eli5>
                    <QualityBadge
                      detail={sourcesWithoutUrls.length ? "Some source URLs are missing." : "Source records expose auditable URLs."}
                      status={sources.length && !sourcesWithoutUrls.length ? "ready" : sources.length ? "partial" : "missing"}
                    />
                    <FileCheck2 aria-hidden size={18} />
                  </div>
                </div>
                <ul className="source-list">
                  {sources.map((source) => (
                    <li key={source.id}>
                      <strong>{source.title}</strong>
                      <span>{source.confidence}</span>
                      <span className="mono">{source.parser}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="panel" aria-label="Coverage flags">
                <div className="panel-header">
                  <div>
                    <h2>Coverage</h2>
                    <span>Loaded platform capabilities</span>
                  </div>
                  <div className="header-actions">
                    <Eli5>
                      This is like a checklist for the selected state. Available means the app has that kind of data;
                      pending means the importer has not received enough rows for that feature.
                    </Eli5>
                    <QualityBadge
                      detail={pendingCapabilities.length ? `${pendingCapabilities.length} capabilities are pending.` : "All tracked capabilities are marked available."}
                      status={pendingCapabilities.length ? "partial" : "ready"}
                    />
                    <ShieldCheck aria-hidden size={18} />
                  </div>
                </div>
                <ul className="flag-list">
                  {coverage &&
                    capabilityEntries.map(([key, value]) => (
                      <li key={key}>
                        <strong>{formatCapability(key)}</strong>
                        <span className={value ? "available" : "pending"}>{statusLabel(Boolean(value))}</span>
                      </li>
                    ))}
                </ul>
              </section>

              <section className="panel" aria-label="Statewide vote breakdown">
                <div className="panel-header">
                  <div>
                    <h2>State Snapshot</h2>
                    <span>Candidate totals and vote share</span>
                  </div>
                  <div className="header-actions">
                    <Eli5>
                      This is the quick scoreboard. The bars show how the selected state's imported votes split across
                      candidates, like counting colored blocks in one big box.
                    </Eli5>
                    <QualityBadge
                      detail={results.length ? "Certified result rows are loaded." : "No result rows are loaded."}
                      status={results.length ? "ready" : "missing"}
                    />
                    <Database aria-hidden size={18} />
                  </div>
                </div>
                <div className="candidate-bars">
                  {candidateTotals.map(([candidate, votes]) => (
                    <div className="candidate-bar-row" key={candidate}>
                      <div>
                        <strong>{candidate}</strong>
                        <span>
                          {votes.toLocaleString()} - {pct(votes, totalVotes)}
                        </span>
                      </div>
                      <i
                        className={
                          candidate === "Harris"
                            ? "candidate-bar-harris"
                            : candidate === "Trump"
                              ? "candidate-bar-trump"
                              : "candidate-bar-other"
                        }
                        style={{ width: `${Math.max(4, totalVotes ? (votes / totalVotes) * 100 : 0)}%` }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {activeTab === "review" && (
        <div className="tab-panel-content">
          <section className="panel review-center-panel" data-tour="review-panel">
            <div className="panel-header review-center-header">
              <div>
                <h2>Review Center</h2>
                <span>{countyIndicators.length} county indicators and {indicators.length} total advisory indicators for {stateName}</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This section is like a smoke alarm, not a verdict. It shows patterns that deserve a closer look, such
                  as unusual vote-share or drop-off patterns, and then lists the places connected to those patterns.
                </Eli5>
                <QualityBadge
                  detail={reviewRows.length ? "Local review rows are loaded for screening." : "No local review rows are loaded."}
                  status={reviewRows.length ? (reviewGraphCoverageIsPartial ? "partial" : "ready") : "missing"}
                />
                <a className="secondary-link" data-tour="report-review-issue" href={reviewIssueUrl} rel="noreferrer" target="_blank">
                  Report Data Issue
                </a>
                <BarChart3 aria-hidden size={18} />
              </div>
            </div>
            <div className="review-subnav" data-tour="review-subnav" role="tablist" aria-label="Review Center views">
              {reviewViewOptions.map((option) => (
                <button
                  aria-selected={reviewView === option.key}
                  className="review-subnav-button"
                  key={option.key}
                  onClick={() => setReviewView(option.key)}
                  role="tab"
                  type="button"
                >
                  <span>{option.label}</span>
                  <small>{option.summary}</small>
                </button>
              ))}
            </div>
            {reviewView === "overview" && (
              <section className="review-view-panel review-overview" data-tour="review-overview" aria-label="Review overview">
            <div className="review-summary-grid">
              <article>
                <span>Flagged counties</span>
                <strong>{flaggedCountyCount}</strong>
              </article>
              <article>
                <span>Flagged areas</span>
                <strong>{flaggedAreaCount}</strong>
              </article>
              <article>
                <span>Indicators</span>
                <strong>{indicators.length}</strong>
              </article>
              <article>
                <span>Highest severity</span>
                <strong>{indicators[0]?.severity.toFixed(2) ?? "0.00"}</strong>
              </article>
            </div>
                <div className="review-overview-grid">
                  <article className="review-overview-card review-readiness-card">
                    <div>
                      <span className="section-label">Review readiness</span>
                      <strong>{evidenceReadiness.label}</strong>
                      <p>Start here before interpreting advisory flags. The score measures source-backed review support, not risk or proof.</p>
                    </div>
                    <div className="readiness-score compact" data-tour="overview-readiness-score">
                      <span>Readiness</span>
                      <strong>{evidenceReadinessScorePct}%</strong>
                      <small>{evidenceReadiness.blockerCount.toLocaleString()} blocker{evidenceReadiness.blockerCount === 1 ? "" : "s"}</small>
                    </div>
                    <button className="secondary-button" onClick={() => setReviewView("tools")} type="button">
                      <ShieldCheck aria-hidden size={15} />
                      Open Evidence Tools
                    </button>
                  </article>
                  <article className="review-overview-card">
                    <div>
                      <span className="section-label">Top advisory flags</span>
                      <strong>{topIndicators.length ? "Review these first" : "No current advisory flags"}</strong>
                    </div>
                    {topIndicators.length ? (
                      <div className="review-overview-list">
                        {topIndicators.slice(0, 3).map((indicator) => (
                          <button className="review-overview-row" key={indicator.id} onClick={() => setReviewView("indicators")} type="button">
                            <span className="indicator-pill">! {indicator.label}</span>
                            <strong>{indicator.jurisdictionName}</strong>
                            <small>{indicatorScopeLabel(indicator)} - {severityBucket(indicator.severity)}</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>No advisory indicators crossed the current thresholds. Check Evidence Tools for coverage gaps.</p>
                    )}
                  </article>
                  <article className="review-overview-card">
                    <div>
                      <span className="section-label">Highest-impact gaps</span>
                      <strong>{evidenceGapPriorities.length ? "Collect or verify next" : "No major readiness gaps"}</strong>
                    </div>
                    {evidenceGapPriorities.length ? (
                      <ol className="review-overview-gap-list">
                        {evidenceGapPriorities.slice(0, 4).map((gap) => (
                          <li key={gap.label}>
                            <span>{gap.label}</span>
                            <p>{gap.why}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>Current loaded evidence covers the readiness dimensions tracked by this tool. Continue source-row review before making claims.</p>
                    )}
                  </article>
                  <article className="review-overview-card">
                    <div>
                      <span className="section-label">Next best actions</span>
                      <strong>Choose a focused workspace</strong>
                    </div>
                    <div className="review-action-stack">
                      <button onClick={() => setReviewView("tools")} type="button">Evidence Tools<span>Explain readiness, source gaps, and top flags.</span></button>
                      <button onClick={() => setReviewView("screening")} type="button">Screening<span>Review charts, caveats, and ticket-splitting proxy.</span></button>
                      <button onClick={() => setReviewView("indicators")} type="button">Indicators<span>Search, filter, and inspect advisory rows.</span></button>
                      <button onClick={() => setReviewView("methodology")} type="button">Methodology<span>Check formulas, thresholds, and common explanations.</span></button>
                    </div>
                  </article>
                  <article className="review-overview-card review-flag-mix-card" data-tour="review-flag-mix">
                    <div>
                      <span className="section-label">Flag mix</span>
                      <strong>Counts by advisory indicator type</strong>
                    </div>
                    <ChartQualityNotice diagnostic={flagMixDiagnostic} />
                    <div className={`screening-chart-shell ${flagMixDiagnostic.status !== "ready" && !flagMixAcknowledged ? "is-gated" : ""}`}>
                      <div className="chart-gate-frame">
                        <div className="mini-bars compact-mini-bars">
                          {groupedIndicatorCounts.length ? (
                            groupedIndicatorCounts.map(([label, count]) => (
                              <div className="mini-bar-row" key={label}>
                                <span>{label}</span>
                                <strong>{count}</strong>
                                <i style={{ width: `${Math.max(8, (count / indicators.length) * 100)}%` }} />
                              </div>
                            ))
                          ) : (
                            <div className="empty-state compact">
                              <strong>{reviewRows.length ? "No advisory flags generated" : "Waiting on review data"}</strong>
                              <span>
                                {reviewRows.length
                                  ? reviewLimitation ?? "No loaded review rows crossed the current advisory thresholds."
                                  : "Expected path: reviewCharts.metadata.rows in the state bundle."}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <ChartGate
                        acknowledged={flagMixAcknowledged}
                        diagnostic={flagMixDiagnostic}
                        onAcknowledge={() => acknowledgeChart(flagMixDiagnostic.acknowledgementKey)}
                      />
                    </div>
                  </article>
                </div>
              </section>
            )}
            {reviewView === "tools" && (
              <section className="review-view-panel" data-tour="review-tools-view" aria-label="Evidence tools">
            <section className="evidence-toolkit" aria-label="Evidence review toolkit" data-tour="evidence-toolkit">
              <div className="evidence-toolkit-head">
                <div>
                  <span className="section-label">Evidence Review Toolkit</span>
                  <strong>{evidenceReadiness.label}</strong>
                  <p>
                    These tools rank whether the selected state can support responsible advisory review. They identify
                    source gaps and follow-up priorities; they do not allege wrongdoing or assign intent.
                  </p>
                </div>
                <div className="readiness-score" data-tour="evidence-readiness-score">
                  <span>Readiness</span>
                  <strong>{evidenceReadinessScorePct}%</strong>
                  <small>{evidenceReadiness.blockerCount.toLocaleString()} blocker{evidenceReadiness.blockerCount === 1 ? "" : "s"}</small>
                </div>
              </div>
              <div className="evidence-dimension-grid">
                {evidenceReadiness.dimensions.map((dimension) => (
                  <article className={`evidence-dimension ${dimension.status}`} key={dimension.label}>
                    <div>
                      <span>{dimension.label}</span>
                      <QualityBadge detail={dimension.detail} status={dimension.status} />
                    </div>
                    <strong>{Math.round(dimension.score * 100)}%</strong>
                    <p>{dimension.why}</p>
                  </article>
                ))}
              </div>
              <div className="evidence-tool-split">
                <section className="evidence-gap-panel" data-tour="evidence-gap-priorities" aria-label="Highest impact remaining evidence gaps">
                  <div>
                    <span className="section-label">Highest-impact remaining gaps</span>
                    <strong>{evidenceGapPriorities.length ? "Collect or verify these next" : "No major readiness gaps detected"}</strong>
                  </div>
                  {evidenceGapPriorities.length ? (
                    <ol>
                      {evidenceGapPriorities.map((gap) => (
                        <li key={gap.label}>
                          <span>{gap.label}</span>
                          <p>{gap.why}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Current loaded evidence covers the readiness dimensions tracked by this tool. Continue source-row review before making claims.</p>
                  )}
                </section>
                <section className="flag-explain-panel" data-tour="flag-explainability-panel" aria-label="Flag explainability panel">
                  <div>
                    <span className="section-label">Flag Explainability Panel</span>
                    <strong>{flagExplanations.length ? "Why the top flags exist" : "No advisory flags to explain"}</strong>
                  </div>
                  {flagExplanations.length ? (
                    <div className="flag-explain-list">
                      {flagExplanations.map((explanation) => (
                        <article key={`${explanation.jurisdiction}-${explanation.label}`}>
                          <div>
                            <span className="indicator-pill">! {explanation.label}</span>
                            <strong>{explanation.jurisdiction}</strong>
                            <small>{explanation.scope} - {explanation.priority}</small>
                          </div>
                          <p>{explanation.summary}</p>
                          <dl>
                            <div>
                              <dt>Source context</dt>
                              <dd>{explanation.sourceContext}</dd>
                            </div>
                            <div>
                              <dt>Denominator context</dt>
                              <dd>{explanation.denominatorContext}</dd>
                            </div>
                            <div>
                              <dt>Audit context</dt>
                              <dd>{explanation.auditContext}</dd>
                            </div>
                            <div>
                              <dt>Still needed</dt>
                              <dd>{explanation.missingEvidence.slice(0, 3).join(" - ")}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>No advisory indicators crossed the current thresholds. If review rows are missing, use the readiness gaps above to prioritize collection.</p>
                  )}
                </section>
              </div>
            </section>
              </section>
            )}
            {reviewView === "screening" && (
              <section className="review-view-panel" data-tour="review-screening-view" aria-label="Screening charts">
            {reviewRows.length ? (
              <section className="screening-section" aria-label="Statistical screening graphs">
                <div className="screening-toolbar">
                  <label className="sort-select-label" htmlFor="screening-jurisdiction">
                    <MapIcon aria-hidden size={16} />
                    <select
                      className="sort-select"
                      id="screening-jurisdiction"
                      onChange={(event) => setScreeningJurisdiction(event.target.value)}
                      value={screeningJurisdiction}
                    >
                      {reviewJurisdictionOptions.map((option) => (
                        <option key={option.jurisdictionCode} value={option.jurisdictionCode}>
                          {option.jurisdictionName} ({option.rows} rows)
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="history-controls graph-controls compact-controls" aria-label="Screening graph toggles">
                    <span>Show screening graphs</span>
                    {screeningGraphOptions.map((option) => (
                      <label key={option.key}>
                        <input
                          checked={enabledScreeningGraphs.includes(option.key)}
                          onChange={(event) => {
                            setEnabledScreeningGraphs((graphs) =>
                              event.target.checked
                                ? [...graphs, option.key]
                                : graphs.filter((entry) => entry !== option.key),
                            );
                          }}
                          type="checkbox"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                {reviewGraphCoverageIsPartial && (
                  <div className="data-warning strong-warning" role="status">
                    <TriangleAlert aria-hidden size={18} />
                    <div>
                      <strong>Partial screening data</strong>
                      <span>
                        These graphs cover {reviewJurisdictionOptions.length.toLocaleString()} of{" "}
                        {results.length.toLocaleString()} result jurisdictions with local review rows. Use them as
                        advisory screening views, not statewide precinct coverage.
                      </span>
                    </div>
                  </div>
                )}

                <div className="ticket-split-panel" data-tour="ticket-splitting">
                  <div>
                    <span className="section-label">Ticket-Splitting Proxy</span>
                    <strong>President vs comparison contest</strong>
                    <p>
                      This summarizes the loaded same-row drop-off values for {stateName} {reviewElectionYearLabel}.
                      Positive values mean the presidential candidate ran ahead of the same-party comparison candidate in the
                      loaded review rows.
                    </p>
                  </div>
                  {statewideTicketSplitSummary.rowCount > 0 ? (
                    <>
                      <div className="export-summary-grid ticket-split-summary">
                        <article>
                          <span>Comparison contest</span>
                          <strong>{ticketSplitComparisonLabel}</strong>
                        </article>
                        <article>
                          <span>Rows with values</span>
                          <strong>{statewideTicketSplitSummary.rowCount.toLocaleString()}</strong>
                        </article>
                        <article>
                          <span>State avg DEM gap</span>
                          <strong>{formatSignedPct(statewideTicketSplitSummary.averageDemDropoff)}</strong>
                        </article>
                        <article>
                          <span>State avg REP gap</span>
                          <strong>{formatSignedPct(statewideTicketSplitSummary.averageRepDropoff)}</strong>
                        </article>
                        <article>
                          <span>DEM ahead rows</span>
                          <strong>{statewideTicketSplitSummary.demAheadRows.toLocaleString()}</strong>
                        </article>
                        <article>
                          <span>REP ahead rows</span>
                          <strong>{statewideTicketSplitSummary.repAheadRows.toLocaleString()}</strong>
                        </article>
                        <article>
                          <span>
                            {">= "}
                            {statewideTicketSplitSummary.thresholdPct}
                            {"% local gap"}
                          </span>
                          <strong>{statewideTicketSplitSummary.materialRows.toLocaleString()}</strong>
                        </article>
                        <article>
                          <span>Selected area avg</span>
                          <strong>
                            D {formatSignedPct(selectedTicketSplitSummary.averageDemDropoff)} / R{" "}
                            {formatSignedPct(selectedTicketSplitSummary.averageRepDropoff)}
                          </strong>
                        </article>
                      </div>
                      <p className="planner-note">
                        This is not ballot-level ticket-splitting. It is a comparison-contest proxy built from the same
                        review rows that feed the drop-off histogram and CSV export.
                      </p>
                    </>
                  ) : (
                    <p className="planner-note">
                      No same-row comparison contest is loaded for this state and election, so the ticket-splitting
                      proxy is unavailable until review rows include presidential and comparison-contest values.
                    </p>
                  )}
                </div>

                <div className="screening-grid" data-tour="screening-grid">
                  {enabledScreeningGraphs.includes("voteShareScatter") && (
                    <article className="screening-card" data-tour="review-scatter">
                      <div className="screening-card-head">
                        <div>
                          <span>Statistical Screening Graph</span>
                          <strong>Vote-Share by Vote-Count Scatterplot</strong>
                          <small>
                            {selectedReviewJurisdictionName}: {scatterRows.length} local rows
                          </small>
                        </div>
                        <button
                          className="secondary-button"
                          disabled={scatterDiagnostic.status !== "ready" && !scatterAcknowledged}
                          onClick={() => downloadSvgElement(scatterSvgId, `${screeningSlug}-vote-share-scatter.svg`)}
                          type="button"
                        >
                          <Download aria-hidden size={15} />
                          Download SVG
                        </button>
                        <Eli5>
                          Imagine lining up jars by how many marbles are inside, then marking what share of each jar is
                          blue or red. This chart asks whether bigger local rows lean differently than smaller rows.
                        </Eli5>
                      </div>
                      <ChartQualityNotice diagnostic={scatterDiagnostic} />
                      <div
                        className={`screening-chart-shell ${
                          scatterDiagnostic.status !== "ready" && !scatterAcknowledged ? "is-gated" : ""
                        }`}
                      >
                        <div className="screening-chart-frame">
                          <svg
                            aria-hidden={scatterDiagnostic.status !== "ready" && !scatterAcknowledged}
                            aria-label={`${selectedReviewJurisdictionName} vote-share by vote-count scatterplot`}
                            id={scatterSvgId}
                            role="img"
                            viewBox="0 0 560 300"
                          >
                            <rect className="screening-svg-bg" height="300" width="560" />
                            {[0, 25, 50, 75, 100].map((share) => (
                              <g key={share}>
                                <line className="screening-gridline" x1="52" x2="490" y1={scatterY(share)} y2={scatterY(share)} />
                                <text className="screening-axis-label" x="22" y={scatterY(share) + 4}>
                                  {share}%
                                </text>
                              </g>
                            ))}
                            {[0, 0.5, 1].map((ratio) => (
                              <g key={ratio}>
                                <line
                                  className="screening-gridline"
                                  x1={52 + ratio * 438}
                                  x2={52 + ratio * 438}
                                  y1="36"
                                  y2="246"
                                />
                                <text className="screening-axis-label" x={42 + ratio * 438} y="274">
                                  {Math.round(scatterMaxVotes * ratio).toLocaleString()}
                                </text>
                              </g>
                            ))}
                            <text className="screening-title" x="52" y="24">
                              {selectedReviewJurisdictionName}: local vote-share chart
                            </text>
                            <text className="screening-axis-title centered" x="271" y="286">
                              Candidate votes in local row
                            </text>
                            <text className="screening-axis-title vertical" transform="translate(14 186) rotate(-90)">
                              Candidate vote share
                            </text>
                            {harrisScatterPoints.map((point) => (
                              <circle
                                className="screening-dot dem"
                                cx={scatterX(point.x)}
                                cy={scatterY(point.y)}
                                key={`harris-${point.id}`}
                                r="3"
                              >
                                <title>
                                  {point.label}: Harris {point.votes.toLocaleString()} votes, {point.y.toFixed(2)}%
                                </title>
                              </circle>
                            ))}
                            {trumpScatterPoints.map((point) => (
                              <circle
                                className="screening-dot rep"
                                cx={scatterX(point.x)}
                                cy={scatterY(point.y)}
                                key={`trump-${point.id}`}
                                r="3"
                              >
                                <title>
                                  {point.label}: Trump {point.votes.toLocaleString()} votes, {point.y.toFixed(2)}%
                                </title>
                              </circle>
                            ))}
                            {harrisTrend && trendY(harrisTrend, 0) !== null && trendY(harrisTrend, scatterMaxVotes) !== null && (
                              <line
                                className="screening-trend dem"
                                x1={scatterX(0)}
                                x2={scatterX(scatterMaxVotes)}
                                y1={trendY(harrisTrend, 0) ?? 0}
                                y2={trendY(harrisTrend, scatterMaxVotes) ?? 0}
                              />
                            )}
                            {trumpTrend && trendY(trumpTrend, 0) !== null && trendY(trumpTrend, scatterMaxVotes) !== null && (
                              <line
                                className="screening-trend rep"
                                x1={scatterX(0)}
                                x2={scatterX(scatterMaxVotes)}
                                y1={trendY(trumpTrend, 0) ?? 0}
                                y2={trendY(trumpTrend, scatterMaxVotes) ?? 0}
                              />
                            )}
                            <g className="screening-legend">
                              <circle className="screening-dot rep" cx="430" cy="24" r="4" />
                              <text x="440" y="28">Trump</text>
                              <circle className="screening-dot dem" cx="486" cy="24" r="4" />
                              <text x="496" y="28">Harris</text>
                            </g>
                          </svg>
                        </div>
                        <ChartGate
                          acknowledged={scatterAcknowledged}
                          diagnostic={scatterDiagnostic}
                          onAcknowledge={() => acknowledgeChart(scatterDiagnostic.acknowledgementKey)}
                        />
                      </div>
                      <details className="how-to-read">
                        <summary>How to read this</summary>
                        <p>
                          Each dot is one local result row. Left-to-right shows how many votes a candidate received in
                          that row; up-and-down shows that candidate&apos;s share of the same row.
                        </p>
                        <p>
                          The trend lines help show whether larger local rows lean differently than smaller ones. A flag
                          means &quot;look closer,&quot; not proof that something happened.
                        </p>
                      </details>
                    </article>
                  )}

                  {enabledScreeningGraphs.includes("dropoffHistogram") && (
                    <article className="screening-card" data-tour="review-dropoff">
                      <div className="screening-card-head">
                        <div>
                          <span>Statistical Screening Graph</span>
                          <strong>Presidential-Versus-Comparison Drop-Off Histogram</strong>
                          <small>
                            {selectedReviewJurisdictionName}: DEM and REP local drop-off rates
                          </small>
                        </div>
                        <button
                          className="secondary-button"
                          disabled={dropoffDiagnostic.status !== "ready" && !dropoffAcknowledged}
                          onClick={() => downloadSvgElement(dropoffSvgId, `${screeningSlug}-dropoff-histogram.svg`)}
                          type="button"
                        >
                          <Download aria-hidden size={15} />
                          Download SVG
                        </button>
                        <Eli5>
                          Imagine comparing two receipts from the same store trip. If one item is much larger or smaller
                          than expected across many receipts, the bars show where those differences pile up.
                        </Eli5>
                      </div>
                      <ChartQualityNotice diagnostic={dropoffDiagnostic} />
                      <div
                        className={`screening-chart-shell ${
                          dropoffDiagnostic.status !== "ready" && !dropoffAcknowledged ? "is-gated" : ""
                        }`}
                      >
                        <div className="screening-chart-frame">
                          <svg
                            aria-hidden={dropoffDiagnostic.status !== "ready" && !dropoffAcknowledged}
                            aria-label={`${selectedReviewJurisdictionName} presidential versus comparison drop-off histogram`}
                            id={dropoffSvgId}
                            role="img"
                            viewBox="0 0 560 300"
                          >
                            <rect className="screening-svg-bg" height="300" width="560" />
                            {[0, 0.5, 1].map((ratio) => (
                              <g key={ratio}>
                                <line
                                  className="screening-gridline"
                                  x1="52"
                                  x2="506"
                                  y1={246 - ratio * 210}
                                  y2={246 - ratio * 210}
                                />
                                <text className="screening-axis-label" x="26" y={250 - ratio * 210}>
                                  {Math.round(maxDropoffBucket * ratio)}
                                </text>
                              </g>
                            ))}
                            <line className="screening-midline" x1="279" x2="279" y1="36" y2="246" />
                            <text className="screening-title" x="52" y="24">
                              {selectedReviewJurisdictionName}: President vs comparison drop-off rates
                            </text>
                            <text className="screening-axis-title centered" x="279" y="284">
                              <tspan x="279" dy="0">Presidential votes minus comparison votes</tspan>
                              <tspan x="279" dy="12">as % of presidential votes</tspan>
                            </text>
                            <text className="screening-axis-title vertical" transform="translate(14 172) rotate(-90)">
                              Local row count
                            </text>
                            {dropoffBuckets.map((bucket, index) => {
                              const x = 58 + index * 34;
                              const demHeight = (bucket.dem / maxDropoffBucket) * 196;
                              const repHeight = (bucket.rep / maxDropoffBucket) * 196;
                              return (
                                <g key={bucket.label}>
                                  <rect
                                    className="screening-bar dem"
                                    height={Math.max(1, demHeight)}
                                    width="12"
                                    x={x}
                                    y={246 - demHeight}
                                  >
                                    <title>
                                      DEM {bucket.label}: {bucket.dem} local rows
                                    </title>
                                  </rect>
                                  <rect
                                    className="screening-bar rep"
                                    height={Math.max(1, repHeight)}
                                    width="12"
                                    x={x + 14}
                                    y={246 - repHeight}
                                  >
                                    <title>
                                      REP {bucket.label}: {bucket.rep} local rows
                                    </title>
                                  </rect>
                                </g>
                              );
                            })}
                            <text className="screening-axis-label" x="48" y="274">-30%</text>
                            <text className="screening-axis-label" x="270" y="274">0%</text>
                            <text className="screening-axis-label" x="482" y="274">+30%</text>
                            <g className="screening-legend">
                              <rect className="screening-bar dem" height="10" width="10" x="430" y="16" />
                              <text x="444" y="25">DEM</text>
                              <rect className="screening-bar rep" height="10" width="10" x="486" y="16" />
                              <text x="500" y="25">REP</text>
                            </g>
                          </svg>
                        </div>
                        <ChartGate
                          acknowledged={dropoffAcknowledged}
                          diagnostic={dropoffDiagnostic}
                          onAcknowledge={() => acknowledgeChart(dropoffDiagnostic.acknowledgementKey)}
                        />
                      </div>
                      <details className="how-to-read">
                        <summary>How to read this</summary>
                        <p>
                          This compares presidential votes with a same-party comparison contest in the same local row.
                          Bars near zero mean the two contests moved similarly in that place.
                        </p>
                        <p>
                          Bars far left or right show larger drop-off differences. Normal split-ticket voting can cause
                          differences; the chart helps show whether those differences cluster oddly.
                        </p>
                      </details>
                    </article>
                  )}
                </div>
              </section>
            ) : (
              <div className="empty-state compact">
                <strong>No statistical screening rows loaded for {stateName}</strong>
                <span>These graphs need reviewCharts.metadata.rows from the legacy bundle.</span>
              </div>
            )}
              </section>
            )}
            {reviewView === "indicators" && (
              <section className="review-view-panel" data-tour="review-indicators-view" aria-label="Advisory indicators">
            <div className="review-tools">
              <label className="table-search" htmlFor="review-search">
                <Search aria-hidden size={16} />
                <input
                  autoComplete="off"
                  id="review-search"
                  onChange={(event) => setReviewQuery(event.target.value)}
                  placeholder="Filter review indicators"
                  type="search"
                  value={reviewQuery}
                />
              </label>
              <label className="sort-select-label" htmlFor="review-type">
                <ListChecks aria-hidden size={16} />
                <select
                  className="sort-select"
                  id="review-type"
                  onChange={(event) => setReviewType(event.target.value)}
                  value={reviewType}
                >
                  <option value="all">All flag types</option>
                  {indicatorTypes.map((type) => (
                    <option key={type} value={type}>
                      {indicatorLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {indicators.length ? (
              <div className="review-layout" data-tour="review-layout">
                <div className="priority-list">
                  {topIndicators.map((indicator) => (
                    <article className="priority-card" key={indicator.id}>
                      <div>
                        <span className="indicator-pill">! {indicator.label}</span>
                        <strong>{indicator.jurisdictionName}</strong>
                        <small>{indicatorScopeLabel(indicator)}</small>
                      </div>
                      <p>{indicator.summary}</p>
                      <span className="review-explainer">{indicatorExplanation(indicator.type)}</span>
                      <small>{indicator.detail}</small>
                      <small>{auditContextSummary(indicator)}</small>
                      <small>{denominatorContextSummary(indicator)}</small>
                    </article>
                  ))}
                </div>
                <div className="table-wrap">
                  <div className="table-helper-row">
                    <Eli5>
                      This table is the list behind the warning lights. Each row names a place, the type of pattern, and
                      how strongly the imported screening data says someone should review it.
                    </Eli5>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Jurisdiction</th>
                        <th>Scope</th>
                        <th>Flag</th>
                        <th>Severity</th>
                        <th>Priority</th>
                        <th>Audit context</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIndicators.map((indicator) => (
                        <tr key={indicator.id}>
                          <td>{indicator.jurisdictionName}</td>
                          <td>{indicatorScopeLabel(indicator)}</td>
                          <td>
                            <span className="indicator-pill">! {indicator.label}</span>
                          </td>
                          <td className="mono">{indicator.severity.toFixed(3)}</td>
                          <td>{severityBucket(indicator.severity)}</td>
                          <td>{auditContextSummary(indicator)}</td>
                          <td>{indicator.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>{reviewRows.length ? "No advisory flags generated" : "No advisory review rows loaded yet"}</strong>
                <span>
                  {reviewRows.length
                    ? reviewLimitation ?? "Review rows are loaded, but none crossed the current advisory thresholds."
                    : "When the legacy repo exposes review chart rows for this state, the importer will populate this tab."}
                </span>
              </div>
            )}
              </section>
            )}
            {reviewView === "methodology" && (
              <section className="review-view-panel" data-tour="review-methodology-view" aria-label="Flag methodology">
            <section className="flag-methodology-guide" aria-label="Flag calculation guide" data-tour="flag-guide">
              <div className="flag-guide-header">
                <div>
                  <strong>Flag Calculation Guide</strong>
                  <span>Current advisory flag types, calculation triggers, and common checks before interpreting them.</span>
                </div>
                <nav aria-label="Flag table of contents" className="flag-guide-toc">
                  {flagMethodologyGuides.map((guide) => (
                    <a href={`#flag-guide-${guide.id}`} key={guide.id}>
                      {guide.label}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="flag-guide-list">
                {flagMethodologyGuides.map((guide) => (
                  <article id={`flag-guide-${guide.id}`} key={guide.id}>
                    <div>
                      <span className="indicator-pill">! {guide.label}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Calculated from</dt>
                        <dd>{guide.calculatedFrom}</dd>
                      </div>
                      <div>
                        <dt>Threshold</dt>
                        <dd>{guide.threshold}</dd>
                      </div>
                      <div>
                        <dt>Alternative explanations</dt>
                        <dd>{guide.alternativeExplanations}</dd>
                      </div>
                      <div>
                        <dt>Validation checks</dt>
                        <dd>{guide.validation}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
              </section>
            )}
          </section>
        </div>
      )}
      {activeTab === "history" && (
        <div className="tab-panel-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Historical Baselines</h2>
                <span>
                  {historicalRows.length
                    ? `${historicalRows.length.toLocaleString()} rows across ${historicalYearSummaries.length} election years`
                  : "Waiting on historical rows from the legacy bundle"}
                </span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This section is like looking at old report cards before reading the new one. It shows whether the same
                  places changed over past presidential elections, when those old rows are available.
                </Eli5>
                <QualityBadge
                  detail={
                    historicalRows.length
                      ? "Historical context rows are loaded. Fingerprint charts remain proxy views until turnout denominators are used."
                      : "Historical baseline rows are not loaded."
                  }
                  status={historicalRows.length ? "proxy" : "missing"}
                />
                <History aria-hidden size={18} />
              </div>
            </div>
            {historicalRows.length ? (
              <>
                <div className="history-controls" aria-label="Historical year toggles">
                  <span>Show years</span>
                  {historicalYears.map((year) => (
                    <label key={year}>
                      <input
                        checked={visibleHistoricalYearSet.has(year)}
                        onChange={(event) => {
                          setEnabledHistoricalYears((years) =>
                            event.target.checked ? [...years, year].sort() : years.filter((entry) => entry !== year),
                          );
                        }}
                        type="checkbox"
                      />
                      {year}
                    </label>
                  ))}
                </div>
                <div className="history-controls graph-controls" aria-label="Historical graph toggles">
                  <span>Show graphs</span>
                  {historicalGraphOptions.map((option) => (
                    <label key={option.key}>
                      <input
                        checked={enabledHistoricalGraphs.includes(option.key)}
                        onChange={(event) => {
                          setEnabledHistoricalGraphs((graphs) =>
                            event.target.checked
                              ? [...graphs, option.key]
                              : graphs.filter((entry) => entry !== option.key),
                          );
                        }}
                        type="checkbox"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <div className="history-summary-grid">
                  {filteredHistoricalSummaries.map((summary) => (
                    <article key={summary.year}>
                      <span>{summary.year} President</span>
                      <strong>{summary.winner}</strong>
                      <dl>
                        <div>
                          <dt>Dem</dt>
                          <dd>{summary.demVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Rep</dt>
                          <dd>{summary.repVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>{summary.totalVotes.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Margin</dt>
                          <dd>
                            {summary.marginVotes.toLocaleString()} ({summary.marginPct.toFixed(2)}%)
                          </dd>
                        </div>
                      </dl>
                      <small>
                        {summary.rows.toLocaleString()} rows - {summary.sourceCount} source
                        {summary.sourceCount === 1 ? "" : "s"}
                      </small>
                    </article>
                  ))}
                </div>
                <div className="history-chart-grid" data-tour="history-charts">
                  {enabledHistoricalGraphs.includes("share") && (
                    <article className="history-chart-card">
                      <div>
                        <strong>Statewide Vote Share</strong>
                        <span>Democratic, Republican, and other share by enabled year</span>
                        <Eli5>
                          This is like dividing a pizza each year. The colored pieces show how much of the vote went to
                          each group, so you can compare the slices from year to year.
                        </Eli5>
                      </div>
                      <ChartQualityNotice diagnostic={historicalContextDiagnostic} />
<div className={`screening-chart-shell ${historicalContextDiagnostic.status !== "ready" && !historicalContextAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="history-share-chart" role="img" aria-label="Statewide historical vote share chart">
                        {filteredHistoricalSummaries.map((summary) => {
                          const demShare = summary.totalVotes > 0 ? (summary.demVotes / summary.totalVotes) * 100 : 0;
                          const repShare = summary.totalVotes > 0 ? (summary.repVotes / summary.totalVotes) * 100 : 0;
                          const otherShare = Math.max(0, 100 - demShare - repShare);
                          return (
                            <div className="history-share-row" key={summary.year}>
                              <span>{summary.year}</span>
                              <div>
                                <i className="history-dem" style={{ width: `${demShare}%` }} title={`Dem ${demShare.toFixed(2)}%`} />
                                <i className="history-rep" style={{ width: `${repShare}%` }} title={`Rep ${repShare.toFixed(2)}%`} />
                                <i className="history-other" style={{ width: `${otherShare}%` }} title={`Other ${otherShare.toFixed(2)}%`} />
                              </div>
                              <strong>
                                D {demShare.toFixed(1)}% / R {repShare.toFixed(1)}%
                              </strong>
                            </div>
                          );
                        })}
                      </div>
  </div>
  <ChartGate
    acknowledged={historicalContextAcknowledged}
    diagnostic={historicalContextDiagnostic}
    onAcknowledge={() => acknowledgeChart(historicalContextDiagnostic.acknowledgementKey)}
  />
</div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("margin") && (
                    <article className="history-chart-card">
                      <div>
                        <strong>Margin Trend</strong>
                        <span>Winner margin as a share of total votes</span>
                        <Eli5>
                          This shows how big the winner's lead was each year. A longer bar means the winner had more room
                          between them and second place.
                        </Eli5>
                      </div>
                      <ChartQualityNotice diagnostic={historicalContextDiagnostic} />
<div className={`screening-chart-shell ${historicalContextDiagnostic.status !== "ready" && !historicalContextAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="history-margin-chart" role="img" aria-label="Historical winner margin chart">
                        {filteredHistoricalSummaries.map((summary) => {
                          const width = Math.max(4, (summary.marginPct / maxHistoricalMargin) * 100);
                          return (
                            <div className="history-margin-row" key={summary.year}>
                              <span>{summary.year}</span>
                              <div>
                                <i
                                  className={summary.winner === "Democratic" ? "history-dem" : "history-rep"}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <strong>{summary.marginPct.toFixed(2)}%</strong>
                            </div>
                          );
                        })}
                      </div>
  </div>
  <ChartGate
    acknowledged={historicalContextAcknowledged}
    diagnostic={historicalContextDiagnostic}
    onAcknowledge={() => acknowledgeChart(historicalContextDiagnostic.acknowledgementKey)}
  />
</div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("movement") && (
                    <article className="history-chart-card wide">
                      <div>
                        <strong>Largest County Dem-Share Movement</strong>
                        <span>Change between earliest and latest enabled historical year</span>
                        <Eli5>
                          This is like asking which counties moved their chair the farthest between the first selected
                          year and the last selected year. Blue means movement toward Democrats; red means movement away.
                        </Eli5>
                      </div>
                      <ChartQualityNotice diagnostic={historicalContextDiagnostic} />
<div className={`screening-chart-shell ${historicalContextDiagnostic.status !== "ready" && !historicalContextAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="history-swing-list">
                        {historicalCountyTrends.map((trend) => {
                          const width = Math.min(100, Math.max(5, Math.abs(trend.demShareChange) * 4));
                          return (
                            <div className="history-swing-row" key={trend.county}>
                              <span>{trend.county}</span>
                              <div>
                                <i
                                  className={trend.demShareChange >= 0 ? "history-dem" : "history-rep"}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <strong>
                                {trend.demShareChange >= 0 ? "+" : ""}
                                {trend.demShareChange.toFixed(2)} pts
                              </strong>
                            </div>
                          );
                        })}
                      </div>
  </div>
  <ChartGate
    acknowledged={historicalContextAcknowledged}
    diagnostic={historicalContextDiagnostic}
    onAcknowledge={() => acknowledgeChart(historicalContextDiagnostic.acknowledgementKey)}
  />
</div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("klimek") && (
                    <article className="history-chart-card wide" data-tour="history-fingerprints">
                      <div>
                        <strong>Klimek-Style Vote Fingerprints</strong>
                        <span>
                          Separate year charts plotting Democratic share against county vote volume as a temporary turnout
                          proxy. True Klimek fingerprints will use turnout percentages once denominators are imported.
                        </span>
                        <Eli5>
                          Imagine each county as a dot. The dot's left-right position is vote share, and its height is
                          vote size for now. This is only a practice version until real turnout denominators are loaded.
                        </Eli5>
                      </div>
                      <div className="data-warning strong-warning" role="status">
                        <TriangleAlert aria-hidden size={18} />
                        <div>
                          <strong>Proxy graph, not a complete Klimek fingerprint</strong>
                          <span>
                            This uses county vote volume because true turnout percentages are not imported for these
                            historical rows. Do not interpret it as a complete turnout-fingerprint test.
                          </span>
                        </div>
                      </div>
                      <ChartQualityNotice diagnostic={klimekProxyDiagnostic} />
<div className={`screening-chart-shell ${klimekProxyDiagnostic.status !== "ready" && !klimekProxyAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="fingerprint-grid">
                        {historicalRowsByYear.map((yearGroup) => (
                          <div className="fingerprint-panel" key={yearGroup.year}>
                            <strong>{yearGroup.year}</strong>
                            <svg role="img" viewBox="0 0 260 170" aria-label={`${yearGroup.year} Klimek-style vote fingerprint`}>
                              <line className="fingerprint-axis" x1="34" x2="244" y1="136" y2="136" />
                              <line className="fingerprint-axis" x1="34" x2="34" y1="16" y2="136" />
                              <line className="fingerprint-midline" x1="139" x2="139" y1="16" y2="136" />
                              <text className="fingerprint-label" x="34" y="154">0% D</text>
                              <text className="fingerprint-label" x="128" y="154">50%</text>
                              <text className="fingerprint-label" x="220" y="154">100%</text>
                              <text className="fingerprint-label" x="38" y="24">High volume</text>
                              {yearGroup.rows.map((row) => {
                                const demShare = row.totalVotes ? ((row.demVotes ?? 0) / row.totalVotes) * 100 : 0;
                                const x = 34 + (demShare / 100) * 210;
                                const y = 136 - Math.sqrt((row.totalVotes ?? 0) / yearGroup.maxTotalVotes) * 112;
                                const radius = Math.max(2.4, Math.min(7.5, Math.sqrt((row.totalVotes ?? 0) / yearGroup.maxTotalVotes) * 7));
                                return (
                                  <circle
                                    className={demShare >= 50 ? "fingerprint-dem-dot" : "fingerprint-rep-dot"}
                                    cx={x.toFixed(2)}
                                    cy={y.toFixed(2)}
                                    key={row.id}
                                    r={radius.toFixed(2)}
                                  >
                                    <title>
                                      {row.jurisdictionName}: D {demShare.toFixed(2)}%, total {(row.totalVotes ?? 0).toLocaleString()}
                                    </title>
                                  </circle>
                                );
                              })}
                            </svg>
                          </div>
                        ))}
                      </div>
  </div>
  <ChartGate
    acknowledged={klimekProxyAcknowledged}
    diagnostic={klimekProxyDiagnostic}
    onAcknowledge={() => acknowledgeChart(klimekProxyDiagnostic.acknowledgementKey)}
  />
</div>
                    </article>
                  )}

                  {enabledHistoricalGraphs.includes("shpilkin") && (
                    <article className="history-chart-card wide" data-tour="history-shpilkin">
                      <div>
                        <strong>Shpilkin-Style Vote-Share Diagnostics</strong>
                        <span>
                          Vote volume grouped by Democratic share bucket for each enabled year. This separates the
                          distribution diagnostic from the Klimek fingerprint view.
                        </span>
                        <Eli5>
                          Imagine sorting counties into buckets by how Democratic they were, then stacking their votes in
                          each bucket. Tall buckets show where a lot of votes are concentrated.
                        </Eli5>
                      </div>
                      <div className="data-warning strong-warning" role="status">
                        <TriangleAlert aria-hidden size={18} />
                        <div>
                          <strong>Diagnostic view with limited inputs</strong>
                          <span>
                            This groups county vote volume by vote-share buckets. It does not replace precinct-level
                            distributions or turnout-based review when those data are missing.
                          </span>
                        </div>
                      </div>
                      <ChartQualityNotice diagnostic={shpilkinProxyDiagnostic} />
<div className={`screening-chart-shell ${shpilkinProxyDiagnostic.status !== "ready" && !shpilkinProxyAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="shpilkin-grid">
                        {shpilkinRowsByYear.map((yearGroup) => (
                          <div className="shpilkin-panel" key={yearGroup.year}>
                            <strong>{yearGroup.year}</strong>
                            <div className="shpilkin-bars" role="img" aria-label={`${yearGroup.year} Shpilkin-style vote-share bucket chart`}>
                              {yearGroup.buckets.map((bucket) => {
                                const height = Math.max(4, (bucket.totalVotes / yearGroup.maxBucketVotes) * 100);
                                const demShare = bucket.totalVotes ? (bucket.demVotes / bucket.totalVotes) * 100 : 0;
                                return (
                                  <div className="shpilkin-bucket" key={bucket.label}>
                                    <i
                                      className={demShare >= 50 ? "shpilkin-dem-bar" : "shpilkin-rep-bar"}
                                      style={{ height: `${height}%` }}
                                    >
                                      <span>
                                        {bucket.label}: {bucket.totalVotes.toLocaleString()} votes, {bucket.rows} rows
                                      </span>
                                    </i>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="shpilkin-labels" aria-hidden="true">
                              <span>0% D</span>
                              <span>50%</span>
                              <span>100%</span>
                            </div>
                          </div>
                        ))}
                      </div>
  </div>
  <ChartGate
    acknowledged={shpilkinProxyAcknowledged}
    diagnostic={shpilkinProxyDiagnostic}
    onAcknowledge={() => acknowledgeChart(shpilkinProxyDiagnostic.acknowledgementKey)}
  />
</div>
                    </article>
                  )}
                </div>
                <div className="table-wrap">
                  <div className="table-helper-row">
                    <Eli5>
                      This table is the raw list feeding the history charts. Each row is one place in one election year,
                      with Democratic, Republican, other, and total votes.
                    </Eli5>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>{countyLabel}</th>
                        <th>Dem</th>
                        <th>Rep</th>
                        <th>Other</th>
                        <th>Total</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistoricalRows.map((row) => (
                        <tr key={row.id}>
                          <td className="mono">{row.electionYear}</td>
                          <td>{row.jurisdictionName}</td>
                          <td className="mono">{(row.demVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.repVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.otherVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{(row.totalVotes ?? 0).toLocaleString()}</td>
                          <td className="mono">{row.sourceId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredHistoricalRows.length > visibleHistoricalRows.length && (
                  <div className="table-note">
                    Showing first {visibleHistoricalRows.length.toLocaleString()} rows from the enabled years. Use the
                    historical API for the full selected-state extract.
                  </div>
                )}
              </>
            ) : (
              <div className="empty-panel">
                <strong>No historical baseline rows loaded for {stateName}</strong>
                <span>
                  The importer looks for historicalBaseline.series rows in the legacy state bundle. Current repo data
                  only exposes populated historical series for a subset of states.
                </span>
              </div>
            )}
          </section>
        </div>
      )}


      {activeTab === "electronic" && (
        <div className="tab-panel-content">
          <section className="panel electronic-integrity-panel" data-tour="electronic-integrity">
            {requestGuideOpen && (
              <div
                aria-labelledby="request-guide-title"
                aria-modal="true"
                className="request-guide-backdrop"
                role="dialog"
              >
                <div className="request-guide-modal">
                  <div className="request-guide-head">
                    <div>
                      <span className="section-label">Records request guide</span>
                      <h3 id="request-guide-title">What this request does</h3>
                    </div>
                    <button
                      aria-label="Close records request guide"
                      className="icon-button"
                      onClick={() => setRequestGuideOpen(false)}
                      type="button"
                    >
                      <X aria-hidden size={18} />
                    </button>
                  </div>
                  <div className="request-guide-body">
                    <article>
                      <strong>What the request is</strong>
                      <p>
                        It is a public-records request for election-system evidence such as CVRs, ballot images,
                        tabulator logs, audit exports, logic-and-accuracy records, custody records, and reconciliation
                        files. It asks whether the evidence exists and how to obtain it; it is not an allegation.
                      </p>
                    </article>
                    <article>
                      <strong>What to expect</strong>
                      <p>
                        Some offices answer by email, some use a records portal, and some redirect the request to a
                        county, municipality, or vendor custodian. Fees, clarifying questions, delays, partial releases,
                        or denials are normal outcomes that should be tracked.
                      </p>
                    </article>
                    <article>
                      <strong>Two separate lanes</strong>
                      <p>
                        Electronic-integrity requests ask for machine-output, audit, log, custody, and related evidence.
                        Source-records requests ask for missing official results, comparison contests, turnout,
                        geometry, historical baselines, and source caveats. The app prepares both drafts; you send them
                        yourself and submit replies separately.
                      </p>
                    </article>
                    <article>
                      <strong>How it works here</strong>
                      <p>
                        The app prepares a draft from the missing evidence list for {stateName}. Review the draft,
                        verify the custodian, then use copy, email, or the lookup link to send it outside the app. The
                        site does not automatically submit requests.
                      </p>
                    </article>
                  </div>
                  <div className="request-guide-actions">
                    <button className="secondary-button" onClick={() => setRequestGuideOpen(false)} type="button">
                      Got it
                    </button>
                    {electronicStateDraft && (
                      <a className="secondary-button request-guide-primary" href={electronicStateDraft.mailtoHref}>
                        <Mail aria-hidden size={15} />
                        Open mail app
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="panel-header">
              <div>
                <h2>Electronic Integrity</h2>
                <span>{electronicIntegrityStatus?.summary ?? "Evidence chain not registered for this state yet"}</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the checklist for checking machine-output risk responsibly. It tracks whether official results,
                  local rows, CVRs, ballot images, logs, tests, audits, and custody records are available. Missing evidence
                  means more records are needed; it does not prove electronic tampering.
                </Eli5>
                <QualityBadge
                  detail={electronicIntegrityStatus?.riskPosture ?? "No electronic-integrity package is registered."}
                  status={electronicQualityStatus(electronicIntegrityStatus?.overallStatus)}
                />
                <button className="secondary-button" data-tour="request-guide-button" onClick={() => setRequestGuideOpen(true)} type="button">
                  <BookOpen aria-hidden size={15} />
                  Request guide
                </button>
                <Server aria-hidden size={18} />
              </div>
            </div>
            {electronicRequestQueueCount > 0 && (
              <div className="request-attention-banner" data-tour="request-attention-banner" role="status">
                <span className="request-attention-mark">
                  <span aria-hidden className="request-attention-ring outer" />
                  <span aria-hidden className="request-attention-ring inner" />
                  <Megaphone aria-hidden size={28} />
                </span>
                <div>
                  <strong>
                    {electronicRequestQueueCount.toLocaleString()} {electronicRequestQueueCount === 1 ? "request" : "requests"} need review for {stateName}
                  </strong>
                  <span>
                    These drafts ask for missing electronic evidence needed to reconcile machine output against official
                    totals and audit/paper records. Review the guide before sending.
                  </span>
                </div>
                <div className="request-banner-actions">
                  <button className="secondary-button request-guide-primary" onClick={() => setRequestGuideOpen(true)} type="button">
                    <BellRing aria-hidden size={15} />
                    Read guide
                  </button>
                  {electronicStateDraft && (
                    <a className="secondary-button" href={electronicStateDraft.mailtoHref}>
                      <Send aria-hidden size={15} />
                      Open draft
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="export-summary-grid">
              <article>
                <span>Evidence rows</span>
                <strong>{electronicArtifacts.length.toLocaleString()}</strong>
              </article>
              <article>
                <span>Loaded artifacts</span>
                <strong>{electronicLoadedArtifacts.toLocaleString()}</strong>
              </article>
              <article>
                <span>Requests needed</span>
                <strong>{electronicRequestRequired.toLocaleString()}</strong>
              </article>
              <article>
                <span>CVR status</span>
                <strong>{evidenceStatusLabel(electronicCvrArtifact?.status)}</strong>
              </article>
            </div>
            <div className="planner-note">
              <strong>Use this carefully</strong>
              <span>
                These records help reconcile machine output against official totals and paper/audit evidence. They are
                triage inputs, not a finding of tampering, and ballot-mode or turnout context should not become a flag
                input unless row-level data supports it.
              </span>
            </div>
            {sourceRecordsRequestRows.length > 0 && (
              <div className="source-records-request-section" data-tour="source-records-request-draft">
                <div className="planner-note source-records-separation">
                  <strong>Separate source-records requests</strong>
                  <span>
                    This is not the electronic-integrity evidence queue. The app prepares request text and packet context
                    here; your manual step is to verify the custodian, send the email or portal request yourself, then
                    submit any reply through GitHub.
                  </span>
                </div>
                <div className="export-summary-grid">
                  <article>
                    <span>Prepared drafts</span>
                    <strong>{sourceRecordsDraftFiles.length.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>Your manual sends</span>
                    <strong>{sourceRecordsRequests.summary.manualActionRequiredRows.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>Source request rows</span>
                    <strong>{sourceRecordsRequestQueueCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>Status</span>
                    <strong>
                      {Object.entries(sourceRecordsRequestStatusCounts)
                        .map(([status, count]) => `${evidenceStatusLabel(status)}: ${count}`)
                        .join(" - ")}
                    </strong>
                  </article>
                </div>
                {sourceRecordsStateDraft && (
                  <div className="request-draft-panel source-records-request-panel">
                    <div>
                      <span className="section-label">Prepared draft</span>
                      <strong>Source records request</strong>
                      <span>{sourceRecordsStateDraft.routingHint} {sourceRecordsStateDraft.recipientHint}</span>
                    </div>
                    <div>
                      <span className="section-label manual-action-label">Your manual step</span>
                      <strong>Review, fill requester, send</strong>
                      <span>The site does not send this email or portal request. Use your own account, then submit replies for review.</span>
                    </div>
                    <div className="request-draft-actions">
                      <button className="secondary-button" data-tour="source-records-copy-email" onClick={copySourceRecordsDraft} type="button">
                        <Copy aria-hidden size={15} />
                        {copiedSourceRecordsDraft ? "Copied" : "Copy source request"}
                      </button>
                      <a className="secondary-button" href={sourceRecordsStateDraft.mailtoHref}>
                        <Mail aria-hidden size={15} />
                        Open mail app
                      </a>
                      <a className="secondary-button" href={sourceRecordsRequests.contacts[0]?.recipientLookupUrl} rel="noreferrer" target="_blank">
                        Find source custodian
                      </a>
                      <a className="secondary-button" data-tour="source-records-submit-response" href={sourceRecordsResponseUrl} rel="noreferrer" target="_blank">
                        <Github aria-hidden size={15} />
                        Submit source response
                      </a>
                    </div>
                  </div>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Request ID</th>
                        <th>Source gap</th>
                        <th>Status</th>
                        <th>Prepared context</th>
                        <th>Your step</th>
                        <th>Response tracking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceRecordsRequestRows.map((request) => (
                        <tr key={request.requestId}>
                          <td>{request.requestId}</td>
                          <td>{request.requestLabel}</td>
                          <td>{evidenceStatusLabel(request.status)}</td>
                          <td>{request.preparedAction}</td>
                          <td>{request.manualUserAction}</td>
                          <td>{request.responseAction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}            {electronicIntegrityStatus ? (
              <>
                <div className="admin-source-grid" aria-label={`${stateName} electronic integrity status`}>
                  <article className={`admin-source-card ${electronicQualityStatus(electronicIntegrityStatus.overallStatus)}`}>
                    <div>
                      <span className="section-label">Overall</span>
                      <strong>{evidenceStatusLabel(electronicIntegrityStatus.overallStatus)}</strong>
                    </div>
                    <p>{electronicIntegrityStatus.riskPosture}</p>
                    <span className="pending">{electronicIntegrityStatus.nextAction}</span>
                  </article>
                  <article className={`admin-source-card ${electronicQualityStatus(electronicAuditArtifact?.status)}`}>
                    <div>
                      <span className="section-label">Audit context</span>
                      <strong>{evidenceStatusLabel(electronicAuditArtifact?.status)}</strong>
                    </div>
                    <p>{electronicAuditArtifact?.tamperDetectionUse ?? "Audit context has not been registered."}</p>
                    {electronicAuditArtifact?.sourceUrl ? (
                      <a href={electronicAuditArtifact.sourceUrl} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : (
                      <span className="pending">Audit source package needed</span>
                    )}
                  </article>
                  <article className="admin-source-card partial">
                    <div>
                      <span className="section-label">Status mix</span>
                      <strong>{Object.keys(electronicStatusCounts).length.toLocaleString()} statuses</strong>
                    </div>
                    <p>
                      {Object.entries(electronicStatusCounts)
                        .map(([status, count]) => `${evidenceStatusLabel(status)}: ${count}`)
                        .join(" - ") || "No registered evidence rows."}
                    </p>
                    <span className="pending">Registry checked {electronicIntegrityStatus.electionYear}</span>
                  </article>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Evidence</th>
                        <th>Status</th>
                        <th>Grain</th>
                        <th>Reconciliation</th>
                        <th>Request</th>
                        <th>Use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {electronicArtifacts.map((artifact) => (
                        <tr key={artifact.type}>
                          <td>{artifact.sourceUrl ? <a href={artifact.sourceUrl} rel="noreferrer" target="_blank">{electronicArtifactLabel(artifact.type)}</a> : electronicArtifactLabel(artifact.type)}</td>
                          <td>{evidenceStatusLabel(artifact.status)}</td>
                          <td>{artifact.granularity}</td>
                          <td>{artifact.reconciliationStatus}</td>
                          <td>{artifact.requestRequired ? "Needed" : "No"}</td>
                          <td>{artifact.tamperDetectionUse}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {electronicRequestArtifacts.length > 0 && (
                  <div className="planner-note">
                    <strong>Open records queue</strong>
                    <span>
                      {electronicRequestArtifacts.map((artifact) => electronicArtifactLabel(artifact.type)).join(" - ")}
                    </span>
                  </div>
                )}
                {electronicRequestRows.length > 0 && (
                  <>
                    <div className="planner-note">
                      <strong>Request workflow</strong>
                      <span>
                        {Object.entries(electronicRequestStatusCounts)
                          .map(([status, count]) => `${evidenceStatusLabel(status)}: ${count}`)
                          .join(" - ")}
                        {electronicStateDraft ? ` Draft: ${electronicStateDraft.emailFile}` : ""}
                      </span>
                    </div>
                    {electronicStateDraft && (
                      <div className="request-draft-panel" data-tour="request-draft-panel">
                        <div>
                          <strong>Email draft</strong>
                          <span>{electronicStateDraft.routingHint} {electronicStateDraft.recipientHint}</span>
                        </div>
                        <div className="request-draft-actions">
                          <button className="secondary-button" data-tour="request-copy-email" onClick={copyElectronicDraft} type="button">
                            <Copy aria-hidden size={15} />
                            {copiedElectronicDraft ? "Copied" : "Copy email draft"}
                          </button>
                          <a className="secondary-button" href={electronicStateDraft.mailtoHref}>
                            <Mail aria-hidden size={15} />
                            Open mail app
                          </a>
                          <a className="secondary-button" href={electronicRequestRows[0]?.recipientLookupUrl} rel="noreferrer" target="_blank">
                            Find custodian
                          </a>
                          <a className="secondary-button" data-tour="request-submit-response" href={recordsResponseUrl} rel="noreferrer" target="_blank">
                            <Github aria-hidden size={15} />
                            Submit received records
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Request ID</th>
                            <th>Evidence</th>
                            <th>Status</th>
                            <th>Route</th>
                            <th>Response</th>
                          </tr>
                        </thead>
                        <tbody>
                          {electronicRequestRows.map((request) => (
                            <tr key={request.requestId}>
                              <td>{request.requestId}</td>
                              <td>{request.artifactLabel}</td>
                              <td>{evidenceStatusLabel(request.status)}</td>
                              <td>
                                {request.recipientEmail || request.recipientPortalUrl ? (
                                  <a href={request.recipientPortalUrl} rel="noreferrer" target="_blank">
                                    {request.primaryCustodian}
                                  </a>
                                ) : (
                                  request.primaryCustodian
                                )}
                              </td>
                              <td>{request.responseSummary || request.feeStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="empty-panel">
                <strong>No electronic-integrity registry row for {stateName}</strong>
                <span>Start by registering certified results, local reporting-unit results, CVR availability, audit output, and custody/log sources.</span>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "planner" && (
        <div className="tab-panel-content">
          <section className="panel" data-tour="source-planner">
            <div className="panel-header">
              <div>
                <h2>Source Planner</h2>
                <span>Readiness by platform capability</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the project checklist for one state. It says which drawers have useful data inside and which
                  drawers are still waiting for files from the data pipeline.
                </Eli5>
                <ListChecks aria-hidden size={18} />
              </div>
            </div>
            <div className="capability-grid">
              {capabilityEntries.map(([key, value]) => (
                <article className={value ? "capability-card ready" : "capability-card pending-card"} key={key}>
                  <span>{formatCapability(key)}</span>
                  <strong>{statusLabel(Boolean(value))}</strong>
                </article>
              ))}
            </div>
            <div className="planner-grid">
              <article>
                <strong>Ready now</strong>
                <ul>
                  {readyCapabilities.map(([key]) => (
                    <li key={key}>{formatCapability(key)}</li>
                  ))}
                </ul>
              </article>
              <article>
                <strong>Waiting on data</strong>
                <ul>
                  {pendingCapabilities.length ? (
                    pendingCapabilities.map(([key]) => <li key={key}>{formatCapability(key)}</li>)
                  ) : (
                    <li>All tracked capabilities are marked available.</li>
                  )}
                </ul>
              </article>
              <article>
                <strong>Latest selected-state import</strong>
                <span>
                  {latestRun
                    ? `${latestRun.status} - ${dateLabel(latestRun.finishedAt ?? latestRun.startedAt)}`
                    : "No import run found for this state."}
                </span>
              </article>
            </div>
            <div className="admin-source-grid" aria-label={`${stateName} administration source status`}>
              {[
                {
                  detail: adminSourceStatus?.equipment.caveat ?? "Equipment context has not been registered for this state.",
                  href: adminSourceStatus?.equipment.sourceUrl,
                  label: "Equipment",
                  status: adminSourceStatus?.equipment.status,
                },
                {
                  detail: adminFamilyWhy(adminSourceStatus, "audit"),
                  href: adminSourceStatus?.audit.sourceUrl,
                  label: "Audit",
                  status: adminSourceStatus?.audit.status,
                },
                {
                  detail: adminFamilyWhy(adminSourceStatus, "cvr"),
                  href: adminSourceStatus?.cvr.sourceUrl,
                  label: "CVR",
                  status: adminSourceStatus?.cvr.status,
                },
                {
                  detail: adminFamilyWhy(adminSourceStatus, "incidents"),
                  href: adminSourceStatus?.incidents.sourceUrl,
                  label: "Incidents",
                  status: adminSourceStatus?.incidents.status,
                },
              ].map((family) => (
                <article className={`admin-source-card ${adminQualityStatus(family.status)}`} key={family.label}>
                  <div>
                    <span className="section-label">{family.label}</span>
                    <strong>{adminStatusLabel(family.status)}</strong>
                  </div>
                  <p>{family.detail}</p>
                  {family.href ? (
                    <a href={family.href} rel="noreferrer" target="_blank">
                      Open source
                    </a>
                  ) : (
                    <span className="pending">Source package needed</span>
                  )}
                </article>
              ))}
            </div>
            <div className="planner-note">
              <strong>Follow-up for data production</strong>
              <span>
                Review rows require local reporting-unit data at reviewCharts.metadata.rows. Turnout and historical tabs
                should remain pending until those row families are available in the repo bundle.
              </span>
            </div>
          </section>
        </div>
      )}

      {activeTab === "data" && (
        <div className="tab-panel-content">
          <section className="panel" data-tour="data-sources">
            <div className="panel-header">
              <div>
                <h2>Data & Sources</h2>
                <span>{sources.length} source document records</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the bibliography. If someone asks where a number came from, this section should point to the
                  official source, local artifact, parser, and confidence note.
                </Eli5>
                <QualityBadge
                  detail={sourcesWithoutUrls.length ? "Some source records need direct URLs." : "Source records are linked."}
                  status={sources.length && !sourcesWithoutUrls.length ? "ready" : sources.length ? "partial" : "missing"}
                />
                <a className="secondary-link" href={dataIssueUrl} rel="noreferrer" target="_blank">
                  Report Data Issue
                </a>
                <FileCheck2 aria-hidden size={18} />
              </div>
            </div>
            <div className="source-links-panel" data-tour="source-links">
              <div>
                <strong>Official Source Links</strong>
                <span>
                  Every imported source record for {stateName} should include an auditable URL or documented
                  artifact reference.
                </span>
                <Eli5>
                  These are links back to the original paperwork. A missing URL is like a recipe without the cookbook
                  page number: the data may exist, but it is harder to audit.
                </Eli5>
              </div>
              {sourcesWithoutUrls.length > 0 && (
                <p className="source-warning">
                  {sourcesWithoutUrls.length} source record{sourcesWithoutUrls.length === 1 ? "" : "s"} missing a URL.
                </p>
              )}
              <ul>
                {sources.map((source) => (
                  <li key={`${source.id}-link`}>
                    <div>
                      <strong>{source.category}</strong>
                      <span>{source.title}</span>
                    </div>
                    {source.sourceUrl ? (
                      <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                        Open official source
                      </a>
                    ) : (
                      <span className="pending">URL missing</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="vote-method-panel" data-tour="vote-method-summary">
              <div className="vote-method-head">
                <div>
                  <strong>Vote Methods</strong>
                  <span>
                    {voteMethodRows.length
                      ? `${voteMethodJurisdictions.toLocaleString()} EAC jurisdictions, ${voteMethodRows.length.toLocaleString()} method rows`
                      : "No EAC vote-method rows loaded for this state."}
                  </span>
                </div>
                <div className="header-actions">
                  <Eli5>
                    These rows describe how people participated: polling place, mail, early in-person, provisional, and
                    related EAC categories. They do not split Harris or Trump votes by method.
                  </Eli5>
                  <QualityBadge
                    detail={
                      voteMethodRows.length
                        ? "Participation-method rows are loaded, but candidate-by-method remains blocked."
                        : "Vote-method rows are not loaded for this state."
                    }
                    status={voteMethodRows.length ? "partial" : "missing"}
                  />
                  <button disabled={!voteMethodRows.length} onClick={exportVoteMethods} type="button">
                    <Download aria-hidden size={15} />
                    Vote Methods CSV
                  </button>
                </div>
              </div>
              {voteMethodRows.length ? (
                <>
                  <ChartQualityNotice diagnostic={voteMethodDiagnostic} />
<div className={`screening-chart-shell ${voteMethodDiagnostic.status !== "ready" && !voteMethodAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="export-summary-grid vote-method-summary-grid">
                    <article>
                      <span>Jurisdictions</span>
                      <strong>{voteMethodJurisdictions.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Method rows</span>
                      <strong>{voteMethodRows.length.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Unavailable fields</span>
                      <strong>{voteMethodUnavailableRows.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Layer</span>
                      <strong>Map ready</strong>
                    </article>
                  </div>
  </div>
  <ChartGate
    acknowledged={voteMethodAcknowledged}
    diagnostic={voteMethodDiagnostic}
    onAcknowledge={() => acknowledgeChart(voteMethodDiagnostic.acknowledgementKey)}
  />
</div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Method</th>
                          <th>Voters</th>
                          <th>Share</th>
                          <th>Reported rows</th>
                          <th>Unavailable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voteMethodSummaries.map((summary) => (
                          <tr key={summary.method}>
                            <td>{summary.label}</td>
                            <td className="mono">{summary.voters.toLocaleString()}</td>
                            <td className="mono">{summary.share === null ? "N/A" : `${summary.share.toFixed(2)}%`}</td>
                            <td className="mono">{summary.reportedRows.toLocaleString()}</td>
                            <td className="mono">{summary.unavailableRows.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-panel">
                  <strong>No vote-method rows loaded for {stateName}</strong>
                  <span>Current normalized EAC method coverage is available for MI, MN, OH, PA, and WI.</span>
                </div>
              )}
            </div>
            <div className="vote-method-caveat" data-tour="candidate-method-note">
              <div>
                <strong>Candidate by Method</strong>
                <span>
                  Not derived here. Candidate-by-method requires an official source that reports candidate totals split
                  by ballot method; EAC participation-method rows cannot be multiplied across candidate totals.
                </span>
              </div>
              <span className="pending">Source required</span>
            </div>
            <div className="vote-method-panel" data-tour="equipment-context">
              <div className="vote-method-head">
                <div>
                  <strong>Equipment Context</strong>
                  <span>
                    {equipmentRows.length
                      ? `${equipmentJurisdictions.toLocaleString()} jurisdictions, ${equipmentRows.length.toLocaleString()} equipment rows`
                      : "No normalized equipment context rows loaded for this state."}
                  </span>
                </div>
                <div className="header-actions">
                  <Eli5>
                    These rows describe election administration context like vendor, system, paper record, tabulation,
                    and poll-book fields by source jurisdiction. They do not prove why a vote pattern happened or that
                    every precinct used the same setup.
                  </Eli5>
                  <QualityBadge
                    detail={
                      equipmentRows.length
                        ? "Jurisdiction-level equipment context is loaded; use as clustering context only."
                        : "Equipment context is not loaded for this state."
                    }
                    status={equipmentRows.length ? "partial" : "missing"}
                  />
                  <button disabled={!equipmentRows.length} onClick={exportEquipmentRows} type="button">
                    <Download aria-hidden size={15} />
                    Equipment CSV
                  </button>
                </div>
              </div>
              {equipmentRows.length ? (
                <>
                  <ChartQualityNotice diagnostic={equipmentContextDiagnostic} />
<div className={`screening-chart-shell ${equipmentContextDiagnostic.status !== "ready" && !equipmentContextAcknowledged ? "is-gated" : ""}`}>
  <div className="chart-gate-frame">
<div className="export-summary-grid vote-method-summary-grid">
                    <article>
                      <span>Jurisdictions</span>
                      <strong>{equipmentJurisdictions.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Vendor groups</span>
                      <strong>{equipmentVendorSummaries.length.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Cluster checks</span>
                      <strong>{equipmentDiagnostics.length.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Uniformity notes</span>
                      <strong>{equipmentUniformityWarnings.toLocaleString()}</strong>
                    </article>
                    <article>
                      <span>Source</span>
                      <strong>Verifier</strong>
                    </article>
                  </div>
  </div>
  <ChartGate
    acknowledged={equipmentContextAcknowledged}
    diagnostic={equipmentContextDiagnostic}
    onAcknowledge={() => acknowledgeChart(equipmentContextDiagnostic.acknowledgementKey)}
  />
</div>
                  <div className="vote-method-caveat">
                    <div>
                      <strong>Equipment Cluster Diagnostic</strong>
                      <span>
                        This checks whether currently flagged jurisdictions cluster by vendor/system group inside the
                        selected state. It is review context only, not evidence of cause, does not prove a county is
                        internally uniform, and it does not control for demographics, geography, or contest coverage.
                      </span>
                    </div>
                    <span className="pending">Context only</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Systems</th>
                          <th>Jurisdictions</th>
                          <th>Poll-book types</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentVendorSummaries.map((summary) => (
                          <tr key={summary.vendor}>
                            <td>{summary.vendor}</td>
                            <td className="mono">{summary.systemCount.toLocaleString()}</td>
                            <td className="mono">{summary.jurisdictionCount.toLocaleString()}</td>
                            <td className="mono">{summary.pollBookCount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Group</th>
                          <th>Flagged</th>
                          <th>Rate</th>
                          <th>Jurisdictions</th>
                          <th>Lift</th>
                          <th>Status</th>
                          <th>Caveat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentDiagnostics.map((diagnostic: EquipmentClusterDiagnostic) => (
                          <tr key={diagnostic.groupKey}>
                            <td>
                              <strong>{diagnostic.vendor}</strong>
                              <span>{diagnostic.systemName}</span>
                            </td>
                            <td className="mono">{diagnostic.flaggedJurisdictions.toLocaleString()}</td>
                            <td className="mono">{`${(diagnostic.flaggedRate * 100).toFixed(1)}%`}</td>
                            <td className="mono">{diagnostic.jurisdictionCount.toLocaleString()}</td>
                            <td className="mono">{diagnostic.lift === null ? "N/A" : `${diagnostic.lift.toFixed(2)}x`}</td>
                            <td>
                              <span className={`quality-badge ${diagnostic.status === "ready" ? "partial" : "blocked"}`}>
                                {diagnostic.status === "ready" ? "Exploratory" : "Limited"}
                              </span>
                            </td>
                            <td>
                              {diagnostic.summary}
                              <span>{` Controls: ${diagnostic.controls.join(" - ")}.`}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-panel">
                  <strong>No equipment context loaded for {stateName}</strong>
                  <span>Use the admin source status endpoint to confirm whether the Verifier source is loaded or blocked for this state.</span>
                </div>
              )}
            </div>
            <div className="source-card-grid">
              {sources.map((source) => (
                <article className="source-card" key={source.id}>
                  <span>{source.category}</span>
                  <strong>{source.title}</strong>
                  <p>{source.confidence}</p>
                  <dl>
                    <dt>Authority</dt>
                    <dd>{source.authority}</dd>
                    <dt>Parser</dt>
                    <dd>{source.parser}</dd>
                    <dt>Artifact</dt>
                    <dd>{source.localArtifact || "Not recorded"}</dd>
                    <dt>Status</dt>
                    <dd>{source.status}</dd>
                  </dl>
                  {source.sourceUrl ? (
                    <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                      Open source
                    </a>
                  ) : (
                    <span className="pending">Source URL missing</span>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "methodology" && (
        <div className="tab-panel-content methodology-grid">
          <section className="panel text-panel" data-tour="methodology">
            <div className="panel-header">
              <div>
                <h2>Review Guide</h2>
                <span>How to review this release responsibly</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the rulebook. It explains what the app is allowed to claim, what the warnings mean, and what
                  should not be overinterpreted.
                </Eli5>
                <BookOpen aria-hidden size={18} />
              </div>
            </div>
            <div className="responsible-review-panel" data-tour="reviewer-checklist">
              <article>
                <span className="section-label">How to Review Responsibly</span>
                <strong>Use this site to find records worth checking, not to make claims by itself.</strong>
                <p>
                  Advisory flags and screening charts are triage prompts. Before sharing a finding, compare it against
                  official source documents, state caveats, normal local explanations, and the exact row family used by
                  the chart.
                </p>
              </article>
              <article>
                <span className="section-label">Reviewer Checklist</span>
                <ul className="reviewer-checklist">
                  {reviewerChecklist.map((entry) => (
                    <li key={entry.item}>
                      <span aria-hidden>{"->"}</span>
                      {entry.item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
            <div className="glossary-panel">
              <div>
                <span className="section-label">Glossary</span>
                <strong>Terms used across charts, tables, and source notes</strong>
              </div>
              <dl>
                {glossaryEntries.map((entry) => (
                  <div key={entry.term}>
                    <dt>{entry.term}</dt>
                    <dd>{entry.definition}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="method-list">
              {methodologyGuides.map((guide) => {
                return (
                  <details className="methodology-card" key={guide.id}>
                    <summary>
                      <span>
                        <strong>{guide.title}</strong>
                        <small>{guide.summary}</small>
                      </span>
                    </summary>
                    <div className="methodology-card-body">
                      <div>
                        <span className="section-label">Guide</span>
                        <ol>
                          {guide.guide.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </div>
                      <div className="methodology-caveat">
                        <strong>Read this carefully</strong>
                        <p>{guide.caveat}</p>
                      </div>
                      <div className="methodology-sources">
                        <span className="section-label">Official References</span>
                        <ul>
                          {guide.links.map((link) => (
                            <li key={`${guide.id}-${link.href}-${link.label}`}>
                              <a href={link.href} rel="noreferrer" target="_blank">
                                {link.label}
                              </a>
                              <span>{link.detail}</span>
                            </li>
                          ))}
                        </ul>
                        <p>
                          Use Data & Sources for {stateName} official canvass files, local artifacts, parser notes, and
                          selected-state provenance.
                        </p>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
            <div className="validation-list">
              {validationChecks.map((check) => (
                <article className={check.passed ? "validation-pass" : "validation-warn"} key={check.label}>
                  {check.passed ? <CheckCircle2 aria-hidden size={17} /> : <TriangleAlert aria-hidden size={17} />}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "exports" && (
        <div className="tab-panel-content">
          <section className="panel" data-tour="exports">
            <div className="panel-header">
              <div>
                <h2>Exports & API</h2>
                <span>Download selected state data or use public read endpoints</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the takeout counter. You can download the same data shown on screen or use API links so another
                  tool can ask for the data directly.
                </Eli5>
                <Database aria-hidden size={18} />
              </div>
            </div>
            <div className="export-grid">
              <button onClick={exportResults} type="button">
                <Download aria-hidden size={16} />
                Results CSV
              </button>
              <button onClick={exportIndicators} type="button">
                <Download aria-hidden size={16} />
                Review CSV
              </button>
              <button disabled={!reviewRows.length} onClick={exportReviewRows} type="button">
                <Download aria-hidden size={16} />
                Review Rows CSV
              </button>
              <button disabled={!turnoutRows.length} onClick={exportTurnoutRows} type="button">
                <Download aria-hidden size={16} />
                Turnout CSV
              </button>
              <button disabled={!historicalRows.length} onClick={exportHistoricalRows} type="button">
                <Download aria-hidden size={16} />
                Historical Rows CSV
              </button>
              <button onClick={exportSources} type="button">
                <Download aria-hidden size={16} />
                Sources CSV
              </button>
              <button onClick={exportCoverage} type="button">
                <Download aria-hidden size={16} />
                Coverage CSV
              </button>
              <button disabled={!voteMethodRows.length} onClick={exportVoteMethods} type="button">
                <Download aria-hidden size={16} />
                Vote Methods CSV
              </button>
              <button disabled={!equipmentRows.length} onClick={exportEquipmentRows} type="button">
                <Download aria-hidden size={16} />
                Equipment CSV
              </button>
              <button onClick={exportSourceManifest} type="button">
                <Download aria-hidden size={16} />
                Source Manifest JSON
              </button>
              <button onClick={exportImportSummary} type="button">
                <Download aria-hidden size={16} />
                Import Summary JSON
              </button>
              <button onClick={exportReviewPackage} type="button">
                <Download aria-hidden size={16} />
                All Files ZIP
              </button>
            </div>
            <div className="export-summary-grid">
              <article>
                <span>Rows</span>
                <strong>{results.length}</strong>
              </article>
              <article>
                <span>Indicators</span>
                <strong>{indicators.length}</strong>
              </article>
              <article>
                <span>Sources</span>
                <strong>{sources.length}</strong>
              </article>
              <article>
                <span>Turnout rows</span>
                <strong>{turnoutRows.length.toLocaleString()}</strong>
              </article>
              <article>
                <span>Equipment rows</span>
                <strong>{equipmentRows.length.toLocaleString()}</strong>
              </article>
              <article>
                <span>Security incident rows</span>
                <strong>{securityIncidents.length.toLocaleString()}</strong>
              </article>
              <article>
                <span>Total votes</span>
                <strong>{totalVotes.toLocaleString()}</strong>
              </article>
            </div>
            <ul className="api-list">
              <li className="api-helper">
                <Eli5>
                  Each API row is like a vending-machine button. Change the state code or limit in the URL, and the app
                  returns that slice of data as JSON.
                </Eli5>
              </li>
              <li className="api-helper">
                Review and historical row APIs omit large per-row metrics by default to keep public browsing fast. Add
                <code>includeMetrics=true</code> when you need the full calculation metadata.
              </li>
              <li>
                <strong>Results</strong>
                <code>/api/results?state={selectedStateCode}&amp;year=2024&amp;level=county</code>
              </li>
              <li>
                <strong>Indicators</strong>
                <code>/api/indicators?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Raw review rows</strong>
                <code>/api/review-rows?state={selectedStateCode}&amp;year=2024&amp;limit=500&amp;includeMetrics=true</code>
              </li>
              <li>
                <strong>Turnout</strong>
                <code>/api/turnout?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Vote methods</strong>
                <code>/api/vote-methods?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Equipment context</strong>
                <code>/api/equipment?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Security incidents</strong>
                <code>/api/security-incidents?state={selectedStateCode}&amp;year=2024&amp;limit=500</code>
              </li>
              <li>
                <strong>Admin source statuses</strong>
                <code>/api/admin-sources?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Historical baselines</strong>
                <code>/api/historical-baselines?state={selectedStateCode}&amp;limit=500&amp;includeMetrics=true</code>
              </li>
              <li>
                <strong>Sources</strong>
                <code>/api/sources?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Coverage</strong>
                <code>/api/coverage?state={selectedStateCode}&amp;year=2024</code>
              </li>
              <li>
                <strong>Completeness</strong>
                <code>/api/completeness?year=2024</code>
              </li>
            </ul>
          </section>
        </div>
      )}

      {activeTab === "imports" && (
        <div className="tab-panel-content">
          <section className="panel" data-tour="import-runs">
            <div className="panel-header">
              <div>
                <h2>Import Runs</h2>
                <span>Latest ETL promotion records</span>
              </div>
              <div className="header-actions">
                <Eli5>
                  This is the delivery log. Each entry says when the importer carried data from the source bundle into
                  the database and whether that trip finished cleanly.
                </Eli5>
                {importRuns.length ? <GitBranch aria-hidden size={18} /> : <Activity aria-hidden size={18} />}
              </div>
            </div>
            <ul className="source-list">
              {importRuns.map((run) => (
                <li key={run.id}>
                  <strong>
                    {run.state} {run.electionYear}
                  </strong>
                  <span>
                    {run.parser} - {dateLabel(run.startedAt)}
                  </span>
                  <span className="mono">{run.status}</span>
                  {Object.keys(run.summary).length > 0 && (
                    <span>
                      {Object.entries(run.summary)
                        .slice(0, 5)
                        .map(([key, value]) => `${key}: ${summaryValue(value)}`)
                        .filter(Boolean)
                        .join(" - ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {activeTab === "support" && (
        <div className="tab-panel-content support-grid">
          <section className="panel support-panel">
            <div className="panel-header">
              <div>
                <h2>Support Civic Result Maps</h2>
                <span>Help cover server costs and continued development</span>
              </div>
              <HeartHandshake aria-hidden size={18} />
            </div>
            <div className="support-card" data-tour="support-card">
              <div className="support-copy">
                <span className="section-label">Project funding</span>
                <strong>Keep the maps, APIs, and data pipeline online.</strong>
                <p>
                  Civic Result Maps is maintained as an independent public data project. Contributions help pay for
                  hosting, database capacity, source collection, validation work, and ongoing development.
                </p>
              </div>
              <div className="support-summary-grid">
                <article>
                  <Server aria-hidden size={18} />
                  <strong>Server costs</strong>
                  <span>Hosting, database usage, API traffic, and build infrastructure.</span>
                </article>
                <article>
                  <GitBranch aria-hidden size={18} />
                  <strong>Development</strong>
                  <span>ETL tooling, source audits, coverage checks, and interface improvements.</span>
                </article>
              </div>
              <a className="support-button" href="https://ko-fi.com/camreyn" rel="noreferrer" target="_blank">
                <HeartHandshake aria-hidden size={16} />
                Support on Ko-fi
              </a>
            </div>
          </section>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="tab-panel-content contact-grid">
          <section className="panel contact-panel">
            <div className="panel-header">
              <div>
                <h2>Contact</h2>
                <span>Civic Result Maps project contact</span>
              </div>
              <Mail aria-hidden size={18} />
            </div>
            <div className="contact-card">
              <div>
                <span className="section-label">Project lead</span>
                <strong>Camreyn</strong>
              </div>
              <div>
                <span className="section-label">Email</span>
                <a href="mailto:camreyn@protonmail.com">camreyn@protonmail.com</a>
              </div>
              <a className="contact-button" href="mailto:camreyn@protonmail.com">
                <Mail aria-hidden size={16} />
                Email Camreyn
              </a>
            </div>
          </section>
        </div>
      )}
        </main>
        <DataNotesPanel
          dataIssueUrl={dataIssueUrl}
          isCollapsed={isDataNotesCollapsed}
          notes={dataNoteSections}
          onToggle={() => setIsDataNotesCollapsed((value) => !value)}
          stateName={stateName}
        />
      </div>
    </section>
  );
}
