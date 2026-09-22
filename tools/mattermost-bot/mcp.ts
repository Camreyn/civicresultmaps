import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer, fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { handleDoctor } from "../civicresultmaps-mcp/tools.ts";
import { requireCatalogState } from "../civicresultmaps-mcp/catalog.ts";
import { resolveStateWorkflow } from "../civicresultmaps-mcp/workflows.ts";
import { createRuntimeContext, type RuntimeContext } from "../civicresultmaps-mcp/runtime.ts";
import { resolveReadableInsideRepo } from "../civicresultmaps-mcp/runtime.ts";
import { BotError, CAVEAT, FAMILIES, YEARS, MAX_ROWS, exportState, pick, publicText, readMetadata, readSnapshot, record, rows, type Family, type Row } from "./data.ts";

export const BOT_TOOL_NAMES = ["crm_state_inventory", "crm_report_indicators", "crm_export_state_csv"] as const;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const stateSchema = { type: "string", pattern: "^[A-Z]{2}$" };
const yearSchema = { type: "integer", enum: [...YEARS] };
function schema(properties: Row, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false } as JsonSchemaType;
}

// A separate, in-process MCP facade. No STDIO child, network MCP endpoint, arbitrary
// tool forwarding, or registration of the development server's action tools.
export function createBotMcpServer(context: RuntimeContext = createRuntimeContext()) {
  const server = new McpServer({ name: "civicresultmaps-mattermost-reader", version: "1.0.0" }, {
    capabilities: { tools: {} }, instructions: "Read-only state summaries and bounded local-staging CSVs. No execution, collection, imports, publication, or database access.",
  });
  const guarded = async (work: () => Promise<Row>) => {
    try {
      const result = await work();
      return { content: [{ type: "text" as const, text: "Read-only CivicResultMaps response." }], structuredContent: result };
    } catch (error) {
      const message = error instanceof BotError ? error.message : "The local data read failed. Ask the bot operator to inspect the staging/configuration; no partial data was returned.";
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    }
  };
  server.registerTool("crm_state_inventory", {
    description: "Sanitized state inventory and staging counts. Does not verify the live site.", annotations,
    inputSchema: fromJsonSchema<{ state: string }>(schema({ state: stateSchema }, ["state"])),
  }, ({ state }) => guarded(async () => {
    const metadata = await requireCatalogState(context, state);
    const [config, acquisitionFile, packageFile] = await Promise.all([
      readMetadata(context, metadata.configPath), readMetadata(context, "data/source-acquisition-tiers.json"), readMetadata(context, "package.json"),
    ]);
    const acquisition = rows(acquisitionFile.states).filter(row => row.state === state);
    const warnings: string[] = [];
    let snapshot;
    try { snapshot = await readSnapshot(context, state); }
    catch (error) {
      if (!(error instanceof BotError) || !error.message.startsWith("No readable staging artifact")) throw error;
      warnings.push(error.message);
    }
    const native = record(snapshot?.artifact.native);
    const scripts = Object.fromEntries(Object.entries(record(packageFile.scripts)).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    for (const kind of ["validate", "import"] as const) {
      if (resolveStateWorkflow(kind, state, "full", scripts).drift.length) warnings.push(`Full ${kind} is disabled by workflow drift.`);
    }
    return {
      state, name: publicText(metadata.name), authority: publicText(config.authority),
      electionYear: Number.isSafeInteger(config.electionYear) ? config.electionYear : null, sourceCount: rows(config.sources).length,
      staging: { exists: Boolean(snapshot), modifiedAt: snapshot?.modifiedAt ?? "",
        rows: Object.fromEntries([['results', 'resultRows'], ['review', 'reviewRows'], ['turnout', 'turnoutRows'], ['historical', 'historicalRows'], ['historicalReview', 'historicalReviewRows']].map(([key, field]) => [key, rows(native[field]).length])) },
      gaps: acquisition.flatMap(row => Array.isArray(row.missingFields) ? row.missingFields.map(publicText) : []),
      sourceCaveats: acquisition.map(row => publicText(row.caveats)).filter(Boolean),
      warnings, caveat: CAVEAT,
    };
  }));
  server.registerTool("crm_report_indicators", {
    description: "Calculated staging advisory counts, not stored production indicators or misconduct evidence.", annotations,
    inputSchema: fromJsonSchema<{ state: string; year?: number }>(schema({ state: stateSchema, year: { type: "integer", enum: [2016, 2020, 2024] } }, ["state"])),
  }, ({ state, year = 2024 }) => guarded(async () => {
    const snapshot = await readSnapshot(context, state);
    const native = record(snapshot.artifact.native);
    const review = rows(year === 2024 ? native.reviewRows : native.historicalReviewRows);
    if (review.length > MAX_ROWS) throw new BotError("Review rows exceed the safe calculation limit.");
    const modulePath = await resolveReadableInsideRepo(context, "scripts/report-staging-indicator-counts.mjs");
    const modified = (await stat(modulePath)).mtimeMs;
    const report = await import(`${pathToFileURL(modulePath).href}?mtime=${modified}`) as { buildArtifactIndicatorReport: (artifact: Row, year: number, state: string) => Row };
    const entry = report.buildArtifactIndicatorReport(snapshot.artifact, year, state);
    return { state, year, ...pick(entry, ["reviewRows", "indicatorRows", "flaggedAreas", "uniqueFlaggedCountyJurisdictions", "uniqueFlaggedJurisdictions", "evaluated", "evaluationReason", "evaluationCaveat", "broadSignalWarning"]),
      byType: Object.fromEntries(Object.entries(record(entry.byType)).map(([key, value]) => [publicText(key), typeof value === "number" ? value : null])),
      caveat: CAVEAT };
  }));
  server.registerTool("crm_export_state_csv", {
    description: "Complete bounded CSV for one state and approved staging family; never arbitrary paths or queries.", annotations,
    inputSchema: fromJsonSchema<{ state: string; family: Family; year?: number }>(schema({ state: stateSchema, family: { type: "string", enum: [...FAMILIES] }, year: yearSchema }, ["state", "family"])),
  }, ({ state, family, year }) => guarded(() => exportState(context, state, family, year)));
  return server;
}

export type Reader = { call: (name: typeof BOT_TOOL_NAMES[number], args: Row) => Promise<Row>; close: () => Promise<void> };
export async function connectReader(context: RuntimeContext = createRuntimeContext()): Promise<Reader> {
  const server = createBotMcpServer(context);
  const client = new Client({ name: "mattermost-state-bot", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  } catch (error) {
    await Promise.allSettled([client.close(), server.close()]);
    throw error;
  }
  return {
    async call(name, args) {
      if (!BOT_TOOL_NAMES.includes(name)) throw new BotError("That MCP tool is not available to the bot.");
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) {
        const content = Array.isArray(result.content) ? result.content : [];
        throw new BotError(content.filter(item => item.type === "text").map(item => publicText(item.text)).join(" ") || "MCP read failed.");
      }
      if (!result.structuredContent) throw new BotError("MCP returned no structured data.");
      return result.structuredContent as Row;
    },
    async close() { await Promise.allSettled([client.close(), server.close()]); },
  };
}

// Operator startup check only: not exposed as a chat command and never forwards
// repository paths, runtime details, or the raw doctor response to Mattermost.
export async function checkMcpHealth(context: RuntimeContext = createRuntimeContext()) {
  const response = await handleDoctor(context);
  const envelope = response.structuredContent;
  if (!envelope.ok || envelope.warnings.length || rows(record(envelope.result).workflowDrift).length) {
    throw new BotError("MCP startup health check needs operator review. Run crm_doctor in the trusted project before starting the bot.");
  }
}
