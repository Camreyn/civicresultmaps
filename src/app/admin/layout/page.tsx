import { randomUUID } from "node:crypto";
import type { Metadata, Route } from "next";
import { evaluate } from "flags/next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LayoutEditor, type LayoutAssetSummary, type LayoutDraftSummary, type LayoutGroupTemplateSummary, type LayoutPublicationSummary, type LayoutRevisionSummary, type LayoutTemplateSummary } from "./layout-editor";
import styles from "./layout-editor.module.css";
import { readLayoutAdmin } from "@/lib/ui-layout-auth";
import {
  isLayoutDatabaseConfigured,
  listLayoutPublications,
  listLayoutRevisions,
} from "@/lib/ui-layout-repository";
import { workspaceBuilderV4 } from "@/flags";
import { embeddedWorkspaceLayoutManifestV3, toWorkspaceLayoutManifestV3 } from "@/lib/workspace-layout-v3";
import { listLayoutAssets, listLayoutTemplates } from "@/lib/ui-layout-v3-repository";
import { listLayoutDrafts, listLayoutGroupTemplates } from "@/lib/ui-layout-v4-repository";
import { WORKSPACE_LAYOUT_DRAFT_COOKIE } from "@/lib/workspace-layout-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace Layout Control Room", robots: { index: false, follow: false } };

export default async function LayoutAdminPage() {
  const admin = await readLayoutAdmin();
  if (admin.status === "signed-out") redirect("/admin/sign-in" as Route);

  if (admin.status === "unconfigured") {
    return (
      <main className={styles.page}>
        <section className={styles.setupCard}>
          <h1>Layout editor setup required</h1>
          <p>The public workspace remains on the embedded default. Configure Clerk before enabling this private editor.</p>
          <p>Required variables: <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>, <code>CLERK_SECRET_KEY</code>, and <code>UI_LAYOUT_ADMIN_EMAILS</code>.</p>
        </section>
      </main>
    );
  }

  if (admin.status === "forbidden") {
    return (
      <main className={styles.page}>
        <section className={styles.setupCard}>
          <h1>Access denied</h1>
          <p>The signed-in account{admin.email ? ` (${admin.email})` : ""} does not have a verified email in the layout-admin allowlist.</p>
        </section>
      </main>
    );
  }

  if (!isLayoutDatabaseConfigured()) {
    return (
      <main className={styles.page}>
        <section className={styles.setupCard}>
          <h1>Layout database unavailable</h1>
          <p>Configure <code>DATABASE_URL</code> or <code>POSTGRES_URL</code>, then apply layout migrations through 0007 in the preview database.</p>
        </section>
      </main>
    );
  }

  let builderV4Enabled = process.env.NODE_ENV === "development" && !process.env.VERCEL;
  try {
    builderV4Enabled = (await evaluate({ builderV4: workspaceBuilderV4 })).builderV4;
  } catch (error) {
    console.error(JSON.stringify({
      event: "workspace_builder_flag_failed",
      message: error instanceof Error ? error.message : "Unknown flag evaluation error",
    }));
  }

  const [revisionRows, publicationRows, assetRows, templateRows, draftRows, groupTemplateRows, cookieStore] = await Promise.all([
    listLayoutRevisions(),
    listLayoutPublications(40, builderV4Enabled),
    listLayoutAssets(),
    listLayoutTemplates(),
    builderV4Enabled ? listLayoutDrafts() : Promise.resolve([]),
    builderV4Enabled ? listLayoutGroupTemplates() : Promise.resolve([]),
    cookies(),
  ]);
  const revisions: LayoutRevisionSummary[] = revisionRows.map((revision) => ({
    actorEmail: revision.actorEmail,
    changeSummary: revision.changeSummary,
    createdAt: revision.createdAt.toISOString(),
    id: revision.id,
    manifest: toWorkspaceLayoutManifestV3(revision.manifest),
    manifestDigest: revision.manifestDigest,
    parentRevisionId: revision.parentRevisionId,
  }));
  const publications: LayoutPublicationSummary[] = publicationRows.map((publication) => ({
    action: publication.action,
    attemptCount: publication.attemptCount,
    cancelledAt: publication.cancelledAt?.toISOString() ?? null,
    channel: publication.channel,
    completedAt: publication.completedAt?.toISOString() ?? null,
    environment: publication.environment,
    failureMessage: publication.failureMessage,
    id: publication.id,
    maxAttempts: publication.maxAttempts,
    nextAttemptAt: publication.nextAttemptAt?.toISOString() ?? null,
    requestedAt: publication.requestedAt.toISOString(),
    revisionId: publication.revisionId,
    scheduledFor: publication.scheduledFor?.toISOString() ?? null,
    status: publication.status,
  }));
  const assets: LayoutAssetSummary[] = assetRows.map((asset) => ({
    alt: asset.alt,
    contentType: asset.contentType,
    height: asset.height,
    id: asset.id,
    pathname: asset.pathname,
    sizeBytes: asset.sizeBytes,
    url: asset.url,
    width: asset.width,
  }));
  const templates: LayoutTemplateSummary[] = templateRows.map((template) => ({
    actorEmail: template.actorEmail,
    description: template.description,
    id: template.id,
    manifest: toWorkspaceLayoutManifestV3(template.manifest),
    name: template.name,
    updatedAt: template.updatedAt.toISOString(),
  }));
  const drafts: LayoutDraftSummary[] = draftRows.map((draft) => ({
    archivedAt: draft.archivedAt?.toISOString() ?? null,
    baseRevisionId: draft.baseRevisionId,
    createdAt: draft.createdAt.toISOString(),
    id: draft.id,
    manifest: draft.manifest,
    name: draft.name,
    updatedAt: draft.updatedAt.toISOString(),
    version: draft.version,
  }));
  const groupTemplates: LayoutGroupTemplateSummary[] = groupTemplateRows.map((template) => ({
    actorEmail: template.actorEmail,
    description: template.description,
    group: template.group,
    id: template.id,
    name: template.name,
    updatedAt: template.updatedAt.toISOString(),
  }));
  const latest = revisions[0];

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p>Private administration</p>
          <h1>Workspace layout control room</h1>
          <span>Signed in as {admin.actor.email}. Build responsive layouts with protected public-interest trust surfaces.</span>
        </div>
        <div className={styles.statusRow}>
          <span>Schema v3</span>
          <span>{builderV4Enabled ? "Builder controls v4" : "Builder controls v3 compatibility"}</span>
          <span>{process.env.EDGE_CONFIG ? "Edge Config connected" : "Embedded runtime fallback"}</span>
        </div>
      </header>
      <LayoutEditor
        activeDraftRevisionId={cookieStore.get(WORKSPACE_LAYOUT_DRAFT_COOKIE)?.value}
        assets={assets}
        baseManifest={latest?.manifest ?? embeddedWorkspaceLayoutManifestV3}
        builderV4Enabled={builderV4Enabled}
        drafts={drafts}
        groupTemplates={groupTemplates}
        parentRevisionId={latest?.id ?? null}
        publications={publications}
        publisherEnabled={process.env.UI_LAYOUT_PUBLISH_WORKFLOW_ENABLED === "true"}
        requestKey={randomUUID()}
        revisions={revisions}
        templates={templates}
      />
    </main>
  );
}
