# Native Import Source Packages

Checked at: 2026-06-15

This is a handoff package for the next native ETL states after Ohio and Wisconsin. It intentionally points to official source artifacts already stored in this repository. Generated `*-app-data.js` files are listed only as reference outputs; the native importer should parse the official artifacts directly.

Already-completed native states not repeated in this package: Ohio and Wisconsin.

## Recommended Order

1. Minnesota
2. Michigan
3. Pennsylvania

These states have county geometry, official presidential result artifacts, local review rows, same-grain comparison contest data, turnout sources, and expected validation totals already represented in `data/state-configs/`.

## Arkansas Wave 11 Update

- Config: `etl/state-configs/ar.json`
- Authority: Arkansas Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/ar-2024-official-results`, collected from the Arkansas Secretary of State TotalResults public API for the 2024 General Election federal contests
- Local review source: `data/ar-2024-official-results/federal-county-results`
- Comparison contest: U.S. House by district, same county-scoped TotalResults reporting-unit IDs, with district-based comparison caveats
- Turnout source: EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/ar-2024-eac-turnout.csv`
- County boundary: `data/ar-counties.geojson`
- Coverage inventory: `data/ar-2024-data-coverage-inventory.json`
- Equipment context: `data/ar-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 75 county result rows, 75 county geometry features, 1,182,676 presidential votes, 759,241 Trump votes, 396,905 Harris votes, 26,530 other votes, 2,779 reporting-unit review rows, and 73 EAC fallback turnout rows. Remaining gaps are state-native turnout denominators, human-readable precinct/reporting-unit names or geometry, official 2012/2016/2020 historical baseline artifacts, and normalized official audit/recount/CVR/incident/correction/litigation records. Current advisory review rows are public-interest screening inputs only, not findings.

## Colorado Wave 18 Native Activation

- Config: `etl/state-configs/co.json`
- Authority: Colorado Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- County result source: committed official Colorado SOS Clarity 2024 General Election detail XML ZIP at `data/co-2024-clarity-detailxml.zip`
- Local review source: the same Clarity ZIP, pairing county Presidential Electors rows with county CU Regent at-large rows because Colorado had no 2024 U.S. Senate race
- Current active turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/co-2024-eac-turnout.csv`; Clarity `ElectionVoterTurnout` remains a state-native lead only
- Coverage inventory: `data/co-2024-data-coverage-inventory.json`
- Source request matrix: `data/co-2024-source-request-matrix.tsv`
- County boundary: `data/co-counties.geojson`
- Equipment context: `data/co-2024-equipment-context.csv` from Verified Voting, context only

Wave 18 loads 64 county Presidential Electors rows from the official Clarity detail XML with 1,728,159 Harris votes, 1,377,441 Trump votes, 85,273 loaded other-candidate votes, and 3,190,873 loaded county presidential votes. The prior Abstract/certified-total lead is 3,192,745 votes, leaving a 1,872-vote unallocated gap that should not be assigned to counties without an official source. The same XML loads 64 county CU Regent at-large comparison rows. Active turnout remains EAC fallback with 64 rows, 3,240,754 ballots cast, and 4,583,280 registered voters; the Clarity turnout lead reports 3,241,120 ballotsCast and 4,058,938 totalVoters.

Remaining gaps are a write-in-inclusive Abstract artifact or source note for the 1,872-vote presidential gap, denominator review before replacing EAC turnout, official precinct/local result rows or CVR-derived aggregates for subcounty advisory coverage, precinct geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized risk-limiting audit, CVR availability, recount, correction, incident, litigation, custody, ballot-manifest, tabulator-log, and EMS-log records. Current advisory rows are county-level source-review inputs only, not findings.

## Minnesota

- Config: `etl/state-configs/mn.json`
- Reference bundle: `data/mn-app-data.js`
- Authority: Minnesota Secretary of State
- County results source: `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx`
- Local review source: `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx`
- Comparison contest: U.S. Senate, same precinct rows
- Turnout source: `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx`
- Turnout denominator: `REG7AM + EDR`
- County boundary: `data/mn-counties.geojson`
- Historical baseline status: not loaded in native ETL; production may still expose pre-native historical rows until official 2012/2016/2020 Minnesota source artifacts are normalized.

Expected validation:

| Metric | Value |
| --- | ---: |
| County rows | 87 |
| County geometry features | 87 |
| Trump | 1,519,032 |
| Harris | 1,656,979 |
| Other | 77,909 |
| State total | 3,253,920 |
| Local review rows | 4,075 |
| Turnout rows | 4,103 |
| Native historical baseline rows | 0 |

Caveat: precinct boundary GeoJSON is not included. County map joins are ready. Native Minnesota historical baseline rows are not enabled until official historical source artifacts are collected, parsed, and reconciled.

## Michigan

- Config: `etl/state-configs/mi.json`
- Reference bundle: `data/mi-app-data.js`
- Authority: Michigan Secretary of State
- County results source: `data/mi-2024-general-election-results.txt`
- Local review source: `data/mi-2024-precinct-results.zip`
- Comparison contest: U.S. Senate, same precinct ZIP tables
- Turnout source: `data/mi-2024-voter-turnout.txt` plus `data/mi-2024-registered-voter-count.pdf`
- Turnout denominator: November active registered voters
- Historical baseline source: `data/mi-historical-presidential-baseline.csv`, generated by `scripts/collect-mi-historical-baseline.mjs` from contextual secondary county tables while official historical MVIC/mielections paths remain script-blocked
- Administration source inventory: `data/mi-2024-admin-source-inventory.json`
- County boundary: `data/mi-counties.geojson`

Expected validation:

| Metric | Value |
| --- | ---: |
| County rows | 83 |
| County geometry features | 83 |
| Trump | 2,816,636 |
| Harris | 2,736,533 |
| Other | 111,017 |
| State total | 5,664,186 |
| Local review rows | 4,428 |
| Turnout rows | 83 |
| Historical baseline rows | 249 |

Caveats: MVIC live download endpoints are browser-protected, but the official downloaded 2024 artifacts are present. Turnout is county-level. Precinct boundary GeoJSON is not included. Historical baseline rows for 2020, 2016, and 2012 are now loaded as contextual secondary county tables, not official replacement certified totals; replace them with official Michigan SOS historical exports if a script-readable source is collected. Administration context is inventoried, but normalized audit/recount/CVR/incident/correction rows are not loaded.

## Pennsylvania

- Config: `etl/state-configs/pa.json`
- Reference bundle: `data/pa-app-data.js`
- Authority: Pennsylvania Department of State
- County results source: `data/pa-2024-general-election-returns-precinct.txt`
- Local review source: `data/pa-2024-general-election-returns-precinct.txt`
- Comparison contest: U.S. Senate, same precinct returns file
- Turnout source: `data/pa-2024-voter-registration-vote-history-summary.xlsx`
- Precinct registration denominator lead: `data/pa-2024-general-voter-registration-precinct.txt` (official DOS precinct registered-voter rows; not loaded as turnout until same-grain precinct vote-history/ballots-cast rows are collected)
- Coverage inventory: `data/pa-2024-data-coverage-inventory.json`
- Turnout denominator: registered voters
- County boundary: `data/pa-counties.geojson`

Expected validation:

| Metric | Value |
| --- | ---: |
| County rows | 67 |
| County geometry features | 67 |
| Trump | 3,543,041 |
| Harris | 3,420,865 |
| Other | 67,831 |
| State total | 7,031,737 |
| Local review rows | 9,154 |
| Turnout rows | 67 |

Caveats: the official readme says the election returns data was extracted January 10, 2025; the direct file name includes `20250129`. Turnout is county-level. The collected precinct registration file is a denominator lead only because no same-grain precinct vote-history/ballots-cast source is loaded. Precinct boundary GeoJSON is not included. The PA coverage inventory also records official 2024 RLA context and official 2012/2016/2020 historical bulk-return source leads for a future replacement of secondary historical baselines.

## Nebraska Wave 5 Update

- Config: `etl/state-configs/ne.json`
- Authority: Nebraska Secretary of State
- County results source: `data/ne-2024-general-canvass-president.csv`, normalized from the 2024 General Canvass Book PDF
- Local review source: `data/ne-2024-general-canvass-senate-two-year.csv`
- Comparison contest: U.S. Senate two-year special election, county rows only
- Turnout source: EAC 2024 county fallback rows, with `data/ne-2024-general-canvass-book.pdf`, `data/ne-2024-post-general-eligible-voter-report.pdf`, `data/ne-2024-canvass-voting-statistics-reconciliation.csv`, and `data/ne-2024-canvass-voting-statistics-reconciliation-summary.json` retained as state-native canvass/registration cross-checks
- Historical baseline source: `data/ne-historical-presidential-baseline.csv`, generated by `scripts/normalize-ne-historical-baseline.mjs` from the official 2012, 2016, and 2020 General Canvass Book PDFs
- County boundary: `data/ne-counties.geojson`
- Admin/source inventory: `data/ne-2024-admin-source-inventory.json`, documenting canvass Reported Problems notes, precinct/geometry request paths, turnout cross-checks, supplemental equipment context, and audit/recount/CVR/litigation gaps

