import releaseCatalog from "../../data/national-data-releases.json" with { type: "json" };
import { currentNationalReleaseId, publicApiSchemaVersion } from "./api-version";

export type NationalDataRelease = (typeof releaseCatalog.releases)[number];

export function listNationalDataReleases(): NationalDataRelease[] {
  return [...releaseCatalog.releases].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function getNationalDataRelease(releaseId: string) {
  return listNationalDataReleases().find((release) => release.id === releaseId) ?? null;
}

export function getCurrentNationalDataRelease() {
  return getNationalDataRelease(currentNationalReleaseId);
}

export function nationalReleaseMeta(releaseId = currentNationalReleaseId) {
  return {
    apiSchemaVersion: publicApiSchemaVersion,
    releaseId,
    releaseCatalog: "/api/releases",
    openApi: "/api/openapi",
  };
}
