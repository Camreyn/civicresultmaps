import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  inspectReleaseArtifact,
} from "./lib/mn-precinct-release-candidate.mjs";
import {
  buildMinnesotaPrecinctGisPlan,
} from "./lib/mn-precinct-gis-plan.mjs";
import {
  readMinnesotaPersistedProductionReleaseAudit,
  validateMinnesotaPrecinctGisClient,
} from "./lib/mn-precinct-gis-db.mjs";
import {
  productionEndpointFingerprint,
  sha256,
} from "./lib/mn-precinct-production-preflight.mjs";
import {
  applyMinnesotaProductionReleaseTransaction,
  buildMinnesotaOwnerConfirmationTemplate,
  buildMinnesotaProductionAuthorizationTemplate,
  readAndVerifyEvidenceFile,
  validateMinnesotaProductionAuthorization,
  validateMinnesotaProductionBackupEvidence,
  validateMinnesotaProductionPreflightEvidence,
  validateMinnesotaProductionReviewEvidence,
} from "./lib/mn-precinct-production-release.mjs";

// Never load .env.local. A production database write requires an exact package
// hash, a second authorization-ID acknowledgement, and fresh hash-pinned
// preflight and backup evidence.

function parseArguments(args) {
  const value = (name) => args.find((arg) => arg.startsWith(name + "="))
    ?.slice(name.length + 1);
  const knownValues = new Set([
    "--package",
    "--preflight",
    "--backup-manifest",
    "--authorization",
    "--authorization-sha256",
    "--confirmation",
    "--overlay",
    "--review",
    "--receipt",
  ]);
  const flags = new Set([
    "--apply",
    "--recover-receipt",
    "--write-authorization-template",
    "--write-confirmation-template",
  ]);
  for (const arg of args) {
    if (flags.has(arg)) continue;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!knownValues.has(name)) {
      throw new Error("Unknown Minnesota production-release option: " + arg);
    }
  }
  const packagePath = value("--package");
  if (!packagePath) throw new Error("--package is required");
  return {
    packagePath,
    preflightPath: value("--preflight"),
    backupManifestPath: value("--backup-manifest"),
    authorizationPath: value("--authorization"),
    authorizationSha256: value("--authorization-sha256"),
    confirmationPath: value("--confirmation"),
    overlayPath: value("--overlay"),
    reviewPath: value("--review"),
    receiptPath: value("--receipt"),
    apply: args.includes("--apply"),
    recoverReceipt: args.includes("--recover-receipt"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
    writeConfirmationTemplate: args.includes("--write-confirmation-template"),
  };
}

function authorizationEvidenceReference(authorization, key, label) {
  const reference = authorization?.evidence?.[key];
  if (
    typeof reference?.path !== "string"
    || !reference.path
    || !/^[a-f0-9]{64}$/.test(reference?.sha256 ?? "")
  ) {
    throw new Error(`Minnesota production authorization requires ${label} path and SHA-256`);
  }
  return reference;
}

export function assertMinnesotaProductionReleaseEnvironment(
  expected,
  environment = process.env,
) {
  if (environment.CRM_DATABASE_ENVIRONMENT !== "production") {
    throw new Error("Minnesota production release requires CRM_DATABASE_ENVIRONMENT=production");
  }
  if (environment.CRM_MN_PRECINCT_PRODUCTION_WRITES !== expected.packageSha256) {
    throw new Error("Minnesota production-write acknowledgement must equal the package SHA-256");
  }
  if (
    environment.CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID
      !== expected.authorizationId
  ) {
    throw new Error("Minnesota production authorization-ID acknowledgement is missing");
  }
  if (
    environment.CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256
      !== expected.authorizationSha256
  ) {
    throw new Error("Minnesota production authorization-SHA acknowledgement is missing");
  }
}

