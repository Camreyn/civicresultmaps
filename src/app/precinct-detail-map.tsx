"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupportedPresidentialYear } from "@/lib/api-version";
import type { PrecinctGeometryManifestView } from "@/lib/precinct-geography";
import {
  geographyManifestApiPath,
  joinPrecinctDeliveryResults,
  parentScopedPrecinctDeliveryApiPath,
  selectPrecinctDeliveryFeatures,
  type JoinedPrecinctDeliveryFeature,
  type PrecinctDeliveryFeature,
} from "@/lib/precinct-map-delivery";
import {
  resultOutcomeDescription,
  resultOutcomeKind,
  resultWinnerLabel,
} from "@/lib/result-row-summary";
import {
  buildOpenStreetMapViewport,
  OPENSTREETMAP_ATTRIBUTION,
  OPENSTREETMAP_ATTRIBUTION_URL,
  projectLongitudeLatitude,
  visibleOpenStreetMapTiles,
  webMercatorBounds,
  type OpenStreetMapViewport,
} from "@/lib/openstreetmap-basemap";
import type { ResultRow } from "@/lib/types";

type PrecinctDetailMapProps = {
  electionYear: SupportedPresidentialYear;
  parentGeoid: string | null;
  parentName: string | null;
  selectedState: string;
};

type RenderablePrecinctManifest = PrecinctGeometryManifestView & {
  localRehearsal?: {
    active: true;
    mode: "local_only";
    publicEligible: false;
    notice: string;
    delivery: {
      format: "geojson";
      sha256: string;
      byteCount: number;
      featureCount: number;
    };
  };
};

type ManifestLoadState =
  | { queryKey: string; status: "loading" }
  | { queryKey: string; status: "unavailable"; message: string }
  | {
      queryKey: string;
      status: "ready";
      manifest: RenderablePrecinctManifest;
    }
  | { queryKey: string; status: "error"; message: string };

type DeliveryLoadState =
  | { queryKey: string; status: "loading" }
  | { queryKey: string; status: "empty" }
  | {
      queryKey: string;
      status: "ready";
      rows: JoinedPrecinctDeliveryFeature[];
    }
  | { queryKey: string; status: "error"; message: string };

type Position = [number, number];

const precinctMapWidth = 960;
const precinctMapHeight = 520;
const precinctMapPadding = 22;
const electionDates: Record<PrecinctDetailMapProps["electionYear"], string> = {
  2012: "2012-11-06",
  2016: "2016-11-08",
  2020: "2020-11-03",
  2024: "2024-11-05",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function envelopeData(value: unknown) {
  if (!isRecord(value) || !("data" in value)) {
    throw new Error("API response does not contain a data envelope");
  }
  return value.data;
}

function apiErrorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) {
    return fallback;
  }
  if (typeof value.error === "string") {
    return value.error;
  }
  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return fallback;
}

async function fetchApiData(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Public data request failed"));
  }
  return envelopeData(payload);
}

function isRenderableManifest(
  value: unknown,
): value is RenderablePrecinctManifest {
  const publicDelivery = isRecord(value)
    && value.eligible === true
    && isRecord(value.delivery)
    && typeof value.delivery.format === "string";
  const localRehearsal = isRecord(value)
    && value.eligible === false
    && value.delivery === null
    && isRecord(value.localRehearsal)
    && value.localRehearsal.active === true
    && value.localRehearsal.mode === "local_only"
    && value.localRehearsal.publicEligible === false
    && typeof value.localRehearsal.notice === "string"
    && isRecord(value.localRehearsal.delivery)
    && value.localRehearsal.delivery.format === "geojson"
    && typeof value.localRehearsal.delivery.sha256 === "string"
    && typeof value.localRehearsal.delivery.byteCount === "number"
    && typeof value.localRehearsal.delivery.featureCount === "number";
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.state !== "string"
    || !isRecord(value.election)
    || typeof value.election.year !== "number"
    || !isRecord(value.geography)
    || typeof value.geography.boundaryVintage !== "string"
    || !isRecord(value.source)
    || typeof value.source.authority !== "string"
    || typeof value.source.url !== "string"
    || (!publicDelivery && !localRehearsal)
  ) {
    return false;
  }
  return true;
}

