import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildMinnesotaReleaseReview,
  MINNESOTA_RELEASE_REVIEW_ROOT,
} from "./lib/mn-precinct-release-review.mjs";

function parseArguments(args) {
  const packagePath = args.find((arg) => arg.startsWith("--package="))
    ?.slice("--package=".length);
  const overlayPath = args.find((arg) => arg.startsWith("--overlay="))
    ?.slice("--overlay=".length);
  const write = args.includes("--write");
  for (const arg of args) {
    if (
      arg !== "--write"
      && !arg.startsWith("--package=")
      && !arg.startsWith("--overlay=")
    ) {
      throw new Error("Unknown Minnesota release-review option: " + arg);
    }
  }
  if (!packagePath) throw new Error("--package is required");
  if (!overlayPath) throw new Error("--overlay is required");
  return { packagePath, overlayPath, write };
}

function outputTarget(root, outputRoot) {
  const relativePath = path.posix.join(outputRoot, "review.json");
  if (
    relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(MINNESOTA_RELEASE_REVIEW_ROOT + "/")
  ) {
    throw new Error("Minnesota release review output path is unsafe");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...MINNESOTA_RELEASE_REVIEW_ROOT.split("/"));
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Minnesota release review escapes its .etl root");
  }
  return { absolute, relativePath };
}

export function prepareMinnesotaReleaseReview(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = buildMinnesotaReleaseReview({
    root,
    packagePath: options.packagePath,
    overlayPath: options.overlayPath,
  });
  const target = outputTarget(root, built.outputRoot);
  let disposition = options.write ? "created" : "dry_run";
  if (existsSync(target.absolute)) {
    if (!readFileSync(target.absolute).equals(built.bytes)) {
      throw new Error(
        "Refusing to overwrite a different Minnesota release review: "
        + target.relativePath,
      );
    }
    disposition = options.write ? "verified_existing" : "dry_run_existing";
  }
  if (options.write && disposition === "created") {
    mkdirSync(path.dirname(target.absolute), { recursive: true });
    writeFileSync(target.absolute, built.bytes);
  }
  return {
    mode: options.write ? "write" : "dry_run",
    decision: built.document.decision,
    output: target.relativePath,
    reviewSha256: built.reviewSha256,
    isolatedDiffGate: built.document.isolatedDiffGate,
    safety: built.document.safety,
    summary: built.document.summary,
    excludedWorkClasses: built.document.excludedWorkClasses,
    remainingGates: built.document.remainingGates,
    disposition,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(JSON.stringify(prepareMinnesotaReleaseReview(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
