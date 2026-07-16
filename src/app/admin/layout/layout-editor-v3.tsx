"use client";

import { upload } from "@vercel/blob/client";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  GripVertical,
  History,
  Laptop,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  MonitorSmartphone,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  requestLayoutPublicationAction,
  saveLayoutRevisionAction,
  startLayoutDraftPreviewAction,
} from "./actions";
import { initialLayoutActionState, type LayoutActionState } from "./layout-action-state";
import { LayoutRichTextEditor } from "./layout-rich-text-editor";
import { saveLayoutTemplateAction } from "./template-actions";
import {
  cloneWorkspaceLayoutManifestV2,
  createWorkspaceCustomNodeV2,
  createWorkspaceLayoutId,
  flattenWorkspaceNodes,
  isWorkspaceCustomNodeV2,
  isWorkspaceProductionNodeV2,
  richTextDocumentFromPlainText,
  validateWorkspaceLayoutManifestV2,
  workspaceVisibilityCapabilityKeys,
  workspaceVisibilityDataKeys,
  workspaceLayoutRegistryV2,
  workspaceStarterTemplates,
  type WorkspaceCustomBlockKindV2,
  type WorkspaceCustomNodeV2,
  type WorkspaceLayoutColumnV2,
  type WorkspaceLayoutManifestV2,
  type WorkspaceLayoutNodeV2,
  type WorkspaceLayoutRowV2,
  type WorkspaceLayoutTabV2,
  type WorkspaceProductionNodeV2,
  type WorkspaceVisibilityConditionV1,
} from "@/lib/workspace-layout-v2";
import type { WorkspaceTabId } from "@/lib/workspace-layout";
import styles from "./layout-editor-v3.module.css";

