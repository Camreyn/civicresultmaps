import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
  productionEndpointFingerprint,
  sha256,
} from "./lib/mn-precinct-production-preflight.mjs";
import {
  applyMinnesotaProductionReleaseTransaction,
  buildMinnesotaProductionAuthorizationTemplate,
  readAndVerifyEvidenceFile,
  validateMinnesotaProductionAuthorization,
  validateMinnesotaProductionBackupEvidence,
  validateMinnesotaProductionPreflightEvidence,
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
    "--receipt",
  ]);
  const flags = new Set(["--apply", "--write-authorization-template"]);
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
    receiptPath: value("--receipt"),
    apply: args.includes("--apply"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
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

export async function runMinnesotaProductionRelease(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath
    ? options
    : parseArguments(process.argv.slice(2));
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
  if (!parsed.apply) {
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
      requiredEvidence: [
        "fresh read-only production preflight",
        "fresh checksummed backup with restoration verification",
        "named authorizer, operator, verifier, and rollback owner",
        "active deployment window and exact GO_PRODUCTION authorization record",
      ],
    };
  }

  if (!parsed.preflightPath || !parsed.authorizationPath) {
    throw new Error("--preflight and --authorization are required for --apply");
  }
  const preflightArtifact = readAndVerifyEvidenceFile(root, parsed.preflightPath);
  const authorizationArtifact = readAndVerifyEvidenceFile(root, parsed.authorizationPath);
  const backupArtifact = safeTmpBackupManifest(parsed.backupManifestPath);
  const now = options.now ?? new Date();
  const databaseUrl = productionUrl();
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  const preflight = JSON.parse(preflightArtifact.bytes.toString("utf8"));
  const backup = backupArtifact.value;
  const authorization = JSON.parse(authorizationArtifact.bytes.toString("utf8"));
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
    context,
  );
  const backupDump = verifyBackupDump(backupArtifact);
  const authorizationEvidence = validateMinnesotaProductionAuthorization(
    authorization,
    {
      ...context,
      preflightSha256: preflightArtifact.sha256,
      backupManifestSha256: backupArtifact.sha256,
    },
  );
  if (process.env.CRM_DATABASE_ENVIRONMENT !== "production") {
    throw new Error("Minnesota production release requires CRM_DATABASE_ENVIRONMENT=production");
  }
  if (process.env.CRM_MN_PRECINCT_PRODUCTION_WRITES !== loaded.artifact.sha256) {
    throw new Error("Minnesota production-write acknowledgement must equal the package SHA-256");
  }
  if (
    process.env.CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID
      !== authorizationEvidence.authorizationId
  ) {
    throw new Error("Minnesota production authorization-ID acknowledgement is missing");
  }
  const migration = inspectReleaseArtifact(
    root,
    loaded.document.databaseActivationContract.migration.path,
    {
      byteCount: loaded.document.databaseActivationContract.migration.byteCount,
      sha256: loaded.document.databaseActivationContract.migration.sha256,
    },
  );
  const plan = buildMinnesotaPrecinctGisPlan({ root });
  const sql = (options.postgresFactory ?? postgres)(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      application_name: "civicresultmaps-mn-precinct-production-release",
    },
  });
  let transaction;
  try {
    transaction = await sql.begin((tx) =>
      applyMinnesotaProductionReleaseTransaction(tx, {
        releaseCandidate: loaded.releaseCandidate,
        packageDocument: loaded.document,
        migrationBytes: migration.bytes,
        databaseName: preflightEvidence.databaseName,
        preflightReport: preflight,
        plan,
        testOnlyFailBeforeCommit: options.testOnlyFailBeforeCommit,
      }));
  } finally {
    await sql.end({ timeout: 5 });
  }
  const receipt = {
    schemaVersion: 1,
    state: "MN",
    releaseCandidate: loaded.releaseCandidate,
    committedAtUtc: new Date().toISOString(),
    endpointFingerprint,
    authorization: authorizationEvidence,
    preflight: {
      path: preflightArtifact.path,
      sha256: preflightArtifact.sha256,
      ...preflightEvidence,
    },
    backup: {
      manifestPath: backupArtifact.path,
      manifestSha256: backupArtifact.sha256,
      ...backupEvidence,
      dumpByteCount: backupDump.byteCount,
    },
    transaction,
    productionMutationPerformed: true,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    publicDeliveryAuthorized: false,
  };
  const receiptTarget = outputPath(
    root,
    parsed.receiptPath,
    `mn-precinct-production-receipt-${loaded.artifact.sha256.slice(0, 12)}-${sha256(Buffer.from(JSON.stringify(receipt))).slice(0, 12)}.json`,
    "production-release-receipts",
  );
  return {
    mode: "production_hidden_load",
    state: "MN",
    decision: "COMMITTED_HIDDEN_NOT_PUBLIC",
    receipt: writeJson(receiptTarget, receipt),
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
