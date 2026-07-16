"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { EyeOff, GripVertical, LockKeyhole, Settings2 } from "lucide-react";
import type { CSSProperties } from "react";
import {
  isWorkspaceCustomBlock,
  workspaceLayoutRegistry,
  type WorkspaceCustomBlockV1,
  type WorkspaceLayoutItemV1,
  type WorkspaceLayoutManifestV1,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";
import { builderItemLabel, type BuilderTarget, type BuilderViewport } from "./layout-builder-types";
import styles from "./layout-editor.module.css";

function CustomBlockPreview({ block }: { block: WorkspaceCustomBlockV1 }) {
  if (block.component === "divider") {
    return <div className={styles.fixtureDivider}><span>{block.title || "Section"}</span><i /></div>;
  }
  if (block.component === "metric-strip") {
    return (
      <div className={styles.fixtureMetrics}>
        {block.items?.map((item, index) => (
          <article key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></article>
        ))}
      </div>
    );
  }
  if (block.component === "link-list") {
    return (
      <ul className={styles.fixtureLinks}>
        {block.items?.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}<span aria-hidden>{"->"}</span></li>)}
      </ul>
    );
  }
  return <p className={styles.fixtureCopy}>{block.body}</p>;
}

function ProductionFixture({ item, tabId }: { item: WorkspaceLayoutItemV1; tabId: WorkspaceTabId }) {
  if (isWorkspaceCustomBlock(item)) return <CustomBlockPreview block={item} />;

  if (item.id === "results-map") {
    return (
      <div className={styles.fixtureMapLayout}>
        <div className={styles.fixtureMapToolbar}><span>Winner</span><span>Margin</span><span>Volume</span></div>
        <div className={styles.fixtureMap}>
          <i /><i /><i /><i /><i /><i />
          <div><span>Democratic</span><span>Republican</span></div>
        </div>
        <div className={styles.fixtureTable}>
          <strong>County results</strong>
          <span>Jurisdiction</span><span>Winner</span><span>Total votes</span>
          <i /><i /><i />
        </div>
      </div>
    );
  }

  if (["historical-charts", "screening", "indicators", "historical-summary"].includes(item.id)) {
    return (
      <div className={styles.fixtureChart}>
        <div><i /><i /><i /><i /><i /><i /></div>
        <span>Comparison baseline</span><span>Current result</span>
      </div>
    );
  }

  if (["source-provenance", "source-plan", "source-records-request", "cvr-requests", "api-links", "import-history"].includes(item.id)) {
    return (
      <div className={styles.fixtureRecords}>
        {[0, 1, 2].map((row) => <div key={row}><i /><span /><span /></div>)}
      </div>
    );
  }

  if (["overview", "state-snapshot", "coverage-context", "vote-methods", "equipment-context", "review-packet"].includes(item.id)) {
    return (
      <div className={styles.fixtureCards}>
        {[0, 1, 2].map((card) => <article key={card}><span /><strong>{card + 1}</strong><i /></article>)}
      </div>
    );
  }

  if (["downloads", "evidence-tools", "guided-workflows", "support-actions", "contact-options"].includes(item.id)) {
    return <div className={styles.fixtureActions}><button disabled type="button">Primary action</button><button disabled type="button">Open details</button></div>;
  }

  return (
    <div className={styles.fixtureText}>
      <p>This production section keeps its verified data, labels, and review context.</p>
      <i /><i /><i />
    </div>
  );
}

type CanvasCardProps = {
  index: number;
  item: WorkspaceLayoutItemV1;
  onResize?: (delta: -1 | 1) => void;
  onSelect: () => void;
  readOnly?: boolean;
  selected: boolean;
  tabId: WorkspaceTabId;
  viewport: BuilderViewport;
};

