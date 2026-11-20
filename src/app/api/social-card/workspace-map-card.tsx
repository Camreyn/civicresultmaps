import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { listEquipmentRows, listSecurityIncidents, listVoteMethodRows } from "@/lib/api";
import { buildVotePrisms } from "@/lib/county-vote-prisms";
import { countyVoteColors } from "@/lib/county-vote-style";
import { hasBaseResultGeometry } from "@/lib/map-geometry";
import type { NationalCountyFeatureCollection } from "@/lib/national-county-map";
import { readThumbnailPaths } from "@/lib/social-map-assets";
import { candidateNamesForYear } from "@/lib/state-year-results";
import type { ResultRow, SecurityIncidentSummary } from "@/lib/types";
import { aggregateVoteMethod, countyFill, featureJurisdictionTag, featureName, methodShare, normalizeName, resultNameForFeature } from "@/lib/workspace-map-paint";
import type { WorkspaceMapPreview } from "@/lib/workspace-map-preview";
import { loadPreviewRaces } from "@/lib/workspace-map-preview-data";
import { loadDisplayResults } from "@/lib/workspace-result-data";

const muted = "#a9b4b2";
const number = new Intl.NumberFormat("en-US");
type MapArt = { image: React.ReactNode; statistic: string; caption: string };

async function votePrismArt(card: WorkspaceMapPreview): Promise<MapArt> {
  const [race, file] = await Promise.all([
    card.selectedRace ?? loadPreviewRaces(card.state, card.year, false).then(races => races[0]),
    readFile(path.join(process.cwd(), "public", "data", "national-counties.geojson"), "utf8"),
  ]);
  const features = (JSON.parse(file) as NationalCountyFeatureCollection).features.filter(f => f.properties.STATE === card.state);
  const { prisms, viewBox } = buildVotePrisms(features, race.counties, -12);
  const joined = prisms.filter(p => p.vote);
  const pin = prisms.find(p => p.id === card.focus?.fips);
  const peak = joined.reduce<typeof pin>((best, p) => !best || p.vote!.total > best.vote!.total ? p : best, undefined);
  const highlight = pin ?? peak;
  return {
    statistic: highlight ? `${highlight.name} · ${highlight.vote ? number.format(highlight.vote.total) + " votes" : "No joined total"}` : "No joined county totals",
    caption: `${joined.length} of ${prisms.length} county boundaries have totals. Gray means no joined total.`,
    image: prisms.length ? <svg width="700" height="410" viewBox={viewBox}>
      {prisms.map(p => {
        const [roof, light, dark] = countyVoteColors(p.vote);
        return <g key={p.id}>
          {p.lightWall && <path d={p.lightWall} fill={light} />}
          {p.darkWall && <path d={p.darkWall} fill={dark} />}
          <path d={p.roof} fill={roof} fillRule="evenodd" stroke={pin?.id === p.id ? "#ffffff" : "#151a22"} strokeWidth={pin?.id === p.id ? 2.8 : 0.6} />
        </g>;
      })}
    </svg> : null,
  };
}

