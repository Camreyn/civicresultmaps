import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import type { ResearchSourceRevision } from "./connection-research";

export async function readResearchArtifact(revision: ResearchSourceRevision) {
  let bytes: Buffer;
  if (process.env.NODE_ENV !== "production" && process.env.CONNECTIONS_LOCAL_ARCHIVE === "1") {
    const expectedRoot = path.resolve(".etl/connections");
    const root = await realpath(expectedRoot);
    if (root !== expectedRoot) throw new Error("Private archive must not be redirected");
    const filename = await realpath(path.join(root, revision.artifactPath));
    const relative = path.relative(root, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Artifact leaves private archive");
    if ((await stat(filename)).size !== revision.byteLength) throw new Error("Artifact size mismatch");
    bytes = await readFile(filename);
  } else {
    const token = process.env.CONNECTIONS_BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("Private source storage is not configured");
    const artifact = await get(revision.artifactPath, { access: "private", token });
    if (!artifact || artifact.statusCode !== 200) throw new Error("Private artifact unavailable");
    const reader = artifact.stream.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > revision.byteLength) { await reader.cancel(); throw new Error("Artifact exceeds registered size"); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length !== revision.byteLength || createHash("sha256").update(bytes).digest("hex") !== revision.sha256) throw new Error("Retained source digest or size mismatch");
  if (revision.contentType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF capture");
  return bytes;
}

export async function storeResearchArtifact(revision: ResearchSourceRevision, bytes: Uint8Array) {
  if (createHash("sha256").update(bytes).digest("hex") !== revision.sha256 || bytes.byteLength !== revision.byteLength) throw new Error("Source digest mismatch");
  if (revision.contentType === "application/pdf" && !Buffer.from(bytes).subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF capture");
  if (process.env.NODE_ENV !== "production" && process.env.CONNECTIONS_LOCAL_ARCHIVE === "1") {
    const expectedRoot = path.resolve(".etl/connections");
    await mkdir(expectedRoot, { recursive: true });
    const root = await realpath(expectedRoot);
    if (root !== expectedRoot) throw new Error("Private archive must not be redirected");
    const target = path.join(root, revision.artifactPath);
    await mkdir(path.dirname(target), { recursive: true });
    const parent = await realpath(path.dirname(target));
    const relative = path.relative(root, parent);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Artifact leaves private archive");
    try { await writeFile(target, bytes, { flag: "wx" }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await readResearchArtifact(revision);
    }
  } else {
    const token = process.env.CONNECTIONS_BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("Private source storage is not configured");
    const existing = await get(revision.artifactPath, { access: "private", token });
    if (existing) { if (existing.statusCode === 200) await existing.stream.cancel(); await readResearchArtifact(revision); return; }
    await put(revision.artifactPath, Buffer.from(bytes), { access: "private", token, addRandomSuffix: false, contentType: revision.contentType });
  }
}
