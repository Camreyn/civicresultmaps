# MCP workflow tools: implementation handoff

Verified locally on September 7, 2026. Scope: five new project tools, their
shared evidence/projection helpers, MCP registration, connection allowlists,
documentation, and tests. No deployment, database mutation, Git publication,
source collection, or data promotion was performed.

## Delivered

| Tool | Verified behavior |
| --- | --- |
| `crm_verify_state_delivery` | Selected-year staged values versus bounded public API reads; exact importer source slugs; optional isolated browser smoke evidence. |
| `crm_release_readiness` | Exact candidate state set, all current result levels, historical preservation, source-year upserts, digest pinning, freshness, and clean-worktree checks. |
| `crm_coverage_gaps` | National or selected-state inventory; per-family evidence; retained files distinguished from unverified leads; optional public observations. |
| `crm_trace_value` | Exact staged field selection, ambiguity handling, recorded parser/source links, retained file hashes, and explicit missing lineage. |
| `crm_run_test_profile` | Fixed `mcp-contract` and `api-contract` profiles, confirmation, credential-stripped child environment, bounded execution, and redacted audit logs. |

Each implementation received worker verification. Coordinator integration and
independent review added regressions for source-ID transformation, historical
replacement, live-only result levels, missing evidence, seed responses, path
escapes, stale hashes, mixed-case hash keys, and browser errors.

## Verification evidence

- Final `npm.cmd run test:mcp`: 55 tests; 54 passed, no failures, one skip.
  The skipped test requires Windows file-symlink creation permission. Separate
  directory-junction escape tests ran and passed.
- `npm.cmd run typecheck`: passed after final code changes.
- `npm.cmd run test:api`: passed, including native import, source-year handling,
  historical promotion, advisory calculation, and API regressions.
- Both legacy and automatic MCP protocol negotiation discover all 12 tools.
  Strict schemas reject unknown tools, arbitrary targets/commands/environments,
  unsupported years, malformed hashes, and missing test confirmation.
- The actual final `mcp-contract` profile passed through the sanitized runtime;
  its 55-test execution is retained in
  `.etl/mcp-runs/2026-09-07T17-52-48-641Z-4d750054/manifest.json` and sibling logs.
- National offline coverage inspection completed for all 51 state/DC entries
  across three requested years. This is inventory evidence, not a completeness
  or certification claim.
- An actual retained-file trace resolved its staged field and correctly returned
  `retained_artifact_present_digest_unverified` when no declared reviewed digest
  was available.
- Public-page browser smoke passed with the requested state/year selected,
  visible map/table surfaces, and no console/page errors. Screenshot:
  `.etl/mcp-runs/delivery-browser/run-rIZsfM/public-ui-smoke.png`.
- A read-only delivery sample matched its results, review, turnout, required
  source links, and county-tag joins. Its advisory output still differed from
  the current local calculation, so the overall report remained `fail`.
  Matching row counts were not treated as value equivalence. Readiness also
  correctly blocked stale staging and the existing dirty worktree.
- Broader `npm.cmd run test`: passed with exit code 0. This completed MCP,
  all 216 precinct/GIS regression files, layout, API/import, security-incident,
  equipment-catalog/editorial, and Python ETL test groups. Python reported
  189 tests passing. Expected error output from negative fixtures was not a
  suite failure. The final 55-test MCP rerun covers guards added while the
  longer regression run was in progress. A production build was not run.

## Activation and remaining boundaries

Restart Codex so the host-owned STDIO process reloads version 0.2.0 and the
updated allowlist. Then call `crm_doctor` once in the new task/process and
confirm `toolCount: 12`. No manually detached server is needed.

Before using a readiness report to support a release decision, prepare fresh
reviewed staging from a clean source tree and review any live/local advisory
calculation or presentation differences. The tools never grant publication
authority and do not automatically resolve those differences.

Current limitations are deliberate and visible: some public endpoints cap
responses without pagination; browser verification is UI smoke, not numeric
cell reconciliation; source page/cell lineage and declared artifact hashes
must already exist to be verified; historical coverage inventory currently
focuses on baselines; only two test profiles are enabled. See
[the tool guide](local-mcp.md) for inputs and evidence/status contracts.
