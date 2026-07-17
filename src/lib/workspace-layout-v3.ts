import {
  inspectWorkspaceContrast,
  type WorkspaceContrastResult,
} from "./workspace-layout-contrast.ts";
import {
  validateWorkspaceLayoutManifest,
  type WorkspaceLayoutEnvelopeV1,
  type WorkspaceLayoutManifestV1,
  type WorkspaceTabId,
} from "./workspace-layout.ts";
import {
  WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW,
  WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB,
  WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB,
  WORKSPACE_LAYOUT_REGISTRY_VERSION_V2,
  cloneWorkspaceLayoutManifestV2,
  embeddedWorkspaceLayoutManifestV2,
  toWorkspaceLayoutManifestV2,
  validateWorkspaceLayoutManifestV2,
  type WorkspaceCustomNodeV2,
  type WorkspaceLayoutColumnV2,
  type WorkspaceLayoutEnvelope,
  type WorkspaceLayoutManifest,
  type WorkspaceLayoutManifestV2,
  type WorkspaceLayoutNodeV2,
  type WorkspaceLayoutRowV2,
  type WorkspaceNodePresentationV2,
  type WorkspaceProductionNodeV2,
} from "./workspace-layout-v2.ts";

export const WORKSPACE_LAYOUT_SCHEMA_VERSION_V3 = 3 as const;
export const WORKSPACE_LAYOUT_REGISTRY_VERSION_V3 = WORKSPACE_LAYOUT_REGISTRY_VERSION_V2;
export const WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB = 12;

export type WorkspaceLayoutHeightPresetV3 = "auto" | "compact" | "standard" | "tall";
export type WorkspaceLayoutGroupPresentationV3 = {
  headingAlign?: "left" | "center";
  showDivider?: boolean;
  spacing?: "compact" | "comfortable" | "spacious";
  surface?: "plain" | "section" | "card";
};

export type WorkspaceNodePresentationV3 = WorkspaceNodePresentationV2 & {
  height?: WorkspaceLayoutHeightPresetV3;
};

export type WorkspaceProductionNodeV3 = Omit<WorkspaceProductionNodeV2, "presentation"> & {
  locked?: boolean;
  presentation?: WorkspaceNodePresentationV3;
};

export type WorkspaceCustomNodeV3 = Omit<WorkspaceCustomNodeV2, "presentation"> & {
  locked?: boolean;
  presentation?: WorkspaceNodePresentationV3;
};

export type WorkspaceLayoutNodeV3 = WorkspaceProductionNodeV3 | WorkspaceCustomNodeV3;

export type WorkspaceLayoutColumnV3 = Omit<WorkspaceLayoutColumnV2, "items"> & {
  items: WorkspaceLayoutNodeV3[];
  locked?: boolean;
};

export type WorkspaceLayoutRowV3 = Omit<WorkspaceLayoutRowV2, "columns"> & {
  columns: WorkspaceLayoutColumnV3[];
  locked?: boolean;
};

export type WorkspaceLayoutGroupV3 = {
  description?: string;
  heading?: string;
  id: string;
  locked?: boolean;
  name: string;
  presentation?: WorkspaceLayoutGroupPresentationV3;
  rows: WorkspaceLayoutRowV3[];
};

export type WorkspaceLayoutTabV3 = Omit<WorkspaceLayoutManifestV2["tabs"][number], "rows"> & {
  groups: WorkspaceLayoutGroupV3[];
};

export type WorkspaceLayoutSettingsV3 = Omit<WorkspaceLayoutManifestV2["settings"], "accentColor"> & {
  accentColor: string;
  backgroundColor: string;
  headingStyle: "interface" | "editorial" | "compact";
  motion: "standard" | "reduced";
  mutedTextColor: string;
  surfaceColor: string;
  textColor: string;
};

export type WorkspaceLayoutManifestV3 = {
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION_V3;
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION_V3;
  settings: WorkspaceLayoutSettingsV3;
  tabs: WorkspaceLayoutTabV3[];
};

export type WorkspaceLayoutManifestAny = WorkspaceLayoutManifest | WorkspaceLayoutManifestV3;

export type WorkspaceLayoutEnvelopeV3 = {
  manifest: WorkspaceLayoutManifestV3;
  manifestDigest: string;
  publishedAt: string;
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION_V3;
  revisionId: string;
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION_V3;
};

export type WorkspaceLayoutEnvelopeAny = WorkspaceLayoutEnvelopeV1 | WorkspaceLayoutEnvelope | WorkspaceLayoutEnvelopeV3;

