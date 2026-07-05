# Review Graph Calculations

This document explains how Civic Result Maps calculates the public graph and
advisory-review views. These calculations are source-reconciliation tools. They
are not findings of fraud, tampering, misconduct, or intent.

Implementation source: `src/app/workspace-tabs.tsx`, `src/app/results-explorer.tsx`,
`src/db/native-import.ts`, and `src/db/legacy-import.ts`.

## Data Inputs

The charts use normalized rows loaded through the public API and ETL pipeline:

- Certified result rows: candidate votes, total votes, reporting level,
  jurisdiction code, jurisdiction name, and source ID.
- Review rows: local reporting-unit rows for advisory screening. Depending on
  source availability, these may be precinct, ward, town, VTD, county, or other
  official local grains.
- Comparison-contest rows: same-row contest values such as U.S. Senate,
  Governor, U.S. House, or Attorney General when available at the same grain as
  President.
- Turnout rows: ballots cast, registered voters when available, turnout
  percentage, denominator note, warning flag, and source ID.
- Historical baseline rows: prior presidential results by year and jurisdiction.
- Equipment rows: election-administration context such as vendor, system,
  tabulation, paper record, and source granularity.
- Source rows: authority, source URL, local artifact, parser, confidence, and
  caveats.

Every interpretation should start with Data Notes, source records, and state
caveats. Missing or partial inputs make the related chart a proxy or blocked
view.

## Map Views

### Winner Map

- Input: selected-state certified result rows.
- For each mapped jurisdiction, the app sums candidate votes and selects the
  candidate with the largest vote total.
- Color family follows the winning candidate or party grouping exposed by the
  imported rows.
- The map only draws where result rows can join to loaded geometry.

### Margin Map

- Input: selected-state certified result rows.
- For each mapped jurisdiction, the app sorts candidate vote totals, subtracts
  second place from first place, and divides by total votes when a percentage is
  needed.
- Stronger color intensity means a larger winner margin. It does not imply a
  better or worse source.

### Vote Volume Map

- Input: selected-state certified result rows.
- For each mapped jurisdiction, the app sums total votes.
- Color intensity reflects relative vote volume among joined jurisdictions.

### Vote Method Map

- Input: EAC or state-native participation-method rows where loaded.
- The map shades participation context such as mail, early, provisional, or
  Election Day voters.
- These rows describe how people voted, not which candidate each method selected.
  Candidate-by-method charts require official candidate-by-method source rows.

## Review Center Graphs

### Evidence Readiness Score

- Input: Data Notes, source records, review rows, turnout rows, historical rows,
  electronic-integrity status, admin-source status, and source-record request
  queue rows.
- Each dimension receives a score from 0 to 1:
  - `ready`: 1.00
  - `partial`: 0.55
  - `proxy`: 0.35
  - `missing` or `blocked`: 0.00
- Source provenance uses 1.00 when source rows exist and all have URLs, 0.55 when
  some URLs are missing, and 0.00 when no source rows exist.
- Audit/CVR/equipment context uses loaded electronic artifacts and loaded or
  partial admin-context families, capped at 1.00.
- The displayed readiness percentage is the average dimension score times 100.
- The label is:
  - `Strong review support` when score is at least 0.80 and no blockers exist.
  - `Partial review support` when score is at least 0.55.
  - `Weak review support` when score is above 0 but below 0.55.
  - `Blocked for responsible flag review` when blockers exist and score is below
    0.50.
  - `Waiting on source data` when score is 0.

### Flag Mix

- Input: advisory indicator rows for the selected state.
- The app groups indicators by display label and counts rows in each group.
- Bar width is `count / total indicator count`, with a minimum visible width for
  nonzero counts.

### Vote-Share By Vote-Count Scatterplot

- Input: selected review rows where Harris votes, Trump votes, Harris share, and
  Trump share are present and positive.
- For each review row, the app plots two points:
  - Democratic point: x = Harris votes, y = Harris vote share.
  - Republican point: x = Trump votes, y = Trump vote share.
- X-axis is scaled from 0 to the largest candidate vote count in the selected
  review rows.
