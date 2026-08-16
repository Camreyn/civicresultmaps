import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { inspectReleaseArtifact } from "./lib/nc-local-release-candidate.mjs";
import {
  assertNorthCarolinaReleaseCandidateDocument,
  collectNorthCarolinaProductionPreflight,
  productionEndpointFingerprint,
  sha256,
} from "./lib/nc-local-production-preflight.mjs";

// Deliberately do not load .env.local. A production read is opt-in and must use
// one explicitly supplied unpooled URL plus the exact release-package hash.

function parseArguments(args) {
  const packageArgument = args.find((arg) => arg.startsWith("--package="));
  const reportArgument = args.find((arg) => arg.startsWith("--report="));
  const connectReadOnly = args.includes("--connect-read-only");
  for (const arg of args) {
    if (
      arg !== "--connect-read-only"
      && !arg.startsWith("--package=")
      && !arg.startsWith("--report=")
    ) {
      throw new Error("Unknown North Carolina production-preflight option: " + arg);
    }
  }
  const packagePath = packageArgument?.slice("--package=".length);
  if (!packagePath) {
    throw new Error("--package is required for North Carolina production preflight");
  }
  return {
    packagePath,
    reportPath: reportArgument?.slice("--report=".length),
    connectReadOnly,
  };
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

function safeReportPath(root, requested, packageSha256, reportSha256) {
  const relativePath = requested ?? path.posix.join(
    ".etl",
    "production-preflight-candidates",
    "NC",
    "nc-local-production-preflight-"
      + packageSha256.slice(0, 12)
      + "-"
      + reportSha256.slice(0, 12)
      + ".json",
  );
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(".etl/production-preflight-candidates/NC/")
  ) {
    throw new Error("North Carolina production preflight report must remain in its .etl root");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", "production-preflight-candidates", "NC");
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("North Carolina production preflight report escapes its .etl root");
  }
  return { relativePath, absolute };
}

function loadReleaseCandidate(root, relativePath) {
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(".etl/precinct-release-candidates/NC/")
    || !relativePath.endsWith("/release-candidate.json")
  ) {
    throw new Error("North Carolina production preflight package path is unsafe");
  }
  const artifact = inspectReleaseArtifact(root, relativePath, {
    allowedRoots: [".etl/precinct-release-candidates/NC/"],
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  const releaseCandidate = assertNorthCarolinaReleaseCandidateDocument(
    document,
    artifact.sha256,
  );
  for (const manifest of releaseCandidate.canonicalManifestPreimages) {
    const current = inspectReleaseArtifact(root, manifest.path, {
      allowedRoots: ["data/precinct-geometry/NC/"],
      byteCount: manifest.byteCount,
      sha256: manifest.sha256,
    });
    if (!current.bytes.length) throw new Error("Canonical manifest is empty");
  }
  return { artifact, document, releaseCandidate };
}

export async function runNorthCarolinaProductionPreflight(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath
    ? options
    : parseArguments(process.argv.slice(2));
  const loaded = loadReleaseCandidate(root, parsed.packagePath);
  if (!parsed.connectReadOnly) {
    return {
      mode: "plan",
      state: "NC",
      releasePackageSha256: loaded.artifact.sha256,
      connectionOpened: false,
      productionMutationPerformed: false,
      requiredEnvironment: {
        CRM_DATABASE_ENVIRONMENT: "production-read-only",
        CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK: loaded.artifact.sha256,
        unpooledUrl: "POSTGRES_URL_NON_POOLING or POSTGRES_DATABASE_URL_UNPOOLED",
      },
    };
  }
  if (process.env.CRM_DATABASE_ENVIRONMENT !== "production-read-only") {
    throw new Error("North Carolina production preflight requires production-read-only environment");
  }
  if (
    process.env.CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK
      !== loaded.artifact.sha256
  ) {
    throw new Error("North Carolina production preflight acknowledgement must equal the package SHA-256");
  }
  const databaseUrl = productionUrl();
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  const sql = (options.postgresFactory ?? postgres)(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      application_name: "civicresultmaps-nc-local-production-preflight",
      default_transaction_read_only: true,
    },
  });
  let report;
  try {
    report = await sql.begin("read only", (nv) =>
      collectNorthCarolinaProductionPreflight(nv, {
        capturedAtUtc: new Date().toISOString(),
        endpointFingerprint,
        releaseCandidate: loaded.releaseCandidate,
      }));
  } finally {
    await sql.end({ timeout: 5 });
  }
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8");
  const reportSha256 = sha256(bytes);
  const output = safeReportPath(
    root,
    parsed.reportPath,
    loaded.artifact.sha256,
    reportSha256,
  );
  if (existsSync(output.absolute)) {
    if (!readFileSync(output.absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different North Carolina preflight evidence");
    }
  } else {
    mkdirSync(path.dirname(output.absolute), { recursive: true });
    writeFileSync(output.absolute, bytes);
  }
  return {
    mode: "read_only_production_preflight",
    state: "NC",
    releasePackageSha256: loaded.artifact.sha256,
    endpointFingerprint,
    connectionOpened: true,
    productionMutationPerformed: false,
    reportPath: output.relativePath,
    reportByteCount: bytes.length,
    reportSha256,
    migration0008Status: report.migration0008.status,
    migration0009Status: report.migration0009.status,
    invalidConstraints: report.invalidConstraints,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runNorthCarolinaProductionPreflight(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
