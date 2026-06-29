"use client";

import {
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eli5 } from "./eli5";
import { hasBaseResultGeometry } from "@/lib/map-geometry";
import type { AnalysisIndicator, EquipmentRowSummary, ResultRow, SourceSummary, VoteMethodRowSummary } from "@/lib/types";

type ResultsExplorerProps = {
  countyLabel: string;
  equipmentRows: EquipmentRowSummary[];
  indicators: AnalysisIndicator[];
  results: ResultRow[];
  selectedState: string;
  sources: SourceSummary[];
  voteMethodRows: VoteMethodRowSummary[];
};

type SortKey = "jurisdiction" | "winner" | "total" | "margin";
type MapMode = "winner" | "margin" | "volume" | "method" | "equipment";
type MapPan = { x: number; y: number };

type GeoFeature = {
  geometry: {
    coordinates: unknown;
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    BASENAME?: string;
    NAME?: string;
    equipmentGroupLabel?: string;
    jurisdictionName?: string;
    county_name?: string;
    [key: string]: unknown;
  };
};

type FeatureCollection = {
  features: GeoFeature[];
  type: "FeatureCollection";
};

const geoBaseUrl =
  "https://raw.githubusercontent.com/Camreyn/civicresultmaps/main/data";
const mapViewBox = { height: 560, width: 960 };
const mapZoomStep = 0.35;
const mapMaxZoom = 3;
const mapPanStep = 72;

function geoJsonPath(state: string) {
  if (state === "AK") {
    return "ak-house-districts.geojson";
  }

  return `${state.toLowerCase()}-counties.geojson`;
}

function verifiedVotingAreaPath(state: string) {
  return `verifiedvoting-${state.toLowerCase()}-2024-equipment-areas.geojson`;
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
  return feature.properties.jurisdictionName ?? feature.properties.NAME ?? feature.properties.county_name ?? feature.properties.BASENAME ?? "";
}

function resultNameForFeature(state: string, name: string) {
  if (state === "HI" && normalizeName(name) === "KALAWAO") {
    return "Maui";
  }
  if (state === "MS" && normalizeName(name) === "JEFFERSONDAVIS") {
    return "Jeff Davis County";
  }

  return name;
}

