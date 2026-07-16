import { randomUUID } from "node:crypto";
import type { Metadata, Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LayoutEditor, type LayoutPublicationSummary, type LayoutRevisionSummary } from "./layout-editor";
import styles from "./layout-editor.module.css";
import { readLayoutAdmin } from "@/lib/ui-layout-auth";
import {
  isLayoutDatabaseConfigured,
  listLayoutPublications,
  listLayoutRevisions,
} from "@/lib/ui-layout-repository";
import { embeddedWorkspaceLayoutManifest } from "@/lib/workspace-layout";
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
          <p>Configure <code>DATABASE_URL</code> or <code>POSTGRES_URL</code>, then apply migration 0004 and 0005 in the preview database.</p>
        </section>
      </main>
    );
  }

  const [revisionRows, publicationRows, cookieStore] = await Promise.all([
    listLayoutRevisions(),
    listLayoutPublications(),
    cookies(),
  ]);
  const revisions: LayoutRevisionSummary[] = revisionRows.map((revision) => ({
    actorEmail: revision.actorEmail,
    changeSummary: revision.changeSummary,
    createdAt: revision.createdAt.toISOString(),
    id: revision.id,
    manifest: revision.manifest,
    manifestDigest: revision.manifestDigest,
    parentRevisionId: revision.parentRevisionId,
  }));
  const publications: LayoutPublicationSummary[] = publicationRows.map((publication) => ({
    action: publication.action,
    channel: publication.channel,
    completedAt: publication.completedAt?.toISOString() ?? null,
    environment: publication.environment,
    failureMessage: publication.failureMessage,
    id: publication.id,
    requestedAt: publication.requestedAt.toISOString(),
    revisionId: publication.revisionId,
    status: publication.status,
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
          <span>Schema v1</span>
          <span>Builder controls v2</span>
          <span>{process.env.EDGE_CONFIG ? "Edge Config connected" : "Embedded runtime fallback"}</span>
        </div>
      </header>
      <LayoutEditor
        activeDraftRevisionId={cookieStore.get(WORKSPACE_LAYOUT_DRAFT_COOKIE)?.value}
        baseManifest={latest?.manifest ?? embeddedWorkspaceLayoutManifest}
        parentRevisionId={latest?.id ?? null}
        publications={publications}
        publisherEnabled={process.env.UI_LAYOUT_PUBLISH_WORKFLOW_ENABLED === "true"}
        requestKey={randomUUID()}
        revisions={revisions}
      />
    </main>
  );
}