- Y-axis is candidate vote share from 0 to 100 percent.
- Trend lines use ordinary least squares over each candidate's points:
  - slope = `(n * sum(x*y) - sum(x) * sum(y)) / (n * sum(x*x) - sum(x)^2)`
  - intercept = `(sum(y) - slope * sum(x)) / n`
- If fewer than two points exist, or all x values are identical, no trend line is
  drawn.
- This chart is a screening view only. Outliers require source-level review.

### Presidential-Versus-Comparison Drop-Off Histogram

- Input: selected review rows with same-party presidential-versus-comparison
  contest values.
- For each row, the app reads `demDropoff` and `repDropoff` percentages.
- Values are clamped to the visible range from -30 percent to +30 percent.
- The histogram uses 13 buckets of 5 percentage points each:
  `-30 to -25`, `-25 to -20`, ..., `25 to 30`.
- Democratic and Republican values are counted separately in each bucket.
- The y-axis is row count, scaled to the largest bucket count.
- A row without comparison-contest values is excluded from the histogram.

### Ticket-Splitting Proxy

- Input: review rows with a comparison contest label and both same-party drop-off
  values.
- The app calculates:
  - rows with values = count of usable comparison rows.
  - state average Democratic gap = average `demDropoff`.
  - state average Republican gap = average `repDropoff`.
  - Democratic-ahead rows = count where `demDropoff > 0`.
  - Republican-ahead rows = count where `repDropoff > 0`.
  - material rows = count where `abs(demDropoff) >= 5` or
    `abs(repDropoff) >= 5`.
- This is not ballot-level ticket splitting. It is a same-row comparison-contest
  proxy.

## Advisory Indicator Formulas

Advisory indicators are produced in the import layer and displayed in the Review
Center. They are not conclusions.

### Vote-Share Pattern

- Input: local review rows inside a county or comparable jurisdiction.
- Calculation: Pearson correlation between local candidate vote count and that
  candidate's vote share.
- Threshold: flags when either major candidate's absolute correlation is at least
  0.35 and the jurisdiction has at least 8 local rows.
- Review checks: reporting-unit size, geography, demographics, vote method mix,
  boundary grouping, historical baseline, and source workbook definitions.

### Average Down-Ballot Difference

- Input: local review rows with same-party presidential and comparison-contest
  values.
- Calculation: average same-party percent gap between presidential votes and the
  comparison contest across imported local rows.
- Threshold: flags when the Democratic or Republican average gap reaches 6
  percent.
- Vote-share-only imports do not emit this indicator.

### Down-Ballot Outliers

- Input: local review rows with same-party comparison values.
- Calculation: count rows where same-party presidential-versus-comparison
  difference is at least 15 percent and the presidential candidate has at least
  100 votes in that row.
- Threshold: flags when outlier rows reach at least 3 rows or 5 percent of the
  jurisdiction's imported local rows, whichever is larger.
- Vote-share-only imports do not emit this indicator.

## Historical Graphs

### Statewide Vote Share

- Input: historical baseline rows for enabled years.
- For each year, the app sums Democratic, Republican, other, and total votes.
- Shares are:
  - Democratic share = Democratic votes / total votes * 100.
  - Republican share = Republican votes / total votes * 100.
  - Other share = max(0, 100 - Democratic share - Republican share).

### Margin Trend

- Input: historical baseline rows for enabled years.
- For each year, the app sums Democratic, Republican, and total votes.
- Winner is the party with the larger two-party major-candidate total.
- Margin votes = absolute Democratic minus Republican vote difference.
- Margin percent = margin votes / total votes * 100.
- Bar width is scaled to the largest enabled-year margin percent.

### Largest County Democratic-Share Movement

- Input: historical rows grouped by jurisdiction across enabled years.
- For each jurisdiction with at least two enabled-year rows:
  - first Democratic share = earliest enabled year Democratic votes / total
    votes * 100.
  - last Democratic share = latest enabled year Democratic votes / total votes *
    100.
  - movement = last share minus first share.
- The chart displays the 12 jurisdictions with the largest absolute movement.

