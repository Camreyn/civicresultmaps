export type LongitudeLatitude = readonly [longitude: number, latitude: number];

export type WebMercatorPoint = {
  x: number;
  y: number;
};

export type WebMercatorBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

export type OpenStreetMapViewport = {
  bounds: WebMercatorBounds;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
  zoom: number;
};

export type OpenStreetMapTile = {
  href: string;
  screenX: number;
  screenY: number;
  size: number;
  tileX: number;
  tileY: number;
  zoom: number;
};

export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";
export const OPENSTREETMAP_ATTRIBUTION_URL =
  "https://www.openstreetmap.org/copyright";
export const OPENSTREETMAP_STANDARD_TILE_ORIGIN =
  "https://tile.openstreetmap.org";

const maximumMercatorLatitude = 85.0511287798066;
const openStreetMapTileSize = 256;
const maximumOpenStreetMapZoom = 19;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function longitudeLatitudeToWebMercator(
  position: LongitudeLatitude,
): WebMercatorPoint {
  const longitude = clamp(position[0], -180, 180);
  const latitude = clamp(
    position[1],
    -maximumMercatorLatitude,
    maximumMercatorLatitude,
  );
  const latitudeRadians = (latitude * Math.PI) / 180;
  const x = (longitude + 180) / 360;
  const y = (
    1
    - Math.log(
      Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians),
    ) / Math.PI
  ) / 2;
  return { x, y: clamp(y, 0, 1) };
}

export function webMercatorBounds(
  positions: readonly LongitudeLatitude[],
): WebMercatorBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of positions) {
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
      continue;
    }
    const point = longitudeLatitudeToWebMercator(position);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    return null;
  }
  return { maxX, maxY, minX, minY };
}

export function buildOpenStreetMapViewport(input: {
  bounds: WebMercatorBounds;
  height: number;
  padding: number;
  width: number;
}): OpenStreetMapViewport {
  const { bounds, height, padding, width } = input;
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(padding)
    || width <= 0
    || height <= 0
    || padding < 0
    || padding * 2 >= width
    || padding * 2 >= height
  ) {
    throw new Error("OpenStreetMap viewport dimensions are invalid");
  }

  const spanX = Math.max(bounds.maxX - bounds.minX, 0.000000001);
  const spanY = Math.max(bounds.maxY - bounds.minY, 0.000000001);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);
  const contentWidth = spanX * scale;
  const contentHeight = spanY * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  const zoom = clamp(
    Math.floor(Math.log2(scale / openStreetMapTileSize)),
    0,
    maximumOpenStreetMapZoom,
  );

  return {
    bounds,
    height,
    offsetX,
    offsetY,
    scale,
    width,
    zoom,
  };
}

export function projectWebMercatorPoint(
  point: WebMercatorPoint,
  viewport: OpenStreetMapViewport,
) {
  return {
    x: viewport.offsetX
      + (point.x - viewport.bounds.minX) * viewport.scale,
    y: viewport.offsetY
      + (point.y - viewport.bounds.minY) * viewport.scale,
  };
}

export function projectLongitudeLatitude(
  position: LongitudeLatitude,
  viewport: OpenStreetMapViewport,
) {
  return projectWebMercatorPoint(
    longitudeLatitudeToWebMercator(position),
    viewport,
  );
}

export function openStreetMapTileUrl(input: {
  tileX: number;
  tileY: number;
  zoom: number;
}) {
  const { tileX, tileY, zoom } = input;
  const tileCount = 2 ** zoom;
  if (
    !Number.isInteger(zoom)
    || zoom < 0
    || zoom > maximumOpenStreetMapZoom
    || !Number.isInteger(tileX)
    || !Number.isInteger(tileY)
    || tileX < 0
    || tileY < 0
    || tileX >= tileCount
    || tileY >= tileCount
  ) {
    throw new Error("OpenStreetMap tile coordinate is invalid");
  }
  return `${OPENSTREETMAP_STANDARD_TILE_ORIGIN}/${zoom}/${tileX}/${tileY}.png`;
}

export function visibleOpenStreetMapTiles(
  viewport: OpenStreetMapViewport,
): OpenStreetMapTile[] {
  const tileCount = 2 ** viewport.zoom;
  const worldMinX = viewport.bounds.minX
    - viewport.offsetX / viewport.scale;
  const worldMaxX = viewport.bounds.minX
    + (viewport.width - viewport.offsetX) / viewport.scale;
  const worldMinY = viewport.bounds.minY
    - viewport.offsetY / viewport.scale;
  const worldMaxY = viewport.bounds.minY
    + (viewport.height - viewport.offsetY) / viewport.scale;
  const edgeEpsilon = 0.000000000001;
  const minimumTileX = Math.max(0, Math.floor(worldMinX * tileCount));
  const maximumTileX = Math.min(
    tileCount - 1,
    Math.floor((worldMaxX - edgeEpsilon) * tileCount),
  );
  const minimumTileY = Math.max(0, Math.floor(worldMinY * tileCount));
  const maximumTileY = Math.min(
    tileCount - 1,
    Math.floor((worldMaxY - edgeEpsilon) * tileCount),
  );
  const size = viewport.scale / tileCount;
  const tiles: OpenStreetMapTile[] = [];

  for (let tileY = minimumTileY; tileY <= maximumTileY; tileY += 1) {
    for (let tileX = minimumTileX; tileX <= maximumTileX; tileX += 1) {
      const screen = projectWebMercatorPoint(
        { x: tileX / tileCount, y: tileY / tileCount },
        viewport,
      );
      tiles.push({
        href: openStreetMapTileUrl({ tileX, tileY, zoom: viewport.zoom }),
        screenX: screen.x,
        screenY: screen.y,
        size,
        tileX,
        tileY,
        zoom: viewport.zoom,
      });
    }
  }

  return tiles;
}
