---
name: civicresultmaps-mcp
description: Use the private local CivicResultMaps MCP for guarded ETL, staging, source lineage, delivery verification, fixed tests, disposable database rehearsals, and synthetic statistical QA. Use for project MCP health and data-verification workflows. Not for production promotion, existing-database mutation, arbitrary commands, Git publication, or Layout Control editing.
---

# CivicResultMaps MCP

Use the local MCP as the guarded bridge to CivicResultMaps repository workflows.
Follow `AGENTS.md` and keep election claims source-driven and advisory.

## Pass the startup gate

1. Reuse a successful `crm_doctor` result from the current task when one exists.
2. Otherwise, call `crm_doctor` once before substantive code or data work.
3. Require `ok: true`; inspect warnings, workflow drift, runtime status, and the
   active local connection. Report material issues.
4. If the tool is missing or unhealthy, pause normal work. Check project trust,
   `.codex/config.toml`, dependencies, and restart state. Do not leave a manual
   or detached STDIO server running. Continue without MCP only after the user
   explicitly approves that fallback.

## Choose the narrowest reviewed tool

- Call `crm_state_inventory` before state-specific ETL work to inspect config,
  inventories, workflow availability, and staging state.
- Call `crm_validate_state` with `workflow: "config-only"` for ordinary
  config validation. Use `workflow: "full"` only when source preparation or
  collection is in scope and the reviewed workflow is drift-free.
- Call `crm_import_staging` only for a requested local staging build. Select the
  workflow explicitly, verify the returned artifact identity and digest, and
  review the automatically generated advisory-indicator report. Never treat a
  staging import as production promotion.
- Call `crm_report_indicators` to inspect existing staging review rows and
  explain zero counts by supported grain, comparison-row availability, or
  thresholds. Never describe an indicator as evidence of misconduct.
- Call `crm_compare_staging` before discussing promotion or historical-row
  replacement. Require the exact staging overlay and treat live year or row
  reductions as blockers requiring review.
- Call `crm_run_validator` only with its fixed validator enum. Do not replace a
  missing MCP operation with arbitrary shell, SQL, URL, path, environment, Git,
  production, or backfill-apply input.
- Call `crm_coverage_gaps` for national or selected state/year evidence. An API
  observation is not browser verification; an inventory lead is not a retained
  source artifact.
- Call `crm_trace_value` for a specific staged field. Report ambiguity, missing
  source lineage, and whether a retained digest was actually compared against
  a declared digest. Never infer page, sheet, or cell references.
- Call `crm_verify_state_delivery` for staging-to-public-API checks. Request
  optional isolated browser evidence only when local screenshot writes and
  browser launch are in scope. Default `browserMode: "values"` reconciles actual
  county table text, joined map tooltips, and a bounded drawer sample against
  staging-verified API rows. Explicit `smoke` does not verify numbers. Seeded,
  legacy-capped, unavailable, and revision-inconsistent reads are inconclusive.
- Call `crm_release_readiness` with the exact candidate state set and, when
  available, the reviewed artifact hashes. Inspect every blocker and missing
  check. Even a passing report does not authorize publication.
- Call `crm_run_test_profile` only for a requested reviewed profile, with the
  exact `RUN_TEST_PROFILE` confirmation. Inspect status and audit logs; a
  completed call, timeout, or launch failure is not a passing test. Supply states
  when binding tests to candidate staging, and retain `auditManifestSha256`.
- Call `crm_record_source_revision` with `RECORD_SOURCE_REVISION` to retain a
  config-selected source locally. Observed bytes/code are not certification or
  proof that that code generated staging; explicit lineage must not be inferred.
- Call `crm_rehearse_database` with `REHEARSE_LOCAL_DATABASE` only for an
  authorized disposable local rehearsal. It requires local Docker, creates and
  cleans up only labelled resources, and cannot select production or clones.
  Missing Docker and unconfirmed cleanup remain unverified, not passes.
- Use `crm_plan_verification` to inspect additive checks, then
  `crm_capture_release_evidence` with `CAPTURE_RELEASE_EVIDENCE`, actual run IDs,
  and their retained expected audit hashes. Local test evidence never grants
  release approval or verifies deployment/database revision.
- `crm_validate_model` with `VALIDATE_EXPERIMENTAL_MODEL` runs only synthetic
  nonpolitical inference QA and structural data readiness. It does not fit
  election results, forecast outcomes, or score political participants.

For definitions, exact examples, and verification limits, read
`docs/developer/mcp-verification-expansion.md`.

## Handle updates and failures

Treat state metadata, state configs, source inventories, package-script drift,
and staging artifacts as live on the next tool call. Restart ChatGPT or Codex
after changing MCP server code, tool schemas, the reviewed workflow registry,
or validator registrations.

For an action failure, inspect the returned `.etl/mcp-runs/<run-id>/manifest.json`
and step logs before retrying. Read `docs/developer/local-mcp.md` when changing
or troubleshooting the server itself.

## Report the result

State which MCP tools ran, whether each succeeded, warnings or drift found,
local artifacts or audit paths produced, files changed, and remaining caveats.
Call out whether disposable local database work ran; production promotion and
production database mutation remain separate and unavailable here.
