import {
  UI_LAYOUT_AGENT_MAX_BODY_BYTES,
  authorizeLayoutAgentRequest,
  isAllowedLayoutAgentOrigin,
} from "@/lib/ui-layout-agent-auth";
import { handleLayoutAgentMcpMessage } from "@/lib/ui-layout-agent-mcp";
import { executeLayoutAgentTool } from "@/lib/ui-layout-agent-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = authorizeLayoutAgentRequest(request.headers);
  if (authorization.kind !== "authorized") {
    return jsonRpcHttpError(authorization.status, -32001, authorization.message, request, authorization.kind === "unauthorized");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonRpcHttpError(415, -32600, "Content-Type must be application/json.", request);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > UI_LAYOUT_AGENT_MAX_BODY_BYTES) {
    return jsonRpcHttpError(413, -32600, "MCP request body is too large.", request);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonRpcHttpError(400, -32700, "Unable to read the JSON request body.", request);
  }
  if (new TextEncoder().encode(rawBody).byteLength > UI_LAYOUT_AGENT_MAX_BODY_BYTES) {
    return jsonRpcHttpError(413, -32600, "MCP request body is too large.", request);
  }

  let message: unknown;
  try {
    message = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonRpcHttpError(400, -32700, "Request body is not valid JSON.", request);
  }
  if (Array.isArray(message)) {
    return jsonRpcHttpError(400, -32600, "JSON-RPC batches are not supported by this stateless endpoint.", request);
  }

  const dispatch = await handleLayoutAgentMcpMessage(message, executeLayoutAgentTool);
  if (dispatch.kind === "accepted") {
    return new Response(null, { headers: responseHeaders(request), status: 202 });
  }
  return Response.json(dispatch.body, { headers: responseHeaders(request), status: 200 });
}

export function GET(request: Request) {
  const authorization = authorizeLayoutAgentRequest(request.headers);
  if (authorization.kind !== "authorized") {
    return jsonRpcHttpError(authorization.status, -32001, authorization.message, request, authorization.kind === "unauthorized");
  }
  return jsonRpcHttpError(405, -32601, "This MCP server does not provide an SSE stream; send each request with POST.", request);
}

export function OPTIONS(request: Request) {
  if (!isAllowedLayoutAgentOrigin(request.headers.get("origin"))) {
    return new Response(null, { headers: responseHeaders(request), status: 403 });
  }
  return new Response(null, {
    headers: {
      ...responseHeaders(request),
      "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "600",
    },
    status: 204,
  });
}

function jsonRpcHttpError(
  status: number,
  code: number,
  message: string,
  request: Request,
  authenticate = false,
) {
  return Response.json({ error: { code, message }, id: null, jsonrpc: "2.0" }, {
    headers: {
      ...responseHeaders(request),
      ...(authenticate ? { "www-authenticate": 'Bearer realm="civic-layout-control"' } : {}),
    },
    status,
  });
}

function responseHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    ...(origin && isAllowedLayoutAgentOrigin(origin) ? { "access-control-allow-origin": new URL(origin).origin } : {}),
    "cache-control": "no-store, max-age=0",
    vary: "Origin",
    "x-content-type-options": "nosniff",
  };
}
