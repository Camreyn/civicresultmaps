import { createHash } from "node:crypto";

export const NEVADA_PRODUCTION_RELEASE_SCOPES = Object.freeze([
  "apply_migration_0009",
  "load_nv_precinct_results_and_geometry_hidden",
  "increment_public_data_revision",
]);
export const NEVADA_PRODUCTION_REPLACEMENT_SCOPE =
  "replace_reviewed_nv_precinct_release_v1_with_v2_hidden";
export const NEVADA_REVIEWED_V1_PUBLICATION = Object.freeze({
  releaseCandidate: Object.freeze({
    id: "nv-precinct-gis-three-election-v1",
    path: ".etl/precinct-release-candidates/NV/nv-precinct-gis-three-election-v1-0546735717fd/release-candidate.json",
    sha256: "0546735717fd46f501c23d931160fc45baf8f9b123f97faa5410bf684f951c9a",
  }),
  publicationReceiptSha256:
    "7725db704181321f8dca9717b6902387bcecbd424975a1b29e0e8e0aea43fc4e",
  publicationPlanSha256:
    "b13d531f79b0912e4e474c004f3891361af4c4d30fac29403530e4dc81c1f9e3",
  authorizationSha256:
    "f4ce5a05decb42c13df0e776a78e3e4705bc12c026396374580456b14f4ae73e",
  hiddenReceiptSha256:
    "1b43d799687c64d3780f5d98e96c9a29b13f84d85e9d8bf06cf1d0fd305f20a4",
  blobPublicationSha256:
    "b98dfccb93c43944e5799ffeff9d6263d35c110129b158ecb1f9726d312af4d6",
  deliveryOrigin: "https://ehnlruzhgkm5byoi.public.blob.vercel-storage.com",
  years: Object.freeze([
    Object.freeze({
      year: 2016,
      electionId: "2016-11-08-general",
      manifestId: "nv-2016-11-08-general-precinct-geometry-candidate-v1",
      manifestSha256:
        "9cccfd6f2fc006c2f3e98e45b1835178383edf092639f6a5dfc0f016a8316999",
      reportingUnits: 1_843,
      resultRows: 5_529,
      geometryFeatures: 2_067,
      reviewedExactCrosswalks: 1_843,
      zeroVoteUnits: 206,
      candidateTotals: Object.freeze({
        "Donald Trump": 510_920,
        "Hillary Clinton": 537_405,
        Other: 73_891,
      }),
    }),
    Object.freeze({
      year: 2020,
      electionId: "2020-11-03-general",
      manifestId: "nv-2020-11-03-general-precinct-geometry-candidate-v1",
      manifestSha256:
        "b343123b91646f991406775fc9bb02846455564d08265ecd2240a3db759ea4e4",
      reportingUnits: 1_869,
      resultRows: 5_607,
      geometryFeatures: 2_094,
      reviewedExactCrosswalks: 1_869,
      zeroVoteUnits: 207,
      candidateTotals: Object.freeze({
        "Donald Trump": 669_458,
        "Joe Biden": 703_213,
        Other: 31_986,
      }),
    }),
    Object.freeze({
      year: 2024,
      electionId: "2024-11-05-general",
      manifestId: "nv-2024-11-05-general-precinct-geometry-candidate-v1",
      manifestSha256:
        "e543af3d6e31d2175c07d24f9de664692af22bb813bb9ddbd2c705c0186dff1b",
      reportingUnits: 1_518,
      resultRows: 4_554,
      geometryFeatures: 1_726,
      reviewedExactCrosswalks: 1_518,
      zeroVoteUnits: 234,
      candidateTotals: Object.freeze({
        "Donald Trump": 750_923,
        "Kamala Harris": 705_028,
        Other: 28_431,
      }),
    }),
  ]),
  postconditions: Object.freeze({
    geographyVersions: 3,
    crosswalks: 5_230,
    reportingUnits: 5_230,
    sourceDocuments: 6,
    importRuns: 3,
    resultRows: 15_690,
    invalidConstraints: 0,
  }),
});
export const NEVADA_MAX_RELEASE_EVIDENCE_AGE_MS = 4 * 60 * 60 * 1000;

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

