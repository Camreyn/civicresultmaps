export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_LAYOUT_REGISTRY_VERSION = 1 as const;

export type WorkspaceTabId =
  | "map"
  | "review"
  | "history"
  | "methods"
  | "electronic"
  | "planner"
  | "data"
  | "methodology"
  | "exports"
  | "imports"
  | "support"
  | "contact";

export type WorkspaceSectionId =
  | "results-map"
  | "coverage-context"
  | "state-snapshot"
  | "source-provenance"
  | "overview"
  | "evidence-tools"
  | "screening"
  | "indicators"
  | "methodology"
  | "historical-summary"
  | "historical-charts"
  | "integrity-context"
  | "source-records-request"
  | "cvr-requests"
  | "source-plan"
  | "vote-methods"
  | "equipment-context"
  | "introduction"
  | "responsible-review"
  | "guided-workflows"
  | "glossary"
  | "review-packet"
  | "downloads"
  | "api-links"
  | "import-history"
  | "support-actions"
  | "contact-options";

export type WorkspaceViewport = "desktop" | "tablet" | "mobile";
export type WorkspaceLayoutDensity = "compact" | "comfortable" | "spacious";
export type WorkspaceLayoutSurface = "plain" | "panel" | "muted" | "accent";
export type WorkspaceLayoutEmphasis = "quiet" | "standard" | "prominent";
export type WorkspaceLayoutTheme = "civic" | "high-contrast" | "warm";
export type WorkspaceLayoutTabStyle = "bar" | "pills";
export type WorkspaceLayoutContentWidth = "standard" | "wide" | "full";
export type WorkspaceLayoutSpan = 4 | 6 | 8 | 12;
export type WorkspaceCustomBlockKind = "narrative" | "callout" | "metric-strip" | "link-list" | "divider";

export type WorkspaceResponsiveSpanV1 = {
  desktop?: WorkspaceLayoutSpan;
  tablet?: 6 | 12;
  mobile?: 12;
};

export type WorkspaceSectionPresentationV1 = {
  density?: WorkspaceLayoutDensity;
  emphasis?: WorkspaceLayoutEmphasis;
  mapHeight?: "compact" | "standard" | "expanded";
  span?: WorkspaceResponsiveSpanV1;
  surface?: WorkspaceLayoutSurface;
};

export type WorkspaceCustomBlockItemV1 = {
  href?: string;
  label: string;
  value?: string;
};

export type WorkspaceCustomBlockV1 = {
  body?: string;
  component: WorkspaceCustomBlockKind;
  id: string;
  items?: WorkspaceCustomBlockItemV1[];
  kind: "custom";
  presentation?: WorkspaceSectionPresentationV1;
  title?: string;
  visible: boolean;
};

export type WorkspaceLayoutSectionV1 = {
  id: WorkspaceSectionId;
  presentation?: WorkspaceSectionPresentationV1;
  visible: boolean;
};

export type WorkspaceLayoutItemV1 = WorkspaceLayoutSectionV1 | WorkspaceCustomBlockV1;

export type WorkspaceLayoutTabV1 = {
  id: WorkspaceTabId;
  settings?: {
    density?: WorkspaceLayoutDensity;
    notesPosition?: "side" | "below";
  };
  visible: boolean;
  sections: WorkspaceLayoutItemV1[];
};

export type WorkspaceLayoutManifestV1 = {
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION;
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION;
  settings?: {
    contentWidth?: WorkspaceLayoutContentWidth;
    defaultTab?: WorkspaceTabId;
    notesDefault?: "collapsed" | "expanded";
    tabStyle?: WorkspaceLayoutTabStyle;
    theme?: WorkspaceLayoutTheme;
  };
  tabs: WorkspaceLayoutTabV1[];
};

export type WorkspaceLayoutEnvelopeV1 = {
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION;
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION;
  revisionId: string;
  manifestDigest: string;
  publishedAt: string;
  manifest: WorkspaceLayoutManifestV1;
};

export type WorkspaceSectionRegistryEntry = {
  capabilities?: readonly ("density" | "emphasis" | "map-height" | "span" | "surface")[];
  description?: string;
  id: WorkspaceSectionId;
  label: string;
  required?: boolean;
};

export type WorkspaceTabRegistryEntry = {
  backfillIfMissing?: boolean;
  id: WorkspaceTabId;
  label: string;
  required?: boolean;
  sections: readonly WorkspaceSectionRegistryEntry[];
};

