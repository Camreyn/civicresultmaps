import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

export const MINNESOTA_2012_TURNOUT_SOURCE = Object.freeze({
  id: "mn-2012-turnout-registration",
  authority: "Minnesota Secretary of State Elections Division",
  url: "https://sos.mn.gov/media/1450/2012mngeneralelectionresults_official_postrecounts.xlsx",
  artifact: "data/precinct-geometry/MN/2012-11-06-general/raw/mn-sos/2012-general-federal-state-results-by-precinct-official-post-recounts.xlsx",
  sha256: "9a7530cfef9e44f8663c62bf5786418b4b078d81fd13e2d130fbd8ef305ee376",
  byteCount: 1_705_946,
  sheetName: "Results",
  timestampBasis: "Certified by the State Canvassing Board November 27, 2012, with recount districts certified December 4, 2012.",
});

export const MINNESOTA_2012_TURNOUT_EXPECTED = Object.freeze({
  rows: 4_102,
  parentCount: 87,
  registeredVotersPreElection: 3_084_025,
  electionDayRegistrations: 527_867,
  registeredVoters: 3_611_892,
  ballotsCast: 2_950_780,
  warningRows: 20,
  turnoutPct: 81.6962,
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absoluteInsideRoot(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error("Minnesota 2012 turnout source path must be repository-relative POSIX");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Minnesota 2012 turnout source path escapes its source root");
  }
  return resolved;
}

function nonnegativeInteger(value, field, sourceUnitId) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(
      "Minnesota 2012 " + sourceUnitId + " is missing required turnout field " + field,
    );
  }
  const number = Number(String(value).replaceAll(",", "").trim());
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      "Minnesota 2012 " + sourceUnitId + " has invalid turnout field " + field,
    );
  }
  return number;
}

function sourceDisplayName(row) {
  const precinctCode = String(row.PCTCODE ?? "").trim().padStart(4, "0");
  return [row.COUNTYNAME, row.MCDNAME, String(row.PCTNAME ?? "") + " (" + precinctCode + ")"]
    .map((value) => String(value ?? "").trim())
    .join(" / ");
}

export function minnesota2012TurnoutFields(row, sourceUnitId = "fixture") {
  if (!Object.hasOwn(row, "7AM")) {
    throw new Error(
      "Minnesota 2012 " + sourceUnitId + " is missing required turnout field 7AM",
    );
  }
  const registeredVotersPreElection = nonnegativeInteger(
    row["7AM"],
    "7AM",
    sourceUnitId,
  );
  const electionDayRegistrations = nonnegativeInteger(
    row.EDR,
    "EDR",
    sourceUnitId,
  );
  const ballotsCast = nonnegativeInteger(
    row.TOTVOTING,
    "TOTVOTING",
    sourceUnitId,
  );
  const registeredVoters =
    registeredVotersPreElection + electionDayRegistrations;
  return {
    registeredVotersPreElection,
    electionDayRegistrations,
    registeredVoters,
    ballotsCast,
    turnoutPct: registeredVoters > 0
      ? Number(((ballotsCast / registeredVoters) * 100).toFixed(4))
      : null,
    warningRequired: ballotsCast > registeredVoters,
  };
}