Expected validation:

| Metric | Value |
| --- | ---: |
| County rows | 93 |
| County geometry features | 93 |
| Trump | 564,816 |
| Harris | 369,995 |
| Other | 17,371 |
| State total | 952,182 |
| Local review rows | 93 |
| Turnout rows | 93 |
| Historical baseline rows | 279 |

Caveats: review rows are county-level President-versus-U.S. Senate two-year special election comparisons, not precinct/subcounty scatter plots. The public SOS source pass did not identify statewide precinct/subcounty President and U.S. Senate result exports; request those rows and matching reporting-unit geometry before upgrading advisory coverage below county level. Loaded turnout rows remain EAC fallback. The generated canvass voting-statistics reconciliation reports 965,236 statewide total voting versus 965,145 EAC fallback ballots cast, a 91-vote canvass-minus-EAC difference across 34 county rows, and no registered-voter denominator difference; review replacement semantics before switching active turnout away from EAC fallback.

## West Virginia Wave 4 Update

- Config: etl/state-configs/wv.json
- Authority: West Virginia Secretary of State
- County and precinct result source: data/wv-2024-county-detailxml-reports
- Comparison contest: U.S. Senate, same precinct detail XML rows
- Turnout source: official county detail XML VoterTurnout precinct rows
- Turnout denominator: totalVoters registered-voter field; expected 1,649 rows, 770,587 ballots cast, and 1,187,991 registered voters
- County boundary: data/wv-counties.geojson
- Equipment context: data/wv-2024-equipment-context.csv from Verified Voting, context only
- Coverage/admin inventory: data/wv-2024-data-coverage-inventory.json documents official SOS/county request paths for precinct geometry, hand-count audit outcomes, CVR availability, recount/correction/incident/litigation records, and official historical baseline source leads

Remaining gaps: official statewide precinct boundary geometry for subcounty overlays, normalized 2024 audit selection/outcome artifacts, CVR availability rows, incident/correction/recount/litigation records, and loaded 2012/2016/2020 historical baseline rows. The loaded review rows remain advisory screening inputs, not findings; the Wave 9 inventory records source/request paths only for the remaining administration context.

## Missouri Wave 5 Update

- Config: `etl/state-configs/mo.json`
- Authority: Missouri Secretary of State
- County/reporting-jurisdiction result source: `data/mo-2024-general-president.csv`, normalized from the official SOS 2024 results-by-county PDF
- Local review source: `data/mo-2024-general-senate.csv`
- Comparison contest: U.S. Senate, county/reporting-jurisdiction rows only
- Turnout source: `data/mo-2024-general-turnout.csv`, normalized from the official SOS 2024 General Election voter turnout PDF
- Turnout denominator: registered voters from the SOS turnout report; expected 116 rows, 2,995,376 actual voters, and 4,433,383 registered voters
- Historical baseline source: `data/mo-historical-presidential-baseline.csv`, generated by `scripts/normalize-mo-sos-pdfs.mjs` from official 2012, 2016, and 2020 SOS county/reporting-jurisdiction presidential PDFs
- County boundary: `data/mo-counties.geojson`
- Administration source inventory: `data/mo-2024-admin-source-inventory.json`
- Request tracker: `data/mo-2024-source-request-tracker.json`

Expected validation: 116 county/reporting-jurisdiction result rows, 115 county geometry features, 116 local review rows, 116 turnout rows, 348 historical baseline rows, 2,995,327 presidential votes, 1,751,986 Trump votes, 1,200,599 Harris votes, and 42,742 other presidential votes.

Caveats: review rows are county/reporting-jurisdiction President-versus-U.S.-Senate comparisons, not precinct scatter plots. The SOS results page says precinct-level general election data files are available for purchase from the Elections Division, so subcounty advisory rows remain blocked until that file is obtained. Kansas City is reported separately in the SOS PDFs and does not have a separate Census county polygon. The administration inventory records official source paths for audit, CVR availability, incident/correction, recount, litigation, and equipment context, and the request tracker records the source/request fields to pursue next; normalized administration rows are not loaded.


## North Carolina Wave 6 Update

- Config: `etl/state-configs/nc.json`
- Authority: North Carolina State Board of Elections; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/nc-2024-results-precinct.zip`, from the official NCSBE 2024 general precinct results ZIP
- Local review source: `data/nc-2024-results-precinct.zip`
- Comparison contest: Governor, because North Carolina had no 2024 U.S. Senate race
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/nc-2024-eac-turnout.csv`; NCSBE voter-history and registered-voter-stats ZIPs are documented state-native leads but are not yet normalized into the active turnout contract
- Historical baseline source: `data/nc-historical-presidential-baseline.csv`, generated by `node scripts/collect-nc-historical-baseline.mjs` from official NCSBE 2012, 2016, and 2020 precinct results ZIPs
- County boundary: `data/nc-counties.geojson`
- Administration source inventory: `data/admin-source-packages.json` records the NCSBE 2024 General Election Audit Results PDF path and request-required CVR/incident/correction context

Expected validation: 100 county result rows, 100 county geometry features, 5,699,141 presidential votes, 2,898,423 Trump votes, 2,715,375 Harris votes, 85,343 other presidential votes, 2,658 Real Precinct=Y review rows, 100 EAC fallback turnout rows, and 300 historical baseline rows across 2012, 2016, and 2020.

Caveats: certified county totals aggregate all official NCSBE reporting units, while review rows filter to Real Precinct=Y and exclude early voting, absentee, provisional, transfer, and other non-real reporting units from precinct-only review charts. Historical baselines are county-level context only. Remaining gaps are state-native turnout normalization, map-ready precinct boundary geometry, normalized audit/recount/CVR availability, and incident/correction/litigation records.
## Iowa Wave 9 Update

- Config: `etl/state-configs/ia.json`
- Authority: Iowa Secretary of State; U.S. Census Bureau; Verified Voting equipment context
- County and precinct result source: `data/ia-2024-county-detailxml-reports`, collected from the official Iowa SOS Clarity results app
- Comparison contest: U.S. House by district, same county detail XML reports, with district-based advisory caveat
- Turnout source: official county detail XML `VoterTurnout` precinct rows, using `ballotsCast` and `totalVoters`
- County boundary: `data/ia-counties.geojson`; official SOS county precinct shapefile ZIPs are now documented source leads but not collected or crosswalked
- Historical baseline source: `data/ia-historical-presidential-baseline.csv`, secondary contextual 2012/2016/2020 county rows; official SOS historical result/statistical report leads are documented for future replacement
- Administration/source inventory: `data/ia-2024-data-coverage-inventory.json`; includes Clarity VoteType vote-method feasibility, SOS precinct shapefile leads, the official 2024 General Election County Precinct Audits image lead, and recount/CVR/incident/correction/litigation request paths
- Equipment context: `data/ia-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 99 county result rows, 99 county geometry features, 1,653 precinct review rows, 1,651 precinct turnout rows, and 297 contextual historical baseline rows across 2012, 2016, and 2020.

Remaining gaps: an Iowa Clarity VoteType normalizer and public vote-method caveat, collected and crosswalked precinct geometry, normalized 2024 audit selection/outcome rows, official historical baseline replacement artifacts, and normalized recount/CVR availability/incident/correction/litigation records. Current advisory review rows are public-interest screening inputs only, not findings.

## Nevada Wave 9 Update

- Config: `etl/state-configs/nv.json`
- Authority: Nevada Secretary of State; Nevada county clerks/registrars; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/nv-2024-statewide-general-president.csv`, transcribed from an archived official NVSOS statewide general results page because live NVSOS/Silver State pages are script-blocked
- Local review source: `data/nv-clark-2024-general-cvr-precinct-review.csv`, `data/nv-washoe-2024-general-cvr-precinct-review.csv`, and `data/nv-humboldt-2024-general-cvr-precinct-review.csv`
- Comparison contest: U.S. Senate, using official county CVR precinct aggregates for Clark, Washoe, and Humboldt only
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/nv-2024-eac-turnout.csv`; state-native turnout remains blocked by source access and missing artifacts
- County boundary: `data/nv-counties.geojson`
- Coverage inventory: `data/nv-2024-source-coverage-inventory.json` plus Wave 9 request matrix `data/nv-2024-county-source-request-matrix.tsv`

Expected validation: 17 county result rows, 17 county geometry features, 1,484,840 presidential votes, 1,057 local review rows from Clark/Washoe/Humboldt CVR precinct aggregates, 17 EAC fallback turnout rows, and 51 secondary historical baseline rows. Remaining risks: 14 Nevada jurisdictions still need official local President and U.S. Senate rows or CVR/SOV exports, state-native turnout denominators, precinct/local geometry or crosswalks, official 2012/2016/2020 historical replacement artifacts, and normalized audit/CVR/L&A/tabulator-log/custody/incident/correction/recount/litigation records. Current advisory rows are public-interest screening inputs only, not findings.


## Indiana Wave 9 Update

- Config: `etl/state-configs/in.json`
- Authority: Indiana Election Division; Indiana Secretary of State Election Division / VSTOP; Indiana Recount Commission; U.S. Census Bureau
- 2024 county results: official archived ENR President and U.S. Senate category JSON remains loaded from `data/in-2024-official-results/OffCatC_1019_A.json` and `data/in-2024-official-results/OffCatC_1006_A.json`.
- Local review: `data/in-2024-mit-local-review.csv` remains supplemental MIT/OpenElections President-versus-U.S.-Senate precinct context, not certified replacement totals.
- Turnout: official Indiana Election Division county turnout and registration rows remain loaded at `data/in-2024-general-turnout.csv`.
- Historical baseline: official 2012, 2016, and 2020 county presidential rows are loaded. Wave 13 collects 2012 from the current Indiana Voters ENRHistorical table endpoint and keeps the raw rows at `data/in-2012-official-president-county.json`; 2016 and 2020 remain loaded from ENR archive JSON.
- Administration context: the official VSTOP 2024 General Election Post-Election Audit Summary Report is retained at `data/in-2024-general-post-election-audit-summary-report.pdf` and normalized by `scripts/normalize-in-audit-summary.mjs` into seven county audit-summary context rows. Election Administrator Portal, Recount Commission, CVR, incident, correction, recount, and detailed audit-unit workpaper paths remain documented request items.

Expected validation remains: 92 county result rows, 92 county geometry features, 2,936,677 presidential votes, 5,253 supplemental local review rows, 92 turnout rows, 276 official historical baseline rows for 2012/2016/2020, and 7 VSTOP audit-summary context rows. Advisory indicators are source/data reconciliation signals only; they are not claims of misconduct.

Completion decision, checked 2026-07-03: keep Indiana in `sourceDiscoveryQueue` and out of `completedNativeStates`. The loaded county, turnout, historical, and VSTOP summary artifacts are useful and source-backed, but the local review/advisory rows still rely on supplemental MIT/OpenElections precinct context. Official same-grain precinct/subcounty President and U.S. Senate rows remain the blocker before the supplemental-source caveat can be removed.


## Idaho Wave 12 Update

- Config: `etl/state-configs/id.json`
- Authority: Idaho Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting context
- County results source: `data/id-2024-general-president.csv`, normalized from official Vote Idaho 2024 General Election county XML endpoints with documented official county-table fallback handling for stale endpoints
- Local review source: `data/id-2024-general-us-house.csv`
- Comparison contest: U.S. House by congressional district, aggregated to county rows, with district-based advisory caveats
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/id-2024-eac-turnout.csv`
- County boundary: `data/id-counties.geojson`
- Equipment context: `data/id-2024-equipment-context.csv` from Verified Voting, context only
- Coverage inventory: `data/id-2024-data-coverage-inventory.json`

