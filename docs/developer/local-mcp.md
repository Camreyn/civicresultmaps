# Local CivicResultMaps MCP Server

The CivicResultMaps MCP server is a private local development bridge for
ChatGPT Desktop and Codex. It is not part of the Next.js application, has no
HTTP endpoint, and is never deployed to Vercel or the production site.

The tracked server lives in `tools/civicresultmaps-mcp/`. It uses the official
MCP TypeScript SDK over STDIO. ChatGPT or Codex launches it as a child process
for the current trusted checkout. STDOUT is reserved for the MCP protocol;
local diagnostics go to STDERR and generated run audits go to
`.etl/mcp-runs/`.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.codex/config.toml.example` to `.codex/config.toml` and replace the
   placeholders with absolute paths. This checkout already has a machine-local
   ignored config using Node at `C:\Program Files\nodejs\node.exe` and Python at
   `C:\Python313\python.exe`.
3. Trust this repository when Codex asks whether project configuration should
   load.
4. Restart ChatGPT Desktop or Codex so it reloads the MCP process.
5. Inspect the server with `/mcp`, then call `crm_doctor`.

## Automatic startup verification

The active and example project configurations set `required = true`. For a
trusted checkout, ChatGPT or Codex starts a fresh STDIO child process when the
project loads or resumes and fails that startup if the server cannot initialize.
A reboot therefore does not require a Windows service or manual daemon: opening
the project starts a new host-owned process.

The repository `AGENTS.md` requires every new task to call `crm_doctor` once
before substantive work. If the tool is absent or unhealthy, the task pauses for
MCP diagnosis unless the user explicitly approves working without it.

The repo-local `civicresultmaps-mcp` skill provides the full guarded workflow.
Select `@civicresultmaps-mcp` in ChatGPT Desktop or invoke
`$civicresultmaps-mcp` in Codex. The skill is reusable guidance; `AGENTS.md` is
what makes the health check automatic for every repository task. Codex normally
detects skill changes automatically; restart the local host if the skill does
not appear.

Project-scoped MCP configuration, tool allowlists, timeouts, and the `writes`
approval mode are documented in the
[OpenAI MCP guide](https://learn.chatgpt.com/docs/extend/mcp). The `writes`
mode prompts for tools that are not marked read-only. Doctor, inventory,
indicator reports, coverage gaps, value traces, and release-readiness reports
are read-only. Delivery verification is an action because optional browser
evidence saves local screenshots; test profiles are actions as well.

For a standalone manual smoke test, use the MCP Inspector:

```powershell
npx @modelcontextprotocol/inspector "C:\Program Files\nodejs\node.exe" --experimental-strip-types tools/civicresultmaps-mcp/server.ts
```

ChatGPT web does not launch project-local STDIO processes. Use ChatGPT Desktop,
Codex, or another local MCP host.

## Tool surface

| Tool | Behavior |
| --- | --- |
| `crm_doctor` | Reports runtime, state/config coverage, workflow drift, local connection status, and unavailable production actions. |
| `crm_state_inventory` | Reads one state's metadata, ETL config, source inventories, workflow availability, and staging status. |
| `crm_validate_state` | Runs direct config validation or a reviewed full preparation-and-validation workflow. |
| `crm_import_staging` | Builds only `.etl/staging/<state>-2024-staging.json`, verifies it, and reports advisory indicators. |
| `crm_report_indicators` | Reads staging review rows and reports advisory indicator counts and caveats. |
| `crm_compare_staging` | Runs exact staging overlays against a fixed production or localhost read API and flags year/row reductions. |
| `crm_run_validator` | Runs one validator from the fixed registry. |
| `crm_verify_state_delivery` | Compares staging to revision-fenced public API reads; optional numeric browser checks cover county table text, joined map tooltips, and up to five drawers. Explicit smoke-only mode remains available. |
| `crm_release_readiness` | Projects the exact candidate state set using importer replacement rules, flags live row/year removals and provenance problems, and records artifact hashes. Read-only; never publishes. |
| `crm_coverage_gaps` | Summarizes national or selected state/year coverage by data family with evidence boundaries and explicit next-work reasons. Public API reads are optional. |
| `crm_trace_value` | Resolves a staged numeric field to recorded source/parser/artifact evidence, reporting ambiguity and missing lineage instead of inferring it. |
| `crm_run_test_profile` | Runs a fixed reviewed local test profile after explicit confirmation, with a credential-stripped child environment and redacted audit logs. |
| `crm_record_source_revision` | Retains immutable config-selected source bytes and observed code/config/staging fingerprints, with explicit lineage and revision differences. |
| `crm_rehearse_database` | Exercises migrations, actual imports, idempotence, rollback, restore, and application loaders against a new labelled disposable local Docker database. |
| `crm_plan_verification` | Reads changed paths and code/data identities to recommend additive focused checks while preserving global gates. |
| `crm_capture_release_evidence` | Captures actual audit/log bytes only after checking reviewed audit digests and exact candidate code/staging bindings. Never grants release approval. |
| `crm_validate_model` | Runs synthetic-only inference diagnostics and structural/provenance readiness checks; no election fitting, outcome probabilities, or political scoring. |

The server never exposes arbitrary shell, path, URL, SQL, environment, package
script, Git publication, production promotion, existing-database mutation, or
jurisdiction-backfill-apply input. Full state workflows and validators are
translated into direct executable-plus-argument arrays and launched without a
shell.

Some reviewed state preparation steps collect official source artifacts or
rewrite reproducible normalized files. These tools are intentionally marked as
actions so the local host prompts before running them. Run manifests contain
the commit/dirty state, direct command arrays, durations, exit status, redacted
output logs, and before/after worktree summaries.

## Verification report contracts (version 0.3; 17 tools)

See [the five-capability guide](mcp-verification-expansion.md) for definitions,
copyable CRM examples, test commands, and current verification results.

The top-level `ok` means the tool produced a report, **not** that the report
passed. Always inspect `result.status`, individual checks, blockers, and
caveats. Reports include `reportSha256` so saved evidence can be identified;
this hashes the returned report, not a signed certification.

Examples of tool arguments:

```json
{"tool":"crm_verify_state_delivery","arguments":{"state":"WI","year":2024,"target":"production","browser":false}}
{"tool":"crm_release_readiness","arguments":{"states":["WI","MN"],"target":"production","maxArtifactAgeHours":24}}
{"tool":"crm_coverage_gaps","arguments":{"years":[2016,2020,2024],"target":"none"}}
{"tool":"crm_trace_value","arguments":{"state":"WI","year":2024,"family":"results","jurisdictionName":"Dane County","field":"votes","candidate":"Harris"}}
{"tool":"crm_run_test_profile","arguments":{"profile":"api-contract","confirmation":"RUN_TEST_PROFILE"}}
```

Delivery/readiness targets are fixed to `http://127.0.0.1:3000` and
`https://www.civicresultmaps.org`. They use unauthenticated public GETs, never
database credentials. Responses that are unavailable, seeded, too large,
out of scope, or potentially truncated are inconclusive. Review, turnout,
and historical endpoints support opt-in `paginate=true` revision-fenced reads.
Legacy responses retain their 5,000-row cap; older deployed endpoints remain
inconclusive at that cap. New paging requires deployment of the API changes.

