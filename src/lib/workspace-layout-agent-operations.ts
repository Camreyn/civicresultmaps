import { z } from "zod";
import type { WorkspaceTabId } from "./workspace-layout.ts";
import {
  WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW,
  WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB,
  WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB,
  createWorkspaceCustomNodeV2,
  richTextDocumentFromPlainText,
  workspaceLayoutRegistryV2,
  type WorkspaceCustomBlockKindV2,
  type WorkspaceCustomItemV2,
  type WorkspaceLayoutDesktopSpanV2,
} from "./workspace-layout-v2.ts";
import {
  WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB,
  cloneWorkspaceLayoutManifestV3,
  flattenWorkspaceNodesV3,
  validateWorkspaceLayoutManifestV3,
  type WorkspaceCustomNodeV3,
  type WorkspaceLayoutColumnV3,
  type WorkspaceLayoutGroupV3,
  type WorkspaceLayoutManifestV3,
  type WorkspaceLayoutNodeV3,
  type WorkspaceLayoutRowV3,
} from "./workspace-layout-v3.ts";
import {
  moveWorkspaceColumnV3,
  moveWorkspaceGroupV3,
  moveWorkspaceNodeV3,
  moveWorkspaceRowV3,
  removeWorkspaceNodeV3,
} from "./workspace-layout-editor-reducer.ts";

export const layoutAgentTabIds = [
  "map",
  "review",
  "history",
  "electronic",
  "planner",
  "data",
  "methodology",
  "exports",
  "imports",
  "support",
  "contact",
] as const satisfies readonly WorkspaceTabId[];

export const layoutAgentCustomBlockKinds = [
  "narrative",
  "callout",
  "metric-strip",
  "link-list",
  "divider",
  "heading",
  "rich-text",
  "button-group",
  "video",
  "accordion",
] as const satisfies readonly WorkspaceCustomBlockKindV2[];

const operationIdSchema = z.string()
  .regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "operationId must be 3-40 lowercase letters, numbers, or hyphens.");
const idSchema = z.string().regex(/^[a-z][a-z0-9-]{2,95}$/);
const indexSchema = z.number().int().min(0).max(100);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors must use six-digit hex notation.");
const customBlockKindSchema = z.enum(layoutAgentCustomBlockKinds);
const tabIdSchema = z.enum(layoutAgentTabIds);

const workspacePatchSchema = z.object({
  accentColor: colorSchema.optional(),
  backgroundColor: colorSchema.optional(),
  contentWidth: z.enum(["standard", "wide", "full"]).optional(),
  defaultTab: tabIdSchema.optional(),
  headingStyle: z.enum(["interface", "editorial", "compact"]).optional(),
  motion: z.enum(["standard", "reduced"]).optional(),
  mutedTextColor: colorSchema.optional(),
  notesDefault: z.enum(["collapsed", "expanded"]).optional(),
  radius: z.enum(["square", "subtle", "rounded"]).optional(),
  shadow: z.enum(["none", "subtle", "raised"]).optional(),
  spacingScale: z.enum(["tight", "standard", "relaxed"]).optional(),
  surfaceColor: colorSchema.optional(),
  tabStyle: z.enum(["bar", "pills"]).optional(),
  textColor: colorSchema.optional(),
  theme: z.enum(["civic", "high-contrast", "warm"]).optional(),
  typeScale: z.enum(["small", "standard", "large"]).optional(),
}).strict();

const tabPatchSchema = z.object({
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  notesPosition: z.enum(["side", "below", "drawer"]).optional(),
  visible: z.boolean().optional(),
}).strict();

const groupPresentationSchema = z.object({
  headingAlign: z.enum(["left", "center"]).optional(),
  showDivider: z.boolean().optional(),
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  surface: z.enum(["plain", "section", "card"]).optional(),
}).strict();

const groupPatchSchema = z.object({
  description: z.string().max(240).nullable().optional(),
  heading: z.string().max(100).nullable().optional(),
  locked: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  presentation: groupPresentationSchema.optional(),
}).strict();

const rowPatchSchema = z.object({
  align: z.enum(["start", "center", "stretch"]).optional(),
  gap: z.enum(["small", "medium", "large"]).optional(),
  locked: z.boolean().optional(),
}).strict();

const columnPatchSchema = z.object({
  desktopSpan: z.union([z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(9), z.literal(12)]).optional(),
  locked: z.boolean().optional(),
  tabletSpan: z.union([z.literal(6), z.literal(12)]).optional(),
}).strict();

const itemSchema = z.object({
  body: z.string().max(600).optional(),
  href: z.string().max(240).optional(),
  label: z.string().trim().min(1).max(80),
  value: z.string().max(80).optional(),
}).strict();

const visibilityConditionSchema = z.object({
  fact: z.enum(["state", "year", "capability", "data", "validation"]),
  key: z.string().max(60).optional(),
  operator: z.enum(["equals", "not-equals", "in", "available", "unavailable"]),
  value: z.union([
    z.boolean(),
    z.number(),
    z.string().max(120),
    z.array(z.string().max(120)).max(20),
  ]).optional(),
}).strict();

