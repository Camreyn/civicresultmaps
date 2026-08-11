# CivicResultMaps Developer Playbook

This file is the operating manual for managed worker threads.

## Mission

Build a reproducible, source-cited election data pipeline that lets CivicResultMaps show official results, advisory comparison signals, turnout context, historical baselines, and source limitations for every U.S. state.

The project does not assert fraud. It exposes data quality, reconciliation, provenance, and review signals.

For historical 2016/2020 review-row eligibility, candidate-neutral fields, indicator thresholds, broad-signal warnings, and promotion rules, read [`docs/historical-advisory-indicators.md`](../historical-advisory-indicators.md).

For the private workspace layout editor, immutable revision model, protected Vercel rollout, rollback, and privacy controls, read [`docs/developer/ui-layout-operations.md`](ui-layout-operations.md).

For the guarded layout MCP endpoint, constrained LLM operation vocabulary, authentication, and Codex plugin, read [`docs/developer/layout-agent-tooling.md`](layout-agent-tooling.md).

For the guarded Texas 2012/2016/2020/2024 VTD / precinct-approximation release, including the hidden load, immutable Blob publication, database-gated deployment, and atomic public cutover, read [`docs/developer/tx-precinct-release-runbook.md`](tx-precinct-release-runbook.md).

For the feature-gated election-equipment catalog, immutable source revisions, editorial lifecycle, version semantics, 3D fidelity rules, and publication gates, read [`docs/equipment-evidence-workflow.md`](../equipment-evidence-workflow.md).

## Coordinator Protocol

When coordinating state workers:

1. Build or refresh the coordinator inventory before creating workers.
2. Create at most five state workers per wave unless the prompt explicitly requests a smaller or larger batch.
3. Create one worker per state unless the prompt explicitly requests separate state-task shards.
4. Give each worker its own branch and worktree.
5. Use branch names like `state/<state>-data-coverage`.
6. Keep worker briefs state-specific.
7. Track status in a table.
8. Before PR creation, compare worker diffs for conflicts against active branches.
9. Do not merge.

Do not start the next wave until every current-wave worker has opened a draft PR, reported a clear blocker, or been explicitly deferred.

Between waves, the coordinator must:

1. Check branch conflicts.
2. Summarize shared-file edits.
3. Update the inventory.
4. Identify reusable patterns or scripts created in the wave.
5. Reprioritize the next five states.

Recommended wave sizes:

- 3 states for messy OCR, hostile PDFs, local-county collection, or high shared-helper risk.
- 5 states for normal source inventory, historical baselines, parser gaps, and validation work.
- 7 to 10 states only for lightweight documentation, caveat, or source-tier updates.


## Jurisdiction Tag Flip-Coverage Waves

Use this workflow when the goal is national 2020-to-2024 county flip completeness rather than broad state data coverage.

Coordinator duties:

1. Run `npm run jurisdictions:flips` and record the generated coverage counts.
2. Update `data/jurisdiction-tag-coverage-waves.json` with wave, state, missing count, branch, and status.
3. Assign at most five state workers per wave unless source complexity requires fewer.
4. Give each worker one state and the exact goal: load official 2020 county/county-equivalent presidential historical baselines that join to 2024 rows by `jurisdictionTag`.
5. Between waves, rerun `npm run jurisdictions:flips`, refresh the tracker, and drop states whose missing counts are resolved.

Before integration or promotion, run the historical coverage and flip reports with both `--staging-dir=.etl/staging` and `--overlay-states=<comma-separated candidate states>`. This overlays only the proposed state artifacts on live API data, preserving production rows for states outside the wave. In PowerShell, invoke `npm.cmd` explicitly so `npm.ps1` cannot consume option-looking script arguments as npm configuration. Treat the run as invalid unless the JSON output contains the expected `stagingOverlay` object:

