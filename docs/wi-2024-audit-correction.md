# Wisconsin 2024 audit report: percentage correction

This is Civic Result Maps' independent arithmetic check, not a WEC-issued
erratum. It corrects our explanation of a source-report calculation error;
it does not change election results or establish a new candidate-vote error.

The retained [WEC final report](https://elections.wi.gov/sites/default/files/documents/2024%20Post-Election%20Voting%20Equipment%20Audit%20Final%20Report.pdf),
dated March 13, 2025, has SHA-256
`b9df76b2e9779dcb4ec29fcd6fc637c9efc73bdd6cf4f424d52341e48fc232bf`.
Its unmodified local copy is
`data/wi-2024-audit/2024-post-election-voting-equipment-audit-final-report.pdf`.

| Source statement | Correct percentage from the stated ratio |
| --- | --- |
| Page 10: five errors / 5,604,670 ballot positions, printed as `0.0000009%` | `(5 / 5,604,670) × 100 ≈ 0.0000892%` |
| Pages 9–10: one / 500,000 benchmark, printed as `0.00002%` and `0.000002%` | `(1 / 500,000) × 100 = 0.0002%` |

The five-case percentage is about 100 times the printed value and remains below
the report's stated benchmark. WEC separately reports a **0% equipment-only**
rate: its definition excludes the five cases because WEC attributed them partly
or completely to human factors. That separate finding is not being corrected.

Pages 11–12 report 593 human/procedural errors and a rounded rate of 0.011%.
That category includes mistakes during the audit itself and is not a count of
593 incorrectly tabulated presidential votes. Page 5 lists President, U.S. House,
Wisconsin Assembly, and District Attorney as the four selected contests, not
U.S. Senate. The audit therefore does not directly validate this site's
President-versus-Senate advisory comparisons. Appendix B lists audit selections,
equipment, and audited ballots, not per-reporting-unit discrepancy outcomes.
Page 8 says WEC followed up until reported discrepancies were adequately explained.

## Implementation and compatibility

- `scripts/normalize-wi-audit-report.mjs` verifies the retained PDF identity and
  source statements before generating the summary. `--check` verifies outputs
  without writing or downloading files. Appendix B retains 373 rows, 72 counties,
  327,230 audited ballots, and 12 zero-ballot selection rows.
- In `aggregateAuditResults`, `errorRateWithFiveReportedErrors` remains the
  verbatim **incorrect source quotation** for backward compatibility. Consumers
  must use `percentageCorrection.fiveErrors.recalculatedDisplay` (or its numeric
  `recalculatedPercent`) for the correct percentage. The additive correction
  object retains both printed benchmark values, formulas, page references, and
  explicit independent-review attribution.
- `scripts/report-wi-remaining-data-status.mjs` regenerates the remaining-data
  status artifact's embedded audit summary from that same corrected package.
- A narrowly gated read adapter adds the correction to older WI 2024 indicator
  records only when the source URL and reported figures match this reviewed
  report. It preserves local audit-selection counts and all flag metrics. The
  indicator-cache key is versioned so a deployment need not wait for a database
  revision or overwrite stored records. Other states, years, unknown reports,
  missing context, and mismatched figures are untouched.
- The Review Center and Data & Sources show a visible correction notice for
  Wisconsin 2024 even when no indicator has a matching local audit selection.
- The review-graph documentation now states the actual 2-percentage-point
  average-gap threshold instead of 6%. Neither the calculator nor its thresholds
  change. Local-row gaps use total presidential votes as their denominator and
  the average weights comparable rows equally.

No production data promotion is required. Code deployment remains a separate
reviewed step; this document is not evidence of production deployment.

## Local verification — September 28, 2026

- Project MCP startup and Wisconsin inventory checks passed without warnings or
  workflow drift. Work is isolated from the main checkout's pre-existing changes.
- Type checking, the production build, and the complete `test:api` suite passed.
  The focused correction, source-reproduction, importer, indicator, and Wisconsin
  regression run passed 29 tests. The final corrected-artifact rerun passed 13.
- The original PDF hash is unchanged. Re-extraction verifies the summary and
  all Appendix B counts; `--check` leaves the retained files unchanged.
- A read-only request returned 187 existing public WI 2024 indicators. All 187
  accepted the local correction adapter while retaining the original printed
  value and severity. No API or database records were written back.
- Browser checks against the local production build passed for Review Center
  and Data & Sources, including expanded source links and mobile wrapping.
  Minnesota 2024 and Wisconsin's supported 2020 map view omit the notice.
  The existing app restricts Data & Sources and Review Center to 2024 even when
  a different `year` parameter is supplied; this behavior was not changed.
- The local API responded successfully but used `seed-fallback` with zero
  indicators because this checkout has no database connection. Therefore the
  deployed database-to-API path still requires preview/production verification;
  fixture tests and the read-only public-row adapter check are not a substitute.
- Local-only warnings remain: the Vercel analytics script returns 404, Vercel
  Flags lacks local OIDC credentials, and an existing large context cache entry
  exceeds Next.js's cache-item limit. No browser exceptions or error overlays
  were observed. No deployment configuration was changed to suppress warnings.
- The MCP advisory report over existing Wisconsin staging remains: 3,503 review
  rows, 187 calculated indicators (103 vote-share pattern, 84 average down-ballot
  difference), 67 flagged counties, 126 flagged areas, and 70 unique jurisdiction
  labels. The read-only public API also returned 187 indicators. These are advisory
  screens, not audit incidents. No staging, indicator calculation, or threshold
  changes were made, and no disposable or production database mutation ran.
- Independent read-only review found no blockers. React review confirmed a
  separate static notice component with no added effects or data fetches.

Changed files:

- `scripts/normalize-wi-audit-report.mjs`
- `data/wi-2024-audit-summary.json`
- `data/wi-2024-remaining-data-status.json`
- `src/lib/wi-audit-context.ts`
- `src/lib/data-access.ts`
- `src/lib/api.ts`
- `src/app/wi-audit-report-note.tsx`
- `src/app/workspace-tabs.tsx`
- `src/app/globals.css`
- `tests/api/wi-audit-normalizer.test.mjs`
- `tests/api/wi-audit-context.test.mjs`
- `package.json`
- `docs/review-graph-calculations.md`
- `docs/wi-2024-audit-correction.md`

Local branch: `hotfix/wi-audit-context`, based on merged main `7305f28f`.
These checks did not merge code, promote data, or deploy to production.
Publication and merge status are tracked separately in the pull request.
