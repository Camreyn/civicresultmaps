import { z } from "zod";
import {
  defaultWorkspaceLayoutSettings,
  workspaceLayoutRegistry,
  type WorkspaceCustomBlockKind,
  type WorkspaceLayoutEmphasis,
  type WorkspaceLayoutManifestV1,
  type WorkspaceLayoutSurface,
  type WorkspaceSectionId,
  type WorkspaceTabId,
} from "./workspace-layout.ts";

export const WORKSPACE_LAYOUT_SCHEMA_VERSION_V2 = 2 as const;
export const WORKSPACE_LAYOUT_REGISTRY_VERSION_V2 = 2 as const;
export const WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB = 20;
export const WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW = 4;
export const workspaceVisibilityDataKeys = [
  "equipment",
  "historical",
  "indicators",
  "results",
  "review",
  "sources",
  "turnout",
] as const;

export const workspaceVisibilityCapabilityKeys = [
  "certifiedResults",
  "historicalBaseline",
  "map",
  "reviewGraphs",
  "sourcePlanner",
  "turnout",
] as const;

export const WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB = 12;

export type WorkspaceProductionComponentIdV2 =
  | Exclude<
    WorkspaceSectionId,
    "overview" | "evidence-tools" | "screening" | "indicators" | "methodology"
  >
  | "review-center";

export type WorkspaceCustomBlockKindV2 =
  | WorkspaceCustomBlockKind
  | "heading"
  | "rich-text"
  | "button-group"
  | "image"
  | "video"
  | "accordion";

export type WorkspaceLayoutDesktopSpanV2 = 3 | 4 | 6 | 8 | 9 | 12;
export type WorkspaceLayoutTabletSpanV2 = 6 | 12;
export type WorkspaceRichTextMarkV1 = "bold" | "italic" | "code";

export type WorkspaceRichTextInlineV1 = {
  href?: string;
  marks?: WorkspaceRichTextMarkV1[];
  text: string;
  type: "text";
};

export type WorkspaceRichTextBlockV1 = {
  children: WorkspaceRichTextInlineV1[];
  level?: 2 | 3;
  ordered?: boolean;
  type: "paragraph" | "heading" | "list-item";
};

export type WorkspaceRichTextDocumentV1 = {
  blocks: WorkspaceRichTextBlockV1[];
  version: 1;
};

export type WorkspaceVisibilityFactV1 = "state" | "year" | "capability" | "data" | "validation";

export type WorkspaceVisibilityConditionV1 = {
  fact: WorkspaceVisibilityFactV1;
  key?: string;
  operator: "equals" | "not-equals" | "in" | "available" | "unavailable";
  value?: boolean | number | string | string[];
};

export type WorkspaceVisibilityGroupV1 = {
  conditions: WorkspaceVisibilityConditionV1[];
  operator: "all" | "any";
};

export type WorkspaceVisibilityV1 = {
  groups?: WorkspaceVisibilityGroupV1[];
  operator?: "all" | "any";
  viewports?: { desktop?: boolean; mobile?: boolean; tablet?: boolean };
};

export type WorkspaceNodePresentationV2 = {
  density?: "compact" | "comfortable" | "spacious";
  emphasis?: WorkspaceLayoutEmphasis;
  surface?: WorkspaceLayoutSurface;
};

export type WorkspaceProductionConfigV2 = {
  coverageVariant?: "list" | "cards" | "compact";
  defaultView?: string;
  legendPosition?: "inline" | "below";
  mapComposition?: "map-first" | "table-first" | "split";
  navigationStyle?: "tabs" | "pills" | "sidebar";
  provenanceInitialState?: "collapsed" | "expanded";
  provenanceVariant?: "summary" | "expanded" | "accordion";
  snapshotVariant?: "bars" | "metrics" | "table";
  viewOrder?: string[];
  visibleViews?: string[];
};

export type WorkspaceProductionNodeV2 = {
  component: WorkspaceProductionComponentIdV2;
  config?: WorkspaceProductionConfigV2;
  id: string;
  kind: "production";
  presentation?: WorkspaceNodePresentationV2;
  visibility?: WorkspaceVisibilityV1;
  visible: boolean;
};

export type WorkspaceCustomItemV2 = {
  body?: string;
  href?: string;
  label: string;
  value?: string;
};

export type WorkspaceCustomNodeV2 = {
  asset?: {
    alt: string;
    assetId: string;
    caption?: string;
    decorative?: boolean;
    height: number;
    url: string;
    width: number;
  };
  body?: string;
  component: WorkspaceCustomBlockKindV2;
  document?: WorkspaceRichTextDocumentV1;
  id: string;
  items?: WorkspaceCustomItemV2[];
  kind: "custom";
  presentation?: WorkspaceNodePresentationV2;
  title?: string;
  video?: { id: string; provider: "youtube" | "vimeo"; title: string };
  visibility?: WorkspaceVisibilityV1;
  visible: boolean;
};

