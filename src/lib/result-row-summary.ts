import type { ResultRow } from "./types";

export type ResultOutcomeKind =
  | "democratic"
  | "republican"
  | "other"
  | "tie"
  | "no_votes"
  | "privacy_suppressed"
  | "missing";

export const PRIVACY_SUPPRESSED_TOTAL_LABEL =
  "Candidate detail suppressed by official source";

export function finalizeResultRowSummary(row: ResultRow): ResultRow {
  const ranked = Object.entries(row.votes).sort(
    ([leftName, leftVotes], [rightName, rightVotes]) =>
      rightVotes - leftVotes || leftName.localeCompare(rightName),
  );
  const totalVotes = ranked.reduce((sum, [, votes]) => sum + votes, 0);
  if (row.resultStatus === "candidate_detail_suppressed") {
    if (
      ranked.length !== 1
      || ranked[0]?.[0] !== PRIVACY_SUPPRESSED_TOTAL_LABEL
      || !Number.isSafeInteger(totalVotes)
      || totalVotes < 0
    ) {
      throw new Error(
        "privacy-suppressed result must contain one exact reported-total row",
      );
    }
    return {
      ...row,
      totalVotes,
      winner: "",
      marginVotes: 0,
      marginPct: 0,
    };
  }
  if (totalVotes <= 0) {
    return {
      ...row,
      totalVotes: 0,
      winner: "",
      marginVotes: 0,
      marginPct: 0,
    };
  }

  const leadingVotes = ranked[0]?.[1] ?? 0;
  const runnerUpVotes = ranked[1]?.[1] ?? 0;
  const marginVotes = leadingVotes - runnerUpVotes;
  return {
    ...row,
    totalVotes,
    winner: marginVotes === 0 ? "Tie" : ranked[0]?.[0] ?? "",
    marginVotes,
    marginPct: Number(((marginVotes / totalVotes) * 100).toFixed(2)),
  };
}

export function resultOutcomeKind(
  result: ResultRow | null,
): ResultOutcomeKind {
  if (!result) {
    return "missing";
  }
  if (result.resultStatus === "candidate_detail_suppressed") {
    return "privacy_suppressed";
  }
  if (result.totalVotes <= 0) {
    return "no_votes";
  }

  const winner = result.winner.trim().toUpperCase();
  if (winner === "TIE") {
    return "tie";
  }
  if (winner.includes("TRUMP") || winner.includes("REPUBLICAN")) {
    return "republican";
  }
  if (
    winner.includes("HARRIS")
    || winner.includes("BIDEN")
    || winner.includes("CLINTON")
    || winner.includes("DEMOCRAT")
  ) {
    return "democratic";
  }
  return "other";
}

export function resultOutcomeDescription(result: ResultRow | null) {
  const kind = resultOutcomeKind(result);
  if (kind === "missing") {
    return "no joined result";
  }
  if (kind === "no_votes") {
    return "no votes reported";
  }
  if (kind === "privacy_suppressed") {
    return result!.totalVotes.toLocaleString()
      + " total votes reported; candidate detail suppressed";
  }
  if (kind === "tie") {
    return "tie";
  }
  return result!.winner + " by " + result!.marginPct.toFixed(2) + "%";
}

export function resultWinnerLabel(result: ResultRow) {
  const kind = resultOutcomeKind(result);
  if (kind === "no_votes") {
    return "No votes reported";
  }
  if (kind === "privacy_suppressed") {
    return "Candidate detail suppressed";
  }
  if (kind === "tie") {
    return "Tie";
  }
  return result.winner;
}
