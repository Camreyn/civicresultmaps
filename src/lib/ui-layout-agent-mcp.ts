export type LayoutAgentToolExecution = {
  message: string;
  structuredContent: Record<string, unknown>;
};

export type LayoutAgentToolExecutor = (
  name: string,
  argumentsValue: Record<string, unknown>,
) => Promise<LayoutAgentToolExecution>;

type JsonSchema = Record<string, unknown>;
type JsonRpcId = number | string | null;

const idSchema: JsonSchema = {
  description: "Existing layout object ID returned by layout_get_draft.",
  pattern: "^[a-z][a-z0-9-]{2,95}$",
  type: "string",
};
const uuidSchema: JsonSchema = {
  description: "Draft or revision UUID returned by the layout tools.",
  format: "uuid",
  type: "string",
};


const operationIdSchema: JsonSchema = {
  description: "Unique lowercase ID for this batch. Add and duplicate operations derive stable object IDs from it.",
  pattern: "^[a-z0-9][a-z0-9-]{2,39}$",
  type: "string",
};

const tabIdSchema: JsonSchema = {
  enum: ["map", "review", "history", "electronic", "planner", "data", "methodology", "exports", "imports", "support", "contact"],
  type: "string",
};

const customBlockKindSchema: JsonSchema = {
  enum: ["narrative", "callout", "metric-strip", "link-list", "divider", "heading", "rich-text", "button-group", "video", "accordion"],
  type: "string",
};

const itemSchema: JsonSchema = objectSchema({
  body: { maxLength: 600, type: "string" },
  href: { maxLength: 240, type: "string" },
  label: { maxLength: 80, minLength: 1, type: "string" },
  value: { maxLength: 80, type: "string" },
}, ["label"]);

const groupPresentationSchema = objectSchema({
  headingAlign: { enum: ["left", "center"], type: "string" },
  showDivider: { type: "boolean" },
  spacing: { enum: ["compact", "comfortable", "spacious"], type: "string" },
  surface: { enum: ["plain", "section", "card"], type: "string" },
});

const nodePresentationSchema = objectSchema({
  density: { enum: ["compact", "comfortable", "spacious"], type: "string" },
  emphasis: { enum: ["quiet", "standard", "prominent"], type: "string" },
  height: { enum: ["auto", "compact", "standard", "tall"], type: "string" },
  surface: { enum: ["plain", "panel", "muted", "accent"], type: "string" },
});

const visibilitySchema = objectSchema({
  groups: {
    items: objectSchema({
      conditions: {
        items: objectSchema({
          fact: { enum: ["state", "year", "capability", "data", "validation"], type: "string" },
          key: { maxLength: 60, type: "string" },
          operator: { enum: ["equals", "not-equals", "in", "available", "unavailable"], type: "string" },
          value: {},
        }, ["fact", "operator"]),
        maxItems: 8,
        minItems: 1,
        type: "array",
      },
      operator: { enum: ["all", "any"], type: "string" },
    }, ["conditions", "operator"]),
    maxItems: 4,
    type: "array",
  },
  operator: { enum: ["all", "any"], type: "string" },
  viewports: objectSchema({
    desktop: { type: "boolean" },
    mobile: { type: "boolean" },
    tablet: { type: "boolean" },
  }),
});

const productionConfigSchema = objectSchema({
  coverageVariant: { enum: ["list", "cards", "compact"], type: "string" },
  defaultView: { maxLength: 60, type: "string" },
  legendPosition: { enum: ["inline", "below"], type: "string" },
  mapComposition: { enum: ["map-first", "table-first", "split"], type: "string" },
  navigationStyle: { enum: ["tabs", "pills", "sidebar"], type: "string" },
  provenanceInitialState: { enum: ["collapsed", "expanded"], type: "string" },
  provenanceVariant: { enum: ["summary", "expanded", "accordion"], type: "string" },
  snapshotVariant: { enum: ["bars", "metrics", "table"], type: "string" },
  viewOrder: { items: { maxLength: 60, type: "string" }, maxItems: 8, type: "array" },
  visibleViews: { items: { maxLength: 60, type: "string" }, maxItems: 8, type: "array" },
});

const initialBlockProperties = {
  body: { maxLength: 2_000, type: "string" },
  component: customBlockKindSchema,
  items: { items: itemSchema, maxItems: 12, type: "array" },
  title: { maxLength: 100, type: "string" },
  video: objectSchema({
    id: { pattern: "^[a-zA-Z0-9_-]{5,32}$", type: "string" },
    provider: { enum: ["youtube", "vimeo"], type: "string" },
    title: { maxLength: 160, minLength: 1, type: "string" },
  }, ["id", "provider", "title"]),
};

