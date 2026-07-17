"use client";

import {
  Copy,
  FileImage,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { WorkspaceTabId } from "@/lib/workspace-layout";
import {
  richTextDocumentFromPlainText,
  workspaceVisibilityCapabilityKeys,
  workspaceVisibilityDataKeys,
  workspaceLayoutRegistryV2,
  type WorkspaceCustomNodeV2,
  type WorkspaceLayoutDesktopSpanV2,
  type WorkspaceLayoutTabletSpanV2,
  type WorkspaceVisibilityConditionV1,
} from "@/lib/workspace-layout-v2";
import {
  isWorkspaceGroupCustomOnlyV3,
  type WorkspaceCustomNodeV3,
  type WorkspaceLayoutManifestV3,
  type WorkspaceLayoutNodeV3,
} from "@/lib/workspace-layout-v3";
import { LayoutRichTextEditor } from "./layout-rich-text-editor";
import {
  allowedDesktopSpans,
  findColumn,
  findGroup,
  findNode,
  findRow,
  requiredProductionNode,
  tabLabel,
  titleCase,
  updateColumn,
  updateGroup,
  updateNode,
  updateRow,
} from "./layout-editor-v4-model";
import type {
  LayoutAssetSummary,
  LayoutSelection,
  LayoutSettingsClipboard,
  LayoutViewport,
} from "./layout-editor-v4-types";
import base from "./layout-editor-v3.module.css";
import styles from "./layout-editor-v4.module.css";

type Commit = (
  updater: (manifest: WorkspaceLayoutManifestV3) => WorkspaceLayoutManifestV3,
  groupKey?: string,
) => void;

export function LayoutV4Inspector({
  assets,
  clipboard,
  canRemove,
  closeHistoryGroup,
  commit,
  manifest,
  onCopy,
  onDuplicate,
  onPaste,
  onRemove,
  onSaveGroupTemplate,
  onUploadImage,
  selection,
  uploading,
  viewport,
}: {
  assets: LayoutAssetSummary[];
  clipboard: LayoutSettingsClipboard | null;
  canRemove: boolean;
  closeHistoryGroup: () => void;
  commit: Commit;
  manifest: WorkspaceLayoutManifestV3;
  onCopy: () => void;
  onDuplicate: () => void;
  onPaste: () => void;
  onRemove: () => void;
  onSaveGroupTemplate: (name: string, description: string) => void;
  onUploadImage: (file: File, alt: string, nodeId: string) => Promise<void>;
  selection: LayoutSelection;
  uploading: boolean;
  viewport: LayoutViewport;
}) {
  const tab = selection.kind === "workspace" ? undefined : manifest.tabs.find((item) => item.id === selection.tabId);
  const group = "groupId" in selection ? findGroup(manifest, selection.groupId) : undefined;
  const row = "rowId" in selection ? findRow(manifest, selection.rowId) : undefined;
  const column = "columnId" in selection ? findColumn(manifest, selection.columnId) : undefined;
  const node = selection.kind === "node" ? findNode(manifest, selection.nodeId) : undefined;
  const copyKind = selection.kind === "group" || selection.kind === "row" || selection.kind === "column" || selection.kind === "node"
    ? selection.kind
    : null;

  return (
    <div className={base.inspectorBody}>
      {selection.kind === "workspace" && (
        <WorkspaceSettings closeHistoryGroup={closeHistoryGroup} commit={commit} manifest={manifest} />
      )}
      {selection.kind === "tab" && tab && (
        <TabSettings commit={commit} tab={tab} />
      )}
      {selection.kind === "group" && group && (
        <GroupSettings commit={commit} group={group} onSaveTemplate={onSaveGroupTemplate} />
      )}
      {selection.kind === "row" && row && (
        <RowSettings commit={commit} row={row} />
      )}
      {selection.kind === "column" && column && (
        <ColumnSettings column={column} commit={commit} viewport={viewport} />
      )}
      {selection.kind === "node" && node && (
        <NodeSettings
          assets={assets}
          commit={commit}
          key={`${node.id}:${node.kind === "custom" ? node.asset?.assetId ?? "" : "production"}`}
          node={node}
          onUploadImage={onUploadImage}
          uploading={uploading}
        />
      )}
      {copyKind && (
        <fieldset>
          <legend>Reusable settings</legend>
          <div className={styles.inspectorActions}>
            <button onClick={onCopy} type="button"><Copy size={13} /> Copy {copyKind}</button>
            <button disabled={!clipboard || clipboard.kind !== copyKind} onClick={onPaste} type="button">Paste {clipboard?.label ?? "settings"}</button>
          </div>
        </fieldset>
      )}
      {selection.kind !== "workspace" && selection.kind !== "tab" && (
        <div className={styles.inspectorActions}>
          <button onClick={onDuplicate} type="button"><Copy size={13} /> Duplicate</button>
          <button className={styles.dangerButton} disabled={!canRemove} onClick={onRemove} title={canRemove ? "Delete this selection" : "Only unlocked custom content can be deleted"} type="button"><Trash2 size={13} /> Delete {selection.kind === "node" ? "block" : selection.kind}</button>
        </div>
      )}
      <p className={styles.shortcutHint}>Shortcuts: Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo, Ctrl/Cmd+D duplicate, Delete remove custom content, Ctrl/Cmd+S save the named draft.</p>
    </div>
  );
}

function WorkspaceSettings({ closeHistoryGroup, commit, manifest }: {
  closeHistoryGroup: () => void;
  commit: Commit;
  manifest: WorkspaceLayoutManifestV3;
}) {
  const settings = manifest.settings;
  const update = <K extends keyof typeof settings>(key: K, value: typeof settings[K], groupKey?: string) => {
    commit((current) => ({ ...current, settings: { ...current.settings, [key]: value } }), groupKey);
  };
  const colors: Array<{ key: "accentColor" | "backgroundColor" | "mutedTextColor" | "surfaceColor" | "textColor"; label: string }> = [
    { key: "backgroundColor", label: "Page background" },
    { key: "surfaceColor", label: "Panel background" },
    { key: "textColor", label: "Primary text" },
    { key: "mutedTextColor", label: "Muted text" },
    { key: "accentColor", label: "Accent and focus" },
  ];
  return (
    <>
      <fieldset>
        <legend>Live design tokens</legend>
        {colors.map((color) => (
          <label className={styles.colorField} key={color.key}>
            {color.label}<code>{settings[color.key]}</code>
            <input
              aria-label={color.label}
              onBlur={closeHistoryGroup}
              onChange={(event) => update(color.key, event.target.value, `workspace:${color.key}`)}
              type="color"
              value={settings[color.key]}
            />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Layout system</legend>
        <div className={styles.inlineGrid}>
          <Select label="Theme" value={settings.theme} onChange={(value) => update("theme", value as typeof settings.theme)} options={["civic", "warm", "high-contrast"]} />
          <Select label="Content width" value={settings.contentWidth} onChange={(value) => update("contentWidth", value as typeof settings.contentWidth)} options={["standard", "wide", "full"]} />
          <Select label="Spacing" value={settings.spacingScale} onChange={(value) => update("spacingScale", value as typeof settings.spacingScale)} options={["tight", "standard", "relaxed"]} />
          <Select label="Type scale" value={settings.typeScale} onChange={(value) => update("typeScale", value as typeof settings.typeScale)} options={["small", "standard", "large"]} />
          <Select label="Heading style" value={settings.headingStyle} onChange={(value) => update("headingStyle", value as typeof settings.headingStyle)} options={["interface", "editorial", "compact"]} />
          <Select label="Corners" value={settings.radius} onChange={(value) => update("radius", value as typeof settings.radius)} options={["square", "subtle", "rounded"]} />
          <Select label="Shadows" value={settings.shadow} onChange={(value) => update("shadow", value as typeof settings.shadow)} options={["none", "subtle", "raised"]} />
          <Select label="Tab style" value={settings.tabStyle} onChange={(value) => update("tabStyle", value as typeof settings.tabStyle)} options={["bar", "pills"]} />
          <Select label="Motion" value={settings.motion} onChange={(value) => update("motion", value as typeof settings.motion)} options={["standard", "reduced"]} />
        </div>
      </fieldset>
      <fieldset>
        <legend>Defaults</legend>
        <Select label="Default tab" value={settings.defaultTab} onChange={(value) => update("defaultTab", value as WorkspaceTabId)} options={manifest.tabs.filter((tab) => tab.visible).map((tab) => tab.id)} />
        <Select label="Data notes" value={settings.notesDefault} onChange={(value) => update("notesDefault", value as typeof settings.notesDefault)} options={["collapsed", "expanded"]} />
      </fieldset>
    </>
  );
}

function TabSettings({ commit, tab }: {
  commit: Commit;
  tab: WorkspaceLayoutManifestV3["tabs"][number];
}) {
  const registry = workspaceLayoutRegistryV2.find((item) => item.id === tab.id);
  const update = (next: typeof tab) => commit((manifest) => ({
    ...manifest,
    tabs: manifest.tabs.map((item) => item.id === tab.id ? next : item),
  }));
  return (
    <fieldset>
      <legend>{tabLabel(tab.id)} tab</legend>
      <label className={base.switchLabel}><input checked={tab.visible} disabled={registry?.required} onChange={(event) => update({ ...tab, visible: event.target.checked })} type="checkbox" /> Visible {registry?.required && <small>Required</small>}</label>
      <Select label="Density" value={tab.settings?.density ?? "comfortable"} onChange={(value) => update({ ...tab, settings: { ...tab.settings, density: value as "compact" | "comfortable" | "spacious" } })} options={["compact", "comfortable", "spacious"]} />
      <Select label="Data notes" value={tab.settings?.notesPosition ?? "side"} onChange={(value) => update({ ...tab, settings: { ...tab.settings, notesPosition: value as "side" | "below" | "drawer" } })} options={["side", "below", "drawer"]} />
      <p className={styles.noticeText}>{tab.groups.length} group{tab.groups.length === 1 ? "" : "s"} in this tab.</p>
    </fieldset>
  );
}

function GroupSettings({ commit, group, onSaveTemplate }: {
  commit: Commit;
  group: NonNullable<ReturnType<typeof findGroup>>;
  onSaveTemplate: (name: string, description: string) => void;
}) {
  const [templateName, setTemplateName] = useState(group.name);
  const [templateDescription, setTemplateDescription] = useState(group.description ?? "");
  const update = (patch: Partial<typeof group>) => commit((manifest) => updateGroup(manifest, group.id, (current) => ({ ...current, ...patch })));
  const customOnly = isWorkspaceGroupCustomOnlyV3(group);
  return (
    <>
      <fieldset>
        <legend>Group</legend>
        <label>Editor name<input maxLength={80} minLength={1} onChange={(event) => update({ name: event.target.value })} value={group.name} /></label>
        <label>Public heading<input maxLength={120} onChange={(event) => update({ heading: event.target.value || undefined })} placeholder="Optional" value={group.heading ?? ""} /></label>
        <label>Description<textarea maxLength={500} onChange={(event) => update({ description: event.target.value || undefined })} rows={4} value={group.description ?? ""} /></label>
        <div className={styles.inlineGrid}>
          <Select label="Surface" value={group.presentation?.surface ?? "plain"} onChange={(value) => update({ presentation: { ...group.presentation, surface: value as "plain" | "section" | "card" } })} options={["plain", "section", "card"]} />
          <Select label="Spacing" value={group.presentation?.spacing ?? "comfortable"} onChange={(value) => update({ presentation: { ...group.presentation, spacing: value as "compact" | "comfortable" | "spacious" } })} options={["compact", "comfortable", "spacious"]} />
          <Select label="Heading alignment" value={group.presentation?.headingAlign ?? "left"} onChange={(value) => update({ presentation: { ...group.presentation, headingAlign: value as "left" | "center" } })} options={["left", "center"]} />
        </div>
        <label className={base.switchLabel}><input checked={group.presentation?.showDivider ?? false} onChange={(event) => update({ presentation: { ...group.presentation, showDivider: event.target.checked } })} type="checkbox" /> Divider below heading</label>
        <label className={base.switchLabel}><input checked={group.locked ?? false} onChange={(event) => update({ locked: event.target.checked })} type="checkbox" /> Lock group position</label>
      </fieldset>
      <fieldset>
        <legend>Save group template</legend>
        <label>Name<input maxLength={80} minLength={3} onChange={(event) => setTemplateName(event.target.value)} value={templateName} /></label>
        <label>Description<input maxLength={240} onChange={(event) => setTemplateDescription(event.target.value)} value={templateDescription} /></label>
        <button disabled={!customOnly || templateName.trim().length < 3} onClick={() => onSaveTemplate(templateName, templateDescription)} type="button"><Save size={13} /> Save custom group</button>
        {!customOnly && <p className={styles.noticeText}>Shared group templates may contain custom content only; production components stay code-owned.</p>}
      </fieldset>
    </>
  );
}

function RowSettings({ commit, row }: { commit: Commit; row: NonNullable<ReturnType<typeof findRow>> }) {
  const update = (patch: Partial<typeof row>) => commit((manifest) => updateRow(manifest, row.id, (current) => ({ ...current, ...patch })));
  return (
    <fieldset>
      <legend>Row layout</legend>
      <Select label="Gap" value={row.gap ?? "medium"} onChange={(value) => update({ gap: value as "small" | "medium" | "large" })} options={["small", "medium", "large"]} />
      <Select label="Vertical alignment" value={row.align ?? "stretch"} onChange={(value) => update({ align: value as "start" | "center" | "stretch" })} options={["start", "center", "stretch"]} />
      <label className={base.switchLabel}><input checked={row.locked ?? false} onChange={(event) => update({ locked: event.target.checked })} type="checkbox" /> Lock row position</label>
      <p className={styles.noticeText}>{row.columns.length} column{row.columns.length === 1 ? "" : "s"}; up to four are supported.</p>
    </fieldset>
  );
}

function ColumnSettings({ column, commit, viewport }: {
  column: NonNullable<ReturnType<typeof findColumn>>;
  commit: Commit;
  viewport: LayoutViewport;
}) {
  const update = (patch: Partial<typeof column>) => commit((manifest) => updateColumn(manifest, column.id, (current) => ({ ...current, ...patch })));
  const desktop = allowedDesktopSpans(column);
  return (
    <fieldset>
      <legend>Responsive width</legend>
      <div className={styles.inlineGrid}>
        <label>Desktop<select onChange={(event) => update({ span: { ...column.span, desktop: Number(event.target.value) as WorkspaceLayoutDesktopSpanV2 } })} value={column.span.desktop}>{desktop.map((span) => <option key={span} value={span}>{span} / 12</option>)}</select></label>
        <label>Tablet<select onChange={(event) => update({ span: { ...column.span, tablet: Number(event.target.value) as WorkspaceLayoutTabletSpanV2 } })} value={column.span.tablet}>{[6, 12].map((span) => <option key={span} value={span}>{span} / 12</option>)}</select></label>
        <label>Mobile<select disabled value={12}><option value={12}>12 / 12</option></select></label>
      </div>
      <label className={base.switchLabel}><input checked={column.locked ?? false} onChange={(event) => update({ locked: event.target.checked })} type="checkbox" /> Lock column position</label>
      <p className={styles.noticeText}>Editing {titleCase(viewport)} preview. Width choices are constrained to component-safe presets.</p>
    </fieldset>
  );
}

function NodeSettings({ assets, commit, node, onUploadImage, uploading }: {
  assets: LayoutAssetSummary[];
  commit: Commit;
  node: WorkspaceLayoutNodeV3;
  onUploadImage: (file: File, alt: string, nodeId: string) => Promise<void>;
  uploading: boolean;
}) {
  const protectedNode = requiredProductionNode(node);
  const update = (patch: Partial<WorkspaceLayoutNodeV3>) => commit((manifest) => updateNode(manifest, node.id, (current) => ({ ...current, ...patch } as WorkspaceLayoutNodeV3)));
  return (
    <>
      <fieldset>
        <legend>Display</legend>
        <label className={base.switchLabel}><input checked={node.visible} disabled={protectedNode} onChange={(event) => update({ visible: event.target.checked })} type="checkbox" /> Visible {protectedNode && <small>Required trust surface</small>}</label>
        <label className={base.switchLabel}><input checked={protectedNode || node.locked || false} disabled={protectedNode} onChange={(event) => update({ locked: event.target.checked })} type="checkbox" /> Lock component {protectedNode && <small>Permanent</small>}</label>
        <div className={styles.inlineGrid}>
          <Select label="Surface" value={node.presentation?.surface ?? "panel"} onChange={(value) => update({ presentation: { ...node.presentation, surface: value as "panel" | "plain" | "muted" | "accent" } })} options={["panel", "plain", "muted", "accent"]} />
          <Select label="Emphasis" value={node.presentation?.emphasis ?? "standard"} onChange={(value) => update({ presentation: { ...node.presentation, emphasis: value as "quiet" | "standard" | "prominent" } })} options={["quiet", "standard", "prominent"]} />
          <Select label="Density" value={node.presentation?.density ?? "comfortable"} onChange={(value) => update({ presentation: { ...node.presentation, density: value as "compact" | "comfortable" | "spacious" } })} options={["compact", "comfortable", "spacious"]} />
          <Select label="Height" value={node.presentation?.height ?? "auto"} onChange={(value) => update({ presentation: { ...node.presentation, height: value as "auto" | "compact" | "standard" | "tall" } })} options={["auto", "compact", "standard", "tall"]} />
        </div>
      </fieldset>
      {node.kind === "production"
        ? <ProductionSettings node={node} update={update} />
        : <CustomSettings assets={assets} node={node} onUploadImage={onUploadImage} update={update} uploading={uploading} />}
      {!protectedNode && <VisibilitySettings node={node} update={update} />}
    </>
  );
}

function ProductionSettings({ node, update }: {
  node: Extract<WorkspaceLayoutNodeV3, { kind: "production" }>;
  update: (patch: Partial<WorkspaceLayoutNodeV3>) => void;
}) {
  const config = node.config ?? {};
  const setConfig = (patch: Partial<typeof config>) => update({ config: { ...config, ...patch } });
  return (
    <fieldset>
      <legend>Production-safe variant</legend>
      {node.component === "results-map" && <>
        <Select label="Composition" value={config.mapComposition ?? "map-first"} onChange={(value) => setConfig({ mapComposition: value as "map-first" | "table-first" | "split" })} options={["map-first", "table-first", "split"]} />
        <Select label="Legend" value={config.legendPosition ?? "below"} onChange={(value) => setConfig({ legendPosition: value as "inline" | "below" })} options={["inline", "below"]} />
      </>}
      {node.component === "coverage-context" && <Select label="Coverage" value={config.coverageVariant ?? "list"} onChange={(value) => setConfig({ coverageVariant: value as "list" | "cards" | "compact" })} options={["list", "cards", "compact"]} />}
      {node.component === "state-snapshot" && <Select label="Snapshot" value={config.snapshotVariant ?? "bars"} onChange={(value) => setConfig({ snapshotVariant: value as "bars" | "metrics" | "table" })} options={["bars", "metrics", "table"]} />}
      {node.component === "source-provenance" && <Select label="Provenance" value={config.provenanceVariant ?? "expanded"} onChange={(value) => setConfig({ provenanceVariant: value as "summary" | "expanded" | "accordion" })} options={["summary", "expanded", "accordion"]} />}
      {node.component === "review-center" && <Select label="Navigation" value={config.navigationStyle ?? "tabs"} onChange={(value) => setConfig({ navigationStyle: value as "tabs" | "pills" | "sidebar" })} options={["tabs", "pills", "sidebar"]} />}
      <p className={styles.noticeText}>The editor changes presentation only. Data, source labels, calculations, and trust-surface behavior remain code-owned.</p>
    </fieldset>
  );
}

function CustomSettings({ assets, node, onUploadImage, update, uploading }: {
  assets: LayoutAssetSummary[];
  node: WorkspaceCustomNodeV3;
  onUploadImage: (file: File, alt: string, nodeId: string) => Promise<void>;
  update: (patch: Partial<WorkspaceLayoutNodeV3>) => void;
  uploading: boolean;
}) {
  const [alt, setAlt] = useState(node.asset?.alt ?? "");
  const set = (patch: Partial<WorkspaceCustomNodeV2>) => update(patch as Partial<WorkspaceLayoutNodeV3>);
  return (
    <fieldset>
      <legend>Content</legend>
      {node.component !== "divider" && <label>Title<input maxLength={100} onChange={(event) => set({ title: event.target.value })} value={node.title ?? ""} /></label>}
      {node.component === "rich-text"
        ? <LayoutRichTextEditor document={node.document ?? richTextDocumentFromPlainText(node.body ?? "")} onChange={(document) => set({ document })} />
        : ["narrative", "callout", "heading"].includes(node.component) && <label>Body<textarea maxLength={2000} onChange={(event) => set({ body: event.target.value })} rows={5} value={node.body ?? ""} /></label>}
      {node.component === "image" && <>
        <label>Alternative text<input maxLength={240} onChange={(event) => {
          setAlt(event.target.value);
          if (node.asset) set({ asset: { ...node.asset, alt: event.target.value } });
        }} value={alt} /></label>
        <label className={base.uploadButton}>{uploading ? <LoaderCircle className={base.spin} size={16} /> : <FileImage size={16} />} Upload image<input accept="image/avif,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUploadImage(file, alt, node.id);
        }} type="file" /></label>
        {assets.length > 0 && <div className={base.assetGrid}>{assets.map((asset) => <button key={asset.id} onClick={() => set({ asset: { alt: asset.alt, assetId: asset.id, height: asset.height, url: asset.url, width: asset.width } })} type="button"><img alt={asset.alt} src={asset.url} /><span>{asset.alt || asset.pathname}</span></button>)}</div>}
        <label>Caption<input disabled={!node.asset} maxLength={300} onChange={(event) => node.asset && set({ asset: { ...node.asset, caption: event.target.value } })} value={node.asset?.caption ?? ""} /></label>
      </>}
      {node.component === "video" && <>
        <Select label="Provider" value={node.video?.provider ?? "youtube"} onChange={(value) => set({ video: { id: node.video?.id ?? "", provider: value as "youtube" | "vimeo", title: node.video?.title ?? node.title ?? "Video" } })} options={["youtube", "vimeo"]} />
        <label>Video ID<input onChange={(event) => set({ video: { id: event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""), provider: node.video?.provider ?? "youtube", title: node.video?.title ?? node.title ?? "Video" } })} value={node.video?.id ?? ""} /></label>
      </>}
      {["metric-strip", "link-list", "button-group", "accordion"].includes(node.component) && <ItemsEditor node={node} set={set} />}
    </fieldset>
  );
}

function ItemsEditor({ node, set }: {
  node: WorkspaceCustomNodeV3;
  set: (patch: Partial<WorkspaceCustomNodeV2>) => void;
}) {
  const items = node.items ?? [];
  return (
    <div className={base.itemsEditor}>
      <span>Items</span>
      {items.map((item, index) => (
        <div key={index}>
          <input aria-label={`Item ${index + 1} label`} onChange={(event) => set({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) })} placeholder="Label" value={item.label} />
          {node.component === "metric-strip" && <input aria-label={`Item ${index + 1} value`} onChange={(event) => set({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) })} placeholder="Value" value={item.value ?? ""} />}
          {["link-list", "button-group"].includes(node.component) && <input aria-label={`Item ${index + 1} link`} onChange={(event) => set({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, href: event.target.value } : entry) })} placeholder="https:// or /path" value={item.href ?? ""} />}
          {node.component === "accordion" && <textarea aria-label={`Item ${index + 1} body`} onChange={(event) => set({ items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, body: event.target.value } : entry) })} placeholder="Expanded content" value={item.body ?? ""} />}
          <button aria-label={`Remove item ${index + 1}`} onClick={() => set({ items: items.filter((_, itemIndex) => itemIndex !== index) })} type="button"><Trash2 size={14} /></button>
        </div>
      ))}
      <button disabled={items.length >= 12} onClick={() => set({ items: [...items, { label: "New item", value: node.component === "metric-strip" ? "0" : undefined }] })} type="button"><Plus size={14} /> Add item</button>
    </div>
  );
}