export type WorkspaceLayoutV3ValidationResult =
  | { contrast: WorkspaceContrastResult[]; ok: true; value: WorkspaceLayoutManifestV3 }
  | { contrast: WorkspaceContrastResult[]; errors: string[]; ok: false };

export type WorkspaceLayoutGroupTemplateV3 = {
  description: string;
  group: WorkspaceLayoutGroupV3;
  id: string;
  label: string;
};

export const defaultWorkspaceLayoutSettingsV3: WorkspaceLayoutSettingsV3 = {
  ...embeddedWorkspaceLayoutManifestV2.settings,
  accentColor: "#35c7a3",
  backgroundColor: "#101112",
  headingStyle: "interface",
  motion: "standard",
  mutedTextColor: "#a9aaa4",
  surfaceColor: "#171918",
  textColor: "#f4f1ea",
};

export const embeddedWorkspaceLayoutManifestV3 = upgradeWorkspaceLayoutManifestV2(
  embeddedWorkspaceLayoutManifestV2,
);

export const workspaceStarterGroupTemplatesV3: WorkspaceLayoutGroupTemplateV3[] = [
  customGroupTemplate("orientation", "Orientation", "A heading and explanatory text for a new workspace section.", [
    customNode("heading", "Section heading"),
    customNode("rich-text", "Add concise, source-aware orientation for this section."),
  ]),
  customGroupTemplate("callout", "Caveat callout", "A prominent note followed by supporting links.", [
    customNode("callout", "Important context"),
    customNode("link-list", "Related sources"),
  ]),
  customGroupTemplate("metrics", "Metric summary", "A titled strip of supplemental metrics.", [
    customNode("heading", "Key figures"),
    customNode("metric-strip", "Metrics"),
  ]),
];

export function validateWorkspaceLayoutManifestV3(value: unknown): WorkspaceLayoutV3ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { contrast: [], errors: ["Layout manifest must be an object."], ok: false };
  }
  if (!hasOnlyKeys(value, ["registryVersion", "schemaVersion", "settings", "tabs"])) {
    errors.push("Layout manifest contains unsupported fields.");
  }
  if (value.schemaVersion !== WORKSPACE_LAYOUT_SCHEMA_VERSION_V3) errors.push("schemaVersion must be 3.");
  if (value.registryVersion !== WORKSPACE_LAYOUT_REGISTRY_VERSION_V3) errors.push("registryVersion must be 2.");
  if (!isRecord(value.settings)) errors.push("settings must be an object.");
  if (!Array.isArray(value.tabs)) errors.push("tabs must be an array.");
  if (errors.length) return { contrast: [], errors, ok: false };

  const manifest = value as unknown as WorkspaceLayoutManifestV3;
  inspectV3Shape(manifest, errors);
  let flattened: WorkspaceLayoutManifestV2 | null = null;
  try {
    flattened = workspaceLayoutManifestV3ToV2(manifest);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Layout groups could not be flattened.");
  }
  if (flattened) {
    const v2 = validateWorkspaceLayoutManifestV2(flattened);
    if (!v2.ok) errors.push(...v2.errors);
  }

  const contrast = inspectWorkspaceContrast([
    { background: manifest.settings.backgroundColor, foreground: manifest.settings.textColor, label: "Body text", threshold: 4.5 },
    { background: manifest.settings.surfaceColor, foreground: manifest.settings.textColor, label: "Panel text", threshold: 4.5 },
    { background: manifest.settings.backgroundColor, foreground: manifest.settings.mutedTextColor, label: "Muted text", threshold: 4.5 },
    { background: manifest.settings.backgroundColor, foreground: manifest.settings.accentColor, label: "Accent and focus indicators", threshold: 3 },
  ]);
  for (const result of contrast) {
    if (!result.ok) errors.push(`${result.label} contrast must be at least ${result.threshold}:1; current ratio is ${result.ratio.toFixed(2)}:1.`);
  }

  return errors.length
    ? { contrast, errors: [...new Set(errors)], ok: false }
    : { contrast, ok: true, value: cloneWorkspaceLayoutManifestV3(manifest) };
}

export function validateWorkspaceLayoutManifestAnyV3(value: unknown) {
  if (isRecord(value) && value.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V3) {
    return validateWorkspaceLayoutManifestV3(value);
  }
  const v2 = isRecord(value) && value.schemaVersion === 2
    ? validateWorkspaceLayoutManifestV2(value)
    : null;
  if (v2) return v2;
  return validateWorkspaceLayoutManifest(value);
}