const visibilitySchema = z.object({
  groups: z.array(z.object({
    conditions: z.array(visibilityConditionSchema).min(1).max(8),
    operator: z.enum(["all", "any"]),
  }).strict()).max(4).optional(),
  operator: z.enum(["all", "any"]).optional(),
  viewports: z.object({
    desktop: z.boolean().optional(),
    mobile: z.boolean().optional(),
    tablet: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const nodePresentationSchema = z.object({
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  emphasis: z.enum(["quiet", "standard", "prominent"]).optional(),
  height: z.enum(["auto", "compact", "standard", "tall"]).optional(),
  surface: z.enum(["plain", "panel", "muted", "accent"]).optional(),
}).strict();

const productionConfigSchema = z.object({
  coverageVariant: z.enum(["list", "cards", "compact"]).optional(),
  defaultView: z.string().max(60).optional(),
  legendPosition: z.enum(["inline", "below"]).optional(),
  mapComposition: z.enum(["map-first", "table-first", "split"]).optional(),
  navigationStyle: z.enum(["tabs", "pills", "sidebar"]).optional(),
  provenanceInitialState: z.enum(["collapsed", "expanded"]).optional(),
  provenanceVariant: z.enum(["summary", "expanded", "accordion"]).optional(),
  snapshotVariant: z.enum(["bars", "metrics", "table"]).optional(),
  viewOrder: z.array(z.string().max(60)).max(8).optional(),
  visibleViews: z.array(z.string().max(60)).max(8).optional(),
}).strict();
const productionConfigKeysByComponent: Record<string, readonly string[]> = {
  "coverage-context": ["coverageVariant"],
  "results-map": ["legendPosition", "mapComposition"],
  "review-center": ["navigationStyle"],
  "source-provenance": ["provenanceInitialState", "provenanceVariant"],
  "state-snapshot": ["snapshotVariant"],
};


const videoSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{5,32}$/),
  provider: z.enum(["youtube", "vimeo"]),
  title: z.string().trim().min(1).max(160),
}).strict();

const blockPatchSchema = z.object({
  body: z.string().max(2_000).nullable().optional(),
  config: productionConfigSchema.optional(),
  items: z.array(itemSchema).max(12).nullable().optional(),
  locked: z.boolean().optional(),
  presentation: nodePresentationSchema.optional(),
  richText: z.string().max(8_000).nullable().optional(),
  title: z.string().max(100).nullable().optional(),
  video: videoSchema.nullable().optional(),
  visibility: visibilitySchema.nullable().optional(),
  visible: z.boolean().optional(),
}).strict();

const baseOperation = { operationId: operationIdSchema };
const initialBlockFields = {
  body: z.string().max(2_000).optional(),
  component: customBlockKindSchema.optional(),
  items: z.array(itemSchema).max(12).optional(),
  title: z.string().max(100).optional(),
  video: videoSchema.optional(),
};

export const workspaceLayoutAgentOperationSchema = z.discriminatedUnion("type", [
  z.object({ ...baseOperation, patch: workspacePatchSchema, type: z.literal("update_workspace") }).strict(),
  z.object({ ...baseOperation, patch: tabPatchSchema, tabId: tabIdSchema, type: z.literal("update_tab") }).strict(),
  z.object({
    ...baseOperation,
    ...initialBlockFields,
    description: z.string().max(240).optional(),
    heading: z.string().max(100).optional(),
    name: z.string().trim().min(1).max(80),
    presentation: groupPresentationSchema.optional(),
    tabId: tabIdSchema,
    type: z.literal("add_group"),
  }).strict(),
  z.object({ ...baseOperation, groupId: idSchema, patch: groupPatchSchema, type: z.literal("update_group") }).strict(),
  z.object({ ...baseOperation, destinationIndex: indexSchema, groupId: idSchema, tabId: tabIdSchema, type: z.literal("move_group") }).strict(),
  z.object({ ...baseOperation, groupId: idSchema, type: z.literal("duplicate_group") }).strict(),
  z.object({ ...baseOperation, groupId: idSchema, type: z.literal("delete_group") }).strict(),
  z.object({ ...baseOperation, ...initialBlockFields, groupId: idSchema, type: z.literal("add_row") }).strict(),
  z.object({ ...baseOperation, patch: rowPatchSchema, rowId: idSchema, type: z.literal("update_row") }).strict(),
  z.object({ ...baseOperation, destinationGroupId: idSchema, destinationIndex: indexSchema, rowId: idSchema, type: z.literal("move_row") }).strict(),
  z.object({ ...baseOperation, rowId: idSchema, type: z.literal("duplicate_row") }).strict(),
  z.object({ ...baseOperation, rowId: idSchema, type: z.literal("delete_row") }).strict(),
  z.object({ ...baseOperation, ...initialBlockFields, rowId: idSchema, type: z.literal("add_column") }).strict(),
  z.object({ ...baseOperation, columnId: idSchema, patch: columnPatchSchema, type: z.literal("update_column") }).strict(),
  z.object({ ...baseOperation, columnId: idSchema, destinationIndex: indexSchema, destinationRowId: idSchema, type: z.literal("move_column") }).strict(),
  z.object({ ...baseOperation, columnId: idSchema, type: z.literal("duplicate_column") }).strict(),
  z.object({ ...baseOperation, columnId: idSchema, type: z.literal("delete_column") }).strict(),
  z.object({
    ...baseOperation,
    body: z.string().max(2_000).optional(),
    columnId: idSchema,
    component: customBlockKindSchema,
    items: z.array(itemSchema).max(12).optional(),
    title: z.string().max(100).optional(),
    video: videoSchema.optional(),
    type: z.literal("add_block"),
  }).strict(),
  z.object({ ...baseOperation, nodeId: idSchema, patch: blockPatchSchema, type: z.literal("update_block") }).strict(),
  z.object({ ...baseOperation, destinationColumnId: idSchema, destinationIndex: indexSchema, nodeId: idSchema, type: z.literal("move_block") }).strict(),
  z.object({ ...baseOperation, nodeId: idSchema, type: z.literal("duplicate_block") }).strict(),
  z.object({ ...baseOperation, nodeId: idSchema, type: z.literal("delete_block") }).strict(),
]);

export const workspaceLayoutAgentOperationsSchema = z.array(workspaceLayoutAgentOperationSchema).min(1).max(40);
export type WorkspaceLayoutAgentOperation = z.infer<typeof workspaceLayoutAgentOperationSchema>;

export type WorkspaceLayoutAgentOperationResult = {
  createdIds: string[];
  operationId: string;
  type: WorkspaceLayoutAgentOperation["type"];
};

export class WorkspaceLayoutAgentOperationError extends Error {
  readonly operationId?: string;
  readonly operationIndex?: number;

  constructor(
    message: string,
    operationId?: string,
    operationIndex?: number,
  ) {
    super(message);
    this.name = "WorkspaceLayoutAgentOperationError";
    this.operationId = operationId;
    this.operationIndex = operationIndex;
  }
}

export function parseWorkspaceLayoutAgentOperations(value: unknown) {
  const parsed = workspaceLayoutAgentOperationsSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkspaceLayoutAgentOperationError(parsed.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }).join(" "));
  }
  return parsed.data;
}

