"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  Share2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./compare.module.css";

const yearPairs = [
  { from: 2016, label: "2016 → 2020", to: 2020 },
  { from: 2016, label: "2016 → 2024", to: 2024 },
  { from: 2020, label: "2020 → 2024", to: 2024 },
] as const;

const directions = [
  { label: "All comparable counties", value: "all" },
  { label: "Red → blue flips", value: "red_to_blue" },
  { label: "Blue → red flips", value: "blue_to_red" },
  { label: "No party flip", value: "no_flip" },
] as const;

type DirectionFilter = (typeof directions)[number]["value"];
type Winner = "blue" | "red" | "tie" | "unavailable";
type Confidence = "exact" | "derived" | "partial" | "proxy" | "unavailable";
type SortKey = "county" | "state" | "direction" | "swing" | "fromTotal" | "toTotal" | "voteChange" | "confidence";
type SortOrder = "asc" | "desc";

export type CompareInitialState = {
  direction?: string;
  fips?: string;
  from?: string;
  order?: string;
  page?: string;
  pageSize?: string;
  query?: string;
  sort?: string;
  state?: string;
  to?: string;
};

type TurnoutSnapshot = {
  ballotsCast: number | null;
  registeredVoters: number | null;
  turnoutPct: number | null;
};

type ElectionSnapshot = {
  caveat: string | null;
  confidence: Confidence;
  demCandidate: string;
  demMarginPct: number | null;
  demVotes: number | null;
  otherVotes: number | null;
  repCandidate: string;
  repVotes: number | null;
  sourceAuthority: string | null;
  sourceUrl: string | null;
  totalVotes: number | null;
  turnout: TurnoutSnapshot | null;
  winner: Winner;
  year: number;
};

type ComparisonRow = {
  caveat: string | null;
  confidence: Confidence;
  county: string;
  direction: "red_to_blue" | "blue_to_red" | "no_flip";
  fips: string;
  from: ElectionSnapshot;
  jurisdictionTag: string;
  marginSwingPct: number | null;
  state: string;
  to: ElectionSnapshot;
  totalVoteChange: number | null;
  totalVoteChangePct: number | null;
};

type ComparisonSummary = {
  blueToRed: number;
  matchedCount: number;
  noFlip: number;
  redToBlue: number;
  selectedCount: number;
};

type ComparisonCoverage = {
  canonicalRegistryRows: number;
  caveats: string[];
  matchedCanonicalRows: number;
  missingBothRows: number;
  missingFromRows: number;
  missingToRows: number;
  notComparableRows: number;
  scope: string;
};

type NationalFeature = {
  geometry: {
    coordinates: unknown;
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    GEOID: string;
    NAME: string;
    STATE: string;
  };
  type: "Feature";
};

type FeatureCollection = {
  features: NationalFeature[];
  metadata?: {
    featureCount?: number;
  };
  type: "FeatureCollection";
};

type UnknownRecord = Record<string, unknown>;
type Point = [number, number];

const emptySummary: ComparisonSummary = {
  blueToRed: 0,
  matchedCount: 0,
  noFlip: 0,
  redToBlue: 0,
  selectedCount: 0,
};

const emptyCoverage: ComparisonCoverage = {
  canonicalRegistryRows: 0,
  caveats: [],
  matchedCanonicalRows: 0,
  missingBothRows: 0,
  missingFromRows: 0,
  missingToRows: 0,
  notComparableRows: 0,
  scope: "US",
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown) {
  return isRecord(value) ? value : {};
}