Expected validation: 44 county result rows, 44 county geometry features, 904,967 presidential votes, 605,246 Trump votes, 274,972 Harris votes, 24,749 other votes, 44 county review rows, and 44 EAC fallback turnout rows. Remaining gaps are state-native turnout denominators, precinct/local reporting-unit President and comparison rows, precinct geometry/crosswalks, official 2012/2016/2020 historical baseline normalization, normalized post-election audit rows, CVR availability records, and official incident/correction/recount/litigation records. Current advisory rows are public-interest screening inputs only, not findings.

## Kansas Wave 11 Update

- Config: `etl/state-configs/ks.json`
- Authority: Kansas Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/ks-2024-presidential-results.xlsx`, from the official Kansas SOS 2024 Presidential Election Results workbook
- Local review source: `data/ks-2024-general-us-house-precinct.xlsx`, from the official Kansas SOS U.S. House precinct workbook
- Comparison contest: U.S. House by congressional district, paired to official presidential precinct rows, with district-based and vote-share-only caveats
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ks-2024-eac-turnout.csv`
- County boundary: `data/ks-counties.geojson`
- Equipment context: `data/ks-2024-equipment-context.csv` from Verified Voting, context only
- Coverage inventory: `data/ks-2024-data-coverage-inventory.json`

Expected validation: 105 county result rows, 105 county geometry features, 1,327,591 presidential votes, 758,802 Trump votes, 544,853 Harris votes, 23,936 other votes, 3,739 precinct review rows, and 105 EAC fallback turnout rows.

Remaining gaps: Kansas-native turnout/registration denominators, official precinct boundary geometry or a precinct crosswalk, official 2012/2016/2020 county historical presidential baselines, normalized post-election audit rows, CVR availability records, and official incident/correction/recount/litigation records. Current advisory rows are public-interest screening inputs only, not findings.
## Massachusetts Wave 11 Update

- Config: `etl/state-configs/ma.json`
- Authority: Massachusetts Secretary of the Commonwealth; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting
- County results source: `data/ma-2024-president-county-results.csv`, generated from official PD43+ 2024 President county-filtered County Totals pages
- Local review source: `data/ma-2024-president-precinct-results.csv` and `data/ma-2024-us-senate-precinct-results.csv`
- Comparison contest: U.S. Senate, paired by PD43+ City/Town, Ward, and Pct
- Turnout source: EAC 2024 jurisdiction fallback at `data/eac-2024-state-turnout/ma-2024-eac-turnout.csv`; the official Massachusetts turnout statistics page confirms the same 2024 statewide registered-voter and total-votes-cast figures but is not a local replacement package
- Historical baseline source: `data/ma-historical-presidential-baseline.csv`, generated by `npm run etl:collect:ma:historical` from official PD43+ 2012, 2016, and 2020 President county result pages
- County boundary: `data/ma-counties.geojson`
- Coverage/admin inventory: `data/ma-2024-data-coverage-inventory.json`

Expected validation: 14 county result rows, 14 county geometry features, 2,382 city/town/ward/precinct review rows, 351 EAC fallback turnout rows, 42 official PD43+ historical baseline rows, and 3,512,930 presidential votes.

Remaining gaps: state-native local turnout denominators, official precinct/ward/municipal geometry or reporting-unit crosswalk, detailed audit workpapers, CVR availability, ballot images, tabulator/EMS logs, logic-and-accuracy records, custody records, incident/correction records, recount records, and litigation records. Current advisory rows are public-interest screening inputs only, not findings.

## Oklahoma Wave 12 Update