const operationSchemas: JsonSchema[] = [
  operationSchema("update_workspace", {
    patch: objectSchema({
      accentColor: colorSchema(),
      backgroundColor: colorSchema(),
      contentWidth: { enum: ["standard", "wide", "full"], type: "string" },
      defaultTab: tabIdSchema,
      headingStyle: { enum: ["interface", "editorial", "compact"], type: "string" },
      motion: { enum: ["standard", "reduced"], type: "string" },
      mutedTextColor: colorSchema(),
      notesDefault: { enum: ["collapsed", "expanded"], type: "string" },
      radius: { enum: ["square", "subtle", "rounded"], type: "string" },
      shadow: { enum: ["none", "subtle", "raised"], type: "string" },
      spacingScale: { enum: ["tight", "standard", "relaxed"], type: "string" },
      surfaceColor: colorSchema(),
      tabStyle: { enum: ["bar", "pills"], type: "string" },
      textColor: colorSchema(),
      theme: { enum: ["civic", "high-contrast", "warm"], type: "string" },
      typeScale: { enum: ["small", "standard", "large"], type: "string" },
    }),
  }, ["patch"]),
  operationSchema("update_tab", {
    patch: objectSchema({
      density: { enum: ["compact", "comfortable", "spacious"], type: "string" },
      notesPosition: { enum: ["side", "below", "drawer"], type: "string" },
      visible: { type: "boolean" },
    }),
    tabId: tabIdSchema,
  }, ["patch", "tabId"]),
  operationSchema("add_group", {
    ...initialBlockProperties,
    description: { maxLength: 240, type: "string" },
    heading: { maxLength: 100, type: "string" },
    name: { maxLength: 80, minLength: 1, type: "string" },
    presentation: groupPresentationSchema,
    tabId: tabIdSchema,
  }, ["name", "tabId"]),
  operationSchema("update_group", {
    groupId: idSchema,
    patch: objectSchema({
      description: nullableString(240),
      heading: nullableString(100),
      locked: { type: "boolean" },
      name: { maxLength: 80, minLength: 1, type: "string" },
      presentation: groupPresentationSchema,
    }),
  }, ["groupId", "patch"]),
  operationSchema("move_group", { destinationIndex: indexJsonSchema(), groupId: idSchema, tabId: tabIdSchema }, ["destinationIndex", "groupId", "tabId"]),
  operationSchema("duplicate_group", { groupId: idSchema }, ["groupId"]),
  operationSchema("delete_group", { groupId: idSchema }, ["groupId"]),
  operationSchema("add_row", { ...initialBlockProperties, groupId: idSchema }, ["groupId"]),
  operationSchema("update_row", {
    patch: objectSchema({
      align: { enum: ["start", "center", "stretch"], type: "string" },
      gap: { enum: ["small", "medium", "large"], type: "string" },
      locked: { type: "boolean" },
    }),
    rowId: idSchema,
  }, ["patch", "rowId"]),
  operationSchema("move_row", { destinationGroupId: idSchema, destinationIndex: indexJsonSchema(), rowId: idSchema }, ["destinationGroupId", "destinationIndex", "rowId"]),
  operationSchema("duplicate_row", { rowId: idSchema }, ["rowId"]),
  operationSchema("delete_row", { rowId: idSchema }, ["rowId"]),
  operationSchema("add_column", { ...initialBlockProperties, rowId: idSchema }, ["rowId"]),
  operationSchema("update_column", {
    columnId: idSchema,
    patch: objectSchema({
      desktopSpan: { enum: [3, 4, 6, 8, 9, 12], type: "integer" },
      locked: { type: "boolean" },
      tabletSpan: { enum: [6, 12], type: "integer" },
    }),
  }, ["columnId", "patch"]),
  operationSchema("move_column", { columnId: idSchema, destinationIndex: indexJsonSchema(), destinationRowId: idSchema }, ["columnId", "destinationIndex", "destinationRowId"]),
  operationSchema("duplicate_column", { columnId: idSchema }, ["columnId"]),
  operationSchema("delete_column", { columnId: idSchema }, ["columnId"]),
  operationSchema("add_block", { ...initialBlockProperties, columnId: idSchema }, ["columnId", "component"]),
  operationSchema("update_block", {
    nodeId: idSchema,
    patch: objectSchema({
      body: nullableString(2_000),
      config: productionConfigSchema,
      items: { anyOf: [{ items: itemSchema, maxItems: 12, type: "array" }, { type: "null" }] },
      locked: { type: "boolean" },
      presentation: nodePresentationSchema,
      richText: nullableString(8_000),
      title: nullableString(100),
      video: { anyOf: [objectSchema({
        id: { pattern: "^[a-zA-Z0-9_-]{5,32}$", type: "string" },
        provider: { enum: ["youtube", "vimeo"], type: "string" },
        title: { maxLength: 160, minLength: 1, type: "string" },
      }, ["id", "provider", "title"]), { type: "null" }] },
      visibility: { anyOf: [visibilitySchema, { type: "null" }] },
      visible: { type: "boolean" },
    }),
  }, ["nodeId", "patch"]),
  operationSchema("move_block", { destinationColumnId: idSchema, destinationIndex: indexJsonSchema(), nodeId: idSchema }, ["destinationColumnId", "destinationIndex", "nodeId"]),
  operationSchema("duplicate_block", { nodeId: idSchema }, ["nodeId"]),
  operationSchema("delete_block", { nodeId: idSchema }, ["nodeId"]),
];