export function applyWorkspaceLayoutAgentOperations(
  manifest: WorkspaceLayoutManifestV3,
  rawOperations: unknown,
) {
  const operations = parseWorkspaceLayoutAgentOperations(rawOperations);
  let next = cloneWorkspaceLayoutManifestV3(manifest);
  const results: WorkspaceLayoutAgentOperationResult[] = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    try {
      const before = JSON.stringify(next);
      const applied = applyOperation(next, operation);
      if (JSON.stringify(applied.manifest) === before) {
        throw new Error("The operation made no change. The target may be locked, protected, missing, or already configured.");
      }
      const validation = validateWorkspaceLayoutManifestV3(applied.manifest);
      if (!validation.ok) throw new Error(validation.errors.join(" "));
      next = validation.value;
      results.push({ createdIds: applied.createdIds, operationId: operation.operationId, type: operation.type });
    } catch (error) {
      throw new WorkspaceLayoutAgentOperationError(
        error instanceof Error ? error.message : "The layout operation failed.",
        operation.operationId,
        index,
      );
    }
  }
  return { manifest: next, operations: results };
}

function applyOperation(
  manifest: WorkspaceLayoutManifestV3,
  operation: WorkspaceLayoutAgentOperation,
): { createdIds: string[]; manifest: WorkspaceLayoutManifestV3 } {
  if (operation.type === "update_workspace") {
    return { createdIds: [], manifest: { ...manifest, settings: { ...manifest.settings, ...operation.patch } } };
  }
  if (operation.type === "update_tab") {
    return {
      createdIds: [],
      manifest: mapTab(manifest, operation.tabId, (tab) => {
        const settingsChanged = operation.patch.density !== undefined
          || operation.patch.notesPosition !== undefined;
        return {
          ...tab,
          settings: settingsChanged ? {
            ...tab.settings,
            ...(operation.patch.density === undefined ? {} : { density: operation.patch.density }),
            ...(operation.patch.notesPosition === undefined ? {} : { notesPosition: operation.patch.notesPosition }),
          } : tab.settings,
          visible: operation.patch.visible ?? tab.visible,
        };
      }),
    };
  }
  if (operation.type === "add_group") {
    const tab = findTab(manifest, operation.tabId);
    if (tab.groups.length >= WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB) throw new Error("This tab already has the maximum number of groups.");
    assertTabCapacity(manifest, operation.tabId, 1, 1);
    const block = createCustomBlock(operation.component ?? "rich-text", blockId(operation.component ?? "rich-text", operation.operationId), operation);
    const column: WorkspaceLayoutColumnV3 = {
      id: derivedId("column", operation.operationId),
      items: [block],
      span: { desktop: 12, mobile: 12, tablet: 12 },
    };
    const row: WorkspaceLayoutRowV3 = { columns: [column], gap: "medium", id: derivedId("row", operation.operationId) };
    const group: WorkspaceLayoutGroupV3 = {
      description: operation.description,
      heading: operation.heading,
      id: derivedId("group", operation.operationId),
      name: operation.name,
      presentation: operation.presentation ?? { spacing: "comfortable", surface: "plain" },
      rows: [row],
    };
    const createdIds = [group.id, row.id, column.id, block.id];
    assertIdsAvailable(manifest, createdIds);
    return {
      createdIds,
      manifest: mapTab(manifest, operation.tabId, (current) => ({ ...current, groups: [...current.groups, group] })),
    };
  }
  if (operation.type === "update_group") {
    const location = requireGroup(manifest, operation.groupId);
    if (location.group.locked && operation.patch.locked !== false) throw new Error("The group is locked.");
    return { createdIds: [], manifest: mapGroup(manifest, operation.groupId, (group) => ({
      ...group,
      ...withoutNulls(operation.patch, ["description", "heading"]),
      description: operation.patch.description === null ? undefined : operation.patch.description ?? group.description,
      heading: operation.patch.heading === null ? undefined : operation.patch.heading ?? group.heading,
      presentation: operation.patch.presentation ? { ...group.presentation, ...operation.patch.presentation } : group.presentation,
    })) };
  }
  if (operation.type === "move_group") {
    requireGroup(manifest, operation.groupId);
    return { createdIds: [], manifest: moveWorkspaceGroupV3(manifest, operation.tabId, operation.groupId, operation.destinationIndex) };
  }
  if (operation.type === "duplicate_group") return duplicateGroup(manifest, operation.groupId, operation.operationId);
  if (operation.type === "delete_group") return deleteGroup(manifest, operation.groupId);

  if (operation.type === "add_row") {
    const location = requireGroup(manifest, operation.groupId);
    assertUnlocked(location.group, "Group");
    assertTabCapacity(manifest, location.tabId, 1, 1);
    const row = createAgentRow(operation.operationId, operation.component ?? "rich-text", operation);
    assertIdsAvailable(manifest, collectRowIds(row));
    return {
      createdIds: collectRowIds(row),
      manifest: mapGroup(manifest, operation.groupId, (group) => ({ ...group, rows: [...group.rows, row] })),
    };
  }
  if (operation.type === "update_row") {
    const location = requireRow(manifest, operation.rowId);
    if (location.group.locked) throw new Error("The row's group is locked.");
    if (location.row.locked && operation.patch.locked !== false) throw new Error("The row is locked.");
    return { createdIds: [], manifest: mapRow(manifest, operation.rowId, (row) => ({ ...row, ...operation.patch })) };
  }
  if (operation.type === "move_row") {
    requireRow(manifest, operation.rowId);
    return { createdIds: [], manifest: moveWorkspaceRowV3(manifest, operation.rowId, operation.destinationGroupId, operation.destinationIndex) };
  }
  if (operation.type === "duplicate_row") return duplicateRow(manifest, operation.rowId, operation.operationId);
  if (operation.type === "delete_row") return deleteRow(manifest, operation.rowId);

  if (operation.type === "add_column") {
    const location = requireRow(manifest, operation.rowId);
    assertUnlocked(location.group, "Group");
    assertUnlocked(location.row, "Row");
    if (location.row.columns.length >= WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW) throw new Error("This row already has the maximum number of columns.");
    assertTabCapacity(manifest, location.tabId, 0, 1);
    const component = operation.component ?? "rich-text";
    const block = createCustomBlock(component, blockId(component, operation.operationId), operation);
    const width = location.row.columns.length === 1 ? 6 : location.row.columns.length === 2 ? 4 : 3;
    const column: WorkspaceLayoutColumnV3 = {
      id: derivedId("column", operation.operationId),
      items: [block],
      span: { desktop: width as WorkspaceLayoutDesktopSpanV2, mobile: 12, tablet: 12 },
    };
    const createdIds = [column.id, block.id];
    assertIdsAvailable(manifest, createdIds);
    return {
      createdIds,
      manifest: mapRow(manifest, operation.rowId, (row) => ({
        ...row,
        columns: [
          ...row.columns.map((existing) => ({
            ...existing,
            span: { ...existing.span, desktop: width as WorkspaceLayoutDesktopSpanV2 },
          })),
          column,
        ],
      })),
    };
  }
  if (operation.type === "update_column") {
    const location = requireColumn(manifest, operation.columnId);
    if (location.group.locked || location.row.locked) throw new Error("The column's parent is locked.");
    if (location.column.locked && operation.patch.locked !== false) {
      throw new Error("The column is locked.");
    }
    if (operation.patch.desktopSpan !== undefined && !isAllowedDesktopSpan(location.column, operation.patch.desktopSpan)) {
      throw new Error("That desktop span is not supported by every production component in this column.");
    }
    return { createdIds: [], manifest: mapColumn(manifest, operation.columnId, (column) => ({
      ...column,
      locked: operation.patch.locked ?? column.locked,
      span: {
        ...column.span,
        desktop: operation.patch.desktopSpan ?? column.span.desktop,
        tablet: operation.patch.tabletSpan ?? column.span.tablet,
      },
    })) };
  }
  if (operation.type === "move_column") {
    requireColumn(manifest, operation.columnId);
    return { createdIds: [], manifest: moveWorkspaceColumnV3(manifest, operation.columnId, operation.destinationRowId, operation.destinationIndex) };
  }
  if (operation.type === "duplicate_column") return duplicateColumn(manifest, operation.columnId, operation.operationId);
  if (operation.type === "delete_column") return deleteColumn(manifest, operation.columnId);

  if (operation.type === "add_block") {
    const location = requireColumn(manifest, operation.columnId);
    assertUnlocked(location.group, "Group");
    assertUnlocked(location.row, "Row");
    assertUnlocked(location.column, "Column");
    assertTabCapacity(manifest, location.tabId, 0, 1);
    const id = blockId(operation.component, operation.operationId);
    assertIdsAvailable(manifest, [id]);
    const block = createCustomBlock(operation.component, id, operation);
    return {
      createdIds: [id],
      manifest: mapColumn(manifest, operation.columnId, (column) => ({ ...column, items: [...column.items, block] })),
    };
  }
  if (operation.type === "update_block") return updateBlock(manifest, operation.nodeId, operation.patch);
  if (operation.type === "move_block") {
    requireNode(manifest, operation.nodeId);
    return { createdIds: [], manifest: moveWorkspaceNodeV3(manifest, operation.nodeId, operation.destinationColumnId, operation.destinationIndex) };
  }
  if (operation.type === "duplicate_block") return duplicateBlock(manifest, operation.nodeId, operation.operationId);
  return deleteBlock(manifest, operation.nodeId);
}

