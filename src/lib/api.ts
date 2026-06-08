import { z } from "zod";
import { currentDataSource } from "./data-access";

export const stateQuery = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase());

export const yearQuery = z.coerce.number().int().min(1788).max(2100);

export const officeQuery = z
  .string()
  .trim()
  .toLowerCase()
  .default("president");

export const levelQuery = z
  .enum(["county", "state", "district", "precinct"])
  .default("county");

export function apiEnvelope<T>(data: T, meta: Record<string, unknown> = {}) {
  return {
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source: currentDataSource(),
      ...meta,
    },
  };
}

export {
  getCoverageSummary,
  listElections,
  listImportRuns,
  listResults,
  listSources,
  listStates,
} from "./data-access";
