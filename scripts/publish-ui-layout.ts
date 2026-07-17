import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  uiLayoutAuditEvents,
  uiLayoutPublications,
  uiLayoutRevisions,
} from "../src/db/schema.ts";
import { createWorkspaceLayoutEnvelope } from "../src/lib/workspace-layout-digest.ts";
import { workspaceLayoutEdgeKeys } from "../src/lib/workspace-layout-publisher-policy.ts";

type Environment = "preview" | "production";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
const publicationId = args.get("publication-id") ?? process.env.UI_LAYOUT_PUBLICATION_ID;
const environment = (args.get("environment") ?? process.env.UI_LAYOUT_ENVIRONMENT) as Environment | undefined;

if (!publicationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicationId)) {
  throw new Error("A valid version-4 publication UUID is required.");
}
if (environment !== "preview" && environment !== "production") throw new Error("--environment must be preview or production.");

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required in the protected workflow environment.");
const edgeConfigId = requiredEnv("VERCEL_EDGE_CONFIG_ID");
const vercelToken = requiredEnv("VERCEL_ACCESS_TOKEN");
const db = drizzle(neon(databaseUrl));

async function main() {
  const [row] = await db
    .select({ publication: uiLayoutPublications, revision: uiLayoutRevisions })
    .from(uiLayoutPublications)
    .innerJoin(uiLayoutRevisions, eq(uiLayoutPublications.revisionId, uiLayoutRevisions.id))
    .where(and(eq(uiLayoutPublications.id, publicationId!), eq(uiLayoutPublications.environment, environment!)))
    .limit(1);
  if (!row) throw new Error("Publication request was not found for the requested environment.");
  if (row.publication.status === "published") {
    console.info(JSON.stringify({ event: "ui_layout_publish_noop", publicationId, environment }));
    return;
  }
  if (row.publication.status === "cancelled") {
    throw new Error("Cancelled publication requests cannot be published.");
  }

  await recordStatus("publishing", row.revision.id, { startedAt: new Date() });
  try {
    disableCandidateFlag(environment!);
    const envelope = createWorkspaceLayoutEnvelope({
      manifest: row.revision.manifest,
      publishedAt: row.publication.requestedAt.toISOString(),
      revisionId: row.revision.id,
    });
    const keys = workspaceLayoutEdgeKeys(row.publication.action);
    await updateEdgeConfig(keys.map((key) => ({ key, value: envelope })));
    const edgeDigest = await readEdgeDigest();
    await recordStatus("published", row.revision.id, {
      completedAt: new Date(),
      edgeDigest,
      failureCode: null,
      failureMessage: null,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    });
    console.info(JSON.stringify({
      event: "ui_layout_published",
      action: row.publication.action,
      edgeDigest,
      environment,
      publicationId,
      revisionId: row.revision.id,
      keys,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown publisher error";
    await recordStatus("failed", row.revision.id, {
      completedAt: new Date(),
      failureCode: "publisher_failed",
      failureMessage: message.slice(0, 2000),
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    });
    throw error;
  }
}

function disableCandidateFlag(target: Environment) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    [
      "--yes",
      "vercel@latest",
      "flags",
      "disable",
      "workspace-layout-candidate",
      "--environment",
      target,
      "--variant",
      "off",
      "--token",
      vercelToken,
      "--no-color",
    ],
    { env: process.env, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`Unable to disable the candidate flag (exit ${result.status ?? "unknown"}).`);
}

async function updateEdgeConfig(items: Array<{ key: string; value: unknown }>) {
  const operations = await Promise.all(items.map(async (item) => ({
    operation: await edgeItemExists(item.key) ? "update" : "create",
    key: item.key,
    value: item.value,
    description: "Versioned Civic Result Maps workspace layout envelope",
  })));
  const response = await fetch(edgeUrl(`/v1/edge-config/${edgeConfigId}/items`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: operations }),
  });
  if (!response.ok) throw new Error(`Edge Config write failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
}

async function edgeItemExists(key: string) {
  const response = await fetch(edgeUrl(`/v1/edge-config/${edgeConfigId}/item/${encodeURIComponent(key)}`), {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Edge Config item lookup failed (${response.status}).`);
  return true;
}

async function readEdgeDigest() {
  const response = await fetch(edgeUrl(`/v1/edge-config/${edgeConfigId}`), {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (!response.ok) throw new Error(`Edge Config digest lookup failed (${response.status}).`);
  const data = await response.json() as { digest?: string };
  return data.digest ?? "unavailable";
}

function edgeUrl(path: string) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  return url;
}

async function recordStatus(
  status: "publishing" | "published" | "failed",
  revisionId: string,
  values: Partial<typeof uiLayoutPublications.$inferInsert>,
) {
  await db.batch([
    db.update(uiLayoutPublications).set({ status, ...values }).where(eq(uiLayoutPublications.id, publicationId!)),
    db.insert(uiLayoutAuditEvents).values({
      id: randomUUID(),
      action: `publication.${status}`,
      actorId: "ui-layout-publisher",
      actorEmail: "workflow@civicresultmaps.org",
      revisionId,
      publicationId: publicationId!,
      metadata: {
        environment,
        workflowRunId: process.env.GITHUB_RUN_ID ?? null,
      },
    }),
  ]);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in the protected workflow environment.`);
  return value;
}

await main();