### Klimek-Style Proxy Fingerprints

- Input: historical rows by year.
- Current app status: proxy view. True Klimek-style fingerprints need vote share
  and turnout percentage for the same reporting units. The current chart uses
  vote volume as a temporary turnout proxy when turnout denominators are missing.
- For each row:
  - x = Democratic vote share from 0 to 100 percent.
  - y = square-root-scaled total votes relative to the largest row total in that
    year.
  - point radius = square-root-scaled total votes.
- The chart is always presented with an acknowledgement gate because it is a
  proxy, not a complete fingerprint test.

### Shpilkin-Style Vote-Share Diagnostics

- Input: historical rows by year.
- For each enabled year, rows are grouped into ten Democratic-share buckets:
  `0-10`, `10-20`, ..., `90-100`.
- For each bucket, the app sums total votes, Democratic votes, Republican votes,
  and row count.
- Bar height is bucket total votes divided by the largest bucket total for that
  year.
- The bar color reflects whether the bucket's Democratic share is at least 50
  percent.
- The chart is a distribution diagnostic and does not replace precinct-level or
  turnout-based review.

## Data And Context Charts

### Vote-Method Context

- Input: normalized participation-method rows.
- For each method, the app sums reported voters and row counts.
- Rows with unavailable values are counted separately.
- The chart is participation context only and is not candidate-by-method evidence.

### Equipment Context

- Input: normalized equipment rows and equipment cluster diagnostics.
- The app groups equipment context by available vendor, system, paper-record,
  tabulation, poll-book, and source-granularity fields.
- Warnings are shown when equipment fields are uniform or coarse enough that they
  should not be treated as precinct-specific context.
- Equipment charts are administration context only and do not prove causation for
  vote patterns.

## Source References

### Internal Implementation References

- `src/app/workspace-tabs.tsx`: Review Center, historical graphs, vote-method
  context, equipment context, chart gates, and methodology copy.
- `src/app/results-explorer.tsx`: map modes, result table, map join behavior,
  selected jurisdiction drawer, and source links.
- `src/db/native-import.ts`: native import advisory indicator generation.
- `src/db/legacy-import.ts`: legacy import advisory indicator generation.
- `docs/native-import-source-packages.md`: state-by-state source package status
  and caveats.
- `docs/turnout-collection-inventory.md`: turnout denominator source status.

### External Method And Source References

- [EAC Datasets, Codebooks, and Surveys](https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys) - source family for EAVS turnout, registration, and participation-method context.
- [EAC Voluntary Voting System Guidelines](https://www.eac.gov/voting-equipment/voluntary-voting-system-guidelines) - federal voting-system certification standards.
- [EAC Testing and Certification Program](https://www.eac.gov/election-technology/testing-certification-program-tc) - official voting-system testing and certification program.
- [EAC Quality Monitoring Program](https://www.eac.gov/voting-equipment/quality-monitoring-program) - official voting-system anomaly reporting and investigation program.
- [EAC Voting System Reports Collection](https://www.eac.gov/voting-equipment/voting-system-reports-collection) - official collection of voting-system reports.
- [NIST Voting Program](https://www.nist.gov/itl/voting) - federal voting-system standards and research context.
- [Klimek, Yegorov, Hanel, and Thurner, Statistical detection of systematic election irregularities](https://arxiv.org/abs/1201.3087) - academic background for vote-share/turnout fingerprint diagnostics.
- [Kobak, Shpilkin, and Pshenichnikov, Statistical anomalies in 2011-2012 Russian elections revealed by 2D correlation analysis](https://arxiv.org/abs/1205.0741) - academic background for turnout/vote-share distribution diagnostics.

## Interpretation Rules

- A chart can prioritize a source review; it cannot prove wrongdoing.
- A missing row, blocked chart, or source caveat is a data limitation, not an
  inference about election conduct.
- Any escalated review should cite the exact state, jurisdiction, chart, source
  document, local artifact, and date checked.
- Stronger claims require official canvass records, source reconciliation,
  audit/recount/CVR context where available, and review by a human analyst.
