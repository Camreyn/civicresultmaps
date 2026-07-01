# Mississippi 2024 Data Coverage

Checked at: 2026-07-01

This note is an internal source and review-path inventory for Mississippi. It does not replace the ETL config, source registries, or reviewed staging artifacts.

## Loaded Official Coverage

- Certified presidential county results: loaded from the Mississippi Secretary of State 2024 General Election statewide recap CSV at `data/ms-2024-election-recap-sheets.csv`.
- Same-grain comparison contest: loaded from the same SOS recap CSV using county-level U.S. Senate rows.
- Statewide reference PDF: retained at `data/ms-2024-official-statewide-results.pdf` for provenance next to the parsed CSV.
- County geometry: loaded from Census TIGERweb county GeoJSON at `data/ms-counties.geojson`.
- Turnout denominator: loaded from EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ms-2024-eac-turnout.csv`; this remains the active turnout source. The official Mississippi SOS November 2024 Active Voter Count denominator lead is collected at `data/ms-2024-november-active-voter-count.pdf` and normalized to `data/ms-2024-november-active-voter-count.csv` by `npm run etl:collect:ms:active-voters`, but it is candidate context only until paired with official ballots-cast or voter-participation rows.
- Equipment context: loaded separately in `data/admin-source-packages.json` from Verified Voting Verifier county-level context, normalized to `data/ms-2024-equipment-context.csv`. This is administration context only, not a turnout or vote-result source.

## Precinct Review Path

The official county recapitulation PDF package is present at `data/ms-2024-county-results-pdfs` with 84 PDFs for 82 counties because updated Coahoma and Pike files are retained with their originals. The OCR review path is intentionally gated and should not be promoted until reviewed county outputs reconcile to the official recap totals.

Current checked-in OCR artifacts include partial text rows under `data/ms-2024-county-results-ocr-text` plus reviewed correction rows in `data/ms-2024-ocr-reviewed-corrections.csv`. Running:

```powershell
npm run etl:verify:ms:ocr:reviewed
```

on 2026-06-30 reported 11 import-ready counties, 61 counties still requiring review, and 10 counties still missing OCR after applying the broader reviewed correction file in partial-review mode. The import-ready counties were Adams, Alcorn, Amite, Benton, Bolivar, Calhoun, Chickasaw, Clarke, Clay, Coahoma, and George.

Remaining precinct-review blocker: complete OCR or manual review for the other counties, reconcile candidate totals for Harris, Trump, Pinkins, and Wicker against the official SOS recap CSV, then promote only a reviewed structured precinct CSV through a parser.

## Historical Baselines

2020, 2016, and 2012 historical baselines were not added in this pass. No source-cited official historical Mississippi county presidential artifacts are present in the repo. The live Mississippi SOS election-results index confirms archive pages for the target elections:

- 2020 General Election: `https://www.sos.ms.gov/elections-voting/election-results/2020/2020-general-election`
- 2016 General Election: `https://www.sos.ms.gov/elections-voting/election-results/2016/2016-general-election`
- 2012 Election Results: `https://www.sos.ms.gov/elections-voting/election-results/2012/2012-election-results`

Those archive pages render the result tables through an iframe in the current site. The text fetch used in this pass did not expose stable direct county presidential artifact URLs, so no historical parser or CSV was added. That documents an acquisition blocker from this environment; it is not evidence that the Secretary of State does not publish or retain the historical files.

Next action: collect official Mississippi SOS historical county presidential artifacts for 2020, 2016, and 2012 from the archive iframe targets, from any linked official recap files, or by request to the SOS Elections Division/Public Records Request path. For each artifact, record source URL, local path, reporting grain, parser path, expected county count, candidate totals, caveats, and confidence before enabling `historicalBaseline` for Mississippi.

## Turnout Denominator Follow-Up

The Mississippi SOS Active Voter Count Reports page is an official denominator lead: `https://www.sos.ms.gov/elections-voting/active-voter-count-reports`. The page describes monthly county active-voter counts compared with Census voting-age population estimates. This pass collected the November 2024 report from `https://www.sos.ms.gov/sites/default/files/active-voter-count-reports/2024November%20Voter%20Count%20Red.pdf` and normalized 82 county rows totaling 1,980,751 active voters against a 2,238,135 CVAP estimate.

These reports are not a drop-in replacement for the current EAC turnout rows because they are monthly active-registration denominators and do not by themselves provide ballots-cast rows, election-day denominator timing, or a same-grain turnout calculation. Next action: pair the collected November 2024 active-voter denominator lead only with an official Mississippi ballots-cast or voter-participation artifact before replacing the EAC turnout fallback.

## Remaining 2024 Source Gaps

- Official Mississippi ballots-cast or voter-participation rows to pair with the collected November 2024 active-voter denominator lead before replacing the EAC fallback.
- Precinct-level structured President-versus-U.S. Senate review CSV promoted from reviewed county PDF OCR/manual review.
- Precinct boundary geometry if subcounty map overlays are required.
- Post-election audit, CVR availability, incident/correction/litigation, tabulator/EMS log, logic-and-accuracy, and custody records. These are tracked as `needs_data` administration context, not as findings.
