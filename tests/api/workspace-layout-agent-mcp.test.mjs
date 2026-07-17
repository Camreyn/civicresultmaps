import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  authorizeLayoutAgentRequest,
  constantTimeTokenMatch,
  isAllowedLayoutAgentOrigin,
  parseBearerToken,
} from "../../src/lib/ui-layout-agent-auth.ts";
import {
  handleLayoutAgentMcpMessage,
  layoutAgentToolDefinitions,
  layoutAgentToolNames,
} from "../../src/lib/ui-layout-agent-mcp.ts";

const token = "a-secure-layout-agent-token-with-more-than-32-characters";
const enabledEnvironment = {
  NODE_ENV: "production",
  UI_LAYOUT_AGENT_ENABLED: "true",
  UI_LAYOUT_AGENT_TOKEN: token,
};

test("layout MCP surface is draft-first and exposes no publication tool", () => {
  assert.deepEqual([...layoutAgentToolNames], [
    "layout_status",
    "layout_get_draft",
    "layout_validate_draft",
    "layout_diff_draft",
    "layout_create_draft",
    "layout_preview_changes",
    "layout_save_changes",
    "layout_create_revision",
  ]);
  assert.equal([...layoutAgentToolNames].some((name) => /publish|promote|rollback|schedule/.test(name)), false);
  assert.equal(layoutAgentToolDefinitions.every((tool) => tool.annotations.openWorldHint === false), true);
  assert.equal(layoutAgentToolDefinitions.every((tool) => tool.annotations.destructiveHint === false), true);
  assert.equal(layoutAgentToolDefinitions.find((tool) => tool.name === "layout_preview_changes")?.annotations.readOnlyHint, true);
  assert.equal(layoutAgentToolDefinitions.find((tool) => tool.name === "layout_save_changes")?.annotations.readOnlyHint, false);

  const getDraftSchema = layoutAgentToolDefinitions.find((tool) => tool.name === "layout_get_draft")?.inputSchema;
  assert.equal(getDraftSchema.properties.draftId.format, "uuid");
});

test("layout MCP negotiates, lists, and calls tools with structured results", async () => {
  const initialize = await handleLayoutAgentMcpMessage({
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: { capabilities: {}, clientInfo: { name: "test", version: "1" }, protocolVersion: "2025-06-18" },
  }, async () => assert.fail("initialize must not call a tool"));
  assert.equal(initialize.kind, "response");
  assert.equal(initialize.body.result.protocolVersion, "2025-06-18");
  assert.equal(initialize.body.result.capabilities.tools.listChanged, false);

  const list = await handleLayoutAgentMcpMessage({ id: "tools", jsonrpc: "2.0", method: "tools/list" }, async () => assert.fail());
  assert.equal(list.kind, "response");
  assert.equal(list.body.result.tools.length, 8);

  const call = await handleLayoutAgentMcpMessage({
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: {}, name: "layout_status" },
  }, async (name, argumentsValue) => ({
    message: `${name} completed`,
    structuredContent: { argumentsValue, ok: true },
  }));
  assert.equal(call.body.result.isError, false);
  assert.equal(call.body.result.structuredContent.ok, true);
  assert.match(call.body.result.content[0].text, /layout_status completed/);
});

test("layout MCP returns actionable tool errors without leaking protocol internals", async () => {
  const failed = await handleLayoutAgentMcpMessage({
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: {}, name: "layout_save_changes" },
  }, async () => {
    throw new Error("Draft version conflict. Reload before retrying.");
  });
  assert.equal(failed.body.result.isError, true);
  assert.match(failed.body.result.content[0].text, /version conflict/i);

  const unknown = await handleLayoutAgentMcpMessage({
    id: 4,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: {}, name: "layout_publish" },
  }, async () => assert.fail());
  assert.equal(unknown.body.error.code, -32602);

  const notification = await handleLayoutAgentMcpMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, async () => assert.fail());
  assert.equal(notification.kind, "accepted");
});

test("layout agent bearer authentication fails closed and validates origins", () => {
  const authorizedHeaders = new Headers({ authorization: `Bearer ${token}` });
  assert.deepEqual(authorizeLayoutAgentRequest(authorizedHeaders, enabledEnvironment), { kind: "authorized" });
  assert.equal(authorizeLayoutAgentRequest(authorizedHeaders, { ...enabledEnvironment, UI_LAYOUT_AGENT_ENABLED: "false" }).kind, "disabled");
  assert.equal(authorizeLayoutAgentRequest(new Headers({ authorization: "Bearer wrong" }), enabledEnvironment).kind, "unauthorized");
  assert.equal(authorizeLayoutAgentRequest(authorizedHeaders, { ...enabledEnvironment, UI_LAYOUT_AGENT_TOKEN: "short" }).kind, "misconfigured");
  assert.equal(authorizeLayoutAgentRequest(new Headers({
    authorization: `Bearer ${token}`,
    origin: "https://attacker.example",
  }), enabledEnvironment).kind, "forbidden");
  assert.equal(isAllowedLayoutAgentOrigin("https://civicresultmaps.org", enabledEnvironment), true);
  assert.equal(isAllowedLayoutAgentOrigin("https://attacker.example", enabledEnvironment), false);
  assert.equal(parseBearerToken(`Bearer ${token}`), token);
  assert.equal(parseBearerToken(`Basic ${token}`), undefined);
  assert.equal(constantTimeTokenMatch(token, token), true);
  assert.equal(constantTimeTokenMatch(token, `${token}x`), false);
});

test("layout MCP route enforces auth, body limits, no-store responses, and no publication call", () => {
  const route = readFileSync("src/app/api/admin/layout-agent/mcp/route.ts", "utf8");
  const tools = readFileSync("src/lib/ui-layout-agent-tools.ts", "utf8");
  assert.match(route, /authorizeLayoutAgentRequest/);
  assert.match(route, /UI_LAYOUT_AGENT_MAX_BODY_BYTES/);
  assert.match(route, /no-store/);
  assert.match(route, /Array\.isArray\(message\)/);
  assert.doesNotMatch(tools, /createLayoutPublication|dispatchLayoutPublisher|updateLayoutPublication/);
});