- Config: `etl/state-configs/ok.json`
- Authority: Oklahoma State Election Board; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- County results source: `data/ok-2024-official-results/ok-2024-county-level-results.zip`, from the official OK Election Results county-level CSV ZIP export
- Race-level reconciliation source: `data/ok-2024-official-results/ok-2024-race-level-results.csv`, from the official race-level CSV export
- Local review source: `data/ok-2024-official-results/ok-2024-precinct-level-results.zip`, from the official precinct-level CSV ZIP export
- Comparison contest: U.S. House by district; same-precinct rows are comparable only where both Democratic and Republican House candidate votes are present, with vote-share-only rows retained for non-comparable precincts
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ok-2024-eac-turnout.csv`; Oklahoma-native turnout/voter-history denominator rows remain a source gap
- County boundary: `data/ok-counties.geojson`
- Coverage/admin inventory: `data/ok-2024-data-coverage-inventory.json` documents official historical result pages for 2012/2016/2020, the official 2024 post-election audit archive, precinct GIS source lead, records-request path, equipment context, and remaining CVR/recount/incident/correction/litigation gaps

Expected validation: 77 county result rows, 77 county geometry features, 1,566,173 presidential votes, 1,036,213 Trump votes, 499,599 Harris votes, 30,361 other votes, 1,977 precinct review rows, and 77 EAC fallback turnout rows. Remaining gaps are Oklahoma-native turnout or voter-history rows, precinct boundary geometry/crosswalks, loaded 2012/2016/2020 historical baseline rows, normalized row-level audit outcomes, CVR availability, recount, incident, correction, and litigation records. Current advisory rows are public-interest screening inputs only, not findings.

## Native ETL Acceptance Criteria

For each state, the native importer should fail before promotion if:

- Any listed local artifact is missing.
- County row count does not match the expected count.
- County geometry feature count does not match the expected count.
- `trump + harris + other` does not equal state total.
- Local review rows fail to produce county-normalized groups.
- President-vs-Senate comparison rows fail to join at the local reporting-unit grain.
- Turnout rows fail to join to county names used by county results.
- Source URL, local artifact path, parser name, and validation totals are not recorded in import provenance.

## South Carolina Wave 4 Update

- Config: `etl/state-configs/sc.json`
- Authority: South Carolina Election Commission
- County results source: `data/sc-2024-election-history/president-7131.csv`, downloaded from the official South Carolina Elections Database contest 7131 CSV endpoint
- Local review source: `data/sc-2024-election-history/us-house-7124.csv` through `us-house-7130.csv`
- Comparison contest: U.S. House by congressional district; duplicate county/precinct keys from district splits are aggregated before advisory comparison
- Turnout source: `data/sc-2024-vrems-turnout.csv`, generated by `npm run etl:collect:sc:turnout` from SC VREMS 2024 General Election voter-history county statistics
- Turnout denominator: VREMS printed registration-list voters; warning-required because the source page says the registration counts include active voters plus some inactive voters printed for the selected election
- County boundary: `data/sc-counties.geojson`

Expected validation:

| Metric | Value |
| --- | ---: |
| County rows | 46 |
| County geometry features | 46 |
| Trump | 1,483,747 |
| Harris | 1,028,452 |
| Other | 35,941 |
| State total | 2,548,140 |
| Local review rows | 2,401 |
| Turnout rows | 46 |

Caveats: review rows are President-versus-U.S.-House rather than a single statewide comparison contest. Precinct boundary geometry is not committed; the official SC VREMS precinct/polling-place export is a locator/reference path, not map-ready boundary geometry. Historical baselines and normalized audit/CVR/incident/recount/litigation rows remain future work.

## New Hampshire Wave 4 Update

- Config: `etl/state-configs/nh.json`
- Authority: New Hampshire Secretary of State
- County results source: `data/nh-2024-town-ward-president-governor.csv`, normalized from archived official President workbook rows
- Local review source: `data/nh-2024-town-ward-president-governor.csv`
- Comparison contest: U.S. House by congressional district, same town/ward grain, with district-based comparison caveat
- Turnout source: `data/nh-2024-ge-ballots-cast.xls` plus `data/nh-2024-ge-names-on-checklist.xlsx`, normalized into the same town/ward CSV
- Turnout denominator: names on checklist
- County boundary: `data/nh-counties.geojson`
- Administration/source inventory: `data/nh-2024-admin-source-inventory.json`
- Source request matrix: `data/nh-2024-source-request-matrix.tsv` records follow-up rows for the 2016 archive workbook set, 2020/2012 historical requests, town/ward geometry/crosswalks, and audit/CVR/recount/incident/correction/litigation source requests.
- Historical baseline lead: official archived 2016 President county XLS files plus `2016-ge-governor.xls` and 2016 congressional district XLSX files were identified through Internet Archive CDX. The July 2, 2026 NH inventory records exact 20240720 capture timestamps, MIME types, digests, and lengths, but direct `web/{timestamp}id_` binary downloads still failed from the worker environment and no local 2016 files are loaded.

Expected validation: 10 county rows, 304 town/ward review rows, 304 turnout rows, 831,468 detailed ballots cast, and 1,013,075 names-on-checklist registered-voter denominator rows. Remaining gaps: a 2016 historical normalizer and downloaded archive artifacts, targeted official archive/records-request paths for 2020 and 2012 historical baselines, official town/ward geometry, and normalized audit/recount/CVR/incident/correction/litigation records. Wave 13 refreshed CDX metadata for the 2016 official workbook captures, but direct binary downloads failed from the worker environment even after sandbox escalation; the request matrix records that blocker without loading historical rows.

## Indiana Wave 5 Update

- Config: `etl/state-configs/in.json`
- Authority: Indiana Election Division
- County results source: `data/in-2024-official-results/OffCatC_1019_A.json`, archived official ENR county President JSON
- County comparison source: `data/in-2024-official-results/OffCatC_1006_A.json`, archived official ENR county U.S. Senate JSON
- Local review source: `data/in-2024-mit-local-review.csv` from MIT/OpenElections supplemental Indiana precinct rows
- Turnout source: `data/in-2024-general-turnout.csv`, normalized from the official Indiana Election Division 2024 General Election Turnout and Registration PDF
- Turnout denominator: county Registered Voters; ballots cast field is Voters Voting
- County boundary: `data/in-counties.geojson`
- Historical baseline source: `data/in-historical-presidential-baseline.csv`, generated by `scripts/collect-in-historical-baseline.mjs` from the official Indiana Voters ENRHistorical table endpoint for 2012 and official Indiana ENR 2016 and 2020 county presidential category JSON
- Coverage inventory: `data/in-2024-data-coverage-inventory.json`
- Request matrix: `data/in-2024-source-request-matrix.tsv`, recording official follow-up asks for precinct/subcounty President and U.S. Senate rows, precinct geometry, precinct turnout denominators, VSTOP audit rows, CVR availability, and recount/incident/correction records

Expected validation: 92 county rows, 92 county geometry features, 2,936,677 presidential votes, 1,720,347 Trump votes, 1,163,603 Harris votes, 52,727 other votes, 5,253 supplemental local review rows, 92 county turnout rows totaling 2,976,599 voters voting and 4,837,802 registered voters, and 276 official county historical baseline rows for 2012, 2016, and 2020.

Caveats: official Indiana ENR category JSON is county-level, and the collected JurR county JSON inventory does not include President or U.S. Senate candidate result rows. Local advisory review still uses supplemental MIT/OpenElections precinct rows with upstream caveats; request official same-grain precinct/subcounty President and U.S. Senate rows before removing the supplemental-source warning. Official 2012 historical county presidential baselines are normalized from the current Indiana Voters ENRHistorical table endpoint, while 2016 and 2020 are normalized from ENR category JSON.

## Georgia Wave 6 Update

- Config: `etl/state-configs/ga.json`
- Authority: Georgia Secretary of State
- County results source: `data/ga-2024-official-results-export.json`, downloaded from the official SOS media export
- Local review source: `data/ga-2024-official-results-export.json`
- Comparison contest: U.S. House by congressional district, same official media export, with district-based and one-sided/multi-district caveats
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ga-2024-eac-turnout.csv`
- Historical baseline source: `data/ga-historical-presidential-baseline.csv`, generated by `scripts/collect-ga-historical-baseline.mjs` from official Georgia SOS 2012, 2016, and 2020 media exports
- County boundary: `data/ga-counties.geojson`
- Administration/source inventory: `data/ga-2024-data-coverage-inventory.json`
- Equipment context: `data/ga-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 159 county result rows, 159 county geometry features, 2,684 precinct review rows, 159 EAC fallback turnout rows, and 477 official county historical baseline rows. Remaining gaps: Georgia-native turnout/registration denominators, official precinct boundary geometry/crosswalks, and normalized official audit/recount/CVR/incident/correction records. Current advisory review rows are public-interest screening inputs only, not findings.

## Kentucky Wave 7 Update

- Config: etl/state-configs/ky.json
- Authority: Kentucky State Board of Elections; Kentucky county clerks; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: data/ky-2024-general-recap-text, derived from official county recap PDFs in data/ky-2024-general-recap-sheets
- Local review source: data/ky-2024-general-recap-text
- Comparison contest: U.S. House by district, with one-sided/uncontested and county-only caveats
- Turnout source: EAC 2024 county/jurisdiction fallback rows at data/eac-2024-state-turnout/ky-2024-eac-turnout.csv; Kentucky State Board turnout and registration PDFs are collected as candidate state-native leads at data/ky-2024-general-turnout-by-county.pdf, data/ky-2024-general-turnout-by-precinct.pdf, data/ky-2024-general-registration-by-county.pdf, and data/ky-2024-general-registration-by-precinct.pdf; scripts/reconcile-ky-turnout-registration.mjs generates data/ky-2024-turnout-registration-reconciliation.csv and data/ky-2024-turnout-registration-reconciliation-summary.json as county-level provenance only
- Historical baseline source: data/ky-historical-presidential-baseline.csv, generated from official Kentucky 2012, 2016, and 2020 general-election result PDFs
- County boundary: data/ky-counties.geojson
- Administration/source inventory: data/ky-2024-data-coverage-inventory.json
- Equipment context: data/ky-2024-equipment-context.csv from Verified Voting, context only

Expected validation: 120 county result rows, 120 county geometry features, 3,067 precinct review rows, 120 EAC fallback turnout rows, 360 official county historical baseline rows, and a 120-row candidate county turnout/registration reconciliation report. Remaining gaps: county-clerk official turnout documentation and replacement-semantics review before promoting State Board turnout over EAC fallback, a precinct-level turnout/registration crosswalk if using State Board precinct PDFs, map-ready precinct boundary geometry or a reporting-unit crosswalk, and normalized audit/recount/CVR/incident/correction/litigation records. Current advisory review rows are public-interest screening inputs only, not findings.


## Mississippi Wave 13 Update

- Config: `etl/state-configs/ms.json`
- Authority: Mississippi Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting context
- County results source: `data/ms-2024-election-recap-sheets.csv`, downloaded from the official Mississippi SOS 2024 General Election statewide recap CSV
- Local review source: the same recap CSV, currently at county grain only
- Comparison contest: U.S. Senate, same county recap CSV rows
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ms-2024-eac-turnout.csv`
- Denominator lead: official November 2024 Active Voter Count PDF and normalized CSV at `data/ms-2024-november-active-voter-count.pdf` and `data/ms-2024-november-active-voter-count.csv`; denominator lead only, not loaded as turnout
- County boundary: `data/ms-counties.geojson`
- Coverage inventory: `data/ms-2024-data-coverage-inventory.json`
- Source request matrix: `data/ms-2024-source-request-matrix.tsv`
- Equipment context: `data/ms-2024-equipment-context.csv` from Verified Voting, context only

Expected validation remains 82 county result rows, 82 county review rows, 82 EAC fallback turnout rows, 82 county geometry features, 1,225,238 presidential votes, 746,305 Trump votes, 465,357 Harris votes, and 13,576 other presidential votes. The reviewed OCR path remains blocked for statewide local review: the current matrix records 11 import-ready counties, 61 review-required counties, and 10 missing-OCR counties before any precinct promotion. Remaining gaps are fully reviewed precinct President-versus-U.S.-Senate rows, state-native ballots-cast or voter-participation rows paired with the active-voter denominator lead, precinct geometry or a crosswalk, official 2012/2016/2020 historical baselines, and normalized audit/CVR/incident/correction/recount/litigation records. Current advisory review rows are public-interest screening inputs only, not findings.

