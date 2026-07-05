# CivicResultMaps Agent Instructions

CivicResultMaps is a public election-result explorer and ETL platform. Treat all data work as public-interest, source-driven, and reviewable. Do not make claims of fraud or misconduct. The site identifies data gaps, reconciliation issues, source limitations, and advisory signals only.

## First Reads

Before changing code or data, read:

1. `docs/developer/index.md`
2. `README.md`
3. The relevant state config in `etl/state-configs/<state>.json`
4. Any relevant inventory:
   - `data/source-acquisition-tiers.json`
   - `data/native-import-source-packages.json`
   - `docs/turnout-collection-inventory.md`
   - `docs/native-import-source-packages.md`

## Repo Shape

- Frontend/API: `src/app`, `src/lib`, `src/db`
- ETL configs: `etl/state-configs/*.json`
- Python ETL engine: `civic_etl/`
- Collection/normalization/validation scripts: `scripts/`
- Source artifacts: `data/`
- API tests: `tests/api/`
- Python ETL tests: `tests/python/`

## Data Rules

Use official sources first: state election offices, county election offices, EAC, Census, official GIS, official canvass reports, audit reports, recount records, official ENR exports, and other authoritative public records.

Secondary sources are allowed only as supplemental context, never as silent replacements for official certified totals. If using MIT Election Data and Science Lab, OpenElections, archive.org, or other third-party mirrors, record the reason and caveat.

Every collected artifact must have:

- Source authority
- Source URL
- Local artifact path
- Election year
- Reporting grain
- Parser or normalization path
- Expected row counts or totals where available
- Caveats and confidence notes

Do not hand-edit normalized outputs when a scripted parser should exist. Prefer reproducible scripts.

## Election-Specific Priorities

For each state, maximize accuracy by collecting or improving:

1. 2024 certified presidential results
2. Same-grain comparison contest rows, preferably U.S. Senate where available
3. Turnout and registration denominator rows
4. County or local geometry needed for joins
5. Historical baselines for 2020, 2016, and 2012 where feasible
6. Audit, recount, CVR availability, incident, correction, litigation, and equipment context where available
7. Validation and provenance that prove the website displays the data correctly

## Managed-Thread Waves

For managed-thread coordination, work in waves instead of launching all states at once. Use at most five state workers per wave unless the coordinator intentionally chooses fewer for messy OCR, PDF, local-county, or conflict-prone work.

Refresh the inventory between waves. Start the next wave only after current workers have opened draft PRs, reported blockers, or been explicitly deferred.

Recommended wave sizes:

- 3 states for messy OCR, hostile PDFs, local-county collection, or high shared-helper risk
- 5 states for normal source inventory, historical baselines, parser gaps, and validation work
- 7 to 10 states only for lightweight documentation, caveat, or source-tier updates

## Implementation Rules

Make the smallest complete change. Keep state-specific work scoped to that state unless a shared helper is clearly required.

Do not merge PRs. Do not rewrite unrelated files. Do not remove existing caveats. Do not promote data to production unless explicitly requested.

## End-of-State Advisory Indicator Check

At the end of any state ETL, review-row, comparison-contest, turnout, historical, or source-coverage task, every worker must verify the advisory indicator calculation path before opening or updating a PR.

After generating the state staging artifact, run:

```powershell
npm run native:report-indicators -- .etl/staging
```

For the worked state, report:

- Native review row count
- Calculated advisory indicator row count
- Flagged county/jurisdiction count
- Flagged area count
- Indicator types produced
- Whether the current production API/DB already reflects those counts, if checked

If calculated indicators are zero, state why: no review rows, below threshold, unsupported grain, missing same-grain comparison rows, or a suspected importer/display issue. Do not describe advisory indicators as proof of fraud or misconduct.

Production promotion is separate for workers. State workers must not run `npm run native:promote -- .etl/staging/<state>-2024-staging.json`, `npm run native:counts -- <state>`, or production API verification as a write/check cycle from their worker branches.

For managed-thread coordinator waves, production promotion is authorized after the wave's PRs are merged and any shared-file conflicts are reconciled. The coordinator must promote state-by-state from clean merged `origin/main`, rerun the indicator report before promotion, run `npm run native:promote -- .etl/staging/<state>-2024-staging.json`, confirm `storedIndicatorRows` with `npm run native:counts -- <state>`, and then rerun relevant production validators such as `validate:maps`, `validate:provenance`, `validate:source-packages`, `validate:turnout-packages`, and `validate:admin-packages`.

Prefer these checks:

```powershell
npm run typecheck
npm run test
npm run build
npm run etl:validate:<state>
npm run etl:import:<state>
npm run validate:source-packages
npm run validate:turnout-packages
npm run validate:maps
npm run validate:provenance
```

If a state has no npm alias, use:

```powershell
python -m civic_etl.cli validate --config etl/state-configs/<state>.json
python -m civic_etl.cli import --config etl/state-configs/<state>.json --out .etl/staging
```

## Pull Request Standard

Each worker PR must include:

- State and task scope
- Sources added or confirmed
- Scripts/configs changed
- Validation commands run
- Website/API display path checked
- Caveats and remaining risks
- Review-subagent result

## Branch Naming And Public Exposure

Use neutral branch prefixes that describe the work, not the agent or tool that created it:

- `state/<state>-data-coverage` for state ETL/source work
- `wave/<number>-integration` for wave integration branches
- `docs/<topic>` for documentation
- `feature/<topic>` for product work
- `hotfix/<topic>` for urgent fixes

Do not create new public branches with agent/tool names in the branch path. This repository is public, and GitHub does not support hiding individual branches in a public repository. Treat every pushed branch, draft PR branch, and branch name as public. Keep private or exploratory work local in worktrees until it is ready for a PR, and delete remote branches after their PRs are merged or closed.