export type WorkspaceLayoutNodeV2 = WorkspaceProductionNodeV2 | WorkspaceCustomNodeV2;

export type WorkspaceLayoutColumnV2 = {
  id: string;
  items: WorkspaceLayoutNodeV2[];
  span: { desktop: WorkspaceLayoutDesktopSpanV2; mobile: 12; tablet: WorkspaceLayoutTabletSpanV2 };
};

export type WorkspaceLayoutRowV2 = {
  align?: "start" | "center" | "stretch";
  columns: WorkspaceLayoutColumnV2[];
  gap?: "small" | "medium" | "large";
  id: string;
};

export type WorkspaceLayoutTabV2 = {
  id: WorkspaceTabId;
  rows: WorkspaceLayoutRowV2[];
  settings?: {
    density?: "compact" | "comfortable" | "spacious";
    notesPosition?: "side" | "below" | "drawer";
  };
  visible: boolean;
};

export type WorkspaceLayoutManifestV2 = {
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION_V2;
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION_V2;
  settings: {
    accentColor?: string;
    contentWidth: "standard" | "wide" | "full";
    defaultTab: WorkspaceTabId;
    notesDefault: "collapsed" | "expanded";
    radius: "square" | "subtle" | "rounded";
    shadow: "none" | "subtle" | "raised";
    spacingScale: "tight" | "standard" | "relaxed";
    tabStyle: "bar" | "pills";
    theme: "civic" | "high-contrast" | "warm";
    typeScale: "small" | "standard" | "large";
  };
  tabs: WorkspaceLayoutTabV2[];
};

export type WorkspaceLayoutManifest = WorkspaceLayoutManifestV1 | WorkspaceLayoutManifestV2;

export type WorkspaceLayoutEnvelopeV2 = {
  manifest: WorkspaceLayoutManifestV2;
  manifestDigest: string;
  publishedAt: string;
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION_V2;
  revisionId: string;
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION_V2;
};

export type WorkspaceLayoutEnvelope = import("./workspace-layout.ts").WorkspaceLayoutEnvelopeV1 | WorkspaceLayoutEnvelopeV2;

export type WorkspaceVisibilityContext = {
  capabilities?: Record<string, boolean | undefined>;
  data?: Record<string, boolean | undefined>;
  state: string;
  validation?: "passed" | "warning" | "failed" | "unknown";
  year: number;
};

export type WorkspaceLayoutV2ValidationResult =
  | { ok: true; value: WorkspaceLayoutManifestV2 }
  | { errors: string[]; ok: false };

const tabIds = workspaceLayoutRegistry.map((tab) => tab.id) as [WorkspaceTabId, ...WorkspaceTabId[]];
const desktopSpans = [3, 4, 6, 8, 9, 12] as const;
const tabletSpans = [6, 12] as const;
export const workspaceReviewViewIdsV2 = ["overview", "evidence-tools", "indicators", "screening", "methodology"] as const;
const idSchema = z.string().regex(/^[a-z][a-z0-9-]{2,95}$/);
const safeHrefSchema = z.string().max(240).refine(isSafeWorkspaceHrefV2, "Link must use /, https://, or mailto:.");

const richTextInlineSchema = z.object({
  href: safeHrefSchema.optional(),
  marks: z.array(z.enum(["bold", "italic", "code"])).max(3).optional(),
  text: z.string().max(1000),
  type: z.literal("text"),
}).strict();

const richTextBlockSchema = z.object({
  children: z.array(richTextInlineSchema).min(1).max(40),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
  ordered: z.boolean().optional(),
  type: z.enum(["paragraph", "heading", "list-item"]),
}).strict();

const richTextDocumentSchema = z.object({
  blocks: z.array(richTextBlockSchema).min(1).max(100),
  version: z.literal(1),
}).strict().superRefine((document, context) => {
  const plainTextLength = document.blocks.reduce(
    (total, block) => total + block.children.reduce((sum, child) => sum + child.text.length, 0),
    0,
  );
  if (plainTextLength > 10_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rich text may contain at most 10,000 characters." });
  }
});

