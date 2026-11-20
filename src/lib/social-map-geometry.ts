import type { GeoFeature } from "./workspace-map-paint";

export const mapViewBox = { width: 700, height: 420 };

type MapBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  referenceLatitude: number;
};

export function flattenPositions(coordinates: unknown): number[][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates as number[]];
  }

  return coordinates.flatMap((item) => flattenPositions(item));
}

export function polygonRings(feature: GeoFeature): number[][][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates as number[][][];
  }

  return (feature.geometry.coordinates as number[][][][]).flat();
}

export function mapCoordinate(state: string, [lon, lat]: number[]) {
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

export function coordinateBounds(points: number[][]): MapBounds {
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

export function makePath(state: string, rings: number[][][], bounds: MapBounds) {
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
