import { createHash, randomUUID } from "node:crypto";
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
import {
  inspectWisconsinPublicActivationPlan,
} from "./lib/wi-local-public-activation.mjs";

function parseArguments(args) {
  const packagePath = args.find((arg) => arg.startsWith("--package="))
    ?.slice("--package=".length);
  const packageSha256 = args.find((arg) => arg.startsWith("--package-sha256="))
    ?.slice("--package-sha256=".length);
  const write = args.includes("--write");
  for (const arg of args) {
    if (
      arg !== "--write"
      && !arg.startsWith("--package=")
      && !arg.startsWith("--package-sha256=")
    ) {
      throw new Error("Unknown Wisconsin public-activation option: " + arg);
    }
  }
  if (!packagePath || !packageSha256) {
    throw new Error(
      "Wisconsin public activation requires --package and --package-sha256",
    );
  }
  return { packagePath, packageSha256, write };
}

function immutableWrite(root, relativePath, bytes) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", "precinct-public-activations", "WI");
  if (!absolutePath.startsWith(allowed + path.sep)) {
    throw new Error("Wisconsin activation evidence escapes its fixed .etl root");
  }
  if (existsSync(absolutePath)) {
    if (!readFileSync(absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Wisconsin activation evidence");
    }
    return "verified_existing";
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, { mode: 0o600, flag: "wx" });
  return "created";
}

export function writeWisconsinActivationTrackedOutputs(outputs) {
  if (outputs.length !== 4 || new Set(outputs.map((item) => item.path)).size !== 4) {
    throw new Error("Wisconsin activation requires exactly four unique tracked outputs");
  }
  const staged = [];
  const committed = [];
  try {
    for (const output of outputs) {
      const before = readFileSync(output.absolutePath);
      if (before.length !== output.preimage.byteCount) {
        throw new Error("Wisconsin activation target changed after plan: " + output.path);
      }
      const currentHash = createHash("sha256").update(before).digest("hex");
      if (currentHash !== output.preimage.sha256) {
        throw new Error("Wisconsin activation target preimage drifted: " + output.path);
      }
      const temporaryPath = output.absolutePath
        + ".crm-wi-activation-" + randomUUID() + ".tmp";
      writeFileSync(temporaryPath, output.bytes, { flag: "wx" });
      staged.push({ output, before, temporaryPath });
    }
    for (const item of staged) {
      renameSync(item.temporaryPath, item.output.absolutePath);
      committed.push(item);
    }
  } catch (error) {
    for (const item of staged) {
      if (existsSync(item.temporaryPath)) unlinkSync(item.temporaryPath);
    }
    for (const item of committed.reverse()) {
      const rollbackPath = item.output.absolutePath
        + ".crm-wi-rollback-" + randomUUID() + ".tmp";
      writeFileSync(rollbackPath, item.before, { flag: "wx" });
      renameSync(rollbackPath, item.output.absolutePath);
    }
    throw error;
  }
  return outputs.map((output) => ({
    path: output.path,
    sha256: output.sha256,
    byteCount: output.byteCount,
  }));
}

export async function prepareWisconsinPublicActivation(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = inspectWisconsinPublicActivationPlan({ ...options, root });
  if (!options.write) {
    return {
      mode: "plan",
      decision: built.plan.decision,
      releaseCandidate: built.plan.releaseCandidate,
      activationCandidate: {
        path: built.outputPath,
        sha256: built.sha256,
        byteCount: built.bytes.length,
      },
      trackedOutputs: built.plan.trackedOutputs,
      productionMutationPerformed: false,
      publicEndpointsRemainDatabaseGated: true,
    };
  }
  const trackedOutputs = writeWisconsinActivationTrackedOutputs(built.outputs);
  const evidenceDisposition = immutableWrite(root, built.outputPath, built.bytes);
  return {
    mode: "write",
    decision: built.plan.decision,
    releaseCandidate: built.plan.releaseCandidate,
    activationCandidate: {
      path: built.outputPath,
      sha256: built.sha256,
      byteCount: built.bytes.length,
      disposition: evidenceDisposition,
    },
    trackedOutputs,
    productionMutationPerformed: false,
    publicEndpointsRemainDatabaseGated: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareWisconsinPublicActivation(parseArguments(process.argv.slice(2))).then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
