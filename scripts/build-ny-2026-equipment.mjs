import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { equipmentSources, contextSources } from "./ny-2026-equipment-sources.mjs";

const root = new URL("../", import.meta.url);
export const observationPath = "data/ny-2026-equipment-source-observations.json";
const outputPath = "data/ny-2026-equipment.json";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function buildEquipmentPackage(observations, registry, observationBytes) {
  assert.equal(observations.electionYear, 2026);
  assert.equal(observations.electionDate, "2026-11-03");
  assert.equal(observations.publicationDate, null);
  const counties = registry.jurisdictions.filter((row) => row.state === "NY" && /^county:36\d{3}$/.test(row.jurisdictionTag));
  assert.equal(counties.length, 62);
  const byName = new Map(counties.map((row) => [row.displayName.replace(/ County$/, ""), row]));
  const familyByCounty = new Map();
  const extraByCounty = new Map();
  const expanded = (name) => name === "New York City (Bronx, Kings, New York, Queens, Richmond)"
    ? ["Bronx", "Kings", "New York", "Queens", "Richmond"] : [name];
  for (const list of observations.lists) {
    const source = equipmentSources.find((item) => item.id === list.sourceId);
    assert.ok(source, `Unknown source ${list.sourceId}`);
    assert.ok(["listed_system_family", "central_count_audit_only"].includes(list.role), "Unknown role");
    assert.ok(list.section.startsWith(source.heading), "Missing source section");
    if (list.role === "central_count_audit_only") assert.equal(source.id, "clear-ballot");
    const target = list.role === "listed_system_family" ? familyByCounty : extraByCounty;
    for (const name of list.counties.flatMap(expanded)) {
      assert.ok(byName.has(name), `Unmatched county ${name}`);
      assert.ok(!target.has(name), `Duplicate ${list.role}: ${name}`);
      target.set(name, { sourceId: source.id, family: source.family, sourceSection: list.section });
    }
  }
  assert.equal(familyByCounty.size, 62);
  assert.equal(extraByCounty.size, 24);
  for (const source of equipmentSources) {
    assert.equal([...familyByCounty.values()].filter((row) => row.sourceId === source.id).length, source.expected);
  }
  const evidenceSha256 = sha256(observationBytes);
  return {
    schemaVersion: 1,
    state: "NY",
    electionYear: 2026,
    electionDate: observations.electionDate,
    observedAt: observations.observedAt,
    status: "pre_election_source_snapshot",
    resultsStatus: "not_loaded",
    authority: observations.authority,
    reportingGrain: observations.reportingGrain,
    sourcePublicationDate: null,
    evidence: { path: observationPath, sha256: evidenceSha256, byteLength: observationBytes.length, captureMethod: observations.captureMethod, parser: observations.parser },
    sources: [...equipmentSources, ...contextSources].map((source) => ({
      id: source.id, title: source.title, url: source.url, authority: observations.authority,
      observedAt: observations.observedAt, publicationDate: null,
      observationPath, observationSha256: evidenceSha256,
    })),
    caveats: observations.caveats,
    expected: observations.expected,
    rows: counties.map((county) => {
      const name = county.displayName.replace(/ County$/, "");
      const family = familyByCounty.get(name);
      const extra = extraByCounty.get(name);
      assert.ok(family, `No listed family for ${name}`);
      return {
        jurisdictionTag: county.jurisdictionTag, fips: county.fips, county: name,
        ...family,
        additionalEquipment: extra ? [{ ...extra, role: "central_count_audit_only" }] : [],
        evidenceStatus: "official_listing_election_deployment_unconfirmed",
        electionDeploymentConfirmed: false,
        exactModels: null, firmware: null, pollbook: null,
        notes: name === "Nassau"
          ? "Legacy official ES&S AutoMARK page also lists Nassau; the hub-linked Clear Ballot full-suite list is shown. Election-effective transition and retirement dates are unresolved."
          : null,
        conflictSourceIds: name === "Nassau" ? ["legacy-ess", "voting-technology"] : [],
      };
    }).sort((a, b) => a.county.localeCompare(b.county, "en")),
  };
}

export async function replayEquipmentPackage() {
  const [bytes, registryBytes] = await Promise.all([
    readFile(new URL(observationPath, root)),
    readFile(new URL("data/canonical-jurisdictions.json", root), "utf8"),
  ]);
  return buildEquipmentPackage(JSON.parse(bytes.toString("utf8")), JSON.parse(registryBytes), bytes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = `${JSON.stringify(await replayEquipmentPackage(), null, 2)}\n`;
  const target = new URL(outputPath, root);
  if (process.argv.includes("--check")) {
    assert.equal(await readFile(target, "utf8"), output, "Equipment package drift; rebuild and review.");
    console.log("NY 2026 equipment replay passed: 62 counties, four families, 24 separate central-count/audit-only listings.");
  } else {
    await writeFile(target, output);
    console.log(`Generated ${fileURLToPath(target)}`);
  }
}
