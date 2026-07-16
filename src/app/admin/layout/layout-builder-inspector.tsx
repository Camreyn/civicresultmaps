"use client";

import { ArrowDown, ArrowUp, LockKeyhole, Trash2 } from "lucide-react";
import {
  isWorkspaceCustomBlock,
  workspaceLayoutRegistry,
  type WorkspaceLayoutItemV1,
  type WorkspaceLayoutManifestV1,
  type WorkspaceLayoutInspectionIssue,
  type WorkspaceTabId,
} from "@/lib/workspace-layout";
import { builderItemDescription, builderItemLabel, findBuilderItem, type BuilderTarget } from "./layout-builder-types";
import styles from "./layout-editor.module.css";

type InspectorProps = {
  issues: WorkspaceLayoutInspectionIssue[];
  manifest: WorkspaceLayoutManifestV1;
  onMoveItem: (tabId: WorkspaceTabId, itemId: string, delta: -1 | 1) => void;
  onRemoveItem: (tabId: WorkspaceTabId, itemId: string) => void;
  onToggleItem: (tabId: WorkspaceTabId, itemId: string) => void;
  onToggleTab: (tabId: WorkspaceTabId) => void;
  onUpdateItem: (tabId: WorkspaceTabId, itemId: string, updater: (item: WorkspaceLayoutItemV1) => WorkspaceLayoutItemV1) => void;
  onUpdateManifest: (settings: NonNullable<WorkspaceLayoutManifestV1["settings"]>) => void;
  onUpdateTab: (
    tabId: WorkspaceTabId,
    updater: (tab: WorkspaceLayoutManifestV1["tabs"][number]) => WorkspaceLayoutManifestV1["tabs"][number],
  ) => void;
  target: BuilderTarget;
};

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={styles.inspectorField}>
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>
    </label>
  );
}

function TextField({
  label,
  maxLength,
  multiline = false,
  onChange,
  value,
}: {
  label: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={styles.inspectorField}>
      <span>{label}</span>
      {multiline
        ? <textarea maxLength={maxLength} onChange={(event) => onChange(event.target.value)} value={value} />
        : <input maxLength={maxLength} onChange={(event) => onChange(event.target.value)} value={value} />}
    </label>
  );
}

