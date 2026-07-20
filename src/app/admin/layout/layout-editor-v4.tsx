"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { upload } from "@vercel/blob/client";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  Laptop,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Tablet,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  archiveLayoutDraftAction,
  createLayoutDraftAction,
  saveLayoutDraftAction,
  saveLayoutGroupTemplateAction,
  type SerializedLayoutDraft,
} from "./draft-actions";
import { LayoutV4Canvas, LayoutStructureTree } from "./layout-editor-v4-canvas";
import { LayoutV4Inspector } from "./layout-editor-v4-inspector";
import {
  appendColumn,
  appendCustomBlock,
  appendGroup,
  appendRow,
  columnIsCustomOnly,
  duplicateCustomColumn,
  findColumn,
  findGroup,
  findNode,
  findRow,
  mapNodes,
  nodeLabel,
  removeCustomColumn,
  removeCustomRow,
  requiredProductionNode,
  resizeColumn,
  rowIsCustomOnly,
  selectionLabel,
  tabCustomBlockCount,
  tabLabel,
  updateColumn,
  updateGroup,
  updateNode,
  updateRow,
} from "./layout-editor-v4-model";
import { LayoutV4Operations } from "./layout-editor-v4-operations";
import type {
  LayoutCompareMode,
  LayoutDraftSummary,
  LayoutEditorV4Props,
  LayoutGroupTemplateSummary,
  LayoutSelection,
  LayoutSettingsClipboard,
  LayoutViewport,
} from "./layout-editor-v4-types";
import {
  createWorkspaceLayoutEditorState,
  duplicateWorkspaceGroupV3,
  duplicateWorkspaceNodeV3,
  duplicateWorkspaceRowV3,
  moveWorkspaceColumnV3,
  moveWorkspaceGroupV3,
  moveWorkspaceNodeV3,
  moveWorkspaceRowV3,
  removeWorkspaceGroupV3,
  removeWorkspaceNodeV3,
  setWorkspaceNodeLockV3,
  workspaceLayoutEditorReducer,
} from "@/lib/workspace-layout-editor-reducer";
import {
  WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB,
  workspaceLayoutRegistryV2,
  workspaceStarterTemplates,
  type WorkspaceCustomBlockKindV2,
} from "@/lib/workspace-layout-v2";
import {
  cloneWorkspaceLayoutManifestV3,
  isWorkspaceGroupCustomOnlyV3,
  toWorkspaceLayoutManifestV3,
  validateWorkspaceLayoutManifestV3,
  workspaceStarterGroupTemplatesV3,
  type WorkspaceLayoutManifestV3,
} from "@/lib/workspace-layout-v3";
import base from "./layout-editor-v3.module.css";
import styles from "./layout-editor-v4.module.css";

const RECOVERY_KEY = "civicresultmaps:workspace-builder-v4:recovery";

const customBlocks: Array<{ description: string; id: WorkspaceCustomBlockKindV2; label: string }> = [
  { description: "A titled section marker", id: "heading", label: "Heading" },
  { description: "Formatted explanatory copy", id: "rich-text", label: "Rich text" },
  { description: "Highlighted context or caution", id: "callout", label: "Callout" },
  { description: "Plain explanatory paragraph", id: "narrative", label: "Narrative" },
  { description: "A compact row of key values", id: "metric-strip", label: "Metrics" },
  { description: "A compact source-link list", id: "link-list", label: "Link list" },
  { description: "Prominent linked actions", id: "button-group", label: "Buttons" },
  { description: "Managed image from Vercel Blob", id: "image", label: "Image" },
  { description: "YouTube or Vimeo embed", id: "video", label: "Video" },
  { description: "Expandable detail rows", id: "accordion", label: "Accordion" },
  { description: "A visual section break", id: "divider", label: "Divider" },
];