## New York Wave 8 Update

- Config: `etl/state-configs/ny.json`
- Authority: New York State Board of Elections; New York county boards of elections; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/ny-2024-general-president.csv`, extracted from official NYSBOE archive document 476 and retained with `data/ny-2024-presidential-general.pdf`
- County comparison source: `data/ny-2024-general-senate.csv`, extracted from the same official archive PDF
- Local review source: `data/ny-2024-local-review.csv` and `data/ny-2024-local-review-sources.json`, generated by `scripts/normalize-ny-local-review.mjs` from machine-readable OpenElections county-board sources, selected reviewed text-layer PDFs, Suffolk text rows, and legacy NYC rows; the manifest records loaded, zero-row, and excluded source-file statuses for unnormalized county files
- Turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ny-2024-eac-turnout.csv`; NYSBOE county and election-district enrollment pages are documented denominator leads but are not ballots-cast replacements by themselves
- Historical baseline source: `data/ny-historical-presidential-baseline.csv`, generated by `scripts/collect-ny-historical-baseline.mjs` from official NYSBOE 2012, 2016, and 2020 general-election PDFs
- County boundary: `data/ny-counties.geojson`
- Coverage/admin inventory: `data/ny-2024-data-coverage-inventory.json`
- Equipment context: `data/ny-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 62 county result rows, 62 county geometry features, 9,753 supplemental local review rows, 62 EAC fallback turnout rows, and 186 official county historical baseline rows. Remaining risks: Herkimer, Jefferson, Monroe, Nassau, Ontario, Orange, Orleans, Oswego, Rockland, Schuyler, Steuben, Wyoming, and Yates remain outside normalized local review coverage; Monroe appears in the local-review manifest with zero parsed rows. County-certified NYSBOE rows remain the map authority. Remaining source needs are official full-state election-district President and U.S. Senate rows, state-native ballots-cast/voter-history rows paired with enrollment denominators, precinct/election-district geometry or crosswalks, and normalized audit/CVR/incident/correction/recount/litigation records. Current advisory rows are public-interest screening inputs only, not findings.

## New York Wave 13 Check

Wave 13 keeps NY in `sourceDiscoveryQueue` rather than `completedNativeStates`. The native staging artifact validates and produces 9,753 supplemental local review rows, but the coverage remains partial: 49 county equivalents are covered and 13 remain excluded or not yet reviewed, active turnout is still EAC fallback, and VEDA/Flateau is still a future official publication path rather than a 2024 replacement package. The completion decision is recorded in `data/ny-2024-data-coverage-inventory.json` and `data/native-import-source-packages.json`.


## New York Wave 19 Decision

Wave 19 keeps NY in `sourceDiscoveryQueue` rather than `completedNativeStates`. The state has official NYSBOE county President and U.S. Senate rows, official 2012/2016/2020 county historical baselines, county geometry, EAC fallback turnout, and 9,753 supplemental local review rows. The completion blocker remains coverage scope: Herkimer, Jefferson, Monroe, Nassau, Ontario, Orange, Orleans, Oswego, Rockland, Schuyler, Steuben, Wyoming, and Yates are still outside normalized local review coverage; active turnout is still EAC fallback; and precinct/election-district geometry plus audit/CVR/incident/correction/recount/litigation rows are not loaded. Wave 19 added `data/ny-2024-source-request-matrix.tsv` as the current official-source request queue for the missing local review, turnout/voter-history, geometry/crosswalk, and administration-context artifacts. Current advisory rows are public-interest source-review inputs only, not findings.

## California Wave 11 Update

- Config: etl/state-configs/ca.json
- Authority: California Secretary of State; U.S. Census Bureau; Verified Voting equipment context
- County results source: data/ca-2024-general-president.csv, normalized from the official SOS Statement of Vote President by County XLSX
- Local review source: data/ca-2024-general-us-senate-full-term.csv
- Comparison contest: U.S. Senate full term, county rows only
- Turnout source: data/ca-2024-voter-participation-stats-by-county.csv, normalized from the official SOS voter participation statistics PDF
- Turnout denominator: 15-day Report of Registration registered voters; expected 58 rows, 16,140,044 total voters, and 22,595,659 registered voters
- Historical baseline source: data/ca-historical-presidential-baseline.csv, generated from official 2012, 2016, and 2020 SOS Statement of Vote President by County workbooks
- County boundary: data/ca-counties.geojson
- Coverage/admin inventory: data/ca-2024-data-coverage-inventory.json documents the loaded artifacts, official voting-systems-by-county lead, 1% manual audit source lead, recount/PRA paths, and remaining CVR/incident/correction/litigation gaps

Expected validation: 58 county result rows, 58 county geometry features, 58 county review rows, 58 county turnout rows, 174 historical baseline rows, 15,865,475 presidential votes, 9,276,179 Harris votes, 6,081,697 Trump votes, and 507,599 other presidential votes.

Caveats: review rows are county-level President-versus-U.S.-Senate full-term comparisons, not precinct or city/local scatter plots. The SOS turnout denominator is the 15-day Report of Registration and excludes later Same Day Voter Registration updates. County geometry is loaded; precinct geometry and normalized audit/CVR/incident/correction/recount/litigation rows are not loaded. Current advisory rows are public-interest screening inputs only, not findings.

## Oregon Wave 12 Update

- Config: `etl/state-configs/or.json`
- Authority: Oregon Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- County results source: `data/or-2024-general-president.csv`, normalized from the official Oregon Secretary of State 2024 November General Election Official Results PDF at `data/or-2024-general-official-results.pdf`
- Local review source: `data/or-2024-general-attorney-general.csv`, normalized from the same official abstract PDF
- Comparison contest: Attorney General, same county grain as President, with county-level directional-screening caveats
- Turnout source: EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/or-2024-eac-turnout.csv`; the official Oregon 2024 voter registration statistics PDF is documented as a state-native source lead but is not yet normalized or reconciled
- County boundary: `data/or-counties.geojson`
- Precinct source package: `data/or-2024-precinct-data/manifest.json`, collected from the official ORMS 2024 precinct-level result search; current review rows remain county-level because many county precinct artifacts are PDF/image-heavy and need county-specific extraction review or request-produced machine-readable files
- Coverage/admin inventory: `data/or-2024-data-coverage-inventory.json`
- Equipment context: `data/or-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 36 county result rows, 36 county geometry features, 2,244,493 presidential votes, 919,480 Trump votes, 1,240,600 Harris votes, 84,413 other presidential votes, 36 county review rows, and 36 EAC fallback turnout rows. Remaining gaps are normalized precinct President plus same-grain comparison rows, Oregon-native turnout denominators, precinct geometry/crosswalks, official 2012/2016/2020 historical baseline rows, and normalized audit/CVR/incident/correction/recount/litigation records. Current advisory rows are public-interest screening inputs only, not findings.

## Utah Wave 12 Update

- Config: `etl/state-configs/ut.json`
- Authority: Utah Lieutenant Governor Elections Office; U.S. Census Bureau; U.S. Election Assistance Commission
- County results source: `data/ut-2024-general-president.csv`, generated from the official electionresults.utah.gov U.S. President API artifact at `data/ut-2024-general-president-official-api.json`; the certified statewide canvass PDF remains retained at `data/ut-2024-general-election-statewide-canvass.pdf` as a cross-check
- Local review source: `data/ut-2024-general-attorney-general.csv`
- Comparison contest: Attorney General, county rows only
- Turnout source: `data/ut-2024-general-turnout.csv`, generated from the official aggregated county standardized canvass statistics workbook `data/ut-2024-master-aggregated-numbers-2023-2025.xlsx`
- Turnout denominator: Active voters; ballots-cast field is Total ballots counted
- County boundary: `data/ut-counties.geojson`
- Coverage inventory: `data/ut-2024-data-coverage-inventory.json`
- Recount context: `data/ut-2024-cd2-recount-report.pdf` retained as context only

Source-artifact validation: 29 county President rows, 29 county geometry features, 29 county Attorney General review rows, 29 county turnout rows, 87 secondary historical baseline rows, 883,818 Trump votes, 562,566 Harris votes, and 42,110 Other votes are documented in the Utah package. Active native staging imports Utah result, review, turnout, and historical rows through the generic countyPresidentCsv dispatcher. The official electionresults.utah.gov President API resolves the 1,488,494-vote statewide contest total at county grain, including qualified write-ins; the certified canvass PDF remains retained as a cross-check and Attorney General source. Remaining gaps are official 2012/2016/2020 historical baseline normalization, precinct/local reporting-unit rows, precinct geometry/crosswalks, and normalized audit/CVR/incident/correction/recount/litigation records.

## Louisiana Wave 12 Update

- Config: `etl/state-configs/la.json`
- Authority: Louisiana Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Parish results source: `data/la-2024-general-election-results`, parsed from official Louisiana SOS static precinct CSV rows
- Local review source: `data/la-2024-general-election-results`
- Comparison contest: U.S. House by district, matched at parish/ward/precinct/vote-mode keys where available
- Turnout source: EAC 2024 parish/jurisdiction fallback rows at `data/eac-2024-state-turnout/la-2024-eac-turnout.csv`
- Parish boundary: `data/la-counties.geojson`
- Coverage/admin inventory: `data/la-2024-data-coverage-inventory.json`
- Equipment context: `data/la-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 64 parish result rows, 64 parish geometry features, 3,885 precinct/vote-mode review rows, 64 EAC fallback turnout rows, 2,006,975 presidential votes, 1,208,505 Trump votes, 766,870 Harris votes, and 31,600 other presidential votes.

