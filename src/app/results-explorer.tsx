"use client";

import { ArrowDownAZ, ArrowUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisIndicator, ResultRow } from "@/lib/types";

type ResultsExplorerProps = {
  countyLabel: string;
  indicators: AnalysisIndicator[];
  results: ResultRow[];
  selectedState: string;
};

type SortKey = "jurisdiction" | "winner" | "total" | "margin";

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

function countyFill(row: ResultRow | undefined) {
  if (!row) {
    return "#2c302e";
  }

  const intensity = Math.min(0.86, Math.max(0.24, row.marginPct / 60));

  if (row.winner === "Harris") {
    return `rgba(130, 184, 255, ${intensity})`;
  }

  if (row.winner === "Trump") {
    return `rgba(255, 143, 126, ${intensity})`;
  }

  return `rgba(240, 195, 106, ${intensity})`;
}

export function ResultsExplorer({ countyLabel, indicators, results, selectedState }: ResultsExplorerProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [geoStatus, setGeoStatus] = useState<"error" | "loading" | "ready">("loading");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("margin");

  useEffect(() => {
    const controller = new AbortController();
    setGeoStatus("loading");

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

  const bounds = useMemo(() => {
    const points = features.flatMap((feature) =>
      flattenPositions(feature.geometry.coordinates).map((coordinate) =>
        mapCoordinate(selectedState, coordinate),
      ),
    );
    return coordinateBounds(points);
  }, [features, selectedState]);

  const visibleResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return results
      .filter((row) => {
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
  }, [query, results, sortKey]);

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
          <span className="status-pill">{selectedState}</span>
        </div>
        <div className="map-wrap">
          {geoStatus === "ready" && features.length > 0 ? (
            <svg className="county-map" role="img" viewBox="0 0 960 560">
              <title>{selectedState} county presidential result map</title>
              {features.map((feature) => {
                const name = featureName(feature);
                const resultName = resultNameForFeature(selectedState, name);
                const row = resultsByName.get(normalizeName(resultName));
                const countyIndicators = indicatorsByName.get(normalizeName(resultName)) ?? [];
                const rings = polygonRings(feature);
                const point = centroid(selectedState, feature, bounds);
                return (
                  <g key={`${selectedState}-${name}`}>
                    <path
                      d={makePath(selectedState, rings, bounds)}
                      fill={countyFill(row)}
                      stroke="#101112"
                      strokeWidth="1"
                    >
                      <title>
                        {name}: {row ? `${row.winner} by ${row.marginPct.toFixed(2)}%` : "No result row"}
                        {countyIndicators.length
                          ? `; ${countyIndicators.length} advisory review flag(s)`
                          : ""}
                      </title>
                    </path>
                    {countyIndicators.length > 0 && (
                      <text
                        aria-hidden
                        className="map-flag-marker"
                        x={point.x.toFixed(2)}
                        y={point.y.toFixed(2)}
                      >
                        !
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="map-empty">
              {geoStatus === "loading" ? "Loading map geometry..." : "Map geometry is not available yet."}
            </div>
          )}
        </div>
        <div className="map-legend" aria-label="Map legend">
          <span className="legend-item legend-harris">Harris</span>
          <span className="legend-item legend-trump">Trump</span>
          <span className="legend-item legend-flag">Review flag</span>
          <span className="legend-note">Darker fill means wider margin.</span>
        </div>
      </div>

      <section className="panel" aria-label={`${selectedState} county results table`}>
        <div className="panel-header">
          <div>
            <h2>{countyLabel} Results</h2>
            <span>{visibleResults.length} visible reporting jurisdictions</span>
          </div>
          <span className="status-pill">
            <ArrowUpDown aria-hidden size={14} />
            Sort
          </span>
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
        </div>
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
              </tr>
            </thead>
            <tbody>
              {visibleResults.map((row) => (
                <tr key={row.jurisdictionCode}>
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
                  <td className="mono">{row.sourceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