function stringValue(value: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function numberValue(value: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return null;
}

function normalizeConfidence(value: unknown): Confidence {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (normalized === "exact" || normalized === "derived" || normalized === "partial" || normalized === "proxy") {
    return normalized;
  }
  return normalized === "unavailable" || normalized === "missing" ? "unavailable" : "partial";
}

function normalizeWinner(value: unknown, demVotes: number | null, repVotes: number | null): Winner {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (/blue|democrat|clinton|biden|harris/.test(normalized)) return "blue";
  if (/red|republican|trump/.test(normalized)) return "red";
  if (/tie|draw/.test(normalized)) return "tie";
  if (demVotes == null || repVotes == null) return "unavailable";
  if (demVotes > repVotes) return "blue";
  if (repVotes > demVotes) return "red";
  return "tie";
}

function defaultCandidate(year: number, party: "dem" | "rep") {
  if (party === "rep") return "Donald Trump";
  if (year === 2016) return "Hillary Clinton";
  if (year === 2020) return "Joe Biden";
  if (year === 2024) return "Kamala Harris";
  return "Democratic candidate";
}

function normalizeSnapshot(input: unknown, fallbackYear: number): ElectionSnapshot {
  const source = record(input);
  const demVotes = numberValue(source, "demVotes", "democraticVotes", "democratVotes", "blueVotes");
  const repVotes = numberValue(source, "repVotes", "republicanVotes", "redVotes");
  const totalVotes = numberValue(source, "totalVotes", "votes", "presidentialVotes");
  const otherVotes = numberValue(source, "otherVotes", "thirdPartyVotes")
    ?? (totalVotes != null && demVotes != null && repVotes != null ? Math.max(totalVotes - demVotes - repVotes, 0) : null);
  const year = numberValue(source, "year", "electionYear") ?? fallbackYear;
  const turnoutSource = record(source.turnout);
  const ballotsCast = numberValue(turnoutSource, "ballotsCast", "totalBallots", "turnout")
    ?? numberValue(source, "ballotsCast", "turnout");
  const registeredVoters = numberValue(turnoutSource, "registeredVoters", "registration")
    ?? numberValue(source, "registeredVoters");
  const turnoutPct = numberValue(turnoutSource, "turnoutPct", "percentage")
    ?? (ballotsCast != null && registeredVoters != null && registeredVoters > 0
      ? (ballotsCast / registeredVoters) * 100
      : null);
  const inferredMargin = demVotes != null && repVotes != null && totalVotes != null && totalVotes > 0
    ? ((demVotes - repVotes) / totalVotes) * 100
    : null;

  return {
    caveat: stringValue(source, "caveat", "note"),
    confidence: normalizeConfidence(source.confidence),
    demCandidate: stringValue(source, "demCandidate", "democraticCandidate") ?? defaultCandidate(year, "dem"),
    demMarginPct: numberValue(source, "demMarginPct", "marginPct", "democraticMarginPct") ?? inferredMargin,
    demVotes,
    otherVotes,
    repCandidate: stringValue(source, "repCandidate", "republicanCandidate") ?? defaultCandidate(year, "rep"),
    repVotes,
    sourceAuthority: stringValue(source, "sourceAuthority", "authority"),
    sourceUrl: stringValue(source, "sourceUrl", "url"),
    totalVotes,
    turnout: ballotsCast != null || registeredVoters != null || turnoutPct != null
      ? { ballotsCast, registeredVoters, turnoutPct }
      : null,
    winner: normalizeWinner(source.winner, demVotes, repVotes),
    year,
  };
}

function normalizeDirection(value: unknown, from: Winner, to: Winner) {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "red_to_blue" || normalized === "blue_to_red" || normalized === "no_flip") {
    return normalized;
  }
  if (from === "red" && to === "blue") return "red_to_blue";
  if (from === "blue" && to === "red") return "blue_to_red";
  return "no_flip";
}

function normalizeRow(input: unknown, fromYear: number, toYear: number): ComparisonRow | null {
  const source = record(input);
  const from = normalizeSnapshot(source.from ?? source.fromSnapshot ?? record(source.years)[String(fromYear)], fromYear);
  const to = normalizeSnapshot(source.to ?? source.toSnapshot ?? record(source.years)[String(toYear)], toYear);
  const jurisdictionTag = stringValue(source, "jurisdictionTag", "jurisdiction_tag") ?? "";
  const fips = (stringValue(source, "fips", "geoid", "GEOID") ?? jurisdictionTag.replace(/^county:/, "")).padStart(5, "0");
  const state = stringValue(source, "state", "stateCode")?.toUpperCase() ?? "";
  const county = stringValue(source, "county", "jurisdictionName", "countyName", "name") ?? fips;
  if (!/^\d{5}$/.test(fips) || !/^[A-Z]{2}$/.test(state)) {
    return null;
  }
  const direction = normalizeDirection(source.direction ?? source.flipDirection, from.winner, to.winner);
  let marginSwingPct = numberValue(source, "marginSwingPct", "swingPct", "netSwingPct");
  if (marginSwingPct == null && from.demMarginPct != null && to.demMarginPct != null) {
    marginSwingPct = to.demMarginPct - from.demMarginPct;
  }
  if (direction === "blue_to_red" && marginSwingPct != null && marginSwingPct > 0) {
    marginSwingPct *= -1;
  }
  if (direction === "red_to_blue" && marginSwingPct != null && marginSwingPct < 0) {
    marginSwingPct *= -1;
  }
  const totalVoteChange = numberValue(source, "totalVoteChange", "voteChange")
    ?? (from.totalVotes != null && to.totalVotes != null ? to.totalVotes - from.totalVotes : null);

  return {
    caveat: stringValue(source, "caveat", "coverageCaveat", "sourceCaveat") ?? from.caveat ?? to.caveat,
    confidence: normalizeConfidence(source.confidence ?? record(source.coverage).confidence),
    county,
    direction,
    fips,
    from,
    jurisdictionTag: jurisdictionTag || `county:${fips}`,
    marginSwingPct,
    state,
    to,
    totalVoteChange,
    totalVoteChangePct: numberValue(source, "totalVoteChangePct", "voteChangePct")
      ?? (totalVoteChange != null && from.totalVotes != null && from.totalVotes > 0
        ? (totalVoteChange / from.totalVotes) * 100
        : null),
  };
}

function normalizeSummary(value: unknown, rows: ComparisonRow[]): ComparisonSummary {
  const source = record(value);
  const calculated = rows.reduce(
    (summary, row) => {
      if (row.direction === "red_to_blue") summary.redToBlue += 1;
      if (row.direction === "blue_to_red") summary.blueToRed += 1;
      if (row.direction === "no_flip") summary.noFlip += 1;
      return summary;
    },
    { blueToRed: 0, noFlip: 0, redToBlue: 0 },
  );
  return {
    blueToRed: numberValue(source, "blueToRed", "blue_to_red") ?? calculated.blueToRed,
    matchedCount: numberValue(source, "matchedCount", "matchedRows", "comparableRows") ?? rows.length,
    noFlip: numberValue(source, "noFlip", "no_flip") ?? calculated.noFlip,
    redToBlue: numberValue(source, "redToBlue", "red_to_blue") ?? calculated.redToBlue,
    selectedCount: numberValue(source, "selectedCount", "filteredCount") ?? rows.length,
  };
}