export function parseMinnesota2012TurnoutRows(
  sourceRows,
  expected = MINNESOTA_2012_TURNOUT_EXPECTED,
) {
  const rows = sourceRows
    .filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "").trim()))
    .sort((left, right) =>
      String(left.VTDID).localeCompare(String(right.VTDID), "en-US", {
        numeric: true,
      }));
  if (rows.length !== expected.rows) {
    throw new Error(
      "Minnesota 2012 turnout VTDID count drifted: expected "
        + expected.rows
        + ", found "
        + rows.length,
    );
  }

  const seen = new Set();
  const parents = new Set();
  const totals = {
    rows: 0,
    registeredVotersPreElection: 0,
    electionDayRegistrations: 0,
    registeredVoters: 0,
    ballotsCast: 0,
    warningRows: 0,
  };
  const turnoutRows = [];

  for (const row of rows) {
    const sourceUnitId = String(row.VTDID).trim();
    if (seen.has(sourceUnitId)) {
      throw new Error("Duplicate Minnesota 2012 VTDID " + sourceUnitId);
    }
    seen.add(sourceUnitId);
    const parentGeoid = sourceUnitId.slice(0, 5);
    if (!/^27\d{3}$/.test(parentGeoid)) {
      throw new Error("Minnesota 2012 VTDID has invalid county parent " + sourceUnitId);
    }
    parents.add(parentGeoid);
    const county = String(row.COUNTYNAME ?? "").trim();
    if (!county) {
      throw new Error("Minnesota 2012 VTDID is missing COUNTYNAME " + sourceUnitId);
    }
    const displayName = sourceDisplayName(row);
    const fields = minnesota2012TurnoutFields(row, sourceUnitId);
    const code = reportingUnitCode({
      state: "MN",
      electionId: "2012-11-06-general",
      reportingGrain: "precinct",
      parentGeoid,
      sourceUnitId,
    });
    const denominatorNote =
      "Registered-voter denominator is 7AM pre-election registration ("
      + fields.registeredVotersPreElection
      + ") plus EDR election-day registrations ("
      + fields.electionDayRegistrations
      + "); ballots cast are TOTVOTING.";
    turnoutRows.push({
      county,
      localUnit: displayName,
      level: "precinct",
      ballotsCast: fields.ballotsCast,
      registeredVoters: fields.registeredVoters,
      registeredVotersPreElection: fields.registeredVotersPreElection,
      electionDayRegistrations: fields.electionDayRegistrations,
      turnoutPct: fields.turnoutPct,
      denominatorType: "registeredVotersPlusElectionDayRegistrations",
      registrationDenominatorTiming: denominatorNote,
      warningRequired: fields.warningRequired,
      sourceId: MINNESOTA_2012_TURNOUT_SOURCE.id,
      reportingUnit: {
        sourceUnitId,
        sourceDisplayName: displayName,
        reportingGrain: "precinct",
        parentGeoid,
        isGeographic: true,
      },
      jurisdictionCode: code,
      jurisdictionTag: "county:" + parentGeoid,
    });
    totals.rows += 1;
    totals.registeredVotersPreElection += fields.registeredVotersPreElection;
    totals.electionDayRegistrations += fields.electionDayRegistrations;
    totals.registeredVoters += fields.registeredVoters;
    totals.ballotsCast += fields.ballotsCast;
    totals.warningRows += fields.warningRequired ? 1 : 0;
  }

  if (parents.size !== expected.parentCount) {
    throw new Error(
      "Minnesota 2012 turnout county-parent count drifted: expected "
        + expected.parentCount
        + ", found "
        + parents.size,
    );
  }
  for (const field of [
    "rows",
    "registeredVotersPreElection",
    "electionDayRegistrations",
    "registeredVoters",
    "ballotsCast",
    "warningRows",
  ]) {
    if (totals[field] !== expected[field]) {
      throw new Error(
        "Minnesota 2012 turnout "
          + field
          + " drifted: expected "
          + expected[field]
          + ", found "
          + totals[field],
      );
    }
  }
  const turnoutPct = Number(
    ((totals.ballotsCast / totals.registeredVoters) * 100).toFixed(4),
  );
  if (turnoutPct !== expected.turnoutPct) {
    throw new Error(
      "Minnesota 2012 statewide turnout percentage drifted: expected "
        + expected.turnoutPct
        + ", found "
        + turnoutPct,
    );
  }
  return {
    rows: turnoutRows,
    totals: { ...totals, turnoutPct },
    parentCount: parents.size,
  };
}