function ToggleField({
  checked,
  disabled,
  help,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  help?: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={styles.inspectorToggle}>
      <span><strong>{label}</strong>{help && <small>{help}</small>}</span>
      <input checked={checked} disabled={disabled} onChange={onChange} type="checkbox" />
      <i aria-hidden />
    </label>
  );
}
export function LayoutBuilderInspector(props: InspectorProps) {
  const { manifest, target } = props;

  if (target.kind === "workspace") {
    const settings = {
      contentWidth: "wide",
      defaultTab: "map",
      notesDefault: "collapsed",
      tabStyle: "bar",
      theme: "civic",
      ...manifest.settings,
    } as NonNullable<WorkspaceLayoutManifestV1["settings"]>;
    const update = (key: keyof typeof settings, value: string) => {
      props.onUpdateManifest({ ...settings, [key]: value });
    };

    return (
      <aside className={styles.inspectorPanel}>
        <header><span>Inspector</span><h2>Workspace</h2><p>Global presentation and default behavior.</p></header>
        <div className={styles.inspectorBody}>
          <SelectField label="Theme" onChange={(value) => update("theme", value)} value={settings.theme ?? "civic"}>
            <option value="civic">Civic dark</option><option value="high-contrast">High contrast</option><option value="warm">Warm editorial</option>
          </SelectField>
          <SelectField label="Navigation style" onChange={(value) => update("tabStyle", value)} value={settings.tabStyle ?? "bar"}>
            <option value="bar">Tab bar</option><option value="pills">Pills</option>
          </SelectField>
          <SelectField label="Content width" onChange={(value) => update("contentWidth", value)} value={settings.contentWidth ?? "wide"}>
            <option value="standard">Standard</option><option value="wide">Wide</option><option value="full">Full width</option>
          </SelectField>
          <SelectField label="Default tab" onChange={(value) => update("defaultTab", value)} value={settings.defaultTab ?? "map"}>
            {manifest.tabs.filter((tab) => tab.visible).map((tab) => (
              <option key={tab.id} value={tab.id}>{workspaceLayoutRegistry.find((entry) => entry.id === tab.id)?.label}</option>
            ))}
          </SelectField>
          <SelectField label="Data Notes default" onChange={(value) => update("notesDefault", value)} value={settings.notesDefault ?? "collapsed"}>
            <option value="collapsed">Collapsed</option><option value="expanded">Expanded</option>
          </SelectField>
          <div className={styles.lockedNotice}><LockKeyhole aria-hidden size={15} /><span>Data Notes content and required trust surfaces remain locked.</span></div>
        </div>
      </aside>
    );
  }

  if (target.kind === "tab") {
    const tab = manifest.tabs.find((item) => item.id === target.tabId)!;
    const registry = workspaceLayoutRegistry.find((item) => item.id === target.tabId)!;
    const required = "required" in registry && registry.required;
    return (
      <aside className={styles.inspectorPanel}>
        <header><span>Tab inspector</span><h2>{registry.label}</h2><p>{tab.sections.length} configured elements</p></header>
        <div className={styles.inspectorBody}>
          <ToggleField
            checked={tab.visible}
            disabled={Boolean(required)}
            help={required ? "Required public navigation" : "Hidden tabs remain editable"}
            label="Show in public navigation"
            onChange={() => props.onToggleTab(tab.id)}
          />
          <SelectField
            label="Section spacing"
            onChange={(value) => props.onUpdateTab(tab.id, (current) => ({ ...current, settings: { ...current.settings, density: value as "compact" | "comfortable" | "spacious" } }))}
            value={tab.settings?.density ?? "comfortable"}
          >
            <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option>
          </SelectField>
          <SelectField
            label="Data Notes position"
            onChange={(value) => props.onUpdateTab(tab.id, (current) => ({ ...current, settings: { ...current.settings, notesPosition: value as "side" | "below" } }))}
            value={tab.settings?.notesPosition ?? "side"}
          >
            <option value="side">Beside content</option><option value="below">Below content</option>
          </SelectField>
          {required && <div className={styles.lockedNotice}><LockKeyhole aria-hidden size={15} /><span>This tab is required and cannot be hidden.</span></div>}
        </div>
      </aside>
    );
  }
  const item = findBuilderItem(manifest, target.tabId, target.itemId);
  const tab = manifest.tabs.find((entry) => entry.id === target.tabId);
  const registry = workspaceLayoutRegistry.find((entry) => entry.id === target.tabId);
  if (!item || !tab || !registry) return null;

  const registryItem = isWorkspaceCustomBlock(item)
    ? undefined
    : registry.sections.find((entry) => entry.id === item.id);
  const required = Boolean(registryItem && "required" in registryItem && registryItem.required);
  const index = tab.sections.findIndex((entry) => entry.id === item.id);
  const itemIsCustom = isWorkspaceCustomBlock(item);
  const canMoveEarlier = index > 0
    && isWorkspaceCustomBlock(tab.sections[index - 1]!) === itemIsCustom;
  const canMoveLater = index < tab.sections.length - 1
    && isWorkspaceCustomBlock(tab.sections[index + 1]!) === itemIsCustom;
  const update = (updater: (current: WorkspaceLayoutItemV1) => WorkspaceLayoutItemV1) => {
    props.onUpdateItem(tab.id, item.id, updater);
  };
  const updatePresentation = (key: "density" | "emphasis" | "mapHeight" | "surface", value: string) => {
    update((current) => ({
      ...current,
      presentation: { ...current.presentation, [key]: value },
    }) as WorkspaceLayoutItemV1);
  };
  const updateSpan = (viewport: "desktop" | "tablet", value: string) => {
    update((current) => ({
      ...current,
      presentation: {
        ...current.presentation,
        span: { ...current.presentation?.span, [viewport]: Number(value), mobile: 12 },
      },
    }) as WorkspaceLayoutItemV1);
  };

  return (
    <aside className={styles.inspectorPanel}>
      <header>
        <span>{isWorkspaceCustomBlock(item) ? "Custom component" : "Production component"}</span>
        <h2>{builderItemLabel(tab.id, item)}</h2>
        <p>{builderItemDescription(tab.id, item)}</p>
      </header>
      <div className={styles.inspectorBody}>
        <ToggleField
          checked={item.visible}
          disabled={required}
          help={required ? "Required public trust surface" : "Hidden elements stay in the structure tree"}
          label="Show on public site"
          onChange={() => props.onToggleItem(tab.id, item.id)}
        />
        <div className={styles.positionControls}>
          <span>Position</span>
          <div>
            <button disabled={!canMoveEarlier} onClick={() => props.onMoveItem(tab.id, item.id, -1)} type="button"><ArrowUp aria-hidden size={14} /> Earlier</button>
            <button disabled={!canMoveLater} onClick={() => props.onMoveItem(tab.id, item.id, 1)} type="button"><ArrowDown aria-hidden size={14} /> Later</button>
          </div>
        </div>
        {isWorkspaceCustomBlock(item) && (
          <div className={styles.inspectorGroup}>
            <h3>Responsive placement</h3>
            <div className={styles.twoColumnFields}>
              <SelectField label="Desktop width" onChange={(value) => updateSpan("desktop", value)} value={String(item.presentation?.span?.desktop ?? 12)}>
                <option value="4">4 / 12</option><option value="6">6 / 12</option><option value="8">8 / 12</option><option value="12">12 / 12</option>
              </SelectField>
              <SelectField label="Tablet width" onChange={(value) => updateSpan("tablet", value)} value={String(item.presentation?.span?.tablet ?? 12)}>
                <option value="6">6 / 12</option><option value="12">12 / 12</option>
              </SelectField>
            </div>
            <p>Mobile is locked to 12 / 12 for readability.</p>
          </div>
        )}
        <div className={styles.inspectorGroup}>
          <h3>Presentation</h3>
          {isWorkspaceCustomBlock(item) ? (
            <SelectField label="Density" onChange={(value) => updatePresentation("density", value)} value={item.presentation?.density ?? "comfortable"}>
              <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option>
            </SelectField>
          ) : (
            <p>Width and internal spacing follow this component&apos;s tested production layout.</p>
          )}
          <SelectField label="Surface" onChange={(value) => updatePresentation("surface", value)} value={item.presentation?.surface ?? "panel"}>
            <option value="plain">Plain</option><option value="panel">Panel</option><option value="muted">Muted</option><option value="accent">Accent</option>
          </SelectField>
          <SelectField label="Emphasis" onChange={(value) => updatePresentation("emphasis", value)} value={item.presentation?.emphasis ?? "standard"}>
            <option value="quiet">Quiet</option><option value="standard">Standard</option><option value="prominent">Prominent</option>
          </SelectField>
          {!isWorkspaceCustomBlock(item) && item.id === "results-map" && (
            <SelectField label="Map height" onChange={(value) => updatePresentation("mapHeight", value)} value={item.presentation?.mapHeight ?? "standard"}>
              <option value="compact">Compact</option><option value="standard">Standard</option><option value="expanded">Expanded</option>
            </SelectField>
          )}
        </div>
        {isWorkspaceCustomBlock(item) ? (
          <div className={styles.inspectorGroup}>
            <h3>Content</h3>
            <TextField
              label="Title"
              maxLength={80}
              onChange={(value) => update((current) => isWorkspaceCustomBlock(current) ? { ...current, title: value } : current)}
              value={item.title ?? ""}
            />
            {(item.component === "narrative" || item.component === "callout") && (
              <TextField
                label="Body"
                maxLength={600}
                multiline
                onChange={(value) => update((current) => isWorkspaceCustomBlock(current) ? { ...current, body: value } : current)}
                value={item.body ?? ""}
              />
            )}
            {(item.component === "metric-strip" || item.component === "link-list") && (
              <div className={styles.itemEditor}>
                <span>{item.component === "metric-strip" ? "Metrics" : "Links"}</span>
                {item.items?.map((entry, entryIndex) => (
                  <div className={styles.itemEditorRow} key={entryIndex}>
                    <input
                      aria-label={`Item ${entryIndex + 1} label`}
                      maxLength={80}
                      onChange={(event) => update((current) => {
                        if (!isWorkspaceCustomBlock(current)) return current;
                        const items = [...(current.items ?? [])];
                        items[entryIndex] = { ...items[entryIndex], label: event.target.value };
                        return { ...current, items };
                      })}
                      placeholder="Label"
                      value={entry.label}
                    />
                    <input
                      aria-label={item.component === "metric-strip" ? `Metric ${entryIndex + 1} value` : `Link ${entryIndex + 1} URL`}
                      maxLength={item.component === "metric-strip" ? 60 : 240}
                      onChange={(event) => update((current) => {
                        if (!isWorkspaceCustomBlock(current)) return current;
                        const items = [...(current.items ?? [])];
                        items[entryIndex] = item.component === "metric-strip"
                          ? { ...items[entryIndex], value: event.target.value }
                          : { ...items[entryIndex], href: event.target.value };
                        return { ...current, items };
                      })}
                      placeholder={item.component === "metric-strip" ? "Value" : "https://..."}
                      value={item.component === "metric-strip" ? entry.value ?? "" : entry.href ?? ""}
                    />
                    <button
                      aria-label={`Remove item ${entryIndex + 1}`}
                      disabled={(item.items?.length ?? 0) <= 1}
                      onClick={() => update((current) => isWorkspaceCustomBlock(current)
                        ? { ...current, items: current.items?.filter((_, keepIndex) => keepIndex !== entryIndex) }
                        : current)}
                      type="button"
                    >
                      <Trash2 aria-hidden size={13} />
                    </button>
                  </div>
                ))}
                <button
                  disabled={(item.items?.length ?? 0) >= (item.component === "metric-strip" ? 4 : 6)}
                  onClick={() => update((current) => {
                    if (!isWorkspaceCustomBlock(current)) return current;
                    const nextItem = current.component === "metric-strip"
                      ? { label: "New metric", value: "Value" }
                      : { href: "/", label: "New link" };
                    return { ...current, items: [...(current.items ?? []), nextItem] };
                  })}
                  type="button"
                >
                  Add {item.component === "metric-strip" ? "metric" : "link"}
                </button>
              </div>
            )}
            <button className={styles.dangerButton} onClick={() => props.onRemoveItem(tab.id, item.id)} type="button">
              <Trash2 aria-hidden size={14} /> Remove custom block
            </button>
          </div>
        ) : (
          <div className={styles.lockedNotice}>
            <LockKeyhole aria-hidden size={15} />
            <span>Verified labels, data queries, source caveats, and interactions remain code-owned.</span>
          </div>
        )}
        {props.issues.filter((issue) => issue.id.includes(item.id)).map((issue) => (
          <p
            className={issue.severity === "error" ? styles.issueError : issue.severity === "warning" ? styles.issueWarning : styles.issueInfo}
            key={issue.id}
          >
            {issue.message}
          </p>
        ))}
      </div>
    </aside>
  );
}