const visibilityConditionSchema = z.object({
  fact: z.enum(["state", "year", "capability", "data", "validation"]),
  key: z.string().max(60).optional(),
  operator: z.enum(["equals", "not-equals", "in", "available", "unavailable"]),
  value: z.union([z.boolean(), z.number(), z.string().max(120), z.array(z.string().max(120)).max(20)]).optional(),
}).strict().superRefine((condition, context) => {
  if (["capability", "data"].includes(condition.fact) && !condition.key?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${condition.fact} visibility rules require an allowlisted key.`,
      path: ["key"],
    });
  }
  if (condition.fact === "data" && condition.key
    && !(workspaceVisibilityDataKeys as readonly string[]).includes(condition.key)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported data visibility key: ${condition.key}.`,
      path: ["key"],
    });
  }
  if (condition.fact === "capability" && condition.key
    && !(workspaceVisibilityCapabilityKeys as readonly string[]).includes(condition.key)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported capability visibility key: ${condition.key}.`,
      path: ["key"],
    });
  }
  if (!["available", "unavailable"].includes(condition.operator)) {
    const emptyArray = Array.isArray(condition.value) && condition.value.length === 0;
    if (condition.value === undefined || condition.value === "" || emptyArray) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${condition.operator} visibility rules require a value.`,
        path: ["value"],
      });
    }

  }
});
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
}).strict().superRefine((visibility, context) => {
  const count = visibility.groups?.reduce((total, group) => total + group.conditions.length, 0) ?? 0;
  if (count > 8) context.addIssue({ code: z.ZodIssueCode.custom, message: "Visibility may use at most eight conditions." });
});

const presentationSchema = z.object({
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  emphasis: z.enum(["quiet", "standard", "prominent"]).optional(),
  surface: z.enum(["plain", "panel", "muted", "accent"]).optional(),
}).strict().optional();

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

const productionNodeSchema = z.object({
  component: z.string().min(1),
  config: productionConfigSchema.optional(),
  id: idSchema,
  kind: z.literal("production"),
  presentation: presentationSchema,
  visibility: visibilitySchema.optional(),
  visible: z.boolean(),
}).strict();

const customItemSchema = z.object({
  body: z.string().max(600).optional(),
  href: safeHrefSchema.optional(),
  label: z.string().trim().min(1).max(80),
  value: z.string().max(80).optional(),
}).strict();

const customNodeSchema = z.object({
  asset: z.object({
    alt: z.string().max(240),
    assetId: z.string().uuid(),
    caption: z.string().max(300).optional(),
    decorative: z.boolean().optional(),
    height: z.number().int().positive().max(20_000),
    url: z.string().url().refine(isSafeWorkspaceBlobUrl, "Image must use a Vercel Blob layout-media path."),
    width: z.number().int().positive().max(20_000),
  }).strict().optional(),
  body: z.string().max(2_000).optional(),
  component: z.enum([
    "narrative", "callout", "metric-strip", "link-list", "divider", "heading", "rich-text",
    "button-group", "image", "video", "accordion",
  ]),
  document: richTextDocumentSchema.optional(),
  id: idSchema,
  items: z.array(customItemSchema).max(12).optional(),
  kind: z.literal("custom"),
  presentation: presentationSchema,
  title: z.string().max(100).optional(),
  video: z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{5,32}$/),
    provider: z.enum(["youtube", "vimeo"]),
    title: z.string().trim().min(1).max(160),
  }).strict().optional(),
  visibility: visibilitySchema.optional(),
  visible: z.boolean(),
}).strict().superRefine((node, context) => {
  if (node.component === "rich-text" && !node.document) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rich text blocks require a document." });
  }
  if (node.component === "image" && !node.asset) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Image blocks require a managed asset." });
  }
  if (node.component === "image" && node.asset && !node.asset.decorative && !node.asset.alt.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Non-decorative images require alt text." });
  }
  if (node.component === "video" && !node.video) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Video blocks require an approved provider video." });
  }
});

const columnSchema = z.object({
  id: idSchema,
  items: z.array(z.union([productionNodeSchema, customNodeSchema])).min(1).max(20),
  span: z.object({
    desktop: z.number().refine((value) => desktopSpans.includes(value as WorkspaceLayoutDesktopSpanV2)),
    mobile: z.literal(12),
    tablet: z.number().refine((value) => tabletSpans.includes(value as WorkspaceLayoutTabletSpanV2)),
  }).strict(),
}).strict();

const rowSchema = z.object({
  align: z.enum(["start", "center", "stretch"]).optional(),
  columns: z.array(columnSchema).min(1).max(WORKSPACE_LAYOUT_MAX_COLUMNS_PER_ROW),
  gap: z.enum(["small", "medium", "large"]).optional(),
  id: idSchema,
}).strict();

