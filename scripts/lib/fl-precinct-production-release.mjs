import { createHash } from "node:crypto";

export const FLORIDA_PRODUCTION_RELEASE_SCOPES = Object.freeze([
  "apply_migration_0009",
  "load_fl_precinct_results_and_geometry_hidden",
  "increment_public_data_revision",
]);
export const FLORIDA_MAX_RELEASE_EVIDENCE_AGE_MS = 4 * 60 * 60 * 1000;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeIdentity(value) {
  return typeof value === "string"
    ? value.trim().normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
    : "";
}

function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, semantic(value[key])]),
  );
}

function semanticallyEqual(left, right) {
  return JSON.stringify(semantic(left)) === JSON.stringify(semantic(right));
}

function validArtifact(value, prefix) {
  return typeof value?.path === "string"
    && value.path.startsWith(prefix)
    && !value.path.includes("\\")
    && !value.path.split("/").includes("..")
    && /^[a-f0-9]{64}$/.test(value?.sha256 ?? "");
}

function expectedScopes() {
  return [...FLORIDA_PRODUCTION_RELEASE_SCOPES];
}

export function buildFloridaProductionAuthorizationTemplate(context) {
  return {
    schemaVersion: 1,
    state: "FL",
    decision: "NO_GO_PRODUCTION",
    authorizationId: null,
    releaseCandidate: {
      id: context.releaseCandidate.id,
      sha256: context.releaseCandidate.sha256,
    },
    evidence: {
      preflightSha256: context.preflightSha256 ?? null,
      backupManifestSha256: context.backupManifestSha256 ?? null,
    },
    approvedBy: null,
    authorizedAtUtc: null,
    expiresAtUtc: null,
    scopes: expectedScopes(),
    acknowledgement:
      "This template is not authorization. GO_PRODUCTION authorizes only migration 0009, the hidden Florida load, and one public revision increment; public geometry and result visibility remain blocked.",
  };
}

export function validateFloridaProductionPreflightEvidence(report, context) {
  const targetYears = [2016, 2020, 2024];
  const localYearRows = report?.florida?.localYearRows;
  const coreYearRows = report?.florida?.coreYearRows;
  const expectedYearRows = targetYears.map((year) => ({
      year,
      reportingUnits: 0,
      resultRows: 0,
      geometryFeatures: 0,
      reviewedRelationships: 0,
    }));
  if (
    report?.schemaVersion !== 1
    || report?.state !== "FL"
    || report?.productionMutationPerformed !== false
    || report?.database?.transactionReadOnly !== true
    || report?.invalidConstraints !== 0
    || report?.migration0008?.status !== "complete"
    || !["absent", "complete"].includes(report?.migration0009?.status)
    || report?.releaseCandidate?.id !== context.releaseCandidate.id
    || report?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || report?.endpointFingerprint !== context.endpointFingerprint
    || !/^[a-f0-9]{64}$/.test(report?.endpointFingerprint ?? "")
    || !Number.isInteger(Number(report?.publicRevision))
    || Number(report.publicRevision) < 1
    || !validIso(report?.capturedAtUtc)
    || !Array.isArray(localYearRows)
    || !Array.isArray(coreYearRows)
    || JSON.stringify(localYearRows.map((row) => Number(row.year)))
      !== JSON.stringify(targetYears)
    || localYearRows.some((row, index) => {
      const expected = expectedYearRows[index];
      return Number(row.reportingUnits) !== expected.reportingUnits
        || Number(row.linkedLocalResultRows) !== expected.resultRows
        || Number(row.geographyVersions) !== 0
        || Number(row.geometryFeatures) !== expected.geometryFeatures
        || Number(row.reviewedRelationships) !== expected.reviewedRelationships;
    })
    || coreYearRows.some((row) => {
      const index = targetYears.indexOf(Number(row.year));
      return index >= 0
        && Number(row.localResultRows) !== expectedYearRows[index].resultRows;
    })
  ) {
    throw new Error(
      "Florida production preflight evidence is incompatible or already contains precinct release rows",
    );
  }
  const age = context.now.getTime() - Date.parse(report.capturedAtUtc);
  if (age < 0 || age > FLORIDA_MAX_RELEASE_EVIDENCE_AGE_MS) {
    throw new Error("Florida production preflight is outside the four-hour release window");
  }
  if (typeof report.database.name !== "string" || !report.database.name.trim()) {
    throw new Error("Florida production preflight database name is missing");
  }
  return {
    databaseName: report.database.name.trim(),
    capturedAtUtc: report.capturedAtUtc,
    publicRevision: Number(report.publicRevision),
    releaseMode: "initial_hidden_load",
  };
}

