"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import {
  Columns2,
  EyeOff,
  FileImage,
  GripVertical,
  LockKeyhole,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { WorkspaceTabId } from "@/lib/workspace-layout";
import { workspaceLayoutRegistryV2 } from "@/lib/workspace-layout-v2";
import type {
  WorkspaceLayoutColumnV3,
  WorkspaceLayoutGroupV3,
  WorkspaceLayoutManifestV3,
  WorkspaceLayoutNodeV3,
  WorkspaceLayoutRowV3,
} from "@/lib/workspace-layout-v3";
import {
  nodeLabel,
  requiredProductionNode,
  tabLabel,
} from "./layout-editor-v4-model";
import type {
  LayoutSelection,
  LayoutViewport,
} from "./layout-editor-v4-types";
import base from "./layout-editor-v3.module.css";
import styles from "./layout-editor-v4.module.css";

type CanvasCallbacks = {
  onAddColumn: (rowId: string) => void;
  onAddRow: (groupId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onResizeColumn: (columnId: string, delta: -1 | 1) => void;
  onSelect: (selection: LayoutSelection, event?: ReactMouseEvent) => void;
};

export function LayoutStructureTree({
  activeTabId,
  manifest,
  onSelect,
  onSelectTab,
  selection,
}: {
  activeTabId: WorkspaceTabId;
  manifest: WorkspaceLayoutManifestV3;
  onSelect: (selection: LayoutSelection, event?: ReactMouseEvent) => void;
  onSelectTab: (tabId: WorkspaceTabId) => void;
  selection: LayoutSelection;
}) {
  return (
    <nav aria-label="Workspace structure" className={styles.tree}>
      <ul>
        {manifest.tabs.map((tab) => (
          <li key={tab.id}>
            <div className={styles.treeRow}>
              <button
                className={styles.treeSelect}
                data-hidden={!tab.visible}
                data-selected={selection.kind === "tab" && selection.tabId === tab.id}
                onClick={() => {
                  onSelectTab(tab.id);
                  onSelect({ kind: "tab", tabId: tab.id });
                }}
                type="button"
              >
                <Columns2 size={13} /><span>{tabLabel(tab.id)}</span>
                {!tab.visible && <EyeOff size={11} />}
              </button>
            </div>
            {tab.id === activeTabId && (
              <ul className={styles.treeChildren}>
                {tab.groups.map((group) => (
                  <li key={group.id}>
                    <div className={styles.treeRow}>
                      <button
                        className={styles.treeSelect}
                        data-selected={selection.kind === "group" && selection.groupId === group.id}
                        onClick={() => onSelect({ groupId: group.id, kind: "group", tabId: tab.id })}
                        type="button"
                      >
                        {group.locked ? <LockKeyhole size={11} /> : <span aria-hidden>G</span>}
                        <span>{group.name}</span><small className={styles.treeMeta}>{group.rows.length} rows</small>
                      </button>
                    </div>
                    <ul className={styles.treeChildren}>
                      {group.rows.map((row, rowIndex) => (
                        <li key={row.id}>
                          <button
                            className={styles.treeSelect}
                            data-selected={selection.kind === "row" && selection.rowId === row.id}
                            onClick={() => onSelect({ groupId: group.id, kind: "row", rowId: row.id, tabId: tab.id })}
                            type="button"
                          >
                            {row.locked ? <LockKeyhole size={11} /> : <span aria-hidden>R</span>}
                            <span>Row {rowIndex + 1}</span><small className={styles.treeMeta}>{row.columns.length} col</small>
                          </button>
                          <ul className={styles.treeChildren}>
                            {row.columns.map((column, columnIndex) => (
                              <li key={column.id}>
                                <button
                                  className={styles.treeSelect}
                                  data-selected={selection.kind === "column" && selection.columnId === column.id}
                                  onClick={() => onSelect({
                                    columnId: column.id,
                                    groupId: group.id,
                                    kind: "column",
                                    rowId: row.id,
                                    tabId: tab.id,
                                  })}
                                  type="button"
                                >
                                  {column.locked ? <LockKeyhole size={11} /> : <span aria-hidden>C</span>}
                                  <span>Column {columnIndex + 1}</span><small className={styles.treeMeta}>{column.span.desktop}/12</small>
                                </button>
                                <ul className={styles.treeChildren}>
                                  {column.items.map((node) => (
                                    <li key={node.id}>
                                      <button
                                        className={styles.treeSelect}
                                        data-hidden={!node.visible}
                                        data-kind="node"
                                        data-selected={selection.kind === "node" && selection.nodeId === node.id}
                                        onClick={(event) => onSelect({
                                          columnId: column.id,
                                          groupId: group.id,
                                          kind: "node",
                                          nodeId: node.id,
                                          rowId: row.id,
                                          tabId: tab.id,
                                        }, event)}
                                        type="button"
                                      >
                                        {requiredProductionNode(node) || node.locked ? <LockKeyhole size={10} /> : <span aria-hidden>N</span>}
                                        <span>{nodeLabel(node)}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LayoutV4Canvas({
  activeTabId,
  label,
  manifest,
  onAddColumn,
  onAddRow,
  onRemoveNode,
  onResizeColumn,
  onSelect,
  readOnly = false,
  selectedNodeIds,
  selection,
  viewport,
}: CanvasCallbacks & {
  activeTabId: WorkspaceTabId;
  label: string;
  manifest: WorkspaceLayoutManifestV3;
  readOnly?: boolean;
  selectedNodeIds: ReadonlySet<string>;
  selection: LayoutSelection;
  viewport: LayoutViewport;
}) {
  const tab = manifest.tabs.find((item) => item.id === activeTabId) ?? manifest.tabs[0];
  if (!tab) return null;
  const previewStyle = {
    "--preview-accent": manifest.settings.accentColor,
    "--preview-background": manifest.settings.backgroundColor,
    "--preview-foreground": manifest.settings.textColor,
    "--preview-muted": manifest.settings.mutedTextColor,
    "--preview-panel": manifest.settings.surfaceColor,
    "--preview-panel-strong": `color-mix(in srgb, ${manifest.settings.surfaceColor} 86%, ${manifest.settings.textColor})`,
  } as CSSProperties;

  return (
    <section className={base.canvasFrame}>
      <span className={base.canvasLabel}>{label}</span>
      <div
        aria-label={`${label}, ${tabLabel(tab.id)} preview`}
        className={`${base.viewport} ${base[viewport]}`}
        data-layout-content-width={manifest.settings.contentWidth}
        data-layout-motion={manifest.settings.motion}
        data-layout-radius={manifest.settings.radius}
        data-layout-shadow={manifest.settings.shadow}
        data-layout-spacing={manifest.settings.spacingScale}
        data-layout-tab-style={manifest.settings.tabStyle}
        data-layout-theme={manifest.settings.theme}
        data-layout-type-scale={manifest.settings.typeScale}
        data-read-only={readOnly}
        role="region"
        style={previewStyle}
      >
        <div className={base.sitePreviewHeader}>
          <div className={base.previewBrand}><span>CR</span><strong>Civic Result Maps</strong></div>
          <div className={base.previewMetrics}><span>Jurisdictions <strong>39</strong></span><span>Sources <strong>12</strong></span><span>Validation <strong>Pass</strong></span></div>
        </div>
        <div className={base.previewTabs}>
          {manifest.tabs.filter((item) => item.visible).map((item) => (
            <span className={item.id === tab.id ? base.activePreviewTab : ""} key={item.id}>{tabLabel(item.id)}</span>
          ))}
        </div>
        <div className={base.rows}>
          {tab.groups.map((group, groupIndex) => (
            <SortableGroup
              callbacks={{ onAddColumn, onAddRow, onRemoveNode, onResizeColumn, onSelect }}
              group={group}
              index={groupIndex}
              key={group.id}
              readOnly={readOnly}
              selectedNodeIds={selectedNodeIds}
              selection={selection}
              tabId={tab.id}
              viewport={viewport}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function SortableGroup({
  callbacks,
  group,
  index,
  readOnly,
  selectedNodeIds,
  selection,
  tabId,
  viewport,
}: {
  callbacks: CanvasCallbacks;
  group: WorkspaceLayoutGroupV3;
  index: number;
  readOnly: boolean;
  selectedNodeIds: ReadonlySet<string>;
  selection: LayoutSelection;
  tabId: WorkspaceTabId;
  viewport: LayoutViewport;
}) {
  const sortable = useSortable({
    accept: "layout-group",
    disabled: readOnly || group.locked,
    group: `groups:${tabId}`,
    id: `${readOnly ? "readonly:" : ""}group:${group.id}`,
    index,
    type: "layout-group",
  });
  const selected = !readOnly && selection.kind === "group" && selection.groupId === group.id;
  const surface = group.presentation?.surface ?? "plain";
  return (
    <section
      className={`${styles.groupFrame} ${sortable.isDragSource ? styles.dragging : ""} ${sortable.isDropTarget ? styles.dropTarget : ""}`}
      data-selected={selected}
      data-spacing={group.presentation?.spacing ?? "comfortable"}
      data-surface={surface}
      ref={sortable.ref}
    >
      {!readOnly && (
        <div className={styles.groupActions}>
          <button aria-label={`Drag ${group.name}`} disabled={group.locked} ref={sortable.handleRef} title="Drag group" type="button"><GripVertical size={14} /></button>
          <button onClick={() => callbacks.onSelect({ groupId: group.id, kind: "group", tabId })} type="button"><Settings2 size={13} /> {group.name}</button>
          {group.locked && <LockKeyhole size={12} />}
          <button onClick={() => callbacks.onAddRow(group.id)} type="button"><Plus size={13} /> Row</button>
        </div>
      )}
      {(group.heading || group.description) && (
        <header
          className={styles.groupHeading}
          data-align={group.presentation?.headingAlign ?? "left"}
          data-divider={group.presentation?.showDivider ?? false}
        >
          <div>{group.heading && <h3>{group.heading}</h3>}{group.description && <p>{group.description}</p>}</div>
        </header>
      )}
      {group.rows.map((row, rowIndex) => (
        <SortableRow
          callbacks={callbacks}
          group={group}
          index={rowIndex}
          key={row.id}
          readOnly={readOnly}
          row={row}
          selectedNodeIds={selectedNodeIds}
          selection={selection}
          tabId={tabId}
          viewport={viewport}
        />
      ))}
      {!group.rows.length && <div className={base.emptyCanvas}>No rows in this group</div>}
    </section>
  );
}

function SortableRow({
  callbacks,
  group,
  index,
  readOnly,
  row,
  selectedNodeIds,
  selection,
  tabId,
  viewport,
}: {
  callbacks: CanvasCallbacks;
  group: WorkspaceLayoutGroupV3;
  index: number;
  readOnly: boolean;
  row: WorkspaceLayoutRowV3;
  selectedNodeIds: ReadonlySet<string>;
  selection: LayoutSelection;
  tabId: WorkspaceTabId;
  viewport: LayoutViewport;
}) {
  const sortable = useSortable({
    accept: "layout-row",
    disabled: readOnly || row.locked || group.locked,
    group: `rows:${group.id}`,
    id: `${readOnly ? "readonly:" : ""}row:${row.id}`,
    index,
    type: "layout-row",
  });
  return (
    <section
      className={`${base.row} ${sortable.isDragSource ? styles.dragging : ""} ${sortable.isDropTarget ? styles.dropTarget : ""}`}
      data-selected={!readOnly && selection.kind === "row" && selection.rowId === row.id}
      ref={sortable.ref}
    >
      {!readOnly && (
        <div className={base.rowControls}>
          <button aria-label="Drag row" disabled={row.locked || group.locked} ref={sortable.handleRef} type="button"><GripVertical size={13} /></button>
          <button onClick={() => callbacks.onSelect({ groupId: group.id, kind: "row", rowId: row.id, tabId })} type="button"><Settings2 size={13} /> Row</button>
          {row.locked && <LockKeyhole size={11} />}
          <button disabled={row.columns.length >= 4 || row.locked} onClick={() => callbacks.onAddColumn(row.id)} type="button"><Plus size={12} /> Column</button>
        </div>
      )}
      <div className={base.columns} data-gap={row.gap ?? "medium"}>
        {row.columns.map((column, columnIndex) => (
          <SortableColumn
            callbacks={callbacks}
            column={column}
            group={group}
            index={columnIndex}
            key={column.id}
            readOnly={readOnly}
            row={row}
            selectedNodeIds={selectedNodeIds}
            selection={selection}
            tabId={tabId}
            viewport={viewport}
          />
        ))}
      </div>
    </section>
  );
}

function SortableColumn({
  callbacks,
  column,
  group,
  index,
  readOnly,
  row,
  selectedNodeIds,
  selection,
  tabId,
  viewport,
}: {
  callbacks: CanvasCallbacks;
  column: WorkspaceLayoutColumnV3;
  group: WorkspaceLayoutGroupV3;
  index: number;
  readOnly: boolean;
  row: WorkspaceLayoutRowV3;
  selectedNodeIds: ReadonlySet<string>;
  selection: LayoutSelection;
  tabId: WorkspaceTabId;
  viewport: LayoutViewport;
}) {
  const sortable = useSortable({
    accept: "layout-column",
    disabled: readOnly || column.locked || row.locked || group.locked,
    group: `columns:${row.id}`,
    id: `${readOnly ? "readonly:" : ""}column:${column.id}`,
    index,
    type: "layout-column",
  });
  return (
    <div
      className={`${base.column} ${sortable.isDragSource ? styles.dragging : ""} ${sortable.isDropTarget ? styles.dropTarget : ""}`}
      data-empty={column.items.length === 0}
      data-selected={!readOnly && selection.kind === "column" && selection.columnId === column.id}
      ref={sortable.ref}
      style={{ "--builder-span": column.span[viewport] } as CSSProperties}
    >
      {!readOnly && (
        <div className={styles.nodeTopline}>
          <span>Column {index + 1} - {column.span[viewport]}/12</span>
          <button aria-label="Make column narrower" disabled={viewport === "mobile" || column.locked} onClick={() => callbacks.onResizeColumn(column.id, -1)} type="button">-</button>
          <button aria-label="Make column wider" disabled={viewport === "mobile" || column.locked} onClick={() => callbacks.onResizeColumn(column.id, 1)} type="button">+</button>
          <button aria-label="Configure column" onClick={() => callbacks.onSelect({ columnId: column.id, groupId: group.id, kind: "column", rowId: row.id, tabId })} type="button"><Settings2 size={12} /></button>
          <button aria-label="Drag column" disabled={column.locked || row.locked || group.locked} ref={sortable.handleRef} type="button"><GripVertical size={13} /></button>
        </div>
      )}
      {column.items.map((node, nodeIndex) => (
        <SortableNode
          callbacks={callbacks}
          column={column}
          group={group}
          index={nodeIndex}
          key={node.id}
          node={node}
          readOnly={readOnly}
          row={row}
          selected={selection.kind === "node" && selection.nodeId === node.id || selectedNodeIds.has(node.id)}
          tabId={tabId}
          viewport={viewport}
        />
      ))}
    </div>
  );
}

function SortableNode({
  callbacks,
  column,
  group,
  index,
  node,
  readOnly,
  row,
  selected,
  tabId,
  viewport,
}: {
  callbacks: CanvasCallbacks;
  column: WorkspaceLayoutColumnV3;
  group: WorkspaceLayoutGroupV3;
  index: number;
  node: WorkspaceLayoutNodeV3;
  readOnly: boolean;
  row: WorkspaceLayoutRowV3;
  selected: boolean;
  tabId: WorkspaceTabId;
  viewport: LayoutViewport;
}) {
  const permanentlyLocked = requiredProductionNode(node);
  const locked = permanentlyLocked || node.locked || column.locked || row.locked || group.locked;
  const sortable = useSortable({
    accept: "layout-node",
    disabled: readOnly || locked,
    group: `nodes:${column.id}`,
    id: `${readOnly ? "readonly:" : ""}node:${node.id}`,
    index,
    type: "layout-node",
  });
  const viewportVisible = node.visibility?.viewports?.[viewport] !== false;
  const heightClass = node.presentation?.height === "compact"
    ? styles.nodeHeightCompact
    : node.presentation?.height === "standard"
      ? styles.nodeHeightStandard
      : node.presentation?.height === "tall"
        ? styles.nodeHeightTall
        : "";
  const label = nodeLabel(node);
  return (
    <article
      className={`${base.builderNode} ${heightClass} ${sortable.isDragSource ? styles.dragging : ""} ${sortable.isDropTarget ? styles.dropTarget : ""}`}
      data-kind={node.kind}
      data-read-only={readOnly}
      data-selected={!readOnly && selected}
      data-visible={node.visible && viewportVisible}
      ref={sortable.ref}
    >
      {!readOnly && (
        <div className={base.nodeToolbar}>
          <button aria-label={`Drag ${label}`} className={base.dragHandle} disabled={locked} ref={sortable.handleRef} title={locked ? "Locked" : "Drag component"} type="button"><GripVertical size={16} /></button>
          <span>{node.kind === "production" ? "Production" : "Content"}</span>
          {!node.visible && <EyeOff size={13} />}
          {locked && <LockKeyhole size={12} />}
          <button aria-label={`Configure ${label}`} onClick={(event) => callbacks.onSelect({ columnId: column.id, groupId: group.id, kind: "node", nodeId: node.id, rowId: row.id, tabId }, event)} type="button"><Settings2 size={15} /></button>
          {node.kind === "custom" && (
            <button
              aria-label={"Delete " + label}
              className={styles.nodeDelete}
              disabled={locked}
              onClick={() => callbacks.onRemoveNode(node.id)}
              title={locked ? "Unlock this content block before deleting it" : "Delete content block"}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
      <div
        className={base.nodePreview}
        onClick={readOnly ? undefined : (event) => callbacks.onSelect({ columnId: column.id, groupId: group.id, kind: "node", nodeId: node.id, rowId: row.id, tabId }, event)}
        onKeyDown={readOnly ? undefined : (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          callbacks.onSelect({ columnId: column.id, groupId: group.id, kind: "node", nodeId: node.id, rowId: row.id, tabId });
        }}
        role={readOnly ? undefined : "button"}
        tabIndex={readOnly ? undefined : 0}
      >
        <strong>{label}</strong>
        {node.kind === "production" ? <ProductionSketch node={node} /> : <CustomSketch node={node} />}
      </div>
    </article>
  );
}

function ProductionSketch({ node }: { node: Extract<WorkspaceLayoutNodeV3, { kind: "production" }> }) {
  if (node.component === "results-map") return <div className={base.mapSketch}><span /><i /><i /><i /></div>;
  if (node.component === "state-snapshot") return <div className={base.metricSketch}><span>Candidate A</span><b /><span>Candidate B</span><b /></div>;
  if (node.component === "review-center") return <div className={base.pillSketch}><span>Overview</span><span>Tools</span><span>Indicators</span></div>;
  if (["historical-charts", "screening", "indicators"].includes(node.component)) return <div className={base.metricSketch}><span>Baseline</span><b /><span>Current</span><b /></div>;
  return <div className={base.textSketch}><span /><span /><span /></div>;
}

function CustomSketch({ node }: { node: Extract<WorkspaceLayoutNodeV3, { kind: "custom" }> }) {
  if (node.component === "image") return node.asset
    ? <img alt={node.asset.alt} src={node.asset.url} />
    : <div className={base.imagePlaceholder}><FileImage size={24} /> Choose image</div>;
  if (node.component === "divider") return <hr />;
  if (node.component === "metric-strip") return <div className={base.pillSketch}>{node.items?.map((item, index) => <span key={`${item.label}-${index}`}>{item.value || item.label}</span>)}</div>;
  if (["link-list", "button-group"].includes(node.component)) return <div className={base.pillSketch}>{node.items?.map((item, index) => <span key={`${item.label}-${index}`}>{item.label}</span>)}</div>;
  if (node.component === "video") return <div className={base.imagePlaceholder}>Video - {node.video?.provider ?? "provider"}</div>;
  return <p>{node.body || node.document?.blocks.flatMap((block) => block.children).map((child) => child.text).join(" ") || "Configure this content with the gear."}</p>;
}

export function activeTabRequired(tabId: WorkspaceTabId) {
  return workspaceLayoutRegistryV2.find((tab) => tab.id === tabId)?.required ?? false;
}