const manifestSchema = z.object({
  registryVersion: z.literal(WORKSPACE_LAYOUT_REGISTRY_VERSION_V2),
  schemaVersion: z.literal(WORKSPACE_LAYOUT_SCHEMA_VERSION_V2),
  settings: z.object({
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    contentWidth: z.enum(["standard", "wide", "full"]),
    defaultTab: z.enum(tabIds),
    notesDefault: z.enum(["collapsed", "expanded"]),
    radius: z.enum(["square", "subtle", "rounded"]),
    shadow: z.enum(["none", "subtle", "raised"]),
    spacingScale: z.enum(["tight", "standard", "relaxed"]),
    tabStyle: z.enum(["bar", "pills"]),
    theme: z.enum(["civic", "high-contrast", "warm"]),
    typeScale: z.enum(["small", "standard", "large"]),
  }).strict(),
  tabs: z.array(z.object({
    id: z.enum(tabIds),
    rows: z.array(rowSchema).min(1).max(WORKSPACE_LAYOUT_MAX_ROWS_PER_TAB),
    settings: z.object({
      density: z.enum(["compact", "comfortable", "spacious"]).optional(),
      notesPosition: z.enum(["side", "below", "drawer"]).optional(),
    }).strict().optional(),
    visible: z.boolean(),
  }).strict()).length(workspaceLayoutRegistry.length),
}).strict();

export const workspaceLayoutRegistryV2 = workspaceLayoutRegistry.map((tab) => ({
  id: tab.id,
  label: tab.label,
  required: "required" in tab && tab.required === true,
  components: tab.id === "review"
    ? [{
      allowedDesktopSpans: [8, 9, 12] as const,
      id: "review-center" as const,
      label: "Review Center",
      required: true,
    }]
    : tab.sections.map((section) => ({
      allowedDesktopSpans: allowedSpansForComponent(section.id),
      id: section.id as WorkspaceProductionComponentIdV2,
      label: section.label,
      required: "required" in section && section.required === true,
    })),
}));

export const defaultWorkspaceLayoutSettingsV2: WorkspaceLayoutManifestV2["settings"] = {
  ...defaultWorkspaceLayoutSettings,
  radius: "subtle",
  shadow: "subtle",
  spacingScale: "standard",
  typeScale: "standard",
};

export const embeddedWorkspaceLayoutManifestV2: WorkspaceLayoutManifestV2 = {
  registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION_V2,
  schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION_V2,
  settings: defaultWorkspaceLayoutSettingsV2,
  tabs: workspaceLayoutRegistryV2.map((tab) => defaultTabLayout(tab.id)),
};

export const workspaceStarterTemplates = [
  {
    description: "The current production hierarchy with a prominent map and supporting context.",
    id: "balanced",
    label: "Balanced",
    manifest: embeddedWorkspaceLayoutManifestV2,
  },
  {
    description: "A full-width result explorer followed by a three-card context row.",
    id: "map-first",
    label: "Map first",
    manifest: createMapFirstTemplate(),
  },
  {
    description: "Moves provenance and coverage ahead of the explorer for source-led review.",
    id: "research",
    label: "Research",
    manifest: createResearchTemplate(),
  },
] as const;

export function validateWorkspaceLayoutManifestV2(value: unknown): WorkspaceLayoutV2ValidationResult {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => `${formatZodPath(issue.path)}${issue.message}`),
      ok: false,
    };
  }
  const manifest = parsed.data as WorkspaceLayoutManifestV2;
  const errors = inspectStructuralRules(manifest);
  return errors.length ? { errors, ok: false } : { ok: true, value: manifest };
}

export function toWorkspaceLayoutManifestV2(manifest: WorkspaceLayoutManifest): WorkspaceLayoutManifestV2 {
  return manifest.schemaVersion === WORKSPACE_LAYOUT_SCHEMA_VERSION_V2
    ? structuredClone(manifest)
    : upgradeWorkspaceLayoutManifestV1(manifest);
}

