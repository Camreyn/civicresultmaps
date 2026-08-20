const EARTH_RADIUS_METERS = 6_371_008.8;
const DEGREES_TO_RADIANS = Math.PI / 180;

export type GeoJsonPosition = [number, number] | [number, number, number];

export type DistrictGeometry = {
  coordinates: GeoJsonPosition[][] | GeoJsonPosition[][][];
  type: "Polygon" | "MultiPolygon";
};

export type DistrictGeometryMetrics = {
  areaSquareMeters: number;
  centroidLatitude: number;
  centroidLongitude: number;
  convexHullAreaSquareMeters: number;
  convexHullRatio: number;
  holeCount: number;
  partCount: number;
  perimeterMeters: number;
  polsbyPopper: number;
  vertexCount: number;
};

export type DistrictMetricSnapshot = DistrictGeometryMetrics & {
  geoid: string;
  geographyType: string;
  planVintage: string;
  resolution: "detailed" | "generalized_500k";
};

export type DistrictResolutionComparison = {
  convexHullRelativeDifference: number;
  polsbyPopperRelativeDifference: number;
  resolutionStability: "stable" | "resolution_sensitive";
};

function radians(value: number) {
  return value * DEGREES_TO_RADIANS;
}

function degrees(value: number) {
  return value / DEGREES_TO_RADIANS;
}

function normalizedLongitudeDelta(left: number, right: number) {
  let delta = right - left;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function validatePosition(position: GeoJsonPosition) {
  if (
    !Array.isArray(position)
    || position.length < 2
    || !Number.isFinite(position[0])
    || !Number.isFinite(position[1])
    || position[0] < -180
    || position[0] > 180
    || position[1] < -90
    || position[1] > 90
  ) {
    throw new Error("district geometry contains an invalid longitude/latitude position");
  }
}

function samePosition(left: GeoJsonPosition, right: GeoJsonPosition) {
  return left[0] === right[0] && left[1] === right[1];
}

function ringEdges(ring: GeoJsonPosition[]) {
  if (ring.length < 3) {
    throw new Error("district geometry contains a ring with fewer than three positions");
  }
  for (const position of ring) validatePosition(position);
  const edges: Array<[GeoJsonPosition, GeoJsonPosition]> = [];
  for (let index = 1; index < ring.length; index += 1) {
    edges.push([ring[index - 1], ring[index]]);
  }
  if (!samePosition(ring[0], ring[ring.length - 1])) {
    edges.push([ring[ring.length - 1], ring[0]]);
  }
  return edges;
}

function sphericalRingAreaSquareMeters(ring: GeoJsonPosition[]) {
  let sum = 0;
  for (const [left, right] of ringEdges(ring)) {
    const leftLongitude = radians(left[0]);
    const rightLongitude = radians(right[0]);
    const leftLatitude = radians(left[1]);
    const rightLatitude = radians(right[1]);
    sum += normalizedLongitudeDelta(leftLongitude, rightLongitude)
      * (2 + Math.sin(leftLatitude) + Math.sin(rightLatitude));
  }
  return Math.abs(sum * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS / 2);
}

function haversineDistanceMeters(left: GeoJsonPosition, right: GeoJsonPosition) {
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = normalizedLongitudeDelta(radians(left[0]), radians(right[0]));
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function ringPerimeterMeters(ring: GeoJsonPosition[]) {
  return ringEdges(ring).reduce(
    (total, [left, right]) => total + haversineDistanceMeters(left, right),
    0,
  );
}

function polygonsForGeometry(geometry: DistrictGeometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as GeoJsonPosition[][]];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates as GeoJsonPosition[][][];
  }
  throw new Error("district geometry must be a Polygon or MultiPolygon");
}

function openRing(ring: GeoJsonPosition[]) {
  return ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring;
}

function projectionCenter(polygons: GeoJsonPosition[][][]) {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (const polygon of polygons) {
    for (const position of openRing(polygon[0] ?? [])) {
      validatePosition(position);
      const longitude = radians(position[0]);
      const latitude = radians(position[1]);
      const latitudeCosine = Math.cos(latitude);
      x += latitudeCosine * Math.cos(longitude);
      y += latitudeCosine * Math.sin(longitude);
      z += Math.sin(latitude);
      count += 1;
    }
  }
  if (count === 0 || Math.hypot(x, y, z) < 1e-12) {
    throw new Error("district geometry has no usable exterior vertices");
  }
  return {
    latitude: Math.atan2(z, Math.hypot(x, y)),
    longitude: Math.atan2(y, x),
  };
}

type ProjectedPoint = [number, number];

