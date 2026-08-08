import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMinnesotaPrecinctReleaseCandidate,
  MINNESOTA_RELEASE_CANDIDATE_ROOT,
  minnesotaReleaseCandidateOutputRoot,
} from "./lib/mn-precinct-release-candidate.mjs";

function parseArguments(args) {
  const write = args.includes("--write");
  const validationArgument = args.find((argument) =>
    argument.startsWith("--validation-report="));
  for (const argument of args) {
    if (
      argument !== "--write"
      && !argument.startsWith("--validation-report=")
    ) {
      throw new Error("Unknown Minnesota release-candidate option: " + argument);
    }
  }
  const validationReportPath = validationArgument
    ?.slice("--validation-report=".length)
    .trim();
  if (validationArgument && !validationReportPath) {
    throw new Error("--validation-report requires a path under .etl");
  }
  return { write, validationReportPath };
}

function outputPath(root, relativePath) {
  if (
    !relativePath.startsWith(MINNESOTA_RELEASE_CANDIDATE_ROOT + "/")
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(
      "Minnesota release output must remain inside "
      + MINNESOTA_RELEASE_CANDIDATE_ROOT,
    );
  }
  const releaseRoot = path.resolve(
    root,
    ...MINNESOTA_RELEASE_CANDIDATE_ROOT.split("/"),
  );
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!target.startsWith(releaseRoot + path.sep)) {
    throw new Error("Minnesota release output escapes the local candidate root");
  }
  return target;
}

function preflightImmutableOutputs(root, files) {
  return files.map((file) => {
    const absolutePath = outputPath(root, file.path);
    if (!existsSync(absolutePath)) {
      return { ...file, absolutePath, disposition: "created" };
    }
    const existing = readFileSync(absolutePath);
    if (!existing.equals(file.bytes)) {
      throw new Error(
        "Refusing to overwrite a different Minnesota release candidate: "
        + file.path,
      );
    }
    return { ...file, absolutePath, disposition: "verified_existing" };
  });
}

function writeImmutableOutputs(outputs) {
  for (const output of outputs) {
    if (output.disposition === "verified_existing") continue;
    mkdirSync(path.dirname(output.absolutePath), { recursive: true });
    writeFileSync(output.absolutePath, output.bytes);
  }
}

export function prepareMinnesotaPrecinctReleaseCandidate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = buildMinnesotaPrecinctReleaseCandidate({
    root,
    validationReportPath: options.validationReportPath,
  });
  const packageSha256 = createHash("sha256")
    .update(built.packageBytes)
    .digest("hex");
  const releaseRoot = minnesotaReleaseCandidateOutputRoot(packageSha256);
  const packagePath = path.posix.join(releaseRoot, "release-candidate.json");
  const files = [
    { path: packagePath, bytes: built.packageBytes },
    ...built.draftManifests.map(({ path: draftPath, bytes }) => ({
      path: path.posix.join(releaseRoot, draftPath),
      bytes,
    })),
  ];
  const dispositions = options.write
    ? preflightImmutableOutputs(root, files)
    : files.map((file) => ({ ...file, disposition: "dry_run" }));
  if (options.write) writeImmutableOutputs(dispositions);

  return {
    mode: options.write ? "write" : "dry_run",
    decision: built.packageDocument.decision,
    disposition: built.packageDocument.disposition,
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    canonicalRegistryChanged: false,
    gitPublicationPerformed: false,
    output: packagePath,
    packageByteCount: built.packageBytes.length,
    packageSha256,
    draftManifestCount: built.draftManifests.length,
    totalReportingUnits: built.packageDocument.totals.reportingUnits,
    totalGeometryFeatures: built.packageDocument.totals.geometryFeatures,
    pendingGates: built.packageDocument.goNoGoGates
      .filter((gate) => gate.status === "pending")
      .map((gate) => gate.id),
    files: dispositions.map((file) => ({
      path: file.path,
      byteCount: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      disposition: file.disposition,
    })),
  };
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = prepareMinnesotaPrecinctReleaseCandidate(args);
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
