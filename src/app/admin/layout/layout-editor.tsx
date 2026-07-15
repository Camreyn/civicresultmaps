"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  LockKeyhole,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  initialLayoutActionState,
  requestLayoutPublicationAction,
  saveLayoutRevisionAction,
  startLayoutDraftPreviewAction,
} from "./actions";
import {
  cloneWorkspaceLayoutManifest,
  embeddedWorkspaceLayoutManifest,
  workspaceLayoutRegistry,
  type WorkspaceLayoutManifestV1,
  type WorkspaceSectionId,
  type WorkspaceTabRegistryEntry,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";
import styles from "./layout-editor.module.css";

export type LayoutRevisionSummary = {
  actorEmail: string;
  changeSummary: string;
  createdAt: string;
  id: string;
  manifest: WorkspaceLayoutManifestV1;
  manifestDigest: string;
  parentRevisionId: string | null;
};

export type LayoutPublicationSummary = {
  action: string;
  channel: string;
  completedAt: string | null;
  environment: string;
  failureMessage: string | null;
  id: string;
  requestedAt: string;
  revisionId: string;
  status: string;
};

type LayoutEditorProps = {
  activeDraftRevisionId?: string;
  baseManifest: WorkspaceLayoutManifestV1;
  parentRevisionId: string | null;
  publications: LayoutPublicationSummary[];
  publisherEnabled: boolean;
  requestKey: string;
  revisions: LayoutRevisionSummary[];
};

const registryByTab = new Map<WorkspaceTabId, WorkspaceTabRegistryEntry>(
  workspaceLayoutRegistry.map((tab) => [tab.id, tab]),
);

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

function SortableItem({
  children,
  dragId,
  group,
  index,
  label,
  last,
  onMove,
}: {
  children: React.ReactNode;
  dragId: string;
  group: string;
  index: number;
  label: string;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const { handleRef, isDragSource, ref } = useSortable({
    id: dragId,
    index,
    group,
    type: group,
    accept: group,
  });
  return (
    <li className={`${styles.sortableItem} ${isDragSource ? styles.dragging : ""}`} ref={ref}>
      <div className={styles.rowControls}>
        <button aria-label={`Drag ${label}`} className={styles.dragHandle} ref={handleRef} type="button">
          <GripVertical aria-hidden size={18} />
        </button>
        <button aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)} type="button">
          <ArrowUp aria-hidden size={15} />
        </button>
        <button aria-label={`Move ${label} down`} disabled={last} onClick={() => onMove(1)} type="button">
          <ArrowDown aria-hidden size={15} />
        </button>
      </div>
      {children}
    </li>
  );
}

