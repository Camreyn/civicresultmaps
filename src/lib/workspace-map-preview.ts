import { isSupportedPresidentialYear, type SupportedPresidentialYear } from "./api-version.ts";
import type { CountyVoteRace } from "./county-vote-races";
import { countyByTag, stateByCode } from "./seo-geography.ts";
import type { SeoSearchParams } from "./seo-query-policy";
import { workspaceMapModes, type WorkspaceMapMode } from "./workspace-navigation.ts";

const modeInfo = {
  winner: ["Presidential winners", "Color shows the leading presidential candidate."],
  margin: ["Presidential margin", "Color shows the leader and the size of the winning margin."],
  volume: ["Vote volume", "Brighter gold means more reported presidential votes."],
  "votes-3d": ["3D county votes", "Height shows votes in the selected race, not population density."],
  method: ["Voting method", "Color shows the reported share for the displayed voting method."],
  equipment: ["Voting equipment", "Colors distinguish reported equipment groups, not vote results."],
  security: ["Security incident records", "Colors distinguish sources of county-attributed records, not election outcomes."],
} satisfies Record<WorkspaceMapMode, [string, string]>;

type RaceLoader = (state: string, year: SupportedPresidentialYear) => Promise<CountyVoteRace[]>;

// Resolve social identity from public, recognized values only. Never forward the raw query.
export async function buildWorkspaceMapPreview(params: SeoSearchParams, loadRaces: RaceLoader, strictMode = false) {
  if (params.tab !== undefined && params.tab !== "map") return null;
  const state = typeof params.state === "string" ? stateByCode(params.state)
    : params.state === undefined && (params.mode || params.tab === "map") ? stateByCode("WA") : undefined;
  const mode = params.mode ?? (params.tab === "map" || params.year || params.fips ? "winner" : undefined);
  if (!state || !workspaceMapModes.includes(mode as WorkspaceMapMode)) return null;
  const parsed = Number(params.year);
  const year = isSupportedPresidentialYear(parsed) ? parsed : 2024;
  const unsupportedYear = year !== 2024 && ["method", "equipment", "security"].includes(String(mode));
  if (strictMode && unsupportedYear) return null;
  const selectedMode = unsupportedYear ? "winner" : mode as WorkspaceMapMode;

  let selectedRace: CountyVoteRace | undefined;
  if (selectedMode === "votes-3d" && typeof params.race === "string" && params.race !== "president" && params.race.length > 0 && params.race.length <= 256) {
    selectedRace = (await loadRaces(state.code, year)).find(r => r.id === params.race);
  }
  const raceId = selectedRace?.id ?? "president", raceLabel = selectedRace?.label ?? "President";
  const county = typeof params.fips === "string" ? countyByTag("county:" + params.fips) : undefined;
  const focus = county?.state === state.code ? county : undefined;
  const query = new URLSearchParams({ state: state.code, year: String(year), tab: "map", mode: selectedMode });
  if (selectedMode === "votes-3d" && raceId !== "president") query.set("race", raceId);
  if (focus) query.set("fips", focus.fips);
  const [label, description] = modeInfo[selectedMode];
  const title = `${state.name} ${year} · ${selectedMode === "votes-3d" ? raceLabel + " · " : ""}${label}`;
  const imageAlt = `${title}${focus ? " · " + focus.displayName : ""}. ${description}`;
  return { state: state.code, stateName: state.name, year, mode: selectedMode, label, description,
    title, imageAlt, raceId, raceLabel, selectedRace, focus, sharePath: "/?" + query,
    imagePath: "/api/social-card?" + query + "&v=map-modes-2" };
}

export type WorkspaceMapPreview = NonNullable<Awaited<ReturnType<typeof buildWorkspaceMapPreview>>>;