export function validateFloridaProductionBackupEvidence(manifest, context) {
  const restore = manifest?.restoreVerification;
  if (
    !Number.isInteger(manifest?.manifestVersion)
    || manifest.manifestVersion < 3
    || manifest?.backupPurpose !== "fl-precinct-production-release-rollback"
    || manifest?.releaseCandidate?.id !== context.releaseCandidate.id
    || manifest?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || manifest?.sourceEndpointFingerprint !== context.endpointFingerprint
    || !/^[a-f0-9]{64}$/.test(manifest?.dumpSha256 ?? "")
    || manifest?.dumpFormat !== "custom"
    || Number(manifest?.pgClientMajor) !== 17
    || Math.trunc(Number(manifest?.sourceServerVersionNum) / 10_000) !== 17
    || JSON.stringify(manifest?.includedSchemas) !== JSON.stringify(["public"])
    || !Array.isArray(manifest?.excludedTableDataPatterns)
    || manifest.excludedTableDataPatterns.length !== 0
    || manifest?.remoteMutationPerformed !== false
    || Number(manifest?.sourceInvalidConstraints) !== 0
    || restore?.verified !== true
    || restore?.defaultTransactionReadOnly !== true
    || restore?.exactSourceTableSet !== true
    || restore?.exactSourceRowCounts !== true
    || Number(restore?.invalidConstraints) !== 0
    || !validIso(manifest?.createdAtUtc)
    || !validIso(restore?.verifiedAtUtc)
  ) {
    throw new Error("Florida production backup evidence is incomplete or incompatible");
  }
  const created = Date.parse(manifest.createdAtUtc);
  const restored = Date.parse(restore.verifiedAtUtc);
  const preflight = Date.parse(context.preflightCapturedAtUtc);
  const now = context.now.getTime();
  if (
    Number.isNaN(preflight)
    || created <= preflight
    || restored < created
    || now - created < 0
    || now - created > FLORIDA_MAX_RELEASE_EVIDENCE_AGE_MS
    || now - restored < 0
    || now - restored > FLORIDA_MAX_RELEASE_EVIDENCE_AGE_MS
  ) {
    throw new Error("Florida backup must follow the fresh preflight and restore within four hours");
  }
  const sourceCounts = manifest.sourcePublicTableRowCounts;
  const restoredCounts = restore.publicTableRowCounts;
  const sourceTableCount = Number(manifest.sourcePublicTableCount);
  if (
    !sourceCounts
    || !restoredCounts
    || typeof sourceCounts !== "object"
    || typeof restoredCounts !== "object"
    || Array.isArray(sourceCounts)
    || Array.isArray(restoredCounts)
    || sourceTableCount !== Number(restore.publicTableCount)
    || sourceTableCount !== Number(restore.tableDataEntryCount)
    || Object.keys(sourceCounts).length !== sourceTableCount
    || Object.keys(restoredCounts).length !== sourceTableCount
    || !semanticallyEqual(sourceCounts, restoredCounts)
  ) {
    throw new Error("Florida production backup exact table or row-count proof drifted");
  }
  return {
    dumpSha256: manifest.dumpSha256,
    createdAtUtc: manifest.createdAtUtc,
    restoredAtUtc: restore.verifiedAtUtc,
    sourcePublicTableCount: sourceTableCount,
  };
}

export function validateFloridaProductionAuthorization(value, context) {
  if (
    value?.schemaVersion !== 1
    || value?.state !== "FL"
    || value?.decision !== "GO_PRODUCTION"
    || typeof value?.authorizationId !== "string"
    || !value.authorizationId.trim()
    || value?.releaseCandidate?.id !== context.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || value?.evidence?.preflightSha256 !== context.preflightSha256
    || value?.evidence?.backupManifestSha256 !== context.backupManifestSha256
    || !validIso(value?.authorizedAtUtc)
    || !validIso(value?.expiresAtUtc)
    || !normalizeIdentity(value?.approvedBy)
    || value?.replacement !== undefined
    || !Array.isArray(value?.scopes)
    || !semanticallyEqual(value.scopes, expectedScopes())
  ) {
    throw new Error("Florida production authorization is incomplete or incompatible");
  }
  const authorized = Date.parse(value.authorizedAtUtc);
  const expires = Date.parse(value.expiresAtUtc);
  const now = context.now.getTime();
  if (authorized > now || expires <= now || expires <= authorized) {
    throw new Error("Florida production authorization is not active");
  }
  return {
    authorizationId: value.authorizationId.trim(),
    approvedBy: value.approvedBy.trim(),
    authorizedAtUtc: value.authorizedAtUtc,
    expiresAtUtc: value.expiresAtUtc,
  };
}
