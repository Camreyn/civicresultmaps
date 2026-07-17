# Layout Agent Tooling

The Layout Control Center exposes a guarded MCP endpoint at `/api/admin/layout-agent/mcp` and an installable Codex plugin in `plugins/civic-layout-control`. Together they let an LLM inspect and edit the same named layout drafts used by `/admin/layout` without granting database, Edge Config, or production-publishing access.

This interface is draft-first. An agent can preview and save constrained editor operations, and it can create an audited immutable revision after explicit review. It cannot stage, schedule, promote, roll back, or publish a layout.

## Tool surface

| Tool | Effect | Required confirmation |
| --- | --- | --- |
| `layout_status` | Lists active drafts, latest revision, tabs, and agent-creatable content components | None; read-only |
| `layout_get_draft` | Returns a draft manifest, current optimistic version, and object IDs | None; read-only |
| `layout_validate_draft` | Runs the production schema, registry, limits, safety, and contrast checks | None; read-only |
| `layout_diff_draft` | Compares a draft with its base or latest immutable revision | None; read-only |
| `layout_create_draft` | Creates a named draft from latest, embedded, or another draft | `CREATE_DRAFT` |
| `layout_preview_changes` | Applies an operation batch in memory and returns its diff | None; read-only |
| `layout_save_changes` | Saves a validated batch with optimistic version checking | `SAVE_DRAFT` |
| `layout_create_revision` | Creates an immutable, audited revision from a current draft | `CREATE_REVISION` |

The operation vocabulary covers workspace settings, tab settings, groups, rows, columns, and content blocks. Adds and duplicates derive stable object IDs from each operation's unique `operationId`, allowing a later operation to refer to something added earlier in the same batch.

Image uploads remain in the Clerk-protected visual editor because they require managed Vercel Blob assets. The agent may adjust an existing image block's supported presentation, but it cannot mint or substitute asset references.

There is no arbitrary JSON Patch operation. Every edit reuses the workspace's code-owned schema and constraints, including:

- required tabs and production components;
- locked containers and components;
- safe responsive spans and per-tab row/content limits;
- approved custom block types, links, visibility facts, and production variants;
- color contrast and complete-manifest validation;
- custom-only deletion and duplication rules.

## Server configuration

Configure these only in environments where the agent endpoint should exist:

| Variable | Required | Purpose |
| --- | --- | --- |
| `UI_LAYOUT_AGENT_ENABLED` | Yes | Fail-closed switch; must equal `true` |
| `UI_LAYOUT_AGENT_TOKEN` | Yes | Server-side bearer secret, at least 32 characters |
| `UI_LAYOUT_AGENT_ALLOWED_ORIGINS` | No | Additional comma-separated HTTPS origins; missing `Origin` is allowed for server clients |
| `UI_LAYOUT_AGENT_ACTOR_ID` | No | Audit actor ID; defaults to `codex-layout-agent` |
| `UI_LAYOUT_AGENT_ACTOR_EMAIL` | No | Audit actor email; defaults to `layout-agent@civicresultmaps.org` |

Use one randomly generated token value for both the server's `UI_LAYOUT_AGENT_TOKEN` and the Codex client's `CIVIC_LAYOUT_AGENT_TOKEN`. The names differ so server and client responsibilities remain clear. Never place the value in the repository or a chat transcript.

Generate a token locally, then paste it into the Vercel prompt rather than placing it on a command line:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx vercel env add UI_LAYOUT_AGENT_TOKEN production
npx vercel env add UI_LAYOUT_AGENT_ENABLED production
```

Set the enabled value to `true`. Add both variables to `preview` as well if preview deployments should accept tool calls. Redeploy after changing the environment.

On the machine running Codex, set the client variable to the same token without committing it:

```powershell
[Environment]::SetEnvironmentVariable("CIVIC_LAYOUT_AGENT_TOKEN", "paste-token-here", "User")
```

Open a new console and a new Codex task afterward so the process receives the variable and newly installed plugin.

## Install the Codex plugin

After this code is merged into the branch being deployed, add the repository marketplace and install the plugin:

```powershell
codex plugin marketplace add Camreyn/civicresultmaps --ref main
codex plugin add civic-layout-control@civicresultmaps
```

For local development before merge, replace the first command's GitHub source with the absolute repository path. Re-run the second command after plugin updates so Codex refreshes its installed cache, then start a new task.

The bundled skill guides Codex through this sequence:

1. inspect status and load the exact draft version;
2. propose the smallest constrained operation batch;
3. preview and explain the structured diff;
4. save only after approval;
5. reload after save;
6. create an immutable revision only after separate explicit review.

## Protocol and authentication behavior

The endpoint is a stateless Streamable HTTP MCP server. Each JSON-RPC request uses `POST`; initialization notifications receive `202`, and requests receive `application/json`. A `GET` request returns `405` because the server does not offer an SSE stream.

Requests fail closed when the feature switch or token is absent. Tokens are compared through fixed-length SHA-256 digests with a timing-safe comparison. The route also validates any supplied origin, caps bodies at 256 KB, accepts JSON only, rejects JSON-RPC batches, emits `no-store`, and does not return secrets or raw database credentials.

Draft saves use `expectedVersion`. A stale call returns the current-version conflict and must be reconciled after `layout_get_draft`; the agent must not retry blindly. Revision creation also requires that the draft's base still equals the latest immutable revision.

## Smoke test

With the client token loaded in the current console, verify initialization without exposing it in the request body:

```powershell
$headers = @{
  Accept = "application/json, text/event-stream"
  Authorization = "Bearer $env:CIVIC_LAYOUT_AGENT_TOKEN"
  "Content-Type" = "application/json"
}
$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "initialize"
  params = @{
    protocolVersion = "2025-06-18"
    capabilities = @{}
    clientInfo = @{ name = "layout-smoke-test"; version = "1.0" }
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri "https://civicresultmaps.org/api/admin/layout-agent/mcp" -Headers $headers -Body $body
```

Then ask Codex to use Civic Layout Control to inspect drafts. The first modifying test should create or use a disposable named draft, preview one small change, save it, and confirm that `/admin/layout` shows the new draft version while the public site remains unchanged.

## Verification

Run:

```powershell
npm run test:layout
npm run typecheck
npm run build
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" plugins\civic-layout-control\skills\layout-control
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" plugins\civic-layout-control
```

The MCP unit tests verify tool annotations, protocol negotiation, structured tool errors, bearer authentication, origin checks, body limits, the absence of publication calls, deterministic additions, deletion behavior, protected components, and contrast failures.