export type LayoutRevisionSummary = {
  actorEmail: string;
  changeSummary: string;
  createdAt: string;
  id: string;
  manifest: WorkspaceLayoutManifestV2;
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

export type LayoutAssetSummary = {
  alt: string;
  contentType: string;
  height: number;
  id: string;
  pathname: string;
  sizeBytes: number;
  url: string;
  width: number;
};

export type LayoutTemplateSummary = {
  actorEmail: string;
  description: string;
  id: string;
  manifest: WorkspaceLayoutManifestV2;
  name: string;
  updatedAt: string;
};

type LayoutEditorProps = {
  activeDraftRevisionId?: string;
  assets: LayoutAssetSummary[];
  baseManifest: WorkspaceLayoutManifestV2;
  parentRevisionId: string | null;
  publications: LayoutPublicationSummary[];
  publisherEnabled: boolean;
  requestKey: string;
  revisions: LayoutRevisionSummary[];
  templates: LayoutTemplateSummary[];
};

type Viewport = "desktop" | "tablet" | "mobile";
type Selection =
  | { kind: "workspace" }
  | { kind: "tab"; tabId: WorkspaceTabId }
  | { columnId: string; kind: "column"; rowId: string; tabId: WorkspaceTabId }
  | { kind: "row"; rowId: string; tabId: WorkspaceTabId }
  | { columnId: string; kind: "node"; nodeId: string; rowId: string; tabId: WorkspaceTabId };

const customBlocks: Array<{ description: string; id: WorkspaceCustomBlockKindV2; label: string }> = [
  { description: "A titled section marker", id: "heading", label: "Heading" },
  { description: "Formatted explanatory copy", id: "rich-text", label: "Rich text" },
  { description: "Highlighted context or caution", id: "callout", label: "Callout" },
  { description: "Plain explanatory paragraph", id: "narrative", label: "Narrative" },
  { description: "A row of key values", id: "metric-strip", label: "Metrics" },
  { description: "Links shown as a compact list", id: "link-list", label: "Link list" },
  { description: "Prominent linked actions", id: "button-group", label: "Buttons" },
  { description: "Managed image from Vercel Blob", id: "image", label: "Image" },
  { description: "YouTube or Vimeo embed", id: "video", label: "Video" },
  { description: "Expandable question or detail rows", id: "accordion", label: "Accordion" },
  { description: "Visual section break", id: "divider", label: "Divider" },
];

export function LayoutEditor({
  activeDraftRevisionId,
  assets,
  baseManifest,
  parentRevisionId,
  publications,
  publisherEnabled,
  requestKey,
  revisions,
  templates,
}: LayoutEditorProps) {
  const [history, setHistory] = useState(() => ({ entries: [cloneWorkspaceLayoutManifestV2(baseManifest)], index: 0 }));
  const manifest = history.entries[history.index];
  const [activeTabId, setActiveTabId] = useState<WorkspaceTabId>(() => manifest.settings.defaultTab);
  const [selection, setSelection] = useState<Selection>({ kind: "workspace" });
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [changeSummary, setChangeSummary] = useState("");
  const [environment, setEnvironment] = useState<"preview" | "production">("preview");
  const [selectedRevisionId, setSelectedRevisionId] = useState(parentRevisionId ?? revisions[0]?.id ?? "");
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [sessionAssets, setSessionAssets] = useState<LayoutAssetSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [saveState, saveAction, saving] = useActionState(saveLayoutRevisionAction, initialLayoutActionState);
  const [publicationState, publicationAction, publishing] = useActionState(requestLayoutPublicationAction, initialLayoutActionState);
  const [templateState, templateAction, templateSaving] = useActionState(saveLayoutTemplateAction, initialLayoutActionState);
  const validation = useMemo(() => validateWorkspaceLayoutManifestV2(manifest), [manifest]);
  const errors = validation.ok ? [] : validation.errors;
  const dirty = JSON.stringify(manifest) !== JSON.stringify(baseManifest);
  const activeTab = manifest.tabs.find((tab) => tab.id === activeTabId) ?? manifest.tabs[0];
  const selectedNode = selection.kind === "node" ? findNode(manifest, selection.nodeId) : undefined;
  const selectedRow = selection.kind === "row" || selection.kind === "column" || selection.kind === "node"
    ? findRow(manifest, selection.rowId)
    : undefined;
  const selectedColumn = selection.kind === "column" || selection.kind === "node"
    ? selectedRow?.columns.find((column) => column.id === selection.columnId)
    : undefined;
  const allAssets = [...sessionAssets, ...assets.filter((asset) => !sessionAssets.some((item) => item.id === asset.id))];

  function commit(updater: (current: WorkspaceLayoutManifestV2) => WorkspaceLayoutManifestV2) {
    setHistory((current) => {
      const present = current.entries[current.index];
      const next = updater(cloneWorkspaceLayoutManifestV2(present));
      if (JSON.stringify(next) === JSON.stringify(present)) return current;
      return { entries: [...current.entries.slice(0, current.index + 1), next], index: current.index + 1 };
    });
  }

  function updateTab(tabId: WorkspaceTabId, updater: (tab: WorkspaceLayoutTabV2) => WorkspaceLayoutTabV2) {
    commit((current) => ({ ...current, tabs: current.tabs.map((tab) => tab.id === tabId ? updater(tab) : tab) }));
  }

  function updateNode(nodeId: string, updater: (node: WorkspaceLayoutNodeV2) => WorkspaceLayoutNodeV2) {
    commit((current) => mapManifestNodes(current, (node) => node.id === nodeId ? updater(node) : node));
  }

  function updateRow(rowId: string, updater: (row: WorkspaceLayoutRowV2) => WorkspaceLayoutRowV2) {
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => ({ ...tab, rows: tab.rows.map((row) => row.id === rowId ? updater(row) : row) })),
    }));
  }

  function addBlock(component: WorkspaceCustomBlockKindV2, destination?: { columnId: string; rowId: string }) {
    const node = createWorkspaceCustomNodeV2(component);
    if (destination) {
      updateRow(destination.rowId, (row) => ({ ...row, columns: row.columns.map((column) => column.id === destination.columnId ? { ...column, items: [...column.items, node] } : column) }));
      setSelection({ columnId: destination.columnId, kind: "node", nodeId: node.id, rowId: destination.rowId, tabId: activeTabId });
      return;
    }
    const row: WorkspaceLayoutRowV2 = {
      columns: [{ id: createWorkspaceLayoutId("column"), items: [node], span: { desktop: 12, mobile: 12, tablet: 12 } }],
      gap: "medium",
      id: createWorkspaceLayoutId("row"),
    };
    updateTab(activeTabId, (tab) => ({ ...tab, rows: [...tab.rows, row] }));
    setSelection({ columnId: row.columns[0].id, kind: "node", nodeId: node.id, rowId: row.id, tabId: activeTabId });
  }

  function addRow() {
    const row: WorkspaceLayoutRowV2 = {
      columns: [{ id: createWorkspaceLayoutId("column"), items: [], span: { desktop: 12, mobile: 12, tablet: 12 } }],
      gap: "medium",
      id: createWorkspaceLayoutId("row"),
    };
    updateTab(activeTabId, (tab) => ({ ...tab, rows: [...tab.rows, row] }));
    setSelection({ kind: "row", rowId: row.id, tabId: activeTabId });
  }

  function addColumn(rowId: string) {
    updateRow(rowId, (row) => {
      if (row.columns.length >= 4) return row;
      const span = row.columns.length === 1 ? 6 : row.columns.length === 2 ? 4 : 3;
      return {
        ...row,
        columns: [
          ...row.columns.map((column) => ({ ...column, span: { ...column.span, desktop: span as 3 | 4 | 6 } })),
          { id: createWorkspaceLayoutId("column"), items: [], span: { desktop: span as 3 | 4 | 6, mobile: 12, tablet: 6 } },
        ],
      };
    });
  }

  function removeNode(nodeId: string) {
    const target = findNode(manifest, nodeId);
    if (!target || isWorkspaceProductionNodeV2(target)) return;
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => ({
        ...tab,
        rows: tab.rows.map((row) => ({
          ...row,
          columns: row.columns.map((column) => ({ ...column, items: column.items.filter((node) => node.id !== nodeId) })),
        })),
      })),
    }));
    setSelection({ kind: "tab", tabId: activeTabId });
  }

  function moveNode(nodeId: string, destinationColumnId: string) {
    commit((current) => {
      const node = findNode(current, nodeId);
      if (!node) return current;
      const without = mapManifestColumns(current, (column) => ({ ...column, items: column.items.filter((item) => item.id !== nodeId) }));
      return mapManifestColumns(without, (column) => column.id === destinationColumnId
        ? { ...column, items: [...column.items, node] }
        : column);
    });
  }

  function moveNodeWithinColumn(columnId: string, nodeId: string, delta: -1 | 1) {
    commit((current) => mapManifestColumns(current, (column) => {
      if (column.id !== columnId) return column;
      const index = column.items.findIndex((item) => item.id === nodeId);
      const destination = index + delta;
      if (index < 0 || destination < 0 || destination >= column.items.length) return column;
      const items = [...column.items];
      const [item] = items.splice(index, 1);
      items.splice(destination, 0, item);
      return { ...column, items };
    }));
  }

  function moveRow(rowId: string, delta: -1 | 1) {
    updateTab(activeTabId, (tab) => {
      const index = tab.rows.findIndex((row) => row.id === rowId);
      const destination = index + delta;
      if (index < 0 || destination < 0 || destination >= tab.rows.length) return tab;
      const rows = [...tab.rows];
      const [row] = rows.splice(index, 1);
      rows.splice(destination, 0, row);
      return { ...tab, rows };
    });
  }

  function applyTemplate(template: WorkspaceLayoutManifestV2) {
    commit(() => cloneWorkspaceLayoutManifestV2(template));
    setActiveTabId(template.settings.defaultTab);
    setSelection({ kind: "workspace" });
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
        clientPayload: JSON.stringify({
          assetId,
          alt,
          contentType: file.type,
          height: bitmap.height,
          sizeBytes: file.size,
          width: bitmap.width,
        }),
        handleUploadUrl: "/api/admin/layout-assets/upload",
      });
      const asset = {
        alt,
        contentType: blob.contentType,
        height: bitmap.height,
        id: assetId,
        pathname: blob.pathname,
        sizeBytes: file.size,
        url: blob.url,
        width: bitmap.width,
      };
      setSessionAssets((current) => [asset, ...current]);
      attachAsset(nodeId, asset);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      bitmap?.close();
      setUploading(false);
    }
  }

  function attachAsset(nodeId: string, asset: LayoutAssetSummary) {
    updateNode(nodeId, (node) => isWorkspaceCustomNodeV2(node) ? {
      ...node,
      asset: {
        alt: asset.alt,
        assetId: asset.id,
        height: asset.height,
        url: asset.url,
        width: asset.width,
      },
    } : node);
  }

  return (
    <section className={styles.editor}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button disabled={history.index === 0} onClick={() => setHistory((current) => ({ ...current, index: current.index - 1 }))} type="button"><Undo2 size={16} /> Undo</button>
          <button disabled={history.index === history.entries.length - 1} onClick={() => setHistory((current) => ({ ...current, index: current.index + 1 }))} type="button"><Redo2 size={16} /> Redo</button>
          <button disabled={!dirty} onClick={() => {
            setHistory({ entries: [cloneWorkspaceLayoutManifestV2(baseManifest)], index: 0 });
            setSelection({ kind: "workspace" });
          }} type="button"><RotateCcw size={16} /> Reset</button>
        </div>
        <div aria-label="Preview width" className={styles.segmented} role="group">
          {(["desktop", "tablet", "mobile"] as const).map((mode) => {
            const Icon = mode === "desktop" ? Laptop : mode === "tablet" ? Tablet : Smartphone;
            return <button aria-pressed={viewport === mode} key={mode} onClick={() => setViewport(mode)} type="button"><Icon size={16} /><span>{mode}</span></button>;
          })}
        </div>
        <div className={styles.toolbarStatus}>
          <span>{dirty ? "Unsaved changes" : "Up to date"}</span>
          <span className={errors.length ? styles.errorBadge : styles.validBadge}>{errors.length ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : "Valid v2"}</span>
        </div>
      </header>
      {uploadError && <p className={styles.errorMessage} role="alert"><TriangleAlert size={15} /> {uploadError}</p>}

      <div className={styles.builderShell}>
        <aside className={styles.library}>
          <button className={styles.asideTitle} onClick={() => setLibraryOpen((value) => !value)} type="button">
            <LayoutGrid size={17} /> Build <span>{libraryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
          </button>
          {libraryOpen && <>
            <section>
              <h2>Tabs</h2>
              <div className={styles.tabList}>
                {workspaceLayoutRegistryV2.map((tab) => {
                  const configured = manifest.tabs.find((item) => item.id === tab.id)!;
                  return (
                    <button aria-pressed={activeTabId === tab.id} key={tab.id} onClick={() => {
                      setActiveTabId(tab.id);
                      setSelection({ kind: "tab", tabId: tab.id });
                    }} type="button">
                      <span>{tab.label}</span>
                      {tab.required ? <LockKeyhole size={13} /> : configured.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <h2>Content blocks</h2>
              <div className={styles.blockPalette}>
                {customBlocks.map((block) => (
                  <button key={block.id} onClick={() => addBlock(block.id)} title={block.description} type="button">
                    <Plus size={14} /><span><strong>{block.label}</strong><small>{block.description}</small></span>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h2>Starter layouts</h2>
              <div className={styles.templateList}>
                {workspaceStarterTemplates.map((template) => (
                  <button key={template.id} onClick={() => applyTemplate(template.manifest)} type="button">
                    <strong>{template.label}</strong><small>{template.description}</small>
                  </button>
                ))}
                {templates.map((template) => (
                  <button key={template.id} onClick={() => applyTemplate(template.manifest)} type="button">
                    <strong>{template.name}</strong><small>{template.description || `Shared by ${template.actorEmail}`}</small>
                  </button>
                ))}
              </div>
            </section>
          </>}
        </aside>

        <main className={styles.stage}>
          <div className={styles.stageHeader}>
            <div><span>Live-layout preview</span><h2>{workspaceLayoutRegistryV2.find((tab) => tab.id === activeTabId)?.label}</h2></div>
            <button onClick={addRow} type="button"><Plus size={15} /> Add row</button>
          </div>
          <div className={`${styles.viewport} ${styles[viewport]}`} data-layout-accent={manifest.settings.accentColor} data-layout-theme={manifest.settings.theme}>
            <div className={styles.sitePreviewHeader}>
              <div className={styles.previewBrand}><span>CR</span><strong>Civic Result Maps</strong></div>
              <div className={styles.previewMetrics}><span>Jurisdictions <strong>39</strong></span><span>Sources <strong>12</strong></span><span>Validation <strong>Pass</strong></span></div>
            </div>
            <div className={styles.previewTabs}>{manifest.tabs.filter((tab) => tab.visible).map((tab) => <span className={tab.id === activeTabId ? styles.activePreviewTab : ""} key={tab.id}>{workspaceLayoutRegistryV2.find((item) => item.id === tab.id)?.label}</span>)}</div>
            <div className={styles.rows}>
              {activeTab.rows.map((row, rowIndex) => (
                <section
                  aria-label={`Layout row ${rowIndex + 1}`}
                  className={styles.row}
                  data-selected={selection.kind === "row" && selection.rowId === row.id}
                  key={row.id}
                  onClick={() => setSelection({ kind: "row", rowId: row.id, tabId: activeTabId })}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelection({ kind: "row", rowId: row.id, tabId: activeTabId }); }}
                  tabIndex={0}
                >
                  <div className={styles.rowControls}>
                    <span>Row {rowIndex + 1}</span>
                    <button aria-label="Move row up" disabled={rowIndex === 0} onClick={(event) => { event.stopPropagation(); moveRow(row.id, -1); }} type="button"><ArrowUp size={13} /></button>
                    <button aria-label="Move row down" disabled={rowIndex === activeTab.rows.length - 1} onClick={(event) => { event.stopPropagation(); moveRow(row.id, 1); }} type="button"><ArrowDown size={13} /></button>
                    <button onClick={(event) => { event.stopPropagation(); addColumn(row.id); }} type="button"><Columns3 size={13} /> Column</button>
                  </div>
                  <div className={styles.columns} data-gap={row.gap ?? "medium"}>
                    {row.columns.map((column) => (
                      <div
                        aria-label={`Column ${column.id.slice(-4)}`}
                        className={styles.column}
                        data-empty={column.items.length === 0}
                        data-selected={(selection.kind === "column" || selection.kind === "node") && selection.columnId === column.id}
                        key={column.id}
                        onClick={(event) => { event.stopPropagation(); setSelection({ columnId: column.id, kind: "column", rowId: row.id, tabId: activeTabId }); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedNodeId) moveNode(draggedNodeId, column.id);
                          setDraggedNodeId(null);
                        }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelection({ columnId: column.id, kind: "column", rowId: row.id, tabId: activeTabId }); }}
                        style={{ "--builder-span": column.span[viewport] } as CSSProperties}
                        tabIndex={0}
                      >
                        {column.items.map((node) => (
                          <BuilderNode
                            key={node.id}
                            node={node}
                            onDragEnd={() => setDraggedNodeId(null)}
                            onDragStart={() => setDraggedNodeId(node.id)}
                            onSelect={() => setSelection({ columnId: column.id, kind: "node", nodeId: node.id, rowId: row.id, tabId: activeTabId })}
                            selected={selection.kind === "node" && selection.nodeId === node.id}
                          />
                        ))}
                        {!column.items.length && <button className={styles.emptyColumn} onClick={(event) => { event.stopPropagation(); addBlock("rich-text", { columnId: column.id, rowId: row.id }); }} type="button"><Plus size={15} /> Drop or add content</button>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {!activeTab.rows.length && <button className={styles.emptyCanvas} onClick={addRow} type="button"><Plus /> Add the first row</button>}
            </div>
          </div>
        </main>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHeader}><Settings2 size={17} /><div><span>Configure</span><strong>{selectionLabel(selection, selectedNode)}</strong></div><button aria-label="Inspect workspace" onClick={() => setSelection({ kind: "workspace" })} type="button"><X size={15} /></button></div>
          {selection.kind === "workspace" && <WorkspaceInspector manifest={manifest} onChange={(settings) => commit((current) => ({ ...current, settings }))} />}
          {selection.kind === "tab" && <TabInspector tab={activeTab} required={workspaceLayoutRegistryV2.find((tab) => tab.id === activeTab.id)?.required ?? false} onChange={(tab) => updateTab(activeTab.id, () => tab)} />}
          {selection.kind === "row" && selectedRow && <RowInspector row={selectedRow} onChange={(row) => updateRow(row.id, () => row)} />}
          {selection.kind === "column" && selectedColumn && <ColumnInspector column={selectedColumn} viewport={viewport} onChange={(column) => updateRow(selection.rowId, (row) => ({ ...row, columns: row.columns.map((item) => item.id === column.id ? column : item) }))} />}
          {selection.kind === "node" && selectedNode && <NodeInspector
            assets={allAssets}
            node={selectedNode}
            onAttachAsset={(asset) => attachAsset(selectedNode.id, asset)}
            onChange={(node) => updateNode(node.id, () => node)}
            onRemove={() => removeNode(selectedNode.id)}
            onMove={(delta) => moveNodeWithinColumn(selection.columnId, selectedNode.id, delta)}
            onUpload={(file, alt) => uploadImage(file, alt, selectedNode.id)}
            uploading={uploading}
          />}
        </aside>
      </div>

      <footer className={styles.operations}>
        <section className={styles.operationCard}>
          <div><Save size={18} /><span><strong>Save immutable revision</strong><small>Review validation, describe the change, then save.</small></span></div>
          {errors.length > 0 && <ul className={styles.errorList}>{errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul>}
          <form action={saveAction}>
            <input name="manifest" type="hidden" value={JSON.stringify(manifest)} />
            <input name="parentRevisionId" type="hidden" value={parentRevisionId ?? ""} />
            <label>Change summary<input minLength={5} maxLength={500} name="changeSummary" onChange={(event) => setChangeSummary(event.target.value)} placeholder="Describe what visitors will notice" value={changeSummary} /></label>
            <button disabled={saving || errors.length > 0 || changeSummary.trim().length < 5 || !dirty} type="submit">{saving ? <LoaderCircle className={styles.spin} size={16} /> : <Save size={16} />} Save revision</button>
          </form>
          <ActionMessage state={saveState} />
        </section>

        <section className={styles.operationCard}>
          <div><Copy size={18} /><span><strong>Save as shared template</strong><small>Reuse this complete workspace without publishing it.</small></span></div>
          <form action={templateAction}>
            <input name="manifest" type="hidden" value={JSON.stringify(manifest)} />
            <label>Template name<input maxLength={80} minLength={3} name="name" placeholder="County review workspace" /></label>
            <label>Description<input maxLength={240} name="description" placeholder="When this layout works best" /></label>
            <button disabled={templateSaving || errors.length > 0} type="submit">{templateSaving ? <LoaderCircle className={styles.spin} size={16} /> : <Copy size={16} />} Save template</button>
          </form>
          <ActionMessage state={templateState} />
        </section>

        <section className={styles.operationCard}>
          <div><Send size={18} /><span><strong>Preview and publish</strong><small>Saved revisions only; production confirmation is required.</small></span></div>
          <form action={startLayoutDraftPreviewAction}>
            <label>Revision<select name="revisionId" onChange={(event) => setSelectedRevisionId(event.target.value)} value={selectedRevisionId}>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.changeSummary} · {new Date(revision.createdAt).toLocaleString()}</option>)}</select></label>
            <button disabled={!selectedRevisionId} type="submit"><MonitorSmartphone size={16} /> Preview revision</button>
          </form>
          <form action={publicationAction}>
            <input name="requestKey" type="hidden" value={requestKey} />
            <input name="revisionId" type="hidden" value={selectedRevisionId} />
            <label>Environment<select name="environment" onChange={(event) => setEnvironment(event.target.value as "preview" | "production")} value={environment}><option value="preview">Preview</option><option value="production">Production</option></select></label>
            <label>Action<select name="publicationAction"><option value="stage">Stage candidate</option><option value="promote">Promote stable</option><option value="rollback">Rollback stable</option></select></label>
            {environment === "production" && <label className={styles.confirm}><input name="confirmProduction" type="checkbox" value="yes" /> I confirm this production change</label>}
            <button disabled={!publisherEnabled || publishing || !selectedRevisionId} type="submit">{publishing ? <LoaderCircle className={styles.spin} size={16} /> : <Send size={16} />} Request publication</button>
          </form>
          {!publisherEnabled && <p className={styles.notice}><LockKeyhole size={14} /> Publishing workflow is currently queued-only.</p>}
          {activeDraftRevisionId && <p className={styles.notice}><Eye size={14} /> Draft preview is active for {activeDraftRevisionId.slice(0, 8)}.</p>}
          <ActionMessage state={publicationState} />
        </section>

        <section className={styles.operationCard}>
          <div><History size={18} /><span><strong>Recent activity</strong><small>Revision and publication audit trail.</small></span></div>
          <ol className={styles.historyList}>{revisions.slice(0, 8).map((revision) => <li key={revision.id}><strong>{revision.changeSummary}</strong><span>{revision.actorEmail} · {new Date(revision.createdAt).toLocaleString()}</span></li>)}</ol>
          {publications.slice(0, 4).map((publication) => <p className={styles.publication} key={publication.id}><span>{publication.environment} / {publication.channel}</span><strong>{publication.status}</strong></p>)}
        </section>
      </footer>
    </section>
  );
}

function BuilderNode({ node, onDragEnd, onDragStart, onSelect, selected }: {
  node: WorkspaceLayoutNodeV2;
  onDragEnd: () => void;
  onDragStart: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const label = isWorkspaceProductionNodeV2(node) ? productionLabel(node) : customLabel(node);
  return (
    <article className={styles.builderNode} data-kind={node.kind} data-selected={selected} data-visible={node.visible} draggable onDragEnd={onDragEnd} onDragStart={onDragStart} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <div className={styles.nodeToolbar}>
        <button aria-label={`Drag ${label}`} className={styles.dragHandle} type="button"><GripVertical size={16} /></button>
        <span>{node.kind === "production" ? "Production" : "Content"}</span>
        {!node.visible && <EyeOff size={13} />}
        <button aria-label={`Configure ${label}`} onClick={onSelect} type="button"><Settings2 size={15} /></button>
      </div>
      <div className={styles.nodePreview}>
        <strong>{label}</strong>
        {isWorkspaceProductionNodeV2(node) ? <ProductionSketch node={node} /> : <CustomSketch node={node} />}
      </div>
    </article>
  );
}

function ProductionSketch({ node }: { node: WorkspaceProductionNodeV2 }) {
  if (node.component === "results-map") return <div className={styles.mapSketch}><span /><i /><i /><i /></div>;
  if (node.component === "state-snapshot") return <div className={styles.metricSketch}><span>Candidate A</span><b /><span>Candidate B</span><b /></div>;
  if (node.component === "source-provenance") return <div className={styles.textSketch}><span /><span /><span /></div>;
  if (node.component === "review-center") return <div className={styles.pillSketch}><span>Overview</span><span>Tools</span><span>Indicators</span></div>;
  return <div className={styles.textSketch}><span /><span /></div>;
}

function CustomSketch({ node }: { node: WorkspaceCustomNodeV2 }) {
  if (node.component === "image") return node.asset ? <img alt={node.asset.alt} src={node.asset.url} /> : <div className={styles.imagePlaceholder}><FileImage size={24} /> Choose image</div>;
  if (node.component === "divider") return <hr />;
  if (node.component === "metric-strip") return <div className={styles.pillSketch}>{node.items?.map((item) => <span key={item.label}>{item.value || item.label}</span>)}</div>;
  return <p>{node.body || node.document?.blocks[0]?.children.map((child) => child.text).join("") || "Configure this content with the gear."}</p>;
}

function WorkspaceInspector({ manifest, onChange }: { manifest: WorkspaceLayoutManifestV2; onChange: (settings: WorkspaceLayoutManifestV2["settings"]) => void }) {
  const settings = manifest.settings;
  const update = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => onChange({ ...settings, [key]: value });
  return <div className={styles.inspectorBody}>
    <fieldset><legend>Design system</legend>
      <Select label="Theme" value={settings.theme} onChange={(value) => update("theme", value as typeof settings.theme)} options={["civic", "warm", "high-contrast"]} />
      <Select label="Content width" value={settings.contentWidth} onChange={(value) => update("contentWidth", value as typeof settings.contentWidth)} options={["standard", "wide", "full"]} />
      <Select label="Spacing" value={settings.spacingScale} onChange={(value) => update("spacingScale", value as typeof settings.spacingScale)} options={["tight", "standard", "relaxed"]} />
      <Select label="Type scale" value={settings.typeScale} onChange={(value) => update("typeScale", value as typeof settings.typeScale)} options={["small", "standard", "large"]} />
      <Select label="Corners" value={settings.radius} onChange={(value) => update("radius", value as typeof settings.radius)} options={["square", "subtle", "rounded"]} />
      <Select label="Shadows" value={settings.shadow} onChange={(value) => update("shadow", value as typeof settings.shadow)} options={["none", "subtle", "raised"]} />
      <Select label="Tab style" value={settings.tabStyle} onChange={(value) => update("tabStyle", value as typeof settings.tabStyle)} options={["bar", "pills"]} />
      <label>Accent color<input aria-label="Accent color" type="color" value={settings.accentColor ?? "#18a77a"} onChange={(event) => update("accentColor", event.target.value)} /></label>
    </fieldset>
    <fieldset><legend>Defaults</legend>
      <Select label="Default tab" value={settings.defaultTab} onChange={(value) => update("defaultTab", value as WorkspaceTabId)} options={manifest.tabs.filter((tab) => tab.visible).map((tab) => tab.id)} />
      <Select label="Data notes" value={settings.notesDefault} onChange={(value) => update("notesDefault", value as typeof settings.notesDefault)} options={["collapsed", "expanded"]} />
    </fieldset>
  </div>;
}

function TabInspector({ tab, required, onChange }: { tab: WorkspaceLayoutTabV2; required: boolean; onChange: (tab: WorkspaceLayoutTabV2) => void }) {
  return <div className={styles.inspectorBody}>
    <fieldset><legend>Tab settings</legend>
      <label className={styles.switchLabel}><input checked={tab.visible} disabled={required} onChange={(event) => onChange({ ...tab, visible: event.target.checked })} type="checkbox" /> Visible {required && <small>Required</small>}</label>
      <Select label="Density" value={tab.settings?.density ?? "comfortable"} onChange={(value) => onChange({ ...tab, settings: { ...tab.settings, density: value as "compact" | "comfortable" | "spacious" } })} options={["compact", "comfortable", "spacious"]} />
      <Select label="Data notes position" value={tab.settings?.notesPosition ?? "side"} onChange={(value) => onChange({ ...tab, settings: { ...tab.settings, notesPosition: value as "side" | "below" | "drawer" } })} options={["side", "below", "drawer"]} />
    </fieldset>
  </div>;
}

function RowInspector({ row, onChange }: { row: WorkspaceLayoutRowV2; onChange: (row: WorkspaceLayoutRowV2) => void }) {
  return <div className={styles.inspectorBody}><fieldset><legend>Row layout</legend>
    <Select label="Gap" value={row.gap ?? "medium"} onChange={(value) => onChange({ ...row, gap: value as "small" | "medium" | "large" })} options={["small", "medium", "large"]} />
    <Select label="Vertical alignment" value={row.align ?? "stretch"} onChange={(value) => onChange({ ...row, align: value as "start" | "center" | "stretch" })} options={["start", "center", "stretch"]} />
    <p>{row.columns.length} column{row.columns.length === 1 ? "" : "s"}; up to four are supported.</p>
  </fieldset></div>;
}

function ColumnInspector({ column, viewport, onChange }: { column: WorkspaceLayoutColumnV2; viewport: Viewport; onChange: (column: WorkspaceLayoutColumnV2) => void }) {
  const options = viewport === "desktop" ? [3, 4, 6, 8, 9, 12] : viewport === "tablet" ? [6, 12] : [12];
  return <div className={styles.inspectorBody}><fieldset><legend>Responsive width</legend>
    <label>{viewport} columns<select value={column.span[viewport]} onChange={(event) => onChange({ ...column, span: { ...column.span, [viewport]: Number(event.target.value) } as WorkspaceLayoutColumnV2["span"] })}>{options.map((span) => <option key={span} value={span}>{span} / 12</option>)}</select></label>
    <div className={styles.breakpointSummary}><span>Desktop {column.span.desktop}/12</span><span>Tablet {column.span.tablet}/12</span><span>Mobile 12/12</span></div>
  </fieldset></div>;
}

function NodeInspector({ assets, node, onAttachAsset, onChange, onMove, onRemove, onUpload, uploading }: {
  assets: LayoutAssetSummary[];
  node: WorkspaceLayoutNodeV2;
  onAttachAsset: (asset: LayoutAssetSummary) => void;
  onChange: (node: WorkspaceLayoutNodeV2) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  onUpload: (file: File, alt: string) => Promise<void>;
  uploading: boolean;
}) {
  const update = (patch: Partial<WorkspaceLayoutNodeV2>) => onChange({ ...node, ...patch } as WorkspaceLayoutNodeV2);
  const protectedSurface = isWorkspaceProductionNodeV2(node) && workspaceLayoutRegistryV2.some(
    (tab) => tab.components.some((component) => component.id === node.component && component.required),
  );
  return <div className={styles.inspectorBody}>
    <fieldset><legend>Display</legend>
      <label className={styles.switchLabel}><input checked={node.visible} disabled={protectedSurface} onChange={(event) => update({ visible: event.target.checked })} type="checkbox" /> Visible {protectedSurface && <small>Required trust surface</small>}</label>
      <Select label="Surface" value={node.presentation?.surface ?? "panel"} onChange={(value) => update({ presentation: { ...node.presentation, surface: value as "panel" | "plain" | "muted" | "accent" } })} options={["panel", "plain", "muted", "accent"]} />
      <Select label="Emphasis" value={node.presentation?.emphasis ?? "standard"} onChange={(value) => update({ presentation: { ...node.presentation, emphasis: value as "quiet" | "standard" | "prominent" } })} options={["quiet", "standard", "prominent"]} />
      <Select label="Density" value={node.presentation?.density ?? "comfortable"} onChange={(value) => update({ presentation: { ...node.presentation, density: value as "compact" | "comfortable" | "spacious" } })} options={["compact", "comfortable", "spacious"]} />
    </fieldset>
    <fieldset><legend>Order in column</legend><div className={styles.breakpointSummary}>
      <button onClick={() => onMove(-1)} type="button"><ArrowUp size={14} /> Earlier</button>
      <button onClick={() => onMove(1)} type="button"><ArrowDown size={14} /> Later</button>
    </div></fieldset>
    {isWorkspaceProductionNodeV2(node)
      ? <ProductionInspector node={node} onChange={onChange} />
      : <CustomInspector assets={assets} key={`${node.id}:${node.asset?.assetId ?? ""}`} node={node} onAttachAsset={onAttachAsset} onChange={onChange} onUpload={onUpload} uploading={uploading} />}
    {protectedSurface
      ? <fieldset><legend>Visibility rules</legend><p>This required public-interest trust surface is always visible.</p></fieldset>
      : <VisibilityInspector node={node} onChange={onChange} />}
    {isWorkspaceCustomNodeV2(node) && <button className={styles.dangerButton} onClick={onRemove} type="button"><Trash2 size={15} /> Remove custom block</button>}
  </div>;
}

function ProductionInspector({ node, onChange }: { node: WorkspaceProductionNodeV2; onChange: (node: WorkspaceLayoutNodeV2) => void }) {
  const config = node.config ?? {};
  const setConfig = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return <fieldset><legend>Component variant</legend>
    {node.component === "results-map" && <><Select label="Composition" value={config.mapComposition ?? "map-first"} onChange={(value) => setConfig({ mapComposition: value as "map-first" | "table-first" | "split" })} options={["map-first", "table-first", "split"]} /><Select label="Legend" value={config.legendPosition ?? "below"} onChange={(value) => setConfig({ legendPosition: value as "inline" | "below" })} options={["inline", "below"]} /></>}
    {node.component === "coverage-context" && <Select label="Coverage display" value={config.coverageVariant ?? "list"} onChange={(value) => setConfig({ coverageVariant: value as "list" | "cards" | "compact" })} options={["list", "cards", "compact"]} />}
    {node.component === "state-snapshot" && <Select label="Snapshot display" value={config.snapshotVariant ?? "bars"} onChange={(value) => setConfig({ snapshotVariant: value as "bars" | "metrics" | "table" })} options={["bars", "metrics", "table"]} />}
    {node.component === "source-provenance" && <><Select label="Provenance display" value={config.provenanceVariant ?? "expanded"} onChange={(value) => setConfig({ provenanceVariant: value as "summary" | "expanded" | "accordion" })} options={["summary", "expanded", "accordion"]} /><Select label="Initial state" value={config.provenanceInitialState ?? "expanded"} onChange={(value) => setConfig({ provenanceInitialState: value as "collapsed" | "expanded" })} options={["collapsed", "expanded"]} /></>}
    {node.component === "review-center" && <Select label="Navigation" value={config.navigationStyle ?? "tabs"} onChange={(value) => setConfig({ navigationStyle: value as "tabs" | "pills" | "sidebar" })} options={["tabs", "pills", "sidebar"]} />}
    {!node.config && <p>This component uses its production-safe default variant.</p>}
  </fieldset>;
}

function CustomInspector({ assets, node, onAttachAsset, onChange, onUpload, uploading }: {
  assets: LayoutAssetSummary[];
  node: WorkspaceCustomNodeV2;
  onAttachAsset: (asset: LayoutAssetSummary) => void;
  onChange: (node: WorkspaceLayoutNodeV2) => void;
  onUpload: (file: File, alt: string) => Promise<void>;
  uploading: boolean;
}) {
  const [alt, setAlt] = useState(node.asset?.alt ?? "");
  const set = (patch: Partial<WorkspaceCustomNodeV2>) => onChange({ ...node, ...patch });
  return <fieldset><legend>Content</legend>
    {node.component !== "divider" && <label>Title<input maxLength={160} value={node.title ?? ""} onChange={(event) => set({ title: event.target.value })} /></label>}
    {node.component === "rich-text" ? <LayoutRichTextEditor document={node.document ?? richTextDocumentFromPlainText(node.body ?? "")} key={node.id} onChange={(document) => set({ document })} /> : ["narrative", "callout", "heading", "button-group", "link-list"].includes(node.component) && <label>Body<textarea maxLength={2000} rows={5} value={node.body ?? ""} onChange={(event) => set({ body: event.target.value })} /></label>}
    {node.component === "image" && <>
      <label>Alternative text<input maxLength={240} onChange={(event) => { setAlt(event.target.value); if (node.asset) set({ asset: { ...node.asset, alt: event.target.value } }); }} value={alt} /></label>
      <label className={styles.uploadButton}>{uploading ? <LoaderCircle className={styles.spin} size={16} /> : <FileImage size={16} />} Upload image<input accept="image/avif,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, alt); }} type="file" /></label>
      {assets.length > 0 && <div className={styles.assetGrid}>{assets.map((asset) => <button key={asset.id} onClick={() => onAttachAsset(asset)} type="button"><img alt={asset.alt} src={asset.url} /><span>{asset.alt || asset.pathname}</span></button>)}</div>}
      <label>Caption<input maxLength={300} value={node.asset?.caption ?? ""} onChange={(event) => node.asset && set({ asset: { ...node.asset, caption: event.target.value } })} /></label>
      <label className={styles.switchLabel}><input checked={node.asset?.decorative ?? false} disabled={!node.asset} onChange={(event) => node.asset && set({ asset: { ...node.asset, decorative: event.target.checked } })} type="checkbox" /> Decorative image</label>
    </>}
    {node.component === "video" && <><Select label="Provider" value={node.video?.provider ?? "youtube"} onChange={(value) => set({ video: { id: node.video?.id ?? "", provider: value as "youtube" | "vimeo", title: node.video?.title ?? node.title ?? "Video" } })} options={["youtube", "vimeo"]} /><label>Video ID<input value={node.video?.id ?? ""} onChange={(event) => set({ video: { id: event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""), provider: node.video?.provider ?? "youtube", title: node.video?.title ?? node.title ?? "Video" } })} /></label></>}
    {["metric-strip", "link-list", "button-group", "accordion"].includes(node.component) && <ItemsEditor node={node} onChange={set} />}
  </fieldset>;
}

function ItemsEditor({ node, onChange }: { node: WorkspaceCustomNodeV2; onChange: (patch: Partial<WorkspaceCustomNodeV2>) => void }) {
  const items = node.items ?? [];
  return <div className={styles.itemsEditor}><span>Items</span>{items.map((item, index) => <div key={index}>
    <input aria-label={`Item ${index + 1} label`} placeholder="Label" value={item.label} onChange={(event) => onChange({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) })} />
    {node.component === "metric-strip" && <input aria-label={`Item ${index + 1} value`} placeholder="Value" value={item.value ?? ""} onChange={(event) => onChange({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) })} />}
    {["link-list", "button-group"].includes(node.component) && <input aria-label={`Item ${index + 1} link`} placeholder="https:// or /path" value={item.href ?? ""} onChange={(event) => onChange({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, href: event.target.value } : entry) })} />}
    {node.component === "accordion" && <textarea aria-label={`Item ${index + 1} body`} placeholder="Expanded content" value={item.body ?? ""} onChange={(event) => onChange({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, body: event.target.value } : entry) })} />}
    <button aria-label={`Remove item ${index + 1}`} onClick={() => onChange({ items: items.filter((_, itemIndex) => itemIndex !== index) })} type="button"><Trash2 size={14} /></button>
  </div>)}<button onClick={() => onChange({ items: [...items, { label: "New item", value: node.component === "metric-strip" ? "0" : undefined }] })} type="button"><Plus size={14} /> Add item</button></div>;
}
function initialVisibilityCondition(
  fact: WorkspaceVisibilityConditionV1["fact"],
): WorkspaceVisibilityConditionV1 {
  if (fact === "data") return { fact, key: workspaceVisibilityDataKeys[0], operator: "available" };
  if (fact === "capability") return { fact, key: workspaceVisibilityCapabilityKeys[0], operator: "available" };
  if (fact === "year") return { fact, operator: "equals", value: 2024 };
  if (fact === "validation") return { fact, operator: "equals", value: "passed" };
  return { fact, operator: "equals", value: "" };
}

function visibilityRuleOptions(fact?: WorkspaceVisibilityConditionV1["fact"]): readonly string[] {
  if (fact === "data") return workspaceVisibilityDataKeys;
  if (fact === "capability") return workspaceVisibilityCapabilityKeys;
  if (fact === "year") return ["2016", "2020", "2024"];
  if (fact === "validation") return ["passed", "warning", "failed", "unknown"];
  return [];
}


function VisibilityInspector({ node, onChange }: { node: WorkspaceLayoutNodeV2; onChange: (node: WorkspaceLayoutNodeV2) => void }) {
  const visibility = node.visibility ?? { groups: [], operator: "all" as const, viewports: { desktop: true, mobile: true, tablet: true } };
  const condition = visibility.groups?.[0]?.conditions[0];
  const ruleOptions = visibilityRuleOptions(condition?.fact);
  const updateViewports = (key: "desktop" | "mobile" | "tablet", value: boolean) => onChange({ ...node, visibility: { ...visibility, viewports: { ...visibility.viewports, [key]: value } } });
  return <fieldset><legend>Visibility rules</legend>
    <div className={styles.viewportChecks}>{(["desktop", "tablet", "mobile"] as const).map((key) => <label key={key}><input checked={visibility.viewports?.[key] !== false} onChange={(event) => updateViewports(key, event.target.checked)} type="checkbox" /> {key}</label>)}</div>
    <label>Data rule<select value={condition?.fact ?? "always"} onChange={(event) => {
      if (event.target.value === "always") return onChange({ ...node, visibility: { ...visibility, groups: [] } });
      const fact = event.target.value as WorkspaceVisibilityConditionV1["fact"];
      onChange({ ...node, visibility: { ...visibility, groups: [{ conditions: [initialVisibilityCondition(fact)], operator: "all" }] } });
    }}><option value="always">Always</option><option value="state">State equals</option><option value="year">Year equals</option><option value="capability">Capability available</option><option value="data">Data available</option><option value="validation">Validation status</option></select></label>
    {condition && <label>Rule value<input list={ruleOptions.length ? "layout-visibility-rule-options" : undefined} value={String(condition.key ?? condition.value ?? "")} onChange={(event) => {
      const raw = event.target.value;
      const next = condition.fact === "capability" || condition.fact === "data"
        ? { ...condition, key: raw, operator: "available" as const, value: undefined }
        : { ...condition, value: condition.fact === "year" ? Number(raw) || 0 : raw };
      onChange({ ...node, visibility: { ...visibility, groups: [{ conditions: [next], operator: "all" }] } });
    }} /></label>}
    {ruleOptions.length > 0 && <datalist id="layout-visibility-rule-options">{ruleOptions.map((option) => <option key={option} value={option} />)}</datalist>}
    <small>Rules use allowlisted state, year, capability, data, and validation facts. Required production components cannot be conditional.</small>
  </fieldset>;
}

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: readonly string[]; value: string }) {
  return <label>{label}<select onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}</select></label>;
}