function isNonGeographicResultRow(state: string, name: string) {
  const normalized = normalizeName(name);
  return (
    (state === "ME" && normalized === "STATEUOCAVA") ||
    (state === "MO" && normalized === "KANSASCITY") ||
    (state === "RI" && normalized === "FEDERALPRECINCTS")
  );
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

function metricNumber(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function possibleFlagBenefit(indicators: AnalysisIndicator[]) {
  if (!indicators.length) {
    return { label: "-", title: "No advisory indicators are loaded for this jurisdiction." };
  }

  let harrisSignals = 0;
  let trumpSignals = 0;
  let harrisShareSignals = 0;
  let trumpShareSignals = 0;
  const evidence: string[] = [];
  const shareEvidence: string[] = [];
  const coverageModes = new Set<string>();
  let lowConfidenceDirectional = false;
  let lowConfidenceReason = "";

  for (const indicator of indicators) {
    const coverageMode = indicator.metrics.comparisonCoverageMode;
    if (typeof coverageMode === "string" && coverageMode) {
      coverageModes.add(coverageMode);
    }
    if (indicator.metrics.directionalScreenConfidence === "low") {
      lowConfidenceDirectional = true;
      const reason = indicator.metrics.directionalScreenReason;
      if (!lowConfidenceReason && typeof reason === "string") {
        lowConfidenceReason = reason;
      }
    }

    const demAverageDropoff = metricNumber(indicator.metrics, "demAverageDropoff");
    const repAverageDropoff = metricNumber(indicator.metrics, "repAverageDropoff");
    if (indicator.type.includes("down_ballot")) {
      if (demAverageDropoff !== null && demAverageDropoff !== 0) {
        const points = Math.abs(demAverageDropoff);
        if (demAverageDropoff > 0) {
          harrisSignals += points;
        } else {
          trumpSignals += points;
        }
        evidence.push(`DEM presidential-vs-comparison gap ${demAverageDropoff.toFixed(2)} points`);
      }

      if (repAverageDropoff !== null && repAverageDropoff !== 0) {
        const points = Math.abs(repAverageDropoff);
        if (repAverageDropoff > 0) {
          trumpSignals += points;
        } else {
          harrisSignals += points;
        }
        evidence.push(`REP presidential-vs-comparison gap ${repAverageDropoff.toFixed(2)} points`);
      }
    }

    if (indicator.type === "vote_share_pattern") {
      const harrisCorrelation = metricNumber(indicator.metrics, "harrisCorrelation");
      const trumpCorrelation = metricNumber(indicator.metrics, "trumpCorrelation");
      if (harrisCorrelation !== null) {
        harrisShareSignals += Math.max(0, harrisCorrelation);
        shareEvidence.push(`Harris share r=${harrisCorrelation.toFixed(3)}`);
      }
      if (trumpCorrelation !== null) {
        trumpShareSignals += Math.max(0, trumpCorrelation);
        shareEvidence.push(`Trump share r=${trumpCorrelation.toFixed(3)}`);
      }
    }
  }

  const hasHouseComparison = Array.from(coverageModes).some((mode) => /house/i.test(mode));

  if (harrisSignals > 0 || trumpSignals > 0) {
    const caveat = hasHouseComparison
      ? "U.S. House races are district- and candidate-specific controls, so this label names presidential-over-House dropoff direction instead of candidate benefit."
      : lowConfidenceDirectional
        ? `The loaded comparison mode is limited, so this label should not be treated as a candidate-benefit inference${lowConfidenceReason ? `: ${lowConfidenceReason}` : ""}.`
        : "It summarizes which candidate's same-party presidential total is higher relative to the comparison contest in loaded review rows.";
    const title = `Advisory directional screen only. ${caveat} It is not proof of interference, causation, or actual benefit. ${evidence.slice(0, 3).join("; ")}.`;

    if (harrisSignals > trumpSignals * 1.2) {
      return { label: hasHouseComparison ? "DEM pres > House" : lowConfidenceDirectional ? "Harris / DEM (low)" : "Harris / DEM", title };
    }

    if (trumpSignals > harrisSignals * 1.2) {
      return { label: hasHouseComparison ? "REP pres > House" : lowConfidenceDirectional ? "Trump / REP (low)" : "Trump / REP", title };
    }

    return { label: hasHouseComparison ? "Mixed House gap" : "Mixed", title };
  }

  if (harrisShareSignals > 0 || trumpShareSignals > 0) {
    const title = `Vote-share-only advisory screen. No same-row down-ballot comparison is loaded for this jurisdiction, so this does not infer candidate benefit; it only names which candidate-share correlation is stronger in the loaded vote-share flag. ${shareEvidence.slice(0, 3).join("; ")}.`;

    if (harrisShareSignals > trumpShareSignals * 1.2) {
      return { label: "Harris share pattern", title };
    }

    if (trumpShareSignals > harrisShareSignals * 1.2) {
      return { label: "Trump share pattern", title };
    }

    return { label: "Mixed share pattern", title };
  }

  return { label: "Unclear", title: "The loaded advisory metrics do not support even a directional review inference." };
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

type MapBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  referenceLatitude: number;
};

function longitudeScale(referenceLatitude: number) {
  const scale = Math.cos((referenceLatitude * Math.PI) / 180);
  return Number.isFinite(scale) && scale > 0.1 ? scale : 1;
}

function projectedLongitude(lon: number, bounds: MapBounds) {
  return lon * longitudeScale(bounds.referenceLatitude);
}

function mapFit(bounds: MapBounds) {
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(920 / width, 520 / height);
  return {
    offsetX: (mapViewBox.width - width * scale) / 2,
    offsetY: (mapViewBox.height - height * scale) / 2,
    scale,
  };
}

function makePath(state: string, rings: number[][][], bounds: MapBounds) {
  const { offsetX, offsetY, scale } = mapFit(bounds);

  return rings
    .map((ring) =>
      ring
        .map((coordinate, index) => {
          const [lon, lat] = mapCoordinate(state, coordinate);
          const projectedX = projectedLongitude(lon, bounds);
          const x = offsetX + (projectedX - bounds.minX) * scale;
          const y = offsetY + (bounds.maxY - lat) * scale;
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ")
        .concat(" Z"),
    )
    .join(" ");
}

function projectPoint([lon, lat]: number[], bounds: MapBounds) {
  const { offsetX, offsetY, scale } = mapFit(bounds);
  const projectedX = projectedLongitude(lon, bounds);

  return {
    x: offsetX + (projectedX - bounds.minX) * scale,
    y: offsetY + (bounds.maxY - lat) * scale,
  };
}

function centroid(state: string, feature: GeoFeature, bounds: MapBounds) {
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

function coordinateBounds(points: number[][]): MapBounds {
  if (!points.length) {
    return { maxX: 1, maxY: 1, minX: 0, minY: 0, referenceLatitude: 0 };
  }

  const referenceLatitude = average(points.map(([, lat]) => lat));
  const scale = longitudeScale(referenceLatitude);

  return points.reduce(
    (bounds, [lon, lat]) => {
      const projectedX = lon * scale;
      return {
        ...bounds,
        maxX: Math.max(bounds.maxX, projectedX),
        maxY: Math.max(bounds.maxY, lat),
        minX: Math.min(bounds.minX, projectedX),
        minY: Math.min(bounds.minY, lat),
      };
    },
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      referenceLatitude,
    },
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPan(pan: MapPan, zoom: number) {
  if (zoom <= 1) {
    return { x: 0, y: 0 };
  }

  const maxX = ((zoom - 1) * mapViewBox.width) / 2;
  const maxY = ((zoom - 1) * mapViewBox.height) / 2;
  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

function mixColor(start: [number, number, number], end: [number, number, number], amount: number) {
  const t = clamp(amount, 0, 1);
  const [r1, g1, b1] = start;
  const [r2, g2, b2] = end;
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(
    b1 + (b2 - b1) * t,
  )})`;
}

type VoteMethodAggregate = {
  method: string;
  methodLabel: string;
  reportedRows: number;
  totalVoters: number;
  unavailableRows: number;
  voters: number;
};

const equipmentPalette = [
  "#35c7a3",
  "#6fa6ea",
  "#f0c36a",
  "#e7896f",
  "#c58cff",
  "#8fd17f",
  "#d986c8",
  "#9ca3af",
];

function methodShare(row: VoteMethodAggregate | undefined) {
  return row && row.totalVoters > 0 ? (row.voters / row.totalVoters) * 100 : null;
}

function equipmentGroupLabel(row: EquipmentRowSummary | undefined) {
  if (!row) {
    return "No equipment row";
  }

  return [row.vendor || "Vendor not recorded", row.systemName || row.equipmentType || "System not recorded"].join(" - ");
}

function equipmentFeatureGroupLabel(feature: GeoFeature | undefined) {
  const label = feature?.properties.equipmentGroupLabel;
  return typeof label === "string" && label.trim() ? label : "";
}

function stableHash(value: string) {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

function equipmentFill(row: EquipmentRowSummary | undefined, feature: GeoFeature | undefined) {
  const label = row ? equipmentGroupLabel(row) : equipmentFeatureGroupLabel(feature);
  if (!label) {
    return "#2c302e";
  }

  return equipmentPalette[stableHash(label) % equipmentPalette.length];
}

function countyFill(
  row: ResultRow | undefined,
  mode: MapMode,
  maxTotalVotes: number,
  methodRow?: VoteMethodAggregate,
  equipmentRow?: EquipmentRowSummary,
  equipmentFeature?: GeoFeature,
  maxMethodShare = 100,
) {
  if (mode === "equipment") {
    return equipmentFill(equipmentRow, equipmentFeature);
  }

  if (mode === "method") {
    const share = methodShare(methodRow);
    if (share === null) {
      return "#2c302e";
    }
    return mixColor([220, 252, 231], [13, 148, 136], share / Math.max(1, maxMethodShare));
  }

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
  equipmentRows,
  indicators,
  results,
  selectedState,
  sources,
  voteMethodRows,
}: ResultsExplorerProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [equipmentFeatures, setEquipmentFeatures] = useState<GeoFeature[]>([]);
  const [equipmentGeoStatus, setEquipmentGeoStatus] = useState<"error" | "loading" | "ready">("loading");
  const [geoStatus, setGeoStatus] = useState<"error" | "loading" | "ready">("loading");
  const [mapMode, setMapMode] = useState<MapMode>("winner");
  const [mapPan, setMapPan] = useState<MapPan>({ x: 0, y: 0 });
  const [mapZoom, setMapZoom] = useState(1);
  const [selectedVoteMethod, setSelectedVoteMethod] = useState("in_person_early");
  const [selectedMapName, setSelectedMapName] = useState<string | null>(null);
  const [pinnedMapName, setPinnedMapName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [isPanning, setIsPanning] = useState(false);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const mapDragRef = useRef<{
    lastX: number;
    lastY: number;
    moved: boolean;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressMapClickRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setGeoStatus("loading");
    setEquipmentGeoStatus("loading");
    setSelectedMapName(null);
    setPinnedMapName(null);
    setMapPan({ x: 0, y: 0 });
    setMapZoom(1);

    if (hasBaseResultGeometry(selectedState)) {
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
    } else {
      setFeatures([]);
      setGeoStatus("ready");
    }

    fetch(`${geoBaseUrl}/${verifiedVotingAreaPath(selectedState)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Verifier area GeoJSON request failed with ${response.status}`);
        }

        return response.json() as Promise<FeatureCollection>;
      })
      .then((collection) => {
        setEquipmentFeatures(collection.features ?? []);
        setEquipmentGeoStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setEquipmentFeatures([]);
          setEquipmentGeoStatus("error");
        }
      });

    return () => controller.abort();
  }, [selectedState]);

  useEffect(() => {
    if (
      mapMode !== "equipment" &&
      (results.length === 0 || geoStatus === "error" || (geoStatus === "ready" && features.length === 0)) &&
      equipmentGeoStatus === "ready" &&
      equipmentFeatures.length > 0 &&
      equipmentRows.length > 0
    ) {
      setMapMode("equipment");
    }
  }, [equipmentFeatures.length, equipmentGeoStatus, equipmentRows.length, features.length, geoStatus, mapMode, results.length]);

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

  const usingVerifierGeometry = mapMode === "equipment" && equipmentFeatures.length > 0;
  const activeFeatures = usingVerifierGeometry ? equipmentFeatures : features;
  const activeGeoStatus =
    mapMode === "equipment"
      ? equipmentFeatures.length > 0
        ? "ready"
        : equipmentGeoStatus === "loading"
          ? "loading"
          : geoStatus
      : geoStatus;
  const activeGeometrySource = usingVerifierGeometry ? "Verified Voting GIS areas" : "county boundaries";
  const showAdvisoryMarkers = mapMode !== "equipment";
  const baseGeometryUnavailable = geoStatus === "error" || (geoStatus === "ready" && features.length === 0);
  const equipmentGeometryAvailable = equipmentGeoStatus === "ready" && equipmentFeatures.length > 0;
  const resultGeometryRequiredModes = new Set<MapMode>(["winner", "margin", "volume", "method"]);

  const bounds = useMemo(() => {
    const points = activeFeatures.flatMap((feature) =>
      flattenPositions(feature.geometry.coordinates).map((coordinate) =>
        mapCoordinate(selectedState, coordinate),
      ),
    );
    return coordinateBounds(points);
  }, [activeFeatures, selectedState]);

  const maxTotalVotes = useMemo(
    () => results.reduce((max, row) => Math.max(max, row.totalVotes), 0),
    [results],
  );
  const voteMethodOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of voteMethodRows) {
      options.set(row.method, row.methodLabel);
    }
    return Array.from(options.entries()).map(([method, label]) => ({ label, method }));
  }, [voteMethodRows]);

  useEffect(() => {
    if (!voteMethodOptions.length) {
      return;
    }
    setSelectedVoteMethod((current) =>
      voteMethodOptions.some((option) => option.method === current) ? current : voteMethodOptions[0].method,
    );
  }, [voteMethodOptions]);

  const voteMethodByCounty = useMemo(() => {
    const aggregates = new Map<string, VoteMethodAggregate>();
    for (const row of voteMethodRows) {
      if (row.method !== selectedVoteMethod) {
        continue;
      }
      const countyName = row.county || row.jurisdictionName;
      const key = normalizeName(countyName);
      const current = aggregates.get(key) ?? {
        method: row.method,
        methodLabel: row.methodLabel,
        reportedRows: 0,
        totalVoters: 0,
        unavailableRows: 0,
        voters: 0,
      };
      if (row.valueStatus === "reported" && row.voters !== null) {
        current.reportedRows += 1;
        current.voters += row.voters;
        current.totalVoters += row.totalVoters ?? 0;
      } else {
        current.unavailableRows += 1;
      }
      aggregates.set(key, current);
    }
    return aggregates;
  }, [selectedVoteMethod, voteMethodRows]);
  const equipmentByCounty = useMemo(() => {
    const rows = new Map<string, EquipmentRowSummary>();
    for (const row of equipmentRows) {
      rows.set(normalizeName(row.jurisdictionName), row);
    }
    return rows;
  }, [equipmentRows]);
  const equipmentLegend = useMemo(() => {
    const groups = new Map<string, { color: string; count: number; label: string; warnings: number }>();
    for (const row of equipmentRows) {
      const label = equipmentGroupLabel(row);
      const current = groups.get(label) ?? {
        color: equipmentFill(row, undefined),
        count: 0,
        label,
        warnings: 0,
      };
      current.count += 1;
      current.warnings += row.uniformityWarningRequired ? 1 : 0;
      groups.set(label, current);
    }

    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [equipmentRows]);
  const selectedVoteMethodLabel =
    voteMethodOptions.find((option) => option.method === selectedVoteMethod)?.label ?? "Vote method";
  const maxVoteMethodShare = Math.max(
    1,
    ...Array.from(voteMethodByCounty.values()).map((row) => methodShare(row) ?? 0),
  );

  const activeMapName = pinnedMapName ?? selectedMapName;
  const selectedMapResult = activeMapName
    ? resultsByName.get(normalizeName(activeMapName))
    : undefined;
  const selectedMapIndicators = activeMapName
    ? indicatorsByName.get(normalizeName(activeMapName)) ?? []
    : [];
  const selectedMapVoteMethod = activeMapName
    ? voteMethodByCounty.get(normalizeName(resultNameForFeature(selectedState, activeMapName)))
    : undefined;
  const selectedMapEquipment = activeMapName
    ? equipmentByCounty.get(normalizeName(resultNameForFeature(selectedState, activeMapName)))
    : undefined;
  const selectedMapReadout =
    mapMode === "equipment"
      ? selectedMapEquipment
        ? equipmentGroupLabel(selectedMapEquipment)
        : "No joined equipment row"
      : selectedMapResult
        ? `${selectedMapResult.winner} by ${selectedMapResult.marginPct.toFixed(2)}% - ${selectedMapResult.totalVotes.toLocaleString()} votes`
        : "Winner, margin, and review flags appear here.";
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
      .filter(
        (row) =>
          !isNonGeographicResultRow(selectedState, row.jurisdictionName) &&
          !featureNames.has(normalizeName(row.jurisdictionName)),
      )
      .map((row) => row.jurisdictionName)
      .sort((a, b) => a.localeCompare(b));

    return { missingResults, unmappedRows };
  }, [features, results, resultsByName, selectedState]);

  const visibleResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return results
      .filter((row) => {
        const rowIndicators = indicatorsByJurisdiction.get(row.jurisdictionCode) ?? indicatorsByName.get(normalizeName(row.jurisdictionName)) ?? [];
        if (showFlaggedOnly && !rowIndicators.length) {
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
  }, [indicatorsByJurisdiction, indicatorsByName, query, results, showFlaggedOnly, sortKey]);

  const hasMapJoinWarnings =
    features.length > 0 &&
    geoStatus === "ready" &&
    (mapJoinStats.missingResults.length > 0 || mapJoinStats.unmappedRows.length > 0);

  useEffect(() => {
    setMapPan((current) => clampPan(current, mapZoom));
  }, [mapZoom]);

  const selectedSourceUrl = (sourceId: string) => sourceById.get(sourceId)?.sourceUrl;
  const mapTransform = `translate(${mapViewBox.width / 2 + mapPan.x} ${mapViewBox.height / 2 + mapPan.y}) scale(${mapZoom}) translate(${-mapViewBox.width / 2} ${-mapViewBox.height / 2})`;

  const zoomMap = useCallback((nextZoom: number, anchor?: MapPan) => {
    setMapZoom((currentZoom) => {
      const clampedZoom = Number(clamp(nextZoom, 1, mapMaxZoom).toFixed(2));
      if (clampedZoom === currentZoom) {
        return currentZoom;
      }

      setMapPan((currentPan) => {
        if (!anchor) {
          return clampPan(currentPan, clampedZoom);
        }

        const center = { x: mapViewBox.width / 2, y: mapViewBox.height / 2 };
        const ratio = clampedZoom / currentZoom;
        return clampPan(
          {
            x: anchor.x - center.x - ratio * (anchor.x - center.x - currentPan.x),
            y: anchor.y - center.y - ratio * (anchor.y - center.y - currentPan.y),
          },
          clampedZoom,
        );
      });

      return clampedZoom;
    });
  }, []);

  const panMap = (delta: MapPan) => {
    setMapPan((current) =>
      clampPan(
        {
          x: current.x + delta.x,
          y: current.y + delta.y,
        },
        mapZoom,
      ),
    );
  };

  const resetMapView = () => {
    setMapPan({ x: 0, y: 0 });
    setMapZoom(1);
  };

  const svgPointFromClient = (element: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * mapViewBox.width,
      y: ((clientY - rect.top) / rect.height) * mapViewBox.height,
    };
  };

  useEffect(() => {
    if (activeGeoStatus !== "ready" || activeFeatures.length === 0) {
      return;
    }

    const wrap = mapWrapRef.current;
    const svg = mapSvgRef.current;
    if (!wrap || !svg) {
      return;
    }

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      zoomMap(mapZoom + direction * mapZoomStep, svgPointFromClient(svg, event.clientX, event.clientY));
    };

    wrap.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      wrap.removeEventListener("wheel", handleNativeWheel);
    };
  }, [activeFeatures.length, activeGeoStatus, mapZoom, zoomMap]);

  const handleMapPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    mapDragRef.current = {
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMapPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = mapDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.lastX) / rect.width) * mapViewBox.width;
    const deltaY = ((event.clientY - drag.lastY) / rect.height) * mapViewBox.height;
    const movedPixels = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (mapZoom > 1 && movedPixels > 4) {
      drag.moved = true;
      panMap({ x: deltaX, y: deltaY });
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };

  const finishMapPointer = (event: PointerEvent<SVGSVGElement>) => {
    const drag = mapDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    suppressMapClickRef.current = drag.moved;
    mapDragRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    }
  };

  const inspectJurisdiction = (name: string) => {
    setSelectedMapName(name);
    setPinnedMapName(name);
  };

  const clearPinnedJurisdiction = () => {
    setPinnedMapName(null);
  };

  return (
    <section className="results-explorer" aria-label={`${selectedState} result explorer`}>
      <div className="panel map-panel" data-tour="map-panel" aria-label={`${selectedState} county map`}>
        <div className="panel-header">
          <div>
            <h2>{countyLabel} Map</h2>
            <span>
              {activeGeoStatus === "ready"
                ? `${activeFeatures.length} ${activeGeometrySource}, ${indicators.length} advisory review flags`
                : activeGeoStatus === "loading"
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
        <div className="map-control-row" data-tour="map-controls" aria-label="Map display controls">
          <div className="mode-control" aria-label="Map display mode">
            {[
              ["winner", "Winner"],
              ["margin", "Margin"],
              ["volume", "Votes"],
              ["method", "Method"],
              ["equipment", "Equipment"],
            ].map(([mode, label]) => (
              <button
                aria-pressed={mapMode === mode}
                data-tour={mode === "method" ? "method-mode-button" : undefined}
                disabled={
                  (resultGeometryRequiredModes.has(mode as MapMode) && (baseGeometryUnavailable || results.length === 0)) ||
                  (mode === "method" && voteMethodRows.length === 0) ||
                  (mode === "equipment" && (equipmentRows.length === 0 || !equipmentGeometryAvailable))
                }
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
            <span>{selectedMapReadout}</span>
          </div>
        </div>
        {mapMode === "method" && (
          <div className="map-method-control" data-tour="vote-method-layer">
            <label htmlFor="map-vote-method">Method layer</label>
            <select
              id="map-vote-method"
              onChange={(event) => setSelectedVoteMethod(event.target.value)}
              value={selectedVoteMethod}
            >
              {voteMethodOptions.map((option) => (
                <option key={option.method} value={option.method}>
                  {option.label}
                </option>
              ))}
            </select>
            <span>
              {activeMapName
                ? `${selectedVoteMethodLabel}: ${methodShare(selectedMapVoteMethod)?.toFixed(2) ?? "N/A"}%`
                : "County shading aggregates EAC participation-method rows where needed."}
            </span>
          </div>
        )}
        {mapMode === "equipment" && (
          <div className="map-method-control equipment-map-note" data-tour="equipment-layer">
            <label>Equipment layer</label>
            <span>
              County shading uses Verified Voting Verifier area geometry and jurisdiction rows when available. Treat it
              as administration context, not proof every precinct or ballot mode used one identical setup.
            </span>
          </div>
        )}
        {results.length === 0 && equipmentGeometryAvailable ? (
          <div className="map-warning" role="status">
            <strong>Certified results not loaded yet</strong>
            <span>
              Winner, Margin, Votes, Method, advisory flags, and directional screening need certified result rows.
              Showing the Verified Voting equipment GIS layer when selected.
            </span>
          </div>
        ) : baseGeometryUnavailable && equipmentGeometryAvailable ? (
          <div className="map-warning" role="status">
            <strong>Result geometry not loaded yet</strong>
            <span>
              Winner, Margin, Votes, and Method need base county/result geometry for this state. Showing the Verified
              Voting equipment GIS layer instead.
            </span>
          </div>
        ) : null}
        {hasMapJoinWarnings && (
          <div className="map-warning" role="status">
            <strong>Map join needs review</strong>
            <span>
              {mapJoinStats.missingResults.length} boundaries lack result rows;{" "}
              {mapJoinStats.unmappedRows.length} result rows are not on the map.
            </span>
          </div>
        )}
        <div className="map-wrap" ref={mapWrapRef}>
          <div className="map-zoom-controls" aria-label="Map view controls">
            <div className="map-pan-controls" aria-label="Map pan controls">
              <button
                aria-label="Pan map up"
                disabled={mapZoom <= 1}
                onClick={() => panMap({ x: 0, y: mapPanStep })}
                title="Pan up"
                type="button"
              >
                <ArrowUp aria-hidden size={14} />
              </button>
              <button
                aria-label="Pan map left"
                disabled={mapZoom <= 1}
                onClick={() => panMap({ x: mapPanStep, y: 0 })}
                title="Pan left"
                type="button"
              >
                <ArrowLeft aria-hidden size={14} />
              </button>
              <button
                aria-label="Reset map view"
                disabled={mapZoom === 1 && mapPan.x === 0 && mapPan.y === 0}
                onClick={resetMapView}
                title="Reset view"
                type="button"
              >
                <RotateCcw aria-hidden size={14} />
              </button>
              <button
                aria-label="Pan map right"
                disabled={mapZoom <= 1}
                onClick={() => panMap({ x: -mapPanStep, y: 0 })}
                title="Pan right"
                type="button"
              >
                <ArrowRight aria-hidden size={14} />
              </button>
              <button
                aria-label="Pan map down"
                disabled={mapZoom <= 1}
                onClick={() => panMap({ x: 0, y: -mapPanStep })}
                title="Pan down"
                type="button"
              >
                <ArrowDown aria-hidden size={14} />
              </button>
            </div>
            <div className="map-zoom-buttons" aria-label="Map zoom controls">
              <button
                aria-label="Zoom in"
                disabled={mapZoom >= mapMaxZoom}
                onClick={() => zoomMap(mapZoom + mapZoomStep)}
                title="Zoom in"
                type="button"
              >
                <ZoomIn aria-hidden size={16} />
              </button>
              <button
                aria-label="Zoom out"
                disabled={mapZoom <= 1}
                onClick={() => zoomMap(mapZoom - mapZoomStep)}
                title="Zoom out"
                type="button"
              >
                <ZoomOut aria-hidden size={16} />
              </button>
              <span>{Math.round(mapZoom * 100)}%</span>
            </div>
          </div>
          {activeGeoStatus === "ready" && activeFeatures.length > 0 ? (
            <svg
              className={`county-map ${isPanning ? "is-panning" : ""}`}
              data-tour="county-map"
              onPointerCancel={finishMapPointer}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={finishMapPointer}
              ref={mapSvgRef}
              role="img"
              viewBox={`0 0 ${mapViewBox.width} ${mapViewBox.height}`}
            >
              <title>{selectedState} {mapMode === "equipment" ? "Verified Voting equipment area" : "county presidential result"} map</title>
              <g transform={mapTransform}>
              {activeFeatures.map((feature, featureIndex) => {
                const name = featureName(feature);
                const resultName = resultNameForFeature(selectedState, name);
                const row = resultsByName.get(normalizeName(resultName));
                const methodRow = voteMethodByCounty.get(normalizeName(resultName));
                const equipmentRow = equipmentByCounty.get(normalizeName(resultName));
                const countyIndicators = indicatorsByName.get(normalizeName(resultName)) ?? [];
                const rings = polygonRings(feature);
                const point = centroid(selectedState, feature, bounds);
                const isSelected = selectedMapName && normalizeName(selectedMapName) === normalizeName(resultName);
                const isPinned = pinnedMapName && normalizeName(pinnedMapName) === normalizeName(resultName);
                return (
                  <g key={`${selectedState}-${mapMode}-${name}-${featureIndex}`}>
                    <path
                      aria-label={`${name}${row ? `, ${row.winner} by ${row.marginPct.toFixed(2)} percent` : ""}`}
                      className={isPinned ? "map-shape pinned" : isSelected ? "map-shape selected" : "map-shape"}
                      d={makePath(selectedState, rings, bounds)}
                      fill={countyFill(row, mapMode, maxTotalVotes, methodRow, equipmentRow, feature, maxVoteMethodShare)}
                      onClick={(event) => {
                        if (suppressMapClickRef.current) {
                          event.preventDefault();
                          return;
                        }
                        inspectJurisdiction(resultName);
                      }}
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
                        {name}:{" "}
                        {mapMode === "method"
                          ? `${selectedVoteMethodLabel} ${methodShare(methodRow)?.toFixed(2) ?? "N/A"}%`
                          : mapMode === "equipment"
                            ? equipmentRow
                              ? equipmentGroupLabel(equipmentRow)
                              : equipmentFeatureGroupLabel(feature) || "No equipment row"
                          : row
                            ? `${row.winner} by ${row.marginPct.toFixed(2)}%`
                            : "No result row"}
                        {countyIndicators.length
                          ? `; ${countyIndicators.length} advisory review flag(s)`
                          : ""}
                      </title>
                    </path>
                    {showAdvisoryMarkers && countyIndicators.length > 0 && (
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
              {activeGeoStatus === "loading" ? "Loading map geometry..." : "Map geometry is not available yet."}
            </div>
          )}
        </div>
        <div className="map-legend" aria-label="Map legend">
          {mapMode === "equipment" ? (
            <div className="equipment-map-legend" aria-label="Equipment vendor and system legend">
              {equipmentLegend.map((item) => (
                <span className="equipment-legend-item" key={item.label}>
                  <i aria-hidden style={{ background: item.color }} />
                  {item.label}
                  <small>{item.count.toLocaleString()}</small>
                </span>
              ))}
            </div>
          ) : mapMode === "method" ? (
            <div className="margin-scale-legend method-scale-legend" aria-label="Vote method share color scale">
              <div className="method-scale-bar" aria-hidden />
              <div className="margin-scale-labels">
                <span>Lower {selectedVoteMethodLabel}</span>
                <span>Higher {selectedVoteMethodLabel}</span>
              </div>
            </div>
          ) : mapMode !== "volume" && (
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
          {mapMode === "method" && (
            <span className="legend-note">Method layer is participation method, not candidate vote by method.</span>
          )}
          {mapMode === "equipment" && (
            <span className="legend-note">
              Equipment layer uses Verified Voting GIS areas when available; inspect a shape for source and uniformity notes.
            </span>
          )}
          <span className="legend-note">Badge numbers count advisory indicators, not confirmed findings.</span>
          {selectedMapIndicators.length > 0 && (
            <span className="legend-note">
              {selectedMapIndicators.length} advisory flag{selectedMapIndicators.length === 1 ? "" : "s"} selected
            </span>
          )}
        </div>
        <aside className="jurisdiction-drawer" data-tour="jurisdiction-drawer" aria-label="Selected jurisdiction details">
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
                <div>
                  <dt>{selectedVoteMethodLabel}</dt>
                  <dd>{methodShare(selectedMapVoteMethod)?.toFixed(2) ?? "N/A"}%</dd>
                </div>
                <div>
                  <dt>Equipment</dt>
                  <dd>{selectedMapEquipment?.vendor || "N/A"}</dd>
                </div>
              </dl>
              {selectedMapEquipment && (
                <div className="drawer-source">
                  <strong>{selectedMapEquipment.systemName || selectedMapEquipment.vendor}</strong>
                  <span>
                    {selectedMapEquipment.standardSystem || "Standard system not recorded"} ·{" "}
                    {selectedMapEquipment.tabulation || "Tabulation not recorded"}
                  </span>
                  <span>
                    Accessible: {selectedMapEquipment.accessibleSystem || "Not recorded"} · Poll book:{" "}
                    {selectedMapEquipment.pollBookSystem || "Not recorded"}
                  </span>
                  <span>{selectedMapEquipment.uniformityNote}</span>
                  {selectedMapEquipment.configurationSignals.length > 0 && (
                    <span>{selectedMapEquipment.configurationSignals.join("; ")}</span>
                  )}
                  {selectedMapEquipment.sourceUrl && (
                    <a href={selectedMapEquipment.sourceUrl} rel="noreferrer" target="_blank">
                      <ExternalLink aria-hidden size={14} />
                      Open equipment source
                    </a>
                  )}
                </div>
              )}
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
        {results.length > 0 ? (
          <>
            <div className="review-direction-notice" role="note">
              <strong>About the directional review column</strong>
              <p>
                The column below is not a finding that interference occurred, and it does not prove that any candidate
                actually received extra votes. It is a rough advisory screen from the loaded review indicators. For
                down-ballot comparison flags, the app compares same-party presidential votes against a comparison race
                such as U.S. Senate or Governor, then labels the direction with the larger relative gap. Governor-only
                comparisons are marked low confidence because they can mostly reflect ordinary race-specific ticket
                splitting. When the comparison is U.S. House, the column names presidential-over-House dropoff direction
                instead of candidate benefit because House races are district- and candidate-specific controls.
              </p>
              <p>
                That direction can be affected by split-ticket voting, incumbency, local candidate strength, undervotes,
                uncontested races, one-sided comparison races, reporting-unit definitions, missing comparison rows, or ordinary political geography.
                Treat it as "if this pattern needs review, this is the side the math points toward," not as a causal claim
                or a conclusion.
              </p>
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
            <div className="table-wrap" data-tour="results-table">
              <table>
                <thead>
                  <tr>
                    <th>Jurisdiction</th>
                    <th>Flags</th>
                    <th>Directional screen</th>
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
                    const rowIndicators = indicatorsByJurisdiction.get(row.jurisdictionCode) ?? indicatorsByName.get(normalizeName(row.jurisdictionName)) ?? [];
                    const benefit = possibleFlagBenefit(rowIndicators);
                    const rowClassName = [
                      "clickable-row",
                      isPinnedRow ? "selected-row" : isPreviewRow ? "preview-row" : null,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const handleRowInspect = (target: EventTarget | null) => {
                      if (target instanceof HTMLElement && target.closest("a, button, input, select, textarea")) {
                        return;
                      }

                      inspectJurisdiction(row.jurisdictionName);
                    };

                    return (
                    <tr
                      aria-label={`Inspect ${row.jurisdictionName}`}
                      className={rowClassName}
                      key={row.jurisdictionCode}
                      onClick={(event) => handleRowInspect(event.target)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }

                        if (event.target instanceof HTMLElement && event.target.closest("a, button, input, select, textarea")) {
                          return;
                        }

                        event.preventDefault();
                        inspectJurisdiction(row.jurisdictionName);
                      }}
                      tabIndex={0}
                      title={`Inspect ${row.jurisdictionName}`}
                    >
                      <td>{row.jurisdictionName}</td>
                      <td>
                        {rowIndicators.length > 0 ? (
                          <div className="indicator-stack">
                            {rowIndicators.map((indicator) => (
                              <span className="indicator-pill" key={indicator.id} title={indicator.detail}>
                                ! {indicator.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="no-indicator">-</span>
                        )}
                      </td>
                      <td className="benefit-cell" title={benefit.title}>{benefit.label}</td>
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
          </>
        ) : (
          <div className="empty-panel" data-tour="results-table">
            <strong>No certified result rows loaded for {selectedState}</strong>
            <span>
              Advisory flags and directional screening require certified result rows plus review indicators. Turnout
              and equipment context may still be available in Data & Sources.
            </span>
          </div>
        )}
      </section>
    </section>
  );
}