type InitialBlockInput = {
  body?: string;
  items?: WorkspaceCustomItemV2[];
  title?: string;
  video?: z.infer<typeof videoSchema>;
};

function createCustomBlock(
  component: WorkspaceCustomBlockKindV2,
  id: string,
  input: InitialBlockInput,
): WorkspaceCustomNodeV3 {
  if (input.video !== undefined && component !== "video") {
    throw new Error("Video configuration is only valid for video blocks.");
  }
  if (input.items !== undefined && !["metric-strip", "link-list", "button-group", "accordion"].includes(component)) {
    throw new Error("Items are only valid for metric, link, button, and accordion blocks.");
  }
  if (input.body !== undefined && !["narrative", "callout", "rich-text"].includes(component)) {
    throw new Error("Body text is only valid for narrative, callout, and rich-text blocks.");
  }
  const node = createWorkspaceCustomNodeV2(component, id) as WorkspaceCustomNodeV3;
  if (input.title !== undefined) node.title = input.title;
  if (input.body !== undefined) {
    if (component === "rich-text") node.document = richTextDocumentFromPlainText(input.body);
    else node.body = input.body;
  }
  if (input.items !== undefined) node.items = input.items;
  if (input.video !== undefined) node.video = input.video;
  node.presentation = { ...node.presentation, height: "auto" };
  return node;
}