const operationsSchema: JsonSchema = {
  description: "Atomic editor operations. Get the current draft first and use unique operationId values.",
  items: { oneOf: operationSchemas },
  maxItems: 40,
  minItems: 1,
  type: "array",
};

export const layoutAgentToolDefinitions = [
  toolDefinition(
    "layout_status",
    "Inspect layout control center status",
    "List active named drafts, the latest immutable revision, supported tabs, agent-creatable custom components, and whether the database is configured. This does not change anything.",
    objectSchema({}),
    true,
  ),
  toolDefinition(
    "layout_get_draft",
    "Get a layout draft",
    "Return a named draft's full versioned manifest and an ID-rich structural summary. Call this before proposing changes.",
    objectSchema({ draftId: uuidSchema }, ["draftId"]),
    true,
  ),
  toolDefinition(
    "layout_validate_draft",
    "Validate a layout draft",
    "Run the same schema, required-component, limits, safety, and color-contrast checks used by the production editor.",
    objectSchema({ draftId: uuidSchema }, ["draftId"]),
    true,
  ),
  toolDefinition(
    "layout_diff_draft",
    "Diff a layout draft",
    "Compare a named draft with its base revision, or the latest revision when no base is available. This does not change anything.",
    objectSchema({ draftId: uuidSchema }, ["draftId"]),
    true,
  ),
  toolDefinition(
    "layout_create_draft",
    "Create a named layout draft",
    "Create a mutable named draft from the latest revision, the embedded safe default, or another draft. Requires the exact confirmation token CREATE_DRAFT. This never publishes.",
    objectSchema({
      confirmation: { const: "CREATE_DRAFT", type: "string" },
      name: { maxLength: 80, minLength: 3, type: "string" },
      source: { enum: ["latest", "embedded", "draft"], type: "string" },
      sourceDraftId: uuidSchema,
    }, ["confirmation", "name", "source"]),
    false,
  ),
  toolDefinition(
    "layout_preview_changes",
    "Preview layout changes",
    "Apply a constrained batch in memory, validate it, and return the diff without saving. expectedVersion prevents previewing against stale state.",
    objectSchema({
      draftId: uuidSchema,
      expectedVersion: { minimum: 1, type: "integer" },
      operations: operationsSchema,
    }, ["draftId", "expectedVersion", "operations"]),
    true,
  ),
  toolDefinition(
    "layout_save_changes",
    "Save validated changes to a draft",
    "Atomically apply a constrained operation batch to a named draft using optimistic version checking. Requires SAVE_DRAFT. This never creates a revision or publishes.",
    objectSchema({
      confirmation: { const: "SAVE_DRAFT", type: "string" },
      draftId: uuidSchema,
      expectedVersion: { minimum: 1, type: "integer" },
      operations: operationsSchema,
    }, ["confirmation", "draftId", "expectedVersion", "operations"]),
    false,
  ),
  toolDefinition(
    "layout_create_revision",
    "Create an immutable layout revision",
    "Create an audited immutable revision from a current named draft after human review. Requires CREATE_REVISION. This never stages, schedules, promotes, rolls back, or publishes.",
    objectSchema({
      changeSummary: { maxLength: 500, minLength: 5, type: "string" },
      confirmation: { const: "CREATE_REVISION", type: "string" },
      draftId: uuidSchema,
      expectedVersion: { minimum: 1, type: "integer" },
    }, ["changeSummary", "confirmation", "draftId", "expectedVersion"]),
    false,
  ),
] as const;

