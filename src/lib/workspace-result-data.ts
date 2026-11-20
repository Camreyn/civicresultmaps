import { listResults, listHistoricalResultRows } from "./api";
import { historicalCountyRowsToResults } from "./state-year-results";
import type { SupportedPresidentialYear } from "./api-version";

export async function loadDisplayResults(state: string, year: SupportedPresidentialYear) {
  if (year !== 2024) {
    const [historicalRows, raceResults] = await Promise.all([
      listHistoricalResultRows({ state, year, limit: 5000 }),
      listResults({ state, year, level: "county" }),
    ]);
    return {
      historicalRows, raceResults,
      countyResults: historicalCountyRowsToResults(historicalRows, year),
      cityResults: [],
      cityTownResults: [],
      townResults: [],
      stateResults: [],
      federalPrecinctResults: [],
      nonGeographicResults: [],
    };
  }

  const [
    countyResults,
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
  ] = await Promise.all([
    listResults({ state, year, level: "county" }),
    listResults({ state, year, level: "city", office: "president" }),
    listResults({ state, year, level: "city_town", office: "president" }),
    listResults({ state, year, level: "town", office: "president" }),
    listResults({ state, year, level: "state", office: "president" }),
    listResults({ state, year, level: "federal_precincts", office: "president" }),
    listResults({ state, year, level: "non_geographic", office: "president" }),
  ]);

  return {
    historicalRows: [],
    raceResults: countyResults,
    countyResults: countyResults.filter(r => r.office.toLowerCase() === "president"),
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
  };
}
