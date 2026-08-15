import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  applySouthCarolinaPrecinctGisTransaction,
  readSouthCarolinaPersistedProductionReleaseAudit,
  validateSouthCarolinaPrecinctGisClient,
} from "./lib/sc-precinct-gis-db.mjs";
import { buildSouthCarolinaPrecinctGisPlan } from "./lib/sc-precinct-gis-plan.mjs";
import { inspectReleaseArtifact } from "./lib/sc-precinct-release-candidate.mjs";
import {
  assertSouthCarolinaReleaseCandidateDocument,
  productionEndpointFingerprint,
} from "./lib/sc-precinct-production-preflight.mjs";
import {
  buildSouthCarolinaProductionAuthorizationTemplate,
  sha256,
  validateSouthCarolinaProductionAuthorization,
  validateSouthCarolinaProductionBackupEvidence,
  validateSouthCarolinaProductionPreflightEvidence,
} from "./lib/sc-precinct-production-release.mjs";

function parseArguments(args) {
  const value = (name) => args.find((arg) => arg.startsWith(name + "="))
    ?.slice(name.length + 1);
  const parsed = {
    apply: args.includes("--apply"),
    recoverReceipt: args.includes("--recover-receipt"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
    packagePath: value("--package"),
    packageSha256: value("--package-sha256"),
    preflightPath: value("--preflight"),
    preflightSha256: value("--preflight-sha256"),
    backupManifestPath: value("--backup-manifest"),
    backupManifestSha256: value("--backup-manifest-sha256"),
    authorizationPath: value("--authorization"),
    authorizationSha256: value("--authorization-sha256"),
    authorizationTemplatePath: value("--authorization-template"),
    receiptPath: value("--receipt"),
  };
  const known = new Set([
    "--apply",
    "--recover-receipt",
    "--write-authorization-template",
    "--package",
    "--package-sha256",
    "--preflight",
    "--preflight-sha256",
    "--backup-manifest",
    "--backup-manifest-sha256",
    "--authorization",
    "--authorization-sha256",
    "--authorization-template",
    "--receipt",
  ]);
  for (const arg of args) {
    const key = arg.split("=")[0];
    if (!known.has(key)) throw new Error("Unknown South Carolina production-release option: " + arg);
  }
  if (!parsed.packagePath || !parsed.packageSha256) {
    throw new Error("South Carolina production release requires --package and --package-sha256");
  }
  if ([parsed.apply, parsed.recoverReceipt, parsed.writeAuthorizationTemplate]
    .filter(Boolean).length > 1) {
    throw new Error("South Carolina production release modes are mutually exclusive");
  }
  return parsed;
}

function safeEtlPath(root, relativePath, requiredPrefix) {
  if (
    typeof relativePath !== "string"
    || !relativePath.startsWith(requiredPrefix)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || path.isAbsolute(relativePath)
  ) {
    throw new Error("Unsafe South Carolina release evidence path: " + relativePath);
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...requiredPrefix.replace(/\/$/, "").split("/"));
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("South Carolina release evidence escapes its .etl root");
  }
  return absolute;
}

function readEtlJson(root, relativePath, expectedSha256, prefix) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error("South Carolina release evidence requires an exact SHA-256");
  }
  const absolute = safeEtlPath(root, relativePath, prefix);
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("South Carolina release evidence SHA-256 drifted: " + relativePath);
  }
  return { path: relativePath, absolute, bytes, sha256: expectedSha256, value: JSON.parse(bytes) };
}

function readBackupManifest(relativeOrAbsolutePath, expectedSha256, root) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error("South Carolina backup manifest requires an exact SHA-256");
  }
  const absolute = path.isAbsolute(relativeOrAbsolutePath)
    ? path.resolve(relativeOrAbsolutePath)
    : path.resolve(root, relativeOrAbsolutePath);
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("South Carolina backup manifest SHA-256 drifted");
  }
  return { absolute, bytes, sha256: expectedSha256, value: JSON.parse(bytes) };
}

function productionUrl(environment = process.env) {
  const first = environment.POSTGRES_URL_NON_POOLING?.trim() || "";
  const second = environment.POSTGRES_DATABASE_URL_UNPOOLED?.trim() || "";
  if (!first && !second) {
    throw new Error("South Carolina production release requires an explicit unpooled PostgreSQL URL");
  }
  if (first && second && first !== second) {
    throw new Error("South Carolina production release found conflicting unpooled PostgreSQL URLs");
  }
  return first || second;
}

