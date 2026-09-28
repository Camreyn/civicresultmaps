import { wisconsinAuditReportFor } from "@/lib/wi-audit-context";

export function WisconsinAuditReportNote({ state, electionYear }: { state: string; electionYear: number }) {
  const report = wisconsinAuditReportFor(state, electionYear);
  if (!report) return null;
  const audit = report.aggregateAuditResults;
  const correction = audit.percentageCorrection;

  return (
    <aside className="audit-report-note" aria-label="Wisconsin audit report percentage correction">
      <strong>Correction: percentages printed in the 2024 WEC audit report are incorrect</strong>
      <p>
        For the five reported cases, the report prints {correction.fiveErrors.reportedPercent}.
        Calculating a percentage from its stated counts gives <strong>{correction.fiveErrors.recalculatedDisplay}</strong>:
        {" "}{correction.fiveErrors.formula}. Civic Result Maps previously repeated the printed value;
        we retain it as a source quotation, not the correct percentage.
        {" "}<a href={`${report.sourcePdfUrl}#page=10`} target="_blank" rel="noreferrer">Read WEC report, page 10</a>.
      </p>
      <p>{correction.note}</p>
      <details>
        <summary>Benchmark, human-error count, and audit scope</summary>
        <p>
          The report&apos;s stated benchmark of one error in 500,000 ballot positions equals
          {" "}<strong>{correction.benchmark.recalculatedDisplay}</strong>, not
          {" "}{correction.benchmark.reportedPercentByPage[0].percent} (page 9) or
          {" "}{correction.benchmark.reportedPercentByPage[1].percent} (page 10).
          {" "}<a href={`${report.sourcePdfUrl}#page=9`} target="_blank" rel="noreferrer">WEC report, pages 9–10</a>.
        </p>
        <p>
          WEC separately reports {audit.humanErrorCount} human/procedural errors
          ({audit.humanErrorRateAsPrinted}). {audit.humanErrorCaveat}
          {" "}<a href={`${report.sourcePdfUrl}#page=11`} target="_blank" rel="noreferrer">WEC report, pages 11–12</a>.
        </p>
        <p>
          The four selected audit contests were {audit.auditedContests.join(", ")}. {audit.comparisonContestCaveat}
          {" "}<a href={`${report.sourcePdfUrl}#page=5`} target="_blank" rel="noreferrer">WEC report, page 5</a>.
        </p>
        <p>{report.caveat}</p>
        <p>{correction.authority}. The original report is unchanged.</p>
      </details>
    </aside>
  );
}
