import "server-only";
import { connectionJsonDigest as digest } from "./connection-json-digest";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { runNeonTransaction, runPostgresTransaction } from "../db/neon-transaction";
import { initialResearchDocument } from "./connection-research-bootstrap";
import { publicResearchDocument, publicResearchDocumentSchema, releaseCoverageIssues, withdrawPublicClaim, validateResearchDocument, type PublicResearchDocument, type ResearchActor } from "./connection-research";
import { connectionEdges } from "./election-connections";
import { researchDatabaseTarget, assertResearchWrites } from "./connection-database-policy";
import type { ReadSql } from "../db/read-sql";
import { editResearchDocument, type ResearchCommand } from "./connection-research-policy";
import { readResearchArtifact } from "./connection-research-artifacts";
import { compareConnectionReleases, validatedRelease, type ConnectionComparisons } from "./connection-release-comparison";

export class ResearchRepositoryError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function databaseTarget(write = false) {
  try { return write ? assertResearchWrites(process.env) : researchDatabaseTarget(process.env); }
  catch { throw new ResearchRepositoryError(503, "Research database or editing is not configured for this environment."); }
}
async function readResearchSql<T>(work: (sql: ReadSql) => Promise<T>): Promise<T> {
  const target = databaseTarget();
  if (target.driver === "neon") return work(neon(target.url) as ReadSql);
  const client = postgres(target.url, { max: 1, connect_timeout: 10, connection: { default_transaction_read_only: true } });
  try { return await work(client as unknown as ReadSql); } finally { await client.end({ timeout: 5 }); }
}
export async function readResearchWorkspace() {
  const [row] = await readResearchSql(async (sql) => sql`select version, document from connection_workspaces where id = 'default'`) as Array<{ version: number; document: unknown }>;
  return row ? { version: row.version, document: validateResearchDocument(row.document) } : { version: 0, document: initialResearchDocument() };
}
export async function readPublishedConnections(): Promise<PublicResearchDocument | null> {
  if (process.env.CONNECTIONS_PUBLIC_RELEASES_ENABLED !== "1") return null;
  const [row] = await readResearchSql(async (sql) => sql`
    select release.document, release.id, release.digest from connection_publication publication
    join connection_releases release on release.id = publication.release_id where publication.id = 'default'
  `) as Array<{ id: string; document: unknown; digest: string }>;
  if (!row) throw new ResearchRepositoryError(503, "No reviewed connections release is available.");
  const document = publicResearchDocumentSchema.parse(row.document);
  if (document.releaseId !== row.id || digest(document) !== row.digest) throw new Error("Release identity or digest mismatch");
  return document;
}

