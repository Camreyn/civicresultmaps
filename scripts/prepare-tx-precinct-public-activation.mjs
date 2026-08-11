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
  inspectTexasPublicActivationPlan,
} from "./lib/tx-precinct-public-activation.mjs";

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
      throw new Error("Unknown Texas public-activation option: " + arg);
    }
  }
  if (!packagePath || !packageSha256) {
    throw new Error(
      "Texas public activation requires --package and --package-sha256",
    );
  }
  return { packagePath, packageSha256, write };
}

function immutableWrite(root, relativePath, bytes) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", "precinct-public-activations", "TX");
  if (!absolutePath.startsWith(allowed + path.sep)) {
    throw new Error("Texas activation evidence escapes its fixed .etl root");
  }
  if (existsSync(absolutePath)) {
    if (!readFileSync(absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Texas activation evidence");
    }
    return "verified_existing";
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, { mode: 0o600, flag: "wx" });
  return "created";
}

export function writeTexasActivationTrackedOutputs(outputs) {
  if (outputs.length !== 5 || new Set(outputs.map((item) => item.path)).size !== 5) {
    throw new Error("Texas activation requires exactly five unique tracked outputs");
  }
  const staged = [];
  const committed = [];
  try {
    for (const output of outputs) {
      const before = readFileSync(output.absolutePath);
      if (before.length !== output.preimage.byteCount) {
        throw new Error("Texas activation target changed after plan: " + output.path);
      }
      const currentHash = createHash("sha256").update(before).digest("hex");
      if (currentHash !== output.preimage.sha256) {
        throw new Error("Texas activation target preimage drifted: " + output.path);
      }
      const temporaryPath = output.absolutePath
        + ".crm-tx-activation-" + randomUUID() + ".tmp";
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
        + ".crm-tx-rollback-" + randomUUID() + ".tmp";
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

export async function prepareTexasPublicActivation(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const built = inspectTexasPublicActivationPlan({ ...options, root });
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
  const trackedOutputs = writeTexasActivationTrackedOutputs(built.outputs);
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
  prepareTexasPublicActivation(parseArguments(process.argv.slice(2))).then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
