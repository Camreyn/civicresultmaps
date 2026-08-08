import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  inspectReleaseArtifact,
} from "./mn-precinct-release-candidate.mjs";

export const MINNESOTA_RELEASE_OVERLAY_ROOT =
  ".etl/precinct-release-overlays/MN";

const HUNK_REVIEW_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "src/app/globals.css",
  "src/app/results-explorer.tsx",
  "src/app/workspace-guided-links.tsx",
  "src/app/workspace-tabs.tsx",
  "src/db/native-import.ts",
  "src/db/neon-transaction.ts",
  "src/db/schema.ts",
  "src/lib/api.ts",
  "src/lib/api-version.ts",
  "src/lib/data-access.ts",
  "src/lib/state-year-results.ts",
]);

export const MINNESOTA_PACKAGE_SCRIPTS = Object.freeze([
  "build:precinct-delivery",
  "native:promote:local",
  "precinct-gis:collect:mn:2012",
  "precinct-gis:collect:mn:2016",
  "precinct-gis:collect:mn:2020",
  "precinct-gis:collect:mn:2024",
  "precinct-gis:delivery-candidates:mn",
  "precinct-gis:delivery-candidates:mn:write",
  "precinct-gis:delivery-publish:mn",
  "precinct-gis:plan:mn",
  "precinct-gis:production-preflight:mn",
  "precinct-gis:production-backup:mn",
  "precinct-gis:production-release:mn",
  "precinct-gis:public-activation:mn",
  "precinct-gis:publication-status:mn",
  "precinct-gis:rehearsal:mn:verify",
  "precinct-gis:release-candidate:mn",
  "precinct-gis:release-candidate:mn:write",
  "precinct-gis:release-overlay:mn",
  "precinct-gis:release-review:mn",
  "precinct-gis:replay:mn:2012",
  "precinct-gis:replay:mn:2016",
  "precinct-gis:replay:mn:2020",
  "precinct-gis:replay:mn:2024",
  "precinct-gis:setup:mn:local",
  "precinct-gis:validate:mn:local",
  "test:precinct-geometry:mn",
]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function defaultGit(root, args, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      "Git inspection failed: git " + args.join(" ") + "\n"
      + Buffer.from(result.stderr ?? []).toString("utf8"),
    );
  }
  return {
    status: result.status,
    stdout: Buffer.from(result.stdout ?? []),
  };
}

function gitState(root, relativePath, git = defaultGit) {
  const existsAtBase = git(
    root,
    ["cat-file", "-e", `HEAD:${relativePath}`],
    true,
  ).status === 0;
  if (!existsAtBase) {
    return {
      disposition: "added",
      base: null,
      patch: null,
    };
  }
  const baseBytes = git(root, ["show", `HEAD:${relativePath}`]).stdout;
  const patchBytes = git(root, [
    "diff",
    "--binary",
    "--full-index",
    "--no-color",
    "HEAD",
    "--",
    relativePath,
  ]).stdout;
  return {
    disposition: patchBytes.length ? "modified" : "unchanged",
    base: {
      byteCount: baseBytes.length,
      sha256: digest(baseBytes),
    },
    patch: patchBytes.length ? patchBytes : null,
  };
}

function packageProjection(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = Object.fromEntries(
    MINNESOTA_PACKAGE_SCRIPTS
      .filter((name) => typeof packageJson.scripts?.[name] === "string")
      .map((name) => [name, packageJson.scripts[name]]),
  );
  return {
    scripts,
    dependencies: {
      postgres: packageJson.dependencies?.postgres ?? null,
      shpjs: packageJson.dependencies?.shpjs ?? null,
    },
  };
}