function itemSpan(item: WorkspaceLayoutItemV1, tabId: WorkspaceTabId, viewport: BuilderViewport) {
  const configured = item.presentation?.span?.[viewport];
  if (configured) return configured;
  if (viewport !== "desktop") return 12;
  if (!isWorkspaceCustomBlock(item) && tabId === "map") return item.id === "results-map" ? 8 : 4;
  return 12;
}

function CardContent({
  handle,
  item,
  onResize,
  onSelect,
  readOnly,
  tabId,
}: CanvasCardProps & { handle?: (node: HTMLButtonElement | null) => void }) {
  const registry = workspaceLayoutRegistry.find((tab) => tab.id === tabId);
  const registrySection = registry?.sections.find((section) => section.id === item.id);
  const required = !isWorkspaceCustomBlock(item)
    && Boolean(registrySection && "required" in registrySection && registrySection.required);
  const label = builderItemLabel(tabId, item);

  return (
    <>
      <header className={styles.canvasCardHeader}>
        <button
          aria-label={`Select ${label}`}
          className={styles.canvasCardTitle}
          disabled={readOnly}
          onClick={onSelect}
          type="button"
        >
          <span>{isWorkspaceCustomBlock(item) ? "Custom component" : "Production component"}</span>
          <strong>{label}</strong>
        </button>
        {!readOnly && (
          <div className={styles.canvasCardTools}>
            {onResize && (
              <>
                <button aria-label={`Make ${label} narrower`} onClick={() => onResize(-1)} title="Narrower" type="button">-</button>
                <button aria-label={`Make ${label} wider`} onClick={() => onResize(1)} title="Wider" type="button">+</button>
              </>
            )}
            <button aria-label={`Configure ${label}`} onClick={onSelect} title="Configure" type="button"><Settings2 aria-hidden size={15} /></button>
            <button aria-label={`Drag ${label}`} className={styles.dragHandle} ref={handle} title="Drag to rearrange" type="button">
              <GripVertical aria-hidden size={17} />
            </button>
          </div>
        )}
      </header>
      <div className={styles.canvasCardMeta}>
        {!item.visible && <span className={styles.hiddenBadge}><EyeOff aria-hidden size={11} /> Hidden</span>}
        {required && <span className={styles.requiredBadge}><LockKeyhole aria-hidden size={11} /> Required</span>}
        <span>{item.presentation?.density ?? "comfortable"}</span>
        <span>{item.presentation?.surface ?? "panel"}</span>
      </div>
      <div className={styles.canvasCardBody}><ProductionFixture item={item} tabId={tabId} /></div>
    </>
  );
}

function StaticCanvasCard(props: CanvasCardProps) {
  const span = itemSpan(props.item, props.tabId, props.viewport);
  return (
    <article
      className={[styles.canvasCard, props.selected ? styles.canvasCardSelected : "", !props.item.visible ? styles.canvasCardHidden : ""].join(" ")}
      data-surface={props.item.presentation?.surface ?? "panel"}
      style={{ "--builder-span": span } as CSSProperties}
    >
      <CardContent {...props} />
    </article>
  );
}

