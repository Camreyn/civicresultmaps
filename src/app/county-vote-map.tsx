"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CountyVoteRace } from "@/lib/county-vote-races";
import type { NationalCountyFeature, NationalCountyFeatureCollection } from "@/lib/national-county-map";
import { buildVotePrisms, voteMapBox, type VotePrism } from "@/lib/county-vote-prisms";
import { notifyWorkspaceContextChange } from "@/lib/workspace-navigation";
import type { SourceSummary } from "@/lib/types";
import { countyVoteColors, palette } from "@/lib/county-vote-style";
import styles from "./county-vote-map.module.css";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });
const number = new Intl.NumberFormat("en-US");
function describe(p: VotePrism) {
  return p.vote ? `${number.format(p.vote.total)} votes · ${p.vote.outcome}` : "No joined county total";
}

function changeQuery(key: "race" | "fips", value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
  notifyWorkspaceContextChange(key === "fips" ? { fips: value || null } : { race: value || null });
}

// Keep labels above all roofs, and avoid labeling two overlapping peaks.
function peakLabels(prisms: VotePrism[], inspected?: VotePrism) {
  const ordered = prisms.filter(p => p.vote && p.vote.total > 0).sort((a, b) => b.height - a.height);
  const labels: { p: VotePrism; x: number; y: number; halfWidth: number }[] = [];
  for (const p of inspected ? [inspected, ...ordered] : ordered) {
    const halfWidth = Math.min(150, Math.max(49, p.name.length * 4.6));
    if (labels.some(l => l.p === p)) continue;
    for (const [dx,dy] of [[0,-28],[-38,-54],[38,-54],[-55,-12],[55,-12]]) {
      const x = Math.max(halfWidth + 6, Math.min(voteMapBox.width - halfWidth - 6, p.anchor[0] + dx));
      const y = Math.min(voteMapBox.height - 38, Math.max(24, p.anchor[1] + dy));
      if (labels.some(l => Math.abs(l.y - y) < 36 && Math.abs(l.x - x) < l.halfWidth + halfWidth + 4)) continue;
      labels.push({ p, x, y, halfWidth }); break;
    }
    if (labels.length === 4) break;
  }
  return labels;
}

export function CountyVoteMap({ state, year, races, sources }: {
  state: string; year: number; races: CountyVoteRace[]; sources: SourceSummary[];
}) {
  const params = useSearchParams();
  const race = races.find(r => r.id === params.get("race")) ?? races[0];
  const [features, setFeatures] = useState<NationalCountyFeature[] | null>(null);
  const [error, setError] = useState(false);
  const [bearing, setBearing] = useState(-12);
  const [hover, setHover] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/national-counties.geojson", { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error("County geometry unavailable");
        const data: NationalCountyFeatureCollection = await res.json();
        if (!controller.signal.aborted) setFeatures(data.features.filter(f => f.properties.STATE === state));
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [state]);
  const { prisms, peak, viewBox } = useMemo(() => buildVotePrisms(features ?? [], race.counties, bearing), [features, race, bearing]);
  const alphabetical = useMemo(() => prisms.slice().sort((a,b) => a.name.localeCompare(b.name)), [prisms]);
  const pinned = prisms.find(p => p.id === params.get("fips"));
  const inspected = pinned ?? prisms.find(p => p.id === hover);
  const labels = peakLabels(prisms, inspected);
  const joined = prisms.filter(p => p.vote).length;
  const sourceId = inspected?.vote?.sourceId;
  const source = sourceId ? (sources.find(s => s.id === sourceId)
    ?? sources.find(s => s.state === state && s.id === `${state.toLowerCase()}-${s.electionYear}-${sourceId}`)) : undefined;
  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <label>Map race
          <select id="county-vote-race" aria-label="3D map race" value={race.id} onChange={e => changeQuery("race", e.target.value)}>
            {races.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label>Inspect county
          <select id="county-vote-selection" aria-label="Inspect 3D county" value={pinned?.id ?? ""} onChange={e => changeQuery("fips", e.target.value)}>
            <option value="">All counties</option>
            {alphabetical.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Rotate view
          <input aria-label="Rotate 3D map" type="range" min="-180" max="180" step="3" value={bearing} onChange={e => setBearing(Number(e.target.value))} />
        </label>
      </div>
      <div className={styles.scene}>
        <div className={styles.caption}><span>{state} / {year}</span><strong>{race.label}</strong></div>
        {features?.length ? (
          <svg viewBox={viewBox} role="group" aria-label={`${state} ${year} ${race.label} 3D county votes`}>
            {prisms.map(p => {
              const [roof, light, dark] = countyVoteColors(p.vote);
              return <g key={p.id} role="button" tabIndex={0} aria-label={p.name + ": " + describe(p)} aria-pressed={pinned?.id === p.id}
                className={styles.county} data-active={inspected?.id === p.id} data-fips={p.id}
                onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover("")}
                onFocus={() => setHover(p.id)} onBlur={() => setHover("")}
                onClick={() => changeQuery("fips", p.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); changeQuery("fips", p.id); }
                  if (e.key === "Escape") changeQuery("fips", "");
                }}>
                <title>{p.name}: {describe(p)}</title>
                {p.height > 0 && <><path d={p.lightWall} fill={light} /><path d={p.darkWall} fill={dark} /></>}
                <path className={styles.roof} d={p.roof} fill={roof} fillRule="evenodd" />
              </g>;
            })}
            <g aria-hidden="true" className={styles.labels}>
              {labels.map(({ p, x, y }) => <g key={p.id}>
                <line x1={p.anchor[0]} y1={p.anchor[1]} x2={x} y2={y + 15} />
                <text x={x} y={y}>{p.name}</text>
                <text x={x} y={y + 14} className={styles.labelVotes}>{p.vote ? compact.format(p.vote.total) + " votes" : "No total"}</text>
              </g>)}
            </g>
          </svg>
        ) : <p role="status" className={styles.empty}>{error || features ? "County boundaries unavailable." : "Loading county boundaries…"}</p>}
      </div>
      <div className={styles.readout} aria-live="polite">
        <strong>{inspected?.name ?? "Inspect a county"}</strong>
        <span>{inspected ? describe(inspected) : "Hover, focus or select a county for its exact count and source."}</span>
        {inspected?.vote && (source?.sourceUrl
          ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" title={source.confidence}>{source.authority || source.title} ↗</a>
          : <small>Source: {inspected.vote.sourceId}</small>)}
        {pinned && <button type="button" onClick={() => changeQuery("fips", "")}>Clear selection</button>}
      </div>
      {source && source.confidence && <p className={styles.note}>Source note: {source.confidence}</p>}
      <div className={styles.legend} aria-label="3D map legend">
        {(["dem","rep","neutral","missing"] as const).map((key, i) => <span key={key}><i style={{background: palette[key][0]}} />{["Democratic lead","Republican lead","Other, tie or unknown","No joined total"][i]}</span>)}
      </div>
      <p className={styles.note}>Height shows votes in this race, not population density or turnout. The scale is linear and resets for each state, year and race. Deeper red or blue means a larger winning share.
        {features?.length ? ` ${joined} of ${prisms.length} county boundaries have totals.${peak ? " Tallest: " + number.format(peak) + " votes." : ""}` : ""}</p>
      {features?.length && !joined ? <p className={styles.warning} role="status">No county totals are available for this race here. Statewide or district votes are not assigned to counties.</p> : null}
      {race.basis === "County comparison" && <p className={styles.note}>County comparison: heights sum the reported Democratic, Republican and other votes for the named race. Precinct samples and district comparisons are excluded.</p>}
    </div>
  );
}
