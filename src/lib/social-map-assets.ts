import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { GeoFeature } from "./workspace-map-paint";

export type ThumbnailShape = Pick<GeoFeature, "properties"> & { path: string };
type StatePaths = { counties: ThumbnailShape[]; equipment: ThumbnailShape[]; districts?: ThumbnailShape[] };

export async function readThumbnailPaths(state: string): Promise<StatePaths> {
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("Invalid state code for map thumbnail");
  const data = await readFile(path.join(process.cwd(), "data", "map-thumbnail-paths", state + ".json.gz"));
  return JSON.parse(gunzipSync(data).toString("utf8")) as StatePaths;
}