function createAgentRow(
  operationId: string,
  component: WorkspaceCustomBlockKindV2,
  input: InitialBlockInput,
): WorkspaceLayoutRowV3 {
  const block = createCustomBlock(component, blockId(component, operationId), input);
  return {
    columns: [{
      id: derivedId("column", operationId),
      items: [block],
      span: { desktop: 12, mobile: 12, tablet: 12 },
    }],
    gap: "medium",
    id: derivedId("row", operationId),
  };
}

function updateBlock(
  manifest: WorkspaceLayoutManifestV3,
  nodeId: string,
  patch: z.infer<typeof blockPatchSchema>,
) {
  const location = requireNode(manifest, nodeId);
  const protectedNode = isRequiredProductionNode(location.node);
  if (location.group.locked || location.row.locked || location.column.locked) throw new Error("The component container is locked.");
  if (location.node.locked && patch.locked !== false) throw new Error("The component is locked.");
  if (protectedNode && (patch.visible === false || patch.locked === false || patch.visibility !== undefined)) {
    throw new Error("Required production components cannot be hidden, unlocked, or conditionally displayed.");
  }
  if (location.node.kind === "production" && (
    patch.title !== undefined || patch.body !== undefined || patch.items !== undefined
    || patch.richText !== undefined || patch.video !== undefined
  )) throw new Error("Production component content is code-owned and cannot be edited by the layout agent.");
  if (location.node.kind === "custom" && patch.config !== undefined) {
    throw new Error("Production configuration is only valid for production components.");
  }
  if (location.node.kind === "custom") {
    if (patch.body !== undefined && !["narrative", "callout", "rich-text"].includes(location.node.component)) {
      throw new Error("Body text is only valid for narrative, callout, and rich-text blocks.");
    }
    if (patch.video !== undefined && location.node.component !== "video") {
      throw new Error("Video configuration is only valid for video blocks.");
    }
    if (patch.richText !== undefined && location.node.component !== "rich-text") {
      throw new Error("richText is only valid for rich-text blocks.");
    }
    if (patch.items !== undefined && !["metric-strip", "link-list", "button-group", "accordion"].includes(location.node.component)) {
      throw new Error("Items are only valid for metric, link, button, and accordion blocks.");
    }
  }
  if (location.node.kind === "production" && patch.config !== undefined) {
    assertProductionConfigSupported(location.node, patch.config);
  }

  const manifestNext = mapNode(manifest, nodeId, (current) => {
    const next = { ...current } as WorkspaceLayoutNodeV3;
    if (patch.visible !== undefined) next.visible = patch.visible;
    if (patch.locked !== undefined) next.locked = protectedNode ? true : patch.locked;
    if (patch.presentation) next.presentation = { ...next.presentation, ...patch.presentation };
    if (patch.visibility !== undefined) next.visibility = patch.visibility ?? undefined;
    if (next.kind === "production") {
      if (patch.config) next.config = { ...next.config, ...patch.config };
      return next;
    }
    if (patch.title !== undefined) next.title = patch.title ?? undefined;
    if (patch.body !== undefined) {
      if (next.component === "rich-text") {
        next.document = patch.body === null ? undefined : richTextDocumentFromPlainText(patch.body);
        next.body = undefined;
      } else next.body = patch.body ?? undefined;
    }
    if (patch.items !== undefined) next.items = patch.items ?? undefined;
    if (patch.video !== undefined) next.video = patch.video ?? undefined;
    if (patch.richText !== undefined) {
      next.document = patch.richText === null ? undefined : richTextDocumentFromPlainText(patch.richText);
      next.body = undefined;
    }
    return next;
  });
  return { createdIds: [], manifest: manifestNext };
}

