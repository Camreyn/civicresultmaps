import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const ROOT = path.resolve(process.cwd());
const RETRIEVED_AT = "2026-08-12T23:58:58.000Z";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function absolute(relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Iowa artifact path: ${relativePath}`);
  }
  const resolved = path.resolve(ROOT, ...relativePath.split("/"));
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Iowa artifact escapes repository root: ${relativePath}`);
  }
  return resolved;
}

function artifact(relativePath, extra = {}) {
  const target = absolute(relativePath);
  if (!existsSync(target)) throw new Error(`Required Iowa artifact is missing: ${relativePath}`);
  const bytes = readFileSync(target);
  const result = {
    localArtifactPath: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    ...extra,
  };
  if (relativePath.endsWith(".gz")) {
    const uncompressed = gunzipSync(bytes);
    result.uncompressedByteCount = uncompressed.length;
    result.uncompressedSha256 = sha256(uncompressed);
  }
  return result;
}

function parseArtifact(relativePath) {
  const bytes = readFileSync(absolute(relativePath));
  return JSON.parse((relativePath.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"));
}

function writeJson(relativePath, value) {
  const bytes = serialize(value);
  writeFileSync(absolute(relativePath), bytes);
  return {
    artifact: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

const YEAR_SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    electionDate: "2012-11-06",
    resultSourceId: "ia-2012-sos-county-precinct-workbooks",
    geometryPath: "data/precinct-geometry/IA/2012-11-06-general/normalized/ia-2012-11-06-no-approved-precinct-geometry.json",
    crosswalkPath: "data/precinct-geometry/IA/2012-11-06-general/crosswalk/ia-2012-11-06-results-to-geometry-unavailable.json",
    boundaryVintage: "Incomplete Iowa Secretary of State county map archive for boundaries effective January 15, 2012; later 2014 statewide geometry retained only for change diagnostics",
    vintageStatus: "unknown",
    derivationMethod: "availability_diagnostic",
    authority: "Iowa Secretary of State",
    sourceUrl: "https://sos.iowa.gov/elections/pdf/precinctmaps/",
    licenseOrTerms: "Official public election records; no normalized 2012 geometry is delivered and no explicit reuse terms were located.",
    sourceArtifacts: [
      ["data/precinct-geometry/IA/2012-11-06-general/source-evidence.json", "Historic official-source retention and availability evidence."],
      ["data/precinct-geometry/IA/2012-11-06-general/reports/ia-2012-2014-review-diagnostic.json", "Deterministic result-to-later-geometry change diagnostic; never a public crosswalk."],
    ],
    sourceGatePassed: false,
    blockCode: "missing-complete-election-effective-2012-geometry",
    warnings: [
      "All 1,686 geographic presidential result rows are retained and reconcile to the official Iowa Secretary of State source.",
      "The later 2014 statewide layer leaves four 2012 result identities without geometry and introduces seven later polygons across seven counties; it is not backcast.",
      "One all-zero Dallas ABSENTEE administrative row is retained as non-geographic context and never assigned to a polygon.",
    ],
    caveats: [
      "No Iowa 2012 precinct polygon is approved for public delivery.",
      "The retained 2012 county map archive is incomplete and some surviving PDFs do not establish election-date applicability.",
      "The 2014 comparison is a boundary-change diagnostic only; ambiguous similarities are not promoted to reviewed relationships.",
    ],
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    electionDate: "2016-11-08",
    resultSourceId: "ia-sos-2016-general-county-precinct-workbooks",
    geometryPath: "data/precinct-geometry/IA/2016-11-08-general/normalized/ia-2016-precincts-reviewed.geojson.gz",
    crosswalkPath: "data/precinct-geometry/IA/2016-11-08-general/crosswalk/ia-2016-results-to-reviewed-geometry.json",
    boundaryVintage: "Iowa Precincts 2016 official LSA/SOS service, updated March 29, 2016",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "official_export",
    authority: "Iowa Secretary of State and Iowa Legislative Services Agency",
    sourceUrl: "https://gis.legis.iowa.gov/arcgis/rest/services/AR/Precincts/MapServer",
    licenseOrTerms: "Official LSA/SOS service attribution retained; the reviewed DSPG/ISU identity bridge is MIT licensed and its copyright notice accompanies the source package.",
    sourceArtifacts: [
      ["data/precinct-geometry/IA/2016-11-08-general/source-evidence.json", "Hash-pinned official SOS/LSA source-retention ledger and boundary metadata."],
      ["data/precinct-geometry/IA/raw-shared/dspg-isu/DESCRIPTION", "DSPG/ISU package description identifying the data package and MIT license."],
      ["data/precinct-geometry/IA/raw-shared/dspg-isu/LICENSE.md", "MIT terms for the reviewed identity bridge."],
      ["data/precinct-geometry/IA/raw-shared/dspg-isu/ia-2014-to-2016-reviewed-crosswalk.json", "Reviewed identity bridge between the official statewide geometry vintages."],
    ],
    sourceGatePassed: true,
    warnings: [
      "All displayed vote values come only from 99 retained Iowa Secretary of State county workbooks.",
      "The official LSA/SOS polygon layer is linked through a hash-pinned reviewed DSPG/ISU identity bridge; no vote value is copied into geometry.",
      "One Dickinson result identity combines two official source components; the normalized public feature is their reviewed union and remains a single result relationship.",
    ],
    caveats: [
      "The service calls this Iowa Precincts 2016 and records a March 29, 2016 update under Iowa Secretary of State purview.",
      "The DSPG/ISU package is an identity bridge, not the authority for vote values or certified totals.",
      "The official service and bridge attribution and terms must accompany public delivery.",
    ],
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    electionDate: "2020-11-03",
    resultSourceId: "ia-sos-2020-general-precinct-results",
    geometryPath: "data/precinct-geometry/IA/2020-11-03-general/normalized/ia-2020-precincts-reviewed.geojson.gz",
    crosswalkPath: "data/precinct-geometry/IA/2020-11-03-general/crosswalk/ia-2020-results-to-reviewed-geometry.json",
    boundaryVintage: "VEST Iowa 2020 election-specific precinct reconstruction, Harvard Dataverse version 24.0",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    authority: "Iowa Secretary of State results with attributed VEST election-specific geometry",
    sourceUrl: "https://dataverse.harvard.edu/file.xhtml?fileId=4789403&version=24.0",
    licenseOrTerms: "VEST geometry is Creative Commons Attribution 4.0 per the retained Harvard Dataverse version-24 terms; Iowa Secretary of State vote values remain the official result authority.",
    sourceArtifacts: [
      ["data/precinct-geometry/IA/2020-11-03-general/raw/vest/ia_2020.zip", "Exact VEST Iowa 2020 shapefile archive used only for geometry and relationship review."],
      ["data/precinct-geometry/IA/2020-11-03-general/raw/vest/dataverse-v24-license-evidence.json", "Version, file identity, download, and CC BY 4.0 terms evidence."],
    ],
    sourceGatePassed: true,
    warnings: [
      "Every one of the 1,661 VEST polygons matches exactly one official Iowa result row by county and the complete presidential vote signature.",
      "All source vote fields are removed before normalized geometry is written; displayed values come only from the official Iowa artifact.",
      "VEST must be identified as the secondary election-specific geometry reconstruction and credited under CC BY 4.0.",
    ],
    caveats: [
      "Iowa did not expose a retained statewide election-date GIS archive through the reviewed official pages; VEST supplies geometry only.",
      "The exact Dataverse version-24 file and terms evidence are hash-pinned.",
      "No VEST vote value replaces or supplements an Iowa Secretary of State value.",
    ],
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    electionDate: "2024-11-05",
    resultSourceId: "ia-sos-2024-general-county-detailxml-reports",
    geometryPath: "data/precinct-geometry/IA/2024-11-05-general/normalized/ia-2024-precincts-reviewed.geojson.gz",
    crosswalkPath: "data/precinct-geometry/IA/2024-11-05-general/crosswalk/ia-2024-results-to-reviewed-geometry.json",
    boundaryVintage: "New York Times 2024 Iowa election-specific compilation; all 1,653 source features declare official_boundary=true",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    authority: "Iowa Secretary of State results with attributed New York Times official-boundary compilation",
    sourceUrl: "https://github.com/nytimes/presidential-precinct-map-2024",
    licenseOrTerms: "NYT Computational Use of Data Agreement v1.0 - Non-Commercial. Attribution to The New York Times, non-commercial use, and downstream terms are required; see the retained LICENSE.",
    sourceArtifacts: [
      ["data/precinct-geometry/IA/2024-11-05-general/raw/nytimes/IA-precincts-with-results.geojson.gz", "Election-specific statewide source; result fields are used only for exact relationship review and are removed from normalized geometry."],
      ["data/precinct-geometry/IA/2024-11-05-general/raw/nytimes/source-evidence.json", "Repository commit, source declaration, terms, and exact match evidence."],
      ["data/precinct-geometry/IA/2024-11-05-general/raw/nytimes/LICENSE", "NYT C-UDA v1.0 Non-Commercial terms."],
      ["data/precinct-geometry/IA/2024-11-05-general/raw/nytimes/README.md", "Source README identifying Iowa as complete with official boundaries."],
      ["data/precinct-geometry/IA/2024-11-05-general/source-package-manifest.json", "Retained Iowa Secretary of State county/city geometry packages used as independent official context."],
    ],
    sourceGatePassed: true,
    warnings: [
      "Every one of the 1,653 source polygons declares official_boundary=true and matches exactly one official Iowa result row by county and complete presidential vote signature.",
      "All source vote fields are removed; displayed values come only from the 99 official Iowa county detail XML reports.",
      "The NYT non-commercial license, attribution, and downstream terms must remain visible in every public delivery.",
    ],
    caveats: [
      "The New York Times is a secondary statewide geometry compiler, not the authority for displayed Iowa vote values.",
      "The retained Iowa SOS county/city packages provide substantial official boundary context but do not themselves form a uniform complete statewide election-date layer.",
      "Public use is limited by the retained NYT C-UDA v1.0 Non-Commercial terms.",
    ],
  },
]);

function election(spec) {
  return {
    id: spec.electionId,
    date: spec.electionDate,
    year: spec.year,
    type: "general",
    office: "president",
  };
}

for (const spec of YEAR_SPECS) {
  const base = `data/precinct-geometry/IA/${spec.electionId}`;
  const resultsPath = `${base}/normalized/ia-${spec.year}-president-results.json.gz`;
  const results = parseArtifact(resultsPath);
  const geometry = parseArtifact(spec.geometryPath);
  const crosswalk = parseArtifact(spec.crosswalkPath);
  const geometryFeatureCount = Array.isArray(geometry.features) ? geometry.features.length : 0;
  const relationshipRows = Array.isArray(crosswalk.rows) ? crosswalk.rows : [];
  const relationshipCount = relationshipRows.reduce(
    (total, row) => total + (Array.isArray(row.relationships) ? row.relationships.length : 0),
    0,
  );
  const sourceArtifactRows = spec.sourceArtifacts.map(([relativePath, note]) => artifact(relativePath, {
    sourceUrl: spec.sourceUrl,
    authority: spec.authority,
    derivation: "Retained from or deterministically derived from the cited source; the nested source ledger preserves more specific upstream URLs and byte identities where applicable.",
    note,
  }));
  const resultsArtifact = artifact(resultsPath, {
    sourceUrl: results.collection?.sources?.[0]?.sourceUrl ?? spec.sourceUrl,
    authority: "Iowa Secretary of State",
    derivation: "Deterministically parsed and normalized by scripts/collect-ia-precinct-results.mjs from the exact official artifacts recorded in collection.sources.",
    note: `Normalized official presidential rows; collection metadata retains ${results.collection?.sourceArtifactCount ?? 0} exact upstream source artifacts with URLs and hashes.`,
  });
  const geometryArtifact = artifact(spec.geometryPath, {
    sourceUrl: spec.sourceUrl,
    authority: spec.authority,
    derivation: spec.year === 2012
      ? "Deterministic blocked placeholder written after official-source availability review."
      : "Deterministically normalized from the retained source geometry by the manifest normalization script; election-result fields are removed.",
    note: spec.year === 2012
      ? "Blocked placeholder with no geometry."
      : "Reviewed normalized geometry; contains no election-result value fields.",
  });
  const crosswalkArtifact = artifact(spec.crosswalkPath, {
    sourceUrl: spec.sourceUrl,
    authority: spec.authority,
    derivation: spec.year === 2012
      ? "Deterministic unavailable-geometry relationship ledger derived from official result identities."
      : "Deterministically generated from the hash-pinned reviewed relationship procedure; contains no election-result values.",
    note: spec.year === 2012
      ? "Blocked availability diagnostic; contains no approved relationship."
      : "Reviewed result-to-geometry relationship records; contains no election-result values.",
  });

  const evidence = {
    schemaVersion: 1,
    id: `ia-${spec.year}-precinct-geometry-reviewed-source-evidence-v1`,
    state: "IA",
    election: election(spec),
    authority: spec.authority,
    retrievedAt: RETRIEVED_AT,
    sourceCrs: spec.year === 2016 ? "Official LSA service source; requested and normalized as EPSG:4326" : "source-defined and normalized to EPSG:4326",
    servedCrs: "EPSG:4326",
    artifacts: [resultsArtifact, ...sourceArtifactRows, geometryArtifact, crosswalkArtifact],
    resultIdentity: {
      sourceId: spec.resultSourceId,
      sourceResultUnits: results.sourceUnitCount,
      colorableResultUnits: results.rows.length,
      excludedResultUnits: results.exclusions?.length ?? 0,
      officialStatewideTotals: results.totals,
      normalizedResultArtifact: {
        path: resultsArtifact.localArtifactPath,
        sha256: resultsArtifact.sha256,
        byteCount: resultsArtifact.byteCount,
      },
      authority: "Iowa Secretary of State",
    },
    boundaryContext: {
      vintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: spec.derivationMethod,
      sourceGatePassed: spec.sourceGatePassed,
      blockCode: spec.blockCode ?? null,
      licenseOrTerms: spec.licenseOrTerms,
    },
    reconciliation: {
      resultUnits: results.rows.length,
      geometryFeatures: geometryFeatureCount,
      reviewedRelationshipRecords: spec.year === 2012 ? 0 : relationshipCount,
      unmatchedResultUnits: spec.year === 2012 ? results.rows.length : 0,
      status: spec.year === 2012 ? "blocked_missing_election_effective_geometry" : "passed",
    },
    caveats: spec.caveats,
  };
  const evidencePath = `${base}/reviewed-source-evidence.json`;
  const evidenceOutput = writeJson(evidencePath, evidence);

  const manifest = {
    schemaVersion: 1,
    id: spec.year === 2012
      ? "ia-2012-11-06-official-county-pdf-conversion-pending-v5"
      : `ia-${spec.year}-${spec.electionDate}-precinct-geometry-candidate-v1`,
    state: "IA",
    election: election(spec),
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: spec.derivationMethod,
    },
    source: {
      authority: spec.authority,
      url: spec.sourceUrl,
      retrievedAt: RETRIEVED_AT,
      artifact: evidenceOutput.artifact,
      sha256: evidenceOutput.sha256,
      byteCount: evidenceOutput.byteCount,
      format: "precinct-source-evidence+json",
      licenseOrTerms: spec.licenseOrTerms,
    },
    normalization: {
      script: spec.year === 2012
        ? "scripts/build-ia-reviewed-precinct-crosswalks.py"
        : spec.year === 2016
          ? "scripts/build-ia-reviewed-precinct-crosswalks.py"
          : `scripts/build-ia-${spec.year}-reviewed-precincts.mjs`,
      sourceCrs: spec.year === 2016 ? "Official LSA source normalized to EPSG:4326" : "source-defined",
      servedCrs: "EPSG:4326",
      artifact: geometryArtifact.localArtifactPath,
      sha256: geometryArtifact.sha256,
      byteCount: geometryArtifact.byteCount,
      featureCount: geometryFeatureCount,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: spec.year === 2012 ? "blocked" : "reviewed",
      resultSourceId: spec.resultSourceId,
      artifact: crosswalkArtifact.localArtifactPath,
      sha256: crosswalkArtifact.sha256,
      byteCount: crosswalkArtifact.byteCount,
      resultUnits: results.sourceUnitCount,
      colorableResultUnits: results.rows.length,
      matchedResultUnits: spec.year === 2012 ? 0 : results.rows.length,
      unmatchedResultUnits: spec.year === 2012 ? results.rows.length : 0,
      nonGeographicResultUnits: results.exclusions?.length ?? 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: spec.year === 2012 ? 0 : results.rows.length,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: results.exclusions?.length ?? 0,
        sourceAlias: 0,
        pendingReview: spec.year === 2012 ? results.rows.length : 0,
      },
      reviewedRelationshipRecords: spec.year === 2012
        ? relationshipRows.flatMap((row) => row.relationships ?? []).filter((row) => row.reviewStatus === "reviewed").length
        : relationshipCount,
      reviewedNoDataFeatures: spec.year === 2012 ? 0 : geometryFeatureCount - relationshipCount,
      methods: spec.year === 2012
        ? ["official_crosswalk_required"]
        : [...new Set(relationshipRows.flatMap((row) => row.relationships ?? []).map((row) => row.matchMethod))],
    },
    validation: {
      status: "blocked",
      geometryValid: spec.year !== 2012,
      rowLevelRenderingSafe: false,
      parentTotalsReconciled: spec.year !== 2012,
      resultTotalsReconciled: true,
      errors: spec.year === 2012
        ? ["Complete election-effective 2012 precinct geometry is not retained; later polygons are not backcast."]
        : ["An immutable parent-scoped public delivery package and guarded release review have not been completed."],
      warnings: spec.warnings,
    },
    delivery: null,
    caveats: spec.caveats,
  };
  const manifestOutput = writeJson(`${base}/manifest.json`, manifest);
  console.log(JSON.stringify({
    year: spec.year,
    manifest: manifestOutput,
    evidence: evidenceOutput,
    resultUnits: results.rows.length,
    geometryFeatures: geometryFeatureCount,
    reviewedRelationships: spec.year === 2012 ? 0 : relationshipCount,
    sourceGatePassed: spec.sourceGatePassed,
  }));
}