export function assertMinnesotaReceiptRecoveryEnvironment(
  expected,
  environment = process.env,
) {
  if (environment.CRM_DATABASE_ENVIRONMENT !== "production-read-only") {
    throw new Error("Minnesota hidden receipt recovery requires CRM_DATABASE_ENVIRONMENT=production-read-only");
  }
  if (
    environment.CRM_MN_PRECINCT_RECEIPT_RECOVERY_PACKAGE_SHA256
      !== expected.packageSha256
  ) {
    throw new Error("Minnesota hidden receipt recovery package acknowledgement is missing");
  }
  if (
    environment.CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256
      !== expected.authorizationSha256
  ) {
    throw new Error("Minnesota hidden receipt recovery authorization-SHA acknowledgement is missing");
  }
}

export function inspectMinnesotaCleanIntegration(
  root,
  runner = spawnSync,
) {
  const run = (args) => {
    const result = runner("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        "Minnesota clean-integration Git inspection failed: "
          + String(result.stderr ?? "").trim(),
      );
    }
    return String(result.stdout ?? "").trim();
  };
  const gitSha = run(["rev-parse", "HEAD"]);
  const gitTreeSha = run(["rev-parse", "HEAD^{tree}"]);
  const trackedStatus = run([
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ]);
  if (
    !/^[a-f0-9]{40}$/.test(gitSha)
    || !/^[a-f0-9]{40}$/.test(gitTreeSha)
    || trackedStatus
  ) {
    throw new Error("Minnesota release confirmation requires a clean tracked Git integration tree");
  }
  return {
    gitSha,
    gitTreeSha,
    trackedStatusSha256: sha256(Buffer.from(trackedStatus, "utf8")),
    trackedStatusClean: true,
    diffCheckPassed: true,
    missingPaths: 0,
    unexpectedPaths: 0,
  };
}

function safeReleasePackage(root, relativePath) {
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(".etl/precinct-release-candidates/MN/")
    || !relativePath.endsWith("/release-candidate.json")
  ) {
    throw new Error("Minnesota production release package path is unsafe");
  }
  const artifact = inspectReleaseArtifact(root, relativePath, {
    allowedRoots: [".etl/precinct-release-candidates/MN/"],
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  return {
    artifact,
    document,
    releaseCandidate: {
      id: document.id,
      sha256: artifact.sha256,
      canonicalManifestPreimages: document.years?.map((year) => ({
        year: year.year,
        path: year.canonicalManifest.path,
        byteCount: year.canonicalManifest.byteCount,
        sha256: year.canonicalManifest.sha256,
        validationStatus: year.canonicalManifest.validationStatus,
        rowLevelRenderingSafe: year.canonicalManifest.rowLevelRenderingSafe,
        delivery: year.canonicalManifest.delivery,
      })) ?? [],
    },
  };
}

function verifyCurrentReleaseInputs(root, document) {
  const inventories = [
    ...(document.scopedFileInventory?.releaseDependencies ?? []),
    ...(document.scopedFileInventory?.sharedReviewFiles ?? []),
    ...(document.scopedFileInventory?.sourceAndDataArtifacts ?? []),
  ];
  for (const artifact of inventories) {
    inspectReleaseArtifact(root, artifact.path, {
      byteCount: artifact.byteCount,
      sha256: artifact.sha256,
    });
  }
  for (const year of document.years ?? []) {
    inspectReleaseArtifact(root, year.candidateDelivery.path, {
      allowedRoots: [".etl/precinct-delivery-candidates/"],
      byteCount: year.candidateDelivery.byteCount,
      sha256: year.candidateDelivery.sha256,
    });
    inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/MN/"],
      byteCount: year.canonicalManifest.byteCount,
      sha256: year.canonicalManifest.sha256,
    });
  }
  return inventories.length;
}

function productionUrl() {
  const first = process.env.POSTGRES_URL_NON_POOLING;
  const second = process.env.POSTGRES_DATABASE_URL_UNPOOLED;
  if (first && second && first !== second) {
    throw new Error("Production unpooled URL variables disagree");
  }
  const value = first ?? second;
  if (!value) throw new Error("Production unpooled database URL is unavailable");
  return value;
}