export function validateNevadaReviewedReplacementPublicationReceipt(
  value,
  context,
) {
  const reviewed = NEVADA_REVIEWED_V1_PUBLICATION;
  if (
    context?.publicationReceiptSha256 !== reviewed.publicationReceiptSha256
    || !validArtifact(
      { path: context?.publicationReceiptPath, sha256: context?.publicationReceiptSha256 },
      ".etl/production-publication-receipts/NV/",
    )
    || value?.schemaVersion !== 1
    || value?.state !== "NV"
    || value?.decision !== "PUBLISHED"
    || value?.productionMutationPerformed !== true
    || value?.publicDeliveryAuthorized !== true
    || !semanticallyEqual(value?.releaseCandidate, reviewed.releaseCandidate)
    || value?.publicationPlan?.sha256 !== reviewed.publicationPlanSha256
    || value?.authorization?.sha256 !== reviewed.authorizationSha256
    || value?.hiddenLoad?.sha256 !== reviewed.hiddenReceiptSha256
    || value?.blobPublication?.sha256 !== reviewed.blobPublicationSha256
    || value?.blobPublication?.deliveryOrigin !== reviewed.deliveryOrigin
    || !validArtifact(value?.authorization, ".etl/production-authorizations/NV/")
    || !validArtifact(value?.hiddenLoad, ".etl/production-release-receipts/NV/")
    || !validArtifact(value?.blobPublication, ".etl/precinct-blob-publications/NV/")
    || typeof value?.activationId !== "string"
    || !value.activationId.trim()
    || !validIso(value?.changedAtUtc)
    || Date.parse(value.changedAtUtc) > context.now.getTime()
    || !Number.isInteger(Number(value?.revision))
    || Number(value.revision) < 1
    || !semanticallyEqual(value?.postconditions, reviewed.postconditions)
    || value?.productionDeployment?.readyVerified !== true
    || value?.productionDeployment?.promotedVerified !== true
    || value?.productionDeployment?.blockedResultGateVerified !== true
    || value?.productionDeployment?.blockedGeometryGateVerified !== true
  ) {
    throw new Error(
      "Nevada reviewed v1 publication receipt is incomplete, altered, or incompatible",
    );
  }
  return {
    publicationReceipt: {
      path: context.publicationReceiptPath,
      sha256: context.publicationReceiptSha256,
    },
    releaseCandidate: { ...reviewed.releaseCandidate },
    activationId: value.activationId.trim(),
    changedAtUtc: value.changedAtUtc,
    revision: Number(value.revision),
  };
}

export function validateNevadaProductionReplacementSummary(value) {
  const reviewed = NEVADA_REVIEWED_V1_PUBLICATION;
  if (
    !value
    || !semanticallyEqual(value?.releaseCandidate, reviewed.releaseCandidate)
    || value?.publicationReceipt?.sha256 !== reviewed.publicationReceiptSha256
    || !validArtifact(
      value?.publicationReceipt,
      ".etl/production-publication-receipts/NV/",
    )
    || typeof value?.activationId !== "string"
    || !value.activationId.trim()
    || !validIso(value?.changedAtUtc)
    || !Number.isInteger(Number(value?.revision))
    || Number(value.revision) < 1
    || Object.keys(value).sort().join(",")
      !== "activationId,changedAtUtc,publicationReceipt,releaseCandidate,revision"
  ) {
    throw new Error("Nevada production replacement summary drifted");
  }
  return {
    publicationReceipt: { ...value.publicationReceipt },
    releaseCandidate: { ...value.releaseCandidate },
    activationId: value.activationId.trim(),
    changedAtUtc: value.changedAtUtc,
    revision: Number(value.revision),
  };
}

function expectedScopes(replacement) {
  return replacement
    ? [...NEVADA_PRODUCTION_RELEASE_SCOPES, NEVADA_PRODUCTION_REPLACEMENT_SCOPE]
    : [...NEVADA_PRODUCTION_RELEASE_SCOPES];
}

export function buildNevadaProductionAuthorizationTemplate(context) {
  const replacement = context.replacement
    ? validateNevadaProductionReplacementSummary(context.replacement)
    : null;
  return {
    schemaVersion: 1,
    state: "NV",
    decision: replacement ? "NO_GO_PRODUCTION_UPGRADE" : "NO_GO_PRODUCTION",
    authorizationId: null,
    releaseCandidate: {
      id: context.releaseCandidate.id,
      sha256: context.releaseCandidate.sha256,
    },
    evidence: {
      preflightSha256: context.preflightSha256 ?? null,
      backupManifestSha256: context.backupManifestSha256 ?? null,
    },
    replacement,
    approvedBy: null,
    authorizedAtUtc: null,
    expiresAtUtc: null,
    scopes: expectedScopes(replacement),
    acknowledgement:
      replacement
        ? "This template is not authorization. GO_PRODUCTION_UPGRADE authorizes only the exact reviewed Nevada v1-to-v2 hidden replacement and one public revision increment; public geometry and result visibility remain blocked."
        : "This template is not authorization. GO_PRODUCTION authorizes only the hidden Nevada load and one public revision increment; public geometry and result visibility remain blocked.",
  };
}