Caveats: Louisiana uses parishes rather than counties, and current map joins are parish-level. U.S. House is district-based and candidate-specific, so review rows are advisory source-review context rather than same-office statewide comparison rows. State-native turnout, precinct boundary geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized official audit/CVR/incident/correction/recount/litigation rows remain source-collection gaps. Current advisory rows are public-interest screening inputs only, not findings.

## Alabama Wave 17 Native ETL Activation

- Config: `etl/state-configs/al.json`
- Authority: Alabama Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau
- County result source: official Alabama SOS 2024 General Precinct Level Results ZIP at `data/al-2024-general-precinct-level-results.zip`, normalized by `scripts/normalize-al-sos-results.mjs` into `data/al-2024-general-president.csv`
- Local review source: `data/al-2024-local-review.csv`, generated from the same SOS ZIP
- Comparison contest: U.S. House by district, because Alabama had no 2024 U.S. Senate race; review rows are paired at county XLS precinct/reporting-mode column grain only where House cells have explicit nonzero coverage
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/al-2024-eac-turnout.csv`
- Turnout leads: `data/al-2024-general-total-ballots-cast.pdf`, `data/al-2024-registered-voters.xlsx`, `data/al-comprehensive-voter-turnout-1986-2024.pdf`, and generated lead `data/al-2024-turnout-denominator-lead.csv`
- Historical baseline source: official SOS 2012 county presidential workbook plus 2016/2020 precinct ZIPs normalized into `data/al-historical-presidential-baseline.csv`
- County boundary: `data/al-counties.geojson`
- Equipment context: `data/al-2024-equipment-context.csv` from Verified Voting, context only
- Coverage inventory: `data/al-2024-data-coverage-inventory.json`
- Request matrix: `data/al-2024-source-request-matrix.tsv`

Expected validation: 67 county result rows, 67 county geometry features, 2,265,090 presidential votes, 1,462,616 Trump votes, 772,412 Harris votes, 30,062 other votes, 2,083 local President-versus-U.S.-House review rows, 67 EAC fallback turnout rows, and 201 official historical baseline rows.

Caveats: U.S. House is district-based and should be treated as directional public-interest review context, not a candidate-benefit finding. Active turnout remains EAC fallback because the generated precinct-ZIP ballots-cast lead totals 2,272,731, which is 180 lower than the active EAC/SOS fallback ballots-cast total of 2,272,911, and ALVR active-voter denominator timing needs review. County geometry is loaded, but precinct geometry/crosswalks are not. No normalized audit, CVR availability, recount, incident, correction, or litigation rows are loaded.
## Delaware Wave 14 Check

Delaware remains in source discovery rather than `completedNativeStates`. The active native config is still turnout-only EAC fallback: 3 jurisdiction rows, 514,367 ballots cast, 788,441 registered voters, and zero result/review rows. Wave 14 added `data/de-2024-data-coverage-inventory.json` and `data/de-2024-source-request-matrix.tsv` to document official Delaware Department of Elections source leads: the 2024 General Election Results Report, Full Report Power BI page, official write-in PDF, the DOE AGP registered/voted report, November 1 registration CSV, FirstMap election-district geometry lead, historical archive paths for 2020/2016/2012, FOIA request path, and equipment context.

No native result or advisory review parser is loaded. The 2024 report is official, but scripted inspection did not confirm a stable raw text/CSV result endpoint; older-style 2024 raw path guesses returned 404. The DOE AGP turnout report is script-readable and reports 788,864 registered voters and 518,086 voted statewide, versus active EAC fallback 788,441 registered voters and 514,367 ballots cast, so it needs a parser and reconciliation review before replacing EAC fallback. Remaining source needs are official machine-readable President plus same-grain U.S. Senate rows, election-district geometry/crosswalks, official historical baselines, and normalized audit/CVR/recount/incident/correction/litigation records. Advisory rows are source-review context only, not findings of fraud or misconduct.

## Connecticut Wave 17 Native Activation

- Config: `etl/state-configs/ct.json`
- Authority: Connecticut Secretary of the State; U.S. Election Assistance Commission; U.S. Census Bureau; UConn VoTeR audit reports; Verified Voting equipment context
- Current active package: official EMS election 91/version 80741 static JSON at `data/ct-2024-ems-election-91-version-80741`, with 169 town President result rows, 169 same-grain U.S. Senate review rows, and 169 warning-required EMS town turnout rows
- President source: CT EMS `townVotes_Electiondata.json` office 16518, with 992,053 Harris votes, 736,918 Trump votes, 30,039 other votes, and 1,759,010 total EMS presidential votes
- Comparison source: CT EMS `townVotes_Electiondata.json` office 16524 U.S. Senator, with Christopher S. Murphy Democratic plus Working Families lines fused by person for 1,000,695 Democratic comparison votes, Matthew M. Corey Republican line at 678,256 comparison votes, and 29,308 other votes
- Turnout source: CT EMS `voterTurnout_Electiondata.json`, with EMS EV registered/elector denominator total 2,348,545 and VV voters-checked total 1,788,981; all turnout rows are warning-required pending EMS/SOV/EAC semantics review
- Certified cross-check source: 2024 Statement of Vote PDF at `data/ct-2024-statement-of-vote.pdf`; reconcile the known EMS-versus-SOV presidential total discrepancy before production promotion or certified-total language
- Geometry: Census TIGERweb county-subdivision layer 22 is collected at `data/ct-town-mcds.geojson`; raw response has 174 features, so filter five COUSUB=00000 placeholders and QA EMS town-name joins before map promotion
- Administration context: `data/ct-2024-equipment-context.csv` remains supplemental Verified Voting context only; UConn VoTeR post-election audit, CVR availability, recount, incident, correction, and litigation rows are not normalized

CT is now listed in `completedNativeStates` for native staging coverage, with caveats. The source inventory and request matrix are `data/ct-2024-data-coverage-inventory.json` and `data/ct-2024-source-request-matrix.tsv`. Current CT advisory output is town-level public-interest screening context only; it is not precinct/ward evidence and is not evidence of fraud or misconduct.
## Hawaii Wave 19 Native Activation

- Config: `etl/state-configs/hi.json`
- Authority: Hawaii Office of Elections; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Result/review parser: `nativeHawaiiOfficeText` in `civic_etl/native.py`
- Official result sources: `data/hi-2024-general-summary.txt` and `data/hi-2024-general-precinct-detail.txt`, downloaded from Hawaii Office of Elections certified 2024 General Election text exports
- County result rows: 4 county rows aggregated from official numbered precinct/split rows, totaling 516,701 presidential votes: 313,044 Harris, 193,661 Trump, and 9,996 Other. Kalawao has county geometry and EAC turnout context but no separate Hawaii Office result county row.
- Local review rows: 467 nonzero numbered precinct/split President-versus-U.S.-Senate rows. The parser excludes 27 zero-vote numbered President keys and three zero-vote non-geographic President keys (`PRES`, `OS I`, `OS II`); retained review rows still aggregate to the certified statewide presidential total.
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/hi-2024-eac-turnout.csv`; the Hawaii Office of Elections registration and turnout statistics page is documented as a state-native replacement lead pending county registered-voter distribution and Kalawao reconciliation.
- County boundary: `data/hi-counties.geojson`; precinct geometry/crosswalks are not loaded.
- Coverage inventory: `data/hi-2024-data-coverage-inventory.json`
- Source request matrix: `data/hi-2024-source-request-matrix.tsv`
- Equipment context: `data/hi-2024-equipment-context.csv` from Verified Voting, context only

HI is now listed in `completedNativeStates` for native staging coverage with caveats. Remaining work is turnout-page normalization and reconciliation, precinct geometry/crosswalk collection, official 2012/2016/2020 historical baselines, and normalized audit/recount/CVR/incident/correction/litigation rows. Current advisory review rows are source-review signals only, not findings of fraud or misconduct.
## North Dakota Wave 18 Native Activation

