import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { initialResearchDocument } from "../src/lib/connection-research-bootstrap.ts";
import { sourceRevisionSchema, validateResearchDocument } from "../src/lib/connection-research.ts";

export function publicAddress(address: string) {
  if (isIP(address) !== 4) return false; // Deliberately IPv4-only; no IPv4-mapped IPv6 bypass.
  const [a, b] = address.split(".").map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
    && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
}
export async function retrieveRegisteredSource(url: URL, redirects = 0): Promise<{ bytes: Buffer; contentType: string }> {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || redirects > 4) throw new Error("Unsafe source URL or redirect");
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("Source must resolve to public addresses");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", headers: { "User-Agent": "CivicResultMaps public-source research (source-cited archival review)", "Accept-Encoding": "identity" },
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options?.all) callback(null, [address]);
        else callback(null, address.address, 4);
      },
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume(); retrieveRegisteredSource(new URL(response.headers.location, url), redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Source HTTP status ${response.statusCode}`)); return; }
      const contentType = String(response.headers["content-type"] ?? "").split(";")[0];
      if (!["application/pdf", "text/html", "text/plain", "application/json"].includes(contentType)) { response.destroy(); reject(new Error("Unsupported source document type")); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) { response.destroy(); reject(new Error("Source exceeds 20 MiB")); }
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), contentType }));
      response.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("Source retrieval timed out")), 30000);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
}
async function main() {
  const args = process.argv.slice(2);
  const sourceIds = args.filter((arg) => arg.startsWith("--source=")).map((arg) => arg.slice(9));
  if (!sourceIds.length) throw new Error("Specify registered --source=<id>; arbitrary URL input is not accepted");
  const root = path.resolve(".etl/connections"); await mkdir(root, { recursive: true });
  const privateRoot = await realpath(root);
  if (privateRoot !== root) throw new Error("Private archive must not be redirected");
  const useRegistry = args.includes("--workspace-registry");
  const document = useRegistry ? validateResearchDocument(JSON.parse(await readFile(path.join(privateRoot, "registry.json"), "utf8"))) : initialResearchDocument();
  for (const id of sourceIds) {
    const source = document.sources.find((item) => item.id === id);
    if (!source) throw new Error(`Unknown registered source: ${id}`);
    try {
      const retained = args.includes("--retained-official-tx-county");
      let result: { bytes: Buffer; contentType: string };
      if (retained) {
        const original = initialResearchDocument().sources.find((item) => item.id === "tx-2024-official-county-results")!;
        if (id !== original.id || source.url !== original.url) throw new Error("Retained capture is restricted to the registered official Texas county artifact");
        const file = await realpath(path.resolve("data/tx-2024-official-results/County.json"));
        const relative = path.relative(path.resolve("data/tx-2024-official-results"), file);
        if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Retained source leaves its registered directory");
        if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error("Retained source exceeds 20 MiB");
        result = { bytes: await readFile(file), contentType: "application/json" };
      } else result = await retrieveRegisteredSource(new URL(source.url));
      const { bytes, contentType } = result;
      if (contentType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF capture");
      if (contentType === "application/json") JSON.parse(bytes.toString("utf8"));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const artifactPath = `connection-sources/${source.id}/${sha256}/artifact`;
      const revision = sourceRevisionSchema.parse({ id: `revision-${sha256}-${createHash("sha256").update(source.id).digest("hex").slice(0, 12)}`, sourceId: source.id, url: source.url, retrievedAt: retained ? null : new Date().toISOString(), capturedAt: new Date().toISOString(), captureMethod: retained ? "retained_local" : "http", publishedOn: source.publishedOn, sha256, byteLength: bytes.length, contentType, completeness: contentType === "text/html" ? "partial" : "complete", artifactPath });
      const target = path.join(privateRoot, artifactPath); await mkdir(path.dirname(target), { recursive: true });
      const resolvedParent = await realpath(path.dirname(target));
      const relative = path.relative(privateRoot, resolvedParent);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Artifact directory leaves private archive");
      try { await writeFile(target, bytes, { flag: "wx" }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await realpath(target);
        const relative = path.relative(privateRoot, existing);
        if (relative.startsWith("..") || path.isAbsolute(relative) || (await stat(existing)).size !== bytes.byteLength) throw new Error("Existing artifact is redirected or has an unexpected size");
        if (createHash("sha256").update(await readFile(target)).digest("hex") !== sha256) throw new Error("Existing immutable artifact mismatch");
      }
      if (args.includes("--upload-private")) {
        const token = process.env.CONNECTIONS_BLOB_READ_WRITE_TOKEN;
        if (!token) throw new Error("Explicit private-source storage token required; no layout token fallback");
        await put(artifactPath, bytes, { access: "private", token, addRandomSuffix: false, contentType });
      }
      const metadataFile = path.join(privateRoot, `${source.id}-${sha256}.json`);
      await writeFile(metadataFile, JSON.stringify(revision, null, 2), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      process.stdout.write(JSON.stringify({ sourceId: id, status: "captured_pending_review", sha256, byteLength: bytes.length, revisionFile: path.relative(process.cwd(), metadataFile) }) + "\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({ sourceId: id, status: "unavailable", reason: error instanceof Error ? error.message : "Retrieval failed" }) + "\n");
      process.exitCode = 1;
    }
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/collect-connection-sources.ts")) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