function SortableCanvasCard(props: CanvasCardProps) {
  const { handleRef, isDragSource, ref } = useSortable({
    accept: `layout-items-${props.tabId}`,
    group: `layout-items-${props.tabId}`,
    id: `item:${props.tabId}:${props.item.id}`,
    index: props.index,
    type: `layout-items-${props.tabId}`,
  });
  const span = itemSpan(props.item, props.tabId, props.viewport);
  return (
    <article
      className={[
        styles.canvasCard,
        props.selected ? styles.canvasCardSelected : "",
        !props.item.visible ? styles.canvasCardHidden : "",
        isDragSource ? styles.dragging : "",
      ].join(" ")}
      data-surface={props.item.presentation?.surface ?? "panel"}
      ref={ref}
      style={{ "--builder-span": span } as CSSProperties}
    >
      <CardContent {...props} handle={handleRef} />
    </article>
  );
}
export function LayoutBuilderCanvas({
  activeTabId,
  label,
  manifest,
  onResize,
  onSelectTab,
  onSelectTarget,
  readOnly = false,
  selectedTarget,
  viewport,
}: {
  activeTabId: WorkspaceTabId;
  label?: string;
  manifest: WorkspaceLayoutManifestV1;
  onResize?: (tabId: WorkspaceTabId, itemId: string, delta: -1 | 1) => void;
  onSelectTab: (tabId: WorkspaceTabId) => void;
  onSelectTarget: (target: BuilderTarget) => void;
  readOnly?: boolean;
  selectedTarget: BuilderTarget;
  viewport: BuilderViewport;
}) {
  const activeTab = manifest.tabs.find((tab) => tab.id === activeTabId) ?? manifest.tabs[0];
  if (!activeTab) return null;
  const registry = workspaceLayoutRegistry.find((tab) => tab.id === activeTab.id)!;
  const notesBelow = activeTab.settings?.notesPosition === "below";
  return (
    <section className={styles.canvasFrame} data-viewport={viewport}>
      {label && <div className={styles.canvasLabel}>{label}</div>}
      <div className={styles.previewWindow}>
        <header className={styles.previewChrome}>
          <div><span>CivicResultMaps</span><strong>Election result workspace</strong></div>
          <div><span>2024 General</span><span>Washington</span></div>
        </header>
        <nav aria-label={`${label ?? "Draft"} workspace tabs`} className={styles.previewTabs}>
          {manifest.tabs.map((tab) => {
            const tabRegistry = workspaceLayoutRegistry.find((item) => item.id === tab.id)!;
            return (
              <button
                aria-pressed={activeTab.id === tab.id}
                className={activeTab.id === tab.id ? styles.previewTabActive : ""}
                disabled={readOnly}
                key={tab.id}
                onClick={() => {
                  onSelectTab(tab.id);
                  onSelectTarget({ kind: "tab", tabId: tab.id });
                }}
                type="button"
              >
                {tabRegistry.label}
                {!tab.visible && <EyeOff aria-label="Hidden" size={11} />}
              </button>
            );
          })}
        </nav>
        {!activeTab.visible && (
          <p className={styles.canvasHiddenNotice}><EyeOff aria-hidden size={14} /> This tab is hidden on the public site.</p>
        )}
        <div className={[styles.previewBody, notesBelow ? styles.previewBodyNotesBelow : ""].join(" ")}>
          <div>
            <div className={styles.previewContext}>
              <div><span>Workspace section</span><h2>{registry.label}</h2></div>
              <small>{activeTab.sections.filter((item) => item.visible).length} visible elements</small>
            </div>
            <div className={styles.canvasGrid}>
              {activeTab.sections.map((item, index) => {
                const selected = selectedTarget.kind === "item"
                  && selectedTarget.tabId === activeTab.id
                  && selectedTarget.itemId === item.id;
                const props: CanvasCardProps = {
                  index,
                  item,
                  onSelect: () => onSelectTarget({ itemId: item.id, kind: "item", tabId: activeTab.id }),
                  readOnly,
                  selected,
                  tabId: activeTab.id,
                  viewport,
                };
                if (onResize && isWorkspaceCustomBlock(item)) {
                  props.onResize = (delta) => onResize(activeTab.id, item.id, delta);
                }
                return readOnly
                  ? <StaticCanvasCard {...props} key={item.id} />
                  : <SortableCanvasCard {...props} key={item.id} />;
              })}
            </div>
          </div>
          <aside className={styles.previewNotes}>
            <div><span>Fixed trust surface</span><LockKeyhole aria-label="Locked" size={13} /></div>
            <h2>Data Notes</h2>
            <p>Source caveats, reporting grain, and coverage context remain beside the workspace.</p>
            <article><strong>Source coverage</strong><span>Official-source context</span></article>
            <article><strong>Reporting grain</strong><span>Jurisdiction details</span></article>
          </aside>
        </div>
      </div>
    </section>
  );
}
