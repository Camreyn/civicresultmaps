# Turnout Source Packages

Checked at: 2026-06-30

This file summarizes turnout source packages that can be used by Civic Result Maps native ETL. The package is intentionally source-first: native importers should parse the listed official artifacts or normalized CSV files directly, not generated app bundles.

## Wisconsin

Status: loaded official EAC statewide fallback; partial official local ward sources retained as supplemental provenance

Wisconsin has native WEC ward result/review data available. A statewide WEC ward-level registered-voter denominator source is not currently present in public machine-readable artifacts, so the current statewide turnout package uses the official U.S. EAC 2024 EAVS V2 local-jurisdiction fallback:

| Metric | Value |
| --- | ---: |
| Reporting grain | local_jurisdiction |
| Rows | 1,851 |
| Ballots cast / voters | 3,434,185 |
| Registered voters | 3,933,068 |
| Warning rows | 2 |
| Turnout artifact | `data/wi-2024-eac-turnout.csv` |
| Denominator artifact | `data/wi-2024-registered-voter-denominator-eac.json` |

The legacy/local package remains useful supplemental provenance covering four counties:

| County | Level | Rows | Denominator Timing | Warning Rows |
| --- | --- | ---: | --- | ---: |
| Milwaukee | ward | 355 | preElectionDay | 355 |
| Dane | county | 1 | final | 0 |
| Jefferson | ward | 34 | unknown | 34 |
| Oneida | ward | 22 | preElectionDay | 22 |

Supplemental local package totals:

| Metric | Value |
| --- | ---: |
| Covered counties | 4 |
| Missing counties | 68 |
| Rows | 412 |
| Ward-level rows | 411 |
| County-level rows | 1 |
| Warning rows | 411 |
| Partial ballots-cast total | 691,073 |
| Partial registered-voter total | 769,431 |

Committed Civic Result Maps artifacts:

- `data/wi-2024-turnout-source-package.json`
- `data/wi-2024-eac-turnout.csv`
- `data/wi-2024-registered-voter-denominator-eac.json`
- `data/wi-2024-registered-voter-denominator-eac.csv`
- `data/wi-2024-turnout-partial.csv`

Source artifacts referenced by the manifest:

- `data/eac-2024-eavs-v2-csv.zip`
- `data/eac-2024-codebook.xlsx`
- `data/milwaukee-city-turnout.csv`
- `data/City of Milwaukee 2024 General Election Ward by Ward Results.pdf`
- `data/dane-county-turnout.csv`
- `data/dane-2024-general-result.html`
- `data/jefferson-county-turnout.csv`
- `data/jefferson-2024-general-result.html`
- `data/oneida-county-turnout.csv`
- `data/oneida-2024-general-result.html`

Reference generated output:

- `data/turnout-data.json`
- `data/turnout-data.js`

Parser contract:

- Primary statewide artifact: `data/wi-2024-eac-turnout.csv`
- Primary registered-voter denominator artifact: `data/wi-2024-registered-voter-denominator-eac.json`
- Supplemental local artifact: `data/wi-2024-turnout-partial.csv`
- State-specific manifest: `data/wi-2024-turnout-source-package.json`
- Primary format: normalized EAC turnout CSV
- Primary required columns: `state`, `election_year`, `jurisdiction_code`, `jurisdiction_name`, `level`, `ballots_cast`, `registered_voters`, `turnout_pct`, `denominator_type`, `denominator_timing`, `source_url`, `source_title`, `source_status`
- Primary optional/context columns: `county`, `local_unit`, `denominator_note`, `warning_required`, `notes`
- EAC fallback join keys: `state`, `jurisdiction_code`, `jurisdiction_name`
- Supplemental local required columns: `state`, `county`, `municipality`, `ward`, `source_level`, `ballots_cast`, `registered_voters`, `registration_denominator_timing`, `denominator_type`, `coverage_status`, `warning_required`, `source_url`
- Supplemental warning required when denominator timing is `preElectionDay` or `unknown`
- Supplemental ward-level join keys: `county`, `municipality`, `ward`
- Supplemental Dane join key: `county`

Important caveats:

- The EAC fallback is statewide official turnout context, but it is not WEC ward-grain denominator data.
- EAC F1a Total Voters is not identical to the WEC presidential contest vote total.
- The WEC ward-by-ward federal/state results workbook does not include registered-voter denominators.
- Two EAC Wisconsin jurisdiction rows have zero registered-voter denominators; normalized turnout percentages are blank and warning-gated.
- Wisconsin same-day registration means pre-Election-Day denominators can understate final registered voters.
- Jefferson denominator timing is not stated and must be warning-gated.
- Dane is county-level only, not ward-level.
- Ward labels need normalization before joining to WEC ward result rows.

Native ETL should use the EAC fallback for statewide turnout context while keeping the partial local rows and missing ward-level WEC denominator need explicit.

Native ETL should import these rows as partial Wisconsin turnout and expose missing counties explicitly.

## South Carolina

Status: official county turnout package loaded with warning-required denominator caveat

- Config: `etl/state-configs/sc.json`
- Collector: `npm run etl:collect:sc:turnout`
- Source page: `https://vrems.scvotes.sc.gov/Statistics/VoterHistoryResults`
- Local artifact: `data/sc-2024-vrems-turnout.csv`
- Reporting level: county
- Ballots-cast field: SC VREMS `totalVoting` participating voters
- Denominator field: SC VREMS `totalRegistered` printed registration-list voters
- Expected rows: 46
- Expected county-row total voting: 2,553,185
- Expected county-row registered voters: 3,851,930

Important caveats:

- The SC VREMS page states registration numbers include voters printed on election lists: all active registered voters plus some inactive voters.
- The statewide VREMS summary includes an unassigned/null-county row with 2 registered voters and 1 participating voter; the normalized artifact keeps the 46 named counties for joins.
- Turnout rows are county-level and warning-required, not precinct-level denominators.