export function upgradeWorkspaceLayoutManifestV1(manifest: WorkspaceLayoutManifestV1): WorkspaceLayoutManifestV2 {
  const upgraded = structuredClone(embeddedWorkspaceLayoutManifestV2);
  upgraded.settings = { ...defaultWorkspaceLayoutSettingsV2, ...manifest.settings };
  upgraded.tabs = manifest.tabs.map((legacyTab) => {
    const defaultTab = defaultTabLayout(legacyTab.id);
    defaultTab.visible = legacyTab.visible;
    defaultTab.settings = {
      density: legacyTab.settings?.density,
      notesPosition: legacyTab.settings?.notesPosition,
    };

    if (legacyTab.id === "review") {
      const reviewNode = findProductionNode(defaultTab, "review-center");
      const visibleViews = legacyTab.sections
        .filter((section) => !("kind" in section) && section.visible)
        .map((section) => section.id)
        .filter((id): id is typeof workspaceReviewViewIdsV2[number] => workspaceReviewViewIdsV2.includes(id as typeof workspaceReviewViewIdsV2[number]));
      reviewNode.config = {
        ...reviewNode.config,
        defaultView: visibleViews[0] ?? "overview",
        viewOrder: legacyTab.sections.filter((section) => !("kind" in section)).map((section) => section.id),
        visibleViews,
      };
    } else {
      const order = new Map(legacyTab.sections.map((section, index) => [section.id, index]));
      const productionNodes = flattenWorkspaceNodes(defaultTab).filter(isWorkspaceProductionNodeV2);
      for (const node of productionNodes) {
        const legacy = legacyTab.sections.find((section) => section.id === node.component && !("kind" in section));
        if (!legacy) continue;
        node.visible = legacy.visible;
        node.presentation = {
          density: legacy.presentation?.density,
          emphasis: legacy.presentation?.emphasis,
          surface: legacy.presentation?.surface,
        };
      }
      defaultTab.rows.sort((left, right) => {
        const leftOrder = Math.min(...flattenRowNodes(left).map((node) => order.get(node.component) ?? Number.MAX_SAFE_INTEGER));
        const rightOrder = Math.min(...flattenRowNodes(right).map((node) => order.get(node.component) ?? Number.MAX_SAFE_INTEGER));
        return leftOrder - rightOrder;
      });
    }

    for (const custom of legacyTab.sections.filter(
      (section) => "kind" in section && section.kind === "custom",
    ) as Array<Extract<(typeof legacyTab.sections)[number], { kind: "custom" }>>) {
      defaultTab.rows.push({
        columns: [{
          id: stableId(`column-${legacyTab.id}-${custom.id}`),
          items: [{
            body: custom.body,
            component: custom.component,
            id: stableId(custom.id),
            items: custom.items,
            kind: "custom",
            presentation: {
              density: custom.presentation?.density,
              emphasis: custom.presentation?.emphasis,
              surface: custom.presentation?.surface,
            },
            title: custom.title,
            visible: custom.visible,
          }],
          span: {
            desktop: coerceDesktopSpan(custom.presentation?.span?.desktop),
            mobile: 12,
            tablet: custom.presentation?.span?.tablet === 6 ? 6 : 12,
          },
        }],
        gap: "medium",
        id: stableId(`row-${legacyTab.id}-${custom.id}`),
      });
    }
    return defaultTab;
  });
  return upgraded;
}

export function cloneWorkspaceLayoutManifestV2(
  manifest: WorkspaceLayoutManifestV2 = embeddedWorkspaceLayoutManifestV2,
) {
  return structuredClone(manifest);
}

export function flattenWorkspaceNodes(tab: WorkspaceLayoutTabV2) {
  return tab.rows.flatMap((row) => flattenRowNodes(row));
}

export function flattenRowNodes(row: WorkspaceLayoutRowV2) {
  return row.columns.flatMap((column) => column.items);
}

export function isWorkspaceProductionNodeV2(node: WorkspaceLayoutNodeV2): node is WorkspaceProductionNodeV2 {
  return node.kind === "production";
}

export function isWorkspaceCustomNodeV2(node: WorkspaceLayoutNodeV2): node is WorkspaceCustomNodeV2 {
  return node.kind === "custom";
}

export function findProductionNode(tab: WorkspaceLayoutTabV2, component: WorkspaceProductionComponentIdV2) {
  const node = flattenWorkspaceNodes(tab).find(
    (candidate): candidate is WorkspaceProductionNodeV2 => candidate.kind === "production" && candidate.component === component,
  );
  if (!node) throw new Error(`Production component ${component} is missing from ${tab.id}.`);
  return node;
}