export function toWorkspaceLayoutManifestV3(manifest: WorkspaceLayoutManifestAny): WorkspaceLayoutManifestV3 {
  if (manifest.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V3) {
    return cloneWorkspaceLayoutManifestV3(manifest);
  }
  return upgradeWorkspaceLayoutManifestV2(toWorkspaceLayoutManifestV2(manifest));
}

export function workspaceLayoutManifestAnyToV2(manifest: WorkspaceLayoutManifestAny) {
  return manifest.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V3
    ? workspaceLayoutManifestV3ToV2(manifest)
    : toWorkspaceLayoutManifestV2(manifest);
}

export function upgradeWorkspaceLayoutManifestV2(manifest: WorkspaceLayoutManifestV2): WorkspaceLayoutManifestV3 {
  const source = cloneWorkspaceLayoutManifestV2(manifest);
  return {
    registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION_V3,
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION_V3,
    settings: {
      ...defaultWorkspaceLayoutSettingsV3,
      ...source.settings,
      accentColor: source.settings.accentColor ?? defaultWorkspaceLayoutSettingsV3.accentColor,
    },
    tabs: source.tabs.map((tab) => ({
      groups: [{
        id: stableGroupId(tab.id),
        name: "Primary layout",
        presentation: { spacing: "comfortable", surface: "plain" },
        rows: tab.rows,
      }],
      id: tab.id,
      settings: tab.settings,
      visible: tab.visible,
    })),
  };
}

export function upgradeWorkspaceLayoutManifestV1(manifest: WorkspaceLayoutManifestV1) {
  return upgradeWorkspaceLayoutManifestV2(toWorkspaceLayoutManifestV2(manifest));
}

export function workspaceLayoutManifestV3ToV2(manifest: WorkspaceLayoutManifestV3): WorkspaceLayoutManifestV2 {
  return {
    registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION_V2,
    schemaVersion: 2,
    settings: {
      accentColor: manifest.settings.accentColor,
      contentWidth: manifest.settings.contentWidth,
      defaultTab: manifest.settings.defaultTab,
      notesDefault: manifest.settings.notesDefault,
      radius: manifest.settings.radius,
      shadow: manifest.settings.shadow,
      spacingScale: manifest.settings.spacingScale,
      tabStyle: manifest.settings.tabStyle,
      theme: manifest.settings.theme,
      typeScale: manifest.settings.typeScale,
    },
    tabs: manifest.tabs.map((tab) => ({
      id: tab.id,
      rows: tab.groups.flatMap((group) => group.rows.map(stripV3Row)),
      settings: tab.settings,
      visible: tab.visible,
    })),
  };
}

export function cloneWorkspaceLayoutManifestV3(
  manifest: WorkspaceLayoutManifestV3 = embeddedWorkspaceLayoutManifestV3,
) {
  return structuredClone(manifest);
}

export function flattenWorkspaceGroupsV3(tab: WorkspaceLayoutTabV3) {
  return tab.groups;
}

export function flattenWorkspaceRowsV3(tab: WorkspaceLayoutTabV3) {
  return tab.groups.flatMap((group) => group.rows);
}

export function flattenWorkspaceNodesV3(tab: WorkspaceLayoutTabV3) {
  return flattenWorkspaceRowsV3(tab).flatMap((row) => row.columns.flatMap((column) => column.items));
}

export function findWorkspaceGroupV3(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  return manifest.tabs.flatMap((tab) => tab.groups).find((group) => group.id === groupId);
}

export function createWorkspaceLayoutGroupV3(name = "New group"): WorkspaceLayoutGroupV3 {
  const id = workspaceV3Id("group");
  return {
    id,
    name,
    presentation: { spacing: "comfortable", surface: "plain" },
    rows: [],
  };
}

export function cloneWorkspaceLayoutGroupV3(group: WorkspaceLayoutGroupV3) {
  const copy = structuredClone(group);
  const remap = new Map<string, string>();
  const nextId = (id: string, prefix: string) => {
    const next = workspaceV3Id(prefix);
    remap.set(id, next);
    return next;
  };
  copy.id = nextId(copy.id, "group");
  copy.rows = copy.rows.map((row) => ({
    ...row,
    id: nextId(row.id, "row"),
    columns: row.columns.map((column) => ({
      ...column,
      id: nextId(column.id, "column"),
      items: column.items.map((node) => ({ ...node, id: nextId(node.id, `custom-${node.component}`) })),
    })),
  }));
  return copy;
}

export function isWorkspaceGroupCustomOnlyV3(group: WorkspaceLayoutGroupV3) {
  return group.rows.every((row) => row.columns.every((column) => column.items.every((node) => node.kind === "custom")));
}