function lambertAzimuthalEqualArea(
  position: GeoJsonPosition,
  center: { latitude: number; longitude: number },
): ProjectedPoint {
  const longitude = radians(position[0]);
  const latitude = radians(position[1]);
  const longitudeDelta = normalizedLongitudeDelta(center.longitude, longitude);
  const denominator = 1
    + Math.sin(center.latitude) * Math.sin(latitude)
    + Math.cos(center.latitude) * Math.cos(latitude) * Math.cos(longitudeDelta);
  if (denominator <= 1e-12) {
    throw new Error("district geometry cannot be projected from its local equal-area center");
  }
  const scale = Math.sqrt(2 / denominator);
  return [
    EARTH_RADIUS_METERS * scale * Math.cos(latitude) * Math.sin(longitudeDelta),
    EARTH_RADIUS_METERS * scale * (
      Math.cos(center.latitude) * Math.sin(latitude)
      - Math.sin(center.latitude) * Math.cos(latitude) * Math.cos(longitudeDelta)
    ),
  ];
}

function planarRingAreaSquareMeters(points: ProjectedPoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return Math.abs(sum) / 2;
}

function cross(origin: ProjectedPoint, left: ProjectedPoint, right: ProjectedPoint) {
  return (left[0] - origin[0]) * (right[1] - origin[1])
    - (left[1] - origin[1]) * (right[0] - origin[0]);
}

export function convexHull(points: ProjectedPoint[]) {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point])).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return unique;
  const lower: ProjectedPoint[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: ProjectedPoint[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function calculateDistrictGeometryMetrics(geometry: DistrictGeometry): DistrictGeometryMetrics {
  const polygons = polygonsForGeometry(geometry);
  if (polygons.length === 0) throw new Error("district geometry contains no polygon parts");
  const center = projectionCenter(polygons);
  let sphericalArea = 0;
  let projectedArea = 0;
  let perimeter = 0;
  let holeCount = 0;
  let vertexCount = 0;
  const exteriorProjectedPoints: ProjectedPoint[] = [];

  for (const polygon of polygons) {
    if (polygon.length === 0) throw new Error("district geometry contains an empty polygon");
    const outerArea = sphericalRingAreaSquareMeters(polygon[0]);
    const projectedOuter = openRing(polygon[0]).map((position) => lambertAzimuthalEqualArea(position, center));
    let polygonSphericalArea = outerArea;
    let polygonProjectedArea = planarRingAreaSquareMeters(projectedOuter);
    exteriorProjectedPoints.push(...projectedOuter);
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex];
      const vertices = openRing(ring);
      if (vertices.length < 3) throw new Error("district geometry contains a degenerate ring");
      vertexCount += vertices.length;
      perimeter += ringPerimeterMeters(ring);
      if (ringIndex > 0) {
        holeCount += 1;
        polygonSphericalArea -= sphericalRingAreaSquareMeters(ring);
        polygonProjectedArea -= planarRingAreaSquareMeters(
          vertices.map((position) => lambertAzimuthalEqualArea(position, center)),
        );
      }
    }
    if (polygonSphericalArea <= 0 || polygonProjectedArea <= 0) {
      throw new Error("district geometry contains holes larger than an exterior ring");
    }
    sphericalArea += polygonSphericalArea;
    projectedArea += polygonProjectedArea;
  }

  const hullArea = planarRingAreaSquareMeters(convexHull(exteriorProjectedPoints));
  if (sphericalArea <= 0 || perimeter <= 0 || hullArea <= 0) {
    throw new Error("district geometry produced a zero area, perimeter, or convex hull");
  }
  return {
    areaSquareMeters: sphericalArea,
    centroidLatitude: degrees(center.latitude),
    centroidLongitude: degrees(center.longitude),
    convexHullAreaSquareMeters: hullArea,
    convexHullRatio: Math.min(1, projectedArea / hullArea),
    holeCount,
    partCount: polygons.length,
    perimeterMeters: perimeter,
    polsbyPopper: Math.min(1, 4 * Math.PI * sphericalArea / (perimeter * perimeter)),
    vertexCount,
  };
}

function relativeDifference(left: number, right: number) {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
}

export function compareDistrictResolutions(
  detailed: DistrictMetricSnapshot,
  generalized: DistrictMetricSnapshot,
  thresholds: { convexHull?: number; polsbyPopper?: number } = {},
): DistrictResolutionComparison {
  if (
    detailed.geoid !== generalized.geoid
    || detailed.geographyType !== generalized.geographyType
    || detailed.planVintage !== generalized.planVintage
  ) {
    throw new Error("district compactness metrics are not comparable across GEOIDs, geography types, or plan vintages");
  }
  if (detailed.resolution !== "detailed" || generalized.resolution !== "generalized_500k") {
    throw new Error("resolution comparison requires detailed and generalized_500k snapshots in that order");
  }
  const polsbyPopperRelativeDifference = relativeDifference(
    detailed.polsbyPopper,
    generalized.polsbyPopper,
  );
  const convexHullRelativeDifference = relativeDifference(
    detailed.convexHullRatio,
    generalized.convexHullRatio,
  );
  const stable = polsbyPopperRelativeDifference <= (thresholds.polsbyPopper ?? 0.2)
    && convexHullRelativeDifference <= (thresholds.convexHull ?? 0.1);
  return {
    convexHullRelativeDifference,
    polsbyPopperRelativeDifference,
    resolutionStability: stable ? "stable" : "resolution_sensitive",
  };
}
