import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { listIndicators, listResults } from "@/lib/api";
import {
  buildStateSocialPreview,
  socialPreviewCaveat,
  socialPreviewYear,
} from "@/lib/social-preview";

export const dynamic = "force-dynamic";

const size = {
  width: 1200,
  height: 630,
};

const mapViewBox = { width: 700, height: 420 };
const rawGeoBaseUrl = "https://raw.githubusercontent.com/Camreyn/civicresultmaps/main/data";

type GeoFeature = {
  geometry: {
    coordinates: unknown;
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    BASENAME?: string;
    GEOID?: string;
    NAME?: string;
    county_name?: string;
    jurisdictionName?: string;
    [key: string]: unknown;
  };
};

type FeatureCollection = {
  features: GeoFeature[];
  type: "FeatureCollection";
};

type MapBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  referenceLatitude: number;
};

type MapFeaturePath = {
  flagged: boolean;
  key: string;
  path: string;
  winner: string;
};

function parseYear(value: string | null) {
  const year = Number(value ?? socialPreviewYear);
  return Number.isInteger(year) && year >= 1788 && year <= 2100 ? year : socialPreviewYear;
}

function metricValue(metrics: Awaited<ReturnType<typeof buildStateSocialPreview>>["metrics"], label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? "0";
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSaint\b/gi, "St")
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

function flattenPositions(coordinates: unknown): number[][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates as number[]];
  }

  return coordinates.flatMap((item) => flattenPositions(item));
}

function polygonRings(feature: GeoFeature): number[][][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates as number[][][];
  }

  return (feature.geometry.coordinates as number[][][][]).flat();
}