function ActionMessage({ state }: { state: LayoutActionState }) {
  if (state.kind === "idle") return null;
  const Icon = state.kind === "success" ? CheckCircle2 : TriangleAlert;
  return <p className={state.kind === "success" ? styles.successMessage : styles.errorMessage} role="status"><Icon size={15} /> {state.message}</p>;
}

function mapManifestNodes(manifest: WorkspaceLayoutManifestV2, mapper: (node: WorkspaceLayoutNodeV2) => WorkspaceLayoutNodeV2) {
  return mapManifestColumns(manifest, (column) => ({ ...column, items: column.items.map(mapper) }));
}

function mapManifestColumns(manifest: WorkspaceLayoutManifestV2, mapper: (column: WorkspaceLayoutColumnV2) => WorkspaceLayoutColumnV2) {
  return {
    ...manifest,
    tabs: manifest.tabs.map((tab) => ({ ...tab, rows: tab.rows.map((row) => ({ ...row, columns: row.columns.map(mapper) })) })),
  };
}

function findNode(manifest: WorkspaceLayoutManifestV2, nodeId: string) {
  return manifest.tabs.flatMap(flattenWorkspaceNodes).find((node) => node.id === nodeId);
}

function findRow(manifest: WorkspaceLayoutManifestV2, rowId: string) {
  return manifest.tabs.flatMap((tab) => tab.rows).find((row) => row.id === rowId);
}

function productionLabel(node: WorkspaceProductionNodeV2) {
  for (const tab of workspaceLayoutRegistryV2) {
    const component = tab.components.find((item) => item.id === node.component);
    if (component) return component.label;
  }
  return titleCase(node.component);
}

function customLabel(node: WorkspaceCustomNodeV2) {
  return node.title || titleCase(node.component);
}

function selectionLabel(selection: Selection, node?: WorkspaceLayoutNodeV2) {
  if (selection.kind === "workspace") return "Workspace design";
  if (selection.kind === "tab") return "Tab settings";
  if (selection.kind === "row") return "Row";
  if (selection.kind === "column") return "Column";
  return node ? (isWorkspaceProductionNodeV2(node) ? productionLabel(node) : customLabel(node)) : "Component";
}

function titleCase(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