export const workspaceLayoutRegistry = [
  {
    id: "map",
    label: "Map",
    required: true,
    sections: [
      { id: "results-map", label: "Results Map", required: true },
      { id: "coverage-context", label: "Coverage Context" },
      { id: "state-snapshot", label: "State Snapshot" },
      { id: "source-provenance", label: "Source Provenance", required: true },
    ],
  },
  {
    id: "review",
    label: "Review Center",
    required: true,
    sections: [
      { id: "overview", label: "Overview" },
      { id: "evidence-tools", label: "Evidence Tools" },
      { id: "screening", label: "Screening" },
      { id: "indicators", label: "Indicators" },
      { id: "methodology", label: "Methodology" },
    ],
  },
  {
    id: "history",
    label: "History",
    sections: [
      { id: "historical-summary", label: "Historical Summary" },
      { id: "historical-charts", label: "Historical Charts" },
    ],
  },
  {
    backfillIfMissing: true,
    id: "methods",
    label: "Vote Methods",
    required: true,
    sections: [{ id: "vote-methods", label: "Vote Methods", required: true }],
  },
  {
    id: "electronic",
    label: "Electronic Integrity",
    sections: [
      { id: "integrity-context", label: "Integrity Context" },
      { id: "source-records-request", label: "Source Records Request" },
      { id: "cvr-requests", label: "CVR Requests" },
    ],
  },
  {
    id: "planner",
    label: "Source Planner",
    sections: [{ id: "source-plan", label: "Source Plan" }],
  },
  {
    id: "data",
    label: "Data & Sources",
    required: true,
    sections: [
      { id: "source-provenance", label: "Source Provenance", required: true },
      { id: "vote-methods", label: "Vote Methods" },
      { id: "equipment-context", label: "Equipment Context" },
    ],
  },
  {
    id: "methodology",
    label: "Review Guide",
    required: true,
    sections: [
      { id: "introduction", label: "Introduction" },
      { id: "responsible-review", label: "Responsible Review" },
      { id: "guided-workflows", label: "Guided Workflows" },
      { id: "glossary", label: "Glossary" },
    ],
  },
  {
    id: "exports",
    label: "Exports & API",
    sections: [
      { id: "review-packet", label: "Review Packet" },
      { id: "downloads", label: "Downloads" },
      { id: "api-links", label: "API Links" },
    ],
  },
  {
    id: "imports",
    label: "Import Runs",
    sections: [{ id: "import-history", label: "Import History" }],
  },
  {
    id: "support",
    label: "Support",
    sections: [{ id: "support-actions", label: "Support Actions" }],
  },
  {
    id: "contact",
    label: "Contact",
    sections: [{ id: "contact-options", label: "Contact Options" }],
  },
] as const satisfies readonly WorkspaceTabRegistryEntry[];

export function shouldBackfillWorkspaceTab(tab: WorkspaceTabRegistryEntry) {
  return tab.backfillIfMissing === true;
}

const registryByTab = new Map<WorkspaceTabId, WorkspaceTabRegistryEntry>(
  workspaceLayoutRegistry.map((tab) => [tab.id, tab]),
);

const densityValues = ["compact", "comfortable", "spacious"] as const;
const surfaceValues = ["plain", "panel", "muted", "accent"] as const;
const emphasisValues = ["quiet", "standard", "prominent"] as const;
const mapHeightValues = ["compact", "standard", "expanded"] as const;
const componentValues = ["narrative", "callout", "metric-strip", "link-list", "divider"] as const;
const themeValues = ["civic", "high-contrast", "warm"] as const;
const contentWidthValues = ["standard", "wide", "full"] as const;
const tabStyleValues = ["bar", "pills"] as const;

export const workspaceComponentLibrary = [
  { component: "narrative", description: "Titled orientation, instructions, or source context.", label: "Narrative" },
  { component: "callout", description: "An emphasized caveat or next step.", label: "Callout" },
  { component: "metric-strip", description: "Up to four administrator-supplied labels and values.", label: "Metric strip" },
  { component: "link-list", description: "Safe internal, HTTPS, or email links.", label: "Link list" },
  { component: "divider", description: "A labeled visual break between sections.", label: "Divider" },
] as const satisfies readonly {
  component: WorkspaceCustomBlockKind;
  description: string;
  label: string;
}[];