export function createWorkspaceCustomNodeV2(
  component: WorkspaceCustomBlockKindV2,
  id = createWorkspaceLayoutId(`custom-${component}`),
): WorkspaceCustomNodeV2 {
  const node: WorkspaceCustomNodeV2 = {
    component,
    id,
    kind: "custom",
    presentation: {
      density: "comfortable",
      emphasis: component === "callout" ? "prominent" : "standard",
      surface: component === "divider" ? "plain" : "panel",
    },
    visible: true,
  };
  if (component === "heading") return { ...node, title: "Section heading" };
  if (component === "rich-text") {
    return { ...node, document: richTextDocumentFromPlainText("Add formatted orientation or source context."), title: "Rich text" };
  }
  if (component === "metric-strip") {
    return {
      ...node,
      items: [
        { label: "Metric one", value: "Value" },
        { label: "Metric two", value: "Value" },
        { label: "Metric three", value: "Value" },
      ],
      title: "Key figures",
    };
  }
  if (component === "link-list" || component === "button-group") {
    return { ...node, items: [{ href: "/", label: "Workspace home" }], title: "Related resources" };
  }
  if (component === "accordion") {
    return { ...node, items: [{ body: "Add a concise, source-aware answer.", label: "Question" }], title: "Common questions" };
  }
  if (component === "divider") return { ...node, title: "Section" };
  if (component === "image") return { ...node, title: "Image" };
  if (component === "video") return { ...node, title: "Video" };
  return {
    ...node,
    body: component === "callout" ? "Add an important caveat or next step." : "Add concise orientation or source context.",
    title: component === "callout" ? "Important note" : "Section heading",
  };
}

export function appendWorkspaceNodeAsRow(
  tab: WorkspaceLayoutTabV2,
  node: WorkspaceLayoutNodeV2,
  span: WorkspaceLayoutDesktopSpanV2 = 12,
) {
  tab.rows.push({
    columns: [{
      id: createWorkspaceLayoutId("column"),
      items: [node],
      span: { desktop: span, mobile: 12, tablet: span === 3 || span === 4 ? 6 : 12 },
    }],
    gap: "medium",
    id: createWorkspaceLayoutId("row"),
  });
}

