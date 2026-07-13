export type NationalCountyFeature = {
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

export type NationalCountyFeatureCollection = {
  features: NationalCountyFeature[];
  metadata?: {
    featureCount?: number;
  };
  type: "FeatureCollection";
};

export type NationalCountyMapFeature = {
  feature: NationalCountyFeature;
  fips: string;
  path: string;
};

type Point = [number, number];

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
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
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

function makeNationalProjector(features: NationalCountyFeature[]) {
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

function polygonRings(feature: NationalCountyFeature): Point[][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates as Point[][];
  }
  return (feature.geometry.coordinates as Point[][][]).flat();
}

function makeFeaturePath(feature: NationalCountyFeature, project: (state: string, point: Point) => Point) {
  return polygonRings(feature)
    .map((ring) => ring.map((point, index) => {
      const [x, y] = project(feature.properties.STATE, point);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ").concat(" Z"))
    .join(" ");
}

export function buildNationalCountyMapFeatures(features: NationalCountyFeature[]): NationalCountyMapFeature[] {
  if (!features.length) return [];
  const projector = makeNationalProjector(features);
  return features.map((feature) => ({
    feature,
    fips: feature.properties.GEOID,
    path: makeFeaturePath(feature, projector),
  }));
}
