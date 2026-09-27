import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBR_VERSION = "0.6.0";
const WEBR_PACKAGE_INTEGRITY = "sha512-M2b8m3/ZBk7XMIR7LD97s5k/9jUla83Z0Hl4b+WnrK7XmSMpZdajCiP3XkSzHKHDUgscHKe+lVUvk3aym8q0bw==";
const LOADER_ORIGIN_EXPRESSION = "new URL(r,location.origin)";
const LOADER_OPAQUE_ORIGIN_EXPRESSION = "new URL(r)";
const ROOT_RUNTIME_FILES = [
  "R.js",
  "R.wasm",
  "libRblas.so",
  "libRlapack.so",
  "webr-worker.js",
  "webr.js",
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repoRoot, "node_modules", "webr");
const sourceRoot = path.join(packageRoot, "dist");
const publicRoot = path.join(repoRoot, "public", "vendor", "webr");
const destinationRoot = path.join(publicRoot, `v${WEBR_VERSION}`);
const stagingRoot = path.join(publicRoot, `.v${WEBR_VERSION}-staging`);

const packageLock = JSON.parse(await readFile(path.join(repoRoot, "package-lock.json"), "utf8"));
const lockedPackage = packageLock.packages?.["node_modules/webr"];
if (lockedPackage?.version !== WEBR_VERSION || lockedPackage?.integrity !== WEBR_PACKAGE_INTEGRITY) {
  throw new Error("The browser R runtime does not match the reviewed npm lockfile version and integrity.");
}

const packageManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
if (packageManifest.version !== WEBR_VERSION) {
  throw new Error(`Expected webR ${WEBR_VERSION}, received ${String(packageManifest.version)}.`);
}

await rm(stagingRoot, { force: true, recursive: true });
await mkdir(stagingRoot, { recursive: true });

const copiedFiles = [];
for (const filename of ROOT_RUNTIME_FILES) {
  const sourcePath = path.join(sourceRoot, filename);
  const destinationPath = path.join(stagingRoot, filename);
  if (filename === "webr.js") {
    const loader = await readFile(sourcePath, "utf8");
    const occurrenceCount = loader.split(LOADER_ORIGIN_EXPRESSION).length - 1;
    if (occurrenceCount !== 1) {
      throw new Error("The pinned webR loader failed its opaque-origin compatibility check.");
    }
    await writeFile(
      destinationPath,
      loader.replace(LOADER_ORIGIN_EXPRESSION, LOADER_OPAQUE_ORIGIN_EXPRESSION),
      "utf8",
    );
  } else {
    await copyFile(sourcePath, destinationPath);
  }
  copiedFiles.push(filename);
}

for (const relativePath of await listFiles(path.join(sourceRoot, "vfs"), "vfs")) {
  const destinationPath = path.join(stagingRoot, relativePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(path.join(sourceRoot, relativePath), destinationPath);
  copiedFiles.push(relativePath);
}

await copyFile(path.join(packageRoot, "LICENSE.md"), path.join(stagingRoot, "LICENSE.md"));
copiedFiles.push("LICENSE.md");

const files = {};
let totalBytes = 0;
for (const relativePath of copiedFiles.sort()) {
  const contents = await readFile(path.join(stagingRoot, relativePath));
  totalBytes += contents.byteLength;
  files[relativePath.replaceAll(path.sep, "/")] = {
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

const manifest = {
  files,
  loaderPatch: {
    from: LOADER_ORIGIN_EXPRESSION,
    occurrenceCount: 1,
    to: LOADER_OPAQUE_ORIGIN_EXPRESSION,
  },
  packageIntegrity: WEBR_PACKAGE_INTEGRITY,
  schemaVersion: 1,
  totalBytes,
  webRVersion: WEBR_VERSION,
};
await writeFile(
  path.join(stagingRoot, "runtime-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await rm(destinationRoot, { force: true, recursive: true });
await mkdir(publicRoot, { recursive: true });
await rename(stagingRoot, destinationRoot);

console.log(`Prepared pinned webR ${WEBR_VERSION} runtime (${copiedFiles.length} files, ${totalBytes} bytes).`);

async function listFiles(directory, relativeDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const metadata = await stat(path.join(directory, entry.name));
    if (!metadata.size) throw new Error(`The webR runtime asset ${relativePath} is empty.`);
    files.push(relativePath);
  }
  return files;
}
