# Mississippi 2024 Data Coverage

Checked at: 2026-07-03

This note is an internal source and review-path inventory for Mississippi. It does not replace the ETL config, source registries, or reviewed staging artifacts. The machine-readable coverage inventory for this pass is `data/ms-2024-data-coverage-inventory.json`, with artifact-specific follow-up asks in `data/ms-2024-source-request-matrix.tsv`.

## Loaded Official Coverage

- Certified presidential county results: loaded from the Mississippi Secretary of State 2024 General Election statewide recap CSV at `data/ms-2024-election-recap-sheets.csv`.
- Same-grain comparison contest: loaded from the same SOS recap CSV using county-level U.S. Senate rows.
- Statewide reference PDF: retained at `data/ms-2024-official-statewide-results.pdf` for provenance next to the parsed CSV.
- County geometry: loaded from Census TIGERweb county GeoJSON at `data/ms-counties.geojson`.
- Historical baselines: loaded from official SOS 2012/2016/2020 archive artifacts into `data/ms-historical-presidential-baseline.csv` by `npm run etl:collect:ms:historical`.
- Turnout denominator: loaded from EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ms-2024-eac-turnout.csv`; this remains the active turnout source. The official Mississippi SOS November 2024 Active Voter Count denominator lead is collected at `data/ms-2024-november-active-voter-count.pdf` and normalized to `data/ms-2024-november-active-voter-count.csv` by `npm run etl:collect:ms:active-voters`, but it is candidate context only until paired with official ballots-cast or voter-participation rows.
- Equipment context: loaded separately in `data/admin-source-packages.json` from Verified Voting Verifier county-level context, normalized to `data/ms-2024-equipment-context.csv`. This is administration context only, not a turnout or vote-result source.

## Precinct Review Path

The official county recapitulation PDF package is present at `data/ms-2024-county-results-pdfs` with 84 PDFs for 82 counties because updated Coahoma and Pike files are retained with their originals. The OCR review path is intentionally gated and should not be promoted until reviewed county outputs reconcile to the official recap totals.

Current checked-in OCR artifacts include partial text rows under `data/ms-2024-county-results-ocr-text` plus reviewed correction rows in `data/ms-2024-ocr-reviewed-corrections.csv`. Running:

```powershell
npm run etl:verify:ms:ocr:reviewed
```

on 2026-06-30 reported 11 import-ready counties, 61 counties still requiring review, and 10 counties still missing OCR after applying the broader reviewed correction file in partial-review mode. The import-ready counties were Adams, Alcorn, Amite, Benton, Bolivar, Calhoun, Chickasaw, Clarke, Clay, Coahoma, and George.

Remaining precinct-review blocker: complete OCR or manual review for the other counties, reconcile candidate totals for Harris, Trump, Pinkins, and Wicker against the official SOS recap CSV, then promote only a reviewed structured precinct CSV through a parser. The row `ms-precinct-president-senate-ocr-review` in `data/ms-2024-source-request-matrix.tsv` records the exact request/review gate before any precinct promotion.

## Historical Baselines

2020, 2016, and 2012 county presidential historical baselines are now loaded from official Mississippi SOS archive artifacts and normalized by:

```powershell
npm run etl:collect:ms:historical
```

The normalizer retains the official source artifacts under `data/ms-historical-official-results/` and writes `data/ms-historical-presidential-baseline.csv` with 246 county rows:

- 2020 General Election: official SOS statewide recapitulation CSV, 82 county rows, 1,313,759 total votes.
- 2016: official SOS statewide recap PDF text layer, 82 county rows, 1,209,357 total votes.
- 2012: official SOS certified President and Vice President PDF text layer, 82 county rows, 1,285,584 total votes.

These historical rows are county-level context only. They do not add precinct-level historical coverage and do not resolve the remaining 2024 county PDF OCR review gate.

## Turnout Denominator Follow-Up

The Mississippi SOS Active Voter Count Reports page is an official denominator lead: `https://www.sos.ms.gov/elections-voting/active-voter-count-reports`. The page describes monthly county active-voter counts compared with Census voting-age population estimates. This pass collected the November 2024 report from `https://www.sos.ms.gov/sites/default/files/active-voter-count-reports/2024November%20Voter%20Count%20Red.pdf` and normalized 82 county rows totaling 1,980,751 active voters against a 2,238,135 CVAP estimate.

These reports are not a drop-in replacement for the current EAC turnout rows because they are monthly active-registration denominators and do not by themselves provide ballots-cast rows, election-day denominator timing, or a same-grain turnout calculation. Next action: pair the collected November 2024 active-voter denominator lead only with an official Mississippi ballots-cast or voter-participation artifact before replacing the EAC turnout fallback. The `ms-state-native-ballots-cast-turnout` request row keeps that caveat explicit.

## Remaining 2024 Source Gaps

- Official Mississippi ballots-cast or voter-participation rows to pair with the collected November 2024 active-voter denominator lead before replacing the EAC fallback.
- Precinct-level structured President-versus-U.S. Senate review CSV promoted from reviewed county PDF OCR/manual review.
- Precinct boundary geometry if subcounty map overlays are required.
- Post-election audit, CVR availability, incident/correction/litigation, tabulator/EMS log, logic-and-accuracy, and custody records. These are tracked as `needs_data` administration context, not as findings.

See `data/ms-2024-source-request-matrix.tsv` for the current bounded request queue covering OCR review, state-native turnout replacement, loaded historical-baseline provenance, precinct geometry/crosswalks, and administration-context records.
