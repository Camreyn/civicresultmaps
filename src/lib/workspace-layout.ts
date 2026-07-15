export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_LAYOUT_REGISTRY_VERSION = 1 as const;

export type WorkspaceTabId =
  | "map"
  | "review"
  | "history"
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

export type WorkspaceLayoutSectionV1 = {
  id: WorkspaceSectionId;
  visible: boolean;
};

export type WorkspaceLayoutTabV1 = {
  id: WorkspaceTabId;
  visible: boolean;
  sections: WorkspaceLayoutSectionV1[];
};

export type WorkspaceLayoutManifestV1 = {
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION;
  registryVersion: typeof WORKSPACE_LAYOUT_REGISTRY_VERSION;
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
  id: WorkspaceSectionId;
  label: string;
  required?: boolean;
};

export type WorkspaceTabRegistryEntry = {
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

const registryByTab = new Map<WorkspaceTabId, WorkspaceTabRegistryEntry>(
  workspaceLayoutRegistry.map((tab) => [tab.id, tab]),
);

export const embeddedWorkspaceLayoutManifest: WorkspaceLayoutManifestV1 = {
  schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
  registryVersion: WORKSPACE_LAYOUT_REGISTRY_VERSION,
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
    if (!Array.isArray(rawTab.sections)) {
      errors.push(`Tab ${rawTab.id} sections must be an array.`);
      continue;
    }
    if (rawTab.visible === true && !rawTab.sections.some((section) => isRecord(section) && section.visible === true)) {
      errors.push(`Visible tab ${rawTab.id} must contain at least one visible section.`);
    }

    const expectedSections = new Map(registryTab.sections.map((section) => [section.id, section]));
    const seenSections = new Set<string>();
    for (const rawSection of rawTab.sections) {
      if (!isRecord(rawSection) || typeof rawSection.id !== "string") {
        errors.push(`Every section in ${rawTab.id} must have a string id.`);
        continue;
      }
      if (seenSections.has(rawSection.id)) {
        errors.push(`Section ${rawSection.id} appears more than once in ${rawTab.id}.`);
        continue;
      }
      seenSections.add(rawSection.id);
      const registrySection = expectedSections.get(rawSection.id as WorkspaceSectionId);
      if (!registrySection) {
        errors.push(`Unknown section ${rawSection.id} in tab ${rawTab.id}.`);
        continue;
      }
      if (typeof rawSection.visible !== "boolean") {
        errors.push(`Section ${rawSection.id} in ${rawTab.id} must have a boolean visible value.`);
      }
      if (registrySection.required && rawSection.visible !== true) {
        errors.push(`Required section ${registrySection.label} cannot be hidden.`);
      }
    }
    for (const section of registryTab.sections) {
      if (!seenSections.has(section.id)) {
        errors.push(`Section ${section.id} is missing from tab ${rawTab.id}.`);
      }
    }
  }

  for (const tab of workspaceLayoutRegistry) {
    if (!seenTabs.has(tab.id)) {
      errors.push(`Tab ${tab.id} is missing.`);
    }
  }
  if (value.tabs.length !== workspaceLayoutRegistry.length) {
    errors.push(`Manifest must contain exactly ${workspaceLayoutRegistry.length} tabs.`);
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
  const visible = new Set(visibleWorkspaceTabs(manifest).map((tab) => tab.id));
  return requested && isWorkspaceTabId(requested) && visible.has(requested) ? requested : "map";
}

export function workspaceSectionState(
  manifest: WorkspaceLayoutManifestV1,
  tabId: WorkspaceTabId,
  sectionId: WorkspaceSectionId,
) {
  const sections = manifest.tabs.find((tab) => tab.id === tabId)?.sections ?? [];
  const index = sections.findIndex((section) => section.id === sectionId);
  return {
    order: index < 0 ? Number.MAX_SAFE_INTEGER : index,
    visible: index >= 0 && sections[index].visible,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