function duplicateBlock(manifest: WorkspaceLayoutManifestV3, nodeId: string, operationId: string) {
  const location = requireNode(manifest, nodeId);
  if (location.node.kind !== "custom") throw new Error("Only custom content blocks can be duplicated.");
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  assertUnlocked(location.column, "Column");
  assertUnlocked(location.node, "Component");
  assertTabCapacity(manifest, location.tabId, 0, 1);
  const copy = structuredClone(location.node);
  copy.id = blockId(copy.component, operationId);
  assertIdsAvailable(manifest, [copy.id]);
  const index = location.column.items.findIndex((node) => node.id === nodeId);
  return {
    createdIds: [copy.id],
    manifest: mapColumn(manifest, location.column.id, (column) => ({
      ...column,
      items: insertAt(column.items, index + 1, copy),
    })),
  };
}

function deleteBlock(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  const location = requireNode(manifest, nodeId);
  if (location.node.kind !== "custom") throw new Error("Production components cannot be deleted.");
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  assertUnlocked(location.column, "Column");
  assertUnlocked(location.node, "Component");
  return { createdIds: [], manifest: removeWorkspaceNodeV3(manifest, nodeId) };
}

function duplicateColumn(manifest: WorkspaceLayoutManifestV3, columnId: string, operationId: string) {
  const location = requireColumn(manifest, columnId);
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  assertUnlocked(location.column, "Column");
  if (!columnIsCustomOnly(location.column)) throw new Error("Only custom-only columns can be duplicated.");
  if (location.row.columns.length >= WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW) throw new Error("This row already has the maximum number of columns.");
  assertTabCapacity(manifest, location.tabId, 0, location.column.items.length);
  const copy = cloneColumnWithAgentIds(location.column, operationId);
  const ids = collectColumnIds(copy);
  assertIdsAvailable(manifest, ids);
  const index = location.row.columns.findIndex((column) => column.id === columnId);
  return {
    createdIds: ids,
    manifest: mapRow(manifest, location.row.id, (row) => ({ ...row, columns: insertAt(row.columns, index + 1, copy) })),
  };
}

function deleteColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  const location = requireColumn(manifest, columnId);
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  assertUnlocked(location.column, "Column");
  if (!columnIsCustomOnly(location.column)) throw new Error("Only custom-only columns can be deleted.");
  if (location.row.columns.length <= 1) throw new Error("Delete the custom row instead of leaving it without columns.");
  return {
    createdIds: [],
    manifest: mapRow(manifest, location.row.id, (row) => ({
      ...row,
      columns: row.columns.filter((column) => column.id !== columnId),
    })),
  };
}

function duplicateRow(manifest: WorkspaceLayoutManifestV3, rowId: string, operationId: string) {
  const location = requireRow(manifest, rowId);
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  if (!rowIsCustomOnly(location.row)) throw new Error("Only custom-only rows can be duplicated.");
  const blockCount = location.row.columns.reduce((total, column) => total + column.items.length, 0);
  assertTabCapacity(manifest, location.tabId, 1, blockCount);
  const copy = cloneRowWithAgentIds(location.row, operationId);
  const ids = collectRowIds(copy);
  assertIdsAvailable(manifest, ids);
  const index = location.group.rows.findIndex((row) => row.id === rowId);
  return {
    createdIds: ids,
    manifest: mapGroup(manifest, location.group.id, (group) => ({ ...group, rows: insertAt(group.rows, index + 1, copy) })),
  };
}

function deleteRow(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  const location = requireRow(manifest, rowId);
  assertUnlocked(location.group, "Group");
  assertUnlocked(location.row, "Row");
  if (!rowIsCustomOnly(location.row)) throw new Error("Only custom-only rows can be deleted.");
  if (location.group.rows.length <= 1) throw new Error("Delete the custom group instead of leaving it without rows.");
  return {
    createdIds: [],
    manifest: mapGroup(manifest, location.group.id, (group) => ({
      ...group,
      rows: group.rows.filter((row) => row.id !== rowId),
    })),
  };
}