export function workspaceV3Id(prefix: string) {
  const normalized = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "layout";
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${normalized}-${suffix}`;
}

function inspectV3Shape(manifest: WorkspaceLayoutManifestV3, errors: string[]) {
  const settingsKeys = [
    "accentColor", "backgroundColor", "contentWidth", "defaultTab", "headingStyle", "motion", "mutedTextColor",
    "notesDefault", "radius", "shadow", "spacingScale", "surfaceColor", "tabStyle", "textColor", "theme", "typeScale",
  ];
  if (!hasOnlyKeys(manifest.settings as unknown as Record<string, unknown>, settingsKeys)) {
    errors.push("settings contains unsupported fields.");
  }
  for (const key of ["accentColor", "backgroundColor", "mutedTextColor", "surfaceColor", "textColor"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(manifest.settings[key] ?? "")) errors.push(`settings.${key} must be a six-digit hex color.`);
  }
  if (!["interface", "editorial", "compact"].includes(manifest.settings.headingStyle)) errors.push("settings.headingStyle is invalid.");
  if (!["standard", "reduced"].includes(manifest.settings.motion)) errors.push("settings.motion is invalid.");
  if (!Array.isArray(manifest.tabs)) return;

  const seenGroupIds = new Set<string>();
  for (const tab of manifest.tabs) {
    if (!hasOnlyKeys(tab as unknown as Record<string, unknown>, ["groups", "id", "settings", "visible"])) {
      errors.push(`Tab ${String(tab.id)} contains unsupported fields.`);
    }
    if (!Array.isArray(tab.groups) || tab.groups.length < 1 || tab.groups.length > WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB) {
      errors.push(`Tab ${String(tab.id)} must contain between 1 and ${WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB} groups.`);
      continue;
    }
    const rowCount = tab.groups.reduce((total, group) => total + (Array.isArray(group.rows) ? group.rows.length : 0), 0);
    if (rowCount < 1 || rowCount > WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB) {
      errors.push(`Tab ${String(tab.id)} must contain between 1 and ${WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB} rows across its groups.`);
    }
    for (const group of tab.groups) {
      inspectGroup(group, tab.id, seenGroupIds, errors);
    }
  }
}

function inspectGroup(
  group: WorkspaceLayoutGroupV3,
  tabId: WorkspaceTabId,
  seenIds: Set<string>,
  errors: string[],
) {
  if (!isRecord(group) || !hasOnlyKeys(group, ["description", "heading", "id", "locked", "name", "presentation", "rows"])) {
    errors.push(`Tab ${tabId} contains a group with unsupported fields.`);
    return;
  }
  if (!/^[a-z][a-z0-9-]{2,95}$/.test(group.id)) errors.push(`Group id ${String(group.id)} is invalid.`);
  if (seenIds.has(group.id)) errors.push(`Group id ${group.id} appears more than once.`);
  seenIds.add(group.id);
  if (typeof group.name !== "string" || group.name.trim().length < 1 || group.name.length > 80) errors.push(`Group ${group.id} needs an editor name of 1 to 80 characters.`);
  if (group.heading !== undefined && (typeof group.heading !== "string" || group.heading.length > 120)) errors.push(`Group ${group.id} heading is too long.`);
  if (group.description !== undefined && (typeof group.description !== "string" || group.description.length > 500)) errors.push(`Group ${group.id} description is too long.`);
  if (group.locked !== undefined && typeof group.locked !== "boolean") errors.push(`Group ${group.id} lock must be boolean.`);
  if (group.presentation !== undefined) {
    if (!isRecord(group.presentation) || !hasOnlyKeys(group.presentation, ["headingAlign", "showDivider", "spacing", "surface"])) {
      errors.push(`Group ${group.id} presentation contains unsupported fields.`);
    } else {
      if (group.presentation.headingAlign !== undefined && !["left", "center"].includes(group.presentation.headingAlign)) errors.push(`Group ${group.id} heading alignment is invalid.`);
      if (group.presentation.spacing !== undefined && !["compact", "comfortable", "spacious"].includes(group.presentation.spacing)) errors.push(`Group ${group.id} spacing is invalid.`);
      if (group.presentation.surface !== undefined && !["plain", "section", "card"].includes(group.presentation.surface)) errors.push(`Group ${group.id} surface is invalid.`);
      if (group.presentation.showDivider !== undefined && typeof group.presentation.showDivider !== "boolean") errors.push(`Group ${group.id} divider setting must be boolean.`);
    }
  }
  if (!Array.isArray(group.rows)) {
    errors.push(`Group ${group.id} rows must be an array.`);
    return;
  }
  for (const row of group.rows) inspectRow(row, group.id, errors);
}

function inspectRow(row: WorkspaceLayoutRowV3, groupId: string, errors: string[]) {
  if (!isRecord(row) || !hasOnlyKeys(row, ["align", "columns", "gap", "id", "locked"])) {
    errors.push(`Group ${groupId} contains a row with unsupported fields.`);
    return;
  }
  if (row.locked !== undefined && typeof row.locked !== "boolean") errors.push(`Row ${row.id} lock must be boolean.`);
  if (!Array.isArray(row.columns) || row.columns.length < 1 || row.columns.length > WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW) return;
  for (const column of row.columns) {
    if (!isRecord(column) || !hasOnlyKeys(column, ["id", "items", "locked", "span"])) {
      errors.push(`Row ${row.id} contains a column with unsupported fields.`);
      continue;
    }
    if (column.locked !== undefined && typeof column.locked !== "boolean") errors.push(`Column ${column.id} lock must be boolean.`);
    if (!Array.isArray(column.items)) continue;
    for (const node of column.items) {
      const allowed = node.kind === "production"
        ? ["component", "config", "id", "kind", "locked", "presentation", "visibility", "visible"]
        : ["asset", "body", "component", "document", "id", "items", "kind", "locked", "presentation", "title", "video", "visibility", "visible"];
      if (!isRecord(node) || !hasOnlyKeys(node, allowed)) errors.push(`Column ${column.id} contains a component with unsupported fields.`);
      if (node.locked !== undefined && typeof node.locked !== "boolean") errors.push(`Component ${node.id} lock must be boolean.`);
      if (node.presentation?.height !== undefined && !["auto", "compact", "standard", "tall"].includes(node.presentation.height)) {
        errors.push(`Component ${node.id} height preset is invalid.`);
      }
    }
  }
}

function stripV3Row(row: WorkspaceLayoutRowV3): WorkspaceLayoutRowV2 {
  return omitUndefined({
    align: row.align,
    columns: row.columns.map((column) => ({
      id: column.id,
      items: column.items.map(stripV3Node),
      span: column.span,
    })),
    gap: row.gap,
    id: row.id,
  });
}

function stripV3Node(node: WorkspaceLayoutNodeV3): WorkspaceLayoutNodeV2 {
  const presentation = node.presentation
    ? omitUndefined({ density: node.presentation.density, emphasis: node.presentation.emphasis, surface: node.presentation.surface })
    : undefined;
  if (node.kind === "production") {
    return omitUndefined({
      component: node.component,
      config: node.config,
      id: node.id,
      kind: "production",
      presentation,
      visibility: node.visibility,
      visible: node.visible,
    });
  }
  return omitUndefined({
    asset: node.asset,
    body: node.body,
    component: node.component,
    document: node.document,
    id: node.id,
    items: node.items,
    kind: "custom",
    presentation,
    title: node.title,
    video: node.video,
    visibility: node.visibility,
    visible: node.visible,
  });
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function customGroupTemplate(
  id: string,
  label: string,
  description: string,
  nodes: WorkspaceCustomNodeV3[],
): WorkspaceLayoutGroupTemplateV3 {
  return {
    description,
    group: {
      id: `group-template-${id}`,
      name: label,
      presentation: { spacing: "comfortable", surface: "section" },
      rows: nodes.map((node, index) => ({
        columns: [{
          id: `column-template-${id}-${index + 1}`,
          items: [node],
          span: { desktop: 12, mobile: 12, tablet: 12 },
        }],
        gap: "medium",
        id: `row-template-${id}-${index + 1}`,
      })),
    },
    id,
    label,
  };
}

function customNode(component: WorkspaceCustomNodeV2["component"], title: string): WorkspaceCustomNodeV3 {
  const base: WorkspaceCustomNodeV3 = {
    component,
    id: `custom-template-${component}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 95),
    kind: "custom",
    presentation: { density: "comfortable", emphasis: component === "callout" ? "prominent" : "standard", height: "auto", surface: "panel" },
    title,
    visible: true,
  };
  if (component === "rich-text") return { ...base, document: { blocks: [{ children: [{ text: title, type: "text" }], type: "paragraph" }], version: 1 } };
  if (component === "callout") return { ...base, body: "Add an important caveat or next step." };
  if (component === "link-list") return { ...base, items: [{ href: "/", label: "Workspace home" }] };
  if (component === "metric-strip") return { ...base, items: [{ label: "Metric one", value: "Value" }, { label: "Metric two", value: "Value" }] };
  return base;
}

function stableGroupId(tabId: WorkspaceTabId) {
  return `group-${tabId}-primary`;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
