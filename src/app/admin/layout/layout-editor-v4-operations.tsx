"use client";

import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  History,
  LoaderCircle,
  MonitorSmartphone,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  cancelLayoutPublicationAction,
  requestLayoutPublicationAction,
  saveLayoutRevisionAction,
  startLayoutDraftPreviewAction,
} from "./actions";
import { initialLayoutActionState, type LayoutActionState } from "./layout-action-state";
import { saveLayoutTemplateAction } from "./template-actions";
import { diffWorkspaceLayoutManifests } from "@/lib/workspace-layout-diff";
import type { WorkspaceLayoutManifestV3 } from "@/lib/workspace-layout-v3";
import type {
  LayoutPublicationSummary,
  LayoutRevisionSummary,
} from "./layout-editor-v4-types";
import base from "./layout-editor-v3.module.css";
import styles from "./layout-editor-v4.module.css";

export function LayoutV4Operations({
  activeDraftRevisionId,
  activeNamedDraft,
  dirty,
  errors,
  manifest,
  parentRevisionId,
  publications,
  publisherEnabled,
  requestKey,
  revisions,
  testMode = false,
}: {
  activeDraftRevisionId?: string;
  activeNamedDraft?: { id: string; name: string; version: number };
  dirty: boolean;
  errors: string[];
  manifest: WorkspaceLayoutManifestV3;
  parentRevisionId: string | null;
  publications: LayoutPublicationSummary[];
  publisherEnabled: boolean;
  requestKey: string;
  revisions: LayoutRevisionSummary[];
  testMode?: boolean;
}) {
  const [changeSummary, setChangeSummary] = useState("");
  const [environment, setEnvironment] = useState<"preview" | "production">("preview");
  const [scheduledForLocal, setScheduledForLocal] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [diffRevisionId, setDiffRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [saveState, saveAction, saving] = useActionState(saveLayoutRevisionAction, initialLayoutActionState);
  const [publicationState, publicationAction, publishing] = useActionState(requestLayoutPublicationAction, initialLayoutActionState);
  const [templateState, templateAction, templateSaving] = useActionState(saveLayoutTemplateAction, initialLayoutActionState);
  const diffRevision = revisions.find((revision) => revision.id === diffRevisionId);
  const diff = useMemo(
    () => diffRevision ? diffWorkspaceLayoutManifests(diffRevision.manifest, manifest, 80) : null,
    [diffRevision, manifest],
  );
  const pendingSchedules = publications.filter((publication) => ["scheduled", "retrying"].includes(publication.status));

  return (
    <footer className={base.operations}>
      <section className={base.operationCard}>
        <div><Save size={18} /><span><strong>Save immutable revision</strong><small>Validate the complete workspace and describe the visitor-facing change.</small></span></div>
        {errors.length > 0 && <ul className={base.errorList}>{errors.slice(0, 10).map((error) => <li key={error}>{error}</li>)}</ul>}
        <form action={saveAction}>
          <input name="manifest" type="hidden" value={JSON.stringify(manifest)} />
          <input name="parentRevisionId" type="hidden" value={parentRevisionId ?? ""} />
          <label>Change summary<input maxLength={500} minLength={5} name="changeSummary" onChange={(event) => setChangeSummary(event.target.value)} placeholder="Describe what visitors will notice" value={changeSummary} /></label>
          <button disabled={testMode || saving || errors.length > 0 || changeSummary.trim().length < 5 || !dirty} type="submit">{saving ? <LoaderCircle className={base.spin} size={16} /> : <Save size={16} />} Save revision</button>
        </form>
        <ActionMessage state={saveState} />
      </section>

      <section className={base.operationCard}>
        <div><Copy size={18} /><span><strong>Save complete workspace template</strong><small>Reuse every tab and group without publishing.</small></span></div>
        <form action={templateAction}>
          <input name="manifest" type="hidden" value={JSON.stringify(manifest)} />
          <label>Template name<input maxLength={80} minLength={3} name="name" placeholder="County review workspace" /></label>
          <label>Description<input maxLength={240} name="description" placeholder="When this layout works best" /></label>
          <button disabled={testMode || templateSaving || errors.length > 0} type="submit">{templateSaving ? <LoaderCircle className={base.spin} size={16} /> : <Copy size={16} />} Save template</button>
        </form>
        <ActionMessage state={templateState} />
      </section>

      <section className={base.operationCard}>
        <div><History size={18} /><span><strong>Review revision difference</strong><small>See exactly what changed before saving or scheduling.</small></span></div>
        <label>Compare against<select onChange={(event) => setDiffRevisionId(event.target.value)} value={diffRevisionId}>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.changeSummary} - {new Date(revision.createdAt).toLocaleString()}</option>)}</select></label>
        {diff ? <>
          <p className={styles.diffSummary}>{diff.added} added, {diff.changed} changed, {diff.removed} removed{diff.truncated ? "; first 80 shown" : ""}.</p>
          <ol className={styles.diffList}>{diff.entries.slice(0, 80).map((entry, index) => <li key={`${entry.path}-${index}`}><strong>{entry.kind}: {entry.label}</strong><code>{entry.path}</code><span>{summarize(entry.before)} {entry.kind === "changed" ? "->" : ""} {summarize(entry.after)}</span></li>)}</ol>
        </> : <p className={styles.noticeText}>Save a first revision to enable structured comparisons.</p>}
      </section>

      <section className={base.operationCard}>
        <div><Send size={18} /><span><strong>Preview, schedule, and publish</strong><small>Every release uses the protected GitHub workflow and production approval gate.</small></span></div>
        {activeNamedDraft && (
          <form action={startLayoutDraftPreviewAction}>
            <input name="draftId" type="hidden" value={activeNamedDraft.id} />
            <p className={styles.noticeText}>
              Preview the saved version {activeNamedDraft.version} of <strong>{activeNamedDraft.name}</strong>.
            </p>
            <button disabled={testMode} type="submit"><MonitorSmartphone size={16} /> Open named draft preview</button>
          </form>
        )}
        <form action={startLayoutDraftPreviewAction}>
          <label>Saved revision<select name="revisionId" onChange={(event) => setSelectedRevisionId(event.target.value)} value={selectedRevisionId}>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.changeSummary} - {new Date(revision.createdAt).toLocaleString()}</option>)}</select></label>
          <button disabled={testMode || !selectedRevisionId} type="submit"><MonitorSmartphone size={16} /> Open revision preview</button>
        </form>
        <form action={publicationAction}>
          <input name="requestKey" type="hidden" value={requestKey} />
          <input name="revisionId" type="hidden" value={selectedRevisionId} />
          <div className={styles.scheduleRow}>
            <label>Environment<select name="environment" onChange={(event) => setEnvironment(event.target.value as "preview" | "production")} value={environment}><option value="preview">Preview</option><option value="production">Production</option></select></label>
            <label>Action<select name="publicationAction"><option value="stage">Stage candidate</option><option value="promote">Promote stable</option><option value="rollback">Rollback stable</option></select></label>
          </div>
          <input name="scheduledFor" type="hidden" value={scheduledForLocal ? new Date(scheduledForLocal).toISOString() : ""} />
          <label>Schedule in your local time (optional)<input onChange={(event) => setScheduledForLocal(event.target.value)} type="datetime-local" value={scheduledForLocal} /></label>
          {environment === "production" && <label className={base.confirm}><input name="confirmProduction" type="checkbox" value="yes" /> I confirm this production change</label>}
          <button disabled={testMode || !publisherEnabled || publishing || !selectedRevisionId} type="submit">{publishing ? <LoaderCircle className={base.spin} size={16} /> : <Clock size={16} />} Request or schedule</button>
        </form>
        {!publisherEnabled && <p className={base.notice}><TriangleAlert size={14} /> Publishing workflow dispatch is disabled in this environment.</p>}
        {activeDraftRevisionId && <p className={base.notice}><Eye size={14} /> Public draft preview is active for {activeDraftRevisionId.slice(0, 8)}.</p>}
        <ActionMessage state={publicationState} />
        {pendingSchedules.length > 0 && <div>
          {pendingSchedules.map((publication) => (
            <form action={cancelLayoutPublicationAction} key={publication.id}>
              <input name="publicationId" type="hidden" value={publication.id} />
              <span className={styles.scheduleBadge}><Clock size={11} /> {publication.status} - {new Date(publication.nextAttemptAt ?? publication.scheduledFor ?? publication.requestedAt).toLocaleString()}</span>
              <button disabled={testMode} type="submit">Cancel</button>
            </form>
          ))}
        </div>}
      </section>

      <section className={base.operationCard}>
        <div><History size={18} /><span><strong>Recent activity</strong><small>Immutable revision and release audit trail.</small></span></div>
        <ol className={base.historyList}>{revisions.slice(0, 8).map((revision) => <li key={revision.id}><strong>{revision.changeSummary}</strong><span>{revision.actorEmail} - {new Date(revision.createdAt).toLocaleString()}</span></li>)}</ol>
        {publications.slice(0, 8).map((publication) => <p className={base.publication} key={publication.id}><span>{publication.environment} / {publication.channel}</span><strong>{publication.status}{publication.attemptCount ? ` (${publication.attemptCount}/${publication.maxAttempts})` : ""}</strong></p>)}
      </section>
    </footer>
  );
}

function ActionMessage({ state }: { state: LayoutActionState }) {
  if (state.kind === "idle") return null;
  const Icon = state.kind === "success" ? CheckCircle2 : TriangleAlert;
  return <p className={state.kind === "success" ? base.successMessage : base.errorMessage} role="status"><Icon size={15} /> {state.message}</p>;
}

function summarize(value: unknown) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
