"use client";

import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  LoaderCircle,
  Printer,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { rowsToCsv } from "@/lib/csv";
import {
  buildNationalCountyMapFeatures,
  type NationalCountyFeature,
  type NationalCountyFeatureCollection,
} from "@/lib/national-county-map";
import {
  affectedLocationText,
  affectedLocationUnitLabel,
  securityCountExplanation,
  securityIncidentSummaryText,
  summarizeSecurityIncidents,
  threatCountBasisText,
  threatCountText,
} from "@/lib/security-incident-summary";
import {
  securityElectionResultText,
  summarizeSecurityElectionWinner,
  type SecurityElectionOverlay,
  type SecurityElectionOverlayRow,
} from "@/lib/security-result-overlay";
import type { NationalSecurityIncidentReport, SecurityIncidentSummary } from "@/lib/types";
import baseStyles from "../compare/compare.module.css";
import styles from "./security.module.css";

const expectedCountyFeatureCount = 3144;
const reportRowLimit = 500;
type SecurityMapLayer = "security" | "winner" | "margin";

type SecurityExplorerProps = {
  electionOverlay: SecurityElectionOverlay;
  report: NationalSecurityIncidentReport;
};

type SourceManifestEntry = {
  authority: string;
  localArtifact: string;
  tier: SecurityIncidentSummary["sourceTier"];
  title: string;
  url: string;
};

function incidentFips(row: SecurityIncidentSummary): string | null {
  if (row.reportingGrain !== "county") return null;
  return row.jurisdictionTag.startsWith("county:")
    ? row.jurisdictionTag.slice("county:".length)
    : row.jurisdictionCode;
}

function incidentSourceLabel(row: SecurityIncidentSummary) {
  if (row.sourceTier === "official") {
    return row.reportingGrain === "county" ? "Official county record" : "Official state record";
  }
  if (row.sourceStatus === "research_compilation") return "Later public-source tracker";
  if (row.sourceStatus === "supplemental_earlier_compilation") return "Earlier Election Day compilation";
  return "Supplemental compilation";
}

function contextSourceLabel(source: NationalSecurityIncidentReport["nationalContext"][number]) {
  if (source.sourceTier === "official") return "Official context";
  if (source.reportedThreatCount !== undefined) return "Later public-source tracker";
  return source.scopeLabel ?? "Supplemental context";
}

function incidentFill(rows: SecurityIncidentSummary[]) {
  if (rows.some((row) => row.sourceTier === "official")) return "#f97316";
  if (rows.some((row) => row.sourceStatus === "supplemental_earlier_compilation")) return "#c084fc";
  return rows.length ? "#fbbf24" : "url(#security-unknown)";
}

function incidentOutlineStroke(rows: SecurityIncidentSummary[]) {
  if (rows.some((row) => row.sourceTier === "official")) return "#f97316";
  if (rows.some((row) => row.sourceStatus === "supplemental_earlier_compilation")) return "#c084fc";
  return "#fbbf24";
}

function winnerFill(row: SecurityElectionOverlayRow | undefined) {
  if (!row || row.winner === "unavailable") return "url(#security-result-unavailable)";
  if (row.winner === "blue") return "#4f95e8";
  if (row.winner === "red") return "#d65b5f";
  return "#f0c36a";
}

function marginFill(row: SecurityElectionOverlayRow | undefined) {
  if (!row || row.winner === "unavailable") return "url(#security-result-unavailable)";
  if (row.winner === "tie") return "#f0c36a";
  const margin = Math.abs(row.demMarginPct ?? 0);
  const shade = margin >= 30 ? 3 : margin >= 15 ? 2 : margin >= 5 ? 1 : 0;
  const blue = ["#bddbff", "#82b8ff", "#4f95e8", "#294f79"];
  const red = ["#ffc9c3", "#ff9f91", "#d65b5f", "#6f383c"];
  return row.winner === "blue" ? blue[shade] : red[shade];
}

function electionFill(row: SecurityElectionOverlayRow | undefined, layer: SecurityMapLayer) {
  return layer === "margin" ? marginFill(row) : winnerFill(row);
}

function formatNumber(value: number | null) {
  return value == null ? "Not available" : value.toLocaleString("en-US");
}