function normalizeCoverage(value: unknown): ComparisonCoverage {
  const source = record(value);
  return {
    canonicalRegistryRows: numberValue(source, "canonicalRegistryRows", "registryCountyEquivalentCount", "geometryRows") ?? 0,
    caveats: Array.isArray(source.caveats) ? source.caveats.filter((item): item is string => typeof item === "string") : [],
    matchedCanonicalRows: numberValue(source, "matchedCanonicalRows", "matchedRows", "comparableRows") ?? 0,
    missingBothRows: numberValue(source, "missingBothRows", "missingBoth") ?? 0,
    missingFromRows: numberValue(source, "missingFromRows", "missingFrom") ?? 0,
    missingToRows: numberValue(source, "missingToRows", "missingTo") ?? 0,
    notComparableRows: numberValue(source, "notComparableRows", "unavailableRows") ?? 0,
    scope: stringValue(source, "scope") ?? "US",
  };
}

function normalizePair(fromValue?: string, toValue?: string) {
  const from = Number(fromValue);
  const to = Number(toValue);
  return yearPairs.find((pair) => pair.from === from && pair.to === to) ?? yearPairs[2];
}

function normalizeDirectionFilter(value?: string): DirectionFilter {
  const normalized = String(value ?? "").replaceAll("-", "_") as DirectionFilter;
  return directions.some((entry) => entry.value === normalized) ? normalized : "all";
}

function normalizeSort(value?: string): SortKey {
  const valid: SortKey[] = ["county", "state", "direction", "swing", "fromTotal", "toTotal", "voteChange", "confidence"];
  return valid.includes(value as SortKey) ? value as SortKey : "swing";
}

function clampInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value).toLocaleString("en-US");
}

function formatPct(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : `${Math.abs(value).toFixed(digits)}%`;
}

function signedNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-US")}`;
}

function marginLabel(snapshot: ElectionSnapshot) {
  if (snapshot.demMarginPct == null) return "Margin unavailable";
  if (snapshot.demMarginPct === 0) return "Tied";
  return `${snapshot.demMarginPct > 0 ? "D" : "R"} +${formatPct(snapshot.demMarginPct)}`;
}

function swingLabel(value: number | null) {
  if (value == null) return "Swing unavailable";
  if (Math.abs(value) < 0.005) return "No net swing";
  return `${value > 0 ? "D" : "R"} +${formatPct(value)} swing`;
}

function directionLabel(row: ComparisonRow) {
  if (row.direction === "red_to_blue") return "Red → blue";
  if (row.direction === "blue_to_red") return "Blue → red";
  if (row.from.winner === "blue" && row.to.winner === "blue") return "Held blue";
  if (row.from.winner === "red" && row.to.winner === "red") return "Held red";
  return "No party flip";
}

function directionClass(row: ComparisonRow) {
  if (row.direction === "red_to_blue") return styles.redToBlue;
  if (row.direction === "blue_to_red") return styles.blueToRed;
  if (row.to.winner === "blue") return styles.heldBlue;
  if (row.to.winner === "red") return styles.heldRed;
  return styles.tie;
}

function turnoutValue(snapshot: ElectionSnapshot) {
  return snapshot.turnout?.ballotsCast ?? snapshot.totalVotes;
}

function confidenceRank(value: Confidence) {
  return { exact: 0, derived: 1, proxy: 2, partial: 3, unavailable: 4 }[value];
}

function compareNullable(left: number | null, right: number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function compareRows(left: ComparisonRow, right: ComparisonRow, sort: SortKey) {
  if (sort === "county") return left.county.localeCompare(right.county) || left.state.localeCompare(right.state);
  if (sort === "state") return left.state.localeCompare(right.state) || left.county.localeCompare(right.county);
  if (sort === "direction") return directionLabel(left).localeCompare(directionLabel(right));
  if (sort === "swing") return compareNullable(left.marginSwingPct, right.marginSwingPct);
  if (sort === "fromTotal") return compareNullable(left.from.totalVotes, right.from.totalVotes);
  if (sort === "toTotal") return compareNullable(left.to.totalVotes, right.to.totalVotes);
  if (sort === "voteChange") return compareNullable(left.totalVoteChange, right.totalVoteChange);
  return confidenceRank(left.confidence) - confidenceRank(right.confidence);
}

function flattenCoordinates(coordinates: unknown): Point[] {
  if (!Array.isArray(coordinates)) return [];
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [[coordinates[0], coordinates[1]]];
  }
  return coordinates.flatMap((item) => flattenCoordinates(item));
}

function normalizeAlaskaLongitude([longitude, latitude]: Point): Point {
  return [longitude > 0 ? longitude - 360 : longitude, latitude];
}