Delivery compares the native representation with the API's actual field
transformations, not database-generated IDs. Advisory counts are calculated
with the importer's existing calculation path. The optional browser check
requires the installed Playwright Chromium runtime and a reachable target;
it does not start a server or use a signed-in browser. It checks selected
state/year surfaces, runtime errors, and captures a unique local screenshot.
By default it compares actual rendered county table values, map tooltip
percentages, and up to five drawers to staging-verified API values. Explicit
`browserMode: "smoke"` checks structure only. Other charts and non-county
renderers remain unverified; a screenshot alone is not numeric proof.
Unsupported or absent evidence remains explicit. No 2012 advisory calculation
is currently supported.

Readiness reports require reviewed staging identities, source links, fresh
artifact timestamps, and a known clean worktree. Default maximum artifact age
is 24 hours (allowed range: 1–168 integer hours). Optional expected SHA-256
digests pin each candidate artifact, which is rechecked after API reads.
Proposed additions and value changes are reported; unexplained row removals,
duplicate identities, tag conflicts, and incomplete reads block readiness.
The report does not run the full validator suite and is never publication
authorization. Preserve all historical years when staging would replace them.

Value traces currently start from `.etl/staging/<state>-2024-staging.json`,
including its historical rows. Candidate selection applies only to result
vote fields. A unique staged match does not prove source correctness: retained
bytes are hash-verified only when a declared structured source digest matches.
Observed hashes without a reviewed digest, missing files, multi-file source
descriptions, and absent page/sheet/cell lineage remain explicitly unverified.

Only `mcp-contract` and `api-contract` test profiles are currently reviewed.
They accept no command, path, environment, arbitrary argument, or production
test target. Test timeouts, cancellation, spawn failures, and package-alias
drift do not count as passes. ETL state workflows and other validators remain
available through their existing dedicated tools; a general browser/ETL
test-profile runner has not been enabled.

## How repository updates are handled

The server rereads the following on every tool call:

- `scripts/state-metadata.mjs`
- `etl/state-configs/*.json`
- source package and acquisition inventories
- current staging artifacts
- current `package.json` scripts

New ordinary config-driven states therefore become available without changing
the MCP implementation. Source, config, inventory, and staging edits also show
up on the next call.

Compound state workflows and validator chains use a checked declarative
registry. If an existing package alias changes, or a new nonstandard alias is
added, `crm_doctor` reports drift and the affected action refuses to run. Review
the changed workflow, update the registry and its tests, then restart the MCP
server. New tools, schemas, validators, or server code also require a restart.

## Verification and troubleshooting

Run the focused suite with:

```powershell
npm.cmd run test:mcp
npm.cmd run typecheck
```

Common diagnostics:

- Tool missing: confirm `.codex/config.toml`, repository trust, and restart the
  local host.
- Startup failure: run `npm run mcp:crm`; errors must appear only on STDERR.
- Full workflow disabled: call `crm_doctor` and reconcile the reported package
  script with `tools/civicresultmaps-mcp/workflows.ts`.
- Action failure: inspect the returned `.etl/mcp-runs/<run-id>/manifest.json`
  and step logs before retrying.
- Browser launch denied: a sandbox process-launch denial is not evidence that
  Chromium is missing. Request scoped execution permission; install a browser
  only if the tool specifically reports a missing binary.
- Local comparison failure: start the Next.js development server before using
  `target: "local"`. Network failures are inconclusive and never fall back to
  production silently.

Advisory indicators and comparison reports identify data gaps, reconciliation
issues, and review signals only. They are not evidence of fraud or misconduct.
