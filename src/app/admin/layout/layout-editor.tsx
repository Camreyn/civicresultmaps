"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  LockKeyhole,
  RotateCcw,
  Save,
  Send,
  Settings2,
  X,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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

type SettingsTarget =
  | { kind: "tab"; tabId: WorkspaceTabId }
  | { kind: "section"; sectionId: WorkspaceSectionId; tabId: WorkspaceTabId };

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

function SortablePreviewItem({
  children,
  dragId,
  group,
  hidden,
  index,
  label,
  onSettings,
  variant,
}: {
  children: React.ReactNode;
  dragId: string;
  group: string;
  hidden: boolean;
  index: number;
  label: string;
  onSettings: () => void;
  variant: "section" | "tab";
}) {
  const { handleRef, isDragSource, ref } = useSortable({
    id: dragId,
    index,
    group,
    type: group,
    accept: group,
  });

  return (
    <li
      className={[
        styles.previewSortable,
        variant === "tab" ? styles.tabItem : styles.sectionItem,
        hidden ? styles.hiddenElement : "",
        isDragSource ? styles.dragging : "",
      ].join(" ")}
      ref={ref}
    >
      {children}
      <div className={styles.elementTools}>
        <button
          aria-label={"Configure " + label}
          onClick={onSettings}
          title={"Configure " + label}
          type="button"
        >
          <Settings2 aria-hidden size={16} />
        </button>
        <button
          aria-label={"Drag " + label + " to a new position"}
          className={styles.dragHandle}
          ref={handleRef}
          title={"Drag " + label}
          type="button"
        >
          <GripVertical aria-hidden size={18} />
        </button>
      </div>
    </li>
  );
}

function SectionPreviewContent({ sectionId }: { sectionId: WorkspaceSectionId }) {
  if (sectionId === "results-map") {
    return (
      <div className={styles.mapPreview} aria-hidden>
        <div className={styles.mapShape} />
        <div className={styles.mapLegend}><i /><i /><i /><i /></div>
      </div>
    );
  }

  if (["historical-summary", "historical-charts", "indicators", "screening"].includes(sectionId)) {
    return (
      <div className={styles.chartPreview} aria-hidden>
        <i /><i /><i /><i /><i />
      </div>
    );
  }

  if (["source-provenance", "source-plan", "source-records-request", "cvr-requests", "downloads", "api-links", "import-history"].includes(sectionId)) {
    return (
      <div className={styles.rowsPreview} aria-hidden>
        <i /><i /><i />
      </div>
    );
  }

  if (["review-packet", "support-actions", "contact-options", "guided-workflows", "evidence-tools"].includes(sectionId)) {
    return (
      <div className={styles.actionsPreview} aria-hidden>
        <i /><i /><i />
      </div>
    );
  }

  return (
    <div className={styles.textPreview} aria-hidden>
      <i /><i /><i />
    </div>
  );
}

function PreviewTabBar({
  activeTabId,
  manifest,
  onSelect,
  onSettings,
}: {
  activeTabId: WorkspaceTabId;
  manifest: WorkspaceLayoutManifestV1;
  onSelect: (tabId: WorkspaceTabId) => void;
  onSettings: (target: SettingsTarget) => void;
}) {
  return (
    <ol aria-label="Workspace tabs" className={styles.previewTabBar}>
      {manifest.tabs.map((tab, tabIndex) => {
        const registry = registryByTab.get(tab.id)!;
        return (
          <SortablePreviewItem
            dragId={"tab:" + tab.id}
            group="layout-tabs"
            hidden={!tab.visible}
            index={tabIndex}
            key={tab.id}
            label={registry.label}
            onSettings={() => onSettings({ kind: "tab", tabId: tab.id })}
            variant="tab"
          >
            <button
              aria-pressed={activeTabId === tab.id}
              className={[
                styles.previewTabButton,
                activeTabId === tab.id ? styles.activeTabButton : "",
              ].join(" ")}
              onClick={() => onSelect(tab.id)}
              type="button"
            >
              <span>{registry.label}</span>
              {!tab.visible && (
                <small className={styles.hiddenBadge}><EyeOff aria-hidden size={11} /> Hidden</small>
              )}
            </button>
          </SortablePreviewItem>
        );
      })}
    </ol>
  );
}