function VisibilitySettings({ node, update }: {
  node: WorkspaceLayoutNodeV3;
  update: (patch: Partial<WorkspaceLayoutNodeV3>) => void;
}) {
  const visibility = node.visibility ?? { groups: [], operator: "all" as const, viewports: { desktop: true, mobile: true, tablet: true } };
  const condition = visibility.groups?.[0]?.conditions[0];
  const setViewport = (key: "desktop" | "mobile" | "tablet", value: boolean) => update({ visibility: { ...visibility, viewports: { ...visibility.viewports, [key]: value } } });
  return (
    <fieldset>
      <legend>Visibility rules</legend>
      <div className={base.viewportChecks}>{(["desktop", "tablet", "mobile"] as const).map((key) => <label key={key}><input checked={visibility.viewports?.[key] !== false} onChange={(event) => setViewport(key, event.target.checked)} type="checkbox" /> {key}</label>)}</div>
      <label>Data rule<select onChange={(event) => {
        if (event.target.value === "always") return update({ visibility: { ...visibility, groups: [] } });
        const fact = event.target.value as WorkspaceVisibilityConditionV1["fact"];
        update({ visibility: { ...visibility, groups: [{ conditions: [initialCondition(fact)], operator: "all" }] } });
      }} value={condition?.fact ?? "always"}><option value="always">Always</option><option value="state">State equals</option><option value="year">Year equals</option><option value="capability">Capability available</option><option value="data">Data available</option><option value="validation">Validation status</option></select></label>
      {condition && <label>Rule value<input onChange={(event) => {
        const raw = event.target.value;
        const next = condition.fact === "capability" || condition.fact === "data"
          ? { ...condition, key: raw, operator: "available" as const, value: undefined }
          : { ...condition, value: condition.fact === "year" ? Number(raw) || 0 : raw };
        update({ visibility: { ...visibility, groups: [{ conditions: [next], operator: "all" }] } });
      }} value={String(condition.key ?? condition.value ?? "")} /></label>}
      <p className={styles.noticeText}>Rules use the existing allowlisted state, year, capability, data, and validation facts.</p>
    </fieldset>
  );
}

function initialCondition(fact: WorkspaceVisibilityConditionV1["fact"]): WorkspaceVisibilityConditionV1 {
  if (fact === "data") return { fact, key: workspaceVisibilityDataKeys[0], operator: "available" };
  if (fact === "capability") return { fact, key: workspaceVisibilityCapabilityKeys[0], operator: "available" };
  if (fact === "year") return { fact, operator: "equals", value: 2024 };
  if (fact === "validation") return { fact, operator: "equals", value: "passed" };
  return { fact, operator: "equals", value: "" };
}

function Select({ label, onChange, options, value }: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return <label>{label}<select onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}</select></label>;
}