function packageLockProjection(root) {
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const packages = lock.packages ?? {};
  const selected = new Map();
  const pending = ["postgres", "shpjs"];
  while (pending.length) {
    const name = pending.shift();
    const packagePath = `node_modules/${name}`;
    if (selected.has(packagePath)) continue;
    const entry = packages[packagePath];
    if (!entry) {
      throw new Error("Minnesota release dependency is absent from package-lock.json: " + name);
    }
    selected.set(packagePath, entry);
    for (const dependency of Object.keys(entry.dependencies ?? {}).sort()) {
      pending.push(dependency);
    }
  }
  return {
    lockfileVersion: lock.lockfileVersion,
    rootDependencies: {
      postgres: packages[""]?.dependencies?.postgres ?? null,
      shpjs: packages[""]?.dependencies?.shpjs ?? null,
    },
    packages: Object.fromEntries(
      Array.from(selected.entries()).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function minnesotaJsonProjection(root, relativePath) {
  const supported = relativePath === "data/precinct-geometry-manifests.json"
    || relativePath.includes("precinct-geometry-coverage-inventory")
    || relativePath === "data/source-acquisition-tiers.json"
    || relativePath === "data/native-import-source-packages.json";
  if (!supported) return null;
  const value = JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
  if (relativePath === "data/precinct-geometry-manifests.json") {
    return {
      schemaVersion: value.schemaVersion,
      updatedAt: value.updatedAt,
      manifests: (value.manifests ?? []).filter((row) => row.state === "MN"),
    };
  }
  if (relativePath.includes("precinct-geometry-coverage-inventory")) {
    const states = (value.states ?? []).filter((row) => row.state === "MN");
    const countBy = (field, choices) => Object.fromEntries(
      choices.map((choice) => [
        choice,
        states.filter((row) => (row[field] ?? "undecided") === choice).length,
      ]),
    );
    return {
      schemaVersion: value.schemaVersion,
      updatedAt: value.updatedAt,
      purpose: value.purpose,
      election: value.election,
      dispositionDefinitions: value.dispositionDefinitions,
      programStatusDefinitions: value.programStatusDefinitions,
      sourceContext: value.sourceContext,
      summary: {
        totalJurisdictions: states.length,
        programStatus: countBy("programStatus", ["not_started", "in_progress", "reviewed"]),
        disposition: countBy("disposition", [
          "undecided",
          "mapped",
          "partial",
          "official_geometry_unavailable",
          "blocked",
        ]),
        publicEligibleJurisdictions: states.filter((row) =>
          (row.geometry?.publicEligibleManifestCount ?? 0) > 0).length,
      },
      states,
    };
  }
  if (relativePath === "data/source-acquisition-tiers.json") {
    return {
      sourceCheckedAt: value.checkedAt,
      states: (value.states ?? []).filter((row) => row.state === "MN"),
    };
  }
  if (relativePath === "data/native-import-source-packages.json") {
    return {
      sourceCheckedAt: value.checkedAt,
      completed: (value.completedNativeStates ?? []).includes("MN"),
      blocked: (value.blockedStates ?? []).includes("MN"),
      states: (value.states ?? []).filter((row) => row.state === "MN"),
      discovery: (value.sourceDiscoveryQueue ?? []).filter((row) =>
        row === "MN" || row?.state === "MN"),
    };
  }
  return null;
}

function reviewClass(relativePath, shared, projection) {
  if (projection) return "semantic_projection_review";
  if (relativePath.endsWith(".json") && shared) return "semantic_projection_review";
  if (HUNK_REVIEW_PATHS.has(relativePath) || shared) return "hunk_review";
  return "exact_file";
}

function safePackage(root, relativePath) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(".etl/precinct-release-candidates/MN/")
    || !relativePath.endsWith("/release-candidate.json")
  ) {
    throw new Error("Minnesota release overlay package path is unsafe");
  }
  const artifact = inspectReleaseArtifact(root, relativePath, {
    allowedRoots: [".etl/precinct-release-candidates/MN/"],
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.state !== "MN"
    || document?.id !== "mn-precinct-gis-four-election-v1"
  ) {
    throw new Error("Minnesota release overlay package contract drifted");
  }
  return { artifact, document };
}

function patchPath(relativePath) {
  return "patches/" + relativePath.replaceAll("/", "__") + ".patch";
}

export function buildMinnesotaReleaseOverlay(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = safePackage(root, options.packagePath);
  const git = options.gitInspector ?? defaultGit;
  const sharedPaths = new Set(
    (loaded.document.scopedFileInventory?.sharedReviewFiles ?? [])
      .map((row) => row.path),
  );
  const inventory = [
    ...(loaded.document.scopedFileInventory?.releaseDependencies ?? []),
    ...(loaded.document.scopedFileInventory?.sharedReviewFiles ?? []),
  ];
  const files = [];
  const outputs = [];
  const projections = [];
  for (const pinned of inventory) {
    const current = inspectReleaseArtifact(root, pinned.path, {
      byteCount: pinned.byteCount,
      sha256: pinned.sha256,
    });
    const state = gitState(root, pinned.path, git);
    const overlayPath = "files/" + pinned.path;
    outputs.push({ path: overlayPath, bytes: current.bytes });
    let relativePatchPath = null;
    let patchArtifact = null;
    if (state.patch) {
      relativePatchPath = patchPath(pinned.path);
      outputs.push({ path: relativePatchPath, bytes: state.patch });
      patchArtifact = {
        path: relativePatchPath,
        byteCount: state.patch.length,
        sha256: digest(state.patch),
      };
    }
    const projection = pinned.path === "package.json"
      ? packageProjection(root)
      : pinned.path === "package-lock.json"
        ? packageLockProjection(root)
        : minnesotaJsonProjection(root, pinned.path);
    const classification = reviewClass(
      pinned.path,
      sharedPaths.has(pinned.path),
      projection,
    );
    let projectionPath = null;
    let projectionArtifact = null;
    if (projection) {
      projectionPath = "projections/" + pinned.path.replaceAll("/", "__");
      const projectionBytes = serialize(projection);
      outputs.push({ path: projectionPath, bytes: projectionBytes });
      projectionArtifact = {
        path: projectionPath,
        byteCount: projectionBytes.length,
        sha256: digest(projectionBytes),
      };
      projections.push({ sourcePath: pinned.path, ...projectionArtifact });
    }
    files.push({
      path: pinned.path,
      overlayPath,
      byteCount: current.byteCount,
      sha256: current.sha256,
      gitDisposition: state.disposition,
      base: state.base,
      patchPath: relativePatchPath,
      patchArtifact,
      projectionPath,
      projectionArtifact,
      reviewClass: classification,
      reviewStatus: classification === "exact_file" ? "machine_verified" : "human_review_required",
    });
  }
  const sourceReferences = (
    loaded.document.scopedFileInventory?.sourceAndDataArtifacts ?? []
  ).map((pinned) => {
    inspectReleaseArtifact(root, pinned.path, {
      byteCount: pinned.byteCount,
      sha256: pinned.sha256,
    });
    return { ...pinned, copiedIntoOverlay: false, reason: "immutable hash reference" };
  });
  const reviewRequired = files.filter((file) =>
    file.reviewStatus === "human_review_required");
  const document = {
    schemaVersion: 1,
    state: "MN",
    scope: "isolated Minnesota precinct release overlay",
    sourceReleaseCandidate: {
      path: options.packagePath,
      byteCount: loaded.artifact.byteCount,
      sha256: loaded.artifact.sha256,
    },
    decision: reviewRequired.length ? "REVIEW_REQUIRED" : "ISOLATED",
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    gitMutationPerformed: false,
    files,
    sourceAndDataArtifactReferences: sourceReferences,
    projections,
    summary: {
      overlayFiles: files.length,
      addedFiles: files.filter((file) => file.gitDisposition === "added").length,
      modifiedFiles: files.filter((file) => file.gitDisposition === "modified").length,
      unchangedFiles: files.filter((file) => file.gitDisposition === "unchanged").length,
      exactMachineVerifiedFiles: files.filter((file) => file.reviewClass === "exact_file").length,
      humanReviewRequiredFiles: reviewRequired.length,
      sourceArtifactReferences: sourceReferences.length,
    },
    reviewQueue: reviewRequired.map((file) => ({
      path: file.path,
      reviewClass: file.reviewClass,
      patchPath: file.patchPath,
      patchArtifact: file.patchArtifact,
      projectionPath: file.projectionPath,
      projectionArtifact: file.projectionArtifact,
    })),
    caveat:
      "This overlay isolates the exact file bytes and Git-base patches. It does not assert that shared-file hunks are approved; reviewQueue must reach zero in a clean branch/worktree before the production gate passes.",
  };
  const documentBytes = serialize(document);
  const overlaySha256 = digest(documentBytes);
  const outputRoot = path.posix.join(
    MINNESOTA_RELEASE_OVERLAY_ROOT,
    loaded.artifact.sha256.slice(0, 12) + "-" + overlaySha256.slice(0, 12),
  );
  return {
    outputRoot,
    overlaySha256,
    document,
    outputs: [
      { path: "overlay.json", bytes: documentBytes },
      ...outputs,
    ],
  };
}
