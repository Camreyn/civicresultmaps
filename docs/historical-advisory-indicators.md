# Historical advisory indicators

CivicResultMaps can calculate the same family of source-review indicators for 2016 and 2020 only when official presidential rows and an official comparison contest are available at the same reporting grain. These indicators identify records worth reviewing. They are not findings of fraud, misconduct, tampering, causation, or candidate benefit.

## Evaluation status

A state-year has one of two public statuses:

- **Evaluated** means candidate-neutral presidential and comparison-contest rows were loaded at the same grain, passed source and row-count reconciliation, and were processed by the shared indicator calculator. An evaluated state-year may still have zero flags.
- **Not evaluated** means the required same-grain comparison rows are not loaded or cannot be interpreted without an unsupported geography assumption. Not evaluated is never displayed as zero flags.

The database capability row for the same state and election year is the API source of truth: `capability_flags.review_graphs=true` means evaluated. Historical map pages load indicators for their selected year and join them to results by canonical `jurisdictionTag` before falling back to legacy code or name joins.

## Candidate-neutral row contract

Normalized historical review CSV files use these fields:

```text
state,election_year,county,jurisdiction_tag,local_unit,level,
dem_candidate,rep_candidate,dem_votes,rep_votes,other_votes,total_votes,
comparison_contest,comparison_dem_candidate,comparison_rep_candidate,
comparison_dem_votes,comparison_rep_votes,comparison_other_votes,
coverage_mode,source_id,comparison_source_id,source_url
```

Candidate display names are preserved from the official source. Party buckets determine the Democratic, Republican, and other totals. County joins use canonical `county:<GEOID>` tags. Precincts and other local reporting units do not receive invented FIPS codes.

## Calculation policy

The staging report and production persistence use the same calculator in `src/lib/analysis-indicators.ts` and thresholds in `src/lib/review-policy.ts`.

For a local reporting-unit scope with at least eight rows, the calculator may produce:

- `vote_share_pattern`: absolute candidate vote-share correlation of at least 0.35 with candidate vote volume.
- `average_down_ballot_difference`: an average same-party President-versus-comparison-contest difference of at least 2 percentage points.
- `down_ballot_outliers`: at least three rows, or 5% of comparable rows, with at least 100 candidate votes and an absolute difference of at least 15 percentage points.

For statewide collections consisting entirely of one county-total row per county, the calculator may produce `county_down_ballot_distribution` when a county has an absolute same-party difference of at least 4 percentage points or an absolute statewide z-score of at least 2.

Rows marked `voteShareOnly`, `oneSidedHouseComparison`, or `multiDistrictHouseComparison` are excluded from down-ballot calculations. Historical Senate comparisons are labeled low-confidence directional context because candidate-specific ticket splitting and contest participation can create broad differences.

If at least half of evaluated counties produce an advisory signal, the staging report and historical production map display a broad-signal warning. That warning is a prompt to inspect statewide candidate and contest effects before interpreting individual county flags.

## Source and geography rules

Official state election sources are required for the historical pilot. Per-year official review inputs carry their election year through staging so historical review rows and indicators link to a same-year source document. A multi-year normalized baseline artifact is filed under its latest included year and records the full year set in `metadata.electionYears`; the per-year official source documents remain separate. A normalized CSV is a reproducible parser artifact, not a replacement authority.

Historical promotion replaces review rows and indicators only for the explicit years present in `native.historicalReviewRows`. It does not delete a different historical review year. Historical result-row promotion remains subject to the separate live-versus-staging preservation audit required by `AGENTS.md`.

## Pilot source notes

### Arizona

The 2016 rows use the official Arizona Secretary of State signed state canvass PDF, and the 2020 rows use the official detailed-results XML ZIP. Both years compare President with U.S. Senate at county grain and resolve all 15 counties to canonical `county:<GEOID>` tags. The layout-aware 2016 parser reconciles every candidate row to the printed statewide total and records 38 printed one-vote cells absent from the PDF text layer as reviewed, fail-closed corrections; pages 1 through 11 were visually checked at 200 DPI without OCR.

The official 2016 presidential candidate rows total 2,573,165 votes. The existing secondary contextual baseline totals 2,604,657, a 31,492-vote difference entirely in unresolved other-vote semantics. The official rows drive advisory calculations, but the secondary baseline remains contextual until a reviewed official replacement is available. Do not silently combine or substitute those totals.
### Georgia

The 2016 and 2020 rows use official Georgia Secretary of State media exports at county grain. The comparison is the regular U.S. Senate contest. The 2020 source is the original November general export, before the regular Senate runoff; the Loeffler special election is excluded. The selected historical contest options contain no precinct-result rows. County-level patterns must not be described as precinct evidence.

### North Carolina

The 2016 rows use the official NCSBE export at county grain. Every President and U.S. Senate reporting row is aggregated by the explicit source `County` field into 100 canonical county rows; no precinct or administrative-unit classification is inferred. All 100 presidential county tuples exactly match the existing official 2016 baseline. The source contains one signed `-4` write-in correction row, which is retained before final nonnegative county and statewide reconciliation.

The 2020 rows use the official NCSBE precinct export and include only keys explicitly marked `Real Precinct=Y` in both President and U.S. Senate. Administrative keys marked `N` are reconciled separately and remain in the official county baseline totals, not the precinct advisory dataset.

## Reproduction and review

```powershell
# The 2016 PDF parser requires a Python environment containing pdfplumber.
npm run etl:normalize:az:historical-review
python -m civic_etl.cli import --config etl/state-configs/az.json --out .etl/staging
npm run etl:normalize:ga:historical-review
npm run etl:normalize:nc:historical-review
python -m civic_etl.cli import --config etl/state-configs/ga.json --out .etl/staging
python -m civic_etl.cli import --config etl/state-configs/nc.json --out .etl/staging
npm.cmd run native:report-indicators:2016 -- --staging-dir=.etl/staging
npm.cmd run native:report-indicators:2020 -- --staging-dir=.etl/staging
```

Before promotion, run the 2016 coverage and flip overlay reports for the exact state set and confirm the report includes a `stagingOverlay` object. Compare every staged and live historical year and row set. A state artifact must not be promoted if it would remove a live historical year or unexplained rows.