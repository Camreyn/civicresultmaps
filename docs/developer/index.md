# CivicResultMaps Developer Playbook

This file is the operating manual for managed worker threads.

## Mission

Build a reproducible, source-cited election data pipeline that lets CivicResultMaps show official results, advisory comparison signals, turnout context, historical baselines, and source limitations for every U.S. state.

The project does not assert fraud. It exposes data quality, reconciliation, provenance, and review signals.

## Coordinator Protocol

When coordinating state workers:

1. Build or refresh the coordinator inventory before creating workers.
2. Create at most five state workers per wave unless the prompt explicitly requests a smaller or larger batch.
3. Create one worker per state unless the prompt explicitly requests separate state-task shards.
4. Give each worker its own branch and worktree.
5. Use branch names like `codex/state-<state>-data-coverage`.
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
2. Use branch names like `codex/state-<state>-data-coverage`.
3. Keep state-specific work scoped to that branch unless shared helper work is explicitly split out.

## Worker Brief Template

Each worker receives:

```md
State: <STATE>
Branch: codex/state-<state>-data-coverage
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
