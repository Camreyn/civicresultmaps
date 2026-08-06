import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const catalog = JSON.parse(await readFile("data/national-data-releases.json", "utf8"));
const legacyRequiredEntries = [
  "README.md",
  "manifest.json",
  "jurisdictions.csv",
  "data-dictionary.csv",
  "confidence-definitions.json",
  "openapi.json",
  "coverage.json",
  "county-results-2016.csv",
  "county-results-2020.csv",
  "county-results-2024.csv",
  "county-comparison-2016-2020.csv",
  "county-comparison-2016-2024.csv",
  "county-comparison-2020-2024.csv",
];

if (!catalog.releases.some((release) => release.id === catalog.currentReleaseId)) {
  throw new Error(`Current release ${catalog.currentReleaseId} is missing from the catalog`);
}
if (new Set(catalog.releases.map((release) => release.id)).size !== catalog.releases.length) {
  throw new Error("Release identifiers must be unique");
}

for (const release of catalog.releases) {
  const requiredEntries = release.requiredEntries ?? legacyRequiredEntries;
  const archivePath = path.join("public", release.archivePath.replace(/^\/+/, ""));
  const bytes = await readFile(archivePath);
  const archiveSha256 = createHash("sha256").update(bytes).digest("hex");
  if (archiveSha256 !== release.archiveSha256) {
    throw new Error(
      `${release.id} archive hash mismatch: expected ${release.archiveSha256}, got ${archiveSha256}`,
    );
  }

  const zip = await JSZip.loadAsync(bytes);
  for (const entry of requiredEntries) {
    if (!zip.file(entry)) {
      throw new Error(`${release.id} is missing ${entry}`);
    }
  }

  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  if (manifest.id !== release.id || manifest.dataSha256 !== release.dataSha256) {
    throw new Error(`${release.id} embedded manifest identity does not match the release catalog`);
  }
  if (release.product && manifest.product && manifest.product !== release.product) {
    throw new Error(`${release.id} embedded product does not match the release catalog`);
  }
  if (release.geographyVintage && manifest.geographyVintage !== release.geographyVintage) {
    throw new Error(`${release.id} embedded geography vintage does not match the release catalog`);
  }
  for (const [coverageKey, coverageValue] of Object.entries(release.coverage ?? {})) {
    if (JSON.stringify(manifest.coverage?.[coverageKey]) !== JSON.stringify(coverageValue)) {
      throw new Error(`${release.id} embedded coverage does not match catalog field ${coverageKey}`);
    }
  }

  if (release.primaryDataEntry) {
    const primaryEntry = zip.file(release.primaryDataEntry);
    if (!primaryEntry) throw new Error(`${release.id} is missing primary data entry ${release.primaryDataEntry}`);
    const primarySha256 = createHash("sha256").update(await primaryEntry.async("nodebuffer")).digest("hex");
    if (primarySha256 !== release.dataSha256) {
      throw new Error(`${release.id} primary data hash does not match the release catalog`);
    }
  }

  for (const content of manifest.contents ?? []) {
    const entry = zip.file(content.path);
    if (!entry) throw new Error(`${release.id} manifest content is missing ${content.path}`);
    const entryBytes = await entry.async("nodebuffer");
    const entrySha256 = createHash("sha256").update(entryBytes).digest("hex");
    if (entryBytes.byteLength !== content.bytes || entrySha256 !== content.sha256) {
      throw new Error(`${release.id} content hash or byte length mismatch for ${content.path}`);
    }
  }

  console.log(
    [
      "Verified",
      release.id,
      release.product ?? "national_county_results",
      `${bytes.byteLength.toLocaleString("en-US")} bytes`,
      `${requiredEntries.length} required entries`,
      `archive SHA-256 ${archiveSha256}`,
    ].join(" | "),
  );
}