function formatPercent(value: number | null) {
  return value == null ? "Not available" : `${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  const dateOnly = value.slice(0, 10);
  const parsed = new Date(dateOnly + "T00:00:00");
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.setAttribute("readonly", "");
  textarea.style.opacity = "0";
  textarea.style.position = "fixed";
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was not available.");
}

export function SecurityExplorer({ electionOverlay, report }: SecurityExplorerProps) {
  const [features, setFeatures] = useState<NationalCountyFeature[]>([]);
  const [geometryStatus, setGeometryStatus] = useState<"error" | "loading" | "ready">("loading");
  const [geometryError, setGeometryError] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [disruptionFilter, setDisruptionFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedFips, setSelectedFips] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<SecurityMapLayer>("security");
  const [focusedFips, setFocusedFips] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const reportRef = useRef<HTMLElement | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    const controller = new AbortController();
    setGeometryStatus("loading");
    setGeometryError("");

    fetch("/data/national-counties.geojson", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("County geometry request failed with " + response.status + ".");
        return response.json() as Promise<NationalCountyFeatureCollection>;
      })
      .then((collection) => {
        const loaded = collection.features ?? [];
        if (loaded.length !== expectedCountyFeatureCount) {
          throw new Error(
            "Expected " + expectedCountyFeatureCount.toLocaleString() + " county features but loaded " + loaded.length.toLocaleString() + ".",
          );
        }
        setFeatures(loaded);
        setGeometryStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFeatures([]);
        setGeometryError(error instanceof Error ? error.message : "County geometry could not be loaded.");
        setGeometryStatus("error");
      });

    return () => controller.abort();
  }, []);

  const stateOptions = useMemo(
    () => [...report.stateSummaries].sort((left, right) => left.stateName.localeCompare(right.stateName)),
    [report.stateSummaries],
  );
  const disruptionOptions = useMemo(
    () =>
      Array.from(
        new Map(report.incidents.map((row) => [row.disruptionType, row.disruptionLabel])).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [report.incidents],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = (params.get("state") ?? "").toUpperCase();
    const requestedDisruption = params.get("disruption") ?? "";
    const requestedQuery = (params.get("q") ?? "").slice(0, 160);
    const requestedLayer = params.get("layer");
    setStateFilter(stateOptions.some((state) => state.state === requestedState) ? requestedState : "");
    setDisruptionFilter(
      disruptionOptions.some(([value]) => value === requestedDisruption) ? requestedDisruption : "",
    );
    setQuery(requestedQuery);
    setMapLayer(requestedLayer === "winner" || requestedLayer === "margin" ? requestedLayer : "security");
    setFiltersHydrated(true);

    if (params.get("report") === "1") {
      setGeneratedAt(new Date().toISOString());
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => reportRef.current?.scrollIntoView({ block: "start" }));
      });
    }
  }, [disruptionOptions, stateOptions]);

  useEffect(() => {
    if (!filtersHydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (stateFilter) params.set("state", stateFilter);
    else params.delete("state");
    if (disruptionFilter) params.set("disruption", disruptionFilter);
    else params.delete("disruption");
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    if (generatedAt) params.set("report", "1");
    else params.delete("report");
    if (mapLayer === "security") params.delete("layer");
    else params.set("layer", mapLayer);
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (search ? `?${search}` : "") + window.location.hash,
    );
  }, [disruptionFilter, filtersHydrated, generatedAt, mapLayer, query, stateFilter]);

  const filteredRows = useMemo(
    () =>
      report.incidents.filter((row) => {
        if (stateFilter && row.state !== stateFilter) return false;
        if (disruptionFilter && row.disruptionType !== disruptionFilter) return false;
        if (!deferredQuery) return true;
        const searchText = [
          row.state,
          row.stateName,
          row.county,
          row.jurisdictionCode ?? "",
          row.reportingGrain,
          row.eventTypeLabel,
          row.disruptionLabel,
          row.sourceAuthority,
          row.sourceTitle,
          row.sourceTier,
          row.sourceStatus,
          ...row.namedLocations,
        ].join(" ").toLowerCase();
        return searchText.includes(deferredQuery);
      }),
    [deferredQuery, disruptionFilter, report.incidents, stateFilter],
  );
  const filteredTotals = useMemo(() => summarizeSecurityIncidents(filteredRows), [filteredRows]);
  const reportStateSummaries = useMemo(() => {
    const grouped = new Map<string, SecurityIncidentSummary[]>();
    for (const row of filteredRows) {
      const rows = grouped.get(row.state);
      if (rows) rows.push(row);
      else grouped.set(row.state, [row]);
    }
    return Array.from(grouped.entries())
      .map(([state, rows]) => ({
        ...summarizeSecurityIncidents(rows),
        state,
        stateName: rows[0]?.stateName ?? state,
      }))
      .sort((left, right) => left.stateName.localeCompare(right.stateName));
  }, [filteredRows]);
  const reportDateSummaries = useMemo(() => {
    const grouped = new Map<string, SecurityIncidentSummary[]>();
    for (const row of filteredRows) {
      const rows = grouped.get(row.eventDate);
      if (rows) rows.push(row);
      else grouped.set(row.eventDate, [row]);
    }
    return Array.from(grouped.entries())
      .map(([eventDate, rows]) => ({
        ...summarizeSecurityIncidents(rows),
        eventDate,
      }))
      .sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  }, [filteredRows]);
  const allRowsByFips = useMemo(() => {
    const grouped = new Map<string, SecurityIncidentSummary[]>();
    for (const row of report.incidents) {
      const fips = incidentFips(row);
      if (!fips) continue;
      const countyRows = grouped.get(fips);
      if (countyRows) countyRows.push(row);
      else grouped.set(fips, [row]);
    }
    return grouped;
  }, [report.incidents]);
  const filteredRowsByFips = useMemo(() => {
    const grouped = new Map<string, SecurityIncidentSummary[]>();
    for (const row of filteredRows) {
      const fips = incidentFips(row);
      if (!fips) continue;
      const countyRows = grouped.get(fips);
      if (countyRows) countyRows.push(row);
      else grouped.set(fips, [row]);
    }
    return grouped;
  }, [filteredRows]);
  const electionRowsByFips = useMemo(
    () => new Map(electionOverlay.rows.map((row) => [row.fips, row])),
    [electionOverlay.rows],
  );
  const mapFeatures = useMemo(() => buildNationalCountyMapFeatures(features), [features]);
  const featureByFips = useMemo(
    () => new Map(features.map((feature) => [feature.properties.GEOID, feature])),
    [features],
  );
  const detailFips = selectedFips ?? focusedFips;
  const detailFeature = detailFips ? featureByFips.get(detailFips) : undefined;
  const detailRows = detailFips ? allRowsByFips.get(detailFips) ?? [] : [];
  const detailMatchesFilters = detailFips ? filteredRowsByFips.has(detailFips) : false;
  const detailElectionResult = detailFips ? electionRowsByFips.get(detailFips) : undefined;
  const detailElectionSummary = detailElectionResult
    ? summarizeSecurityElectionWinner(detailElectionResult)
    : null;
  const activeMapFips = focusedFips ?? selectedFips ?? mapFeatures[0]?.fips ?? null;
  const loadedSources = useMemo(() => {
    const sources = new Map<string, SourceManifestEntry>();
    for (const row of filteredRows) {
      sources.set(row.sourceUrl, {
        authority: row.sourceAuthority,
        localArtifact: row.localArtifact,
        tier: row.sourceTier,
        title: row.sourceTitle,
        url: row.sourceUrl,
      });
    }
    return Array.from(sources.values()).sort((left, right) => left.authority.localeCompare(right.authority));
  }, [filteredRows]);
  const trackerContext = report.nationalContext.find(
    (source) => source.reportedThreatCount !== undefined,
  );
  const threatMetric = !filteredTotals.rowCount
    ? "No matching rows"
    : filteredTotals.knownThreatCount > 0
      ? `At least ${filteredTotals.knownThreatCount.toLocaleString()}`
      : "No published count";
  const reportRows = filteredRows.slice(0, reportRowLimit);
  const reportRowsTruncated = reportRows.length < filteredRows.length;
  const selectedStateName =
    stateOptions.find((state) => state.state === stateFilter)?.stateName
    || stateFilter
    || "United States";

  function moveMapFocus(fips: string, change: number) {
    const currentIndex = mapFeatures.findIndex((entry) => entry.fips === fips);
    const nextIndex = Math.min(mapFeatures.length - 1, Math.max(0, currentIndex + change));
    const nextFips = mapFeatures[nextIndex]?.fips;
    if (!nextFips) return;
    setFocusedFips(nextFips);
    pathRefs.current.get(nextFips)?.focus();
  }

  function generateReport() {
    setGeneratedAt(new Date().toISOString());
    setShareStatus("");
    window.requestAnimationFrame(() => reportRef.current?.scrollIntoView({ block: "start" }));
  }

  async function copyReportLink() {
    const params = new URLSearchParams();
    if (stateFilter) params.set("state", stateFilter);
    if (disruptionFilter) params.set("disruption", disruptionFilter);
    if (query.trim()) params.set("q", query.trim());
    if (mapLayer !== "security") params.set("layer", mapLayer);
    params.set("report", "1");
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    try {
      await copyText(url);
      setShareStatus("Filtered report link copied.");
    } catch {
      setShareStatus("Copy failed. Choose Generate report, then copy the address bar URL.");
    }
  }

  function exportCsv() {
    const csv = rowsToCsv(
      [
        "State",
        "Geography level",
        "County or area",
        "County FIPS",
        "Event date",
        "Event",
        "Disruption",
        "Affected count",
        "Affected unit",
        "Reported threats",
        "Threat count basis",
        "Threat count source URL",
        "Threat count local artifact",
        "Named locations",
        "Record source tier",
        "Source authority",
        "Source title",
        "Source URL",
        "Supporting source URLs",
        "Confidence",
        "Caveat",
      ],
      filteredRows.map((row) => [
        row.state,
        row.reportingGrain,
        row.county,
        incidentFips(row) ?? "",
        row.eventDate,
        row.eventTypeLabel,
        row.disruptionLabel,
        row.affectedLocations,
        affectedLocationUnitLabel(row.affectedLocationUnit, row.affectedLocations ?? 2),
        row.threatCount,
        row.threatCountBasis,
        row.threatCountSourceUrl,
        row.threatCountLocalArtifact,
        row.namedLocations.join(" | "),
        row.sourceTier,
        row.sourceAuthority,
        row.sourceTitle,
        row.sourceUrl,
        row.supportingSourceUrls.join(" | "),
        row.confidence,
        row.caveat,
      ]),
    );
    downloadText("security-incidents-2024.csv", csv, "text/csv;charset=utf-8");
  }

  function exportJson() {
    const generated = new Date().toISOString();
    downloadText(
      "security-incidents-2024-source-report.json",
      JSON.stringify(
        {
          caveat: report.caveat,
          electionYear: report.electionYear,
          filters: {
            disruption: disruptionFilter || null,
            query: query.trim() || null,
            state: stateFilter || null,
            layer: mapLayer,
          },
          generatedAt: generated,
          electionOverlay: {
            dataSource: electionOverlay.dataSource,
            incidentCountyCount: electionOverlay.incidentCountyCount,
            matchedCountyCount: electionOverlay.matchedCountyCount,
            year: electionOverlay.year,
            resultRows: electionOverlay.rows.filter((resultRow) =>
              filteredRows.some((incidentRow) => incidentFips(incidentRow) === resultRow.fips),
            ),
          },
          incidents: filteredRows,
          nationalContext: report.nationalContext,
          summaries: {
            byDate: reportDateSummaries,
            byState: reportStateSummaries,
          },
          sources: loadedSources,
          stateCoverage: report.stateCoverage,
          totals: filteredTotals,
        },
        null,
        2,
      ) + "\n",
      "application/json;charset=utf-8",
    );
  }

  function exportSvg() {
    const svg = mapSvgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1000");
    clone.setAttribute("height", "620");
    downloadText(
      `security-incidents-2024-${mapLayer}-map.svg`,
      '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone),
      "image/svg+xml;charset=utf-8",
    );
  }

  return (
    <div className={baseStyles.explorer}>
      <section className={baseStyles.controls + " " + styles.securityControls} aria-label="Security incident report filters" data-print-hide="true" data-tour="security-controls">
        <label>
          <span>State</span>
          <select onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}>
            <option value="">All loaded states</option>
            {stateOptions.map((state) => (
              <option key={state.state} value={state.state}>
                {state.stateName} ({state.state})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Disruption</span>
          <select onChange={(event) => setDisruptionFilter(event.target.value)} value={disruptionFilter}>
            <option value="">All disruption types</option>
            {disruptionOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>County, state, FIPS, or source</span>
          <span className={baseStyles.searchInput}>
            <Search aria-hidden size={16} />
            <input
              aria-label="Search county, state, FIPS, or source"
              maxLength={160}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Fulton, Minnesota, or 13121"
              type="search"
              value={query}
            />
          </span>
        </label>
        <div className={baseStyles.controlActions + " " + styles.exportActions}>
          <button onClick={generateReport} type="button">
            <FileText aria-hidden size={15} />
            Generate report
          </button>
          <button onClick={() => void copyReportLink()} type="button">
            <Share2 aria-hidden size={15} />
            Copy report link
          </button>
          <button onClick={exportCsv} type="button">
            <Download aria-hidden size={15} />
            CSV
          </button>
          <button onClick={exportJson} type="button">
            <FileJson aria-hidden size={15} />
            Sources JSON
          </button>
          <button disabled={geometryStatus !== "ready"} onClick={exportSvg} type="button">
            <Download aria-hidden size={15} />
            Map SVG
          </button>
          <button onClick={() => window.print()} type="button">
            <Printer aria-hidden size={15} />
            Print / save PDF
          </button>
          {shareStatus && <span className={styles.shareStatus} role="status">{shareStatus}</span>}
        </div>
      </section>

      <section className={baseStyles.metrics + " " + styles.securityMetrics} aria-label="Filtered security incident summary" data-print-hide="true" data-tour="security-metrics">
        <article>
          <span>States with matching records</span>
          <strong>{filteredTotals.stateCount.toLocaleString()}</strong>
          <small>{filteredTotals.countyCount.toLocaleString()} mapped counties in the current filters</small>
        </article>
        <article>
          <span>Matching loaded rows</span>
          <strong>{threatMetric}</strong>
          <small>
            {filteredTotals.unknownThreatCountRows
              ? `${filteredTotals.unknownThreatCountRows.toLocaleString()} county record names a county but gives no number, so it is mapped but not added to the total`
              : "Every matching row includes a reported count"}
          </small>
        </article>
        <article className={baseStyles.metricWarn + " " + styles.textMetric}>
          <span>Later public-source tracker</span>
          <strong>At least {trackerContext?.reportedThreatCount?.toLocaleString() ?? "227"} threats</strong>
          <small>
            {formatDate(report.reportingWindow.start)} through {formatDate(report.reportingWindow.end)}; independent of filters
          </small>
        </article>
        <article className={styles.textMetric}>
          <span>County not specified</span>
          <strong>{filteredTotals.statewideUnspecifiedThreatCount.toLocaleString()} threats</strong>
          <small>
            {filteredTotals.statewideUnspecifiedRowCount.toLocaleString()} state-level record{filteredTotals.statewideUnspecifiedRowCount === 1 ? "" : "s"} kept in totals but not drawn on counties
          </small>
        </article>
        <article>
          <span>Source strength</span>
          <strong>{filteredTotals.officialRowCount} official / {filteredTotals.supplementalRowCount} supplemental</strong>
          <small>official detail and clearly labeled public-source compilations</small>
        </article>
      </section>

      <aside className={baseStyles.coverageNote} data-print-hide="true">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>Coverage is intentionally explicit</strong>
          <p>{report.caveat}</p>
          <p>{securityCountExplanation}</p>
        </div>
      </aside>

      {(electionOverlay.dataSource === "seed_fallback"
        || electionOverlay.matchedCountyCount < electionOverlay.incidentCountyCount) && (
        <aside className={styles.overlayWarning} data-print-hide="true" role="status">
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>Election overlay coverage is limited in this build</strong>
            <p>
              {electionOverlay.matchedCountyCount.toLocaleString()} of {electionOverlay.incidentCountyCount.toLocaleString()} mapped
              incident counties have a joined 2024 presidential result. Missing joins remain unshaded and are never treated as zero.
              {electionOverlay.dataSource === "seed_fallback" ? " This build is using the limited seed fallback rather than the production result database." : ""}
            </p>
          </div>
        </aside>
      )}

      {geometryStatus === "error" && (
        <div className={baseStyles.error} data-print-hide="true" role="alert">
          <AlertTriangle aria-hidden size={18} />
          <span>{geometryError}</span>
        </div>
      )}

      <section className={baseStyles.mapPanel} data-print-hide="true" data-tour="security-map">
        <header>
          <div>
            <span className={baseStyles.sectionLabel}>Nationwide election-period county view</span>
            <h2>
              {mapLayer === "security"
                ? "Mapped November 5-9, 2024 bomb-threat counties"
                : mapLayer === "winner"
                  ? "2024 presidential winners in mapped threat counties"
                  : "2024 presidential margins in mapped threat counties"}
            </h2>
            <p className={styles.mapQualifier}>
              Election shading and incident outlines are independent county-level context. Their overlap does not imply
              a relationship, cause, fraud, misconduct, altered votes, or an incorrect outcome.
            </p>
          </div>
          <div className={styles.mapHeaderTools}>
            <div className={styles.layerToggle} role="group" aria-label="Map data layer" data-tour="security-layer-toggle">
              <button aria-pressed={mapLayer === "security"} onClick={() => setMapLayer("security")} type="button">Incident sources</button>
              <button aria-pressed={mapLayer === "winner"} onClick={() => setMapLayer("winner")} type="button">2024 winner</button>
              <button aria-pressed={mapLayer === "margin"} onClick={() => setMapLayer("margin")} type="button">2024 margin</button>
            </div>
            <div className={baseStyles.legend} aria-label="Map legend">
              {mapLayer === "security" ? (
                <>
                  <span><i className={styles.legendMedium} />Official county detail</span>
                  <span><i className={styles.legendLow} />Later public-source tracker</span>
                  <span><i className={styles.legendEarlier} />Earlier Election Day compilation</span>
                </>
              ) : (
                <>
                  <span><i className={mapLayer === "margin" ? styles.legendBlueMargin : styles.legendBlue} />Democratic {mapLayer === "margin" ? "margin" : "winner"}</span>
                  <span><i className={mapLayer === "margin" ? styles.legendRedMargin : styles.legendRed} />Republican {mapLayer === "margin" ? "margin" : "winner"}</span>
                  <span><i className={styles.legendTie} />Tie</span>
                  <span><i className={styles.legendResultMissing} />Result unavailable</span>
                  <span><i className={styles.legendOfficialOutline} />Official incident outline</span>
                  <span><i className={styles.legendTrackerOutline} />Tracker incident outline</span>
                  <span><i className={styles.legendEarlierOutline} />Earlier compilation outline</span>
                  {mapLayer === "margin" && (
                    <span className={styles.marginThresholds}>Shade thresholds: under 5, 5-14.99, 15-29.99, and 30+ points</span>
                  )}
                </>
              )}
              <span><i className={styles.legendFiltered} />Loaded, filtered out</span>
              <span><i className={styles.legendUnknown} />No loaded matching record</span>
            </div>
            <span className={styles.overlayCoverage}>
              {electionOverlay.matchedCountyCount.toLocaleString()} / {electionOverlay.incidentCountyCount.toLocaleString()} mapped incident counties joined to canonical 2024 results
            </span>
          </div>
        </header>
        <div className={baseStyles.mapLayout}>
          <div className={baseStyles.mapWrap}>
            {geometryStatus === "loading" ? (
              <div className={baseStyles.mapLoading}>
                <LoaderCircle aria-hidden className={baseStyles.spin} size={24} />
                Building the 3,144-county map...
              </div>
            ) : geometryStatus === "ready" ? (
              <svg
                aria-labelledby="security-map-title security-map-description"
                className={baseStyles.map}
                ref={mapSvgRef}
                role="group"
                viewBox="0 0 1000 620"
              >
                <title id="security-map-title">
                  {mapLayer === "security" ? "2024 source-linked county bomb-threat incident records" : `2024 presidential ${mapLayer} overlay with source-linked county incident outlines`}
                </title>
                <desc id="security-map-description">
                  All 3,144 counties and county equivalents remain visible. Only county-attributed incident records are
                  mapped; 66 threats reported without a county remain in totals and the report. In election modes, fill
                  shows the joined 2024 presidential winner or margin and the colored outline retains incident source
                  status. Hatched counties have no loaded matching record. Use Tab to enter the map, arrow keys to move
                  through FIPS order, and Enter or Space to pin a county.
                </desc>
                <defs>
                  <pattern height="8" id="security-unknown" patternUnits="userSpaceOnUse" width="8">
                    <rect fill="#252a28" height="8" width="8" />
                    <path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#363c39" strokeWidth="1" />
                  </pattern>
                  <pattern height="8" id="security-result-unavailable" patternUnits="userSpaceOnUse" width="8">
                    <rect fill="#202625" height="8" width="8" />
                    <path d="M-2 6 L6 -2 M2 10 L10 2" stroke="#718079" strokeWidth="1.2" />
                  </pattern>
                </defs>
                <g>
                  {mapFeatures.map(({ feature, fips, path }) => {
                    const matchingRows = filteredRowsByFips.get(fips) ?? [];
                    const loadedRows = allRowsByFips.get(fips) ?? [];
                    const electionRow = electionRowsByFips.get(fips);
                    const isSelected = selectedFips === fips;
                    const outsideSelectedState = Boolean(stateFilter && feature.properties.STATE !== stateFilter);
                    const incidentSummary = matchingRows.length
                      ? securityIncidentSummaryText(matchingRows)
                      : loadedRows.length
                        ? "Loaded county record excluded by the current filters"
                        : "No loaded county record; this does not mean no incident occurred";
                    const electionSummary = electionRow
                      ? securityElectionResultText(electionRow)
                      : "No joined 2024 presidential county result";
                    const summary = mapLayer === "security"
                      ? incidentSummary
                      : `${electionSummary}; ${incidentSummary}`;
                    const fill = matchingRows.length
                      ? mapLayer === "security"
                        ? incidentFill(matchingRows)
                        : electionFill(electionRow, mapLayer)
                      : loadedRows.length
                        ? "#5c4a38"
                        : "url(#security-unknown)";
                    const opacity = outsideSelectedState ? 0.18 : matchingRows.length ? 1 : loadedRows.length ? 0.55 : 0.9;
                    return (
                      <g key={fips}>
                        {mapLayer !== "security" && loadedRows.length > 0 && (
                          <path
                            aria-hidden="true"
                            d={path}
                            fill="none"
                            opacity={outsideSelectedState ? 0.18 : matchingRows.length ? 0.98 : 0.5}
                            pointerEvents="none"
                            stroke={matchingRows.length ? incidentOutlineStroke(matchingRows) : "#5c4a38"}
                            strokeDasharray={matchingRows.length ? undefined : "4 3"}
                            strokeLinejoin="round"
                            strokeWidth={3.2}
                          />
                        )}
                        <path
                          aria-label={feature.properties.NAME + ", " + feature.properties.STATE + ", FIPS " + fips + ": " + summary}
                          aria-pressed={isSelected}
                          className={isSelected ? baseStyles.selectedShape : baseStyles.mapShape}
                          d={path}
                          fill={fill}
                          fillRule="evenodd"
                          onClick={() => setSelectedFips(fips)}
                          onFocus={() => setFocusedFips(fips)}
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
                          opacity={opacity}
                          ref={(node) => {
                            if (node) pathRefs.current.set(fips, node);
                            else pathRefs.current.delete(fips);
                          }}
                          role="button"
                          stroke={isSelected ? "#f4f1ea" : "#101312"}
                          strokeWidth={isSelected ? 1.8 : 0.55}
                          tabIndex={activeMapFips === fips ? 0 : -1}
                        >
                          <title>{feature.properties.NAME}, {feature.properties.STATE}: {summary}</title>
                        </path>
                      </g>
                    );
                  })}
                </g>
              </svg>
            ) : null}
            <span className={baseStyles.insetLabelAlaska}>Alaska</span>
            <span className={baseStyles.insetLabelHawaii}>Hawaii</span>
          </div>

          <aside className={baseStyles.mapDetail} aria-live="polite">
            {detailFeature ? (
              <>
                <div className={styles.detailHeading}>
                  <span className={baseStyles.mono}>FIPS {detailFeature.properties.GEOID}</span>
                  {selectedFips && (
                    <button aria-label="Clear pinned county" onClick={() => setSelectedFips(null)} type="button">
                      <X aria-hidden size={14} />
                      Clear
                    </button>
                  )}
                </div>
                <h3>{detailFeature.properties.NAME}, {detailFeature.properties.STATE}</h3>
                {selectedFips && <p className={styles.pinnedNote}>Pinned selection - hovering elsewhere will not replace these details.</p>}
                {detailElectionResult && detailElectionSummary ? (
                  <section className={styles.electionDetail} aria-label="2024 presidential result">
                    <div className={styles.electionDetailHeader}>
                      <span>{detailElectionResult.year} presidential result</span>
                      <strong
                        className={
                          detailElectionSummary.party === "Democratic"
                            ? styles.electionWinnerBlue
                            : detailElectionSummary.party === "Republican"
                              ? styles.electionWinnerRed
                              : styles.electionWinnerNeutral
                        }
                      >
                        {detailElectionSummary.party === "Tie"
                          ? "Major-party tie"
                          : detailElectionSummary.party === "Unavailable"
                            ? "Result unavailable"
                            : `${detailElectionSummary.candidate} · ${detailElectionSummary.party}`}
                      </strong>
                    </div>
                    {detailElectionSummary.party !== "Unavailable" && (
                      <p>
                        {detailElectionSummary.party === "Tie"
                          ? `The major-party candidates each received ${formatNumber(detailElectionSummary.winnerVotes)} votes.`
                          : `Won by ${formatNumber(detailElectionSummary.marginVotes)} votes${detailElectionSummary.marginPct == null ? "" : ` (${detailElectionSummary.marginPct.toFixed(2)} percentage points)`}.`}
                      </p>
                    )}
                    <dl className={styles.electionMetrics}>
                      <div>
                        <dt>{detailElectionResult.demCandidate}</dt>
                        <dd>{formatNumber(detailElectionResult.demVotes)}</dd>
                        <small>{formatPercent(detailElectionResult.demSharePct)}</small>
                      </div>
                      <div>
                        <dt>{detailElectionResult.repCandidate}</dt>
                        <dd>{formatNumber(detailElectionResult.repVotes)}</dd>
                        <small>{formatPercent(detailElectionResult.repSharePct)}</small>
                      </div>
                      <div>
                        <dt>Other candidates</dt>
                        <dd>{formatNumber(detailElectionResult.otherVotes)}</dd>
                        <small>{formatNumber(detailElectionResult.totalVotes)} total votes</small>
                      </div>
                    </dl>
                    <div className={styles.electionSource}>
                      <span>
                        {detailElectionResult.sourceAuthority ?? "Result source authority not available"}
                        {` · ${detailElectionResult.confidence} confidence`}
                      </span>
                      {detailElectionResult.sourceUrl && (
                        <a href={detailElectionResult.sourceUrl} rel="noreferrer" target="_blank">
                          Open result source <ExternalLink aria-hidden size={13} />
                        </a>
                      )}
                    </div>
                    {detailElectionResult.caveat && (
                      <p className={styles.electionCaveat}>{detailElectionResult.caveat}</p>
                    )}
                  </section>
                ) : (
                  <section className={styles.electionDetail} aria-label="2024 presidential result">
                    <div className={styles.electionDetailHeader}>
                      <span>2024 presidential result</span>
                      <strong className={styles.electionWinnerNeutral}>Not joined</strong>
                    </div>
                    <p>
                      No canonical county-FIPS presidential result is available in this build for this polygon.
                      Missing results are not treated as zero.
                    </p>
                  </section>
                )}
                {detailRows.length ? (
                  <>
                    {!detailMatchesFilters && (
                      <p className={styles.filteredNote}>This county has a loaded record, but it does not match the current filters.</p>
                    )}
                    <div className={styles.detailRecords}>
                      {detailRows.map((incident) => {
                        const incidentTotals = summarizeSecurityIncidents([incident]);
                        return (
                          <article key={incident.id}>
                            <strong>{incident.eventTypeLabel} | {formatDate(incident.eventDate)}</strong>
                            <span className={styles.contextBadge}>{incidentSourceLabel(incident)}</span>
                            <span>{incident.disruptionLabel}</span>
                            <span>{affectedLocationText(incidentTotals)}</span>
                            <span>{threatCountText(incidentTotals)}</span>
                            <span>{threatCountBasisText(incident.threatCountBasis)}</span>
                            {incident.namedLocations.length > 0 && <span>Named locations: {incident.namedLocations.join("; ")}</span>}
                            <small>{incident.sourceAuthority}</small>
                            <a href={incident.sourceUrl} rel="noreferrer" target="_blank">
                              Open source <ExternalLink aria-hidden size={13} />
                            </a>
                            {incident.threatCountSourceUrl && incident.threatCountSourceUrl !== incident.sourceUrl && (
                              <a href={incident.threatCountSourceUrl} rel="noreferrer" target="_blank">
                                Open threat-count source <ExternalLink aria-hidden size={13} />
                              </a>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p>
                    No county record is loaded for this polygon. That is a data-coverage statement, not a claim
                    that no threat or disruption occurred.
                  </p>
                )}
                <a href={"/county/" + detailFeature.properties.GEOID}>
                  Open county profile <ExternalLink aria-hidden size={14} />
                </a>
              </>
            ) : (
              <>
                <span className={baseStyles.mono}>Map inspection</span>
                <h3>Select a county</h3>
                <p>Click a polygon, focus the map with Tab, or press Enter or Space to pin county details.</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className={baseStyles.tablePanel + " " + styles.contextPanel} data-print-hide="true" data-tour="security-sources">
        <header>
          <div>
            <span className={baseStyles.sectionLabel}>National source context</span>
            <h2>Where the 227 figure and mapped counties come from</h2>
            <p>
              The FBI confirms threats occurred but does not publish a national count or county roster. The 227 figure
              comes from the Brennan Center&apos;s later tracker of public reports, which says it may not be exhaustive
              and is not an official FBI list. Its 66 threats without a named county stay in totals but are not placed on
              county polygons; reviewed official state and county records add detail where available.
            </p>
          </div>
        </header>
        <div className={styles.sourceGrid}>
          {report.nationalContext.map((source) => (
            <article className={styles.sourceCard} key={source.sourceUrl}>
              <span className={styles.contextBadge}>{contextSourceLabel(source)}</span>
              <h3>{source.sourceTitle}</h3>
              <strong>{source.sourceAuthority}</strong>
              <p>{source.caveat}</p>
              <dl>
                <div><dt>Reporting grain</dt><dd>{source.reportingGrain}</dd></div>
                {source.reportedThreatCount !== undefined && (
                  <div><dt>Reported threats</dt><dd>At least {source.reportedThreatCount.toLocaleString()}</dd></div>
                )}
                <div><dt>Acquisition</dt><dd>{source.acquisitionStatus ?? "Recorded"}</dd></div>
                <div><dt>Local archive</dt><dd><code>{source.localArtifact}</code></dd></div>
              </dl>
              <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                Open source <ExternalLink aria-hidden size={14} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-label="Generated security incident report"
        className={baseStyles.tablePanel + " " + styles.reportPanel + " " + styles.printReport}
        ref={reportRef}
      >
        <header>
          <div>
            <span className={baseStyles.sectionLabel}>Exportable, source-linked report</span>
            <h2>November 2024 election-period bomb-threat report</h2>
            <p aria-live="polite">
              {generatedAt
                ? "Generated " + new Date(generatedAt).toLocaleString() + " from the current filters."
                : "Live preview. Choose Generate report to add a timestamp, then export CSV, source JSON, SVG, or PDF."}
            </p>
          </div>
        </header>
        <div className={styles.reportSummary}>
          <div>
            <span>Scope</span>
            <strong>{selectedStateName}</strong>
          </div>
          <div>
            <span>Mapped counties</span>
            <strong>{filteredTotals.countyCount.toLocaleString()}</strong>
          </div>
          <div>
            <span>County not specified</span>
            <strong>{filteredTotals.statewideUnspecifiedThreatCount.toLocaleString()} threats</strong>
          </div>
          <div>
            <span>Affected locations / precincts</span>
            <strong>{affectedLocationText(filteredTotals)}</strong>
          </div>
          <div>
            <span>Reported threats</span>
            <strong>{threatCountText(filteredTotals)}</strong>
          </div>
        </div>
        <p className={styles.reportExplanation}>{securityCountExplanation}</p>
        <div className={styles.reportBreakdown}>
          <section aria-labelledby="security-state-summary-heading" className={styles.breakdownPanel}>
            <header>
              <h3 id="security-state-summary-heading">Summary by state</h3>
              <p>Threat totals stay separate from the number of mapped counties.</p>
            </header>
            <div className={styles.summaryTableWrap}>
              <table aria-label="Security incident summary by state" className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Rows</th>
                    <th>Mapped counties</th>
                    <th>Reported threats</th>
                    <th>Threats with no county named</th>
                  </tr>
                </thead>
                <tbody>
                  {reportStateSummaries.map((summary) => (
                    <tr key={summary.state}>
                      <td><strong>{summary.stateName}</strong><br /><span>{summary.state}</span></td>
                      <td>{summary.rowCount.toLocaleString()}</td>
                      <td>{summary.countyCount.toLocaleString()}</td>
                      <td>{summary.threatCountComplete ? summary.knownThreatCount.toLocaleString() : `At least ${summary.knownThreatCount.toLocaleString()}`}</td>
                      <td>{summary.statewideUnspecifiedThreatCount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {reportStateSummaries.length === 0 && (
                    <tr><td colSpan={5}>No matching state records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-labelledby="security-date-summary-heading" className={styles.breakdownPanel}>
            <header>
              <h3 id="security-date-summary-heading">Summary by report date</h3>
              <p>Dates reflect the tracker row date, not a claim that every message arrived at the same time.</p>
            </header>
            <div className={styles.summaryTableWrap}>
              <table aria-label="Security incident summary by date" className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>States</th>
                    <th>Rows</th>
                    <th>Reported threats</th>
                    <th>Threats with no county named</th>
                  </tr>
                </thead>
                <tbody>
                  {reportDateSummaries.map((summary) => (
                    <tr key={summary.eventDate}>
                      <td><strong>{formatDate(summary.eventDate)}</strong></td>
                      <td>{summary.stateCount.toLocaleString()}</td>
                      <td>{summary.rowCount.toLocaleString()}</td>
                      <td>{summary.threatCountComplete ? summary.knownThreatCount.toLocaleString() : `At least ${summary.knownThreatCount.toLocaleString()}`}</td>
                      <td>{summary.statewideUnspecifiedThreatCount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {reportDateSummaries.length === 0 && (
                    <tr><td colSpan={5}>No matching dated records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className={baseStyles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>State</th>
                <th>County / FIPS</th>
                <th>Date and event</th>
                <th>Documented disruption</th>
                <th>Counts</th>
                <th>Record and count sources</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row) => {
                const rowTotals = summarizeSecurityIncidents([row]);
                const fips = incidentFips(row);
                const citedUrls = row.supportingSourceUrls.filter(
                  (url) => url !== row.sourceUrl && url !== row.threatCountSourceUrl,
                );
                return (
                  <tr className={fips && selectedFips === fips ? baseStyles.selectedRow : undefined} key={row.id}>
                    <td><span className={baseStyles.stateCode}>{row.state}</span></td>
                    <td>
                      {fips ? (
                        <button className={baseStyles.countyButton} onClick={() => setSelectedFips(fips)} type="button">
                          <strong>{row.county}</strong>
                          <span className={baseStyles.mono}>{fips}</span>
                        </button>
                      ) : (
                        <div className={styles.sourceCell}>
                          <strong>{row.county}</strong>
                          <span>Statewide only - not assigned to a county polygon</span>
                        </div>
                      )}
                    </td>
                    <td><strong>{formatDate(row.eventDate)}</strong><br /><span>{row.eventTypeLabel}</span></td>
                    <td>{row.disruptionLabel}</td>
                    <td>
                      <div className={styles.countBlock}>
                        <span>{affectedLocationText(rowTotals)}</span>
                        <span>{threatCountText(rowTotals)}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.sourceCell}>
                        <span className={styles.contextBadge}>{incidentSourceLabel(row)}</span>
                        <strong>{row.sourceAuthority}</strong>
                        <span>{row.sourceTitle}</span>
                        <span>{threatCountBasisText(row.threatCountBasis)}</span>
                        {row.namedLocations.length > 0 && <span>Named: {row.namedLocations.join("; ")}</span>}
                        <a href={row.sourceUrl} rel="noreferrer" target="_blank">Open source <ExternalLink aria-hidden size={12} /></a>
                        {row.threatCountSourceUrl && row.threatCountSourceUrl !== row.sourceUrl && (
                          <a href={row.threatCountSourceUrl} rel="noreferrer" target="_blank">
                            Open threat-count source <ExternalLink aria-hidden size={12} />
                          </a>
                        )}
                        {citedUrls.map((url, index) => (
                          <a href={url} key={url} rel="noreferrer" target="_blank">
                            Open cited public report {index + 1} <ExternalLink aria-hidden size={12} />
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {reportRows.length === 0 && (
                <tr>
                  <td className={baseStyles.emptyRows} colSpan={6}>No loaded records match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {reportRowsTruncated && (
          <p className={styles.reportLimitNote}>
            The printable table shows the first {reportRowLimit.toLocaleString()} of {filteredRows.length.toLocaleString()} matching rows.
            CSV and Sources JSON exports include all matching rows.
          </p>
        )}
        <div className={styles.sourceManifest}>
          <h3>Sources included in this filtered report</h3>
          <div className={styles.sourceGrid}>
            {loadedSources.map((source) => (
              <article className={styles.sourceCard} key={source.url}>
                <span className={styles.contextBadge}>{source.tier === "official" ? "Official" : "Supplemental"}</span>
                <strong>{source.authority}</strong>
                <h4>{source.title}</h4>
                <code>{source.localArtifact}</code>
                <a href={source.url} rel="noreferrer" target="_blank">
                  Open source <ExternalLink aria-hidden size={13} />
                </a>
              </article>
            ))}
            {report.nationalContext.map((source) => (
              <article className={styles.sourceCard} key={"report-" + source.sourceUrl}>
                <span className={styles.contextBadge}>{source.sourceTier === "supplemental" ? "Supplemental national context" : "Official national context"}</span>
                <strong>{source.sourceAuthority}</strong>
                <h4>{source.sourceTitle}</h4>
                <p>{source.caveat}</p>
                <code>{source.localArtifact}</code>
                <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                  Open source <ExternalLink aria-hidden size={13} />
                </a>
              </article>
            ))}
            {loadedSources.length === 0 && <p>No incident sources match the current filters.</p>}
          </div>
        </div>
        <footer className={styles.reportCaveat}>
          <strong>Coverage caveat</strong>
          <p>{report.caveat}</p>
          <p>Records shown here are administration context only and are not evidence of fraud or misconduct.</p>
        </footer>
      </section>
    </div>
  );
}