function albers([longitude, latitude]: Point): Point {
  const radians = Math.PI / 180;
  const phi1 = 29.5 * radians;
  const phi2 = 45.5 * radians;
  const phi0 = 37.5 * radians;
  const lambda0 = -96 * radians;
  const phi = latitude * radians;
  const lambda = longitude * radians;
  const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const c = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
  const rho = Math.sqrt(Math.max(0, c - 2 * n * Math.sin(phi))) / n;
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(phi0)) / n;
  const theta = n * (lambda - lambda0);
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

function projectedBounds(points: Point[]) {
  return points.reduce(
    (bounds, [x, y]) => ({
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
    }),
    { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY },
  );
}

function fitProjector(points: Point[], box: { height: number; width: number; x: number; y: number }) {
  const bounds = projectedBounds(points);
  const sourceWidth = bounds.maxX - bounds.minX || 1;
  const sourceHeight = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const offsetX = box.x + (box.width - sourceWidth * scale) / 2;
  const offsetY = box.y + (box.height - sourceHeight * scale) / 2;
  return ([x, y]: Point): Point => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (bounds.maxY - y) * scale,
  ];
}

function makeNationalProjector(features: NationalFeature[]) {
  const conusCoordinates = features
    .filter((feature) => feature.properties.STATE !== "AK" && feature.properties.STATE !== "HI")
    .flatMap((feature) => flattenCoordinates(feature.geometry.coordinates));
  const alaskaCoordinates = features
    .filter((feature) => feature.properties.STATE === "AK")
    .flatMap((feature) => flattenCoordinates(feature.geometry.coordinates).map(normalizeAlaskaLongitude));
  const hawaiiCoordinates = features
    .filter((feature) => feature.properties.STATE === "HI")
    .flatMap((feature) => flattenCoordinates(feature.geometry.coordinates));
  const conusFit = fitProjector(conusCoordinates.map(albers), { height: 470, width: 964, x: 18, y: 18 });
  const alaskaRaw = (point: Point): Point => [point[0] * Math.cos(61 * Math.PI / 180), point[1]];
  const hawaiiRaw = (point: Point): Point => [point[0] * Math.cos(20.5 * Math.PI / 180), point[1]];
  const alaskaFit = fitProjector(alaskaCoordinates.map(alaskaRaw), { height: 145, width: 250, x: 26, y: 448 });
  const hawaiiFit = fitProjector(hawaiiCoordinates.map(hawaiiRaw), { height: 74, width: 178, x: 302, y: 520 });

  return (state: string, point: Point): Point => {
    if (state === "AK") return alaskaFit(alaskaRaw(normalizeAlaskaLongitude(point)));
    if (state === "HI") return hawaiiFit(hawaiiRaw(point));
    return conusFit(albers(point));
  };
}

function polygonRings(feature: NationalFeature): Point[][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates as Point[][];
  }
  return (feature.geometry.coordinates as Point[][][]).flat();
}

