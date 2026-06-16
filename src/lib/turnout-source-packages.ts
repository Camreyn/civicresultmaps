import turnoutPackages from "../../data/turnout-source-packages.json";

export type TurnoutSourceStatus = (typeof turnoutPackages.stateYearStatuses)[number];

export type TurnoutSourceStatusValue =
  | "loaded"
  | "partial"
  | "candidate"
  | "needs_data"
  | "blocked"
  | "documented_exclusion";

export function listTurnoutSourceStatuses(input: {
  state?: string;
  status?: TurnoutSourceStatusValue;
  year?: number;
} = {}) {
  const requestedState = input.state?.toUpperCase();
  const requestedYear = input.year ?? 2024;
  const states = turnoutPackages.stateYearStatuses
    .filter((entry) => entry.year === requestedYear)
    .filter((entry) => !requestedState || entry.state === requestedState)
    .filter((entry) => !input.status || entry.status === input.status)
    .sort((a, b) => a.priority - b.priority || a.state.localeCompare(b.state));

  return {
    checkedAt: turnoutPackages.checkedAt,
    fallbackSources: turnoutPackages.fallbackSources,
    normalizedTurnoutContract: turnoutPackages.normalizedTurnoutContract,
    purpose: turnoutPackages.purpose,
    states,
    summary: {
      candidate: states.filter((entry) => entry.status === "candidate").length,
      loaded: states.filter((entry) => entry.status === "loaded").length,
      needsData: states.filter((entry) => entry.status === "needs_data").length,
      partial: states.filter((entry) => entry.status === "partial").length,
      total: states.length,
    },
    year: requestedYear,
  };
}

export function getTurnoutSourceStatus(state: string, year = 2024) {
  return turnoutPackages.stateYearStatuses.find(
    (entry) => entry.state === state.toUpperCase() && entry.year === year,
  );
}