```powershell
npm.cmd run jurisdictions:coverage:2016 -- --staging-dir=.etl/staging --overlay-states=CO,LA
npm.cmd run jurisdictions:flips:2016-2020 -- --staging-dir=.etl/staging --overlay-states=CO,LA
npm.cmd run jurisdictions:flips:2016-2024 -- --staging-dir=.etl/staging --overlay-states=CO,LA
```

Run pure `--staging-dir` reports as a separate native-artifact audit; do not treat them as a production projection.

Compare the live and staged historical year/row sets for every candidate state. Native promotion replaces all historical rows for a state when the artifact contains historical rows, so any staged omission of a live year or unexplained row reduction blocks promotion pending parser completion or an explicitly reviewed preservation strategy.

Worker duties:

1. Prefer official state election sources for 2020 county/county-equivalent presidential results.
2. Add or update a reproducible parser/normalizer rather than hand-editing normalized output.
3. Preserve source display names, but ensure historical rows resolve to `county:<GEOID>` where Census county-equivalent FIPS applies.
4. Leave statewide-only, non-county, town, and ambiguous reporting rows unforced unless an explicit non-FIPS reporting tag already exists.
5. Document source authority, source URL, artifact path, parser path, row counts, caveats, and confidence in the state config or inventories.
6. Do not run production promotion or jurisdiction backfill apply commands from worker branches.

Required worker report additions:

| Field | Required |
| --- | --- |
| Flip coverage before/after | State matched rows, missing rows, and flip counts if checked |
| Jurisdiction tags | Confirmation that historical rows join on `jurisdictionTag` |
| Source caveat | Official source status or secondary-source caveat |
| Coordinator handoff | Whether the state is ready for merge, blocked, or needs another wave |

## Inventory Pass

Before each wave, inspect:

1. All state codes in `scripts/state-metadata.mjs`.
2. Existing ETL configs in `etl/state-configs/`.
3. `completedNativeStates`, `states`, and `sourceDiscoveryQueue` in `data/native-import-source-packages.json`.
4. Current source acquisition tiers in `data/source-acquisition-tiers.json`.
5. Existing state-specific collection, normalization, historical, OCR, reconciliation, and validation scripts.
6. Existing tests under `tests/api` and `tests/python`.
7. Existing `package.json` aliases for state ETL and validation.

Do not duplicate completed work. If a state is already loaded, focus only on documented gaps such as:

- Missing same-grain comparison contest
- Missing turnout or registration denominator
- Missing precinct, ward, VTD, town, or local geometry
- Missing 2020, 2016, or 2012 historical baseline
- Missing audit, recount, CVR availability, incident, correction, litigation, or equipment context
- Missing source provenance, caveats, tests, or website/API verification

Wave priority order:

1. Swing states: AZ, GA, MI, NC, NV, PA, WI
2. States in `sourceDiscoveryQueue`
3. High-ROI tiers: `tier_1_official_export_database` and `tier_2_official_dashboard_endpoint`
4. Loaded states with high-impact missing caveats, denominators, geometry, comparison contests, or historical baselines
5. Unknown-tier states needing source classification

## Worker Branches

For each worker:

1. Use a dedicated branch and worktree.
2. Use branch names like `state/<state>-data-coverage`.
3. Keep state-specific work scoped to that branch unless shared helper work is explicitly split out.

## Worker Brief Template

Each worker receives:

```md
State: <STATE>
Branch: state/<state>-data-coverage
Worktree: <path>

Read `AGENTS.md` and `docs/developer/index.md`.

Current repo status:
- <Summarize completed/partial/blocked status from inventories>

Inspect:
- `etl/state-configs/<state>.json`
- `data/source-acquisition-tiers.json`
- `data/native-import-source-packages.json`
- State-specific scripts under `scripts/`
- State-specific tests under `tests/`
- Relevant API routes under `src/app/api/`
- Relevant frontend display paths under `src/app/`

Tasks:
1. Identify missing 2024 sources needed for maximum advisory accuracy.
2. Collect or document official sources for results, comparison contest, turnout, geometry, audit/recount/CVR/equipment context.
3. Add 2020, 2016, and 2012 historical baseline collection where feasible.
4. Ensure the pipeline is scripted and validated.
5. Ensure website/API display paths reflect the data and caveats.
6. Add focused tests.
7. Run a review subagent on your diff and address valid feedback.
8. Open a draft PR.
```