export function validateNevadaProductionPreflightEvidence(report, context) {
  const targetYears = [2016, 2020, 2024];
  const precinctYearRows = report?.nevada?.precinctYearRows;
  const coreYearRows = report?.nevada?.coreYearRows;
  const replacement = context.replacement
    ? validateNevadaProductionReplacementSummary(context.replacement)
    : null;
  const expectedYearRows = replacement
    ? NEVADA_REVIEWED_V1_PUBLICATION.years
    : targetYears.map((year) => ({
      year,
      reportingUnits: 0,
      resultRows: 0,
      geometryFeatures: 0,
      reviewedExactCrosswalks: 0,
    }));
  if (
    report?.schemaVersion !== 1
    || report?.state !== "NV"
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
    || !Array.isArray(precinctYearRows)
    || !Array.isArray(coreYearRows)
    || JSON.stringify(precinctYearRows.map((row) => Number(row.year)))
      !== JSON.stringify(targetYears)
    || precinctYearRows.some((row, index) => {
      const expected = expectedYearRows[index];
      return Number(row.reportingUnits) !== expected.reportingUnits
        || Number(row.linkedPrecinctResultRows) !== expected.resultRows
        || Number(row.geographyVersions) !== (replacement ? 1 : 0)
        || Number(row.geometryFeatures) !== expected.geometryFeatures
        || Number(row.reviewedExactCrosswalks) !== expected.reviewedExactCrosswalks;
    })
    || coreYearRows.some((row) => {
      const index = targetYears.indexOf(Number(row.year));
      return index >= 0
        && Number(row.precinctResultRows) !== expectedYearRows[index].resultRows;
    })
  ) {
    throw new Error(
      "Nevada production preflight evidence is incompatible or already contains precinct release rows",
    );
  }
  const age = context.now.getTime() - Date.parse(report.capturedAtUtc);
  if (age < 0 || age > NEVADA_MAX_RELEASE_EVIDENCE_AGE_MS) {
    throw new Error("Nevada production preflight is outside the four-hour release window");
  }
  if (typeof report.database.name !== "string" || !report.database.name.trim()) {
    throw new Error("Nevada production preflight database name is missing");
  }
  return {
    databaseName: report.database.name.trim(),
    capturedAtUtc: report.capturedAtUtc,
    publicRevision: Number(report.publicRevision),
    releaseMode: replacement ? "reviewed_v1_to_v2_replacement" : "initial_hidden_load",
  };
}

export function validateNevadaProductionBackupEvidence(manifest, context) {
  const restore = manifest?.restoreVerification;
  if (
    !Number.isInteger(manifest?.manifestVersion)
    || manifest.manifestVersion < 3
    || manifest?.backupPurpose !== "nv-precinct-production-release-rollback"
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
    throw new Error("Nevada production backup evidence is incomplete or incompatible");
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
    || now - created > NEVADA_MAX_RELEASE_EVIDENCE_AGE_MS
    || now - restored < 0
    || now - restored > NEVADA_MAX_RELEASE_EVIDENCE_AGE_MS
  ) {
    throw new Error("Nevada backup must follow the fresh preflight and restore within four hours");
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
    throw new Error("Nevada production backup exact table or row-count proof drifted");
  }
  return {
    dumpSha256: manifest.dumpSha256,
    createdAtUtc: manifest.createdAtUtc,
    restoredAtUtc: restore.verifiedAtUtc,
    sourcePublicTableCount: sourceTableCount,
  };
}

export function validateNevadaProductionAuthorization(value, context) {
  const replacement = context.replacement
    ? validateNevadaProductionReplacementSummary(context.replacement)
    : null;
  if (
    value?.schemaVersion !== 1
    || value?.state !== "NV"
    || value?.decision !== (replacement ? "GO_PRODUCTION_UPGRADE" : "GO_PRODUCTION")
    || typeof value?.authorizationId !== "string"
    || !value.authorizationId.trim()
    || value?.releaseCandidate?.id !== context.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || value?.evidence?.preflightSha256 !== context.preflightSha256
    || value?.evidence?.backupManifestSha256 !== context.backupManifestSha256
    || !validIso(value?.authorizedAtUtc)
    || !validIso(value?.expiresAtUtc)
    || !normalizeIdentity(value?.approvedBy)
    || !semanticallyEqual(value?.replacement ?? null, replacement)
    || !Array.isArray(value?.scopes)
    || !semanticallyEqual(value.scopes, expectedScopes(replacement))
  ) {
    throw new Error("Nevada production authorization is incomplete or incompatible");
  }
  const authorized = Date.parse(value.authorizedAtUtc);
  const expires = Date.parse(value.expiresAtUtc);
  const now = context.now.getTime();
  if (authorized > now || expires <= now || expires <= authorized) {
    throw new Error("Nevada production authorization is not active");
  }
  return {
    authorizationId: value.authorizationId.trim(),
    approvedBy: value.approvedBy.trim(),
    authorizedAtUtc: value.authorizedAtUtc,
    expiresAtUtc: value.expiresAtUtc,
    replacement,
  };
}