function isResultRow(value: unknown): value is ResultRow {
  return isRecord(value)
    && typeof value.state === "string"
    && typeof value.year === "number"
    && typeof value.office === "string"
    && value.level === "precinct"
    && typeof value.jurisdictionCode === "string"
    && typeof value.jurisdictionName === "string"
    && isRecord(value.votes)
    && Object.values(value.votes).every(
      (candidateVotes) => typeof candidateVotes === "number",
    )
    && typeof value.totalVotes === "number"
    && typeof value.marginVotes === "number"
    && typeof value.marginPct === "number"
    && typeof value.winner === "string"
    && typeof value.sourceId === "string";
}

function featureRings(feature: PrecinctDeliveryFeature): Position[][] {
  const geometry = feature.geometry;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  if (!Array.isArray(polygons)) {
    return [];
  }

  const rings: Position[][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) {
      continue;
    }
    for (const ring of polygon) {
      if (!Array.isArray(ring)) {
        continue;
      }
      const positions = ring.flatMap((candidate): Position[] => {
        if (
          !Array.isArray(candidate)
          || candidate.length < 2
          || typeof candidate[0] !== "number"
          || typeof candidate[1] !== "number"
          || !Number.isFinite(candidate[0])
          || !Number.isFinite(candidate[1])
        ) {
          return [];
        }
        return [[candidate[0], candidate[1]]];
      });
      if (positions.length >= 4) {
        rings.push(positions);
      }
    }
  }
  return rings;
}

function projectedBounds(
  rows: JoinedPrecinctDeliveryFeature[],
) {
  const positions = rows.flatMap(({ feature }) => featureRings(feature).flat());
  return webMercatorBounds(positions);
}

function precinctPath(
  feature: PrecinctDeliveryFeature,
  viewport: OpenStreetMapViewport,
) {
  return featureRings(feature)
    .map((ring) =>
      ring
        .map(([longitude, latitude], index) => {
          const { x, y } = projectLongitudeLatitude(
            [longitude, latitude],
            viewport,
          );
          return (index === 0 ? "M" : "L")
            + x.toFixed(1)
            + " "
            + y.toFixed(1);
        })
        .join(" ")
        + " Z",
    )
    .join(" ");
}

function precinctFill(result: ResultRow | null) {
  const outcome = resultOutcomeKind(result);
  if (outcome === "democratic") {
    return "#4e83c4";
  }
  if (outcome === "republican") {
    return "#b75b5b";
  }
  if (outcome === "no_votes") {
    return "#747b77";
  }
  if (outcome === "missing") {
    return "#4a504d";
  }
  return "#c39b4a";
}