function immutableJson(root, relativePath, value) {
  const absolute = safeEtlPath(root, relativePath, path.posix.dirname(relativePath) + "/");
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  if (existsSync(absolute)) {
    if (!readFileSync(absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different South Carolina release evidence");
    }
    return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes), disposition: "verified_existing" };
  }
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes, { flag: "wx" });
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes), disposition: "created" };
}

function reserveReceipt(
  root,
  relativePath,
  packageSha256,
  authorizationSha256,
  options = {},
) {
  const absolute = safeEtlPath(
    root,
    relativePath,
    ".etl/production-release-receipts/SC/",
  );
  if (existsSync(absolute)) throw new Error("South Carolina production receipt already exists");
  const pending = absolute + ".pending";
  const pendingBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    state: "SC",
    packageSha256,
    authorizationSha256,
    purpose: "ambiguous-commit recovery marker",
  }, null, 2) + "\n");
  mkdirSync(path.dirname(absolute), { recursive: true });
  if (existsSync(pending)) {
    if (
      options.allowExisting === true
      && readFileSync(pending).equals(pendingBytes)
    ) {
      return {
        absolute,
        pending,
        pendingBytes,
        disposition: "reused",
      };
    }
    throw new Error("A South Carolina release recovery marker already exists; reconcile it before retrying");
  }
  writeFileSync(pending, pendingBytes, { flag: "wx" });
  return { absolute, pending, pendingBytes, disposition: "created" };
}

function finishReceipt(reservation, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  const temporary = reservation.absolute + ".write-" + sha256(bytes).slice(0, 12) + ".tmp";
  if (existsSync(temporary)) {
    if (!readFileSync(temporary).equals(bytes)) {
      throw new Error("South Carolina hidden receipt temporary file drifted");
    }
  } else {
    writeFileSync(temporary, bytes, { flag: "wx" });
  }
  renameSync(temporary, reservation.absolute);
  if (readFileSync(reservation.pending).equals(reservation.pendingBytes)) {
    unlinkSync(reservation.pending);
  }
  return { byteCount: bytes.length, sha256: sha256(bytes) };
}

function defaultTemplatePath(packageSha256) {
  return ".etl/production-authorizations/SC/sc-precinct-authorization-template-"
    + packageSha256.slice(0, 12)
    + ".json";
}

function defaultReceiptPath(packageSha256, authorizationId) {
  const safeId = authorizationId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return ".etl/production-release-receipts/SC/sc-precinct-hidden-load-"
    + packageSha256.slice(0, 12)
    + "-"
    + safeId
    + ".json";
}

async function ensureSouthCarolinaDerivationConstraint(tx, migrationArtifact) {
  const inspect = async () => tx.unsafe([
    "select pg_get_constraintdef(oid) definition from pg_constraint",
    "where connamespace='public'::regnamespace",
    " and conname='geography_versions_derivation_method_check'",
  ].join("\n"));
  const beforeRows = await inspect();
  if (beforeRows.length !== 1) {
    throw new Error("South Carolina derivation-method constraint is missing or ambiguous");
  }
  const beforeDefinition = String(beforeRows[0].definition ?? "");
  const complete = beforeDefinition.includes("secondary_reconstruction")
    && beforeDefinition.includes("hybrid_reconstruction");
  if (complete) {
    return { before: "complete", after: "complete", statementsApplied: 0 };
  }
  if (
    !beforeDefinition.includes("official_export")
    || !beforeDefinition.includes("official_service")
    || !beforeDefinition.includes("digitized_map")
    || !beforeDefinition.includes("official_crosswalk")
  ) {
    throw new Error("South Carolina derivation-method constraint preimage drifted");
  }
  const statements = migrationArtifact.bytes.toString("utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length !== 2) {
    throw new Error("South Carolina migration 0009 statement set drifted");
  }
  for (const statement of statements) await tx.unsafe(statement);
  const afterRows = await inspect();
  const afterDefinition = String(afterRows[0]?.definition ?? "");
  if (
    afterRows.length !== 1
    || !afterDefinition.includes("secondary_reconstruction")
    || !afterDefinition.includes("hybrid_reconstruction")
  ) {
    throw new Error("South Carolina migration 0009 did not establish the required constraint");
  }
  return { before: "absent", after: "complete", statementsApplied: 2 };
}

