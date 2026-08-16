import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWisconsinLocalReleaseCandidate,
  wisconsinReleaseCandidateOutputRoot,
} from "./lib/wi-local-release-candidate.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function immutableWrite(root, relativePath, bytes) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const expectedRoot = path.resolve(root, ".etl", "precinct-release-candidates", "WI");
  if (!absolutePath.startsWith(expectedRoot + path.sep)) {
    throw new Error("Wisconsin release output escapes its content-addressed root");
  }
  if (existsSync(absolutePath)) {
    if (!readFileSync(absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Wisconsin release bytes: " + relativePath);
    }
    return "verified_existing";
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
  return "created";
}

export async function prepareWisconsinLocalReleaseCandidate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = await buildWisconsinLocalReleaseCandidate({
    root,
    validationReportPath: options.validationReportPath,
  });
  const packageSha256 = sha256(built.packageBytes);
  const outputRoot = wisconsinReleaseCandidateOutputRoot(packageSha256);
  const files = [
    { path: "release-candidate.json", bytes: built.packageBytes },
    ...built.draftManifests,
    ...built.deliveryAssets,
  ];
  const disposition = options.write
    ? files.map((file) => immutableWrite(
      root,
      path.posix.join(outputRoot, file.path),
      file.bytes,
    ))
    : [];
  return {
    mode: options.write ? "write" : "plan",
    decision: "NO_GO_PRODUCTION",
    state: "WI",
    releaseCandidate: {
      id: built.packageDocument.id,
      path: path.posix.join(outputRoot, "release-candidate.json"),
      sha256: packageSha256,
      byteCount: built.packageBytes.length,
    },
    totals: built.packageDocument.totals,
    fileCount: files.length,
    createdCount: disposition.filter((value) => value === "created").length,
    verifiedExistingCount: disposition.filter((value) => value === "verified_existing").length,
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--write" && !arg.startsWith("--validation-report="));
  if (unknown.length) throw new Error("Unknown Wisconsin release-candidate option: " + unknown[0]);
  const validationReportPath = args.find((arg) => arg.startsWith("--validation-report="))
    ?.slice("--validation-report=".length);
  console.log(JSON.stringify(await prepareWisconsinLocalReleaseCandidate({
    write: args.includes("--write"),
    validationReportPath,
  }), null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
