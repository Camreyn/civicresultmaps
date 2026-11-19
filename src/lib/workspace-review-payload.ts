import type { ReviewRowSummary } from "./types";

/**
 * Keep the workspace's browser payload small without changing the public API.
 * Imported review metrics also contain complete normalized source rows, whose
 * values are already present in the top-level review fields.
 */
export function compactWorkspaceReviewRows(
  rows: ReviewRowSummary[],
  tab: string,
): ReviewRowSummary[] {
  return rows.map((row) => {
    const metrics: Record<string, unknown> = {};
    for (const key of ["coverageMode", "comparisonContest"]) {
      if (typeof row.metrics[key] === "string") {
        metrics[key] = row.metrics[key];
      }
    }

    // Historical charts need the source-backed participation proxy as well.
    // Retain it intact so its calculation and provenance stay unchanged.
    if (tab === "history" && row.metrics.presidentialParticipationProxy != null) {
      metrics.presidentialParticipationProxy = row.metrics.presidentialParticipationProxy;
    }

    return { ...row, metrics };
  });
}
