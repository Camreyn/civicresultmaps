import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const catalog = JSON.parse(await readFile("data/national-data-releases.json", "utf8"));
const requiredEntries = [
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

for (const release of catalog.releases) {
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
  if (manifest.geographyVintage !== release.geographyVintage) {
    throw new Error(`${release.id} embedded geography vintage does not match the release catalog`);
  }

  console.log(
    [
      "Verified",
      release.id,
      `${bytes.byteLength.toLocaleString("en-US")} bytes`,
      `${requiredEntries.length} required entries`,
      `archive SHA-256 ${archiveSha256}`,
    ].join(" | "),
  );
}