function safeTmpBackupManifest(requested) {
  if (!requested) throw new Error("--backup-manifest is required");
  const root = path.resolve("C:/tmp/crm-db-clone");
  const target = path.resolve(requested);
  if (!target.startsWith(root + path.sep) || !target.endsWith(".manifest.json")) {
    throw new Error("Minnesota backup manifest must be under C:/tmp/crm-db-clone");
  }
  const bytes = readFileSync(target);
  return {
    path: target,
    bytes,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

export function verifyBackupDump(
  manifest,
  allowedRoot = "C:/tmp/crm-db-clone",
) {
  const root = path.resolve(allowedRoot);
  const manifestDirectory = path.dirname(path.resolve(manifest.path));
  if (!manifestDirectory.startsWith(root + path.sep)) {
    throw new Error("Minnesota backup manifest directory is outside its fixed root");
  }
  const filename = manifest.value.dumpFile;
  if (
    typeof filename !== "string"
    || path.basename(filename) !== filename
    || !filename.endsWith(".dump")
  ) {
    throw new Error("Minnesota backup dump filename is unsafe");
  }
  const target = path.resolve(manifestDirectory, filename);
  if (!target.startsWith(manifestDirectory + path.sep)) {
    throw new Error("Minnesota backup dump escapes its manifest directory");
  }
  const bytes = readFileSync(target);
  const digest = sha256(bytes);
  if (digest !== manifest.value.dumpSha256) {
    throw new Error("Minnesota backup dump SHA-256 does not match its manifest");
  }
  return { path: target, byteCount: bytes.length, sha256: digest };
}

function outputPath(root, requested, defaultName, allowedDirectory) {
  const relativePath = requested ?? path.posix.join(
    ".etl",
    allowedDirectory,
    "MN",
    defaultName,
  );
  const prefix = `.etl/${allowedDirectory}/MN/`;
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(prefix)
  ) {
    throw new Error("Minnesota release output must remain under " + prefix);
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", allowedDirectory, "MN");
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Minnesota release output escapes its .etl directory");
  }
  return { relativePath, absolute };
}

function writeJson(target, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  let disposition = "created";
  if (existsSync(target.absolute)) {
    if (!readFileSync(target.absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different Minnesota release evidence");
    }
    disposition = "verified_existing";
  } else {
    mkdirSync(path.dirname(target.absolute), { recursive: true });
    writeFileSync(target.absolute, bytes);
  }
  return {
    path: target.relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    disposition,
  };
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function reserveMinnesotaReceiptTarget(
  target,
  reservation,
  options = {},
) {
  if (existsSync(target.absolute)) {
    throw new Error("Minnesota hidden-load receipt target already exists");
  }
  mkdirSync(path.dirname(target.absolute), { recursive: true });
  const pending = {
    absolute: target.absolute + ".pending",
    relativePath: target.relativePath + ".pending",
    bytes: jsonBytes(reservation),
  };
  if (existsSync(pending.absolute)) {
    if (
      options.allowExisting === true
      && readFileSync(pending.absolute).equals(pending.bytes)
    ) {
      return { ...pending, disposition: "reused" };
    }
    throw new Error("Minnesota hidden-load receipt reservation already exists");
  }
  try {
    writeFileSync(pending.absolute, pending.bytes, { flag: "wx" });
  } catch (error) {
    throw new Error(
      "Minnesota hidden-load receipt target could not be reserved before production: "
        + (error instanceof Error ? error.message : String(error)),
    );
  }
  return { ...pending, disposition: "created" };
}

export function releaseMinnesotaReceiptReservation(target, pending) {
  if (
    existsSync(pending.absolute)
    && !existsSync(target.absolute)
    && readFileSync(pending.absolute).equals(pending.bytes)
  ) {
    unlinkSync(pending.absolute);
  }
}

export function finalizeMinnesotaReceipt(target, pending, value) {
  const bytes = jsonBytes(value);
  if (existsSync(target.absolute)) {
    if (!readFileSync(target.absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different Minnesota hidden-load receipt");
    }
    let pendingCleanupRequired = false;
    if (existsSync(pending.absolute) && readFileSync(pending.absolute).equals(pending.bytes)) {
      try {
        unlinkSync(pending.absolute);
      } catch {
        pendingCleanupRequired = true;
      }
    }
    return {
      path: target.relativePath,
      byteCount: bytes.length,
      sha256: sha256(bytes),
      disposition: "verified_existing",
      pendingCleanupRequired,
    };
  }
  if (
    !existsSync(pending.absolute)
    || !readFileSync(pending.absolute).equals(pending.bytes)
  ) {
    throw new Error("Minnesota hidden-load receipt reservation drifted after commit");
  }
  const temporary = target.absolute + ".write-" + sha256(bytes).slice(0, 16) + ".tmp";
  if (existsSync(temporary)) {
    if (!readFileSync(temporary).equals(bytes)) {
      throw new Error("Minnesota hidden-load receipt temporary file drifted");
    }
  } else {
    writeFileSync(temporary, bytes, { flag: "wx" });
  }
  renameSync(temporary, target.absolute);
  let pendingCleanupRequired = false;
  if (existsSync(pending.absolute) && readFileSync(pending.absolute).equals(pending.bytes)) {
    try {
      unlinkSync(pending.absolute);
    } catch {
      pendingCleanupRequired = true;
    }
  }
  return {
    path: target.relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    disposition: "created",
    pendingCleanupRequired,
  };
}

export async function runMinnesotaProductionRelease(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath
    ? options
    : parseArguments(process.argv.slice(2));
  if (parsed.apply && parsed.recoverReceipt) {
    throw new Error("Minnesota production apply and receipt recovery are mutually exclusive");
  }
  if (
    (parsed.apply || parsed.recoverReceipt)
    && (parsed.writeAuthorizationTemplate || parsed.writeConfirmationTemplate)
  ) {
    throw new Error("Minnesota production template writes cannot accompany apply or recovery");
  }
  const loaded = safeReleasePackage(root, parsed.packagePath);
  const verifiedInputCount = verifyCurrentReleaseInputs(root, loaded.document);
  const template = buildMinnesotaProductionAuthorizationTemplate(
    loaded.releaseCandidate,
  );
  let templateArtifact = null;
  if (parsed.writeAuthorizationTemplate) {
    const target = outputPath(
      root,
      parsed.authorizationPath,
      `mn-precinct-authorization-template-${loaded.artifact.sha256.slice(0, 12)}.json`,
      "production-authorizations",
    );
    templateArtifact = writeJson(target, template);
  }
  let confirmationTemplateArtifact = null;
  if (parsed.writeConfirmationTemplate) {
    if (!parsed.overlayPath || !parsed.reviewPath) {
      throw new Error("--overlay and --review are required for --write-confirmation-template");
    }
    const overlayArtifact = readAndVerifyEvidenceFile(root, parsed.overlayPath);
    const reviewArtifact = readAndVerifyEvidenceFile(root, parsed.reviewPath);
    const cleanIntegration = inspectMinnesotaCleanIntegration(
      root,
      options.gitRunner ?? spawnSync,
    );
    const confirmationTemplate = buildMinnesotaOwnerConfirmationTemplate({
      releaseCandidate: loaded.releaseCandidate,
      releaseCandidatePath: parsed.packagePath,
      overlay: overlayArtifact,
      overlayDocument: JSON.parse(overlayArtifact.bytes.toString("utf8")),
      review: reviewArtifact,
      reviewDocument: JSON.parse(reviewArtifact.bytes.toString("utf8")),
      cleanIntegration,
    });
    const target = outputPath(
      root,
      parsed.confirmationPath,
      "mn-precinct-owner-confirmation-template-"
        + loaded.artifact.sha256.slice(0, 12) + "-"
        + overlayArtifact.sha256.slice(0, 12) + "-"
        + reviewArtifact.sha256.slice(0, 12) + ".json",
      "precinct-release-confirmations",
    );
    confirmationTemplateArtifact = writeJson(target, confirmationTemplate);
  }
  if (!parsed.apply && !parsed.recoverReceipt) {
    return {
      mode: "plan",
      state: "MN",
      decision: "NO_GO_PRODUCTION",
      releasePackageSha256: loaded.artifact.sha256,
      verifiedInputCount,
      connectionOpened: false,
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      authorizationTemplate: templateArtifact,
      confirmationTemplate: confirmationTemplateArtifact,
      requiredEvidence: [
        "fresh read-only production preflight",
        "fresh checksummed backup with restoration verification",
        "named authorizer, operator, verifier, and rollback owner",
        "active deployment window and exact GO_PRODUCTION authorization record",
      ],
    };
  }

  if (
    !parsed.preflightPath
    || !parsed.authorizationPath
    || !/^[a-f0-9]{64}$/.test(parsed.authorizationSha256 ?? "")
    || !parsed.receiptPath
  ) {
    throw new Error(
      "--preflight, --authorization, --authorization-sha256, and --receipt are required for production apply or recovery",
    );
  }
  const preflightArtifact = readAndVerifyEvidenceFile(root, parsed.preflightPath);
  const authorizationArtifact = readAndVerifyEvidenceFile(
    root,
    parsed.authorizationPath,
    parsed.authorizationSha256,
  );
  const backupArtifact = options.backupArtifact
    ?? safeTmpBackupManifest(parsed.backupManifestPath);
  const clock = options.nowFactory
    ?? (() => options.now ?? new Date());
  const currentTime = () => {
    const value = clock();
    const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(result.getTime())) {
      throw new Error("Minnesota production release clock returned an invalid time");
    }
    return result;
  };
  const databaseUrl = options.databaseUrl ?? productionUrl();
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  const preflight = JSON.parse(preflightArtifact.bytes.toString("utf8"));
  const backup = backupArtifact.value;
  const authorization = JSON.parse(authorizationArtifact.bytes.toString("utf8"));
  const overlayReference = authorizationEvidenceReference(
    authorization,
    "releaseOverlay",
    "the release overlay evidence",
  );
  const reviewReference = authorizationEvidenceReference(
    authorization,
    "releaseReview",
    "the release review evidence",
  );
  const confirmationReference = authorizationEvidenceReference(
    authorization,
    "releaseConfirmation",
    "the human confirmation evidence",
  );
  const overlayArtifact = readAndVerifyEvidenceFile(
    root,
    overlayReference.path,
    overlayReference.sha256,
  );
  const reviewArtifact = readAndVerifyEvidenceFile(
    root,
    reviewReference.path,
    reviewReference.sha256,
  );
  const confirmationArtifact = readAndVerifyEvidenceFile(
    root,
    confirmationReference.path,
    confirmationReference.sha256,
  );
  const overlayDocument = JSON.parse(overlayArtifact.bytes.toString("utf8"));
  const reviewDocument = JSON.parse(reviewArtifact.bytes.toString("utf8"));
  const confirmationDocument = JSON.parse(
    confirmationArtifact.bytes.toString("utf8"),
  );
  const backupDump = options.backupDump ?? verifyBackupDump(backupArtifact);
  const validateEvidenceAt = (now, cleanIntegration) => {
    const context = {
      now,
      endpointFingerprint,
      releaseCandidate: loaded.releaseCandidate,
    };
    const preflightEvidence = validateMinnesotaProductionPreflightEvidence(
      preflight,
      context,
    );
    const backupEvidence = validateMinnesotaProductionBackupEvidence(
      backup,
      {
        ...context,
        preflightCapturedAtUtc: preflightEvidence.capturedAtUtc,
      },
    );
    const authorizationEvidence = validateMinnesotaProductionAuthorization(
      authorization,
      {
        ...context,
        preflightPath: preflightArtifact.path,
        preflightSha256: preflightArtifact.sha256,
        backupManifestPath: backupArtifact.path,
        backupManifestSha256: backupArtifact.sha256,
        releaseOverlayPath: overlayArtifact.path,
        releaseOverlaySha256: overlayArtifact.sha256,
        releaseReviewPath: reviewArtifact.path,
        releaseReviewSha256: reviewArtifact.sha256,
        releaseConfirmationPath: confirmationArtifact.path,
        releaseConfirmationSha256: confirmationArtifact.sha256,
      },
    );
    const releaseReviewEvidence = validateMinnesotaProductionReviewEvidence({
      overlay: overlayDocument,
      review: reviewDocument,
      confirmation: confirmationDocument,
    }, {
      now,
      authorizedAtUtc: authorization.authorizedAtUtc,
      operator: authorization.people?.operator,
      humanControl: authorizationEvidence.humanControl,
      releaseCandidate: loaded.releaseCandidate,
      releaseCandidatePath: parsed.packagePath,
      overlay: overlayArtifact,
      review: reviewArtifact,
      confirmation: confirmationArtifact,
      cleanIntegration,
    });
    return {
      preflightEvidence,
      backupEvidence,
      releaseReviewEvidence,
      authorizationEvidence,
    };
  };
  const cleanIntegration = () => options.cleanIntegration
    ?? inspectMinnesotaCleanIntegration(root, options.gitRunner ?? spawnSync);
  const baseReleaseAudit = (authorizationId) => ({
    authorization: {
      path: authorizationArtifact.path,
      sha256: authorizationArtifact.sha256,
    },
    releaseOverlay: {
      path: overlayArtifact.path,
      sha256: overlayArtifact.sha256,
    },
    releaseReview: {
      path: reviewArtifact.path,
      sha256: reviewArtifact.sha256,
    },
    releaseConfirmation: {
      path: confirmationArtifact.path,
      sha256: confirmationArtifact.sha256,
    },
    preflight: {
      path: preflightArtifact.path,
      sha256: preflightArtifact.sha256,
    },
    backupManifest: {
      sha256: backupArtifact.sha256,
      dumpSha256: backupDump.sha256,
    },
    authorizationId,
    endpointFingerprint,
  });
  const plan = (options.planBuilder ?? buildMinnesotaPrecinctGisPlan)({ root });
  const receiptTarget = outputPath(
    root,
    parsed.receiptPath,
    "mn-precinct-production-receipt-"
      + loaded.artifact.sha256.slice(0, 12) + "-"
      + authorizationArtifact.sha256.slice(0, 12) + ".json",
    "production-release-receipts",
  );
  const reservationDocument = {
    schemaVersion: 1,
    state: "MN",
    status: "PENDING_HIDDEN_LOAD_RECEIPT",
    target: receiptTarget.relativePath,
    releaseCandidate: {
      id: loaded.releaseCandidate.id,
      sha256: loaded.releaseCandidate.sha256,
    },
    authorization: {
      path: authorizationArtifact.path,
      sha256: authorizationArtifact.sha256,
    },
    preflight: {
      path: preflightArtifact.path,
      sha256: preflightArtifact.sha256,
    },
    backupManifestSha256: backupArtifact.sha256,
  };

  if (parsed.recoverReceipt) {
    assertMinnesotaReceiptRecoveryEnvironment({
      packageSha256: loaded.artifact.sha256,
      authorizationSha256: authorizationArtifact.sha256,
    }, options.environment ?? process.env);
    const pending = reserveMinnesotaReceiptTarget(
      receiptTarget,
      reservationDocument,
      { allowExisting: true },
    );
    let sql;
    try {
      sql = (options.postgresFactory ?? postgres)(databaseUrl, {
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
        connection: {
          application_name: "civicresultmaps-mn-precinct-hidden-receipt-recovery",
        },
      });
    } catch (error) {
      if (pending.disposition === "created") {
        releaseMinnesotaReceiptReservation(receiptTarget, pending);
      }
      throw error;
    }
    let recovered;
    try {
      recovered = await sql.begin("read only", async (tx) => {
        const persistedAudit = await readMinnesotaPersistedProductionReleaseAudit(
          tx,
          loaded.releaseCandidate,
        );
        const evidence = validateEvidenceAt(
          new Date(persistedAudit.transaction.executedAtUtc),
          confirmationDocument.cleanIntegration,
        );
        const { transaction: persistedTransaction, ...persistedBase } = persistedAudit;
        if (
          JSON.stringify(persistedBase)
            !== JSON.stringify(baseReleaseAudit(evidence.authorizationEvidence.authorizationId))
        ) {
          throw new Error("Minnesota hidden receipt recovery evidence does not match the durable database audit");
        }
        const executionContext = {
          mode: "production_release",
          releaseCandidateId: loaded.releaseCandidate.id,
          releasePackageSha256: loaded.releaseCandidate.sha256,
          databaseName: evidence.preflightEvidence.databaseName,
          productionReleaseAudit: {
            ...persistedBase,
            transaction: persistedTransaction,
          },
        };
        const validation = await validateMinnesotaPrecinctGisClient(
          tx,
          plan,
          { executionContext, readOnlySession: true },
        );
        if (Number(validation.revision) !== persistedTransaction.publicRevision) {
          throw new Error("Minnesota hidden receipt recovery public revision drifted");
        }
        const totals = validation.years.reduce((result, year) => ({
          reportingUnits: result.reportingUnits + year.reportingUnits,
          candidateResultRows: result.candidateResultRows + year.resultRows,
          geometryFeatures: result.geometryFeatures + year.features,
          reviewedExactCrosswalks:
            result.reviewedExactCrosswalks + year.reviewedCrosswalks,
          zeroVoteUnits: result.zeroVoteUnits + year.zeroVoteUnits,
        }), {
          reportingUnits: 0,
          candidateResultRows: 0,
          geometryFeatures: 0,
          reviewedExactCrosswalks: 0,
          zeroVoteUnits: 0,
        });
        return {
          evidence,
          transaction: {
            disposition: "recovered_existing",
            committedAtUtc: persistedTransaction.executedAtUtc,
            validation,
            totals,
            releaseAudit: persistedAudit,
            canonicalManifestChanged: false,
            publicFileWritten: false,
            publicDeliveryAuthorized: false,
          },
        };
      });
    } catch (error) {
      if (pending.disposition === "created") {
        releaseMinnesotaReceiptReservation(receiptTarget, pending);
      }
      throw error;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const receipt = {
      schemaVersion: 1,
      state: "MN",
      releaseCandidate: loaded.releaseCandidate,
      committedAtUtc: recovered.transaction.committedAtUtc,
      endpointFingerprint,
      authorization: {
        path: authorizationArtifact.path,
        sha256: authorizationArtifact.sha256,
        ...recovered.evidence.authorizationEvidence,
      },
      releaseReview: recovered.evidence.releaseReviewEvidence,
      preflight: {
        path: preflightArtifact.path,
        sha256: preflightArtifact.sha256,
        ...recovered.evidence.preflightEvidence,
      },
      backup: {
        manifestPath: backupArtifact.path,
        manifestSha256: backupArtifact.sha256,
        ...recovered.evidence.backupEvidence,
        dumpByteCount: backupDump.byteCount,
      },
      transaction: recovered.transaction,
      recovery: {
        recoveredAtUtc: currentTime().toISOString(),
        productionMutationPerformed: false,
      },
      productionMutationPerformed: true,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicDeliveryAuthorized: false,
    };
    return {
      mode: "production_hidden_load_receipt_recovery",
      state: "MN",
      decision: "RECOVERED_HIDDEN_RECEIPT",
      receipt: (options.receiptFinalizer ?? finalizeMinnesotaReceipt)(
        receiptTarget,
        pending,
        receipt,
      ),
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicDeliveryAuthorized: false,
    };
  }

  const initialEvidence = validateEvidenceAt(currentTime(), cleanIntegration());
  assertMinnesotaProductionReleaseEnvironment({
    packageSha256: loaded.artifact.sha256,
    authorizationId: initialEvidence.authorizationEvidence.authorizationId,
    authorizationSha256: authorizationArtifact.sha256,
  }, options.environment ?? process.env);
  const migration = inspectReleaseArtifact(
    root,
    loaded.document.databaseActivationContract.migration.path,
    {
      byteCount: loaded.document.databaseActivationContract.migration.byteCount,
      sha256: loaded.document.databaseActivationContract.migration.sha256,
    },
  );
  const pending = reserveMinnesotaReceiptTarget(
    receiptTarget,
    reservationDocument,
  );
  let sql;
  try {
    sql = (options.postgresFactory ?? postgres)(databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: {
        application_name: "civicresultmaps-mn-precinct-production-release",
      },
    });
  } catch (error) {
    releaseMinnesotaReceiptReservation(receiptTarget, pending);
    throw error;
  }
  let transaction;
  let transactionBodyCompleted = false;
  try {
    transaction = await sql.begin(async (tx) => {
      const transactionNow = currentTime();
      const finalEvidence = validateEvidenceAt(
        transactionNow,
        cleanIntegration(),
      );
      const transactionRunner = options.transactionRunner
        ?? applyMinnesotaProductionReleaseTransaction;
      const result = await transactionRunner(tx, {
        releaseCandidate: loaded.releaseCandidate,
        packageDocument: loaded.document,
        migrationBytes: migration.bytes,
        databaseName: finalEvidence.preflightEvidence.databaseName,
        preflightReport: preflight,
        plan,
        releaseAudit: baseReleaseAudit(
          finalEvidence.authorizationEvidence.authorizationId,
        ),
        transactionAtUtc: transactionNow.toISOString(),
        testOnlyFailBeforeCommit: options.testOnlyFailBeforeCommit,
      });
      transactionBodyCompleted = true;
      return result;
    });
  } catch (error) {
    if (!transactionBodyCompleted) {
      releaseMinnesotaReceiptReservation(receiptTarget, pending);
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const receipt = {
    schemaVersion: 1,
    state: "MN",
    releaseCandidate: loaded.releaseCandidate,
    committedAtUtc: transaction.committedAtUtc,
    endpointFingerprint,
    authorization: {
      path: authorizationArtifact.path,
      sha256: authorizationArtifact.sha256,
      ...initialEvidence.authorizationEvidence,
    },
    releaseReview: initialEvidence.releaseReviewEvidence,
    preflight: {
      path: preflightArtifact.path,
      sha256: preflightArtifact.sha256,
      ...initialEvidence.preflightEvidence,
    },
    backup: {
      manifestPath: backupArtifact.path,
      manifestSha256: backupArtifact.sha256,
      ...initialEvidence.backupEvidence,
      dumpByteCount: backupDump.byteCount,
    },
    transaction,
    productionMutationPerformed: true,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    publicDeliveryAuthorized: false,
  };
  if (options.testOnlyFailReceiptWrite === true) {
    throw new Error("Intentional Minnesota hidden-load receipt write failure after commit");
  }
  return {
    mode: "production_hidden_load",
    state: "MN",
    decision: "COMMITTED_HIDDEN_NOT_PUBLIC",
    receipt: (options.receiptFinalizer ?? finalizeMinnesotaReceipt)(
      receiptTarget,
      pending,
      receipt,
    ),
    productionMutationPerformed: true,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    publicDeliveryAuthorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runMinnesotaProductionRelease(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
