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
import type { NationalSecurityIncidentReport, SecurityIncidentSummary } from "@/lib/types";
import baseStyles from "../compare/compare.module.css";
import styles from "./security.module.css";

const expectedCountyFeatureCount = 3144;
const reportRowLimit = 500;

type SecurityExplorerProps = {
  report: NationalSecurityIncidentReport;
};

type SourceManifestEntry = {
  authority: string;
  localArtifact: string;
  tier: SecurityIncidentSummary["sourceTier"];
  title: string;
  url: string;
};

function incidentFips(row: SecurityIncidentSummary) {
  return row.jurisdictionTag.startsWith("county:")
    ? row.jurisdictionTag.slice("county:".length)
    : row.jurisdictionCode;
}

function incidentFill(rows: SecurityIncidentSummary[]) {
  if (rows.some((row) => row.sourceTier === "official")) return "#f97316";
  return rows.length ? "#fbbf24" : "url(#security-unknown)";
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

export function SecurityExplorer({ report }: SecurityExplorerProps) {
  const [features, setFeatures] = useState<NationalCountyFeature[]>([]);
  const [geometryStatus, setGeometryStatus] = useState<"error" | "loading" | "ready">("loading");
  const [geometryError, setGeometryError] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [disruptionFilter, setDisruptionFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedFips, setSelectedFips] = useState<string | null>(null);
  const [focusedFips, setFocusedFips] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
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
          row.jurisdictionCode,
          row.eventTypeLabel,
          row.disruptionLabel,
          row.sourceAuthority,
          row.sourceTitle,
          row.sourceTier,
          ...row.namedLocations,
        ].join(" ").toLowerCase();
        return searchText.includes(deferredQuery);
      }),
    [deferredQuery, disruptionFilter, report.incidents, stateFilter],
  );
  const filteredTotals = useMemo(() => summarizeSecurityIncidents(filteredRows), [filteredRows]);
  const allRowsByFips = useMemo(() => {
    const grouped = new Map<string, SecurityIncidentSummary[]>();
    for (const row of report.incidents) {
      const fips = incidentFips(row);
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
      const countyRows = grouped.get(fips);
      if (countyRows) countyRows.push(row);
      else grouped.set(fips, [row]);
    }
    return grouped;
  }, [filteredRows]);
  const mapFeatures = useMemo(() => buildNationalCountyMapFeatures(features), [features]);
  const featureByFips = useMemo(
    () => new Map(features.map((feature) => [feature.properties.GEOID, feature])),
    [features],
  );
  const detailFips = selectedFips ?? focusedFips;
  const detailFeature = detailFips ? featureByFips.get(detailFips) : undefined;
  const detailRows = detailFips ? allRowsByFips.get(detailFips) ?? [] : [];
  const detailMatchesFilters = detailFips ? filteredRowsByFips.has(detailFips) : false;
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
  const compilationContext = report.nationalContext.find(
    (source) => source.sourceTier === "supplemental" && source.reportedLocationCount !== undefined,
  );
  const threatMetric = !filteredTotals.rowCount
    ? "No matching rows"
    : filteredTotals.threatCountComplete
      ? (filteredTotals.documentedThreatCount ?? 0).toLocaleString()
      : filteredTotals.knownThreatCount > 0
        ? `At least ${filteredTotals.knownThreatCount.toLocaleString()}`
        : "Not published";
  const reportRows = filteredRows.slice(0, reportRowLimit);
  const reportRowsTruncated = reportRows.length < filteredRows.length;

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
    window.requestAnimationFrame(() => reportRef.current?.scrollIntoView({ block: "start" }));
  }

  function exportCsv() {
    const csv = rowsToCsv(
      [
        "State",
        "County",
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
        row.county,
        incidentFips(row),
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
          },
          generatedAt: generated,
          incidents: filteredRows,
          nationalContext: report.nationalContext,
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
      "security-incidents-2024-national-map.svg",
      '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone),
      "image/svg+xml;charset=utf-8",
    );
  }

  return (
    <div className={baseStyles.explorer}>
      <section className={baseStyles.controls + " " + styles.securityControls} aria-label="Security incident report filters" data-print-hide="true">
        <label>
          <span>State</span>
          <select onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}>
            <option value="">All states and DC</option>
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
          <span>County, FIPS, or source</span>
          <span className={baseStyles.searchInput}>
            <Search aria-hidden size={16} />
            <input
              aria-label="Search county, FIPS, or source"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Fulton, 13121, or police"
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
        </div>
      </section>

      <section className={baseStyles.metrics + " " + styles.securityMetrics} aria-label="Filtered security incident summary" data-print-hide="true">
        <article>
          <span>Mapped states</span>
          <strong>{filteredTotals.stateCount.toLocaleString()}</strong>
          <small>with matching county records</small>
        </article>
        <article>
          <span>Mapped counties</span>
          <strong>{filteredTotals.countyCount.toLocaleString()}</strong>
          <small>{filteredTotals.rowCount.toLocaleString()} source-linked row{filteredTotals.rowCount === 1 ? "" : "s"}</small>
        </article>
        <article className={baseStyles.metricWarn + " " + styles.textMetric}>
          <span>Published national compilation</span>
          <strong>{compilationContext?.reportedLocationCount?.toLocaleString() ?? "Not stated"} locations</strong>
          <small>in {compilationContext?.reportedCountyCount?.toLocaleString() ?? "an unstated number of"} counties; independent of filters</small>
        </article>
        <article className={styles.textMetric}>
          <span>County-attributed reports</span>
          <strong>{threatMetric}</strong>
          <small>{filteredTotals.unknownThreatCountRows ? `exact count not published for ${filteredTotals.unknownThreatCountRows} mapped county row${filteredTotals.unknownThreatCountRows === 1 ? "" : "s"}` : "all matching rows publish a count"}</small>
        </article>
        <article>
          <span>Source strength</span>
          <strong>{filteredTotals.officialRowCount} official / {filteredTotals.supplementalRowCount} supplemental</strong>
          <small>supplemental rows fill published county gaps</small>
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

      {geometryStatus === "error" && (
        <div className={baseStyles.error} data-print-hide="true" role="alert">
          <AlertTriangle aria-hidden size={18} />
          <span>{geometryError}</span>
        </div>
      )}

      <section className={baseStyles.mapPanel} data-print-hide="true">
        <header>
          <div>
            <span className={baseStyles.sectionLabel}>Nationwide county view</span>
            <h2>Mapped November 5, 2024 bomb-threat counties</h2>
          </div>
          <div className={baseStyles.legend} aria-label="Map legend">
            <span><i className={styles.legendMedium} />Official county record</span>
            <span><i className={styles.legendLow} />Supplemental compiled record</span>
            <span><i className={styles.legendFiltered} />Loaded, filtered out</span>
            <span><i className={styles.legendUnknown} />No loaded matching record</span>
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
                <title id="security-map-title">2024 source-linked county bomb-threat incident records</title>
                <desc id="security-map-description">
                  All 3,144 counties and county equivalents remain visible. Hatched counties have no loaded record matching
                  the current filters; this does not mean no incident occurred. Use Tab to enter the map, arrow keys to
                  move through FIPS order, and Enter or Space to pin a county.
                </desc>
                <defs>
                  <pattern height="8" id="security-unknown" patternUnits="userSpaceOnUse" width="8">
                    <rect fill="#252a28" height="8" width="8" />
                    <path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#363c39" strokeWidth="1" />
                  </pattern>
                </defs>
                <g>
                  {mapFeatures.map(({ feature, fips, path }) => {
                    const matchingRows = filteredRowsByFips.get(fips) ?? [];
                    const loadedRows = allRowsByFips.get(fips) ?? [];
                    const isSelected = selectedFips === fips;
                    const outsideSelectedState = Boolean(stateFilter && feature.properties.STATE !== stateFilter);
                    const summary = matchingRows.length
                      ? securityIncidentSummaryText(matchingRows)
                      : loadedRows.length
                        ? "Loaded county record excluded by the current filters"
                        : "No loaded county record; this does not mean no incident occurred";
                    return (
                      <path
                        aria-label={
                          feature.properties.NAME + ", " + feature.properties.STATE + ", FIPS " + fips + ": " + summary
                        }
                        aria-pressed={isSelected}
                        className={isSelected ? baseStyles.selectedShape : baseStyles.mapShape}
                        d={path}
                        fill={matchingRows.length ? incidentFill(matchingRows) : loadedRows.length ? "#5c4a38" : "url(#security-unknown)"}
                        fillRule="evenodd"
                        key={fips}
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
                        opacity={outsideSelectedState ? 0.18 : matchingRows.length ? 1 : loadedRows.length ? 0.55 : 0.9}
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
                            <span className={styles.contextBadge}>{incident.sourceTier === "official" ? "Official county record" : "Supplemental compilation"}</span>
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

      <section className={baseStyles.tablePanel + " " + styles.contextPanel} data-print-hide="true">
        <header>
          <div>
            <span className={baseStyles.sectionLabel}>National source context</span>
            <h2>How the nationwide county list was assembled</h2>
            <p>
              Federal sources confirm the broader event but do not publish a complete county roster. The supplemental
              compilation supplies the published county list, while official county records replace or add detail where available.
            </p>
          </div>
        </header>
        <div className={styles.sourceGrid}>
          {report.nationalContext.map((source) => (
            <article className={styles.sourceCard} key={source.sourceUrl}>
              <span className={styles.contextBadge}>{source.sourceTier === "supplemental" ? "Supplemental compilation" : "Official context"}</span>
              <h3>{source.sourceTitle}</h3>
              <strong>{source.sourceAuthority}</strong>
              <p>{source.caveat}</p>
              <dl>
                <div><dt>Reporting grain</dt><dd>{source.reportingGrain}</dd></div>
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
            <h2>2024 county security incident report</h2>
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
            <strong>{stateFilter || "United States"}</strong>
          </div>
          <div>
            <span>Mapped counties</span>
            <strong>{filteredTotals.countyCount.toLocaleString()}</strong>
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
                return (
                  <tr className={selectedFips === incidentFips(row) ? baseStyles.selectedRow : undefined} key={row.id}>
                    <td><span className={baseStyles.stateCode}>{row.state}</span></td>
                    <td>
                      <button className={baseStyles.countyButton} onClick={() => setSelectedFips(incidentFips(row))} type="button">
                        <strong>{row.county}</strong>
                        <span className={baseStyles.mono}>{incidentFips(row)}</span>
                      </button>
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
                        <span className={styles.contextBadge}>{row.sourceTier === "official" ? "Official county record" : "Supplemental compiled record"}</span>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
              {reportRows.length === 0 && (
                <tr>
                  <td className={baseStyles.emptyRows} colSpan={6}>No loaded county records match these filters.</td>
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
            {loadedSources.length === 0 && <p>No county sources match the current filters.</p>}
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
