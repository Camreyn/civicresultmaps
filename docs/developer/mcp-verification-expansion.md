# CivicResultMaps verification tools: definitions and examples

September 8, 2026. The five capabilities below extend the local MCP to version
0.3.0 with 17 tools. They are local development tools, not production publishing
authority. The statistical capability is deliberately synthetic QA/data
readiness, not the previously discussed election-prediction backtest.

## 1. Displayed-value and complete-API verification

**Tool: `crm_verify_state_delivery`.** Compares reviewed staging to public API
data, then optionally checks the actual text rendered in CRM's county table,
map tooltips, and an inspected drawer sample. It detects a wrong displayed
value even when the page loads and row counts look correct.

Example: after changing the Wisconsin importer or ResultsExplorer, verify
the local app against the retained Wisconsin staging artifact:

```json
{"tool":"crm_verify_state_delivery","arguments":{"state":"WI","year":2024,"target":"local","browser":true,"browserMode":"values"}}
```

The local app must already be reachable at `http://127.0.0.1:3000`; the tool
never starts it. `target: "production"` makes read-only public requests to the
fixed CRM site. Playwright Chromium must be installed. `browserMode: "smoke"`
explicitly opts out of number comparison.

Numeric checks cover all supported county table rows, joined map tooltip
percentages, and up to five deterministically selected drawers. Other charts,
non-county renderers, source-document correctness, and unselected years are not
verified. Expected numbers are accepted by the browser adapter only after the
delivery workflow has compared API values with staging. Seed responses cannot
establish that match.

Review, turnout, and historical APIs now support opt-in `paginate=true` with
bounded `limit`, `offset`, and the first page's `dataRevision` as `revision` on
later pages. Pages use uncached strict database reads and stable row ordering.
A revision change returns 409; unavailable database evidence returns 503.
The client requires progress, unique row IDs, consistent revision, and the
terminal total, bounded to 200 pages, 80 MiB, and 60 seconds. This is a revision
fence, not a snapshot transaction; writers must bump the public revision.
Old deployed APIs fall back to the legacy request and stay inconclusive at
the 5,000-row cap. New API behavior requires a separate deployment.

## 2. Immutable sources and traceable values

**Tool: `crm_record_source_revision`.** Copies one config-selected retained
source into content-addressed local storage, records source/config/staging and
observed parser-code identities, and compares it with the prior recorded
revision. Originals are not overwritten or downloaded.

Example: retain the current Wisconsin official workbook before the next
source refresh:

```json
{"tool":"crm_record_source_revision","arguments":{"state":"WI","sourceId":"wi-2024-ward-by-ward-federal-state-xlsx","confirmation":"RECORD_SOURCE_REVISION"}}
```

**Companion tool: `crm_trace_value`.** Explains where a selected staged field
came from and checks any matching immutable revision. Example:

```json
{"tool":"crm_trace_value","arguments":{"state":"WI","year":2024,"family":"turnout","jurisdictionName":"Dane","field":"ballotsCast"}}
```

Use exact selectors from the current artifact; the example may return an
ambiguity or no match if the retained reporting units differ. Add a returned
`sourceRevisionSha256` to inspect a particular recorded source revision.
Only explicit row/page/sheet/cell references are reported; missing lineage is
not inferred. Observed hashes are not reviewed source certification, and an
observed parser-code hash is not proof that the code generated the artifact.
Same-byte repeats verify stored bytes; changed parser/config/staging bindings
are reported stale without rewriting history. [Detailed contract](source-revision-tool.md).

## 3. Disposable database rehearsal

**Tool: `crm_rehearse_database`.** Tests migrations and the real importer in a
fresh labelled local PostgreSQL container, including repeat-import behavior,
intentional rollback, dump/restore, and real application query functions.

Example: before reviewing a native-import or migration change:

```json
{"tool":"crm_rehearse_database","arguments":{"profile":"native-import","confirmation":"REHEARSE_LOCAL_DATABASE"}}
```

CLI equivalent: `npm.cmd run db:rehearse`. A working local Docker engine and
the fixed Postgres image are prerequisites. No existing clone, production
database, arbitrary SQL, or caller-selected database URL is allowed. Reports
include exact evidence and cleanup status; missing Docker is inconclusive.
[Isolation and hash scopes](database-rehearsal-tool.md).

## 4. Change-aware plans and exact test evidence

**Tool: `crm_plan_verification`.** Inspects changed paths and hashes the
candidate code/data to recommend focused checks. Shared or unknown changes
retain the full test requirement; planning itself executes no tests.

```json
{"tool":"crm_plan_verification","arguments":{"states":["WI","MN"]}}
```

**Tool: `crm_capture_release_evidence`.** Retains exact audited test/log bytes
and compares their tested identities with the current candidate. It prevents
an earlier passing run from being represented as evidence for different files.

First run an existing fixed profile with the candidate states:

```json
{"tool":"crm_run_test_profile","arguments":{"profile":"api-contract","states":["WI","MN"],"confirmation":"RUN_TEST_PROFILE"}}
```