export function createWorkspaceLayoutId(prefix: string) {
  const normalized = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "layout";
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${normalized}-${suffix}`;
}

export function richTextDocumentFromPlainText(text: string): WorkspaceRichTextDocumentV1 {
  return { blocks: [{ children: [{ text, type: "text" }], type: "paragraph" }], version: 1 };
}

export function evaluateWorkspaceVisibility(visibility: WorkspaceVisibilityV1 | undefined, context: WorkspaceVisibilityContext) {
  if (!visibility?.groups?.length) return true;
  const groupResults = visibility.groups.map((group) => {
    const values = group.conditions.map((condition) => evaluateCondition(condition, context));
    return group.operator === "any" ? values.some(Boolean) : values.every(Boolean);
  });
  return visibility.operator === "any" ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

export function workspaceViewportVisibilityAttributes(visibility?: WorkspaceVisibilityV1) {
  const viewports = visibility?.viewports;
  return {
    "data-layout-show-desktop": viewports?.desktop === false ? "false" : "true",
    "data-layout-show-mobile": viewports?.mobile === false ? "false" : "true",
    "data-layout-show-tablet": viewports?.tablet === false ? "false" : "true",
  } as const;
}

export function workspaceAccentForeground(accent: string | undefined) {
  if (!accent || !/^#[0-9a-f]{6}$/i.test(accent)) return "#07110f";
  const [red, green, blue] = [accent.slice(1, 3), accent.slice(3, 5), accent.slice(5, 7)].map((value) => Number.parseInt(value, 16));
  const luminance = [red, green, blue]
    .map((value) => value / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#07110f" : "#ffffff";
}

export function isSafeWorkspaceBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith("/layout-media/");
  } catch {
    return false;
  }
}

function isSafeWorkspaceHrefV2(value: string) {
  if (!value || value.length > 240 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return true;
  if (/^mailto:[^@?]+@[^@?]+\.[^@?]+(?:\?.*)?$/i.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function inspectStructuralRules(manifest: WorkspaceLayoutManifestV2) {
  const errors: string[] = [];
  const seenTabs = new Set<WorkspaceTabId>();
  const seenIds = new Set<string>();
  for (const tab of manifest.tabs) {
    if (seenTabs.has(tab.id)) errors.push(`Tab ${tab.id} appears more than once.`);
    seenTabs.add(tab.id);
    const registry = workspaceLayoutRegistryV2.find((candidate) => candidate.id === tab.id)!;
    if (registry.required && !tab.visible) errors.push(`Required tab ${registry.label} cannot be hidden.`);
    const nodes = flattenWorkspaceNodes(tab);
    if (nodes.filter(isWorkspaceCustomNodeV2).length > WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB) {
      errors.push(`Tab ${tab.id} may contain at most ${WORKSPACE_LAYOUT_MAX_CUSTOM_BLOCKS_PER_TAB} custom blocks.`);
    }
    for (const row of tab.rows) {
      if (seenIds.has(row.id)) errors.push(`Layout id ${row.id} appears more than once.`);
      seenIds.add(row.id);
      for (const column of row.columns) {
        if (seenIds.has(column.id)) errors.push(`Layout id ${column.id} appears more than once.`);
        seenIds.add(column.id);
        for (const node of column.items) {
          if (seenIds.has(node.id)) errors.push(`Layout id ${node.id} appears more than once.`);
          seenIds.add(node.id);
          if (node.kind === "production" && node.visibility) {
            const component = registry.components.find((candidate) => candidate.id === node.component);
            if (component?.required) errors.push(`Required component ${component.label} cannot use visibility rules.`);
          }
        }
      }
    }
    for (const component of registry.components) {
      const matches = nodes.filter((node) => node.kind === "production" && node.component === component.id);
      if (matches.length !== 1) errors.push(`Tab ${tab.id} must contain production component ${component.id} exactly once.`);
      if (component.required && matches[0]?.visible !== true) errors.push(`Required component ${component.label} cannot be hidden.`);
    }
    const unknown = nodes.filter((node) => node.kind === "production"
      && !registry.components.some((component) => component.id === node.component));
    if (unknown.length) errors.push(`Tab ${tab.id} contains unsupported production components: ${unknown.map((node) => node.component).join(", ")}.`);
    if (tab.id === "review") errors.push(...inspectReviewConfiguration(tab));
    if (tab.visible && !nodes.some((node) => node.kind === "production" && node.visible && !node.visibility)) {
      errors.push(`Visible tab ${tab.id} must retain an unconditional production component.`);
    }
  }
  for (const registryTab of workspaceLayoutRegistryV2) {
    if (!seenTabs.has(registryTab.id)) errors.push(`Tab ${registryTab.id} is missing.`);
  }
  if (!manifest.tabs.find((tab) => tab.id === manifest.settings.defaultTab)?.visible) {
    errors.push("settings.defaultTab must reference a visible tab.");
  }
  return errors;
}

function inspectReviewConfiguration(tab: WorkspaceLayoutTabV2) {
  const errors: string[] = [];
  const reviewNode = flattenWorkspaceNodes(tab)
    .find((node): node is WorkspaceProductionNodeV2 => node.kind === "production" && node.component === "review-center");
  if (!reviewNode) return errors;
  const knownViews = new Set<string>(workspaceReviewViewIdsV2);
  const viewOrder = reviewNode.config?.viewOrder ?? [...workspaceReviewViewIdsV2];
  const visibleViews = reviewNode.config?.visibleViews ?? [...viewOrder];
  const defaultView = reviewNode.config?.defaultView ?? "overview";

  if (new Set(viewOrder).size !== viewOrder.length) errors.push("Review viewOrder cannot contain duplicates.");
  if (viewOrder.some((view) => !knownViews.has(view))) errors.push("Review viewOrder contains an unsupported view.");
  if (workspaceReviewViewIdsV2.some((view) => !viewOrder.includes(view))) {
    errors.push("Review viewOrder must include every review view exactly once.");
  }
  if (visibleViews.length === 0) errors.push("Review visibleViews must retain at least one view.");
  if (new Set(visibleViews).size !== visibleViews.length) errors.push("Review visibleViews cannot contain duplicates.");
  if (visibleViews.some((view) => !knownViews.has(view))) errors.push("Review visibleViews contains an unsupported view.");
  if (!knownViews.has(defaultView)) errors.push("Review defaultView is unsupported.");
  else if (!visibleViews.includes(defaultView)) errors.push("Review defaultView must reference a visible view.");
  return errors;
}

function defaultTabLayout(tabId: WorkspaceTabId): WorkspaceLayoutTabV2 {
  const registry = workspaceLayoutRegistryV2.find((tab) => tab.id === tabId)!;
  if (tabId === "map") {
    return {
      id: tabId,
      rows: [{
        align: "start",
        columns: [
          {
            id: "column-map-primary",
            items: [productionNode(tabId, "results-map")],
            span: { desktop: 8, mobile: 12, tablet: 12 },
          },
          {
            id: "column-map-context",
            items: [
              productionNode(tabId, "source-provenance"),
              productionNode(tabId, "coverage-context"),
              productionNode(tabId, "state-snapshot"),
            ],
            span: { desktop: 4, mobile: 12, tablet: 12 },
          },
        ],
        gap: "medium",
        id: "row-map-primary",
      }],
      settings: { density: "comfortable", notesPosition: "side" },
      visible: true,
    };
  }
  return {
    id: tabId,
    rows: registry.components.map((component, index) => ({
      columns: [{
        id: stableId(`column-${tabId}-${component.id}`),
        items: [productionNode(tabId, component.id)],
        span: { desktop: 12, mobile: 12, tablet: 12 },
      }],
      gap: "medium",
      id: stableId(`row-${tabId}-${index + 1}`),
    })),
    settings: { density: "comfortable", notesPosition: "side" },
    visible: true,
  };
}

function productionNode(tabId: WorkspaceTabId, component: WorkspaceProductionComponentIdV2): WorkspaceProductionNodeV2 {
  const config: WorkspaceProductionConfigV2 | undefined = component === "results-map"
    ? { legendPosition: "below", mapComposition: "map-first" }
    : component === "coverage-context"
      ? { coverageVariant: "list" }
      : component === "state-snapshot"
        ? { snapshotVariant: "bars" }
        : component === "source-provenance"
          ? { provenanceInitialState: "expanded", provenanceVariant: "expanded" }
          : component === "review-center"
            ? {
              defaultView: "overview",
              navigationStyle: "tabs",
              viewOrder: [...workspaceReviewViewIdsV2],
              visibleViews: [...workspaceReviewViewIdsV2],
            }
            : undefined;
  return {
    component,
    config,
    id: stableId(`production-${tabId}-${component}`),
    kind: "production",
    presentation: { density: "comfortable", emphasis: "standard", surface: "panel" },
    visible: true,
  };
}

function createMapFirstTemplate() {
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const map = manifest.tabs.find((tab) => tab.id === "map")!;
  const nodes = flattenWorkspaceNodes(map).filter(isWorkspaceProductionNodeV2);
  map.rows = [
    {
      columns: [{
        id: "column-map-first-explorer",
        items: [nodes.find((node) => node.component === "results-map")!],
        span: { desktop: 12, mobile: 12, tablet: 12 },
      }],
      gap: "medium",
      id: "row-map-first-explorer",
    },
    {
      columns: ["source-provenance", "coverage-context", "state-snapshot"].map((component, index) => ({
        id: `column-map-first-context-${index + 1}`,
        items: [nodes.find((node) => node.component === component)!],
        span: { desktop: 4 as const, mobile: 12 as const, tablet: 6 as const },
      })),
      gap: "medium",
      id: "row-map-first-context",
    },
  ];
  return manifest;
}

function createResearchTemplate() {
  const manifest = cloneWorkspaceLayoutManifestV2(embeddedWorkspaceLayoutManifestV2);
  const map = manifest.tabs.find((tab) => tab.id === "map")!;
  const nodes = flattenWorkspaceNodes(map).filter(isWorkspaceProductionNodeV2);
  map.rows = [
    {
      columns: ["source-provenance", "coverage-context"].map((component, index) => ({
        id: `column-research-context-${index + 1}`,
        items: [nodes.find((node) => node.component === component)!],
        span: { desktop: 6 as const, mobile: 12 as const, tablet: 6 as const },
      })),
      gap: "medium",
      id: "row-research-context",
    },
    {
      columns: [{
        id: "column-research-explorer",
        items: [nodes.find((node) => node.component === "results-map")!],
        span: { desktop: 12, mobile: 12, tablet: 12 },
      }],
      gap: "medium",
      id: "row-research-explorer",
    },
    {
      columns: [{
        id: "column-research-snapshot",
        items: [nodes.find((node) => node.component === "state-snapshot")!],
        span: { desktop: 12, mobile: 12, tablet: 12 },
      }],
      gap: "medium",
      id: "row-research-snapshot",
    },
  ];
  return manifest;
}

function evaluateCondition(condition: WorkspaceVisibilityConditionV1, context: WorkspaceVisibilityContext) {
  const actual = condition.fact === "state"
    ? context.state
    : condition.fact === "year"
      ? context.year
      : condition.fact === "validation"
        ? context.validation ?? "unknown"
        : condition.fact === "capability"
          ? context.capabilities?.[condition.key ?? ""]
          : context.data?.[condition.key ?? ""];
  if (condition.operator === "available") return actual === true;
  if (condition.operator === "unavailable") return actual !== true;
  if (condition.operator === "in") return Array.isArray(condition.value) && condition.value.map(String).includes(String(actual));
  if (condition.operator === "not-equals") return String(actual) !== String(condition.value);
  return String(actual) === String(condition.value);
}

function allowedSpansForComponent(component: WorkspaceSectionId) {
  if (["results-map", "historical-charts", "screening", "indicators"].includes(component)) return [8, 9, 12] as const;
  return [3, 4, 6, 8, 9, 12] as const;
}

function coerceDesktopSpan(value: number | undefined): WorkspaceLayoutDesktopSpanV2 {
  return desktopSpans.includes(value as WorkspaceLayoutDesktopSpanV2) ? value as WorkspaceLayoutDesktopSpanV2 : 12;
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

function formatZodPath(path: PropertyKey[]) {
  return path.length ? `${path.map(String).join(".")}: ` : "";
}
