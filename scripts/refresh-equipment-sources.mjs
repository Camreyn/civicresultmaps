import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const sourcePackagePath = "data/equipment-source-packages.json";
const reportPath = "data/equipment-source-refresh-report.json";
const args = process.argv.slice(2);
const writeChanges = args.includes("--write");
const sourceFilter = args.find((arg) => arg.startsWith("--source="))?.slice("--source=".length) ?? null;

function timestampId(value) {
  return value.replaceAll(":", "").replaceAll("-", "").replace(".", "");
}

function extensionFor(source) {
  const reviewed = source.revisions.find((revision) => revision.id === source.currentReviewedRevisionId);
  return extname(reviewed?.localArtifact ?? source.localArtifact) || ".bin";
}

async function inspectSource(source) {
  const inspectedAt = new Date().toISOString();
  try {
    const response = await fetch(source.canonicalUrl, {
      headers: {
        "user-agent": "CivicResultMaps equipment provenance monitor/1.0 (+https://civicresultmaps.org)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      return {
        sourceId: source.id,
        inspectedAt,
        status: "unavailable",
        httpStatus: response.status,
        message: `Official source returned HTTP ${response.status}.`,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = source.revisions.find((revision) => revision.sha256 === sha256);
    if (existing) {
      return {
        sourceId: source.id,
        inspectedAt,
        status: "unchanged",
        revisionId: existing.id,
        sha256,
        byteLength: bytes.length,
        resolvedUrl: response.url,
        http: {
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        },
      };
    }

    const stamp = timestampId(inspectedAt);
    const revisionId = `${source.id}@${stamp}-${sha256.slice(0, 12)}`;
    const localArtifact = `data/equipment-sources/revisions/${source.id}/${stamp}-${sha256.slice(0, 12)}${extensionFor(source)}`;
    const previousRevisionId = source.latestRetrievedRevisionId;
    const revision = {
      id: revisionId,
      localArtifact,
      sha256,
      byteLength: bytes.length,
      publishedOn: null,
      retrievedOn: inspectedAt.slice(0, 10),
      retrievedAt: inspectedAt,
      retrievalPrecision: "timestamp",
      resolvedUrl: response.url,
      http: {
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      },
      supersedesRevisionId: previousRevisionId,
      contentStatus: "content_changed",
      pageOrSection: source.pageOrSection,
      archiveStatus: "pending_review",
    };
    const comparison = {
      id: `${previousRevisionId}..${revisionId}`,
      fromRevisionId: previousRevisionId,
      toRevisionId: revisionId,
      detectedAt: inspectedAt,
      kind: "content_changed",
      machineSummary: `SHA-256 changed; retrieved artifact is ${bytes.length} bytes.`,
      editorialImpact: "requires_claim_review",
      reviewState: "pending",
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
    };

    if (writeChanges) {
      await mkdir(`data/equipment-sources/revisions/${source.id}`, { recursive: true });
      await writeFile(localArtifact, bytes);
    }

    return {
      sourceId: source.id,
      inspectedAt,
      status: "content_changed",
      sha256,
      byteLength: bytes.length,
      resolvedUrl: response.url,
      revision,
      comparison,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      inspectedAt,
      status: "retrieval_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

const sourcePackage = JSON.parse(await readFile(sourcePackagePath, "utf8"));
if (sourcePackage.schemaVersion !== 2) {
  throw new Error("Equipment sources must be migrated to schema version 2 before refresh.");
}

const selectedSources = sourceFilter
  ? sourcePackage.sources.filter((source) => source.id === sourceFilter)
  : sourcePackage.sources;
if (sourceFilter && selectedSources.length === 0) throw new Error(`Unknown equipment source: ${sourceFilter}`);

const results = [];
for (const source of selectedSources) {
  const result = await inspectSource(source);
  results.push(result);
  console.log(`${source.id}: ${result.status}`);
  if (writeChanges && result.revision) {
    source.revisions.push(result.revision);
    source.revisionComparisons.push(result.comparison);
    source.latestRetrievedRevisionId = result.revision.id;
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: writeChanges ? "archive_changes" : "dry_run",
  sourceFilter,
  summary: {
    inspected: results.length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    changed: results.filter((result) => result.status === "content_changed").length,
    unavailable: results.filter((result) => result.status === "unavailable").length,
    errors: results.filter((result) => result.status === "retrieval_error").length,
  },
  results,
};

if (writeChanges) {
  await writeFile(sourcePackagePath, `${JSON.stringify(sourcePackage, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote refresh report to ${reportPath}. Changed revisions remain pending editorial review.`);
} else {
  console.log(JSON.stringify(report.summary));
  console.log("Dry run only. Pass --write to archive changed artifacts without approving them.");
}