export const defaultWorkspaceLayoutSettings = {
  contentWidth: "wide",
  defaultTab: "map",
  notesDefault: "collapsed",
  tabStyle: "bar",
  theme: "civic",
} as const satisfies NonNullable<WorkspaceLayoutManifestV1["settings"]>;

export const embeddedWorkspaceLayoutManifest: WorkspaceLayoutManifestV1 = {
  schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
  registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION,
  settings: defaultWorkspaceLayoutSettings,
  tabs: workspaceLayoutRegistry.map((tab) => ({
    id: tab.id,
    visible: true,
    sections: tab.sections.map((section) => ({ id: section.id, visible: true })),
  })),
};

export type WorkspaceLayoutValidationResult =
  | { ok: true; value: WorkspaceLayoutManifestV1 }
  | { ok: false; errors: string[] };

export function cloneWorkspaceLayoutManifest(
  manifest: WorkspaceLayoutManifestV1 = embeddedWorkspaceLayoutManifest,
): WorkspaceLayoutManifestV1 {
  return structuredClone(manifest);
}

export function isWorkspaceTabId(value: string): value is WorkspaceTabId {
  return registryByTab.has(value as WorkspaceTabId);
}

export function validateWorkspaceLayoutManifest(value: unknown): WorkspaceLayoutValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Manifest must be an object."] };
  }

  if (value.schemaVersion !== WORKSPACE_LAYOUT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${WORKSPACE_LAYOUT_SCHEMA_VERSION}.`);
  }
  if (value.registryVersion !== WORKSPACE_LAYOUT_REGISTRY_VERSION) {
    errors.push(`registryVersion must be ${WORKSPACE_LAYOUT_REGISTRY_VERSION}.`);
  }
  validateManifestSettings(value.settings, errors);
  if (!Array.isArray(value.tabs)) {
    errors.push("tabs must be an array.");
    return { ok: false, errors };
  }

  const seenTabs = new Set<string>();
  for (const rawTab of value.tabs) {
    if (!isRecord(rawTab) || typeof rawTab.id !== "string") {
      errors.push("Every tab must have a string id.");
      continue;
    }
    if (seenTabs.has(rawTab.id)) {
      errors.push(`Tab ${rawTab.id} appears more than once.`);
      continue;
    }
    seenTabs.add(rawTab.id);
    if (!isWorkspaceTabId(rawTab.id)) {
      errors.push(`Unknown tab id: ${rawTab.id}.`);
      continue;
    }
    const registryTab = registryByTab.get(rawTab.id)!;
    if (typeof rawTab.visible !== "boolean") {
      errors.push(`Tab ${rawTab.id} must have a boolean visible value.`);
    }
    if (registryTab.required && rawTab.visible !== true) {
      errors.push(`Required tab ${registryTab.label} cannot be hidden.`);
    }
    validateTabSettings(rawTab.settings, `Tab ${rawTab.id}`, errors);
    if (!Array.isArray(rawTab.sections)) {
      errors.push(`Tab ${rawTab.id} sections must be an array.`);
      continue;
    }
    if (rawTab.visible === true && !rawTab.sections.some((section) => isRecord(section) && section.visible === true)) {
      errors.push(`Visible tab ${rawTab.id} must contain at least one visible section.`);
    }
    if (rawTab.visible === true && !rawTab.sections.some((section) => (
      isRecord(section) && section.kind !== "custom" && section.visible === true
    ))) {
      errors.push(`Visible tab ${rawTab.id} must retain at least one visible production section.`);
    }

    const expectedSections = new Map(registryTab.sections.map((section) => [section.id, section]));
    const seenItemIds = new Set<string>();
    const seenRegistrySections = new Set<string>();
    let customBlockCount = 0;
    let customBlockSeen = false;
    let productionAfterCustomReported = false;

    for (const rawSection of rawTab.sections) {
      if (!isRecord(rawSection) || typeof rawSection.id !== "string") {
        errors.push(`Every section in ${rawTab.id} must have a string id.`);
        continue;
      }
      if (seenItemIds.has(rawSection.id)) {
        errors.push(`Section ${rawSection.id} appears more than once in ${rawTab.id}.`);
        continue;
      }
      seenItemIds.add(rawSection.id);

      if (rawSection.kind === "custom") {
        customBlockCount += 1;
        validateCustomBlock(rawSection, `Custom block ${rawSection.id} in ${rawTab.id}`, errors);
        customBlockSeen = true;
        continue;
      }

      const registrySection = expectedSections.get(rawSection.id as WorkspaceSectionId);
      if (customBlockSeen && !productionAfterCustomReported) {
        errors.push(`Production sections in ${rawTab.id} must appear before custom blocks.`);
        productionAfterCustomReported = true;
      }
      if (!registrySection) {
        errors.push(`Unknown section ${rawSection.id} in tab ${rawTab.id}.`);
        continue;
      }
      seenRegistrySections.add(rawSection.id);
      if (typeof rawSection.visible !== "boolean") {
        errors.push(`Section ${rawSection.id} in ${rawTab.id} must have a boolean visible value.`);
      }
      if (registrySection.required && rawSection.visible !== true) {
        errors.push(`Required section ${registrySection.label} cannot be hidden.`);
      }
      validatePresentation(rawSection.presentation, `Section ${rawSection.id} in ${rawTab.id}`, errors);
      if (isRecord(rawSection.presentation) && rawSection.presentation.span !== undefined) {
        errors.push(`Section ${rawSection.id} uses a responsive span reserved for custom blocks.`);
      }
      if (isRecord(rawSection.presentation) && rawSection.presentation.mapHeight !== undefined && rawSection.id !== "results-map") {
        errors.push(`Section ${rawSection.id} cannot set map height.`);
      }
    }

    if (customBlockCount > 12) {
      errors.push(`Tab ${rawTab.id} may contain at most 12 custom blocks.`);
    }
    for (const section of registryTab.sections) {
      if (!seenRegistrySections.has(section.id)) {
        errors.push(`Section ${section.id} is missing from tab ${rawTab.id}.`);
      }
    }
  }

  if (isRecord(value.settings)
    && typeof value.settings.defaultTab === "string"
    && isWorkspaceTabId(value.settings.defaultTab)
  ) {
    const defaultTab = value.settings.defaultTab;
    const configuredDefault = value.tabs.find((tab) => isRecord(tab) && tab.id === defaultTab);
    if (!isRecord(configuredDefault) || configuredDefault.visible !== true) {
      errors.push("settings.defaultTab must reference a visible tab.");
    }
  }

  for (const tab of workspaceLayoutRegistry) {
    if (!seenTabs.has(tab.id) && !shouldBackfillWorkspaceTab(tab)) {
      errors.push(`Tab ${tab.id} is missing.`);
    }
  }
  if (value.tabs.length > workspaceLayoutRegistry.length) {
    errors.push(`Manifest may contain at most ${workspaceLayoutRegistry.length} tabs.`);
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: value as WorkspaceLayoutManifestV1 };
}

export function visibleWorkspaceTabs(manifest: WorkspaceLayoutManifestV1) {
  return manifest.tabs.filter((tab) => tab.visible);
}

export function resolveVisibleWorkspaceTab(
  manifest: WorkspaceLayoutManifestV1,
  requested?: string,
): WorkspaceTabId {
  const visibleTabs = visibleWorkspaceTabs(manifest);
  const visible = new Set(visibleTabs.map((tab) => tab.id));
  if (requested && isWorkspaceTabId(requested) && visible.has(requested)) return requested;
  const configuredDefault = manifest.settings?.defaultTab;
  if (configuredDefault && visible.has(configuredDefault)) return configuredDefault;
  return visible.has("map") ? "map" : visibleTabs[0]?.id ?? "map";
}

export function workspaceSectionState(
  manifest: WorkspaceLayoutManifestV1,
  tabId: WorkspaceTabId,
  sectionId: WorkspaceSectionId,
) {
  const sections = manifest.tabs.find((tab) => tab.id === tabId)?.sections ?? [];
  const index = sections.findIndex((section) => section.id === sectionId);
  const item = index >= 0 ? sections[index] : undefined;
  return {
    order: index < 0 ? Number.MAX_SAFE_INTEGER : index,
    presentation: item?.presentation,
    visible: index >= 0 && Boolean(item?.visible),
  };
}

export function isWorkspaceCustomBlock(item: WorkspaceLayoutItemV1): item is WorkspaceCustomBlockV1 {
  return "kind" in item && item.kind === "custom";
}

export function workspaceCustomBlocks(manifest: WorkspaceLayoutManifestV1, tabId: WorkspaceTabId) {
  const sections = manifest.tabs.find((tab) => tab.id === tabId)?.sections ?? [];
  return sections.flatMap((item, order) => isWorkspaceCustomBlock(item) ? [{ ...item, order }] : []);
}

export function workspaceLayoutSettings(manifest: WorkspaceLayoutManifestV1) {
  return { ...defaultWorkspaceLayoutSettings, ...manifest.settings };
}

export function createWorkspaceCustomBlock(
  component: WorkspaceCustomBlockKind,
  sequence = Date.now(),
): WorkspaceCustomBlockV1 {
  const shared = {
    component,
    id: `custom-${component}-${String(sequence).replace(/[^a-z0-9-]/gi, "").toLowerCase()}`,
    kind: "custom" as const,
    presentation: {
      density: "comfortable" as const,
      emphasis: component === "callout" ? "prominent" as const : "standard" as const,
      span: { desktop: 12 as const, tablet: 12 as const, mobile: 12 as const },
      surface: component === "divider" ? "plain" as const : "panel" as const,
    },
    visible: true,
  };

  if (component === "metric-strip") {
    return {
      ...shared,
      items: [
        { label: "Metric one", value: "Value" },
        { label: "Metric two", value: "Value" },
        { label: "Metric three", value: "Value" },
      ],
      title: "Key figures",
    };
  }
  if (component === "link-list") {
    return { ...shared, items: [{ href: "/", label: "Workspace home" }], title: "Related resources" };
  }
  if (component === "divider") return { ...shared, title: "Section" };
  return {
    ...shared,
    body: component === "callout"
      ? "Add an important caveat or next step."
      : "Add concise orientation or source context.",
    title: component === "callout" ? "Important note" : "Section heading",
  };
}

export function workspaceComponentLabel(component: WorkspaceCustomBlockKind) {
  return workspaceComponentLibrary.find((item) => item.component === component)?.label ?? component;
}

export type WorkspaceLayoutInspectionIssue = {
  id: string;
  message: string;
  severity: "error" | "warning" | "info";
};

export function inspectWorkspaceLayoutManifest(
  manifest: WorkspaceLayoutManifestV1,
): WorkspaceLayoutInspectionIssue[] {
  const validation = validateWorkspaceLayoutManifest(manifest);
  if (!validation.ok) {
    return validation.errors.map((message, index) => ({
      id: `validation-${index}`,
      message,
      severity: "error" as const,
    }));
  }

  const issues: WorkspaceLayoutInspectionIssue[] = [];
  for (const tab of manifest.tabs) {
    const registryTab = registryByTab.get(tab.id)!;
    if (!tab.visible) {
      issues.push({
        id: `hidden-tab-${tab.id}`,
        message: `${registryTab.label} will be hidden from public navigation.`,
        severity: "warning",
      });
    }
    for (const item of tab.sections) {
      if (isWorkspaceCustomBlock(item)) {
        if (item.visible) {
          issues.push({
            id: `editorial-${tab.id}-${item.id}`,
            message: `Review the custom copy in "${item.title || workspaceComponentLabel(item.component)}" for accuracy and source context.`,
            severity: "warning",
          });
        }
        continue;
      }
      const registrySection = registryTab.sections.find((section) => section.id === item.id);
      if (!item.visible && registrySection) {
        issues.push({
          id: `hidden-section-${tab.id}-${item.id}`,
          message: `${registrySection.label} will be hidden in ${registryTab.label}.`,
          severity: "warning",
        });
      }
    }
  }

  issues.push({
    id: "required-surfaces",
    message: "Required tabs, Results Map, Source Provenance, and the fixed Data Notes rail passed validation.",
    severity: "info",
  });
  return issues;
}

function validateManifestSettings(value: unknown, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push("settings must be an object.");
    return;
  }
  if (value.theme !== undefined && !isOneOf(value.theme, themeValues)) errors.push("settings.theme is invalid.");
  if (value.tabStyle !== undefined && !isOneOf(value.tabStyle, tabStyleValues)) errors.push("settings.tabStyle is invalid.");
  if (value.contentWidth !== undefined && !isOneOf(value.contentWidth, contentWidthValues)) errors.push("settings.contentWidth is invalid.");
  if (value.notesDefault !== undefined && !isOneOf(value.notesDefault, ["collapsed", "expanded"] as const)) {
    errors.push("settings.notesDefault is invalid.");
  }
  if (value.defaultTab !== undefined && (typeof value.defaultTab !== "string" || !isWorkspaceTabId(value.defaultTab))) {
    errors.push("settings.defaultTab is invalid.");
  }
}

function validateTabSettings(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} settings must be an object.`);
    return;
  }
  if (value.density !== undefined && !isOneOf(value.density, densityValues)) {
    errors.push(`${path} settings.density is invalid.`);
  }
  if (value.notesPosition !== undefined && !isOneOf(value.notesPosition, ["side", "below"] as const)) {
    errors.push(`${path} settings.notesPosition is invalid.`);
  }
}