- Config: `etl/state-configs/nd.json`
- Current active package: official North Dakota SOS ResultsAjax county President rows, same-key county-scoped precinct President-versus-U.S.-Senate review rows, EAC fallback turnout rows, and county geometry
- Collector: `scripts/collect-nd-sos-results.mjs`
- County result source: `data/nd-2024-sos-president-county.csv`, generated from the official SOS ResultsAjax President race ID 19893 endpoint
- Local review source: `data/nd-2024-sos-president-senate-precinct-review.csv`, generated from official President race ID 19893 and U.S. Senate race ID 19847 county-scoped precinct endpoints
- Manifest/reconciliation: `data/nd-2024-sos-results-manifest.json` records endpoints, row counts, official totals, and two zero-vote precinct keys excluded from review rows
- Turnout source: active ETL remains EAC 2024 fallback at `data/eac-2024-state-turnout/nd-2024-eac-turnout.csv`; the official SOS eligible-voter lead still needs normalization and reconciliation
- County boundary: `data/nd-counties.geojson`
- Coverage inventory: `data/nd-2024-data-coverage-inventory.json`; source request matrix: `data/nd-2024-source-request-matrix.tsv`

Expected validation: 53 county result rows, 53 county geometry features, 368,155 presidential votes, 246,505 Trump votes, 112,327 Harris votes, 9,323 Other votes, 383 same-key precinct review rows, and 53 EAC fallback turnout rows. The U.S. Senate comparison totals reconcile to 364,327 votes: 241,569 Republican, 121,602 Democratic-NPL, and 1,156 write-in votes.

Caveats: review rows are advisory source-review inputs only, not findings. Two zero-vote precinct keys are excluded from review rows and documented in the manifest. North Dakota does not require voter registration, so active turnout remains EAC fallback with zero registered voters until the SOS eligible-voter denominator lead of 371,975 voter turnout and 594,140 eligible voters is normalized and the one-ballot SOS/EAC turnout difference is reviewed. Precinct boundary geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized audit/CVR/recount/incident/correction/litigation rows remain missing.

## New Jersey Wave 18 Native Activation

- Config: `etl/state-configs/nj.json`
- Authority: New Jersey Department of State, Division of Elections; U.S. Election Assistance Commission; U.S. Census Bureau
- Current active package: official DOE statewide text-layer PDFs normalized into 21 county President result rows, 21 county President-versus-U.S.-Senate review rows, and 21 official DOE county turnout rows
- President source: `data/nj-2024-official-general-results-president.pdf`, normalized into `data/nj-2024-general-president-county.csv` by `scripts/normalize-nj-doe-pdfs.mjs`; totals reconcile to 2,220,713 Harris, 1,968,215 Trump, 83,797 Other, and 4,272,725 total votes
- Comparison source: `data/nj-2024-official-general-results-us-senate.pdf`, normalized into `data/nj-2024-general-senate-county.csv`; U.S. Senate totals reconcile to 2,161,491 Kim, 1,773,589 Bashaw, 96,715 Other, and 4,031,795 total votes
- Turnout source: `data/nj-2024-official-general-voter-turnout.pdf`, normalized into `data/nj-2024-official-turnout-county.csv`; `data/nj-2024-turnout-reconciliation-summary.json` records 4,321,921 DOE ballots cast, 6,682,699 DOE registered voters, a zero DOE-minus-EAC ballots-cast delta, and a 52,335 DOE-minus-EAC registered-voter delta
- County boundary: `data/nj-counties.geojson`; municipal geometry/crosswalks are not loaded
- Coverage inventory: `data/nj-2024-data-coverage-inventory.json`; source request matrix: `data/nj-2024-source-request-matrix.tsv`
- Equipment context: `data/nj-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 21 county result rows, 21 county geometry features, 4,272,725 presidential votes, 1,968,215 Trump votes, 2,220,713 Harris votes, 83,797 Other votes, 21 county U.S. Senate comparison review rows, and 21 official DOE turnout rows. Caveats: review rows are county-level public-interest source-review inputs, not municipal or precinct scatter plots and not findings of fraud or misconduct. Remaining gaps are the 21 county municipal President PDFs, 21 county municipal U.S. Senate PDFs, municipal turnout PDFs, municipal boundary geometry/crosswalks, official 2012/2016/2020 historical baselines, county audit PDF normalization, and CVR/recount/incident/correction/litigation records.

## New Mexico Wave 18 Native Activation

Wave 18 adds New Mexico to `completedNativeStates` for staging coverage with caveats. The active NM config now loads official New Mexico Secretary of State `GetMapDataArchive` JSON artifacts for 2024 President county results, 2024 President precinct review rows, 2024 U.S. Senate same-grain precinct comparison rows, and official 2020/2016 county historical baselines. Active turnout remains the EAC 2024 V2 jurisdiction fallback until the SOS eligible-voter denominator and the 367-ballot SOS-minus-EAC ballots-cast difference are reviewed.

Loaded staging output from `etl/state-configs/nm.json`:

- 33 county President result rows totaling 923,403 votes: Harris 478,802, Trump 423,391, Other 21,210
- 2,169 President precinct keys, with 2,165 nonzero President-versus-U.S. Senate review rows after four zero-vote precinct keys are skipped
- 33 EAC turnout fallback rows: 927,923 ballots cast and 1,415,984 registered voters
- 66 official SOS historical baseline rows for 2020 and 2016; 2012 remains blocked on the legacy election statistics hub/PDF path

The official SOS mapdata API masks many small candidate counts with `*`. The NM native parser infers those masked counts from SOS percentages and inferred reporting-unit totals, then de-duplicates repeated county/precinct/candidate rows. After inference and de-duplication, President and U.S. Senate precinct totals are each 7 votes below the corresponding county-level official totals; county certified rows remain authoritative. Current advisory rows are public-interest screening context only and are not evidence of fraud or misconduct. Remaining gaps are state-native turnout replacement, precinct geometry/crosswalk, 2012 historical baseline rows, normalized audit/CVR/recount/incident/correction/litigation records, and production display QA after any explicit promotion.
## Maine Wave 17 Native Activation

- Config: `etl/state-configs/me.json`
- Authority: Maine Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- County/non-geographic result source: `data/me-official-sources/me-2024-president-county-town-final-corrected-20241205.xlsx`, collected from the official Maine SOS corrected final President by County/Town workbook
- Local review source: `data/me-official-sources/me-2024-us-senator-county-town-final-corrected-20241205.xlsx`
- Comparison contest: U.S. Senate, same official county/town source family, with 509 same-grain town comparisons and 3 vote-share-only town rows where Senate grain differs
- Turnout source: EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/me-2024-eac-turnout.csv`; Maine SOS active/inactive registered-enrolled files are collected in `data/me-official-sources/` as denominator leads but are not turnout replacements
- Historical baseline source: official Maine SOS 2016 and 2020 President workbooks loaded for 34 county/non-geographic rows; official 2012 county and municipal XLS files are collected but blocked pending legacy `.xls` support or conversion
- County boundary: `data/me-counties.geojson`; State UOCAVA is non-geographic and is excluded from county map joins
- Coverage/admin inventory: `data/me-2024-data-coverage-inventory.json`

Expected validation: 17 certified result rows including State UOCAVA, 16 county geometry features, 831,375 candidate votes, 435,652 Harris votes, 377,977 Trump votes, 17,746 Other votes, 512 town review rows, 509 matched U.S. Senate comparison rows, 497 EAC fallback turnout rows, and 34 historical baseline rows. Remaining gaps are Maine-native ballots-cast or voter-participation rows, municipality/town geometry or a reporting-unit crosswalk, legacy `.xls` parsing/conversion for 2012 historical baselines, and normalized audit/CVR/recount/incident/correction/litigation records. Current advisory review rows are public-interest screening inputs only, not findings.

## Rhode Island Wave 17 Native Activation

- Config: `etl/state-configs/ri.json`
- Authority: Rhode Island Board of Elections; U.S. Election Assistance Commission
- Current active package: native President county-map rows aggregated from official city/town rows, explicit non-geographic federal/reconciliation rows, same-key President-versus-U.S.-Senate review rows, EAC fallback turnout, and partial official historical baselines
- Official result artifacts collected: `data/ri-2024-general-election-long-format.zip`, `data/ri-2024-general-election-short-format.zip`, `data/ri-2024-general-election-statewide.json`, and `data/ri-boe-results-data-description.pdf`
- Normalized artifacts: `data/ri-2024-general-president-city-town.csv`, `data/ri-2024-general-president-senate-review.csv`, and `data/ri-historical-presidential-baseline.csv`
- Parser path: `scripts/normalize-ri-boe-results.mjs` plus `nativeRhodeIslandBoeCsv`
- Comparison contest: U.S. Senate, paired at same BOE reporting-unit key where nonzero President rows exist
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback at `data/eac-2024-state-turnout/ri-2024-eac-turnout.csv`
- Historical baselines: official 2012 and 2016 RI.gov archive rows are loaded; 2020 artifacts are collected but blocked by an alternate vote-group layout that did not reconcile in this pass

Expected validation: 7 President result rows (five county-map rows plus Federal Precincts and a non-geographic reconciliation delta), 444 review rows, 39 EAC fallback turnout rows, 80 historical baseline rows, and posted statewide President totals of 513,386 votes: 285,156 Harris, 214,406 Trump, and 13,824 Other. The official long-format ZIP is 32 President votes and 29 U.S. Senate votes below the posted statewide JSON, so the normalized President package includes a non-geographic reconciliation delta and review rows exclude posted-total deltas, zero-vote Limited rows, and presidential-only rows.