Then call `crm_capture_release_evidence` with the same states, the returned
`run.id` in `testRunIds`, and `expectedAuditHashes` mapping that ID to the
returned `result.auditManifestSha256`, plus
`confirmation: "CAPTURE_RELEASE_EVIDENCE"`. Use returned values, not invented
IDs or caller-claimed pass results. To explicitly record missing evidence:

```json
{"tool":"crm_capture_release_evidence","arguments":{"states":["WI","MN"],"testRunIds":[],"confirmation":"CAPTURE_RELEASE_EVIDENCE"}}
```

Local evidence may be verified, but `releaseReady` is always false here:
complete CI gates, deployment identity, database revision, and publication
approval are separate. CI now retains named gate outcomes with matching
run/commit context; outcome hashes are not CI-log hashes or signed attestations.
[Detailed evidence contract](release-evidence-tools.md).

## 5. Synthetic statistical QA and data readiness

**Tool: `crm_validate_model`.** Exercises a fixed inference implementation
using wholly synthetic, nonpolitical observations and checks staging structure
and provenance readiness. It does not fit actual election results, forecast
outcomes, or assign probabilities or scores to political participants.

Example: check deterministic inference diagnostics and whether Wisconsin and
Minnesota historical artifacts have recognized geography/source identities:

```json
{"tool":"crm_validate_model","arguments":{"states":["WI","MN"],"seed":20260908,"confirmation":"VALIDATE_EXPERIMENTAL_MODEL"}}
```

The synthetic normal-inverse-gamma checks include both location and variance
parameter diagnostics. These are not a real-world statistical certification.
Reports always set `experimental: true`, `publicationEligible: false`, and
`electionForecastingSupported: false`. Missing recorded totals, unsupported
geographies, malformed artifacts, and unverified provenance are explicit.
[Methodology and boundaries](model-validation-tool.md).

## Coded verification and current handoff

```powershell
npm.cmd run typecheck
npm.cmd run test:mcp
npm.cmd run test:mcp:browser
npm.cmd run test:mcp:database
npm.cmd run test:mcp:model
npm.cmd run test:api
python -m unittest discover -s tests/python
npm.cmd run build
```

`test:mcp` includes positive/adversarial fixtures and real short-lived STDIO
server tests in both negotiation modes. The browser test launches actual
Chromium against a deterministic local fixture and proves that altered visible
text fails. Database safety tests inject deterministic failures and do not
start Docker; they are not a substitute for `db:rehearse`.

Observed here: TypeScript, the production build, and API regressions pass.
The integrated MCP suite passed 118 tests with three Windows symlink skips;
the dedicated model suite passed five Python tests with one Windows symlink
skip and two Node contract tests. The broader Python suite ran 197 tests: 195
passed, one symlink test skipped, and the existing Rhode Island Data Hub
source-pin check failed because the local raw response does not match its
pinned byte/hash identity. The real Chromium numeric fixture and all 15
dedicated database safety tests passed.
A real localhost app check verified 72 county rows, 432 cells,
72 map tooltips, and five drawers for Wisconsin. The complete delivery report
remains failed: the current database's indicator text/metadata differs from
the staging calculation, and local `/_vercel/insights/script.js` returns 404.
Neither finding was suppressed or repaired through a production write.

The actual plan → fixed API test → immutable capture workflow produced verified
local evidence while correctly retaining `releaseReady: false`. Its report is
`.etl/mcp-runs/tool-expansion-evidence-smoke-2026-09-08.json`; the retained
candidate manifest is
`.etl/release-evidence/1c5e8c8b0019412a3ab315914473bdd9ab62b1f83e7e96a539c286397eff2d93/manifest.json`.
This identifies the bytes at that run, not future changes. The source recorder
also retained the real Wisconsin workbook; a subsequent parser-fingerprint
change was correctly marked stale without overwriting the first revision.

The local server was stopped after inspection. Its logs additionally recorded
local Vercel Flags/OIDC unavailability and a pre-existing oversized Next cache
entry warning; these were not repaired by changing deployment configuration.

On 2026-09-22, the real disposable Docker rehearsal ran against the reviewed
`0000` through `0009` migration registry. It failed honestly at
`0002_historical_review_candidates.sql`: that migration alters
`historical_result_rows`, but the preceding tracked migrations do not create
that table on a fresh database. The runner recorded the image and migration
hashes, classified the result as `failed`, and confirmed
`owned_container_and_anonymous_volumes_removed`; it did not use an existing
clone or production.
The local audit is retained at
`.etl/mcp-runs/database-rehearsal-57a96add-3381-45d5-807d-8750d3f0c454/database-rehearsal.json`.
A preliminary pre-review run removed its container but did not verify removal
of the image-created anonymous volume. The corrected runner never deletes an
ambiguous existing volume; its subsequent owned run verifies `docker rm -v`
cleanup explicitly.
The real app delivery report is
`.etl/mcp-runs/local-delivery-verification-2026-09-08.json`.

The portable example MCP allowlist includes all 17 names; the machine-local
configuration remains ignored and is not part of the public change. Reconnect
the host-owned MCP process to load the new code/schema after integration. No
detached STDIO server, production data promotion, deployment, or merge was
performed. Pre-existing worktree changes were preserved.