export async function runSouthCarolinaProductionRelease(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath ? options : parseArguments(process.argv.slice(2));
  const packageArtifact = inspectReleaseArtifact(root, parsed.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/SC/"],
    sha256: parsed.packageSha256,
  });
  const packageDocument = JSON.parse(packageArtifact.bytes.toString("utf8"));
  const releaseCandidate = assertSouthCarolinaReleaseCandidateDocument(
    packageDocument,
    packageArtifact.sha256,
  );
  const migration0009Declaration = releaseCandidate.migrations.find(
    (migration) => migration.path === "drizzle/0009_public_wolfpack.sql",
  );
  const migration0009Artifact = inspectReleaseArtifact(
    root,
    migration0009Declaration.path,
    {
      allowedRoots: ["drizzle/"],
      byteCount: migration0009Declaration.byteCount,
      sha256: migration0009Declaration.sha256,
    },
  );
  const environment = options.environment ?? process.env;
  const clock = options.nowFactory ?? (() => options.now ?? new Date());
  const currentTime = () => {
    const value = clock();
    const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(result.getTime())) {
      throw new Error("South Carolina production release clock returned an invalid time");
    }
    return result;
  };
  if (parsed.writeAuthorizationTemplate) {
    const relativePath = parsed.authorizationTemplatePath
      ?? defaultTemplatePath(packageArtifact.sha256);
    const artifact = immutableJson(root, relativePath, buildSouthCarolinaProductionAuthorizationTemplate({
      releaseCandidate,
      preflightSha256: parsed.preflightSha256,
      backupManifestSha256: parsed.backupManifestSha256,
    }));
    return {
      mode: "write_authorization_template",
      decision: "NO_GO_PRODUCTION",
      releaseCandidate,
      authorizationTemplate: artifact,
      productionMutationPerformed: false,
    };
  }
  if (!parsed.apply && !parsed.recoverReceipt) {
    return {
      mode: "plan",
      decision: "NO_GO_PRODUCTION",
      releaseCandidate,
      productionMutationPerformed: false,
      publicDeliveryAuthorized: false,
      requiredEvidence: [
        "fresh read-only production preflight",
        "fresh full public-schema backup with exact restore verification",
        "hash-pinned GO_PRODUCTION authorization",
      ],
    };
  }
  const databaseUrl = productionUrl(environment);
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  const preflight = readEtlJson(
    root,
    parsed.preflightPath,
    parsed.preflightSha256,
    ".etl/production-preflight-candidates/SC/",
  );
  const backup = readBackupManifest(
    parsed.backupManifestPath,
    parsed.backupManifestSha256,
    root,
  );
  const authorization = readEtlJson(
    root,
    parsed.authorizationPath,
    parsed.authorizationSha256,
    ".etl/production-authorizations/SC/",
  );
  const validateEvidenceAt = (now) => {
    const preflightSummary = validateSouthCarolinaProductionPreflightEvidence(
      preflight.value,
      { releaseCandidate, endpointFingerprint, now },
    );
    const backupSummary = validateSouthCarolinaProductionBackupEvidence(backup.value, {
      releaseCandidate,
      endpointFingerprint,
      preflightCapturedAtUtc: preflightSummary.capturedAtUtc,
      now,
    });
    const authorizationSummary = validateSouthCarolinaProductionAuthorization(
      authorization.value,
      {
        releaseCandidate,
        preflightSha256: preflight.sha256,
        backupManifestSha256: backup.sha256,
        now,
      },
    );
    return { preflightSummary, backupSummary, authorizationSummary };
  };
  const rawAuthorizationId = typeof authorization.value?.authorizationId === "string"
    ? authorization.value.authorizationId.trim()
    : "";
  const receiptPath = parsed.receiptPath ?? defaultReceiptPath(
    packageArtifact.sha256,
    rawAuthorizationId || "invalid-authorization",
  );
  const plan = await buildSouthCarolinaPrecinctGisPlan({
    root,
    years: [2016, 2020, 2024],
  });

  if (parsed.recoverReceipt) {
    if (
      environment.CRM_DATABASE_ENVIRONMENT !== "production-read-only"
      || environment.CRM_SC_PRECINCT_GEOGRAPHY_HIDDEN_RECEIPT_RECOVERY
        !== packageArtifact.sha256
      || environment.CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256
        !== authorization.sha256
    ) {
      throw new Error("South Carolina hidden receipt recovery is not explicitly read-only and hash-authorized");
    }
    const reservation = reserveReceipt(
      root,
      receiptPath,
      packageArtifact.sha256,
      authorization.sha256,
      { allowExisting: true },
    );
    let sql;
    try {
      sql = (options.postgresFactory ?? postgres)(databaseUrl, {
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
        connection: {
          application_name: "civicresultmaps-sc-precinct-hidden-receipt-recovery",
          default_transaction_read_only: true,
        },
      });
    } catch (error) {
      if (reservation.disposition === "created" && existsSync(reservation.pending)) {
        unlinkSync(reservation.pending);
      }
      throw error;
    }
    let recovered;
    try {
      recovered = await sql.begin("read only", async (nv) => {
        const persistedAudit = await readSouthCarolinaPersistedProductionReleaseAudit(
          nv,
          { id: releaseCandidate.id, sha256: packageArtifact.sha256 },
        );
        const committedAt = new Date(persistedAudit.transaction.executedAtUtc);
        if (committedAt.getTime() > currentTime().getTime()) {
          throw new Error("South Carolina hidden receipt recovery found a future commit timestamp");
        }
        const evidence = validateEvidenceAt(committedAt);
        const expectedAudit = {
          releasePackage: { path: parsed.packagePath, sha256: packageArtifact.sha256 },
          authorization: { path: parsed.authorizationPath, sha256: authorization.sha256 },
          preflight: { path: parsed.preflightPath, sha256: preflight.sha256 },
          backupManifest: {
            sha256: backup.sha256,
            dumpSha256: evidence.backupSummary.dumpSha256,
          },
          authorizationId: evidence.authorizationSummary.authorizationId,
          endpointFingerprint,
          transaction: persistedAudit.transaction,
        };
        if (JSON.stringify(persistedAudit) !== JSON.stringify(expectedAudit)) {
          throw new Error("South Carolina hidden receipt recovery evidence does not match the durable database audit");
        }
        const executionContext = {
          mode: "production_release",
          releasePackageSha256: packageArtifact.sha256,
          releaseCandidateId: releaseCandidate.id,
          databaseName: evidence.preflightSummary.databaseName,
          productionReleaseAudit: persistedAudit,
        };
        const validation = await validateSouthCarolinaPrecinctGisClient(nv, plan, {
          executionContext,
          readOnlySession: true,
        });
        if (Number(validation.revision) !== persistedAudit.transaction.publicRevision) {
          throw new Error("South Carolina hidden receipt recovery public revision drifted");
        }
        return { persistedAudit, evidence, validation, executionContext };
      });
    } catch (error) {
      if (reservation.disposition === "created" && existsSync(reservation.pending)) {
        unlinkSync(reservation.pending);
      }
      throw error;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const recoveredTransaction = {
      database: recovered.validation.database,
      executionMode: "production_release",
      productionMutationPerformed: true,
      publicDeliveryAuthorized: false,
      releaseCandidate: recovered.validation.releaseCandidate,
      productionReleaseAudit: recovered.persistedAudit,
      revision: recovered.persistedAudit.transaction.publicRevision,
      years: recovered.validation.years,
      disposition: "recovered_existing",
    };
    const receiptDocument = {
      schemaVersion: 1,
      state: "SC",
      decision: "COMMITTED_HIDDEN_NOT_PUBLIC",
      releaseCandidate: {
        id: releaseCandidate.id,
        path: parsed.packagePath,
        sha256: packageArtifact.sha256,
      },
      committedAtUtc: recovered.persistedAudit.transaction.executedAtUtc,
      endpointFingerprint,
      authorization: {
        id: recovered.evidence.authorizationSummary.authorizationId,
        path: authorization.path,
        sha256: authorization.sha256,
        approvedBy: recovered.evidence.authorizationSummary.approvedBy,
      },
      preflight: { path: preflight.path, sha256: preflight.sha256 },
      backup: {
        manifestSha256: backup.sha256,
        dumpSha256: recovered.evidence.backupSummary.dumpSha256,
      },
      transaction: recoveredTransaction,
      validation: recovered.validation,
      recovery: {
        recoveredAtUtc: currentTime().toISOString(),
        productionMutationPerformed: false,
      },
      productionMutationPerformed: true,
      canonicalManifestChanged: false,
      publicFileWritten: false,
      publicDeliveryAuthorized: false,
    };
    const receiptArtifact = finishReceipt(reservation, receiptDocument);
    return {
      mode: "recover_receipt",
      decision: "RECOVERED_HIDDEN_RECEIPT",
      releaseCandidate: receiptDocument.releaseCandidate,
      revision: recoveredTransaction.revision,
      productionMutationPerformed: false,
      publicDeliveryAuthorized: false,
      receipt: { path: receiptPath, ...receiptArtifact },
    };
  }

  const initialEvidence = validateEvidenceAt(currentTime());
  if (
    environment.CRM_DATABASE_ENVIRONMENT !== "production"
    || environment.CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_WRITES !== packageArtifact.sha256
  ) {
    throw new Error("South Carolina production writes are not explicitly package-authorized");
  }
  if (
    environment.CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID
      !== initialEvidence.authorizationSummary.authorizationId
    || environment.CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256
      !== authorization.sha256
  ) {
    throw new Error("South Carolina production authorization environment acknowledgement drifted");
  }
  const reservation = reserveReceipt(
    root,
    receiptPath,
    packageArtifact.sha256,
    authorization.sha256,
  );
  let sql;
  try {
    sql = (options.postgresFactory ?? postgres)(databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: { application_name: "civicresultmaps-sc-precinct-production-release" },
    });
  } catch (error) {
    if (existsSync(reservation.pending)) unlinkSync(reservation.pending);
    throw error;
  }
  let transactionBodyCompleted = false;
  let committed;
  try {
    committed = await sql.begin(async (nv) => {
      const transactionNow = currentTime();
      const finalEvidence = validateEvidenceAt(transactionNow);
      const migration0009 = await ensureSouthCarolinaDerivationConstraint(
        nv,
        migration0009Artifact,
      );
      const revisions = await nv.unsafe(
        "select revision::int revision from public_data_revisions where scope='public' for update",
      );
      if (revisions.length !== 1) throw new Error("South Carolina production public revision is missing");
      const expectedRevision = Number(revisions[0].revision) + 1;
      const releaseAudit = {
        releasePackage: { path: parsed.packagePath, sha256: packageArtifact.sha256 },
        authorization: { path: parsed.authorizationPath, sha256: authorization.sha256 },
        preflight: { path: parsed.preflightPath, sha256: preflight.sha256 },
        backupManifest: {
          sha256: backup.sha256,
          dumpSha256: finalEvidence.backupSummary.dumpSha256,
        },
        authorizationId: finalEvidence.authorizationSummary.authorizationId,
        endpointFingerprint,
        transaction: {
          executedAtUtc: transactionNow.toISOString(),
          publicRevision: expectedRevision,
        },
      };
      const executionContext = {
        mode: "production_release",
        releasePackageSha256: packageArtifact.sha256,
        releaseCandidateId: releaseCandidate.id,
        databaseName: finalEvidence.preflightSummary.databaseName,
        productionReleaseAudit: releaseAudit,
      };
      const applied = await applySouthCarolinaPrecinctGisTransaction(nv, plan, {
        executionContext,
      });
      if (applied.revision !== expectedRevision) {
        throw new Error("South Carolina production public revision increment drifted");
      }
      const validation = await validateSouthCarolinaPrecinctGisClient(nv, plan, {
        executionContext,
        readOnlySession: false,
      });
      transactionBodyCompleted = true;
      return {
        applied: { ...applied, migration0009 },
        validation,
        releaseAudit,
      };
    });
  } catch (error) {
    // A post-COMMIT connection failure is ambiguous. Keep the pending marker
    // once the transaction body completed so a retry cannot double-apply.
    if (!transactionBodyCompleted && existsSync(reservation.pending)) {
      unlinkSync(reservation.pending);
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const receiptDocument = {
    schemaVersion: 1,
    state: "SC",
    decision: "COMMITTED_HIDDEN_NOT_PUBLIC",
    releaseCandidate: {
      id: releaseCandidate.id,
      path: parsed.packagePath,
      sha256: packageArtifact.sha256,
    },
    committedAtUtc: committed.releaseAudit.transaction.executedAtUtc,
    endpointFingerprint,
    authorization: {
      id: initialEvidence.authorizationSummary.authorizationId,
      path: authorization.path,
      sha256: authorization.sha256,
      approvedBy: initialEvidence.authorizationSummary.approvedBy,
    },
    preflight: { path: preflight.path, sha256: preflight.sha256 },
    backup: {
      manifestSha256: backup.sha256,
      dumpSha256: initialEvidence.backupSummary.dumpSha256,
    },
    transaction: committed.applied,
    validation: committed.validation,
    productionMutationPerformed: true,
    canonicalManifestChanged: false,
    publicFileWritten: false,
    publicDeliveryAuthorized: false,
  };
  const receiptArtifact = finishReceipt(reservation, receiptDocument);
  return {
    mode: "apply",
    decision: receiptDocument.decision,
    releaseCandidate: receiptDocument.releaseCandidate,
    revision: committed.applied.revision,
    productionMutationPerformed: true,
    publicDeliveryAuthorized: false,
    receipt: { path: receiptPath, ...receiptArtifact },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSouthCarolinaProductionRelease().then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
