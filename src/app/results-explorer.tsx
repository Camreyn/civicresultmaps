"use client";

import { ArrowDownAZ, ArrowUpDown, ExternalLink, RotateCcw, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Eli5 } from "./eli5";
import type { AnalysisIndicator, ResultRow, SourceSummary } from "@/lib/types";

type ResultsExplorerProps = {
  countyLabel: string;
  indicators: AnalysisIndicator[];
  results: ResultRow[];
  selectedState: string;
  sources: SourceSummary[];
};

type SortKey = "jurisdiction" | "winner" | "total" | "margin";
type MapMode = "winner" | "margin" | "volume";

type GeoFeature = {
  geometry: {
    coordinates: unknown;
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    BASENAME?: string;
    NAME?: string;
    county_name?: string;
  };
};

type FeatureCollection = {
  features: GeoFeature[];
  type: "FeatureCollection";
};

const geoBaseUrl =
  "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data";

function geoJsonPath(state: string) {
  if (state === "AK") {
    return "ak-house-districts.geojson";
  }

  return `${state.toLowerCase()}-counties.geojson`;
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSaint\b/gi, "St")
    .replace(/\bMore\b.*$/i, "")
    .replace(/Â»/g, "")
    .replace(/\s+(County|Parish|Planning Region)$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function featureName(feature: GeoFeature) {
  return feature.properties.NAME ?? feature.properties.county_name ?? feature.properties.BASENAME ?? "";
}

function resultNameForFeature(state: string, name: string) {
  if (state === "HI" && normalizeName(name) === "KALAWAO") {
    return "Maui";
  }

  return name;
}

function compareRows(a: ResultRow, b: ResultRow, sortKey: SortKey) {
  if (sortKey === "winner") {
    return a.winner.localeCompare(b.winner) || a.jurisdictionName.localeCompare(b.jurisdictionName);
  }

  if (sortKey === "total") {
    return b.totalVotes - a.totalVotes;
  }

  if (sortKey === "margin") {
    return b.marginPct - a.marginPct;
  }

  return a.jurisdictionName.localeCompare(b.jurisdictionName);
}

function flattenPositions(coordinates: unknown): number[][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return [coordinates as number[]];
  }

  return coordinates.flatMap((item) => flattenPositions(item));
}

function mapCoordinate(state: string, [lon, lat]: number[]) {
  if (state === "AK" && lon > 0) {
    return [lon - 360, lat];
  }

  return [lon, lat];
}

function polygonRings(feature: GeoFeature): number[][][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates as number[][][];
  }

  return (feature.geometry.coordinates as number[][][][]).flat();
}

