# Alaska historical registration source review

This package retains official Alaska Division of Elections aggregate registration snapshots for 2012, 2016, and 2020, advancing [issue #246](https://github.com/Camreyn/civicresultmaps/issues/246). It is source review only: it does not load turnout, results, historical baselines, map geometry, or database rows. No individual voter records are collected.

The [official statistics landing page](https://www.elections.alaska.gov/research/statistics/) links historical registration reports separately from election-result searches. The retained reports reconcile every parsed precinct registration total to its named House district and the independently printed statewide total:

| Snapshot | Parsed precinct rows | House districts | Registered voters | Official report |
| --- | ---: | ---: | ---: | --- |
| 2012-11-03 | 438 | 40 | 506,701 | [Party and precinct](https://www.elections.alaska.gov/statistics/vi_vrs_stats_party_2012.11.03.htm) |
| 2016-11-03 | 441 | 40 | 528,879 | [Party and precinct](https://elections.alaska.gov/statistics/2016/NOV/VOTERS%20BY%20PARTY%20AND%20PRECINCT.htm) |
| 2020-11-03 | 441 | 40 | 597,319 | [Party and precinct](https://www.elections.alaska.gov/statistics/2020/NOV/VOTERS%20BY%20PARTY%20AND%20PRECINCT.htm) |

The 2012 and 2016 snapshots are three and five days before their general elections, respectively; they are not election-day turnout denominators. The 2020 report is dated on the election date, but that alone does not establish compatibility with ballot-reporting units. None supplies a basis to allocate registration to absentee, early-voting, questioned, remote, or federal-overseas ballot buckets.

The package preserves a one-voter discrepancy for November 3, 2012: the party-and-precinct report gives 506,701 registered voters while the separate [age report](https://www.elections.alaska.gov/statistics/vi_vrs_stats_age_2012.11.03.htm) gives 506,702. It does not infer a correction or a cause.

## Retained artifacts and replay

All artifacts are under `data/ak-historical-registration/`:

- `raw/`: four exact official HTML responses, protected from Git line-ending conversion.
- `source-receipts.json`: actual successful retrieval times, requested/resolved URLs, byte lengths, and reviewed SHA-256 hashes. This collection occurred on September 6, 2026; timestamps are not backdated to the reports' publication dates.
- `ak-historical-registration-by-source-precinct.csv`: 1,320 source-label registration rows. Leading zeros and district context are preserved. These are year-specific source identities, not canonical database IDs or a cross-year crosswalk.
- `ak-historical-registration-by-house-district.csv`: 120 reconciled district rows.
- `ak-historical-registration-source-review.json`: source authority, original filenames, formats, parser path, counts, reconciliation, discrepancy, confidence, and reuse caveats.

The normalizer handles the official HTML's omitted closing row tags, reads actual district headings, checks unique precinct identities, rejects malformed numeric cells, and requires an explicit statewide aggregate in all three layouts. It normalizes total registration only; it does not analyze or rank party registration.

```powershell
node scripts/collect-ak-historical-registration.mjs --check
node tests/api/ak-historical-registration.test.mjs
node tests/api/ak-source-coverage.test.mjs
```

The last command includes the new regression tests and is already part of `npm.cmd run test:api`. Running the normalizer with no flags rebuilds derived artifacts offline. `--check` is read-only. `--refresh` deliberately fetches all four reports and records new retrieval receipts **only if every source still matches its independently reviewed byte/SHA-256 pin and passes reconciliation**. Changed source bytes require explicit review; refresh cannot silently accept them. Unknown, duplicate, or contradictory flags fail before collection. The script resolves paths from its own location, so replay does not depend on the shell's current directory. Generated CSV/JSON artifacts use LF across platforms.

## Remaining activation gates

This collects and normalizes the historical registration source portion of #246, but does not resolve the separate local-turnout semantics. Source-side ballot/registration compatibility, year-specific reporting-unit joins, and the existing zero-registration administrative-bucket caveat need review before any activation. The active `etl/state-configs/ak.json` remains unchanged, including its 2024 EAC turnout fallback and existing comparison-contest caveats. No geometry relationship, reporting-unit allocation, database write, production promotion, or public API/map change is made.