function PreviewSectionList({
  onSettings,
  registry,
  tab,
}: {
  onSettings: (target: SettingsTarget) => void;
  registry: WorkspaceTabRegistryEntry;
  tab: WorkspaceLayoutManifestV1["tabs"][number];
}) {
  return (
    <ol aria-label={registry.label + " sections"} className={styles.previewSectionList}>
      {tab.sections.map((section, sectionIndex) => {
        const sectionRegistry = registry.sections.find((item) => item.id === section.id)!;
        return (
          <SortablePreviewItem
            dragId={"section:" + tab.id + ":" + section.id}
            group={"layout-sections-" + tab.id}
            hidden={!section.visible}
            index={sectionIndex}
            key={section.id}
            label={sectionRegistry.label}
            onSettings={() => onSettings({
              kind: "section",
              sectionId: section.id,
              tabId: tab.id,
            })}
            variant="section"
          >
            <article aria-label={sectionRegistry.label + " preview"} className={styles.previewSection}>
              <header>
                <div>
                  <span>Section {sectionIndex + 1}</span>
                  <h3>{sectionRegistry.label}</h3>
                </div>
                <div className={styles.previewBadges}>
                  {!section.visible && (
                    <small className={styles.hiddenBadge}><EyeOff aria-hidden size={11} /> Hidden</small>
                  )}
                  {sectionRegistry.required && (
                    <small className={styles.requiredBadge}><LockKeyhole aria-hidden size={11} /> Required</small>
                  )}
                </div>
              </header>
              <SectionPreviewContent sectionId={section.id} />
            </article>
          </SortablePreviewItem>
        );
      })}
    </ol>
  );
}

