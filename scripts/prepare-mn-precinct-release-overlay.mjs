import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildMinnesotaReleaseOverlay,
  MINNESOTA_RELEASE_OVERLAY_ROOT,
} from "./lib/mn-precinct-release-overlay.mjs";

function parseArguments(args) {
  const packagePath = args.find((arg) => arg.startsWith("--package="))
    ?.slice("--package=".length);
  const write = args.includes("--write");
  for (const arg of args) {
    if (arg !== "--write" && !arg.startsWith("--package=")) {
      throw new Error("Unknown Minnesota release-overlay option: " + arg);
    }
  }
  if (!packagePath) throw new Error("--package is required");
  return { packagePath, write };
}

function absoluteOutput(root, outputRoot, relativePath) {
  const combined = path.posix.join(outputRoot, relativePath);
  if (
    combined.includes("\\")
    || combined.split("/").includes("..")
    || !combined.startsWith(MINNESOTA_RELEASE_OVERLAY_ROOT + "/")
  ) {
    throw new Error("Minnesota release overlay output path is unsafe");
  }
  const absolute = path.resolve(root, ...combined.split("/"));
  const allowed = path.resolve(root, ...MINNESOTA_RELEASE_OVERLAY_ROOT.split("/"));
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Minnesota release overlay escapes its .etl root");
  }
  return { relativePath: combined, absolute };
}

export function prepareMinnesotaReleaseOverlay(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = buildMinnesotaReleaseOverlay({
    root,
    packagePath: options.packagePath,
    gitInspector: options.gitInspector,
  });
  const files = built.outputs.map((output) => {
    const target = absoluteOutput(root, built.outputRoot, output.path);
    let disposition = options.write ? "created" : "dry_run";
    if (existsSync(target.absolute)) {
      if (!readFileSync(target.absolute).equals(output.bytes)) {
        throw new Error(
          "Refusing to overwrite a different Minnesota release overlay: "
          + target.relativePath,
        );
      }
      disposition = options.write ? "verified_existing" : "dry_run_existing";
    }
    return { ...target, bytes: output.bytes, disposition };
  });
  if (options.write) {
    for (const file of files) {
      if (file.disposition === "verified_existing") continue;
      mkdirSync(path.dirname(file.absolute), { recursive: true });
      writeFileSync(file.absolute, file.bytes);
    }
  }
  return {
    mode: options.write ? "write" : "dry_run",
    decision: built.document.decision,
    output: path.posix.join(built.outputRoot, "overlay.json"),
    overlaySha256: built.overlaySha256,
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    gitMutationPerformed: false,
    summary: built.document.summary,
    reviewQueue: built.document.reviewQueue,
    files: files.map(({ absolute: _absolute, bytes, ...file }) => ({
      ...file,
      byteCount: bytes.length,
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(JSON.stringify(prepareMinnesotaReleaseOverlay(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