/** Bounded reviewed snapshot comparisons, not a complete publication/rollback log. */
export async function readPublishedConnectionComparisons(current: PublicResearchDocument): Promise<ConnectionComparisons> {
  if (process.env.CONNECTIONS_PUBLIC_RELEASES_ENABLED !== "1" || current.releaseId === "legacy-documentary-catalog") return { status: "disabled", comparisons: [] };
  return readResearchSql(async (sql) => {
    const [row] = await sql`select release.id, release.document, release.digest, release.workspace_version
      from connection_publication publication join connection_releases release on release.id = publication.release_id
      join connection_workspace_revisions revision on revision.version = release.workspace_version and revision.actor_id = release.actor_id
      where publication.id = 'default' and release.id = ${current.releaseId}` as Array<{ id: string; document: unknown; digest: string; workspace_version: number }>;
    if (!row || digest(validatedRelease(row)) !== digest(current)) throw new ResearchRepositoryError(409, "Publication changed during comparison");
    const previous = await sql`select release.id, release.document, release.digest from connection_releases release
      join connection_workspace_revisions revision on revision.version = release.workspace_version and revision.actor_id = release.actor_id
      where release.workspace_version < ${row.workspace_version} order by release.workspace_version desc, release.id desc limit 12` as Array<{ id: string; document: unknown; digest: string }>;
    return { status: "available", comparisons: previous.map((record) => compareConnectionReleases(validatedRelease(record), current)) };
  });
}
export async function mutateResearchWorkspace(expectedVersion: number, command: ResearchCommand, actor: ResearchActor) {
  const target = databaseTarget(true);
  const transaction = target.driver === "postgres" ? runPostgresTransaction : runNeonTransaction;
  return transaction(target.url, async (sql) => {
    await sql`select pg_advisory_xact_lock(912731)`;
    const [previous] = await sql`select version, document from connection_workspaces where id = 'default' for update` as Array<{ version: number; document: unknown }>;
    const version = previous?.version ?? 0;
    if (version !== expectedVersion) throw new ResearchRepositoryError(409, "Workspace changed. Reload before saving.");
    const old = previous ? validateResearchDocument(previous.document) : initialResearchDocument();
    if (command.operation === "rollback") {
      if (!actor.publisher) throw new ResearchRepositoryError(403, "Publisher required");
      const [release] = await sql`select id from connection_releases where id = ${command.releaseId}`;
      if (!release) throw new ResearchRepositoryError(404, "Unknown release");
      const withdrawn = old.claims.filter((claim) => claim.state === "withdrawn").map((claim) => claim.id);
      const [snapshot] = await sql`select document from connection_releases where id = ${command.releaseId}` as Array<{ document: unknown }>;
      if (publicResearchDocumentSchema.parse(snapshot.document).claims.some((claim) => withdrawn.includes(claim.id))) throw new ResearchRepositoryError(409, "Rollback would restore withdrawn claims");
      await sql`insert into connection_publication (id, release_id) values ('default', ${command.releaseId}) on conflict (id) do update set release_id = excluded.release_id`;
      await sql`insert into connection_workspace_revisions (version, document, digest, actor_id, actor_email, note) values (${version + 1}, ${JSON.stringify(old)}::jsonb, ${digest(old)}, ${actor.id}, ${actor.email}, ${command.note})`;
      await sql`update connection_workspaces set version = ${version + 1}, updated_at = now() where id = 'default'`;
      return { version: version + 1, document: old };
    }
    if (command.operation === "capture") await readResearchArtifact(command.revision);
    if (command.operation === "review_source" && command.decision === "approve") {
      const revision = old.revisions.find((item) => item.id === command.revisionId);
      if (!revision) throw new ResearchRepositoryError(404, "Unknown revision");
      await readResearchArtifact(revision);
    }
    const document = editResearchDocument(old, command, actor, new Date().toISOString());
    let releaseId: string | null = null;
    if (command.operation === "publish") {
      const [current] = await sql`select release.document from connection_publication publication join connection_releases release on release.id = publication.release_id where publication.id = 'default'` as Array<{ document: unknown }>;
      const required = current ? publicResearchDocumentSchema.parse(current.document).claims.map((claim) => claim.id) : connectionEdges.map((claim) => claim.id);
      const missing = releaseCoverageIssues(document, required);
      if (missing.length) throw new ResearchRepositoryError(409, `Publication would omit ${missing.length} existing relationships. Approve their revisions or explicitly withdraw them first.`);
      releaseId = `connections-${digest(document)}`;
      const published = publicResearchDocument(document, releaseId);
      await sql`insert into connection_releases (id, document, digest, workspace_version, actor_id) values (${releaseId}, ${JSON.stringify(published)}::jsonb, ${digest(published)}, ${version + 1}, ${actor.id}) on conflict (id) do nothing`;
      await sql`insert into connection_publication (id, release_id) values ('default', ${releaseId}) on conflict (id) do update set release_id = excluded.release_id`;
    }
    if (command.operation === "transition" && command.state === "withdrawn") {
      const [current] = await sql`select release.document from connection_publication publication join connection_releases release on release.id = publication.release_id where publication.id = 'default'` as Array<{ document: unknown }>;
      if (current) {
        const snapshot = publicResearchDocumentSchema.parse(current.document);
        releaseId = `connections-${digest({ previous: snapshot.releaseId, withdrawn: command.claimId, version: version + 1 })}`;
        const filtered = withdrawPublicClaim(snapshot, command.claimId, releaseId);
        await sql`insert into connection_releases (id, document, digest, workspace_version, actor_id) values (${releaseId}, ${JSON.stringify(filtered)}::jsonb, ${digest(filtered)}, ${version + 1}, ${actor.id})`;
        await sql`update connection_publication set release_id = ${releaseId} where id = 'default'`;
      }
    }
    await sql`insert into connection_workspace_revisions (version, document, digest, actor_id, actor_email, note) values (${version + 1}, ${JSON.stringify(document)}::jsonb, ${digest(document)}, ${actor.id}, ${actor.email}, ${command.note})`;
    await sql`insert into connection_workspaces (id, version, document) values ('default', ${version + 1}, ${JSON.stringify(document)}::jsonb) on conflict (id) do update set version = excluded.version, document = excluded.document, updated_at = now()`;
    return { version: version + 1, document, releaseId };
  });
}
