import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LayoutEditorV4 } from "../admin/layout/layout-editor-v4";
import { embeddedWorkspaceLayoutManifestV3 } from "@/lib/workspace-layout-v3";
import styles from "../admin/layout/layout-editor.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Workspace Builder Test Harness",
};

export default function LayoutTestHarnessPage() {
  if (process.env.UI_LAYOUT_TEST_HARNESS !== "true" || process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p>Local test harness</p>
          <h1>Workspace builder v4</h1>
          <span>Server mutations are disabled. This route returns 404 unless UI_LAYOUT_TEST_HARNESS=true and never runs in production.</span>
        </div>
        <div className={styles.statusRow}><span>Schema v3</span><span>Test mode</span></div>
      </header>
      <LayoutEditorV4
        assets={[]}
        baseManifest={embeddedWorkspaceLayoutManifestV3}
        builderV4Enabled
        drafts={[]}
        groupTemplates={[]}
        parentRevisionId={null}
        publications={[]}
        publisherEnabled={false}
        requestKey={randomUUID()}
        revisions={[]}
        templates={[]}
        testMode
      />
    </main>
  );
}
