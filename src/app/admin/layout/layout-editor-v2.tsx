"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  CheckCircle2,
  Columns2,
  History,
  Laptop,
  LockKeyhole,
  Redo2,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Tablet,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  requestLayoutPublicationAction,
  saveLayoutRevisionAction,
  startLayoutDraftPreviewAction,
} from "./actions";
import { initialLayoutActionState } from "./layout-action-state";
import { LayoutBuilderCanvas } from "./layout-builder-canvas";
import { LayoutBuilderInspector } from "./layout-builder-inspector";
import { LayoutBuilderSidebar } from "./layout-builder-sidebar";
import {
  createWorkspaceCustomBlock,
  inspectWorkspaceLayoutManifest,
  isWorkspaceCustomBlock,
  workspaceLayoutRegistry,
  type WorkspaceCustomBlockKind,
  type WorkspaceLayoutItemV1,
  type WorkspaceLayoutManifestV1,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";
import {
  normalizeBuilderItems,
  moveBuilderItem,
  type BuilderCompareMode,
  type BuilderTarget,
  type BuilderViewport,
} from "./layout-builder-types";
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

type DraftHistory = {
  entries: WorkspaceLayoutManifestV1[];
  index: number;
};

function changedElementCount(before: WorkspaceLayoutManifestV1, after: WorkspaceLayoutManifestV1) {
  let count = JSON.stringify(before.settings) === JSON.stringify(after.settings) ? 0 : 1;
  before.tabs.forEach((tab, tabIndex) => {
    const nextTabIndex = after.tabs.findIndex((candidate) => candidate.id === tab.id);
    const nextTab = after.tabs[nextTabIndex];
    if (!nextTab) return;
    if (tabIndex !== nextTabIndex
      || tab.visible !== nextTab.visible
      || JSON.stringify(tab.settings) !== JSON.stringify(nextTab.settings)
    ) count += 1;
    const ids = new Set([...tab.sections.map((item) => item.id), ...nextTab.sections.map((item) => item.id)]);
    ids.forEach((id) => {
      const currentIndex = tab.sections.findIndex((item) => item.id === id);
      const nextIndex = nextTab.sections.findIndex((item) => item.id === id);
      if (currentIndex !== nextIndex
        || JSON.stringify(tab.sections[currentIndex]) !== JSON.stringify(nextTab.sections[nextIndex])
      ) count += 1;
    });
  });
  return count;
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
  const [draftHistory, setDraftHistory] = useState<DraftHistory>(() => ({ entries: [structuredClone(baseManifest)], index: 0 }));
  const manifest = draftHistory.entries[draftHistory.index];
  const [activeTabId, setActiveTabId] = useState<WorkspaceTabId>(() => baseManifest.tabs.find((tab) => tab.visible)?.id ?? "map");
  const [selectedTarget, setSelectedTarget] = useState<BuilderTarget>({ kind: "workspace" });
  const [viewport, setViewport] = useState<BuilderViewport>("desktop");
  const [compareMode, setCompareMode] = useState<BuilderCompareMode>("draft");
  const [changeSummary, setChangeSummary] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [environment, setEnvironment] = useState<"preview" | "production">("preview");
  const [saveState, saveAction, saving] = useActionState(saveLayoutRevisionAction, initialLayoutActionState);
  const [publicationState, publicationAction, publishing] = useActionState(requestLayoutPublicationAction, initialLayoutActionState);
  const issues = useMemo(() => inspectWorkspaceLayoutManifest(manifest), [manifest]);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const effectiveSelectedTarget: BuilderTarget = selectedTarget.kind === "item"
    && !manifest.tabs.find((tab) => tab.id === selectedTarget.tabId)?.sections.some((item) => item.id === selectedTarget.itemId)
    ? { kind: "tab", tabId: selectedTarget.tabId }
    : selectedTarget;
  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const dirty = JSON.stringify(manifest) !== JSON.stringify(baseManifest);
  const changeCount = changedElementCount(baseManifest, manifest);

  function commit(next: WorkspaceLayoutManifestV1 | ((current: WorkspaceLayoutManifestV1) => WorkspaceLayoutManifestV1)) {
    setDraftHistory((current) => {
      const present = current.entries[current.index];
      const value = typeof next === "function" ? next(structuredClone(present)) : next;
      if (JSON.stringify(value) === JSON.stringify(present)) return current;
      return { entries: [...current.entries.slice(0, current.index + 1), value], index: current.index + 1 };
    });
  }
  function updateManifestSettings(settings: NonNullable<WorkspaceLayoutManifestV1["settings"]>) {
    commit((current) => ({ ...current, settings }));
  }

  function updateTab(
    tabId: WorkspaceTabId,
    updater: (tab: WorkspaceLayoutManifestV1["tabs"][number]) => WorkspaceLayoutManifestV1["tabs"][number],
  ) {
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === tabId ? updater(tab) : tab),
    }));
  }

  function updateItem(
    tabId: WorkspaceTabId,
    itemId: string,
    updater: (item: WorkspaceLayoutItemV1) => WorkspaceLayoutItemV1,
  ) {
    updateTab(tabId, (tab) => ({
      ...tab,
      sections: tab.sections.map((item) => item.id === itemId ? updater(item) : item),
    }));
  }

  function toggleTab(tabId: WorkspaceTabId) {
    const registry = workspaceLayoutRegistry.find((tab) => tab.id === tabId);
    if (registry && "required" in registry && registry.required) return;
    updateTab(tabId, (tab) => ({ ...tab, visible: !tab.visible }));
  }

  function toggleItem(tabId: WorkspaceTabId, itemId: string) {
    const registry = workspaceLayoutRegistry.find((tab) => tab.id === tabId);
    const registryItem = registry?.sections.find((section) => section.id === itemId);
    if (registryItem && "required" in registryItem && registryItem.required) return;
    updateTab(tabId, (tab) => {
      const target = tab.sections.find((item) => item.id === itemId);
      if (!target) return tab;
      const visibleCount = tab.sections.filter((item) => item.visible).length;
      if (target.visible && tab.visible && visibleCount === 1) return tab;
      return {
        ...tab,
        sections: tab.sections.map((item) => item.id === itemId ? { ...item, visible: !item.visible } : item),
      };
    });
  }

  function moveItem(tabId: WorkspaceTabId, itemId: string, delta: -1 | 1) {
    updateTab(tabId, (tab) => {
      const index = tab.sections.findIndex((item) => item.id === itemId);
      return { ...tab, sections: normalizeBuilderItems(moveBuilderItem(tab.sections, index, index + delta)) };
    });
  }

  function removeItem(tabId: WorkspaceTabId, itemId: string) {
    updateTab(tabId, (tab) => ({
      ...tab,
      sections: tab.sections.filter((item) => item.id !== itemId || !isWorkspaceCustomBlock(item)),
    }));
    setSelectedTarget({ kind: "tab", tabId });
  }

  function addBlock(component: WorkspaceCustomBlockKind) {
    const block = createWorkspaceCustomBlock(component, Date.now() + (manifest.tabs.find((tab) => tab.id === activeTabId)?.sections.length ?? 0));
    updateTab(activeTabId, (tab) => ({ ...tab, sections: [...tab.sections, block] }));
    setSelectedTarget({ itemId: block.id, kind: "item", tabId: activeTabId });
  }
  function resizeItem(tabId: WorkspaceTabId, itemId: string, delta: -1 | 1) {
    if (viewport === "mobile") return;
    const options = viewport === "desktop" ? [4, 6, 8, 12] as const : [6, 12] as const;
    updateItem(tabId, itemId, (item) => {
      if (!isWorkspaceCustomBlock(item)) return item;
      const currentSpan = item.presentation?.span?.[viewport] ?? 12;
      const currentIndex = Math.max(0, options.indexOf(currentSpan as never));
      const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
      return {
        ...item,
        presentation: {
          ...item.presentation,
          span: { ...item.presentation?.span, [viewport]: options[nextIndex], mobile: 12 },
        },
      };
    });
  }

  function handleDragEnd(event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0]) {
    if (event.canceled || !isSortable(event.operation.source)) return;
    const { id, index, initialIndex } = event.operation.source;
    if (index === initialIndex) return;
    const parts = String(id).split(":");
    if (parts[0] === "tab") {
      commit((current) => ({ ...current, tabs: moveBuilderItem(current.tabs, initialIndex, index) }));
      return;
    }
    if (parts[0] === "item" && parts[1]) {
      const tabId = parts[1] as WorkspaceTabId;
      updateTab(tabId, (tab) => ({ ...tab, sections: normalizeBuilderItems(moveBuilderItem(tab.sections, initialIndex, index)) }));
    }
  }

  function undo() {
    setDraftHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  }

  function redo() {
    setDraftHistory((current) => ({ ...current, index: Math.min(current.entries.length - 1, current.index + 1) }));
  }

  function resetDefault() {
    const reset = structuredClone(baseManifest);
    setDraftHistory((current) => ({ entries: [...current.entries.slice(0, current.index + 1), reset], index: current.index + 1 }));
    setSelectedTarget({ kind: "workspace" });
  }
  return (
    <div className={styles.editorV2}>
      <section className={styles.builderSurface}>
        <header className={styles.builderHeader}>
          <div>
            <span>Visual workspace builder</span>
            <h2>Design the public workspace in context</h2>
            <p>Arrange production components, add approved blocks, and tune responsive presentation.</p>
          </div>
          <div className={styles.builderStatus}>
            <strong>{changeCount}</strong><span>changed elements</span>
          </div>
        </header>
        <div className={styles.builderToolbar}>
          <div className={styles.segmentedControl} aria-label="Preview viewport" role="group">
            <button aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")} type="button"><Laptop aria-hidden size={15} /> Desktop</button>
            <button aria-pressed={viewport === "tablet"} onClick={() => setViewport("tablet")} type="button"><Tablet aria-hidden size={15} /> Tablet</button>
            <button aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")} type="button"><Smartphone aria-hidden size={15} /> Mobile</button>
          </div>
          <div className={styles.segmentedControl} aria-label="Comparison mode" role="group">
            <button aria-pressed={compareMode === "baseline"} onClick={() => setCompareMode("baseline")} type="button">Before</button>
            <button aria-pressed={compareMode === "draft"} onClick={() => setCompareMode("draft")} type="button">After</button>
            <button aria-pressed={compareMode === "split"} onClick={() => setCompareMode("split")} type="button"><Columns2 aria-hidden size={15} /> Compare</button>
          </div>
          <div className={styles.toolbarActions}>
            <button aria-label="Undo" disabled={draftHistory.index === 0} onClick={undo} type="button"><Undo2 aria-hidden size={15} /></button>
            <button aria-label="Redo" disabled={draftHistory.index === draftHistory.entries.length - 1} onClick={redo} type="button"><Redo2 aria-hidden size={15} /></button>
            <button disabled={!dirty} onClick={resetDefault} type="button"><RotateCcw aria-hidden size={15} /> Reset saved</button>
          </div>
        </div>
        <div className={styles.safetyNotice}>
          <LockKeyhole aria-hidden size={17} />
          <span><strong>Trust surfaces stay protected.</strong> Required navigation, Results Map, Source Provenance, and Data Notes cannot be removed.</span>
        </div>
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div className={styles.builderGrid}>
            <LayoutBuilderSidebar
              activeTabId={activeTabId}
              manifest={manifest}
              onAddBlock={addBlock}
              onSelectTab={setActiveTabId}
              onSelectTarget={setSelectedTarget}
              onToggleItem={toggleItem}
              onToggleTab={toggleTab}
              selectedTarget={effectiveSelectedTarget}
            />
            <section className={styles.canvasStage} aria-label="Responsive workspace canvas">
              {compareMode === "baseline" && (
                <LayoutBuilderCanvas
                  activeTabId={activeTabId}
                  label="Before - saved revision"
                  manifest={baseManifest}
                  onSelectTab={() => undefined}
                  onSelectTarget={() => undefined}
                  readOnly
                  selectedTarget={effectiveSelectedTarget}
                  viewport={viewport}
                />
              )}
              {compareMode === "draft" && (
                <LayoutBuilderCanvas
                  activeTabId={activeTabId}
                  label="After - current draft"
                  manifest={manifest}
                  onResize={resizeItem}
                  onSelectTab={setActiveTabId}
                  onSelectTarget={setSelectedTarget}
                  selectedTarget={effectiveSelectedTarget}
                  viewport={viewport}
                />
              )}
              {compareMode === "split" && (
                <div className={styles.compareGrid}>
                  <LayoutBuilderCanvas
                    activeTabId={activeTabId}
                    label="Before"
                    manifest={baseManifest}
                    onSelectTab={() => undefined}
                    onSelectTarget={() => undefined}
                    readOnly
                    selectedTarget={effectiveSelectedTarget}
                    viewport={viewport}
                  />
                  <LayoutBuilderCanvas
                    activeTabId={activeTabId}
                    label="After"
                    manifest={manifest}
                    onResize={resizeItem}
                    onSelectTab={setActiveTabId}
                    onSelectTarget={setSelectedTarget}
                    selectedTarget={effectiveSelectedTarget}
                    viewport={viewport}
                  />
                </div>
              )}
            </section>
            <div className={styles.inspectorStack}>
              <LayoutBuilderInspector
                issues={issues}
                manifest={manifest}
                onMoveItem={moveItem}
                onRemoveItem={removeItem}
                onToggleItem={toggleItem}
                onToggleTab={toggleTab}
                onUpdateItem={updateItem}
                onUpdateManifest={updateManifestSettings}
                onUpdateTab={updateTab}
                target={effectiveSelectedTarget}
              />
              <section className={styles.validationPanel}>
                <header>
                  {blockingIssues.length
                    ? <TriangleAlert aria-hidden size={17} />
                    : <CheckCircle2 aria-hidden size={17} />}
                  <div><span>Pre-publish checks</span><strong>{blockingIssues.length ? `${blockingIssues.length} blocking` : "Ready to save"}</strong></div>
                </header>
                <p>{warningIssues.length} review warning{warningIssues.length === 1 ? "" : "s"} - accessibility and required-surface checks included</p>
                <ul>
                  {issues.slice(0, 6).map((issue) => (
                    <li data-severity={issue.severity} key={issue.id}>{issue.message}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </DragDropProvider>
      </section>
      <section className={styles.releaseGrid}>
        <section className={styles.controlCard}>
          <header><span>Immutable revision</span><h2>Review and save this draft</h2><p>Saving creates a new snapshot; it does not overwrite or publish the current layout.</p></header>
          <div className={styles.changeSummary}>
            <article><strong>{changeCount}</strong><span>elements changed</span></article>
            <article><strong>{warningIssues.length}</strong><span>warnings to review</span></article>
            <article><strong>{blockingIssues.length}</strong><span>blocking errors</span></article>
          </div>
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
                placeholder="Describe what changed and why."
                required
                value={changeSummary}
              />
            </label>
            <button disabled={saving || !dirty || blockingIssues.length > 0 || changeSummary.trim().length < 5} type="submit">
              <Save aria-hidden size={16} /> {saving ? "Saving..." : "Save immutable revision"}
            </button>
            {!dirty && <p className={styles.formHint}>Make a change in the builder before saving.</p>}
            {blockingIssues.length > 0 && <p className={styles.error}>Resolve blocking checks before saving.</p>}
            {saveState.kind !== "idle" && (
              <p className={saveState.kind === "success" ? styles.success : styles.error} role="status">
                {saveState.message} {saveState.kind === "success" && "Reload before creating another revision."}
              </p>
            )}
          </form>
        </section>
        <section className={styles.controlCard}>
          <header><span>Protected release</span><h2>Stage, promote, or roll back</h2><p>Select a saved revision. Draft canvas changes are never published directly.</p></header>
          {!publisherEnabled && <p className={styles.queuedNotice}>Workflow dispatch is disabled; requests will queue safely.</p>}
          <form action={publicationAction} className={styles.publishForm}>
            <label>
              Revision
              <select name="revisionId" onChange={(event) => setSelectedRevisionId(event.target.value)} required value={selectedRevisionId}>
                <option value="">Choose a saved revision</option>
                {revisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>{revision.id.slice(0, 8)} - {revision.changeSummary}</option>
                ))}
              </select>
            </label>
            <label>
              Environment
              <select name="environment" onChange={(event) => setEnvironment(event.target.value as "preview" | "production")} value={environment}>
                <option value="preview">Preview</option><option value="production">Production</option>
              </select>
            </label>
            <input name="requestKey" type="hidden" value={requestKey} />
            {environment === "production" && (
              <label className={styles.confirmRow}>
                <input name="confirmProduction" required type="checkbox" value="yes" />
                I reviewed the before/after view and confirm this targets production.
              </label>
            )}
            <div className={styles.publishButtons}>
              <button disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="stage">
                <Send aria-hidden size={15} /> Stage candidate
              </button>
              <button disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="promote">
                <Send aria-hidden size={15} /> Promote stable
              </button>
              <button disabled={publishing || !selectedRevisionId} name="publicationAction" type="submit" value="rollback">
                <RotateCcw aria-hidden size={15} /> Roll back
              </button>
            </div>
            {publicationState.kind !== "idle" && (
              <p className={publicationState.kind === "success" ? styles.success : styles.error} role="status">{publicationState.message}</p>
            )}
          </form>
        </section>
      </section>
      <section className={styles.historyGrid}>
        <section className={styles.controlCard}>
          <header><span>Revision history</span><h2><History aria-hidden size={17} /> Immutable snapshots</h2></header>
          <ol className={styles.historyList}>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <div>
                  <strong>{revision.changeSummary}</strong>
                  <span>{new Date(revision.createdAt).toLocaleString()} - {revision.actorEmail}</span>
                  <code>{revision.id} - {revision.manifestDigest.slice(0, 12)}</code>
                </div>
                <form action={startLayoutDraftPreviewAction}>
                  <input name="revisionId" type="hidden" value={revision.id} />
                  <button type="submit">{activeDraftRevisionId === revision.id ? "Previewing" : "Draft preview"}</button>
                </form>
              </li>
            ))}
            {!revisions.length && <li>No saved revisions yet. The embedded layout remains active.</li>}
          </ol>
        </section>
        <section className={styles.controlCard}>
          <header><span>Publication history</span><h2>Workflow status</h2></header>
          <ol className={styles.historyList}>
            {publications.map((publication) => (
              <li key={publication.id}>
                <div>
                  <strong>{publication.action} - {publication.environment} - {publication.status}</strong>
                  <span>{new Date(publication.requestedAt).toLocaleString()} - {publication.channel}</span>
                  <code>{publication.id.slice(0, 8)} - {publication.revisionId.slice(0, 8)}</code>
                  {publication.failureMessage && <span className={styles.error}>{publication.failureMessage}</span>}
                </div>
              </li>
            ))}
            {!publications.length && <li>No publication requests yet.</li>}
          </ol>
        </section>
      </section>
    </div>
  );
}