function duplicateGroup(manifest: WorkspaceLayoutManifestV3, groupId: string, operationId: string) {
  const location = requireGroup(manifest, groupId);
  assertUnlocked(location.group, "Group");
  if (!groupIsCustomOnly(location.group)) throw new Error("Only custom-only groups can be duplicated.");
  const tab = findTab(manifest, location.tabId);
  if (tab.groups.length >= WORKSPACE_LAYOUT_MAX_GROUPS_PER_TAB) throw new Error("This tab already has the maximum number of groups.");
  const blockCount = location.group.rows.flatMap((row) => row.columns).reduce((total, column) => total + column.items.length, 0);
  assertTabCapacity(manifest, location.tabId, location.group.rows.length, blockCount);
  const copy = cloneGroupWithAgentIds(location.group, operationId);
  copy.name = `${location.group.name} copy`.slice(0, 80);
  const ids = collectGroupIds(copy);
  assertIdsAvailable(manifest, ids);
  const index = tab.groups.findIndex((group) => group.id === groupId);
  return {
    createdIds: ids,
    manifest: mapTab(manifest, location.tabId, (current) => ({ ...current, groups: insertAt(current.groups, index + 1, copy) })),
  };
}

function deleteGroup(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  const location = requireGroup(manifest, groupId);
  assertUnlocked(location.group, "Group");
  if (!groupIsCustomOnly(location.group)) throw new Error("Only custom-only groups can be deleted.");
  const tab = findTab(manifest, location.tabId);
  if (tab.groups.length <= 1) throw new Error("A visible tab must retain at least one group.");
  return {
    createdIds: [],
    manifest: mapTab(manifest, location.tabId, (current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    })),
  };
}

function cloneColumnWithAgentIds(column: WorkspaceLayoutColumnV3, operationId: string, suffix = "") {
  const copy = structuredClone(column);
  copy.id = derivedId("column", `${operationId}${suffix}`);
  copy.items = copy.items.map((node, nodeIndex) => ({
    ...node,
    id: blockId(node.component as WorkspaceCustomBlockKindV2, `${operationId}${suffix}-${nodeIndex + 1}`),
  }));
  return copy;
}

function cloneRowWithAgentIds(row: WorkspaceLayoutRowV3, operationId: string, suffix = "") {
  const copy = structuredClone(row);
  copy.id = derivedId("row", `${operationId}${suffix}`);
  copy.columns = copy.columns.map((column, columnIndex) => cloneColumnWithAgentIds(
    column,
    operationId,
    `${suffix}-${columnIndex + 1}`,
  ));
  return copy;
}

function cloneGroupWithAgentIds(group: WorkspaceLayoutGroupV3, operationId: string) {
  const copy = structuredClone(group);
  copy.id = derivedId("group", operationId);
  copy.rows = copy.rows.map((row, rowIndex) => cloneRowWithAgentIds(row, operationId, `-${rowIndex + 1}`));
  return copy;
}

function assertTabCapacity(manifest: WorkspaceLayoutManifestV3, tabId: WorkspaceTabId, rows: number, blocks: number) {
  const tab = findTab(manifest, tabId);
  const currentRows = tab.groups.reduce((total, group) => total + group.rows.length, 0);
  const currentBlocks = flattenWorkspaceNodesV3(tab).filter((node) => node.kind === "custom").length;
  if (currentRows + rows > WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB) throw new Error("This tab would exceed the maximum row count.");
  if (currentBlocks + blocks > WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) {
    throw new Error("This tab would exceed the maximum custom content block count.");
  }
}

function assertIdsAvailable(manifest: WorkspaceLayoutManifestV3, ids: string[]) {
  const existing = collectManifestIds(manifest);
  const seen = new Set<string>();
  for (const id of ids) {
    if (existing.has(id) || seen.has(id)) throw new Error(`Generated ID ${id} already exists. Use a different operationId.`);
    seen.add(id);
  }
}

function collectManifestIds(manifest: WorkspaceLayoutManifestV3) {
  return new Set(manifest.tabs.flatMap((tab) => tab.groups.flatMap((group) => [
    group.id,
    ...group.rows.flatMap((row) => [
      row.id,
      ...row.columns.flatMap((column) => [column.id, ...column.items.map((node) => node.id)]),
    ]),
  ])));
}

function collectColumnIds(column: WorkspaceLayoutColumnV3) {
  return [column.id, ...column.items.map((node) => node.id)];
}

function collectRowIds(row: WorkspaceLayoutRowV3) {
  return [row.id, ...row.columns.flatMap(collectColumnIds)];
}

function collectGroupIds(group: WorkspaceLayoutGroupV3) {
  return [group.id, ...group.rows.flatMap(collectRowIds)];
}

function derivedId(prefix: string, operationId: string) {
  return `${prefix}-agent-${operationId}`.slice(0, 96).replace(/-+$/g, "");
}

function blockId(component: WorkspaceCustomBlockKindV2, operationId: string) {
  return derivedId(`custom-${component}`, operationId);
}

function findTab(manifest: WorkspaceLayoutManifestV3, tabId: WorkspaceTabId) {
  const tab = manifest.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) throw new Error(`Tab ${tabId} was not found.`);
  return tab;
}

function requireGroup(manifest: WorkspaceLayoutManifestV3, groupId: string) {
  for (const tab of manifest.tabs) {
    const group = tab.groups.find((candidate) => candidate.id === groupId);
    if (group) return { group, tabId: tab.id };
  }
  throw new Error(`Group ${groupId} was not found.`);
}

function requireRow(manifest: WorkspaceLayoutManifestV3, rowId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      const row = group.rows.find((candidate) => candidate.id === rowId);
      if (row) return { group, row, tabId: tab.id };
    }
  }
  throw new Error(`Row ${rowId} was not found.`);
}