function removeLayoutSelection(manifest: WorkspaceLayoutManifestV3, selection: LayoutSelection) {
  if (selection.kind === "node") return removeWorkspaceNodeV3(manifest, selection.nodeId);
  if (selection.kind === "row") return removeCustomRow(manifest, selection.rowId);
  if (selection.kind === "column") return removeCustomColumn(manifest, selection.columnId);
  if (selection.kind === "group") return removeWorkspaceGroupV3(manifest, selection.groupId);
  return manifest;
}

type RecoverySnapshot = {
  draftId: string | null;
  draftName: string;
  manifest: WorkspaceLayoutManifestV3;
  savedAt: string;
};

type DraftStatus = "idle" | "saving" | "saved" | "error";
type DragEnd = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0];

export function LayoutEditorV4({
  activeDraftRevisionId,
  assets,
  baseManifest,
  drafts,
  groupTemplates,
  parentRevisionId,
  publications,
  publisherEnabled,
  requestKey,
  revisions,
  templates,
  testMode = false,
}: LayoutEditorV4Props) {
  const [editor, dispatch] = useReducer(workspaceLayoutEditorReducer, baseManifest, createWorkspaceLayoutEditorState);
  const manifest = editor.present;
  const [activeTabId, setActiveTabId] = useState(() => manifest.settings.defaultTab);
  const [selection, setSelection] = useState<LayoutSelection>({ kind: "workspace" });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [viewport, setViewport] = useState<LayoutViewport>("desktop");
  const [compareMode, setCompareMode] = useState<LayoutCompareMode>("draft");
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [clipboard, setClipboard] = useState<LayoutSettingsClipboard | null>(null);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [sessionDrafts, setSessionDrafts] = useState<LayoutDraftSummary[]>(drafts);
  const [activeDraft, setActiveDraft] = useState<LayoutDraftSummary | null>(null);
  const [draftName, setDraftName] = useState("Untitled workspace draft");
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [draftMessage, setDraftMessage] = useState("Start a named draft to enable autosave.");
  const [draftConflict, setDraftConflict] = useState<SerializedLayoutDraft | null | undefined>(undefined);
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [sessionGroupTemplates, setSessionGroupTemplates] = useState<LayoutGroupTemplateSummary[]>(groupTemplates);
  const [sessionAssets, setSessionAssets] = useState<typeof assets>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastSavedDraftKey = useRef("");
  const validation = useMemo(() => validateWorkspaceLayoutManifestV3(manifest), [manifest]);
  const errors = validation.ok ? [] : validation.errors;
  const contrast = validation.contrast;
  const dirty = JSON.stringify(manifest) !== JSON.stringify(editor.baseline);
  const activeTab = manifest.tabs.find((tab) => tab.id === activeTabId) ?? manifest.tabs[0];
  const allAssets = [...sessionAssets, ...assets.filter((asset) => !sessionAssets.some((item) => item.id === asset.id))];
  const activeGroupId = selection.kind !== "workspace" && "groupId" in selection
    ? selection.groupId
    : activeTab?.groups[0]?.id;
  const removal = useMemo(() => removeLayoutSelection(manifest, selection), [manifest, selection]);
  const canRemove = JSON.stringify(removal) !== JSON.stringify(manifest);

  function commit(
    updater: (current: WorkspaceLayoutManifestV3) => WorkspaceLayoutManifestV3,
    groupKey?: string,
  ) {
    dispatch({ groupKey, type: "commit", updater });
  }

  function handleSelection(next: LayoutSelection, event?: ReactMouseEvent) {
    if (next.kind !== "workspace") setActiveTabId(next.tabId);
    if (next.kind === "node" && (event?.ctrlKey || event?.metaKey)) {
      setSelectedNodeIds((current) => {
        const copy = new Set(current);
        if (copy.has(next.nodeId)) copy.delete(next.nodeId);
        else copy.add(next.nodeId);
        return copy;
      });
    } else {
      setSelectedNodeIds(next.kind === "node" ? new Set([next.nodeId]) : new Set());
    }
    setSelection(next);
  }

  function handleDragEnd(event: DragEnd) {
    if (event.canceled || !isSortable(event.operation.source) || !isSortable(event.operation.target)) return;
    const source = event.operation.source;
    const target = event.operation.target;
    const sourceId = String(source.id);
    const destinationGroup = String(target.group ?? "");
    if (sourceId.startsWith("group:") && destinationGroup === `groups:${activeTabId}`) {
      const groupId = sourceId.slice("group:".length);
      commit((current) => moveWorkspaceGroupV3(current, activeTabId, groupId, target.index));
      return;
    }
    if (sourceId.startsWith("row:") && destinationGroup.startsWith("rows:")) {
      commit((current) => moveWorkspaceRowV3(current, sourceId.slice(4), destinationGroup.slice(5), target.index));
      return;
    }
    if (sourceId.startsWith("column:") && destinationGroup.startsWith("columns:")) {
      commit((current) => moveWorkspaceColumnV3(current, sourceId.slice(7), destinationGroup.slice(8), target.index));
      return;
    }
    if (sourceId.startsWith("node:") && destinationGroup.startsWith("nodes:")) {
      commit((current) => moveWorkspaceNodeV3(current, sourceId.slice(5), destinationGroup.slice(6), target.index));
    }
  }

  function addBlock(component: WorkspaceCustomBlockKindV2) {
    if (!activeTab) return;
    const destinationColumnId = selection.kind === "column" || selection.kind === "node" ? selection.columnId : undefined;
    commit((current) => appendCustomBlock(current, activeTab.id, component, destinationColumnId, activeGroupId));
  }

  function addGroup(source?: Parameters<typeof appendGroup>[2]) {
    if (!activeTab) return;
    commit((current) => appendGroup(current, activeTab.id, source));
  }

  function duplicateSelection() {
    if (selection.kind === "node") commit((current) => duplicateWorkspaceNodeV3(current, selection.nodeId));
    if (selection.kind === "row") commit((current) => duplicateWorkspaceRowV3(current, selection.rowId));
    if (selection.kind === "column") commit((current) => duplicateCustomColumn(current, selection.columnId));
    if (selection.kind === "group") commit((current) => duplicateWorkspaceGroupV3(current, selection.groupId));
  }

  function removeSelection() {
    if (!canRemove) return;
    commit(() => removal);
    setSelection({ kind: "workspace" });
    setSelectedNodeIds(new Set());
    setOperationNotice("Deleted " + (selection.kind === "node" ? "content block" : selection.kind) + ". Use Undo to restore it.");
  }

  function removeNode(nodeId: string) {
    const next = removeWorkspaceNodeV3(manifest, nodeId);
    if (JSON.stringify(next) === JSON.stringify(manifest)) return;
    commit(() => next);
    if (selection.kind === "node" && selection.nodeId === nodeId) setSelection({ kind: "workspace" });
    setSelectedNodeIds((current) => {
      const copy = new Set(current);
      copy.delete(nodeId);
      return copy;
    });
    setOperationNotice("Deleted content block. Use Undo to restore it.");
  }

  function copySelectionSettings() {
    let next: LayoutSettingsClipboard | null = null;
    if (selection.kind === "group") {
      const group = findGroup(manifest, selection.groupId);
      if (group) next = { kind: "group", label: group.name, value: { presentation: structuredClone(group.presentation ?? {}) } };
    }
    if (selection.kind === "row") {
      const row = findRow(manifest, selection.rowId);
      if (row) next = { kind: "row", label: "row layout", value: { align: row.align, gap: row.gap } };
    }
    if (selection.kind === "column") {
      const column = findColumn(manifest, selection.columnId);
      if (column) next = { kind: "column", label: "responsive widths", value: { span: structuredClone(column.span) } };
    }
    if (selection.kind === "node") {
      const node = findNode(manifest, selection.nodeId);
      if (node) next = { kind: "node", label: nodeLabel(node), value: { presentation: structuredClone(node.presentation ?? {}), visibility: structuredClone(node.visibility ?? {}) } };
    }
    if (!next) return;
    setClipboard(next);
    setOperationNotice(`Copied ${next.label} settings.`);
  }

  function pasteSelectionSettings() {
    if (!clipboard || clipboard.kind !== selection.kind) return;
    if (selection.kind === "group") commit((current) => updateGroup(current, selection.groupId, (group) => ({ ...group, presentation: clipboard.value.presentation as typeof group.presentation })));
    if (selection.kind === "row") commit((current) => updateRow(current, selection.rowId, (row) => ({ ...row, align: clipboard.value.align as typeof row.align, gap: clipboard.value.gap as typeof row.gap })));
    if (selection.kind === "column") commit((current) => updateColumn(current, selection.columnId, (column) => ({ ...column, span: structuredClone(clipboard.value.span) as typeof column.span })));
    if (selection.kind === "node") commit((current) => updateNode(current, selection.nodeId, (node) => ({ ...node, presentation: clipboard.value.presentation as typeof node.presentation, visibility: clipboard.value.visibility as typeof node.visibility })));
    setOperationNotice(`Pasted ${clipboard.label} settings.`);
  }

  function applyBatch(patch: "hide" | "show" | "lock" | "unlock") {
    if (!selectedNodeIds.size) return;
    commit((current) => {
      let next = current;
      if (patch === "lock" || patch === "unlock") {
        for (const id of selectedNodeIds) next = setWorkspaceNodeLockV3(next, id, patch === "lock");
        return next;
      }
      return mapNodes(next, (node) => selectedNodeIds.has(node.id) && !requiredProductionNode(node)
        ? { ...node, visible: patch === "show" }
        : node);
    });
  }

  async function persistDraft(expectedVersion?: number) {
    if (!activeDraft || testMode) return;
    setDraftStatus("saving");
    setDraftMessage("Saving named draft...");
    const result = await saveLayoutDraftAction({
      draftId: activeDraft.id,
      expectedVersion: expectedVersion ?? activeDraft.version,
      manifest,
      name: draftName,
    });
    if (result.kind === "saved") {
      setActiveDraft(result.draft);
      setSessionDrafts((current) => [result.draft, ...current.filter((draft) => draft.id !== result.draft.id)]);
      lastSavedDraftKey.current = draftKey(result.draft.name, result.draft.manifest);
      dispatch({ manifest: result.draft.manifest, type: "rebase" });
      setDraftConflict(undefined);
      setDraftStatus("saved");
      setDraftMessage(`Autosaved at ${new Date(result.draft.updatedAt).toLocaleTimeString()}.`);
      return;
    }
    if (result.kind === "conflict") {
      setDraftConflict(result.current);
      setDraftStatus("error");
      setDraftMessage(result.message);
      return;
    }
    setDraftStatus("error");
    setDraftMessage(result.message);
  }

  async function createNamedDraft() {
    if (testMode) return;
    setDraftStatus("saving");
    const result = await createLayoutDraftAction({ baseRevisionId: parentRevisionId, manifest, name: draftName });
    if (result.kind !== "saved") {
      setDraftStatus("error");
      setDraftMessage(result.message);
      return;
    }
    setActiveDraft(result.draft);
    setSessionDrafts((current) => [result.draft, ...current]);
    lastSavedDraftKey.current = draftKey(result.draft.name, result.draft.manifest);
    dispatch({ manifest: result.draft.manifest, type: "rebase" });
    setDraftStatus("saved");
    setDraftMessage("Named draft created; autosave is active.");
  }

  function loadDraft(draftId: string) {
    if (!draftId) {
      setActiveDraft(null);
      setDraftName("Untitled workspace draft");
      lastSavedDraftKey.current = "";
      dispatch({ manifest: baseManifest, type: "load" });
      setActiveTabId(baseManifest.settings.defaultTab);
      setDraftMessage("Start a named draft to enable autosave.");
      return;
    }
    const draft = sessionDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    setActiveDraft(draft);
    setDraftName(draft.name);
    lastSavedDraftKey.current = draftKey(draft.name, draft.manifest);
    dispatch({ manifest: draft.manifest, type: "load" });
    setActiveTabId(draft.manifest.settings.defaultTab);
    setSelection({ kind: "workspace" });
    setDraftStatus("saved");
    setDraftMessage(`Loaded ${draft.name}.`);
  }

  async function archiveActiveDraft() {
    if (!activeDraft || testMode) return;
    await archiveLayoutDraftAction(activeDraft.id);
    setSessionDrafts((current) => current.filter((draft) => draft.id !== activeDraft.id));
    loadDraft("");
  }

  async function saveGroupTemplate(name: string, description: string) {
    if (selection.kind !== "group" || testMode) return;
    const group = findGroup(manifest, selection.groupId);
    if (!group || !isWorkspaceGroupCustomOnlyV3(group)) return;
    try {
      const template = await saveLayoutGroupTemplateAction({ description, group, name });
      setSessionGroupTemplates((current) => [template, ...current]);
      setOperationNotice(`Saved group template ${template.name}.`);
    } catch (error) {
      setOperationNotice(error instanceof Error ? error.message : "Unable to save group template.");
    }
  }

  async function uploadImage(file: File, alt: string, nodeId: string) {
    setUploading(true);
    setUploadError(null);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const assetId = crypto.randomUUID();
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-90) || "image";
      const blob = await upload(`layout-media/${safeName}`, file, {
        access: "public",
        clientPayload: JSON.stringify({ assetId, alt, contentType: file.type, height: bitmap.height, sizeBytes: file.size, width: bitmap.width }),
        handleUploadUrl: "/api/admin/layout-assets/upload",
      });
      const asset = { alt, contentType: blob.contentType, height: bitmap.height, id: assetId, pathname: blob.pathname, sizeBytes: file.size, url: blob.url, width: bitmap.width };
      setSessionAssets((current) => [asset, ...current]);
      commit((current) => updateNode(current, nodeId, (node) => node.kind === "custom" ? { ...node, asset: { alt, assetId, height: bitmap!.height, url: blob.url, width: bitmap!.width } } : node));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      bitmap?.close();
      setUploading(false);
    }
  }

  function restoreRecovery() {
    if (!recovery) return;
    const matchingDraft = recovery.draftId ? sessionDrafts.find((draft) => draft.id === recovery.draftId) : undefined;
    const baseline = matchingDraft?.manifest ?? baseManifest;
    dispatch({ manifest: baseline, type: "load" });
    dispatch({ type: "commit", updater: () => cloneWorkspaceLayoutManifestV3(recovery.manifest) });
    setActiveDraft(matchingDraft ?? null);
    setDraftName(recovery.draftName);
    lastSavedDraftKey.current = matchingDraft ? draftKey(matchingDraft.name, matchingDraft.manifest) : "";
    setActiveTabId(recovery.manifest.settings.defaultTab);
    setRecovery(null);
    setDraftMessage("Recovered local changes; review them before publishing.");
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecoverySnapshot;
        if (validateWorkspaceLayoutManifestV3(parsed.manifest).ok && JSON.stringify(parsed.manifest) !== JSON.stringify(baseManifest)) {
          setRecovery(parsed);
        }
      }
    } catch {
      localStorage.removeItem(RECOVERY_KEY);
    } finally {
      setRecoveryReady(true);
    }
  }, [baseManifest]);

  useEffect(() => {
    if (!recoveryReady || recovery) return;
    const snapshot: RecoverySnapshot = { draftId: activeDraft?.id ?? null, draftName, manifest, savedAt: new Date().toISOString() };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
  }, [activeDraft?.id, draftName, manifest, recovery, recoveryReady]);

  useEffect(() => {
    if (!activeDraft || testMode) return;
    const key = draftKey(draftName, manifest);
    if (key === lastSavedDraftKey.current) return;
    setDraftStatus("saving");
    setDraftMessage("Autosave queued...");
    const timer = window.setTimeout(() => void persistDraft(), 1000);
    return () => window.clearTimeout(timer);
  }, [activeDraft, draftName, manifest, testMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (command && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (command && key === "d") {
        event.preventDefault();
        duplicateSelection();
      } else if (command && key === "s") {
        event.preventDefault();
        void persistDraft();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (canRemove) event.preventDefault();
        removeSelection();
      } else if (event.key === "Escape") {
        setSelection({ kind: "workspace" });
        setSelectedNodeIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className={base.editor}>
      <header className={base.toolbar}>
        <div className={base.toolbarGroup}>
          <button disabled={!editor.past.length} onClick={() => dispatch({ type: "undo" })} type="button"><Undo2 size={16} /> Undo</button>
          <button disabled={!editor.future.length} onClick={() => dispatch({ type: "redo" })} type="button"><Redo2 size={16} /> Redo</button>
          <button disabled={!dirty} onClick={() => dispatch({ type: "reset" })} type="button"><RotateCcw size={16} /> Reset</button>
        </div>
        <div aria-label="Preview width" className={base.segmented} role="group">
          {(["desktop", "tablet", "mobile"] as const).map((mode) => {
            const Icon = mode === "desktop" ? Laptop : mode === "tablet" ? Tablet : Smartphone;
            return <button aria-pressed={viewport === mode} key={mode} onClick={() => setViewport(mode)} type="button"><Icon size={16} /><span>{mode}</span></button>;
          })}
        </div>
        <div aria-label="Comparison mode" className={base.segmented} role="group">
          <button aria-pressed={compareMode === "baseline"} onClick={() => setCompareMode("baseline")} type="button">Before</button>
          <button aria-pressed={compareMode === "draft"} onClick={() => setCompareMode("draft")} type="button">After</button>
          <button aria-pressed={compareMode === "split"} onClick={() => setCompareMode("split")} type="button"><Columns2 size={16} /> Compare</button>
        </div>
        <div className={base.toolbarStatus}><span>{dirty ? "Changes since last autosave" : "Autosaved baseline"}</span><span className={errors.length ? base.errorBadge : base.validBadge}>{errors.length ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : "Valid v3"}</span></div>
      </header>

      <div className={styles.draftBar}>
        <label>Named draft<select onChange={(event) => loadDraft(event.target.value)} value={activeDraft?.id ?? ""}><option value="">No named draft</option>{sessionDrafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name} - v{draft.version}</option>)}</select></label>
        <label>Name<input maxLength={80} minLength={3} onChange={(event) => setDraftName(event.target.value)} value={draftName} /></label>
        <button disabled={testMode || Boolean(activeDraft) || draftName.trim().length < 3} onClick={() => void createNamedDraft()} type="button"><Plus size={14} /> New draft</button>
        <button disabled={testMode || !activeDraft || draftStatus === "saving"} onClick={() => void persistDraft()} type="button">{draftStatus === "saving" ? <LoaderCircle className={base.spin} size={14} /> : <Save size={14} />} Save now</button>
        <button disabled={testMode || !activeDraft} onClick={() => void archiveActiveDraft()} type="button"><X size={14} /> Archive</button>
        <span className={styles.draftStatus} data-state={draftStatus}>{draftMessage}</span>
      </div>

      {recovery && <div className={styles.recoveryBanner}><TriangleAlert size={16} /><span>Local recovery from {new Date(recovery.savedAt).toLocaleString()} is available for {recovery.draftName}.</span><button onClick={restoreRecovery} type="button">Restore</button><button onClick={() => { localStorage.removeItem(RECOVERY_KEY); setRecovery(null); }} type="button">Discard</button></div>}
      {draftConflict !== undefined && <div className={styles.conflictBanner}><TriangleAlert size={16} /><span>{draftConflict ? `This draft changed elsewhere at ${new Date(draftConflict.updatedAt).toLocaleString()}.` : "This draft was archived in another session."}</span>{draftConflict && <><button onClick={() => loadDraftFromServer(draftConflict)} type="button">Load server copy</button><button onClick={() => void persistDraft(draftConflict.version)} type="button">Keep my copy</button></>}</div>}
      {uploadError && <p className={base.errorMessage} role="alert"><TriangleAlert size={15} /> {uploadError}</p>}
      {operationNotice && <p className={base.successMessage} role="status"><CheckCircle2 size={15} /> {operationNotice}</p>}

      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className={base.builderShell}>
          <aside className={base.library}>
            <button className={base.asideTitle} onClick={() => setLibraryOpen((value) => !value)} type="button"><LayoutGrid size={17} /> Structure and add <span>{libraryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span></button>
            {libraryOpen && <>
              <section>
                <h2>Workspace tree</h2>
                <LayoutStructureTree activeTabId={activeTabId} manifest={manifest} onSelect={handleSelection} onSelectTab={setActiveTabId} selection={selection} />
                {selectedNodeIds.size > 1 && <div className={styles.batchBar}><span>{selectedNodeIds.size} components</span><button onClick={() => applyBatch("show")} type="button"><Eye size={12} /> Show</button><button onClick={() => applyBatch("hide")} type="button"><EyeOff size={12} /> Hide</button><button onClick={() => applyBatch("lock")} type="button"><LockKeyhole size={12} /> Lock</button><button onClick={() => applyBatch("unlock")} type="button">Unlock</button></div>}
              </section>
              <section>
                <h2>Groups</h2>
                <div className={styles.templateGrid}>
                  <button onClick={() => addGroup()} type="button"><strong><Plus size={13} /> Blank group</strong><small>Starts with one editable rich-text row.</small></button>
                  {workspaceStarterGroupTemplatesV3.map((template) => <button key={template.id} onClick={() => addGroup(template.group)} type="button"><strong>{template.label}</strong><small>{template.description}</small></button>)}
                  {sessionGroupTemplates.map((template) => <button key={template.id} onClick={() => addGroup(template.group)} type="button"><strong>{template.name}</strong><small>{template.description || `Shared by ${template.actorEmail}`}</small></button>)}
                </div>
              </section>
              <section>
                <h2>Content blocks</h2>
                <div className={base.blockPalette}>{customBlocks.map((block) => <button disabled={!activeTab || tabCustomBlockCount(manifest, activeTab.id) >= WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB} key={block.id} onClick={() => addBlock(block.id)} title={block.description} type="button"><Plus size={14} /><span><strong>{block.label}</strong><small>{block.description}</small></span></button>)}</div>
              </section>
              <section>
                <h2>Complete workspaces</h2>
                <div className={base.templateList}>
                  {workspaceStarterTemplates.map((template) => <button key={template.id} onClick={() => commit(() => toWorkspaceLayoutManifestV3(template.manifest))} type="button"><strong>{template.label}</strong><small>{template.description}</small></button>)}
                  {templates.map((template) => <button key={template.id} onClick={() => commit(() => cloneWorkspaceLayoutManifestV3(template.manifest))} type="button"><strong>{template.name}</strong><small>{template.description || `Shared by ${template.actorEmail}`}</small></button>)}
                </div>
              </section>
            </>}
          </aside>

          <section aria-labelledby="layout-v4-stage-heading" className={base.stage}>
            <div className={base.stageHeader}><div><span>Production-shaped preview</span><h2 id="layout-v4-stage-heading">{activeTab ? tabLabel(activeTab.id) : "Workspace"}</h2></div><button disabled={!activeTab} onClick={() => addGroup()} type="button"><Plus size={15} /> Add group</button></div>
            <div className={compareMode === "split" ? base.compareGrid : base.canvasStage}>
              {(compareMode === "baseline" || compareMode === "split") && <LayoutV4Canvas activeTabId={activeTabId} label={compareMode === "split" ? "Before" : "Before - saved draft"} manifest={editor.baseline} onAddColumn={() => undefined} onAddRow={() => undefined} onRemoveNode={() => undefined} onResizeColumn={() => undefined} onSelect={() => undefined} readOnly selectedNodeIds={new Set()} selection={{ kind: "workspace" }} viewport={viewport} />}
              {(compareMode === "draft" || compareMode === "split") && <LayoutV4Canvas activeTabId={activeTabId} label={compareMode === "split" ? "After" : "After - current draft"} manifest={manifest} onAddColumn={(rowId) => commit((current) => appendColumn(current, rowId))} onAddRow={(groupId) => commit((current) => appendRow(current, groupId))} onRemoveNode={removeNode} onResizeColumn={(columnId, delta) => commit((current) => resizeColumn(current, columnId, viewport, delta))} onSelect={handleSelection} selectedNodeIds={selectedNodeIds} selection={selection} viewport={viewport} />}
            </div>
          </section>

          <aside className={base.inspector}>
            <div className={base.inspectorHeader}><Settings2 size={17} /><div><span>Configure</span><strong>{selectionLabel(manifest, selection)}</strong></div><button aria-label="Inspect workspace" onClick={() => handleSelection({ kind: "workspace" })} type="button"><X size={15} /></button></div>
            <LayoutV4Inspector assets={allAssets} canRemove={canRemove} clipboard={clipboard} closeHistoryGroup={() => dispatch({ type: "close-group" })} commit={commit} manifest={manifest} onCopy={copySelectionSettings} onDuplicate={duplicateSelection} onPaste={pasteSelectionSettings} onRemove={removeSelection} onSaveGroupTemplate={(name, description) => void saveGroupTemplate(name, description)} onUploadImage={uploadImage} selection={selection} uploading={uploading} viewport={viewport} />
            <div className={base.inspectorBody}><fieldset><legend>Accessibility checks</legend><ul className={styles.contrastList}>{contrast.map((item) => <li data-valid={item.ok} key={item.label}><span>{item.label}</span><strong>{item.ratio.toFixed(2)}:1 / {item.threshold}:1</strong></li>)}</ul></fieldset></div>
          </aside>
        </div>
      </DragDropProvider>

      <LayoutV4Operations
        activeDraftRevisionId={activeDraftRevisionId}
        activeNamedDraft={activeDraft ? { id: activeDraft.id, name: activeDraft.name, version: activeDraft.version } : undefined}
        dirty={dirty}
        errors={errors}
        manifest={manifest}
        parentRevisionId={parentRevisionId}
        publications={publications}
        publisherEnabled={publisherEnabled}
        requestKey={requestKey}
        revisions={revisions}
        testMode={testMode}
      />
    </section>
  );

  function loadDraftFromServer(draft: SerializedLayoutDraft) {
    setActiveDraft(draft);
    setDraftName(draft.name);
    setSessionDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    lastSavedDraftKey.current = draftKey(draft.name, draft.manifest);
    dispatch({ manifest: draft.manifest, type: "load" });
    setActiveTabId(draft.manifest.settings.defaultTab);
    setDraftConflict(undefined);
    setDraftStatus("saved");
    setDraftMessage("Loaded the newer server copy.");
  }
}

function draftKey(name: string, manifest: WorkspaceLayoutManifestV3) {
  return `${name}\n${JSON.stringify(manifest)}`;
}