export function LayoutEditor({
  activeDraftRevisionId,
  baseManifest,
  parentRevisionId,
  publications,
  publisherEnabled,
  requestKey,
  revisions,
}: LayoutEditorProps) {
  const [manifest, setManifest] = useState(() => cloneWorkspaceLayoutManifest(baseManifest));
  const [changeSummary, setChangeSummary] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [environment, setEnvironment] = useState<"preview" | "production">("preview");
  const [saveState, saveAction, saving] = useActionState(saveLayoutRevisionAction, initialLayoutActionState);
  const [publicationState, publicationAction, publishing] = useActionState(
    requestLayoutPublicationAction,
    initialLayoutActionState,
  );
  const dirty = useMemo(() => JSON.stringify(manifest) !== JSON.stringify(baseManifest), [baseManifest, manifest]);

  function moveTab(index: number, delta: -1 | 1) {
    setManifest((current) => ({ ...current, tabs: moveItem(current.tabs, index, index + delta) }));
  }

  function moveSection(tabId: WorkspaceTabId, index: number, delta: -1 | 1) {
    setManifest((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === tabId
        ? { ...tab, sections: moveItem(tab.sections, index, index + delta) }
        : tab),
    }));
  }

  function toggleTab(tabId: WorkspaceTabId) {
    const registry = registryByTab.get(tabId);
    if (registry?.required) return;
    setManifest((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === tabId ? { ...tab, visible: !tab.visible } : tab),
    }));
  }

  function toggleSection(tabId: WorkspaceTabId, sectionId: WorkspaceSectionId) {
    const registry = registryByTab.get(tabId)?.sections.find((section) => section.id === sectionId);
    if (registry?.required) return;
    setManifest((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const visibleCount = tab.sections.filter((section) => section.visible).length;
        return {
          ...tab,
          sections: tab.sections.map((section) => section.id === sectionId
            ? { ...section, visible: section.visible ? visibleCount > 1 || !tab.visible : true }
            : section),
        };
      }),
    }));
  }

  function handleDragEnd(event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0]) {
    if (event.canceled || !isSortable(event.operation.source)) return;
    const { id, initialIndex, index } = event.operation.source;
    if (initialIndex === index) return;
    const parts = String(id).split(":");
    if (parts[0] === "tab") {
      setManifest((current) => ({ ...current, tabs: moveItem(current.tabs, initialIndex, index) }));
      return;
    }
    if (parts[0] === "section" && parts[1]) {
      const tabId = parts[1] as WorkspaceTabId;
      setManifest((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId
          ? { ...tab, sections: moveItem(tab.sections, initialIndex, index) }
          : tab),
      }));
    }
  }

  return (
    <div className={styles.editorShell}>
      <section className={styles.editorPanel}>
        <div className={styles.panelHeading}>
          <div>
            <p>Workspace manifest</p>
            <h2>Order and visibility</h2>
            <span>Drag rows or use the arrow buttons. Text, icons, and content remain locked in code.</span>
          </div>
          <button
            className={styles.secondaryButton}
            disabled={!dirty}
            onClick={() => setManifest(cloneWorkspaceLayoutManifest(embeddedWorkspaceLayoutManifest))}
            type="button"
          >
            <RotateCcw aria-hidden size={15} /> Reset default
          </button>
        </div>

        <div className={styles.fixedNotice}>
          <LockKeyhole aria-hidden size={17} />
          <span><strong>Data Notes is fixed.</strong> It stays outside the editable manifest so caveats cannot be hidden or reordered away.</span>
        </div>

        <DragDropProvider onDragEnd={handleDragEnd}>
          <ol className={styles.tabList}>
            {manifest.tabs.map((tab, tabIndex) => {
              const registry = registryByTab.get(tab.id)!;
              return (
                <SortableItem
                  dragId={`tab:${tab.id}`}
                  group="layout-tabs"
                  index={tabIndex}
                  key={tab.id}
                  label={registry.label}
                  last={tabIndex === manifest.tabs.length - 1}
                  onMove={(delta) => moveTab(tabIndex, delta)}
                >
                  <div className={styles.itemBody}>
                    <div className={styles.itemHeading}>
                      <label>
                        <input
                          checked={tab.visible}
                          disabled={Boolean(registry.required)}
                          onChange={() => toggleTab(tab.id)}
                          type="checkbox"
                        />
                        <strong>{registry.label}</strong>
                      </label>
                      {registry.required && <span className={styles.requiredBadge}><LockKeyhole size={12} /> Required</span>}
                    </div>
                    <ol className={styles.sectionList}>
                      {tab.sections.map((section, sectionIndex) => {
                        const sectionRegistry = registry.sections.find((item) => item.id === section.id)!;
                        const visibleCount = tab.sections.filter((item) => item.visible).length;
                        const cannotHideLast = tab.visible && section.visible && visibleCount === 1;
                        return (
                          <SortableItem
                            dragId={`section:${tab.id}:${section.id}`}
                            group={`layout-sections-${tab.id}`}
                            index={sectionIndex}
                            key={section.id}
                            label={sectionRegistry.label}
                            last={sectionIndex === tab.sections.length - 1}
                            onMove={(delta) => moveSection(tab.id, sectionIndex, delta)}
                          >
                            <div className={styles.sectionBody}>
                              <label>
                                <input
                                  checked={section.visible}
                                  disabled={Boolean(sectionRegistry.required) || cannotHideLast}
                                  onChange={() => toggleSection(tab.id, section.id)}
                                  type="checkbox"
                                />
                                <span>{sectionRegistry.label}</span>
                              </label>
                              {sectionRegistry.required && <LockKeyhole aria-label="Required section" size={13} />}
                            </div>
                          </SortableItem>
                        );
                      })}
                    </ol>
                  </div>
                </SortableItem>
              );
            })}
          </ol>
        </DragDropProvider>

        <form action={saveAction} className={styles.saveForm}>
          <input name="manifest" type="hidden" value={JSON.stringify(manifest)} />
          <input name="parentRevisionId" type="hidden" value={parentRevisionId ?? ""} />
          <label>
            Change summary
            <textarea
              maxLength={500}
              minLength={5}
              name="changeSummary"
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="Explain why this ordering or visibility change is needed."
              required
              value={changeSummary}
            />
          </label>
          <button disabled={saving || !dirty || changeSummary.trim().length < 5} type="submit">
            <Save aria-hidden size={16} /> {saving ? "Saving…" : "Save immutable revision"}
          </button>
          {saveState.kind !== "idle" && (
            <p className={saveState.kind === "success" ? styles.success : styles.error} role="status">
              {saveState.message} {saveState.kind === "success" && "Reload before creating another revision."}
            </p>
          )}
        </form>
      </section>

      <aside className={styles.sideColumn}>
        <section className={styles.editorPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p>Release controls</p>
              <h2>Preview and publish</h2>
              <span>All allowlisted admins may publish through the protected workflow.</span>
            </div>
          </div>
          {!publisherEnabled && (
            <p className={styles.queuedNotice}>Workflow dispatch is disabled. Requests are recorded and wait safely for activation on main.</p>
          )}
          <form action={publicationAction} className={styles.publishForm}>
            <input name="requestKey" type="hidden" value={requestKey} />
            <label>
              Revision
              <select name="revisionId" onChange={(event) => setSelectedRevisionId(event.target.value)} required value={selectedRevisionId}>
                <option value="">Choose a revision</option>
                {revisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>{revision.id.slice(0, 8)} — {revision.changeSummary}</option>
                ))}
              </select>
            </label>
            <label>
              Environment
              <select name="environment" onChange={(event) => setEnvironment(event.target.value as "preview" | "production")} value={environment}>
                <option value="preview">Preview</option>
                <option value="production">Production</option>
              </select>
            </label>
            {environment === "production" && (
              <label className={styles.confirmRow}>
                <input name="confirmProduction" type="checkbox" value="yes" />
                I confirm this request targets production.
              </label>
            )}
            <div className={styles.publishButtons}>
              <button disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="stage">
                <Send size={15} /> Stage candidate
              </button>
              <button disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="promote">
                <Send size={15} /> Promote stable
              </button>
              <button className={styles.secondaryButton} disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="rollback">
                <RotateCcw size={15} /> Roll back
              </button>
            </div>
            {publicationState.kind !== "idle" && (
              <p className={publicationState.kind === "success" ? styles.success : styles.error} role="status">
                {publicationState.message}
              </p>
            )}
          </form>
        </section>

        <section className={styles.editorPanel}>
          <div className={styles.panelHeading}>
            <div><p>Revision history</p><h2>Immutable snapshots</h2></div>
          </div>
          <ol className={styles.historyList}>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <div>
                  <strong>{revision.changeSummary}</strong>
                  <span>{new Date(revision.createdAt).toLocaleString()} · {revision.actorEmail}</span>
                  <code>{revision.id} · {revision.manifestDigest.slice(0, 12)}</code>
                </div>
                <form action={startLayoutDraftPreviewAction}>
                  <input name="revisionId" type="hidden" value={revision.id} />
                  <button className={styles.secondaryButton} type="submit">
                    <Eye size={14} /> {activeDraftRevisionId === revision.id ? "Previewing" : "Draft preview"}
                  </button>
                </form>
              </li>
            ))}
            {!revisions.length && <li>No saved revisions yet. The embedded layout remains active.</li>}
          </ol>
        </section>

        <section className={styles.editorPanel}>
          <div className={styles.panelHeading}><div><p>Publication history</p><h2>Workflow status</h2></div></div>
          <ol className={styles.historyList}>
            {publications.map((publication) => (
              <li key={publication.id}>
                <div>
                  <strong>{publication.action} · {publication.environment} · {publication.status}</strong>
                  <span>{new Date(publication.requestedAt).toLocaleString()} · {publication.channel}</span>
                  <code>{publication.id.slice(0, 8)} → {publication.revisionId.slice(0, 8)}</code>
                  {publication.failureMessage && <span className={styles.error}>{publication.failureMessage}</span>}
                </div>
              </li>
            ))}
            {!publications.length && <li>No publication requests yet.</li>}
          </ol>
        </section>
      </aside>
    </div>
  );
}