function PreviewWorkspaceBody({
  onSettings,
  registry,
  tab,
}: {
  onSettings: (target: SettingsTarget) => void;
  registry: WorkspaceTabRegistryEntry;
  tab: WorkspaceLayoutManifestV1["tabs"][number];
}) {
  return (
    <>
      {!tab.visible && (
        <p className={styles.hiddenWarning} role="status">
          <EyeOff aria-hidden size={15} />
          This tab is hidden from the public site. It remains here so you can inspect, move, or restore it.
        </p>
      )}

      <div className={styles.previewWorkspaceBody}>
        <main className={styles.previewMain}>
          <div className={styles.previewContext}>
            <div>
              <span>Selected tab</span>
              <h3>{registry.label}</h3>
            </div>
            <small>{tab.sections.filter((section) => section.visible).length} visible sections</small>
          </div>
          <PreviewSectionList onSettings={onSettings} registry={registry} tab={tab} />
        </main>

        <aside className={styles.previewNotes} aria-label="Fixed Data Notes preview">
          <div className={styles.previewNotesHeading}>
            <span>Fixed panel</span>
            <LockKeyhole aria-label="Locked in place" size={14} />
          </div>
          <h3>Data Notes</h3>
          <p>Source caveats and coverage notes stay visible beside every workspace tab.</p>
          <div className={styles.previewNoteCard}>
            <strong>Source coverage</strong>
            <span>Official-source context</span>
          </div>
          <div className={styles.previewNoteCard}>
            <strong>Reporting grain</strong>
            <span>Jurisdiction details</span>
          </div>
        </aside>
      </div>
    </>
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
  const [activeTabId, setActiveTabId] = useState<WorkspaceTabId>(
    () => baseManifest.tabs.find((tab) => tab.visible)?.id ?? baseManifest.tabs[0]?.id ?? "map",
  );
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [environment, setEnvironment] = useState<"preview" | "production">("preview");
  const [saveState, saveAction, saving] = useActionState(saveLayoutRevisionAction, initialLayoutActionState);
  const [publicationState, publicationAction, publishing] = useActionState(
    requestLayoutPublicationAction,
    initialLayoutActionState,
  );
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const dirty = useMemo(() => JSON.stringify(manifest) !== JSON.stringify(baseManifest), [baseManifest, manifest]);
  const activeTab = manifest.tabs.find((tab) => tab.id === activeTabId) ?? manifest.tabs[0]!;
  const activeRegistry = registryByTab.get(activeTab.id)!;
  const settingsDetails = useMemo(() => {
    if (!settingsTarget) return null;
    const tabIndex = manifest.tabs.findIndex((tab) => tab.id === settingsTarget.tabId);
    const tab = manifest.tabs[tabIndex];
    const tabRegistry = registryByTab.get(settingsTarget.tabId);
    if (!tab || !tabRegistry) return null;

    if (settingsTarget.kind === "tab") {
      return {
        cannotHideLast: false,
        index: tabIndex,
        itemCount: manifest.tabs.length,
        label: tabRegistry.label,
        required: Boolean(tabRegistry.required),
        target: settingsTarget,
        visible: tab.visible,
      };
    }

    const sectionIndex = tab.sections.findIndex((section) => section.id === settingsTarget.sectionId);
    const section = tab.sections[sectionIndex];
    const sectionRegistry = tabRegistry.sections.find((item) => item.id === settingsTarget.sectionId);
    if (!section || !sectionRegistry) return null;
    const visibleCount = tab.sections.filter((item) => item.visible).length;

    return {
      cannotHideLast: tab.visible && section.visible && visibleCount === 1,
      index: sectionIndex,
      itemCount: tab.sections.length,
      label: sectionRegistry.label,
      required: Boolean(sectionRegistry.required),
      target: settingsTarget,
      visible: section.visible,
    };
  }, [manifest, settingsTarget]);

  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog) return;
    if (settingsTarget && !dialog.open) dialog.showModal();
    if (!settingsTarget && dialog.open) dialog.close();
  }, [settingsTarget]);

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

  function moveSettingsTarget(delta: -1 | 1) {
    if (!settingsDetails) return;
    if (settingsDetails.target.kind === "tab") {
      moveTab(settingsDetails.index, delta);
      return;
    }
    moveSection(settingsDetails.target.tabId, settingsDetails.index, delta);
  }

  function toggleSettingsTarget() {
    if (!settingsDetails) return;
    if (settingsDetails.target.kind === "tab") {
      toggleTab(settingsDetails.target.tabId);
      return;
    }
    toggleSection(settingsDetails.target.tabId, settingsDetails.target.sectionId);
  }

  return (
    <div className={styles.editorShell}>
      <section className={styles.editorPanel}>
        <div className={styles.panelHeading}>
          <div>
            <p>Visual workspace editor</p>
            <h2>Arrange the live workspace</h2>
            <span>Select a tab to inspect its sections. Use each six-dot handle to move it or the gear to change its settings.</span>
          </div>
          <button
            className={styles.secondaryButton}
            disabled={!dirty}
            onClick={() => {
              const resetManifest = cloneWorkspaceLayoutManifest(embeddedWorkspaceLayoutManifest);
              setManifest(resetManifest);
              setActiveTabId(resetManifest.tabs.find((tab) => tab.visible)?.id ?? "map");
              setSettingsTarget(null);
            }}
            type="button"
          >
            <RotateCcw aria-hidden size={15} /> Reset default
          </button>
        </div>

        <div className={styles.fixedNotice}>
          <LockKeyhole aria-hidden size={17} />
          <span><strong>Safety rails stay active.</strong> Required tabs and sections remain visible, and Data Notes stays fixed beside the workspace.</span>
        </div>

        <DragDropProvider onDragEnd={handleDragEnd}>
          <div aria-label="Workspace layout preview" className={styles.workspacePreview}>
            <header className={styles.previewChrome}>
              <div className={styles.previewBrand}>
                <span>CivicResultMaps</span>
                <strong>Public workspace preview</strong>
              </div>
              <div className={styles.previewFilters} aria-label="Example production context">
                <span>2024 General</span>
                <span>United States</span>
              </div>
            </header>
            <PreviewTabBar
              activeTabId={activeTab.id}
              manifest={manifest}
              onSelect={setActiveTabId}
              onSettings={setSettingsTarget}
            />
            <PreviewWorkspaceBody
              onSettings={setSettingsTarget}
              registry={activeRegistry}
              tab={activeTab}
            />
          </div>
        </DragDropProvider>

        <dialog
          aria-labelledby={settingsDetails ? "layout-settings-title" : undefined}
          className={styles.settingsDialog}
          onCancel={(event) => {
            event.preventDefault();
            setSettingsTarget(null);
          }}
          onClose={() => setSettingsTarget(null)}
          ref={settingsDialogRef}
        >
          {settingsDetails && (
            <div className={styles.settingsCard}>
              <header className={styles.settingsHeader}>
                <div>
                  <span>{settingsDetails.target.kind === "tab" ? "Tab settings" : "Section settings"}</span>
                  <h2 id="layout-settings-title">{settingsDetails.label}</h2>
                </div>
                <button aria-label="Close settings" onClick={() => setSettingsTarget(null)} type="button">
                  <X aria-hidden size={18} />
                </button>
              </header>

              <div className={styles.settingsBody}>
                <label className={styles.visibilitySetting}>
                  <div>
                    <strong>Show on the public site</strong>
                    <span>Hidden items remain visible in this editor so they can be restored.</span>
                  </div>
                  <input
                    checked={settingsDetails.visible}
                    disabled={settingsDetails.required || settingsDetails.cannotHideLast}
                    onChange={toggleSettingsTarget}
                    type="checkbox"
                  />
                  <span aria-hidden className={styles.toggleControl}><i /></span>
                </label>

                {(settingsDetails.required || settingsDetails.cannotHideLast) && (
                  <div className={styles.lockedSetting}>
                    <LockKeyhole aria-hidden size={16} />
                    <span>
                      {settingsDetails.required
                        ? "This element is required and cannot be hidden."
                        : "A visible tab must keep at least one visible section."}
                    </span>
                  </div>
                )}

                <div className={styles.positionSetting}>
                  <div>
                    <strong>Position</strong>
                    <span>Move it one place at a time, or close this window and use the six-dot handle.</span>
                  </div>
                  <div>
                    <button disabled={settingsDetails.index === 0} onClick={() => moveSettingsTarget(-1)} type="button">
                      <ArrowUp aria-hidden size={15} /> Earlier
                    </button>
                    <button
                      disabled={settingsDetails.index === settingsDetails.itemCount - 1}
                      onClick={() => moveSettingsTarget(1)}
                      type="button"
                    >
                      <ArrowDown aria-hidden size={15} /> Later
                    </button>
                  </div>
                </div>

                <div className={styles.codeOwnedNotice}>
                  <LockKeyhole aria-hidden size={15} />
                  <span>Its label, icon, text, and data remain code-owned. This editor changes only order and visibility.</span>
                </div>
              </div>

              <footer className={styles.settingsFooter}>
                <button onClick={() => setSettingsTarget(null)} type="button">Done</button>
              </footer>
            </div>
          )}
        </dialog>

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