export function buildMinnesota2012TurnoutArtifact(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot ?? process.cwd());
  const sourcePath = absoluteInsideRoot(
    sourceRoot,
    MINNESOTA_2012_TURNOUT_SOURCE.artifact,
  );
  if (!existsSync(sourcePath)) {
    throw new Error("Minnesota 2012 official turnout workbook is missing");
  }
  const bytes = readFileSync(sourcePath);
  if (bytes.length !== MINNESOTA_2012_TURNOUT_SOURCE.byteCount) {
    throw new Error("Minnesota 2012 official turnout workbook byte count drifted");
  }
  const digest = sha256(bytes);
  if (digest !== MINNESOTA_2012_TURNOUT_SOURCE.sha256) {
    throw new Error("Minnesota 2012 official turnout workbook SHA-256 drifted");
  }
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets[MINNESOTA_2012_TURNOUT_SOURCE.sheetName];
  if (!sheet) {
    throw new Error("Minnesota 2012 official turnout workbook Results sheet is missing");
  }
  const sourceRows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });
  const parsed = parseMinnesota2012TurnoutRows(sourceRows);
  const metrics = {
    state: "MN",
    year: 2012,
    sourceRows: sourceRows.length,
    nativeTurnoutRows: parsed.rows.length,
    nativeRegisteredVotersPreElection:
      parsed.totals.registeredVotersPreElection,
    nativeElectionDayRegistrations:
      parsed.totals.electionDayRegistrations,
    nativeRegisteredVoters: parsed.totals.registeredVoters,
    nativeBallotsCast: parsed.totals.ballotsCast,
    nativeTurnoutPct: parsed.totals.turnoutPct,
    nativeTurnoutWarningRows: parsed.totals.warningRows,
    nativeCountyParents: parsed.parentCount,
    registrationField: "7AM",
    electionDayRegistrationField: "EDR",
    ballotsCastField: "TOTVOTING",
  };
  return {
    schemaVersion: 1,
    state: {
      code: "MN",
      name: "Minnesota",
      authority: MINNESOTA_2012_TURNOUT_SOURCE.authority,
    },
    election: {
      id: "2012-11-06-general",
      year: 2012,
      date: "2012-11-06",
      type: "general",
      office: "president",
    },
    sources: [{
      id: MINNESOTA_2012_TURNOUT_SOURCE.id,
      category: "Official 2012 precinct turnout and registration",
      sourceUrl: MINNESOTA_2012_TURNOUT_SOURCE.url,
      localArtifact: MINNESOTA_2012_TURNOUT_SOURCE.artifact,
      parser: "minnesota2012PrecinctTurnoutXlsx",
      authority: MINNESOTA_2012_TURNOUT_SOURCE.authority,
      timestampBasis: MINNESOTA_2012_TURNOUT_SOURCE.timestampBasis,
      confidence:
        "Official certified/recount-inclusive Minnesota SOS precinct workbook; registration denominator is 7AM plus EDR and ballots cast are TOTVOTING.",
      status: "loaded",
      metadata: {
        electionYear: 2012,
        sha256: digest,
        byteCount: bytes.length,
        sheetName: MINNESOTA_2012_TURNOUT_SOURCE.sheetName,
        registrationField: "7AM",
        electionDayRegistrationField: "EDR",
        ballotsCastField: "TOTVOTING",
        statewide: parsed.totals,
      },
    }],
    capabilities: {
      certifiedResults: false,
      map: false,
      reviewGraphs: false,
      turnout: true,
      historicalBaseline: false,
      sourcePlanner: true,
    },
    validation: {
      passed: true,
      errors: [],
      warnings: [
        "Twenty official precinct rows report TOTVOTING above 7AM plus EDR; source values are retained and warningRequired is true for those rows.",
      ],
      metrics,
    },
    promotion: {
      productionWriteAllowed: false,
      requiresHumanReview: true,
      status: "staged",
    },
    native: {
      parser: "minnesota2012PrecinctTurnoutXlsx",
      resultRows: [],
      reviewRows: [],
      turnoutRows: parsed.rows,
      historicalRows: [],
      historicalReviewRows: [],
      metrics,
    },
  };
}

export function serializeMinnesota2012TurnoutArtifact(artifact) {
  return Buffer.from(JSON.stringify(artifact, null, 2) + "\n", "utf8");
}

export function summarizeMinnesota2012TurnoutArtifact(artifact, bytes) {
  return {
    ok: artifact.validation.passed,
    state: artifact.state.code,
    year: artifact.election.year,
    sourceSha256: artifact.sources[0].metadata.sha256,
    artifactSha256: sha256(bytes),
    artifactByteCount: bytes.length,
    metrics: artifact.validation.metrics,
    warnings: artifact.validation.warnings,
    productionWriteAllowed: artifact.promotion.productionWriteAllowed,
  };
}