function makeFeaturePath(feature: NationalFeature, project: (state: string, point: Point) => Point) {
  return polygonRings(feature)
    .map((ring) => ring.map((point, index) => {
      const [x, y] = project(feature.properties.STATE, point);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ").concat(" Z"))
    .join(" ");
}

function mapFill(row: ComparisonRow | undefined) {
  if (!row) return "#252a28";
  if (row.direction === "red_to_blue") return "#4f95e8";
  if (row.direction === "blue_to_red") return "#d65b5f";
  if (row.to.winner === "blue") return "#294f79";
  if (row.to.winner === "red") return "#6f383c";
  return "#b8964e";
}

function voteBlock(snapshot: ElectionSnapshot) {
  const turnout = snapshot.turnout;
  return (
    <div className={styles.voteBlock}>
      <span><i className={styles.demDot} />{snapshot.demCandidate}: <strong>{formatNumber(snapshot.demVotes)}</strong></span>
      <span><i className={styles.repDot} />{snapshot.repCandidate}: <strong>{formatNumber(snapshot.repVotes)}</strong></span>
      <span>Other: <strong>{formatNumber(snapshot.otherVotes)}</strong></span>
      <span>Total presidential votes: <strong>{formatNumber(snapshot.totalVotes)}</strong></span>
      {turnout?.ballotsCast != null && turnout.ballotsCast !== snapshot.totalVotes ? (
        <span>Ballots cast: <strong>{formatNumber(turnout.ballotsCast)}</strong></span>
      ) : null}
      {turnout?.turnoutPct != null ? <span>Registered-voter turnout: <strong>{formatPct(turnout.turnoutPct)}</strong></span> : null}
      <small>{marginLabel(snapshot)}</small>
    </div>
  );
}

function SortButton({
  activeSort,
  children,
  column,
  order,
  onSort,
}: {
  activeSort: SortKey;
  children: React.ReactNode;
  column: SortKey;
  onSort: (column: SortKey) => void;
  order: SortOrder;
}) {
  const active = activeSort === column;
  return (
    <button
      aria-label={`Sort by ${String(children)}${active ? `, currently ${order === "asc" ? "ascending" : "descending"}` : ""}`}
      className={active ? styles.activeSort : undefined}
      onClick={() => onSort(column)}
      type="button"
    >
      {children}
      <span aria-hidden>{active ? (order === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export function CompareExplorer({ initialState }: { initialState: CompareInitialState }) {
  const initialPair = normalizePair(initialState.from, initialState.to);
  const requestedState = (initialState.state ?? "").toUpperCase();
  const initialStateCode = /^[A-Z]{2}$/.test(requestedState) ? requestedState : "";
  const [fromYear, setFromYear] = useState<number>(initialPair.from);
  const requestedFips = initialState.fips ?? "";
  const initialFips = /^\d{5}$/.test(requestedFips) ? requestedFips : null;
  const [toYear, setToYear] = useState<number>(initialPair.to);
  const [direction, setDirection] = useState<DirectionFilter>(normalizeDirectionFilter(initialState.direction));
  const [state, setState] = useState(initialStateCode);
  const [query, setQuery] = useState(initialState.query ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(initialState.query ?? "");
  const [sort, setSort] = useState<SortKey>(normalizeSort(initialState.sort));
  const [order, setOrder] = useState<SortOrder>(initialState.order === "asc" ? "asc" : "desc");
  const [page, setPage] = useState(clampInteger(initialState.page, 1, 1, 10000));
  const [pageSize, setPageSize] = useState(clampInteger(initialState.pageSize, 50, 25, 100));
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [summary, setSummary] = useState<ComparisonSummary>(emptySummary);
  const [coverage, setCoverage] = useState<ComparisonCoverage>(emptyCoverage);
  const [features, setFeatures] = useState<NationalFeature[]>([]);
  const [dataStatus, setDataStatus] = useState<"error" | "loading" | "ready">("loading");
  const [geometryStatus, setGeometryStatus] = useState<"error" | "loading" | "ready">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFips, setSelectedFips] = useState<string | null>(initialFips);
  const [focusedFips, setFocusedFips] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pathRefs = useRef(new Map<string, SVGPathElement>());

  useEffect(() => {
    const controller = new AbortController();
    setGeometryStatus("loading");
    fetch("/data/national-counties.geojson", { cache: "force-cache", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Geometry request returned ${response.status}.`);
        return response.json() as Promise<FeatureCollection>;
      })
      .then((collection) => {
        const loaded = Array.isArray(collection.features) ? collection.features : [];
        if (loaded.length !== 3144) {
          throw new Error(`National geometry contains ${loaded.length.toLocaleString()} features; expected 3,144.`);
        }
        setFeatures(loaded);
        setGeometryStatus("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setGeometryStatus("error");
          setErrorMessage(error.message);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const apiParameters = useMemo(() => {
    const params = new URLSearchParams({
      direction,
      from: String(fromYear),
      limit: "5000",
      offset: "0",
      to: String(toYear),
      view: "compact",
    });
    if (state) params.set("state", state);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    return params;
  }, [debouncedQuery, direction, fromYear, state, toYear]);

  const loadRows = useCallback(() => {
    const controller = new AbortController();
    setDataStatus("loading");
    setErrorMessage("");
    fetch(`/api/flips?${apiParameters.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as unknown;
        if (!response.ok) {
          const apiError = record(record(payload).error);
          throw new Error(stringValue(apiError, "message") ?? `Comparison request returned ${response.status}.`);
        }
        return payload;
      })
      .then((payload) => {
        const envelope = record(payload);
        const rawRows = Array.isArray(envelope.data) ? envelope.data : Array.isArray(envelope.rows) ? envelope.rows : [];
        const normalizedRows = rawRows
          .map((item) => normalizeRow(item, fromYear, toYear))
          .filter((item): item is ComparisonRow => Boolean(item));
        const meta = record(envelope.meta);
        setRows(normalizedRows);
        setSummary(normalizeSummary(meta.summary ?? envelope.summary, normalizedRows));
        setCoverage(normalizeCoverage(meta.coverage ?? envelope.coverage));
        setDataStatus("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setRows([]);
          setSummary(emptySummary);
          setCoverage(emptyCoverage);
          setDataStatus("error");
          setErrorMessage(error.message);
        }
      });
    return controller;
  }, [apiParameters, fromYear, toYear]);

  useEffect(() => {
    const controller = loadRows();
    return () => controller.abort();
  }, [loadRows, refreshKey]);

  useEffect(() => {
    const params = new URLSearchParams({
      direction,
      from: String(fromYear),
      order,
      page: String(page),
      pageSize: String(pageSize),
      sort,
      to: String(toYear),
    });
    if (state) params.set("state", state);
    if (query.trim()) params.set("q", query.trim());
    if (selectedFips) params.set("fips", selectedFips);
    window.history.replaceState(null, "", `/compare?${params.toString()}`);
  }, [direction, fromYear, order, page, pageSize, query, selectedFips, sort, state, toYear]);

  useEffect(() => {
    setPage(1);
  }, [direction, fromYear, query, state, toYear]);

  const states = useMemo(() => Array.from(new Set(features.map((feature) => feature.properties.STATE))).sort(), [features]);
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const compared = compareRows(left, right, sort);
    return order === "asc" ? compared : -compared;
  }), [order, rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const effectivePage = Math.min(page, pageCount);
  const visibleRows = sortedRows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
  const rowsByFips = useMemo(() => new Map(rows.map((row) => [row.fips, row])), [rows]);
  const selectedRow = selectedFips ? rowsByFips.get(selectedFips) : undefined;
  const selectedFeature = selectedFips ? features.find((feature) => feature.properties.GEOID === selectedFips) : undefined;
  const mapFeatures = useMemo(() => {
    if (!features.length) return [];
    const projector = makeNationalProjector(features);
    return features.map((feature) => ({
      feature,
      fips: feature.properties.GEOID,
      path: makeFeaturePath(feature, projector),
    }));
  }, [features]);
  const activeMapFips = focusedFips ?? rows[0]?.fips ?? mapFeatures[0]?.fips ?? null;

  useEffect(() => {
    if (page !== effectivePage) setPage(effectivePage);
  }, [effectivePage, page]);

  const csvUrl = useMemo(() => {
    const params = new URLSearchParams(apiParameters);
    params.set("format", "csv");
    return `/api/flips?${params.toString()}`;
  }, [apiParameters]);

  function setPair(value: string) {
    const [nextFrom, nextTo] = value.split("-").map(Number);
    const pair = normalizePair(String(nextFrom), String(nextTo));
    setFromYear(pair.from);
    setToYear(pair.to);
    setSelectedFips(null);
  }

  function handleSort(column: SortKey) {
    if (sort === column) {
      setOrder((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSort(column);
      setOrder(column === "county" || column === "state" || column === "direction" ? "asc" : "desc");
    }
    setPage(1);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function moveMapFocus(fips: string, change: number) {
    const currentIndex = mapFeatures.findIndex((entry) => entry.fips === fips);
    const nextIndex = Math.min(mapFeatures.length - 1, Math.max(0, currentIndex + change));
    const nextFips = mapFeatures[nextIndex]?.fips;
    if (nextFips) {
      setFocusedFips(nextFips);
      setSelectedFips(nextFips);
      pathRefs.current.get(nextFips)?.focus();
    }
  }

  const unavailableCount = Math.max(
    coverage.canonicalRegistryRows - coverage.matchedCanonicalRows,
    coverage.missingBothRows + coverage.missingFromRows + coverage.missingToRows + coverage.notComparableRows,
    0,
  );

  return (
    <div className={styles.explorer}>
      <section className={styles.controls} aria-label="Comparison filters">
        <label>
          <span>Election pair</span>
          <select value={`${fromYear}-${toYear}`} onChange={(event) => setPair(event.target.value)}>
            {yearPairs.map((pair) => <option key={pair.label} value={`${pair.from}-${pair.to}`}>{pair.label}</option>)}
          </select>
        </label>
        <label>
          <span>Outcome</span>
          <select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)}>
            {directions.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label>
          <span>State</span>
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">All states + DC</option>
            {states.map((stateCode) => <option key={stateCode} value={stateCode}>{stateCode}</option>)}
          </select>
        </label>
        <label className={styles.searchLabel}>
          <span>County or FIPS</span>
          <span className={styles.searchInput}>
            <Search aria-hidden size={16} />
            <input
              aria-label="Search county name or FIPS"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Erie or 42049"
              type="search"
              value={query}
            />
          </span>
        </label>
        <div className={styles.controlActions}>
          <button onClick={copyShareLink} type="button">
            {copied ? <Check aria-hidden size={15} /> : <Share2 aria-hidden size={15} />}
            {copied ? "Copied" : "Share view"}
          </button>
          <a href={csvUrl} download>
            <Download aria-hidden size={15} />
            Export CSV
          </a>
          <button aria-label="Refresh comparison data" onClick={() => setRefreshKey((value) => value + 1)} type="button">
            <RefreshCw aria-hidden size={15} />
            Refresh
          </button>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Comparison summary">
        <article>
          <span>Comparable</span>
          <strong>{summary.matchedCount.toLocaleString()}</strong>
          <small>{coverage.scope === "US" ? "national county matches" : `${coverage.scope} county matches`}</small>
        </article>
        <article className={styles.metricBlue}>
          <span>Red → blue</span>
          <strong>{summary.redToBlue.toLocaleString()}</strong>
          <small>party flips</small>
        </article>
        <article className={styles.metricRed}>
          <span>Blue → red</span>
          <strong>{summary.blueToRed.toLocaleString()}</strong>
          <small>party flips</small>
        </article>
        <article>
          <span>No party flip</span>
          <strong>{summary.noFlip.toLocaleString()}</strong>
          <small>same major-party winner</small>
        </article>
        <article className={unavailableCount ? styles.metricWarn : undefined}>
          <span>Not comparable</span>
          <strong>{unavailableCount.toLocaleString()}</strong>
          <small>never force-matched</small>
        </article>
      </section>

      {(coverage.caveats.length > 0 || unavailableCount > 0) && (
        <aside className={styles.coverageNote}>
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>Coverage stays explicit</strong>
            <p>
              {coverage.matchedCanonicalRows.toLocaleString()} of {coverage.canonicalRegistryRows.toLocaleString()} canonical
              county equivalents have a matched comparison in this scope. The national geometry still includes all 3,144
              current county equivalents, including Alaska rows with no county-grain presidential allocation.
            </p>
            {coverage.caveats.length ? (
              <ul>{coverage.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
            ) : null}
          </div>
        </aside>
      )}

      {(dataStatus === "error" || geometryStatus === "error") && (
        <div className={styles.error} role="alert">
          <AlertTriangle aria-hidden size={18} />
          <span>{errorMessage || "The comparison explorer could not load its data."}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)} type="button">Try again</button>
        </div>
      )}

      <section className={styles.mapPanel}>
        <header>
          <div>
            <span className={styles.sectionLabel}>Geographic view</span>
            <h2>{fromYear} → {toYear} county movement</h2>
          </div>
          <div className={styles.legend} aria-label="Map legend">
            <span><i className={styles.legendRedToBlue} />Red → blue</span>
            <span><i className={styles.legendBlueToRed} />Blue → red</span>
            <span><i className={styles.legendHeldBlue} />Held blue</span>
            <span><i className={styles.legendHeldRed} />Held red</span>
            <span><i className={styles.legendMissing} />Unavailable / filtered</span>
          </div>
        </header>
        <div className={styles.mapLayout}>
          <div className={styles.mapWrap}>
            {geometryStatus === "loading" ? (
              <div className={styles.mapLoading}><LoaderCircle aria-hidden className={styles.spin} size={24} />Building national map…</div>
            ) : geometryStatus === "ready" ? (
              <svg aria-labelledby="national-map-title national-map-description" className={styles.map} role="group" viewBox="0 0 1000 620">
                <title id="national-map-title">U.S. county presidential result movement from {fromYear} to {toYear}</title>
                <desc id="national-map-description">
                  All 3,144 canonical counties and county equivalents are present. Use Tab to enter the map, arrow keys to move
                  through FIPS order, and Enter or Space to inspect a county.
                </desc>
                <g>
                  {mapFeatures.map(({ feature, fips, path }) => {
                    const row = rowsByFips.get(fips);
                    const selected = selectedFips === fips;
                    const label = row
                      ? `${feature.properties.NAME}, ${feature.properties.STATE}, FIPS ${fips}: ${directionLabel(row)}, ${swingLabel(row.marginSwingPct)}`
                      : `${feature.properties.NAME}, ${feature.properties.STATE}, FIPS ${fips}: no comparison row in the current view`;
                    return (
                      <path
                        aria-label={label}
                        className={selected ? styles.selectedShape : styles.mapShape}
                        d={path}
                        fill={mapFill(row)}
                        fillRule="evenodd"
                        key={fips}
                        onClick={() => setSelectedFips(fips)}
                        onFocus={() => {
                          setFocusedFips(fips);
                          setSelectedFips(fips);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                            event.preventDefault();
                            moveMapFocus(fips, -1);
                          } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                            event.preventDefault();
                            moveMapFocus(fips, 1);
                          } else if (event.key === "Home") {
                            event.preventDefault();
                            moveMapFocus(fips, -mapFeatures.length);
                          } else if (event.key === "End") {
                            event.preventDefault();
                            moveMapFocus(fips, mapFeatures.length);
                          } else if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedFips(fips);
                          }
                        }}
                        ref={(node) => {
                          if (node) pathRefs.current.set(fips, node);
                          else pathRefs.current.delete(fips);
                        }}
                        role="button"
                        stroke={selected ? "#f4f1ea" : "#111412"}
                        strokeWidth={selected ? 1.6 : 0.55}
                        tabIndex={activeMapFips === fips ? 0 : -1}
                      >
                        <title>{label}</title>
                      </path>
                    );
                  })}
                </g>
              </svg>
            ) : null}
            <span className={styles.insetLabelAlaska}>Alaska</span>
            <span className={styles.insetLabelHawaii}>Hawaii</span>
          </div>
          <aside className={styles.mapDetail} aria-live="polite">
            {selectedFeature ? (
              <>
                <span className={styles.mono}>FIPS {selectedFeature.properties.GEOID}</span>
                <h3>{selectedFeature.properties.NAME}, {selectedFeature.properties.STATE}</h3>
                {selectedRow ? (
                  <>
                    <span className={`${styles.directionBadge} ${directionClass(selectedRow)}`}>{directionLabel(selectedRow)}</span>
                    <strong className={styles.detailSwing}>{swingLabel(selectedRow.marginSwingPct)}</strong>
                    <div className={styles.detailYears}>
                      <div><span>{selectedRow.from.year}</span><strong>{marginLabel(selectedRow.from)}</strong><small>{formatNumber(selectedRow.from.totalVotes)} votes</small></div>
                      <div><span>{selectedRow.to.year}</span><strong>{marginLabel(selectedRow.to)}</strong><small>{formatNumber(selectedRow.to.totalVotes)} votes</small></div>
                    </div>
                    <span className={`${styles.confidence} ${styles[`confidence${selectedRow.confidence[0].toUpperCase()}${selectedRow.confidence.slice(1)}`]}`}>
                      {selectedRow.confidence} confidence
                    </span>
                    {selectedRow.caveat ? <p>{selectedRow.caveat}</p> : null}
                    <a href={`/county/${selectedRow.fips}`}>Open county profile <ExternalLink aria-hidden size={14} /></a>
                  </>
                ) : (
                  <>
                    <span className={`${styles.confidence} ${styles.confidenceUnavailable}`}>unavailable in current view</span>
                    <p>
                      This polygon remains on the map even when the selected filters or source geography do not yield a
                      county-level comparison. No result is inferred from another reporting unit.
                    </p>
                    <a href={`/county/${selectedFeature.properties.GEOID}`}>Open county profile <ExternalLink aria-hidden size={14} /></a>
                  </>
                )}
              </>
            ) : (
              <>
                <span className={styles.mono}>Map inspection</span>
                <h3>Select a county</h3>
                <p>Click a polygon, focus the map with Tab, or choose a table row to inspect its movement and coverage.</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className={styles.tablePanel}>
        <header>
          <div>
            <span className={styles.sectionLabel}>Auditable rows</span>
            <h2>Candidate totals and movement</h2>
            <p>
              {summary.selectedCount.toLocaleString()} row{summary.selectedCount === 1 ? "" : "s"} match the current outcome filter.
              Turnout shows ballots cast when loaded; otherwise the presidential vote total remains clearly labeled.
            </p>
          </div>
          <label>
            <span>Rows per page</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </header>
        <div className={styles.tableWrap} aria-busy={dataStatus === "loading"}>
          {dataStatus === "loading" ? (
            <div className={styles.tableLoading}><LoaderCircle aria-hidden className={styles.spin} size={20} />Loading comparison rows…</div>
          ) : null}
          <table>
            <thead>
              <tr>
                <th><SortButton activeSort={sort} column="state" onSort={handleSort} order={order}>State</SortButton></th>
                <th><SortButton activeSort={sort} column="county" onSort={handleSort} order={order}>County / FIPS</SortButton></th>
                <th><SortButton activeSort={sort} column="direction" onSort={handleSort} order={order}>Movement</SortButton></th>
                <th><SortButton activeSort={sort} column="fromTotal" onSort={handleSort} order={order}>{fromYear} totals</SortButton></th>
                <th><SortButton activeSort={sort} column="toTotal" onSort={handleSort} order={order}>{toYear} totals</SortButton></th>
                <th><SortButton activeSort={sort} column="swing" onSort={handleSort} order={order}>Margin swing</SortButton></th>
                <th><SortButton activeSort={sort} column="voteChange" onSort={handleSort} order={order}>Vote / turnout change</SortButton></th>
                <th><SortButton activeSort={sort} column="confidence" onSort={handleSort} order={order}>Coverage</SortButton></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr className={selectedFips === row.fips ? styles.selectedRow : undefined} key={row.fips}>
                  <td><span className={styles.stateCode}>{row.state}</span></td>
                  <td>
                    <button className={styles.countyButton} onClick={() => setSelectedFips(row.fips)} type="button">
                      <strong>{row.county}</strong>
                      <span className={styles.mono}>{row.fips}</span>
                    </button>
                  </td>
                  <td><span className={`${styles.directionBadge} ${directionClass(row)}`}>{directionLabel(row)}</span></td>
                  <td>{voteBlock(row.from)}</td>
                  <td>{voteBlock(row.to)}</td>
                  <td><strong className={row.marginSwingPct != null && row.marginSwingPct > 0 ? styles.towardBlue : styles.towardRed}>{swingLabel(row.marginSwingPct)}</strong></td>
                  <td>
                    <div className={styles.changeBlock}>
                      <strong>{signedNumber(row.totalVoteChange)} presidential votes</strong>
                      <span>{row.totalVoteChangePct == null ? "Change rate unavailable" : `${row.totalVoteChangePct > 0 ? "+" : "−"}${formatPct(row.totalVoteChangePct)} vs. ${fromYear}`}</span>
                      <small>{formatNumber(turnoutValue(row.from))} → {formatNumber(turnoutValue(row.to))} reported turnout / votes</small>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.confidence} ${styles[`confidence${row.confidence[0].toUpperCase()}${row.confidence.slice(1)}`]}`}>{row.confidence}</span>
                    {row.caveat ? <span className={styles.caveat} title={row.caveat}><AlertTriangle aria-hidden size={13} />Caveat</span> : null}
                  </td>
                </tr>
              ))}
              {dataStatus === "ready" && visibleRows.length === 0 ? (
                <tr><td className={styles.emptyRows} colSpan={8}>No comparable county rows match these filters. Try a broader outcome, state, or search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className={styles.pagination}>
          <span>
            {sortedRows.length ? `${((effectivePage - 1) * pageSize + 1).toLocaleString()}–${Math.min(effectivePage * pageSize, sortedRows.length).toLocaleString()}` : "0"}
            {" "}of {sortedRows.length.toLocaleString()} loaded rows
          </span>
          <div>
            <button aria-label="Previous page" disabled={effectivePage <= 1} onClick={() => setPage(effectivePage - 1)} type="button"><ChevronLeft aria-hidden size={16} /></button>
            <span>Page {effectivePage.toLocaleString()} of {pageCount.toLocaleString()}</span>
            <button aria-label="Next page" disabled={effectivePage >= pageCount} onClick={() => setPage(effectivePage + 1)} type="button"><ChevronRight aria-hidden size={16} /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}
