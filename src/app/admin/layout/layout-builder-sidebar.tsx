"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { Boxes, Eye, EyeOff, GripVertical, LockKeyhole, Plus, Settings2 } from "lucide-react";
import {
  isWorkspaceCustomBlock,
  workspaceComponentLibrary,
  workspaceLayoutRegistry,
  type WorkspaceCustomBlockKind,
  type WorkspaceLayoutManifestV1,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";
import { builderItemDescription, builderItemLabel, type BuilderTarget } from "./layout-builder-types";
import styles from "./layout-editor.module.css";

function SortableTabRow({
  active,
  index,
  onSelect,
  tabId,
  visible,
}: {
  active: boolean;
  index: number;
  onSelect: () => void;
  tabId: WorkspaceTabId;
  visible: boolean;
}) {
  const registry = workspaceLayoutRegistry.find((tab) => tab.id === tabId)!;
  const { handleRef, isDragSource, ref } = useSortable({
    accept: "layout-tabs",
    group: "layout-tabs",
    id: `tab:${tabId}`,
    index,
    type: "layout-tabs",
  });

  return (
    <li className={[styles.structureTab, active ? styles.structureTabActive : "", isDragSource ? styles.dragging : ""].join(" ")} ref={ref}>
      <button aria-label={`Drag ${registry.label}`} className={styles.dragHandle} ref={handleRef} type="button">
        <GripVertical aria-hidden size={15} />
      </button>
      <button className={styles.structureTabLabel} onClick={onSelect} type="button">
        <span>{registry.label}</span>
        {!visible && <EyeOff aria-label="Hidden" size={12} />}
        {"required" in registry && registry.required && <LockKeyhole aria-label="Required" size={11} />}
      </button>
    </li>
  );
}

export function LayoutBuilderSidebar({
  activeTabId,
  manifest,
  onAddBlock,
  onSelectTab,
  onSelectTarget,
  onToggleItem,
  onToggleTab,
  selectedTarget,
}: {
  activeTabId: WorkspaceTabId;
  manifest: WorkspaceLayoutManifestV1;
  onAddBlock: (component: WorkspaceCustomBlockKind) => void;
  onSelectTab: (tabId: WorkspaceTabId) => void;
  onSelectTarget: (target: BuilderTarget) => void;
  onToggleItem: (tabId: WorkspaceTabId, itemId: string) => void;
  onToggleTab: (tabId: WorkspaceTabId) => void;
  selectedTarget: BuilderTarget;
}) {
  const activeTab = manifest.tabs.find((tab) => tab.id === activeTabId)!;
  const activeRegistry = workspaceLayoutRegistry.find((tab) => tab.id === activeTabId)!;
  const customBlockCount = activeTab.sections.filter(isWorkspaceCustomBlock).length;

  return (
    <aside className={styles.builderSidebar}>
      <div className={styles.builderPanelHeading}>
        <button className={selectedTarget.kind === "workspace" ? styles.selectedControl : ""} onClick={() => onSelectTarget({ kind: "workspace" })} type="button">
          <Settings2 aria-hidden size={15} /> Workspace settings
        </button>
      </div>
      <section className={styles.structureSection}>
        <div className={styles.sectionHeading}><div><span>Structure</span><h2>Pages and sections</h2></div></div>
        <ol className={styles.structureTabs}>
          {manifest.tabs.map((tab, index) => (
            <SortableTabRow
              active={activeTabId === tab.id}
              index={index}
              key={tab.id}
              onSelect={() => {
                onSelectTab(tab.id);
                onSelectTarget({ kind: "tab", tabId: tab.id });
              }}
              tabId={tab.id}
              visible={tab.visible}
            />
          ))}
        </ol>
        <div className={styles.structureCurrent}>
          <header>
            <button onClick={() => onSelectTarget({ kind: "tab", tabId: activeTab.id })} type="button">
              <strong>{activeRegistry.label}</strong><span>Tab settings</span>
            </button>
            <button
              aria-label={activeTab.visible ? `Hide ${activeRegistry.label}` : `Show ${activeRegistry.label}`}
              disabled={Boolean("required" in activeRegistry && activeRegistry.required)}
              onClick={() => onToggleTab(activeTab.id)}
              type="button"
            >
              {activeTab.visible ? <Eye aria-hidden size={14} /> : <EyeOff aria-hidden size={14} />}
            </button>
          </header>
          <ol>
            {activeTab.sections.map((item) => {
              const registryItem = isWorkspaceCustomBlock(item)
                ? undefined
                : activeRegistry.sections.find((section) => section.id === item.id);
              const selected = selectedTarget.kind === "item"
                && selectedTarget.tabId === activeTab.id
                && selectedTarget.itemId === item.id;
              return (
                <li className={selected ? styles.structureItemActive : ""} key={item.id}>
                  <button
                    className={styles.structureItemLabel}
                    onClick={() => onSelectTarget({ itemId: item.id, kind: "item", tabId: activeTab.id })}
                    type="button"
                  >
                    <span>{isWorkspaceCustomBlock(item) ? <Boxes aria-hidden size={13} /> : <i />}</span>
                    <span><strong>{builderItemLabel(activeTab.id, item)}</strong><small>{builderItemDescription(activeTab.id, item)}</small></span>
                  </button>
                  <button
                    aria-label={item.visible ? `Hide ${builderItemLabel(activeTab.id, item)}` : `Show ${builderItemLabel(activeTab.id, item)}`}
                    disabled={Boolean(registryItem && "required" in registryItem && registryItem.required)}
                    onClick={() => onToggleItem(activeTab.id, item.id)}
                    type="button"
                  >
                    {item.visible ? <Eye aria-hidden size={13} /> : <EyeOff aria-hidden size={13} />}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className={styles.librarySection}>
        <div className={styles.sectionHeading}><div><span>Add</span><h2>Approved components</h2></div></div>
        <div className={styles.componentLibrary}>
          {workspaceComponentLibrary.map((component) => (
            <button disabled={customBlockCount >= 12} key={component.component} onClick={() => onAddBlock(component.component)} type="button">
              <span><Plus aria-hidden size={14} /><strong>{component.label}</strong></span>
              <small>{component.description}</small>
            </button>
          ))}
        </div>
        <p>{customBlockCount}/12 custom blocks. Text is escaped, links are validated, and production data components remain code-owned.</p>
      </section>
    </aside>
  );
}