function statusPanel(title: string, message: string) {
  return (
    <div className="precinct-detail-status" role="status">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function PrecinctDetailMap({
  electionYear,
  parentGeoid,
  parentName,
  selectedState,
}: PrecinctDetailMapProps) {
  const electionDate = electionDates[electionYear];
  const manifestQueryKey = selectedState + "|" + electionDate;
  const [manifestLoad, setManifestLoad] = useState<ManifestLoadState>({
    queryKey: "",
    status: "loading",
  });
  const [deliveryLoad, setDeliveryLoad] = useState<DeliveryLoadState>({
    queryKey: "",
    status: "loading",
  });
  const [selectedResultUnitCode, setSelectedResultUnitCode] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setManifestLoad({ queryKey: manifestQueryKey, status: "loading" });

    void (async () => {
      try {
        const data = await fetchApiData(
          geographyManifestApiPath({
            state: selectedState,
            electionDate,
          }),
          controller.signal,
        );
        if (!Array.isArray(data)) {
          throw new Error("Precinct manifest response is not an array");
        }
        if (data.length === 0) {
          setManifestLoad({
            queryKey: manifestQueryKey,
            status: "unavailable",
            message:
              "No reviewed, reconciled, election-date-confirmed precinct "
              + "layer is published for this state and election.",
          });
          return;
        }
        const candidates = data.filter(isRenderableManifest);
        if (candidates.length !== data.length || candidates.length !== 1) {
          throw new Error(
            "Precinct manifest response is invalid or ambiguous",
          );
        }
        const manifest = candidates[0];
        if (
          manifest.state !== selectedState
          || manifest.election.year !== electionYear
        ) {
          throw new Error("Precinct manifest does not match the selected event");
        }
        const deliveryFormat = manifest.delivery?.format
          ?? manifest.localRehearsal?.delivery.format;
        if (
          deliveryFormat !== "geojson"
          && deliveryFormat !== "parent_scoped_geojson"
        ) {
          setManifestLoad({
            queryKey: manifestQueryKey,
            status: "unavailable",
            message:
              "The reviewed precinct layer uses a delivery format that this "
              + "detail map does not yet support.",
          });
          return;
        }
        setManifestLoad({
          queryKey: manifestQueryKey,
          status: "ready",
          manifest,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setManifestLoad({
          queryKey: manifestQueryKey,
          status: "error",
          message: error instanceof Error
            ? error.message
            : "Precinct manifest request failed",
        });
      }
    })();

    return () => controller.abort();
  }, [electionDate, electionYear, manifestQueryKey, selectedState]);

  const currentManifestLoad = manifestLoad.queryKey === manifestQueryKey
    ? manifestLoad
    : { queryKey: manifestQueryKey, status: "loading" as const };
  const manifest = currentManifestLoad.status === "ready"
    ? currentManifestLoad.manifest
    : null;
  const localRehearsal = manifest?.localRehearsal ?? null;
  const manifestId = manifest?.id ?? null;
  const manifestOffice = manifest?.election.office ?? null;
  const deliveryQueryKey = manifestId && parentGeoid
    ? manifestId + "|" + parentGeoid
    : "";

  useEffect(() => {
    if (!manifestId || !manifestOffice || !parentGeoid) {
      return;
    }
    const controller = new AbortController();
    setDeliveryLoad({ queryKey: deliveryQueryKey, status: "loading" });

    void (async () => {
      try {
        const [geometryData, resultData] = await Promise.all([
          fetchApiData(
            parentScopedPrecinctDeliveryApiPath({
              manifestId,
              parentGeoid,
            }),
            controller.signal,
          ),
          fetchApiData(
            "/api/results?"
              + new URLSearchParams({
                state: selectedState,
                year: String(electionYear),
                level: "precinct",
                office: manifestOffice,
                parentGeoid,
              }).toString(),
            controller.signal,
          ),
        ]);
        const collection = selectPrecinctDeliveryFeatures(
          geometryData,
          parentGeoid,
        );
        if (
          !Array.isArray(resultData)
          || resultData.some((row) => !isResultRow(row))
        ) {
          throw new Error("Precinct result response is invalid");
        }
        const results = resultData.filter(
          (row): row is ResultRow =>
            isResultRow(row)
            && row.state === selectedState
            && row.year === electionYear
            && row.office.toLowerCase() === manifestOffice.toLowerCase(),
        );
        const rows = joinPrecinctDeliveryResults(
          collection.features,
          results,
        );
        if (rows.length === 0) {
          setDeliveryLoad({
            queryKey: deliveryQueryKey,
            status: "empty",
          });
        } else {
          setDeliveryLoad({
            queryKey: deliveryQueryKey,
            status: "ready",
            rows,
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setDeliveryLoad({
          queryKey: deliveryQueryKey,
          status: "error",
          message: error instanceof Error
            ? error.message
            : "Precinct detail request failed",
        });
      }
    })();

    return () => controller.abort();
  }, [
    deliveryQueryKey,
    electionYear,
    manifestId,
    parentGeoid,
    manifestOffice,
    selectedState,
  ]);

  const currentDeliveryLoad = deliveryQueryKey
    && deliveryLoad.queryKey === deliveryQueryKey
    ? deliveryLoad
    : null;
  const rows = currentDeliveryLoad?.status === "ready"
    ? currentDeliveryLoad.rows
    : [];
  const bounds = useMemo(() => projectedBounds(rows), [rows]);
  const viewport = useMemo(
    () => bounds
      ? buildOpenStreetMapViewport({
          bounds,
          height: precinctMapHeight,
          padding: precinctMapPadding,
          width: precinctMapWidth,
        })
      : null,
    [bounds],
  );
  const openStreetMapTiles = useMemo(
    () => viewport ? visibleOpenStreetMapTiles(viewport) : [],
    [viewport],
  );
  const mappedResultCount = useMemo(
    () => rows.reduce((count, row) => count + (row.result ? 1 : 0), 0),
    [rows],
  );
  const effectiveResultUnitCode = rows.some(
    ({ feature }) =>
      feature.properties.resultUnitCode === selectedResultUnitCode,
  )
    ? selectedResultUnitCode
    : rows[0]?.feature.properties.resultUnitCode ?? "";
  const selectedRow = rows.find(
    ({ feature }) =>
      feature.properties.resultUnitCode === effectiveResultUnitCode,
  ) ?? null;
  const topCandidateRows = selectedRow?.result
    ? Object.entries(selectedRow.result.votes)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 2)
    : [];

  let body;
  if (currentManifestLoad.status === "loading") {
    body = statusPanel(
      "Checking precinct coverage",
      "Looking for a reviewed layer for the selected election.",
    );
  } else if (currentManifestLoad.status === "unavailable") {
    body = statusPanel(
      "County map remains active",
      currentManifestLoad.message,
    );
  } else if (currentManifestLoad.status === "error") {
    body = statusPanel(
      "Precinct coverage check failed",
      currentManifestLoad.message,
    );
  } else if (!parentGeoid) {
    body = statusPanel(
      "Select a county first",
      "Precinct geometry is requested only after a county is pinned, which "
        + "keeps the map and transfer size bounded.",
    );
  } else if (!currentDeliveryLoad || currentDeliveryLoad.status === "loading") {
    body = statusPanel(
      "Loading county precincts",
      "Verifying the immutable geometry artifact and joining explicit "
        + "reporting-unit IDs.",
    );
  } else if (currentDeliveryLoad.status === "empty") {
    body = statusPanel(
      "No displayable precincts",
      "The reviewed layer contains no eligible precinct features for this "
        + "county. County results remain available above.",
    );
  } else if (currentDeliveryLoad.status === "error") {
    body = statusPanel(
      "Precinct detail unavailable",
      currentDeliveryLoad.message,
    );
  } else if (!viewport) {
    body = statusPanel(
      "Precinct coordinates unavailable",
      "The county delivery passed its envelope checks but did not contain "
        + "renderable polygon coordinates.",
    );
  } else {
    body = (
      <div className="precinct-detail-body">
        <div className="precinct-detail-layout">
          <div className="precinct-detail-map-wrap">
            <div className="precinct-detail-map-stage">
              <svg
                aria-hidden="true"
                className="precinct-detail-map"
                focusable="false"
                viewBox={"0 0 " + precinctMapWidth + " " + precinctMapHeight}
              >
                <g className="precinct-detail-basemap">
                  {openStreetMapTiles.map((tile) => (
                    <image
                      className="precinct-detail-basemap-tile"
                      data-openstreetmap-tile={`${tile.zoom}/${tile.tileX}/${tile.tileY}`}
                      height={tile.size}
                      href={tile.href}
                      key={`${tile.zoom}/${tile.tileX}/${tile.tileY}`}
                      preserveAspectRatio="none"
                      width={tile.size}
                      x={tile.screenX}
                      y={tile.screenY}
                    />
                  ))}
                </g>
                <rect
                  className="precinct-detail-basemap-shade"
                  height={precinctMapHeight}
                  width={precinctMapWidth}
                  x="0"
                  y="0"
                />
                {rows.map(({ feature, result }) => {
                  const resultUnitCode = feature.properties.resultUnitCode;
                  const selected = resultUnitCode === effectiveResultUnitCode;
                  return (
                    <path
                      className={
                        selected
                          ? "precinct-detail-shape is-selected"
                          : "precinct-detail-shape"
                      }
                      d={precinctPath(feature, viewport)}
                      fill={precinctFill(result)}
                      key={feature.properties.geometryFeatureId}
                      onClick={() => setSelectedResultUnitCode(resultUnitCode)}
                    >
                      <title>
                        {feature.properties.displayName}:{" "}
                        {resultOutcomeDescription(result)}
                      </title>
                    </path>
                  );
                })}
              </svg>
              <a
                className="precinct-detail-basemap-attribution"
                href={OPENSTREETMAP_ATTRIBUTION_URL}
                rel="noreferrer"
                target="_blank"
              >
                {OPENSTREETMAP_ATTRIBUTION}
              </a>
            </div>
            <div className="precinct-detail-legend" aria-label="Precinct map legend">
              <span><i className="dem" aria-hidden /> Democratic winner</span>
              <span><i className="rep" aria-hidden /> Republican winner</span>
              <span><i className="other" aria-hidden /> Other winner</span>
              <span><i className="missing" aria-hidden /> No joined result</span>
              <span><i className="no-votes" aria-hidden /> No votes reported</span>
            </div>
          </div>
          <div className="precinct-detail-controls">
            <label htmlFor="precinct-detail-selection">
              Precinct to inspect
              <select
                id="precinct-detail-selection"
                onChange={(event) =>
                  setSelectedResultUnitCode(event.target.value)}
                value={effectiveResultUnitCode}
              >
                {rows.map(({ feature, result }) => (
                  <option
                    key={feature.properties.geometryFeatureId}
                    value={feature.properties.resultUnitCode}
                  >
                    {feature.properties.displayName}
                    {result
                      ? result.totalVotes > 0
                        ? ""
                        : " - no votes reported"
                      : " - result unavailable"}
                  </option>
                ))}
              </select>
            </label>
            {selectedRow ? (
              <>
                <strong>{selectedRow.feature.properties.displayName}</strong>
                {selectedRow.result ? (
                  <dl className="precinct-detail-stats">
                    <div>
                      <dt>Winner</dt>
                      <dd>{resultWinnerLabel(selectedRow.result)}</dd>
                    </div>
                    <div>
                      <dt>Margin</dt>
                      <dd>
                        {selectedRow.result.totalVotes > 0
                          ? selectedRow.result.marginPct.toFixed(2) + "%"
                          : "Not applicable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Total votes</dt>
                      <dd>{selectedRow.result.totalVotes.toLocaleString()}</dd>
                    </div>
                    {topCandidateRows.map(([candidate, votes]) => (
                      <div key={candidate}>
                        <dt>{candidate}</dt>
                        <dd>{votes.toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>
                    This reviewed boundary has no result row joined by its
                    explicit reporting-unit code, so it is not colored as a
                    candidate result.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="precinct-detail-meta">
          <span>
            {rows.length.toLocaleString()} boundaries;{" "}
            {mappedResultCount.toLocaleString()} joined result rows
          </span>
          <span>
            Boundary vintage:{" "}
            {currentManifestLoad.manifest.geography.boundaryVintage}
          </span>
          <a
            href={currentManifestLoad.manifest.source.url}
            rel="noreferrer"
            target="_blank"
          >
            {currentManifestLoad.manifest.source.authority} source
          </a>
          <details className="precinct-detail-source-terms">
            <summary>Boundary source terms</summary>
            <p>{currentManifestLoad.manifest.source.licenseOrTerms}</p>
          </details>
          {localRehearsal ? (
            <span>{localRehearsal.notice}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={selectedState + " precinct detail map"}
      className="panel precinct-detail-panel"
      data-tour="precinct-detail-map"
    >
      <div className="panel-header">
        <div>
          <h2>Precinct Detail</h2>
          <span>
            {parentName
              ? parentName + ", " + electionYear
              : selectedState + ", " + electionYear}
          </span>
        </div>
        <span className="status-pill">
          {localRehearsal
            ? "Local rehearsal - not public"
            : "Reviewed geometry only"}
        </span>
      </div>
      {body}
    </section>
  );
}
