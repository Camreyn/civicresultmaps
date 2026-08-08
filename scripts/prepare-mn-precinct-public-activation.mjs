import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectMinnesotaPublicActivationPlan,
} from "./lib/mn-precinct-public-activation.mjs";

function parseArguments(args) {
  const flags = new Set(["--write"]);
  const names = new Set([
    "--package",
    "--package-sha256",
    "--production-receipt",
    "--production-receipt-sha256",
    "--blob-evidence",
    "--blob-evidence-sha256",
  ]);
  const values = new Map();
  for (const arg of args) {
    if (flags.has(arg)) continue;
    const separator = arg.indexOf("=");
    const name = separator < 0 ? arg : arg.slice(0, separator);
    if (!names.has(name) || separator < 0) {
      throw new Error("Unknown Minnesota public-activation option: " + arg);
    }
    values.set(name, arg.slice(separator + 1));
  }
  for (const required of [
    "--package",
    "--package-sha256",
    "--production-receipt",
    "--production-receipt-sha256",
    "--blob-evidence",
    "--blob-evidence-sha256",
  ]) {
    if (!values.get(required)) throw new Error(required + " is required");
  }
  return {
    packagePath: values.get("--package"),
    packageSha256: values.get("--package-sha256"),
    productionReceiptPath: values.get("--production-receipt"),
    productionReceiptSha256: values.get("--production-receipt-sha256"),
    blobEvidencePath: values.get("--blob-evidence"),
    blobEvidenceSha256: values.get("--blob-evidence-sha256"),
    write: args.includes("--write"),
  };
}

function inspectTrackedOutput(output) {
  if (!existsSync(output.absolutePath)) {
    throw new Error("Minnesota activation target is missing: " + output.path);
  }
  const current = readFileSync(output.absolutePath);
  if (current.equals(output.bytes)) {
    return { output, current, disposition: "verified_existing" };
  }
  if (
    current.length !== output.preimage.byteCount
    || createHash("sha256").update(current).digest("hex")
      !== output.preimage.sha256
  ) {
    throw new Error("Refusing to overwrite drifted activation target " + output.path);
  }
  return { output, current, disposition: "updated" };
}

function replaceAtomically(absolutePath, bytes) {
  const temporaryPath = absolutePath + ".crm-mn-activation-" + randomUUID() + ".tmp";
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx" });
    renameSync(temporaryPath, absolutePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function writeMinnesotaActivationTrackedOutputs(outputs) {
  if (!Array.isArray(outputs) || outputs.length !== 5) {
    throw new Error("Minnesota activation requires exactly five tracked outputs");
  }
  const paths = new Set(outputs.map((output) => output.absolutePath));
  if (paths.size !== outputs.length) {
    throw new Error("Minnesota activation tracked outputs must be unique");
  }

  // Validate every target before the first mutation. Each file is checked again
  // immediately before replacement so a concurrent drift triggers rollback.
  const prepared = outputs.map(inspectTrackedOutput);
  const committed = [];
  try {
    for (const item of prepared) {
      if (item.disposition === "verified_existing") continue;
      const current = readFileSync(item.output.absolutePath);
      if (!current.equals(item.current)) {
        throw new Error(
          "Minnesota activation target changed after preflight: " + item.output.path,
        );
      }
      replaceAtomically(item.output.absolutePath, item.output.bytes);
      committed.push(item);
    }
  } catch (error) {
    const rollbackFailures = [];
    for (const item of committed.reverse()) {
      try {
        const current = readFileSync(item.output.absolutePath);
        if (!current.equals(item.output.bytes)) {
          throw new Error("target changed after activation write");
        }
        replaceAtomically(item.output.absolutePath, item.current);
      } catch (rollbackError) {
        rollbackFailures.push(item.output.path + ": " + rollbackError.message);
      }
    }
    if (rollbackFailures.length) {
      throw new Error(
        (error instanceof Error ? error.message : String(error))
        + "; activation rollback also failed: " + rollbackFailures.join("; "),
      );
    }
    throw error;
  }
  return prepared.map((item) => ({
    path: item.output.path,
    disposition: item.disposition,
    byteCount: item.output.byteCount,
    sha256: item.output.sha256,
  }));
}

function writeImmutable(root, relativePath, bytes) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowedRoot = path.resolve(root, ".etl", "precinct-public-activations", "MN");
  if (!absolutePath.startsWith(allowedRoot + path.sep)) {
    throw new Error("Minnesota activation candidate output escapes its fixed root");
  }
  if (existsSync(absolutePath)) {
    if (!readFileSync(absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Minnesota activation evidence");
    }
    return { disposition: "verified_existing", absolutePath };
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, { mode: 0o600 });
  return { disposition: "created", absolutePath };
}

export async function prepareMinnesotaPublicActivation(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = inspectMinnesotaPublicActivationPlan({ ...options, root });
  if (!options.write) {
    return {
      mode: "plan",
      decision: "PROTECTED_PREVIEW_REQUIRED",
      releaseCandidate: built.plan.releaseCandidate,
      activationCandidate: {
        path: built.outputPath,
        sha256: built.sha256,
        byteCount: built.bytes.length,
      },
      deliveryOrigin: built.plan.blobPublication.deliveryOrigin,
      manifestCount: built.plan.manifests.length,
      trackedOutputs: built.plan.trackedOutputs,
      productionMutationPerformed: false,
      databasePublicationStatusChanged: false,
      deploymentPromoted: false,
      gitPublicationPerformed: false,
    };
  }
  const candidate = writeImmutable(root, built.outputPath, built.bytes);
  const trackedOutputs = writeMinnesotaActivationTrackedOutputs(built.outputs);
  return {
    mode: "write_preview_candidate",
    decision: "PROTECTED_PREVIEW_REQUIRED",
    releaseCandidate: built.plan.releaseCandidate,
    activationCandidate: {
      path: built.outputPath,
      sha256: built.sha256,
      byteCount: built.bytes.length,
      disposition: candidate.disposition,
    },
    deliveryOrigin: built.plan.blobPublication.deliveryOrigin,
    manifestCount: built.plan.manifests.length,
    trackedOutputs,
    productionMutationPerformed: false,
    databasePublicationStatusChanged: false,
    deploymentPromoted: false,
    gitPublicationPerformed: false,
  };
}

async function main() {
  const result = await prepareMinnesotaPublicActivation(
    parseArguments(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
