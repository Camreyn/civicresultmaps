import summary from "../../data/wi-2024-audit-summary.json" with { type: "json" };
import type { AnalysisIndicator } from "./types.ts";

export function wisconsinAuditReportFor(state: string, electionYear: number) {
  return state === summary.state && electionYear === summary.electionYear ? summary : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Enrich existing stored context at read time; never rewrite votes, flags, or the DB.
// Only the identified report and its verified counts qualify for this correction.
export function withWisconsinAuditCorrection(indicator: AnalysisIndicator): AnalysisIndicator {
  const report = wisconsinAuditReportFor(indicator.state, indicator.electionYear);
  if (!report || !isRecord(indicator.metrics)) return indicator;
  const audit = indicator.metrics.auditContext;
  if (!isRecord(audit) || audit.sourceUrl !== report.sourcePdfUrl) return indicator;
  if (audit.sourceReportSha256 && audit.sourceReportSha256 !== report.sourcePdfSha256) return indicator;
  const aggregate = audit.aggregateAuditResults;
  const reviewed = report.aggregateAuditResults;
  if (!isRecord(aggregate)
    || aggregate.ballotPositions !== reviewed.ballotPositions
    || aggregate.locallyReportedPotentialEquipmentIssueErrors !== reviewed.locallyReportedPotentialEquipmentIssueErrors
    || aggregate.errorRateWithFiveReportedErrors !== reviewed.errorRateWithFiveReportedErrors) return indicator;

  return {
    ...indicator,
    metrics: {
      ...indicator.metrics,
      auditContext: {
        ...audit,
        sourceReportSha256: report.sourcePdfSha256,
        aggregateAuditResults: {
          ...aggregate,
          percentageCorrection: reviewed.percentageCorrection,
          humanErrorCount: reviewed.humanErrorCount,
          humanErrorRateAsPrinted: reviewed.humanErrorRateAsPrinted,
          humanErrorSourcePages: reviewed.humanErrorSourcePages,
          humanErrorCaveat: reviewed.humanErrorCaveat,
          auditedContests: reviewed.auditedContests,
          auditedContestsSourcePage: reviewed.auditedContestsSourcePage,
          comparisonContestCaveat: reviewed.comparisonContestCaveat,
        },
      },
    },
  };
}