function requireColumn(manifest: WorkspaceLayoutManifestV3, columnId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const column = row.columns.find((candidate) => candidate.id === columnId);
        if (column) return { column, group, row, tabId: tab.id };
      }
    }
  }
  throw new Error(`Column ${columnId} was not found.`);
}

function requireNode(manifest: WorkspaceLayoutManifestV3, nodeId: string) {
  for (const tab of manifest.tabs) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        for (const column of row.columns) {
          const node = column.items.find((candidate) => candidate.id === nodeId);
          if (node) return { column, group, node, row, tabId: tab.id };
        }
      }
    }
  }
  throw new Error(`Component ${nodeId} was not found.`);
}

function mapTab(
  manifest: WorkspaceLayoutManifestV3,
  tabId: WorkspaceTabId,
  mapper: (tab: WorkspaceLayoutManifestV3["tabs"][number]) => WorkspaceLayoutManifestV3["tabs"][number],
) {
  return { ...manifest, tabs: manifest.tabs.map((tab) => tab.id === tabId ? mapper(tab) : tab) };
}

function mapGroup(
  manifest: WorkspaceLayoutManifestV3,
  groupId: string,
  mapper: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3,
) {
  return {
    ...manifest,
    tabs: manifest.tabs.map((tab) => ({
      ...tab,
      groups: tab.groups.map((group) => group.id === groupId ? mapper(group) : group),
    })),
  };
}

function mapRow(
  manifest: WorkspaceLayoutManifestV3,
  rowId: string,
  mapper: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3,
) {
  return mapGroups(manifest, (group) => ({
    ...group,
    rows: group.rows.map((row) => row.id === rowId ? mapper(row) : row),
  }));
}

function mapColumn(
  manifest: WorkspaceLayoutManifestV3,
  columnId: string,
  mapper: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3,
) {
  return mapRows(manifest, (row) => ({
    ...row,
    columns: row.columns.map((column) => column.id === columnId ? mapper(column) : column),
  }));
}

function mapNode(
  manifest: WorkspaceLayoutManifestV3,
  nodeId: string,
  mapper: (node: WorkspaceLayoutNodeV3) => WorkspaceLayoutNodeV3,
) {
  return mapColumns(manifest, (column) => ({
    ...column,
    items: column.items.map((node) => node.id === nodeId ? mapper(node) : node),
  }));
}

function mapGroups(manifest: WorkspaceLayoutManifestV3, mapper: (group: WorkspaceLayoutGroupV3) => WorkspaceLayoutGroupV3) {
  return { ...manifest, tabs: manifest.tabs.map((tab) => ({ ...tab, groups: tab.groups.map(mapper) })) };
}

function mapRows(manifest: WorkspaceLayoutManifestV3, mapper: (row: WorkspaceLayoutRowV3) => WorkspaceLayoutRowV3) {
  return mapGroups(manifest, (group) => ({ ...group, rows: group.rows.map(mapper) }));
}

function mapColumns(manifest: WorkspaceLayoutManifestV3, mapper: (column: WorkspaceLayoutColumnV3) => WorkspaceLayoutColumnV3) {
  return mapRows(manifest, (row) => ({ ...row, columns: row.columns.map(mapper) }));
}

function assertUnlocked(value: { locked?: boolean }, label: string) {
  if (value.locked) throw new Error(`${label} is locked.`);
}

function rowIsCustomOnly(row: WorkspaceLayoutRowV3) {
  return row.columns.every(columnIsCustomOnly);
}

function columnIsCustomOnly(column: WorkspaceLayoutColumnV3) {
  return column.items.every((node) => node.kind === "custom");
}

function isAllowedDesktopSpan(column: WorkspaceLayoutColumnV3, span: WorkspaceLayoutDesktopSpanV2) {
  return column.items.filter((node) => node.kind === "production").every((node) => {
    let allowed: readonly number[] | undefined;
    for (const tab of workspaceLayoutRegistryV2) {
      for (const component of tab.components) {
        if (component.id === node.component) allowed = component.allowedDesktopSpans;
      }
    }
    return !allowed || allowed.includes(span);
  });
}



function groupIsCustomOnly(group: WorkspaceLayoutGroupV3) {
  return group.rows.every(rowIsCustomOnly);
}

function assertProductionConfigSupported(
  node: Extract<WorkspaceLayoutNodeV3, { kind: "production" }>,
  config: Record<string, unknown>,
) {
  const allowed = productionConfigKeysByComponent[node.component] ?? [];
  const unsupported = Object.keys(config).filter((key) => !allowed.includes(key));
  if (unsupported.length) {
    throw new Error(`${node.component} does not support configuration: ${unsupported.join(", ")}.`);
  }
}

function isRequiredProductionNode(node: WorkspaceLayoutNodeV3) {
  return node.kind === "production" && workspaceLayoutRegistryV2.some(
    (tab) => tab.components.some((component) => component.id === node.component && component.required),
  );
}

function insertAt<T>(items: T[], index: number, value: T) {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

function withoutNulls<T extends Record<string, unknown>>(value: T, keys: (keyof T)[]) {
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => !keys.includes(key as keyof T) && entry !== null));
}
