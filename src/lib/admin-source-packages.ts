import adminPackages from "../../data/admin-source-packages.json";
import type { AdminSourceStatusSummary } from "./types";

export type AdminSourceStatusValue =
  | "loaded"
  | "partial"
  | "candidate"
  | "needs_data"
  | "blocked"
  | "documented_exclusion";

export type AdminSourceFamily = "equipment" | "audit" | "cvr" | "incidents";
export type AdminSourceStatus = AdminSourceStatusSummary;

export function listAdminSourceStatuses(input: {
  state?: string;
  status?: AdminSourceStatusValue;
  year?: number;
} = {}) {
  const requestedState = input.state?.toUpperCase();
  const requestedYear = input.year ?? 2024;
  const states = (adminPackages.stateYearStatuses as AdminSourceStatusSummary[])
    .filter((entry) => entry.electionYear === requestedYear)
    .filter((entry) => !requestedState || entry.state === requestedState)
    .filter((entry) => !input.status || entry.status === input.status)
    .sort((a, b) => {
      const priorityOrder = { swing: 0, standard: 1 };
      const priorityA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const priorityB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      return priorityA - priorityB || a.state.localeCompare(b.state);
    });

  const familySummary = (family: AdminSourceFamily) => ({
    blocked: states.filter((entry) => entry[family]?.status === "blocked").length,
    candidate: states.filter((entry) => entry[family]?.status === "candidate").length,
    loaded: states.filter((entry) => entry[family]?.status === "loaded").length,
    needsData: states.filter((entry) => entry[family]?.status === "needs_data").length,
    partial: states.filter((entry) => entry[family]?.status === "partial").length,
    total: states.length,
  });

  return {
    description: adminPackages.description,
    normalizedEquipmentContract: adminPackages.normalizedEquipmentContract,
    states,
    summary: {
      blocked: states.filter((entry) => entry.status === "blocked").length,
      candidate: states.filter((entry) => entry.status === "candidate").length,
      loaded: states.filter((entry) => entry.status === "loaded").length,
      needsData: states.filter((entry) => entry.status === "needs_data").length,
      partial: states.filter((entry) => entry.status === "partial").length,
      total: states.length,
    },
    familySummary: {
      audit: familySummary("audit"),
      cvr: familySummary("cvr"),
      equipment: familySummary("equipment"),
      incidents: familySummary("incidents"),
    },
    year: requestedYear,
  };
}

export function getAdminSourceStatus(state: string, year = 2024) {
  return (adminPackages.stateYearStatuses as AdminSourceStatusSummary[]).find(
    (entry) => entry.state === state.toUpperCase() && entry.electionYear === year,
  );
}