function makePath(
  state: string,
  rings: number[][][],
  bounds: { maxX: number; maxY: number; minX: number; minY: number },
) {
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(920 / width, 520 / height);
  const offsetX = (960 - width * scale) / 2;
  const offsetY = (560 - height * scale) / 2;

  return rings
    .map((ring) =>
      ring
        .map((coordinate, index) => {
          const [lon, lat] = mapCoordinate(state, coordinate);
          const x = offsetX + (lon - bounds.minX) * scale;
          const y = offsetY + (bounds.maxY - lat) * scale;
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ")
        .concat(" Z"),
    )
    .join(" ");
}

function projectPoint([lon, lat]: number[], bounds: { maxX: number; maxY: number; minX: number; minY: number }) {
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(920 / width, 520 / height);
  const offsetX = (960 - width * scale) / 2;
  const offsetY = (560 - height * scale) / 2;

  return {
    x: offsetX + (lon - bounds.minX) * scale,
    y: offsetY + (bounds.maxY - lat) * scale,
  };
}

function centroid(
  state: string,
  feature: GeoFeature,
  bounds: { maxX: number; maxY: number; minX: number; minY: number },
) {
  const positions = flattenPositions(feature.geometry.coordinates).map((coordinate) =>
    mapCoordinate(state, coordinate),
  );
  const lon = average(positions.map(([x]) => x));
  const lat = average(positions.map(([, y]) => y));
  return projectPoint([lon, lat], bounds);
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function coordinateBounds(points: number[][]) {
  return points.reduce(
    (bounds, [lon, lat]) => ({
      maxX: Math.max(bounds.maxX, lon),
      maxY: Math.max(bounds.maxY, lat),
      minX: Math.min(bounds.minX, lon),
      minY: Math.min(bounds.minY, lat),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const t = clamp(amount, 0, 1);
  const [r1, g1, b1] = start;
  const [r2, g2, b2] = end;
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(
    b1 + (b2 - b1) * t,
  )})`;
}

function countyFill(row: ResultRow | undefined, mode: MapMode, maxTotalVotes: number) {
  if (!row) {
    return "#2c302e";
  }

  if (mode === "volume") {
    const intensity = Math.min(0.88, Math.max(0.18, row.totalVotes / Math.max(1, maxTotalVotes)));
    return `rgba(240, 195, 106, ${intensity})`;
  }

  const strength = mode === "margin" ? clamp(row.marginPct / 42, 0, 1) : clamp(row.marginPct / 60, 0, 1);

  if (row.winner === "Harris") {
    return mixColor([191, 219, 254], [29, 78, 216], strength);
  }

  if (row.winner === "Trump") {
    return mixColor([254, 202, 202], [220, 38, 38], strength);
  }

  return "#f0c36a";
}

export function ResultsExplorer({
  countyLabel,
  indicators,
  results,
  selectedState,
  sources,
}: ResultsExplorerProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [geoStatus, setGeoStatus] = useState<"error" | "loading" | "ready">("loading");
  const [mapMode, setMapMode] = useState<MapMode>("winner");
  const [mapZoom, setMapZoom] = useState(1);
  const [selectedMapName, setSelectedMapName] = useState<string | null>(null);
  const [pinnedMapName, setPinnedMapName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("margin");

  useEffect(() => {
    const controller = new AbortController();
    setGeoStatus("loading");
    setSelectedMapName(null);
    setPinnedMapName(null);
    setMapZoom(1);

    fetch(`${geoBaseUrl}/${geoJsonPath(selectedState)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GeoJSON request failed with ${response.status}`);
        }

        return response.json() as Promise<FeatureCollection>;
      })
      .then((collection) => {
        setFeatures(collection.features ?? []);
        setGeoStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setFeatures([]);
          setGeoStatus("error");
        }
      });

    return () => controller.abort();
  }, [selectedState]);

  const resultsByName = useMemo(() => {
    const map = new Map<string, ResultRow>();
    for (const row of results) {
      map.set(normalizeName(row.jurisdictionName), row);
    }
    return map;
  }, [results]);

  const indicatorsByJurisdiction = useMemo(() => {
    const map = new Map<string, AnalysisIndicator[]>();
    for (const indicator of indicators) {
      map.set(indicator.jurisdictionCode, [
        ...(map.get(indicator.jurisdictionCode) ?? []),
        indicator,
      ]);
    }
    return map;
  }, [indicators]);

  const indicatorsByName = useMemo(() => {
    const map = new Map<string, AnalysisIndicator[]>();
    for (const indicator of indicators) {
      map.set(normalizeName(indicator.jurisdictionName), [
        ...(map.get(normalizeName(indicator.jurisdictionName)) ?? []),
        indicator,
      ]);
    }
    return map;
  }, [indicators]);

  const sourceById = useMemo(() => {
    const map = new Map<string, SourceSummary>();
    for (const source of sources) {
      map.set(source.id, source);
    }
    return map;
  }, [sources]);

  const bounds = useMemo(() => {
    const points = features.flatMap((feature) =>
      flattenPositions(feature.geometry.coordinates).map((coordinate) =>
        mapCoordinate(selectedState, coordinate),
      ),
    );
    return coordinateBounds(points);
  }, [features, selectedState]);

  const maxTotalVotes = useMemo(
    () => results.reduce((max, row) => Math.max(max, row.totalVotes), 0),
    [results],
  );

  const activeMapName = pinnedMapName ?? selectedMapName;
  const selectedMapResult = activeMapName
    ? resultsByName.get(normalizeName(activeMapName))
    : undefined;
  const selectedMapIndicators = activeMapName
    ? indicatorsByName.get(normalizeName(activeMapName)) ?? []
    : [];
  const selectedSource = selectedMapResult ? sourceById.get(selectedMapResult.sourceId) : undefined;
  const pinnedMapResult = pinnedMapName ? resultsByName.get(normalizeName(pinnedMapName)) : undefined;
  const pinnedMapIndicators = pinnedMapName ? indicatorsByName.get(normalizeName(pinnedMapName)) ?? [] : [];
  const pinnedSource = pinnedMapResult ? sourceById.get(pinnedMapResult.sourceId) : undefined;

  const mapJoinStats = useMemo(() => {
    const featureNames = new Set(
      features.map((feature) => normalizeName(resultNameForFeature(selectedState, featureName(feature)))),
    );
    const missingResults = features
      .map((feature) => resultNameForFeature(selectedState, featureName(feature)))
      .filter((name) => !resultsByName.has(normalizeName(name)))
      .sort((a, b) => a.localeCompare(b));
    const unmappedRows = results
      .filter((row) => !featureNames.has(normalizeName(row.jurisdictionName)))
      .map((row) => row.jurisdictionName)
      .sort((a, b) => a.localeCompare(b));

    return { missingResults, unmappedRows };
  }, [features, results, resultsByName, selectedState]);

  const visibleResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return results
      .filter((row) => {
        if (showFlaggedOnly && !(indicatorsByJurisdiction.get(row.jurisdictionCode) ?? []).length) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return (
          row.jurisdictionName.toLowerCase().includes(normalizedQuery) ||
          row.winner.toLowerCase().includes(normalizedQuery) ||
          row.sourceId.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => compareRows(a, b, sortKey));
  }, [indicatorsByJurisdiction, query, results, showFlaggedOnly, sortKey]);

  const hasMapJoinWarnings =
    geoStatus === "ready" && (mapJoinStats.missingResults.length > 0 || mapJoinStats.unmappedRows.length > 0);

  const selectedSourceUrl = (sourceId: string) => sourceById.get(sourceId)?.sourceUrl;
  const mapTransform = `translate(480 280) scale(${mapZoom}) translate(-480 -280)`;

  const inspectJurisdiction = (name: string) => {
    setSelectedMapName(name);
    setPinnedMapName(name);
  };

  const clearPinnedJurisdiction = () => {
    setPinnedMapName(null);
  };

  return (
    <section className="results-explorer" aria-label={`${selectedState} result explorer`}>
      <div className="panel map-panel" aria-label={`${selectedState} county map`}>
        <div className="panel-header">
          <div>
            <h2>{countyLabel} Map</h2>
            <span>
              {geoStatus === "ready"
                ? `${features.length} boundaries, ${indicators.length} advisory review flags`
                : geoStatus === "loading"
                  ? "Loading repository GeoJSON"
                  : "Map geometry unavailable"}
            </span>
          </div>
          <div className="header-actions">
            <Eli5>
              This map is like coloring a school map by who got more votes in each place. Click one area to see the
              vote totals and whether the imported review data says someone should look closer.
            </Eli5>
            <span className="status-pill">{selectedState}</span>
          </div>
        </div>
        <div className="map-control-row" aria-label="Map display controls">
          <div className="mode-control" aria-label="Map display mode">
            {[
              ["winner", "Winner"],
              ["margin", "Margin"],
              ["volume", "Votes"],
            ].map(([mode, label]) => (
              <button
                aria-pressed={mapMode === mode}
                key={mode}
                onClick={() => setMapMode(mode as MapMode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="map-readout">
            <strong>{activeMapName ?? "Hover a boundary"}</strong>
            <span>
              {selectedMapResult
                ? `${selectedMapResult.winner} by ${selectedMapResult.marginPct.toFixed(2)}% · ${selectedMapResult.totalVotes.toLocaleString()} votes`
                : "Winner, margin, and review flags appear here."}
            </span>
          </div>
        </div>
        {hasMapJoinWarnings && (
          <div className="map-warning" role="status">
            <strong>Map join needs review</strong>
            <span>
              {mapJoinStats.missingResults.length} boundaries lack result rows;{" "}
              {mapJoinStats.unmappedRows.length} result rows are not on the map.
            </span>
          </div>
        )}
        <div className="map-wrap">
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button
              aria-label="Zoom in"
              disabled={mapZoom >= 3}
              onClick={() => setMapZoom((zoom) => Math.min(3, Number((zoom + 0.35).toFixed(2))))}
              type="button"
            >
              <ZoomIn aria-hidden size={16} />
            </button>
            <button
              aria-label="Zoom out"
              disabled={mapZoom <= 1}
              onClick={() => setMapZoom((zoom) => Math.max(1, Number((zoom - 0.35).toFixed(2))))}
              type="button"
            >
              <ZoomOut aria-hidden size={16} />
            </button>
            <button
              aria-label="Reset zoom"
              disabled={mapZoom === 1}
              onClick={() => setMapZoom(1)}
              type="button"
            >
              <RotateCcw aria-hidden size={16} />
            </button>
            <span>{Math.round(mapZoom * 100)}%</span>
          </div>
          {geoStatus === "ready" && features.length > 0 ? (
            <svg className="county-map" role="img" viewBox="0 0 960 560">
              <title>{selectedState} county presidential result map</title>
              <g transform={mapTransform}>
              {features.map((feature) => {
                const name = featureName(feature);
                const resultName = resultNameForFeature(selectedState, name);
                const row = resultsByName.get(normalizeName(resultName));
                const countyIndicators = indicatorsByName.get(normalizeName(resultName)) ?? [];
                const rings = polygonRings(feature);
                const point = centroid(selectedState, feature, bounds);
                const isSelected = selectedMapName && normalizeName(selectedMapName) === normalizeName(resultName);
                const isPinned = pinnedMapName && normalizeName(pinnedMapName) === normalizeName(resultName);
                return (
                  <g key={`${selectedState}-${name}`}>
                    <path
                      aria-label={`${name}${row ? `, ${row.winner} by ${row.marginPct.toFixed(2)} percent` : ""}`}
                      className={isPinned ? "map-shape pinned" : isSelected ? "map-shape selected" : "map-shape"}
                      d={makePath(selectedState, rings, bounds)}
                      fill={countyFill(row, mapMode, maxTotalVotes)}
                      onClick={() => inspectJurisdiction(resultName)}
                      onFocus={() => setSelectedMapName(resultName)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          inspectJurisdiction(resultName);
                        }
                      }}
                      onMouseEnter={() => setSelectedMapName(resultName)}
                      role="button"
                      stroke="#101112"
                      strokeWidth="1"
                      tabIndex={0}
                    >
                      <title>
                        {name}: {row ? `${row.winner} by ${row.marginPct.toFixed(2)}%` : "No result row"}
                        {countyIndicators.length
                          ? `; ${countyIndicators.length} advisory review flag(s)`
                          : ""}
                      </title>
                    </path>
                    {countyIndicators.length > 0 && (
                      <g aria-hidden className="map-flag-marker">
                        <circle cx={point.x.toFixed(2)} cy={point.y.toFixed(2)} r="9" />
                        <text x={point.x.toFixed(2)} y={point.y.toFixed(2)}>
                          {countyIndicators.length}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              </g>
            </svg>
          ) : (
            <div className="map-empty">
              {geoStatus === "loading" ? "Loading map geometry..." : "Map geometry is not available yet."}
            </div>
          )}
        </div>
        <div className="map-legend" aria-label="Map legend">
          {mapMode !== "volume" && (
            <div className="margin-scale-legend" aria-label="Winner margin color scale">
              <div className="margin-scale-bar" aria-hidden />
              <div className="margin-scale-labels">
                <span>Strong Harris Win</span>
                <span>Weak Harris Win</span>
                <span>Weak Trump Win</span>
                <span>Strong Trump Win</span>
              </div>
            </div>
          )}
          <span className="legend-item legend-volume">Vote volume</span>
          <span className="legend-item legend-missing">No joined result</span>
          <span className="legend-item legend-flag">Advisory count</span>
          {mapMode === "volume" && <span className="legend-note">Gold intensity shows total vote volume.</span>}
          <span className="legend-note">Badge numbers count advisory indicators, not confirmed findings.</span>
          {selectedMapIndicators.length > 0 && (
            <span className="legend-note">
              {selectedMapIndicators.length} advisory flag{selectedMapIndicators.length === 1 ? "" : "s"} selected
            </span>
          )}
        </div>
        <aside className="jurisdiction-drawer" aria-label="Selected jurisdiction details">
          <div className="drawer-helper">
            <Eli5>
              This box is the receipt for the place you clicked. It shows who got votes, who won, where the numbers came
              from, and whether any advisory flags are attached.
            </Eli5>
          </div>
          <div>
            <span className="section-label">Selected Jurisdiction</span>
            <h3>{activeMapName ?? "Select a boundary"}</h3>
            <p>
              {selectedMapResult
                ? `${selectedMapResult.winner} won by ${selectedMapResult.marginVotes.toLocaleString()} votes (${selectedMapResult.marginPct.toFixed(2)}%).`
                : "Click a county, district, or reporting boundary to inspect vote totals, review indicators, and source provenance."}
            </p>
          </div>
          {selectedMapResult && (
            <>
              <dl className="jurisdiction-stats">
                <div>
                  <dt>Harris</dt>
                  <dd>{(selectedMapResult.votes.Harris ?? 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Trump</dt>
                  <dd>{(selectedMapResult.votes.Trump ?? 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{selectedMapResult.totalVotes.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Flags</dt>
                  <dd>{selectedMapIndicators.length}</dd>
                </div>
              </dl>
              <div className="drawer-source">
                <strong>{selectedSource?.title ?? selectedMapResult.sourceId}</strong>
                <span>{selectedSource?.authority ?? "Source record not matched in this API response."}</span>
                {selectedSource?.sourceUrl && (
                  <a href={selectedSource.sourceUrl} rel="noreferrer" target="_blank">
                    <ExternalLink aria-hidden size={14} />
                    Open source
                  </a>
                )}
              </div>
              <div className="drawer-indicators">
                {selectedMapIndicators.length ? (
                  selectedMapIndicators.map((indicator) => (
                    <article key={indicator.id}>
                      <span className="indicator-pill">! {indicator.label}</span>
                      <strong>{indicator.summary}</strong>
                      <small>{indicator.detail}</small>
                    </article>
                  ))
                ) : (
                  <span className="no-indicator">No advisory indicators loaded for this jurisdiction.</span>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <section className="panel" aria-label={`${selectedState} county results table`}>
        <div className="panel-header">
          <div>
            <h2>{countyLabel} Results</h2>
            <span>{visibleResults.length} visible reporting jurisdictions</span>
          </div>
          <div className="header-actions">
            <Eli5>
              This table is the spreadsheet version of the map. Each row is one jurisdiction, and sorting or filtering
              helps find the biggest margins, highest vote totals, or places with advisory flags.
            </Eli5>
            <span className="status-pill">
              <ArrowUpDown aria-hidden size={14} />
              Sort
            </span>
          </div>
        </div>
        <div className="table-tools">
          <label className="table-search" htmlFor="result-search">
            <Search aria-hidden size={16} />
            <input
              autoComplete="off"
              id="result-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${countyLabel.toLowerCase()} results`}
              type="search"
              value={query}
            />
          </label>
          <label className="sort-select-label" htmlFor="result-sort">
            <ArrowDownAZ aria-hidden size={16} />
            <select
              className="sort-select"
              id="result-sort"
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              value={sortKey}
            >
              <option value="margin">Margin</option>
              <option value="total">Total votes</option>
              <option value="jurisdiction">Jurisdiction</option>
              <option value="winner">Winner</option>
            </select>
          </label>
          <label className="toggle-label" htmlFor="flagged-only">
            <input
              checked={showFlaggedOnly}
              id="flagged-only"
              onChange={(event) => setShowFlaggedOnly(event.target.checked)}
              type="checkbox"
            />
            Flagged only
          </label>
        </div>
        {pinnedMapName && pinnedMapResult && (
          <div className="selected-result-callout" role="status">
            <div>
              <span className="section-label">Selected From Map</span>
              <strong>{pinnedMapName}</strong>
              <span>
                {pinnedMapResult.winner} by {pinnedMapResult.marginVotes.toLocaleString()} votes (
                {pinnedMapResult.marginPct.toFixed(2)}%) · {pinnedMapResult.totalVotes.toLocaleString()} total votes
              </span>
            </div>
            <div className="selected-result-actions">
              <span>{pinnedMapIndicators.length} advisory flags</span>
              {pinnedSource?.sourceUrl && (
                <a href={pinnedSource.sourceUrl} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden size={14} />
                  Source
                </a>
              )}
              <button aria-label="Clear selected county" onClick={clearPinnedJurisdiction} type="button">
                <X aria-hidden size={15} />
              </button>
            </div>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                  <th>Jurisdiction</th>
                  <th>Flags</th>
                  <th>Winner</th>
                <th>Harris</th>
                <th>Trump</th>
                <th>Total</th>
                <th>Margin</th>
                <th>Source</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {visibleResults.map((row) => {
                const isPinnedRow = pinnedMapName && normalizeName(row.jurisdictionName) === normalizeName(pinnedMapName);
                const isPreviewRow =
                  !isPinnedRow && selectedMapName && normalizeName(row.jurisdictionName) === normalizeName(selectedMapName);

                return (
                <tr className={isPinnedRow ? "selected-row" : isPreviewRow ? "preview-row" : undefined} key={row.jurisdictionCode}>
                  <td>{row.jurisdictionName}</td>
                  <td>
                    {(indicatorsByJurisdiction.get(row.jurisdictionCode) ?? []).length > 0 ? (
                      <div className="indicator-stack">
                        {(indicatorsByJurisdiction.get(row.jurisdictionCode) ?? []).map((indicator) => (
                          <span className="indicator-pill" key={indicator.id} title={indicator.detail}>
                            ! {indicator.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="no-indicator">-</span>
                    )}
                  </td>
                  <td className={row.winner === "Harris" ? "winner-harris" : "winner-trump"}>
                    {row.winner}
                  </td>
                  <td className="mono">{(row.votes.Harris ?? 0).toLocaleString()}</td>
                  <td className="mono">{(row.votes.Trump ?? 0).toLocaleString()}</td>
                  <td className="mono">{row.totalVotes.toLocaleString()}</td>
                  <td className="mono">
                    {row.marginVotes.toLocaleString()} ({row.marginPct.toFixed(2)}%)
                  </td>
                  <td className="mono">
                    {selectedSourceUrl(row.sourceId) ? (
                      <a className="table-source-link" href={selectedSourceUrl(row.sourceId)} rel="noreferrer" target="_blank">
                        {row.sourceId}
                      </a>
                    ) : (
                      row.sourceId
                    )}
                  </td>
                  <td className="mono">
                    <button
                      className="table-link-button"
                      onClick={() => inspectJurisdiction(row.jurisdictionName)}
                      type="button"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