Remaining gaps are state-native turnout/registration denominators, result-ready city/town or precinct geometry/crosswalks for finer overlays, decoded 2020 historical baseline rows, and normalized audit/CVR/recount/incident/correction/litigation records. Current advisory rows are source-review calculations only, not findings.

## Delaware Wave 17 Native Activation

- Config: `etl/state-configs/de.json`
- Authority: Delaware Department of Elections; U.S. Election Assistance Commission; U.S. Census Bureau
- County results source: `data/de-2024-general-election-results-report.html`, downloaded from the official DOE 2024 General Election Results Report; `data/de-2024-general-election-results-report.csv` is retained as an official statewide cross-check.
- Local review source: the same official DOE report HTML, using positive-vote election-district President rows paired with same-grain U.S. Senate rows.
- Comparison contest: U.S. Senate, same election-district grain for 529 positive-vote President districts. Four zero-vote President district tables are excluded from review rows.
- Turnout source: EAC 2024 county/jurisdiction fallback rows remain active at `data/eac-2024-state-turnout/de-2024-eac-turnout.csv`; `scripts/normalize-de-agp-turnout.mjs` generates `data/de-2024-agp-turnout-reconciliation.csv` and summary JSON from DOE AGP/registration leads for replacement review only.
- County boundary: `data/de-counties.geojson`.
- Coverage inventory: `data/de-2024-data-coverage-inventory.json`; source request matrix: `data/de-2024-source-request-matrix.tsv`.

Expected validation: 3 county result rows, 3 county geometry features, 511,697 presidential votes, 214,351 Trump votes, 289,758 Harris votes, 7,588 Other votes, 529 election-district review rows, and 3 EAC fallback turnout rows. Remaining gaps are active state-native turnout replacement semantics, FirstMap election-district geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized audit/recount/CVR/incident/correction/litigation records. Advisory rows are public-interest source-review inputs only, not findings.

### Vermont Wave 20 Source Discovery (2026-07-03)

VT remains in sourceDiscoveryQueue rather than completedNativeStates. The active config is still EAC turnout-only: 247 turnout rows, 0 result rows, and 0 review rows. Wave 20 identified official Vermont Secretary of State 2024 source paths: the certified canvass PDF, voter-turnout PDF, recount XLSX, official static election manifest, federal President/U.S. Senate JSON, turnout JSON, and election archive leads. The static election index marks the 2024 GENERAL ELECTION official, but the federal JSON uses 284 town/reporting-district rows and requires split-town/district grain modeling plus certified-canvass reconciliation before VT can emit native President results or President-vs-U.S.-Senate review rows. The source inventory and request queue are data/vt-2024-data-coverage-inventory.json and data/vt-2024-source-request-matrix.tsv. Current VT advisory output remains zero because there are no native review rows; this is a source-coverage and parser-readiness caveat only, not a finding.
## South Dakota Wave 20 Caveated Staging

- Config: `etl/state-configs/sd.json`
- Current status: caveated county-level staging rows added, but SD remains in `sourceDiscoveryQueue` rather than `completedNativeStates`
- Current President source: `data/sd-2024-general-president-county.csv`, generated by `scripts/collect-sd-2024-county-results.mjs` from the 2024 South Dakota presidential Wikipedia county table, which cites the South Dakota Secretary of State 2024 General Election Canvass and Certificate
- Current comparison source: `data/sd-2024-general-us-house-county.csv`, generated by the same script from the 2024 South Dakota U.S. House Wikipedia county table, also citing the SD SOS canvass
- Comparison contest: United States Representative, same county grain
- Turnout source: EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/sd-2024-eac-turnout.csv`
- Historical baseline source: secondary 2012/2016/2020 Wikipedia county tables at `data/sd-historical-presidential-baseline.csv`
- County boundary: `data/sd-counties.geojson`
- Coverage inventory: `data/sd-2024-data-coverage-inventory.json`; request matrix: `data/sd-2024-source-request-matrix.tsv`

Expected staging validation: 66 county result rows, 66 county review rows, 66 EAC fallback turnout rows, 198 contextual historical baseline rows, and 66 county geometry features. President totals reconcile to 428,922 votes: 272,081 Trump, 146,859 Harris, and 9,982 Other. U.S. House comparison totals reconcile to 421,448 votes: 303,630 Republican and 117,818 Democratic.

Caveats: the 2024 President and U.S. House rows are secondary staging rows, not retained official SOS artifacts. The official SD SOS 2024 General Election Canvass and Certificate PDF/static export or `electionresults.sd.gov` archive ElectionID/race IDs remain a P0 request item. Wave 21 confirmed the live results app currently defaults to the 2026 Primary Election, ResultsExport uses ASP.NET postbacks for current-election exports, the WSDL archive methods require an ElectionID, and a bounded GetCandidates probe for General ElectionID values 1-800 returned no 2024 federal candidate markers. Review rows are county-level President-versus-at-large-U.S.-House comparisons, not precinct scatter plots. EAC turnout remains active until state-native turnout/registration denominator rows are collected and reconciled. No normalized audit, CVR availability, recount, incident, correction, or litigation rows are loaded.
## Alaska Wave 20 Statewide Native Activation

- Config: `etl/state-configs/ak.json`
- Authority: Alaska Division of Elections; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Current active package: official statewide President row and statewide U.S. Representative first-choice comparison row parsed from `data/ak-2024-general-election-summary-report.pdf`, plus EAC fallback statewide turnout
- Normalizer: `scripts/normalize-ak-election-summary.mjs`
- President source: `data/ak-2024-general-president-statewide.csv`, generated from the official Alaska Election Summary Report with 338,177 presidential votes: 184,458 Trump, 140,026 Harris, and 13,693 Other
- Comparison source: `data/ak-2024-general-us-house-statewide.csv`, generated from official U.S. Representative first-choice totals; DEM comparison votes group Peltola and Hafner, REP comparison votes use Begich, and Other groups Howe plus write-in
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback at `data/eac-2024-state-turnout/ak-2024-eac-turnout.csv`; the official summary report Times Cast row matches the same statewide 340,981 ballots cast and 611,078 registered voters
- Geometry lead: `data/ak-house-districts.geojson` is present, but current AK result rows are statewide only and do not join House District geometry
- Coverage inventory: `data/ak-2024-data-coverage-inventory.json`; source request matrix: `data/ak-2024-source-request-matrix.tsv`
- Equipment context: `data/ak-2024-equipment-context.csv` from Verified Voting, context only

AK remains in `sourceDiscoveryQueue`, not `completedNativeStates`, because the current package is statewide-only. Remaining gaps are official House-district or precinct President plus same-grain U.S. House rows, lower-grain state-native turnout denominators, official 2012/2016/2020 historical baselines, and normalized audit/CVR/recount/incident/correction/litigation records. Advisory rows are public-interest source-review inputs only, not findings.
## Wyoming Wave 20 Native Coverage

Wyoming now has an official SOS native package for 2024 certified President county totals and precinct-by-precinct President vs U.S. Senate review rows. The parser reads `data/wy-2024-general-results.zip` directly and produces 23 county result rows, 431 nonzero precinct review rows, 23 EAC fallback turnout rows, and 69 county historical baseline rows from official 2012/2016/2020 SOS ZIPs.

Remaining Wyoming caveats: EAC fallback registered-voter denominator remains active; precinct boundary geometry is not loaded; audit, CVR, recount, incident, correction, and litigation context records remain request-tracked. Advisory indicators are screening signals only and are not evidence of fraud or misconduct.
## Tennessee Wave 20 Native Activation

- Config: `etl/state-configs/tn.json`
- Authority: Tennessee Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Current active package: official Tennessee SOS 2024 General Election PDF artifacts normalized into 95 county President rows and 1,859 nonzero precinct President-versus-U.S.-Senate review rows
- Collector/normalizer: `scripts/normalize-tn-sos-results.mjs`
- Official result sources: `data/tn-2024-general-by-county.pdf`, `data/tn-2024-general-by-office.pdf`, and `data/tn-2024-general-by-precinct.pdf`
- Normalized artifacts: `data/tn-2024-general-president-county.csv`, `data/tn-2024-general-president-senate-precinct-review.csv`, and `data/tn-2024-result-review-reconciliation-summary.json`
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback at `data/eac-2024-state-turnout/tn-2024-eac-turnout.csv`
- County boundary: `data/tn-counties.geojson`; precinct geometry/crosswalks are not loaded
- Coverage inventory: `data/tn-2024-data-coverage-inventory.json`
- Equipment context: `data/tn-2024-equipment-context.csv` from Verified Voting, context only

Expected validation: 95 county result rows, 95 county geometry features, 3,063,942 presidential votes, 1,966,865 Trump votes, 1,056,265 Harris votes, 40,812 Other votes, 1,859 precinct review rows, and 95 EAC fallback turnout rows. The official PDF source is text-layer PDF, not a structured export; the normalizer handles the PDF text placement of the seventh presidential candidate column and reconciles parsed precinct totals to official statewide President and U.S. Senate totals before writing CSV artifacts. Current advisory rows are public-interest screening inputs only, not findings.

Remaining gaps are Tennessee-native turnout/registration denominators, precinct boundary geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized audit/recount/CVR availability/incident/correction/litigation records.