export const layoutAgentToolNames = new Set(layoutAgentToolDefinitions.map((tool) => tool.name));

export type LayoutAgentMcpDispatch =
  | { body: Record<string, unknown>; kind: "response" }
  | { kind: "accepted" };

export async function handleLayoutAgentMcpMessage(
  value: unknown,
  executeTool: LayoutAgentToolExecutor,
): Promise<LayoutAgentMcpDispatch> {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") {
    return protocolError(null, -32600, "Invalid JSON-RPC request.");
  }
  const hasId = Object.prototype.hasOwnProperty.call(value, "id");
  const id = validRequestId(value.id) ? value.id : null;
  if (hasId && !validRequestId(value.id)) return protocolError(null, -32600, "JSON-RPC request ID is invalid.");

  if (!hasId) {
    if (value.method === "notifications/initialized" || value.method === "notifications/cancelled") {
      return { kind: "accepted" };
    }
    return { kind: "accepted" };
  }

  if (value.method === "initialize") {
    const params = isRecord(value.params) ? value.params : {};
    const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-11-25";
    const protocolVersion = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"].includes(requestedVersion)
      ? requestedVersion : "2025-11-25";
    return response(id, {
      capabilities: { tools: { listChanged: false } },
      instructions: "This server edits named layout drafts only. Inspect first, preview before saving, preserve source/data trust surfaces, and obtain explicit human approval before CREATE_REVISION. No production publication tool is exposed.",
      protocolVersion,
      serverInfo: {
        description: "Guarded layout control center tools for CivicResultMaps",
        name: "civicresultmaps-layout-control",
        version: "0.1.0",
      },
    });
  }
  if (value.method === "ping") return response(id, {});
  if (value.method === "tools/list") return response(id, { tools: layoutAgentToolDefinitions });
  if (value.method !== "tools/call") return protocolError(id, -32601, `Method ${value.method} is not supported.`);

  const params = isRecord(value.params) ? value.params : null;
  const toolName = params && typeof params.name === "string" ? params.name : "";
  if (!layoutAgentToolNames.has(toolName)) return protocolError(id, -32602, `Unknown layout tool: ${toolName || "missing name"}.`);
  const argumentsValue = params && isRecord(params.arguments) ? params.arguments : {};
  try {
    const execution = await executeTool(toolName, argumentsValue);
    return response(id, {
      content: [{ text: execution.message, type: "text" }],
      isError: false,
      structuredContent: execution.structuredContent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The layout tool failed.";
    return response(id, {
      content: [{ text: message, type: "text" }],
      isError: true,
      structuredContent: { error: message, ok: false },
    });
  }
}

function toolDefinition(
  name: string,
  title: string,
  description: string,
  inputSchema: JsonSchema,
  readOnly: boolean,
) {
  return {
    annotations: {
      destructiveHint: false,
      idempotentHint: readOnly,
      openWorldHint: false,
      readOnlyHint: readOnly,
    },
    description,
    inputSchema,
    name,
    outputSchema: { additionalProperties: true, type: "object" },
    title,
  };
}

function operationSchema(type: string, properties: Record<string, JsonSchema>, required: string[] = []) {
  return objectSchema({
    operationId: operationIdSchema,
    type: { const: type, type: "string" },
    ...properties,
  }, ["operationId", "type", ...required]);
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
    type: "object",
  };
}

function colorSchema(): JsonSchema {
  return { pattern: "^#[0-9a-fA-F]{6}$", type: "string" };
}

function nullableString(maxLength: number): JsonSchema {
  return { anyOf: [{ maxLength, type: "string" }, { type: "null" }] };
}

function indexJsonSchema(): JsonSchema {
  return { maximum: 100, minimum: 0, type: "integer" };
}

function response(id: JsonRpcId, result: Record<string, unknown>): LayoutAgentMcpDispatch {
  return { body: { id, jsonrpc: "2.0", result }, kind: "response" };
}

function protocolError(id: JsonRpcId, code: number, message: string): LayoutAgentMcpDispatch {
  return { body: { error: { code, message }, id, jsonrpc: "2.0" }, kind: "response" };
}

function validRequestId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "number" || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