## State Data Acceptance Criteria

A state is strong when it has:

- Certified 2024 presidential totals
- Local review rows at precinct, ward, town, VTD, county, or equivalent grain
- Same-grain comparison contest rows
- Turnout numerator and denominator
- County geometry with successful map joins
- Historical presidential baselines for 2020, 2016, and 2012 where feasible
- Source provenance for every artifact
- Validation totals and row counts
- Clear caveats visible to API/frontend consumers

A state may still be acceptable with gaps, but the gaps must be documented in source inventories and website-facing caveats.

## Common Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run validate:source-packages
npm run validate:turnout-packages
npm run validate:source-acquisition-tiers
npm run validate:maps
npm run validate:provenance
npm run etl:validate:all
```

State ETL:

```powershell
npm run etl:validate:<state>
npm run etl:import:<state>
```

Fallback:

```powershell
python -m civic_etl.cli validate --config etl/state-configs/<state>.json
python -m civic_etl.cli import --config etl/state-configs/<state>.json --out .etl/staging
```

## Conflict Detection

Before a worker opens a PR, the coordinator should check:

```powershell
git status --short
git diff --name-only main...HEAD
git fetch origin
git diff --name-only origin/main...HEAD
```

Watch for shared edits to:

- `package.json`
- `civic_etl/pipeline.py`
- `civic_etl/native.py`
- shared parser helpers
- `src/lib/*`
- shared JSON registries
- validation scripts
- global docs

If two workers touch the same shared file, coordinate the smaller PR first or split shared helper work into a separate branch.

## Website Verification

Workers should verify the relevant state appears through the public API or UI path:

- `/api/states`
- `/api/jurisdictions?state=<STATE>&fips=<GEOID>` (canonical current Census county/county-equivalent FIPS registry)
- `/api/results?state=<STATE>&year=2024`
- `/api/sources?state=<STATE>&year=2024`
- `/api/coverage?state=<STATE>&year=2024`
- `/api/turnout?state=<STATE>&year=2024`
- `/api/historical-baselines?state=<STATE>`
- `/api/source-acquisition-tiers?state=<STATE>`
- `/api/native-source-packages?state=<STATE>`

If an endpoint is missing or incomplete, document that as remaining risk or add the smallest implementation needed.

## Final Worker Report

Each worker must report:

| Field | Required |
| --- | --- |
| State | Two-letter code |
| Branch | Worker branch |
| Worktree | Local worktree path |
| PR URL | Draft PR URL |
| Sources | Official artifacts added or confirmed |
| Scripts | Collection/normalization/validation scripts changed |
| Tests | Commands run |
| Review result | Review subagent outcome |
| Status | Done, blocked, partial |
| Remaining risk | Data caveats, missing sources, manual-review burden |

## Final Coordinator Report

At the end of each wave, report:

- States completed
- States blocked
- Draft PRs opened
- Tests and validations run
- Shared conflicts found
- Highest-impact remaining gaps
- Recommended next wave

## Branch Naming And Public Exposure

Use neutral branch prefixes that describe the task:

- `state/<state>-data-coverage` for state ETL/source work
- `wave/<number>-integration` for wave integration branches
- `docs/<topic>` for documentation
- `feature/<topic>` for product work
- `hotfix/<topic>` for urgent fixes

Do not use agent/tool names in branch paths. GitHub branches on a public repository are public; there is no repository rule that can make all non-`main` branches private while keeping the repository public. Coordinators should keep exploratory work in local worktrees until it is ready for PR review, push only necessary review branches, and delete remote branches after their PRs are merged or closed.
