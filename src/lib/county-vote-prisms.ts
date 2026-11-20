import type { NationalCountyFeature } from "./national-county-map";
import type { CountyVote } from "./county-vote-races";

type Point = [number, number];
export type VotePrism = {
  id: string; name: string; vote: CountyVote | null; height: number;
  roof: string; lightWall: string; darkWall: string; anchor: Point; depth: number;
};
const format = ([x, y]: Point) => x.toFixed(1) + "," + y.toFixed(1);
export const voteMapBox = { width: 800, height: 510 };
const maxHeight = 165;

// Orthographic view: rotate the ground plane, tilt it toward the reader,
// then lift each complete county footprint by a linear vote scale.
export function buildVotePrisms(features: NationalCountyFeature[], counties: Record<string, CountyVote | null>, bearing: number) {
  const empty = { prisms: [] as VotePrism[], peak: 0, viewBox: "0 0 800 510" };
  if (!features.length) return empty;
  const raw = features.map(f => ({
    id: f.properties.GEOID, name: f.properties.NAME,
    polygons: (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Point[][][],
  }));
  const points = raw.flatMap(f => f.polygons.flat(2));
  if (!points.length) return empty;
  const latitude = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const longitudeScale = Math.cos(latitude * Math.PI / 180);
  const alaska = features[0].properties.STATE === "AK";
  const rad = bearing * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  function rotate([lon, lat]: Point): Point {
    const x = (alaska && lon > 0 ? lon - 360 : lon) * longitudeScale;
    return [x * cos + lat * sin, x * sin - lat * cos];
  }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) {
    const [x, y] = rotate(p);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const pitch = 0.64;
  const scale = Math.min(728 / (right - left || 1), 292 / ((bottom - top || 1) * pitch));
  const project = (p: Point): Point => {
    const [x, y] = rotate(p);
    return [400 + (x - (left + right) / 2) * scale, 338 + (y - (top + bottom) / 2) * scale * pitch];
  };
  const peak = raw.reduce((max, f) => Math.max(max, counties[f.id]?.total ?? 0), 0);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const prisms: VotePrism[] = raw.map(({ id, name, polygons }) => {
    const vote = counties[id] ?? null;
    const height = peak ? maxHeight * (vote?.total ?? 0) / peak : 0;
    const roof: string[] = [], light: string[] = [], dark: string[] = [];
    let anchor: Point = [400,338], largest = 0;
    for (const polygon of polygons) {
      polygon.forEach((sourceRing, ri) => {
        // Remove the closing duplicate; wrap to the first point explicitly.
        const ring = sourceRing.map(project);
        if (ring.length < 3) return;
        if (ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
        const lifted = ring.map(([x, y]): Point => [x, y - height]);
        for (const [x, y] of ring) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y - height); maxY = Math.max(maxY, y);
        }
        roof.push("M" + lifted.map(format).join("L") + "Z");
        let area2 = 0, cx = 0, cy = 0;
        for (const [i, a] of ring.entries()) {
          const b = ring[(i + 1) % ring.length];
          const cross = a[0] * b[1] - b[0] * a[1];
          area2 += cross; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
        }
        if (ri === 0 && Math.abs(area2) > largest) {
          largest = Math.abs(area2); anchor = [cx / (3 * area2), cy / (3 * area2)];
        }
        if (!height) return;
        const winding = Math.sign(area2) * (ri === 0 ? 1 : -1);
        for (const [i, a] of ring.entries()) {
          const j = (i + 1) % ring.length, b = ring[j];
          if ((b[0] - a[0]) * winding >= 0) continue; // rear-facing edge
          const walls = (b[1] - a[1]) * winding > 0 ? dark : light;
          walls.push("M" + [a, b, lifted[j], lifted[i]].map(format).join("L") + "Z");
        }
      });
    }
    return { id, name, vote, height, roof: roof.join(""), lightWall: light.join(""), darkWall: dark.join(""),
      depth: anchor[1], anchor: [anchor[0], anchor[1] - height] as Point };
  }).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  // Reserve room for peak labels and fit the actual silhouette, not the
  // hypothetical tallest possible prism at the northern edge of the state.
  const viewBox = [minX - 70, minY - 55, maxX - minX + 140, maxY - minY + 85].join(" ");
  return { prisms, peak, viewBox };
}