function mapCoordinate(state: string, [lon, lat]: number[]) {
  if (state === "AK" && lon > 0) {
    return [lon - 360, lat];
  }

  return [lon, lat];
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function longitudeScale(referenceLatitude: number) {
  const scale = Math.cos((referenceLatitude * Math.PI) / 180);
  return Number.isFinite(scale) && scale > 0.1 ? scale : 1;
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

function mapFit(bounds: MapBounds) {
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  const scale = Math.min((mapViewBox.width - 40) / width, (mapViewBox.height - 34) / height);
  return {
    offsetX: (mapViewBox.width - width * scale) / 2,
    offsetY: (mapViewBox.height - height * scale) / 2,
    scale,
  };
}

function projectedLongitude(lon: number, bounds: MapBounds) {
  return lon * longitudeScale(bounds.referenceLatitude);
}

function simplifyRing(ring: number[][], maxPoints = 130) {
  if (ring.length <= maxPoints) {
    return ring;
  }

  const stride = Math.ceil(ring.length / maxPoints);
  const sampled = ring.filter((_, index) => index % stride === 0);
  const last = ring[ring.length - 1];
  if (last && sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

function makePath(state: string, rings: number[][][], bounds: MapBounds) {
  const { offsetX, offsetY, scale } = mapFit(bounds);

  return rings
    .map((ring) =>
      simplifyRing(ring)
        .map((coordinate, index) => {
          const [lon, lat] = mapCoordinate(state, coordinate);
          const projectedX = projectedLongitude(lon, bounds);
          const x = offsetX + (projectedX - bounds.minX) * scale;
          const y = offsetY + (bounds.maxY - lat) * scale;
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
        .concat(" Z"),
    )
    .join(" ");
}

function countyFill(winner: string, flagged: boolean) {
  if (flagged) {
    return "#f0c36a";
  }

  if (/harris|dem/i.test(winner)) {
    return "#82b8ff";
  }

  if (/trump|rep/i.test(winner)) {
    return "#ff8f7e";
  }

  return "#2c302e";
}

async function loadMapPaths(state: string, year: number): Promise<MapFeaturePath[]> {
  if (!state || state === "US") {
    return [];
  }

  let collection: FeatureCollection;
  try {
    const geoJsonPath = path.join(process.cwd(), "data", `${state.toLowerCase()}-counties.geojson`);
    collection = JSON.parse(await readFile(geoJsonPath, "utf8")) as FeatureCollection;
  } catch {
    try {
      const response = await fetch(`${rawGeoBaseUrl}/${state.toLowerCase()}-counties.geojson`, {
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!response.ok) {
        return [];
      }
      collection = (await response.json()) as FeatureCollection;
    } catch {
      return [];
    }
  }

  const [countyResults, cityResults, cityTownResults, townResults, stateResults, indicators] = await Promise.all([
    listResults({ state, year, level: "county" }),
    listResults({ state, year, level: "city" }),
    listResults({ state, year, level: "city_town" }),
    listResults({ state, year, level: "town" }),
    listResults({ state, year, level: "state" }),
    listIndicators({ state, year }),
  ]);
  const results = countyResults.length ? countyResults : cityResults.length ? cityResults : cityTownResults.length ? cityTownResults : townResults.length ? townResults : stateResults;
  const resultsByName = new Map(results.map((row) => [normalizeName(row.jurisdictionName), row]));
  const indicatorNames = new Set(indicators.map((indicator) => normalizeName(indicator.jurisdictionName)));
  const indicatorCodes = new Set(indicators.map((indicator) => indicator.jurisdictionCode));
  const points = collection.features.flatMap((feature) => flattenPositions(feature.geometry.coordinates).map((coordinate) => mapCoordinate(state, coordinate)));
  const bounds = coordinateBounds(points);

  return collection.features.map((feature, index) => {
    const name = resultNameForFeature(state, featureName(feature));
    const normalized = normalizeName(name);
    const row = resultsByName.get(normalized);
    const geoId = typeof feature.properties.GEOID === "string" ? feature.properties.GEOID : "";
    const flagged = indicatorNames.has(normalized) || (geoId ? indicatorCodes.has(geoId) : false) || Boolean(row && indicatorCodes.has(row.jurisdictionCode));

    return {
      flagged,
      key: `${state}-${geoId || normalized || index}`,
      path: makePath(state, polygonRings(feature), bounds),
      winner: row?.winner ?? "",
    };
  });
}

function BrandIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 512 512">
      <path d="M 261 253 L 397 331 Q 402 334 397 337 L 261 415 Q 256 418 251 415 L 115 337 Q 110 334 115 331 L 251 253 Q 256 250 261 253 Z" fill="#35c7a3" opacity="0.92" />
      <path d="M 261 173 L 397 251 Q 402 254 397 257 L 261 335 Q 256 338 251 335 L 115 257 Q 110 254 115 251 L 251 173 Q 256 170 261 173 Z" fill="#ff8f7e" opacity="0.96" />
      <path d="M 261 93 L 397 171 Q 402 174 397 177 L 261 255 Q 256 258 251 255 L 115 177 Q 110 174 115 171 L 251 93 Q 256 90 261 93 Z" fill="#f4f1ea" />
      <path d="M 179 174 C 217 119 295 119 333 174 C 295 229 217 229 179 174 Z" fill="#061111" />
      <circle cx="256" cy="174" r="25" fill="#35c7a3" />
      <circle cx="256" cy="174" r="13" fill="#061111" />
      <circle cx="270" cy="160" r="7" fill="#f4f1ea" />
    </svg>
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const preview = await buildStateSocialPreview({
    state: params.get("state") ?? undefined,
    year: parseYear(params.get("year")),
  });
  const paths = await loadMapPaths(preview.stateCode, preview.year);
  const hasMap = paths.length > 0;
  const flaggedCount = paths.filter((item) => item.flagged).length;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#101112",
          color: "#f4f1ea",
          fontFamily: "Geist, Inter, Segoe UI, Arial, sans-serif",
          padding: "42px 48px",
        }}
      >
        <div style={{ width: 350, display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  background: "#171918",
                  color: "#f4f1ea",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <BrandIcon />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", fontSize: 23, fontWeight: 900 }}>Civic Result Maps</div>
                <div style={{ display: "flex", fontSize: 16, color: "#a9aaa4" }}>Public election data explorer</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", color: "#35c7a3", fontSize: 24, fontWeight: 900 }}>{preview.year} President</div>
              <div style={{ display: "flex", fontSize: 50, fontWeight: 900, lineHeight: 1 }}>{preview.stateName}</div>
              <div style={{ display: "flex", fontSize: 20, color: "#a9aaa4", lineHeight: 1.25 }}>
                County map with advisory-flag overlay from currently loaded public data.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <Metric label="Result rows" value={metricValue(preview.metrics, "Result rows")} />
                <Metric label="Sources" value={metricValue(preview.metrics, "Sources")} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Metric label="Advisory flags" value={metricValue(preview.metrics, "Advisory flags")} />
                <Metric label="Flagged areas" value={flaggedCount ? flaggedCount.toLocaleString("en-US") : metricValue(preview.metrics, "Flagged areas")} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 17, color: "#a9aaa4", lineHeight: 1.25 }}>{socialPreviewCaveat}</div>
        </div>

        <div
          style={{
            flex: 1,
            border: "1px solid #2c302e",
            borderRadius: 8,
            background: "#171918",
            display: "flex",
            flexDirection: "column",
            padding: 22,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 900 }}>County Result Map</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 16, color: "#a9aaa4" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 18, height: 12, background: "#82b8ff" }} />Harris</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 18, height: 12, background: "#ff8f7e" }} />Trump</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 18, height: 12, background: "#f0c36a", border: "2px solid #35c7a3" }} />Advisory flag</span>
            </div>
          </div>

          {hasMap ? (
            <svg width="700" height="420" viewBox={`0 0 ${mapViewBox.width} ${mapViewBox.height}`}>
              <rect x="0" y="0" width={mapViewBox.width} height={mapViewBox.height} rx="8" fill="#111312" />
              {paths.map((feature) => (
                <path
                  key={feature.key}
                  d={feature.path}
                  fill={countyFill(feature.winner, feature.flagged)}
                  stroke={feature.flagged ? "#35c7a3" : "#101112"}
                  strokeWidth={feature.flagged ? 2.4 : 0.85}
                />
              ))}
            </svg>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#a9aaa4", fontSize: 26 }}>
              Map geometry is not available for this preview.
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );

  response.headers.set("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
  response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");

  return response;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        width: 145,
        height: 72,
        border: "1px solid #2c302e",
        borderRadius: 8,
        background: "#171918",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 14px",
      }}
    >
      <div style={{ display: "flex", fontSize: 15, color: "#a9aaa4" }}>{label}</div>
      <div style={{ display: "flex", fontSize: 26, fontWeight: 900 }}>{value}</div>
    </div>
  );
}