async function flatMapArt({ state, year, mode, focus }: WorkspaceMapPreview): Promise<MapArt> {
  const equipment = mode === "equipment", methods = mode === "method", security = mode === "security";
  const [geometry, results, methodRows, equipmentRows, incidents] = await Promise.all([
    readThumbnailPaths(state),
    !equipment && !security && !methods ? loadDisplayResults(state, year) : null,
    methods ? listVoteMethodRows({ state, year, limit: 20000 }) : [],
    equipment ? listEquipmentRows({ state, year, limit: 20000 }) : [],
    security ? listSecurityIncidents({ state, year, limit: 5000 }) : [],
  ]);
  let rows = results ? [results.countyResults, results.cityResults, results.cityTownResults, results.townResults].find(r => r.length) ?? [] : [];
  const supplemental = state === "AK" && year === 2024 && Boolean(results?.stateResults.length) && !rows.length;
  if (supplemental) {
    // Same explicitly supplemental district overlay as the interactive flat map; never assign statewide votes to counties.
    const file = await readFile(path.join(process.cwd(), "data", "ak-2024-legacy-house-district-overlay.json"), "utf8");
    rows = (JSON.parse(file) as { rows: ResultRow[] }).rows;
  }
  // Only that overlay is district-grain. County incidents and results may have colliding five-digit IDs.
  const base = supplemental ? geometry.districts ?? [] : security || hasBaseResultGeometry(state) ? geometry.counties : [];
  const features = equipment && geometry.equipment.length ? geometry.equipment : base;
  const byName = new Map(rows.map(r => [normalizeName(r.jurisdictionName), r]));
  const defaultMethod = methodRows.find(r => r.method === "in_person_early") ?? methodRows[0];
  const methodByName = aggregateVoteMethod(methodRows, defaultMethod?.method ?? "");
  const maxShare = Array.from(methodByName.values()).reduce((max, r) => Math.max(max, methodShare(r) ?? 0), 1);
  const equipmentByName = new Map(equipmentRows.map(r => [normalizeName(r.jurisdictionName), r]));
  const securityByTag = new Map<string, SecurityIncidentSummary[]>();
  const securityByName = new Map<string, SecurityIncidentSummary[]>();
  for (const r of incidents) {
    if (r.reportingGrain !== "county") continue;
    for (const [index, key] of [[securityByTag, r.jurisdictionTag], [securityByName, normalizeName(r.county)]] as const) {
      const group = index.get(key);
      if (group) group.push(r); else index.set(key, [r]);
    }
  }
  const maxVotes = rows.reduce((max, r) => Math.max(max, r.totalVotes), 0);
  let joined = 0, focusMatched = false;
  const shapes = features.map((f, i) => {
    const name = normalizeName(resultNameForFeature(state, featureName(f)));
    const tag = featureJurisdictionTag(f);
    const hits = (tag && securityByTag.get(tag)) || securityByName.get(name) || [];
    const row = byName.get(name);
    const fill = mode !== "volume" && row?.resultStatus === "candidate_detail_suppressed" ? "#2c302e"
      : countyFill(row, mode, maxVotes, methodByName.get(name), equipmentByName.get(name), f, maxShare, hits);
    if (fill !== "#2c302e") joined++;
    const pinned = Boolean(tag && tag === focus?.jurisdictionTag);
    if (pinned) focusMatched = true;
    return <path key={i} d={f.path} fill={fill} fillRule="evenodd"
      stroke={pinned ? "#fff" : "#101515"} strokeWidth={pinned ? 2.8 : 0.75} />;
  });
  const layer = methods ? defaultMethod?.methodLabel ?? "No reported voting method"
    : security ? "County-attributed records" : equipment ? "Reported equipment groups"
    : supplemental ? "Supplemental district results" : "Presidential results";
  return {
    image: shapes.length ? <svg width="700" height="410" viewBox="0 0 700 420">{shapes}</svg> : null,
    statistic: focus ? `${layer} · ${focus.displayName}${focusMatched ? "" : " (no matching boundary)"}` : layer,
    caption: shapes.length ? `${joined} of ${shapes.length} map areas have matching data. Gray means no matching data.` : "Map boundaries unavailable for this view.",
  };
}

export async function renderWorkspaceMapCard(card: WorkspaceMapPreview) {
  const art = card.mode === "votes-3d" ? await votePrismArt(card) : await flatMapArt(card);
  const partyMap = ["winner", "margin", "votes-3d"].includes(card.mode);
  const leads = card.raceId === "president" ? candidateNamesForYear(card.year) : { dem: "Democratic lead", rep: "Republican lead" };
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#101616", color: "#f4f1ea", padding: "38px 42px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#69d9b9" }}>
        <span>Civic Result Maps</span><span>{card.year} / {card.state}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
        <div style={{ width: 388, display: "flex", flexDirection: "column", paddingRight: 22 }}>
          <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1 }}>{card.stateName}</div>
          <div style={{ fontSize: 32, color: "#69d9b9", lineHeight: 1.12, marginTop: 10 }}>{card.label}</div>
          {card.mode === "votes-3d" && <div style={{ fontSize: 25, marginTop: 12 }}>{card.raceLabel}</div>}
          <div style={{ fontSize: 22, color: muted, marginTop: 22 }}>{card.description}</div>
          <div style={{ fontSize: 20, color: "#f0c36a", marginTop: 24 }}>{art.statistic}</div>
        </div>
        <div style={{ display: "flex", width: 720, height: 430, alignItems: "center", justifyContent: "center", background: "#182020", borderRadius: 12 }}>
          {art.image ?? <span style={{ fontSize: 24, color: muted }}>Map boundaries unavailable</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "1px solid #354240", paddingTop: 14, color: muted, fontSize: 18 }}>
        {partyMap ? <div style={{ display: "flex", gap: 12 }}>
          <span style={{ color: "#8eb3ff" }}>Blue: {leads.dem}</span><span style={{ color: "#ffa297" }}>Red: {leads.rep}</span>
        </div> : null}
        <span>{art.caption}</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
