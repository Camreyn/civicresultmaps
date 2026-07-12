import {
  listEquipmentRows,
  listHistoricalResultRows,
  listIndicators,
  listResults,
  listSources,
  listTurnoutRows,
  listVoteMethodRows,
} from "./api";
import { findCanonicalCountyByFips } from "./county-search";
import { buildCountyProfile, type CountyProfile } from "./county-profile-core";

export async function loadCountyProfile(fips: string): Promise<CountyProfile | null> {
  const county = findCanonicalCountyByFips(fips);
  if (!county) {
    return null;
  }

  const state = county.state;
  const [
    currentResults,
    historical2016,
    historical2020,
    turnoutRows,
    sources2016,
    sources2020,
    sources2024,
    equipmentRows,
    voteMethodRows,
    indicators,
  ] = await Promise.all([
    listResults({ level: "county", state, year: 2024 }),
    listHistoricalResultRows({ includeMetrics: true, limit: 5000, state, year: 2016 }),
    listHistoricalResultRows({ includeMetrics: true, limit: 5000, state, year: 2020 }),
    listTurnoutRows({ limit: 5000, state, year: 2024 }),
    listSources({ state, year: 2016 }),
    listSources({ state, year: 2020 }),
    listSources({ state, year: 2024 }),
    listEquipmentRows({ limit: 20000, state, year: 2024 }),
    listVoteMethodRows({ limit: 20000, state, year: 2024 }),
    listIndicators({ state, year: 2024 }),
  ]);

  return buildCountyProfile({
    county,
    currentResults,
    equipmentRows,
    historicalRows: [...historical2016, ...historical2020],
    indicators,
    sources: Array.from(new Map(
      [...sources2016, ...sources2020, ...sources2024].map((source) => [source.id, source]),
    ).values()),
    turnoutRows,
    voteMethodRows,
  });
}

export type { CountyProfile } from "./county-profile-core";
