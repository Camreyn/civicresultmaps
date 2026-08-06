import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseCsv, toCsv } from "./normalize-eac-turnout.mjs";

const catalog = JSON.parse(readFileSync("data/national-data-releases.json", "utf8"));
const metadataOnly = process.argv.includes("--metadata");
const requestedReleaseId = process.argv.find((argument) => argument.startsWith("--release="))?.slice("--release=".length);
const allJurisdictions = [
  "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA",
  "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS",
  "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function csvRecords(filePath) {
  const matrix = parseCsv(readFileSync(filePath, "utf8"));
  if (matrix.length === 0) return [];
  const header = matrix[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
  return matrix.slice(1).map((values) =>
    Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])),
  );
}

function sourceArtifact(filePath) {
  const bytes = readFileSync(filePath);
  return {
    path: filePath.replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function assertNonnegativeInteger(value, label) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${label} must be a nonnegative integer; received ${value}`);
  }
  return Number(value);
}

function historical2012Release() {
  const sourceFiles = readdirSync("data")
    .filter((fileName) => /^[a-z]{2}-historical-presidential-baseline\.csv$/.test(fileName))
    .map((fileName) => `data/${fileName}`)
    .filter((filePath) => csvRecords(filePath).some((row) => row.election_year === "2012"))
    .filter((filePath) => filePath !== "data/mo-historical-presidential-baseline.csv")
    .sort();
  sourceFiles.push("data/mo-historical-presidential-county-baseline.csv");
  sourceFiles.sort();
  const rows = [];

  for (const filePath of sourceFiles) {
    for (const row of csvRecords(filePath).filter((candidate) => candidate.election_year === "2012")) {
      const demVotes = assertNonnegativeInteger(row.dem_votes, `${filePath} ${row.jurisdiction_name} dem_votes`);
      const repVotes = assertNonnegativeInteger(row.rep_votes, `${filePath} ${row.jurisdiction_name} rep_votes`);
      const otherVotes = assertNonnegativeInteger(row.other_votes, `${filePath} ${row.jurisdiction_name} other_votes`);
      const totalVotes = assertNonnegativeInteger(row.total_votes, `${filePath} ${row.jurisdiction_name} total_votes`);
      if (demVotes + repVotes + otherVotes !== totalVotes) {
        throw new Error(`${filePath} ${row.jurisdiction_name} does not reconcile to total_votes`);
      }
      const jurisdictionTag = row.jurisdiction_tag ?? "";
      rows.push({
        canonical_comparison_eligible: /^county:\d{5}$/.test(jurisdictionTag) ? "true" : "false",
        dem_votes: String(demVotes),
        election_year: "2012",
        jurisdiction_name: row.jurisdiction_name,
        jurisdiction_tag: jurisdictionTag,
        local_unit: row.local_unit ?? row.county ?? row.jurisdiction_name,
        notes: row.notes ?? "",
        other_votes: String(otherVotes),
        rep_votes: String(repVotes),
        row_method: row.row_method,
        source_artifact_path: filePath,
        source_id: row.source_id,
        source_level: row.source_level,
        source_url: row.source_url,
        state: row.state,
        total_votes: String(totalVotes),
      });
    }
  }


  rows.sort((left, right) =>
    left.state.localeCompare(right.state)
    || left.jurisdiction_name.localeCompare(right.jurisdiction_name)
    || left.source_id.localeCompare(right.source_id)
  );

  const columns = [
    "state", "election_year", "jurisdiction_name", "jurisdiction_tag", "canonical_comparison_eligible",
    "local_unit", "source_level", "row_method", "dem_votes", "rep_votes", "other_votes", "total_votes",
    "source_id", "source_url", "source_artifact_path", "notes",
  ];
  const stateCodes = [...new Set(rows.map((row) => row.state))].sort();
  const secondarySourceStates = [...new Set(
    rows
      .filter((row) => /wikipedia/i.test(row.row_method) || /wikipedia\.org/i.test(row.source_url))
      .map((row) => row.state),
  )].sort();
  const coverage = {
    electionYear: 2012,
    rowCount: rows.length,
    statesRepresented: stateCodes.length,
    stateCodes,
    unavailableStateCodes: allJurisdictions.filter((state) => !stateCodes.includes(state)),
    canonicalCountyTaggedRows: rows.filter((row) => row.canonical_comparison_eligible === "true").length,
    untaggedOrNoncanonicalRows: rows.filter((row) => row.canonical_comparison_eligible !== "true").length,
    sourceFiles: sourceFiles.length,
    secondarySourceStates,
    coverageStatus: "partial",
  };
  const primaryDataEntry = "historical-presidential-2012.csv";
  const primary = toCsv([columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]);
  const dataDictionary = toCsv([
    ["field", "description"],
    ["state", "Two-letter state or District of Columbia code."],
    ["election_year", "Election year; fixed to 2012 in this release."],
    ["jurisdiction_name", "Source-aware display name for the reporting jurisdiction."],
    ["jurisdiction_tag", "Canonical county:<GEOID> tag when reviewed and available; otherwise blank."],
    ["canonical_comparison_eligible", "True only when jurisdiction_tag is a reviewed five-digit county GEOID."],
    ["local_unit", "Normalized local reporting-unit display name."],
    ["source_level", "Reporting grain described by the normalized source row."],
    ["row_method", "Parser or normalization method recorded by the state pipeline."],
    ["dem_votes", "Votes assigned to the Democratic presidential ticket."],
    ["rep_votes", "Votes assigned to the Republican presidential ticket."],
    ["other_votes", "Votes assigned to other presidential choices."],
    ["total_votes", "Reconciled presidential vote total for the row."],
    ["source_id", "Stable source identifier from the state ETL package."],
    ["source_url", "Public source URL retained by the state ETL package."],
    ["source_artifact_path", "Repository path of the normalized state baseline used for this row."],
    ["notes", "Source-specific notes retained where present."],
  ]);
  const readme = `# 2012 presidential historical baseline snapshot\n\n`
    + `This immutable CivicResultMaps release contains ${rows.length.toLocaleString("en-US")} normalized 2012 presidential baseline rows across ${stateCodes.length} states. It is a partial historical snapshot, not a complete national county comparison.\n\n`
    + `Only ${coverage.canonicalCountyTaggedRows.toLocaleString("en-US")} rows currently carry a reviewed canonical county GEOID. Rows without a canonical tag must not be used as if they were county-comparable. The source_url and row_method columns preserve the source and normalization caveat for each row; ${secondarySourceStates.length} states currently rely in whole or in part on explicitly identified secondary-source baselines.\n\n`
    + `This archive does not include 2012 precinct geometry and does not add 2012 to the live national comparison API. Missing states and untagged rows are data gaps, not zeroes.\n`;

  return {
    coverage,
    primaryDataEntry,
    entries: {
      [primaryDataEntry]: primary,
      "coverage.json": json(coverage),
      "data-dictionary.csv": dataDictionary,
      "source-artifacts.json": json(sourceFiles.map(sourceArtifact)),
      "README.md": readme,
    },
  };
}

function equipment2024Release() {
  const sourceFiles = readdirSync("data")
    .filter((fileName) => /^[a-z]{2}-2024-equipment-context\.csv$/.test(fileName))
    .map((fileName) => `data/${fileName}`)
    .sort();
  const matrices = sourceFiles.map((filePath) => ({ filePath, rows: csvRecords(filePath) }));
  const rows = matrices.flatMap(({ filePath, rows: fileRows }) => fileRows.map((row) => ({
    ...row,
    sourceArtifactPath: filePath,
  })));

  for (const row of rows) {
    if (!/^[A-Z]{2}$/.test(row.state) || row.electionYear !== "2024") {
      throw new Error(`Unexpected equipment row identity: ${row.state} ${row.electionYear}`);
    }
    for (const field of ["sourceDocumentId", "sourceUrl", "caveat"]) {
      if (!row[field]) throw new Error(`Equipment row ${row.state}/${row.jurisdictionCode} is missing ${field}`);
    }
  }

  rows.sort((left, right) =>
    left.state.localeCompare(right.state)
    || left.jurisdictionCode.localeCompare(right.jurisdictionCode)
    || left.jurisdictionName.localeCompare(right.jurisdictionName)
  );
  const sourceColumns = parseCsv(readFileSync(sourceFiles[0], "utf8"))[0];
  const columns = [...sourceColumns, "sourceArtifactPath"];
  const stateCodes = [...new Set(rows.map((row) => row.state))].sort();
  const coverage = {
    electionYear: 2024,
    rowCount: rows.length,
    statesRepresented: stateCodes.length,
    stateCodes,
    unavailableStateCodes: allJurisdictions.filter((state) => !stateCodes.includes(state)),
    countyRows: rows.filter((row) => row.level === "county").length,
    stateRows: rows.filter((row) => row.level === "state").length,
    rowsWithUniformityWarnings: rows.filter((row) => row.uniformityWarningRequired === "true").length,
    rowsMissingJurisdictionName: rows.filter((row) => !row.jurisdictionName).length,
    sourceFiles: sourceFiles.length,
    detailedDossierCatalogIncluded: false,
  };
  const primaryDataEntry = "equipment-context-2024.csv";
  const primary = toCsv([columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]);
  const descriptions = {
    state: "Two-letter state code.",
    electionYear: "Election year represented by the equipment context.",
    jurisdictionCode: "Source-aware jurisdiction identifier; not necessarily a Census GEOID.",
    jurisdictionName: "Jurisdiction display name.",
    level: "Reporting grain, usually county and occasionally state.",
    vendor: "Equipment vendor reported by the retained source.",
    systemName: "Normalized equipment-system description.",
    equipmentType: "High-level equipment category.",
    usage: "How the row is used by CivicResultMaps.",
    paperRecord: "Normalized paper-record context when reported.",
    standardSystem: "Standard polling-place system context from the source.",
    accessibleSystem: "Accessible voting-system context from the source.",
    absenteeSystem: "Absentee or mail-voting equipment context from the source.",
    pollBookSystem: "Poll-book context from the source.",
    tabulation: "Tabulation method context from the source.",
    registeredVoters: "Source-reported registered-voter context, when available.",
    precincts: "Source-reported precinct count, when available.",
    pollingPlaces: "Source-reported polling-place count, when available.",
    sourceGranularity: "Granularity of the retained source record.",
    uniformityWarningRequired: "True when a single row must not be treated as uniform across all precincts or modes.",
    uniformityNote: "Human-readable explanation of configuration differences or limits.",
    configurationSignals: "Delimited configuration differences detected during normalization.",
    sourceDocumentId: "Stable source identifier.",
    sourceUrl: "Public source URL.",
    caveat: "Interpretation and coverage caveat retained with the row.",
    sourceArtifactPath: "Repository path of the normalized state equipment file used for the row.",
  };
  const dataDictionary = toCsv([
    ["field", "description"],
    ...columns.map((column) => [column, descriptions[column] ?? "Source-preserved equipment context field."]),
  ]);
  const readme = `# 2024 election equipment context\n\n`
    + `This immutable CivicResultMaps release contains ${rows.length.toLocaleString("en-US")} normalized jurisdiction-level equipment-context rows across ${stateCodes.length} states. District of Columbia is not present in the retained source files.\n\n`
    + `The rows are source-linked election-administration context. They do not prove that every precinct, ballot mode, or fielded unit used one identical configuration. Review uniformityWarningRequired, uniformityNote, sourceUrl, and caveat before analysis.\n\n`
    + `The separate detailed equipment dossier catalog is not included because its editorial lifecycle remains outside this context release. This archive contains no credentials, network addresses, keys, or other operationally sensitive values.\n`;

  return {
    coverage,
    primaryDataEntry,
    entries: {
      [primaryDataEntry]: primary,
      "coverage.json": json(coverage),
      "data-dictionary.csv": dataDictionary,
      "source-artifacts.json": json(sourceFiles.map(sourceArtifact)),
      "README.md": readme,
    },
  };
}

function security2024Release() {
  const registryPath = "data/election-security-incidents-2024.json";
  const inventoryPath = "data/election-security-incident-source-inventory-2024.json";
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const rows = [...registry.incidentRows].sort((left, right) =>
    left.state.localeCompare(right.state)
    || left.eventDate.localeCompare(right.eventDate)
    || left.reportingGrain.localeCompare(right.reportingGrain)
    || left.id.localeCompare(right.id)
  );
  const columns = [
    "id", "state", "stateName", "electionYear", "county", "jurisdictionCode", "jurisdictionTag",
    "reportingGrain", "eventDate", "eventType", "eventTypeLabel", "threatCount", "threatCountBasis",
    "affectedLocations", "affectedLocationUnit", "namedLocations", "disruptionType", "disruptionLabel",
    "hoursExtended", "sourceAuthority", "sourceTitle", "sourcePublishedAt", "sourceUrl",
    "supportingSourceUrls", "localArtifact", "supportingLocalArtifacts", "normalizationPath", "sourceTier",
    "sourceStatus", "confidence", "caveat",
  ];
  const csv = toCsv([
    columns,
    ...rows.map((row) => columns.map((column) => {
      const value = row[column];
      if (Array.isArray(value)) return value.join(" | ");
      return value ?? "";
    })),
  ]);
  const localArtifacts = new Set([registryPath, inventoryPath]);
  for (const row of rows) {
    for (const value of [row.localArtifact, row.threatCountLocalArtifact, ...(row.supportingLocalArtifacts ?? [])]) {
      if (value) localArtifacts.add(value);
    }
  }
  for (const item of [...(inventory.nationalContext ?? []), ...(inventory.reviewedOfficialSources ?? [])]) {
    if (item.localArtifact) localArtifacts.add(item.localArtifact);
    for (const value of item.supportingLocalArtifacts ?? []) if (value) localArtifacts.add(value);
  }
  const retainedArtifacts = [...localArtifacts]
    .filter((filePath) => {
      try {
        return statSync(filePath).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  const coverage = {
    electionYear: registry.electionYear,
    rowCount: rows.length,
    statesRepresented: registry.expected.stateCount,
    countyRows: registry.expected.countyRowCount,
    statewideUnspecifiedRows: registry.expected.statewideUnspecifiedRowCount,
    statewideUnspecifiedThreatCount: registry.expected.statewideUnspecifiedThreatCount,
    knownThreatCountMinimum: registry.expected.knownThreatCountMinimum,
    nonBombThreatRows: registry.expected.nonBombThreatRowCount,
    officialRows: registry.expected.officialRowCount,
    trackerRows: registry.expected.trackerRowCount,
  };
  const primaryDataEntry = "security-incidents-2024.json";
  const primary = readFileSync(registryPath);
  const dataDictionary = toCsv([
    ["field", "description"],
    ["reportingGrain", "County or statewide_unspecified; statewide rows are never assigned to a county polygon."],
    ["threatCount", "Published count for the row, or blank when no separate count was published."],
    ["eventType", "Classified event type; non-bomb-threat events remain separate from bomb-threat totals."],
    ["sourceTier", "Source tier retained by the reviewed incident registry."],
    ["confidence", "Source and normalization confidence, not a claim about election outcomes."],
    ["caveat", "Row-specific interpretation and source limitation."],
  ]);
  const readme = `# November 2024 election security incident records\n\n`
    + `This immutable CivicResultMaps release contains ${rows.length} mixed-grain incident rows across ${coverage.statesRepresented} states. It preserves ${coverage.countyRows} county rows and ${coverage.statewideUnspecifiedRows} statewide-unspecified rows rather than manufacturing county assignments.\n\n`
    + `The documented minimum of ${coverage.knownThreatCountMinimum} bomb threats comes from the retained Brennan Center public-source tracker and is not an official FBI roster or an exhaustive national count. The separately classified non-bomb-threat row is not added to that total.\n\n`
    + `These records describe source-linked election-administration and public-safety context. They are not evidence of fraud, misconduct, altered votes, or an incorrect election outcome.\n`;

  return {
    coverage,
    primaryDataEntry,
    entries: {
      [primaryDataEntry]: primary,
      "security-incidents-2024.csv": csv,
      "source-inventory-2024.json": readFileSync(inventoryPath),
      "coverage.json": json(coverage),
      "data-dictionary.csv": dataDictionary,
      "source-artifacts.json": json(retainedArtifacts.map(sourceArtifact)),
      "README.md": readme,
    },
  };
}

const builders = {
  "historical-presidential-2012-v1": historical2012Release,
  "election-equipment-2024-v1": equipment2024Release,
  "election-security-2024-v1": security2024Release,
};

async function buildArchive(release, build) {
  const built = build();
  const primaryBytes = Buffer.isBuffer(built.entries[built.primaryDataEntry])
    ? built.entries[built.primaryDataEntry]
    : Buffer.from(built.entries[built.primaryDataEntry], "utf8");
  const dataSha256 = sha256(primaryBytes);
  const entryNames = Object.keys(built.entries).sort();

  if (metadataOnly) {
    return {
      releaseId: release.id,
      primaryDataEntry: built.primaryDataEntry,
      dataSha256,
      coverage: built.coverage,
      requiredEntries: [...entryNames, "manifest.json"].sort(),
    };
  }
  if (release.primaryDataEntry !== built.primaryDataEntry) {
    throw new Error(`${release.id} primaryDataEntry does not match its build recipe`);
  }
  if (release.dataSha256 !== dataSha256) {
    throw new Error(`${release.id} dataSha256 mismatch: expected ${release.dataSha256}, got ${dataSha256}`);
  }
  for (const requiredEntry of release.requiredEntries) {
    if (requiredEntry !== "manifest.json" && !(requiredEntry in built.entries)) {
      throw new Error(`${release.id} build recipe did not create ${requiredEntry}`);
    }
  }

  const manifestRelease = { ...release };
  delete manifestRelease.archiveSha256;
  const manifest = {
    ...manifestRelease,
    coverage: built.coverage,
    dataSha256,
    primaryDataEntry: built.primaryDataEntry,
    contents: entryNames.map((entryName) => {
      const value = built.entries[entryName];
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
      return { path: entryName, bytes: bytes.byteLength, sha256: sha256(bytes) };
    }),
  };
  built.entries["manifest.json"] = json(manifest);

  const zip = new JSZip();
  const archiveDate = new Date(release.publishedAt);
  for (const entryName of Object.keys(built.entries).sort()) {
    zip.file(entryName, built.entries[entryName], {
      createFolders: false,
      date: archiveDate,
    });
  }
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
  const archivePath = path.join("public", release.archivePath.replace(/^\/+/, ""));
  mkdirSync(path.dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, bytes);
  return {
    releaseId: release.id,
    archivePath,
    archiveBytes: bytes.byteLength,
    archiveSha256: sha256(bytes),
    dataSha256,
    coverage: built.coverage,
  };
}

const releases = catalog.releases.filter((release) =>
  release.buildRecipe
  && (!requestedReleaseId || release.id === requestedReleaseId),
);
if (requestedReleaseId && releases.length === 0) {
  throw new Error(`Unknown or non-buildable release: ${requestedReleaseId}`);
}

const results = [];
for (const release of releases) {
  const build = builders[release.buildRecipe];
  if (!build) throw new Error(`Unknown build recipe ${release.buildRecipe} for ${release.id}`);
  results.push(await buildArchive(release, build));
}
console.log(json(results));