function validatePresentation(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} presentation must be an object.`);
    return;
  }
  if (value.density !== undefined && !isOneOf(value.density, densityValues)) errors.push(`${path} presentation.density is invalid.`);
  if (value.surface !== undefined && !isOneOf(value.surface, surfaceValues)) errors.push(`${path} presentation.surface is invalid.`);
  if (value.emphasis !== undefined && !isOneOf(value.emphasis, emphasisValues)) errors.push(`${path} presentation.emphasis is invalid.`);
  if (value.mapHeight !== undefined && !isOneOf(value.mapHeight, mapHeightValues)) errors.push(`${path} presentation.mapHeight is invalid.`);
  if (value.span === undefined) return;
  if (!isRecord(value.span)) {
    errors.push(`${path} presentation.span must be an object.`);
    return;
  }
  if (value.span.desktop !== undefined && !isOneOf(value.span.desktop, [4, 6, 8, 12] as const)) {
    errors.push(`${path} desktop span must be 4, 6, 8, or 12 columns.`);
  }
  if (value.span.tablet !== undefined && !isOneOf(value.span.tablet, [6, 12] as const)) {
    errors.push(`${path} tablet span must be 6 or 12 columns.`);
  }
  if (value.span.mobile !== undefined && value.span.mobile !== 12) {
    errors.push(`${path} mobile span must be 12 columns.`);
  }
}

function validateCustomBlock(value: Record<string, unknown>, path: string, errors: string[]) {
  if (!/^custom-[a-z0-9-]{1,64}$/.test(String(value.id))) errors.push(`${path} has an invalid id.`);
  if (typeof value.visible !== "boolean") errors.push(`${path} must have a boolean visible value.`);
  if (!isOneOf(value.component, componentValues)) {
    errors.push(`${path} has an unsupported component.`);
    return;
  }
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.trim().length > 80)) {
    errors.push(`${path} title must be at most 80 characters.`);
  }
  if (value.body !== undefined && (typeof value.body !== "string" || value.body.trim().length > 600)) {
    errors.push(`${path} body must be at most 600 characters.`);
  }
  validatePresentation(value.presentation, path, errors);

  const component = value.component as WorkspaceCustomBlockKind;
  if ((component === "narrative" || component === "callout") && (
    typeof value.title !== "string" || !value.title.trim()
    || typeof value.body !== "string" || !value.body.trim()
  )) {
    errors.push(`${path} requires a title and body.`);
  }
  if (component !== "metric-strip" && component !== "link-list") return;
  const maximum = component === "metric-strip" ? 4 : 6;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > maximum) {
    errors.push(`${path} has an invalid item count.`);
    return;
  }
  value.items.forEach((item, index) => {
    if (!isRecord(item) || typeof item.label !== "string" || !item.label.trim() || item.label.length > 80) {
      errors.push(`${path} item ${index + 1} requires a short label.`);
      return;
    }
    if (component === "metric-strip" && (
      typeof item.value !== "string" || !item.value.trim() || item.value.length > 60
    )) {
      errors.push(`${path} metric ${index + 1} requires a short value.`);
    }
    if (component === "link-list" && (
      typeof item.href !== "string" || item.href.length > 240 || !isSafeWorkspaceHref(item.href)
    )) {
      errors.push(`${path} link ${index + 1} must use /, https://, or mailto:.`);
    }
  });
}

function isSafeWorkspaceHref(value: string) {
  if (!value || value.length > 240 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return true;
  if (/^mailto:[^@?]+@[^@?]+\.[^@?]+(?:\?.*)?$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
