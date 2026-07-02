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

## Colorado Wave 14 Update

- Config: `etl/state-configs/co.json`
- Authority: Colorado Secretary of State; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Current active turnout source: EAC 2024 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/co-2024-eac-turnout.csv`
- Coverage inventory: `data/co-2024-data-coverage-inventory.json`
- Source request matrix: `data/co-2024-source-request-matrix.tsv`
- Official result lead: Colorado SOS Clarity 2024 General Election detail XML at `https://results.enr.clarityelections.com/CO/122598/367167/reports/detailxml.zip`
- Preferred county comparison lead: CU Regent at-large, because Colorado had no 2024 U.S. Senate race
- County boundary: `data/co-counties.geojson`
- Equipment context: `data/co-2024-equipment-context.csv` from Verified Voting, context only

Wave 14 confirmed that the official Clarity detail XML endpoint exposes 64 county Presidential Electors rows with 1,728,159 Harris votes, 1,377,441 Trump votes, 87,145 other votes, and 3,192,745 presidential votes total. The same XML exposes 64 county CU Regent at-large comparison rows and county turnout rows reporting 3,241,120 ballotsCast and 4,058,938 totalVoters. No native result/review parser is loaded in this pass, and the current CO config remains EAC turnout-only with 64 fallback turnout rows, 3,240,754 ballots cast, and 4,583,280 registered voters.

Remaining gaps are a Colorado Clarity parser and committed official result artifact or manifest, denominator review before replacing EAC turnout, official precinct/local result rows or CVR-derived aggregates for subcounty advisory coverage, precinct geometry/crosswalks, official 2012/2016/2020 historical baselines, and normalized risk-limiting audit, CVR availability, recount, correction, incident, litigation, custody, ballot-manifest, tabulator-log, and EMS-log records. Current source records are coverage and request provenance only, not advisory findings.

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

Caveat: precinct boundary GeoJSON is not included. County map joins are ready.

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
- Administration context: VSTOP post-election risk-limiting audit, Election Administrator Portal, and Recount Commission source paths are documented in `data/in-2024-data-coverage-inventory.json`, `data/admin-source-packages.json`, and the Wave 11 request matrix at `data/in-2024-source-request-matrix.tsv`; no normalized audit, CVR, incident, correction, recount, or litigation rows are loaded.

Expected validation remains: 92 county result rows, 92 county geometry features, 2,936,677 presidential votes, 5,253 supplemental local review rows, 92 turnout rows, and 276 official historical baseline rows for 2012/2016/2020. Advisory indicators are source/data reconciliation signals only; they are not claims of misconduct.


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

## Alabama Wave 14 Source-Coverage Update

- Config: `etl/state-configs/al.json`
- Current active package: turnout-only EAC fallback rows at `data/eac-2024-state-turnout/al-2024-eac-turnout.csv`
- Coverage inventory: `data/al-2024-data-coverage-inventory.json`
- Source request matrix: `data/al-2024-source-request-matrix.tsv`
- Official result lead: Alabama Secretary of State 2024 General Precinct Level Results ZIP, 67 county XLS files with contests in rows and precinct/absentee/provisional modes in columns
- Preferred comparison contest: U.S. House by district, because Alabama had no 2024 U.S. Senate race; split-district counties need district-aware blank-cell handling before review rows are loaded
- Turnout leads: Alabama SOS 2024 General Total Ballots Cast PDF, ALVR-2024 registration workbook, and Comprehensive Voter Turnout PDF; EAC fallback remains active until denominator timing and reconciliation are reviewed
- Historical leads: official Alabama SOS 2012, 2016, and 2020 precinct/archive artifacts are identified but not normalized
- Geometry/admin context: `data/al-counties.geojson` and `data/al-2024-equipment-context.csv` are present; precinct geometry/crosswalks, audit, CVR availability, recount, incident, correction, and litigation rows remain request/source-lead items

Do not add AL to `completedNativeStates` yet. Wave 14 temporarily inspected the official 2024 precinct ZIP and recorded a SHA-256 plus parser metrics in the inventory, but no official Alabama result or review rows are loaded. The next implementation step is to collect the ZIP into `data/`, write an Alabama SOS precinct XLS matrix parser, reconcile President totals to 2,265,090 votes, and pair U.S. House rows only where district coverage is explicit. Current advisory rows are absent for Alabama; future advisory rows must remain public-interest review signals only, not findings of fraud or misconduct.

## Delaware Wave 14 Check

Delaware remains in source discovery rather than `completedNativeStates`. The active native config is still turnout-only EAC fallback: 3 jurisdiction rows, 514,367 ballots cast, 788,441 registered voters, and zero result/review rows. Wave 14 added `data/de-2024-data-coverage-inventory.json` and `data/de-2024-source-request-matrix.tsv` to document official Delaware Department of Elections source leads: the 2024 General Election Results Report, Full Report Power BI page, official write-in PDF, the DOE AGP registered/voted report, November 1 registration CSV, FirstMap election-district geometry lead, historical archive paths for 2020/2016/2012, FOIA request path, and equipment context.

No native result or advisory review parser is loaded. The 2024 report is official, but scripted inspection did not confirm a stable raw text/CSV result endpoint; older-style 2024 raw path guesses returned 404. The DOE AGP turnout report is script-readable and reports 788,864 registered voters and 518,086 voted statewide, versus active EAC fallback 788,441 registered voters and 514,367 ballots cast, so it needs a parser and reconciliation review before replacing EAC fallback. Remaining source needs are official machine-readable President plus same-grain U.S. Senate rows, election-district geometry/crosswalks, official historical baselines, and normalized audit/CVR/recount/incident/correction/litigation records. Advisory rows are source-review context only, not findings of fraud or misconduct.

## Connecticut Wave 14 Source Discovery

- Config: `etl/state-configs/ct.json`
- Authority: Connecticut Secretary of the State; U.S. Election Assistance Commission; U.S. Census Bureau; UConn VoTeR audit reports; Verified Voting equipment context
- Current active package: turnout-only EAC fallback at `data/eac-2024-state-turnout/ct-2024-eac-turnout.csv`, with 169 turnout rows, 1,820,891 ballots cast, and 2,520,650 registered voters
- Official result lead: CT Elections Management System public reporting app, election ID 91/version 80741, with static JSON for 169 town President rows and 169 same-grain U.S. Senate comparison rows
- Official turnout lead: EMS `voterTurnout_Electiondata.json` and the 2024 Statement of Vote turnout/registration tables; EMS reports 2,348,545 registered voters, 1,788,981 voters checked, and 76.17% turnout, but this has not replaced EAC fallback
- Certified cross-check lead: 2024 Statement of Vote PDF from Connecticut SOTS; Wave 14 found a reconciliation blocker because EMS town/state presidential totals differ from the PDF text/county/congressional summaries reviewed in this pass
- Geometry: current repo has `data/ct-counties.geojson` only; CT reporting is town-centric, so Census TIGERweb town/MCD geometry and an EMS town crosswalk are needed before native map joins
- Administration context: `data/ct-2024-equipment-context.csv` is loaded from Verified Voting at historical county grain; UConn VoTeR 2024 post-election audit report is identified as a source lead, but audit/CVR/recount/incident/correction/litigation rows are not normalized

CT remains in `sourceDiscoveryQueue` and is not added to `completedNativeStates`. The source inventory and request matrix are `data/ct-2024-data-coverage-inventory.json` and `data/ct-2024-source-request-matrix.tsv`. Current CT advisory output should be read as fallback turnout coverage only until official EMS/SOV reconciliation, town geometry, and parser work are complete. This is source-coverage context only, not evidence of fraud or misconduct.

## Hawaii Wave 14 Source Discovery

- Config: `etl/state-configs/hi.json`
- Authority: Hawaii Office of Elections; U.S. Election Assistance Commission; U.S. Census Bureau; Verified Voting equipment context
- Official result leads collected: `data/hi-2024-general-summary.txt` and `data/hi-2024-general-precinct-detail.txt`, downloaded from Hawaii Office of Elections certified 2024 General Election text exports
- Preferred comparison contest: U.S. Senate, same precinct/split text export as President, with a quick-pass caveat that U.S. Senate rows cover 496 of 497 precinct/split IDs
- Turnout source: active ETL remains EAC 2024 jurisdiction fallback rows at `data/eac-2024-state-turnout/hi-2024-eac-turnout.csv`; the Hawaii Office of Elections registration and turnout statistics page is documented as a state-native replacement lead
- County boundary: `data/hi-counties.geojson`
- Coverage inventory: `data/hi-2024-data-coverage-inventory.json`
- Source request matrix: `data/hi-2024-source-request-matrix.tsv`
- Equipment context: `data/hi-2024-equipment-context.csv` from Verified Voting, context only

HI remains in `sourceDiscoveryQueue` and is not added to `completedNativeStates`. Remaining work is a Hawaii text parser for summary/precinct detail files, turnout-page normalization and reconciliation, precinct geometry/crosswalk collection, official 2012/2016/2020 historical baselines, and normalized audit/recount/CVR/incident/correction/litigation rows. Current HI advisory indicators are not calculated from review rows because no HI review rows are loaded.

## North Dakota Wave 15 Source Discovery

- Config: `etl/state-configs/nd.json`
- Current active package: turnout-only EAC fallback rows at `data/eac-2024-state-turnout/nd-2024-eac-turnout.csv`
- Coverage inventory: `data/nd-2024-data-coverage-inventory.json`
- Source request matrix: `data/nd-2024-source-request-matrix.tsv`
- Official result lead: North Dakota Secretary of State 2024 General Election dashboard and CSV/Excel/XML export form at `https://results.sos.nd.gov/ResultsExport.aspx`
- Preferred comparison contest: U.S. Senate if exported at the same grain as President; U.S. House or Governor are fallback statewide contests with caveats
- Turnout lead: official SOS dashboard reports 371,975 voter turnout and 594,140 eligible voters; active EAC fallback remains 53 rows, 371,974 ballots cast, and 0 registered voters because ND has no voter registration
- Historical leads: official SOS 2020 dashboard/PDF plus 2016 and 2012 dashboard/PDF archive links are identified but not normalized
- Geometry/admin context: county geometry lead is Census TIGERweb; official precinct polling-place/crosswalk source, post-election audit report, recount page, county auditor request paths, CVR availability, incident/correction/litigation rows, and official equipment context remain source/request items

ND remains in `sourceDiscoveryQueue` and is not added to `completedNativeStates`. No native result or advisory review rows are loaded. Current ND advisory indicators should remain zero until official President plus same-grain comparison rows are collected, parsed, and reviewed. This is source-coverage context only, not evidence of fraud or misconduct.

## New Jersey Wave 15 Source Discovery

- Config: etl/state-configs/nj.json
- Current active package: turnout-only EAC fallback rows at data/eac-2024-state-turnout/nj-2024-eac-turnout.csv
- Coverage inventory: data/nj-2024-data-coverage-inventory.json
- Source request matrix: data/nj-2024-source-request-matrix.tsv
- Official result lead: New Jersey Department of State 2024 Election Information page with statewide certified President PDF and 21 county municipal President PDFs
- Preferred comparison contest: U.S. Senate from the same official county municipal PDF pattern
- Turnout leads: official statewide 2024 voter-turnout PDF plus 21 county municipal registered-voters/ballots-cast PDFs; EAC fallback remains active until denominator timing and the 52,335 registered-voter difference are reconciled
- Geometry/admin context: data/nj-counties.geojson and data/nj-2024-equipment-context.csv are present; municipal geometry/crosswalks, audit PDFs, CVR availability, recount, incident, correction, and litigation rows remain source/request items

NJ remains in sourceDiscoveryQueue and is not added to completedNativeStates. Remaining work is collecting the official PDF package, implementing a New Jersey DOE text-PDF parser, reconciling statewide President/Senate/turnout totals, normalizing municipality names and non-geographic rows such as Federal Overseas and Hand Counts, adding municipal geometry/crosswalks, collecting official 2012/2016/2020 historical baselines, and normalizing audit/CVR/recount/incident/correction/litigation records. Current NJ advisory indicators are not calculated from review rows because no NJ result or review rows are loaded.

## New Mexico Wave 15 Source Discovery

- Config: `etl/state-configs/nm.json`
- Current active package: turnout-only EAC fallback rows at `data/eac-2024-state-turnout/nm-2024-eac-turnout.csv`
- Coverage inventory: `data/nm-2024-data-coverage-inventory.json`
- Source request matrix: `data/nm-2024-source-request-matrix.tsv`
- Official result lead: New Mexico Secretary of State 2024 General Election Official Results dashboard and Media/Results CSV exports for election 2882
- Preferred comparison contest: U.S. Senate, from the same official SOS results system after confirming same-grain CSV precinct keys
- Turnout lead: SOS voter-turnout details report precinct ballots cast and eligible voters; EAC fallback remains active until denominator semantics and a 367-ballot SOS-versus-EAC difference are reviewed
- Geometry/admin context: `data/nm-counties.geojson` and `data/nm-2024-equipment-context.csv` are present; SOS/RGIS precinct geometry, historical archives, risk-limiting audit, CVR availability, incident, correction, recount, litigation, custody, and tabulator-log artifacts remain source leads or request paths

NM remains in `sourceDiscoveryQueue` and is not added to `completedNativeStates`. No native New Mexico result or advisory review parser is loaded in this pass; current advisory indicators are not calculated from review rows because no NM review rows are loaded. This is source-coverage context only, not evidence of fraud or misconduct.

## Maine Wave 15 Source Discovery

- Active config: `etl/state-configs/me.json` remains EAC turnout-only, with 497 fallback jurisdiction turnout rows and no native certified result or advisory review rows loaded.
- Repo drift: `docs/developer/index.md` is missing in this worktree as of the July 2, 2026 first-read check.
- Official 2024 result leads: the Maine Secretary of State 2024 results page links machine-readable Excel workbooks for U.S. President by County/Town, U.S. President by Congressional District, United States Senator, and congressional contests. The preferred same-grain comparison lead is the U.S. Senate workbook after President and Senate rows are collected and reconciled.
- RCV/CVR lead: Representative to Congress District 2 has an official certified RCV summary PDF, first-choice workbook, and official Excel cast-vote-record/export files. These are contest-specific auditability/context sources, not a statewide President-versus-Senate substitute.
- Turnout denominator lead: Maine SOS previous enrollment files for the November 5, 2024 General/Referendum Election provide active/inactive registered and enrolled voter denominator leads. They should not replace EAC turnout until official ballots-cast or voter-participation rows at compatible grain are collected and reconciled.
- Geometry/admin context: county geometry and Verified Voting equipment context are present. Municipality/town geometry or a reporting-unit crosswalk, plus normalized audit/recount/CVR availability/incident/correction/litigation rows, remain source-discovery work.
- Historical leads: official Maine SOS archive pages expose 2020, 2016, and 2012 presidential workbooks, with 2012 also providing municipal/county U.S. Senate workbook leads.
- Current queue decision: ME stays in `sourceDiscoveryQueue` and out of `completedNativeStates` until the official workbooks are collected, parsed, reconciled, and review rows can be generated. The current advisory indicator calculation is expected to produce zero ME indicators because no ME review rows or same-grain comparison rows are loaded.

Current handoff artifacts: `data/me-2024-data-coverage-inventory.json` and `data/me-2024-source-request-matrix.tsv`.

## Rhode Island Wave 15 Source Discovery

- Config: `etl/state-configs/ri.json`
- Current active package: turnout-only EAC fallback rows at `data/eac-2024-state-turnout/ri-2024-eac-turnout.csv`
- Coverage inventory: `data/ri-2024-data-coverage-inventory.json`
- Source request matrix: `data/ri-2024-source-request-matrix.tsv`
- Official result lead: Rhode Island Board of Elections RI.gov 2024 General Election data page, including short-format ZIP, long-format ZIP, statewide JSON, and 39 city/town JSON files
- Preferred comparison contest: U.S. Senate, because it is a statewide contest in the same BOE source family as President
- Turnout status: EAC fallback remains active until Rhode Island-native ballots-cast and registered-voter denominator fields are confirmed, parsed, and reconciled
- Geometry/admin context: county equipment context is present from Verified Voting; result-ready city/town or precinct/district geometry, audit, CVR availability, recount, incident, correction, and litigation rows remain source/request items

RI remains in `sourceDiscoveryQueue` and is not added to `completedNativeStates`. The official result source path is machine-readable and parser-ready, but no official Rhode Island result or advisory review rows are loaded in this pass. Remaining work is collecting the official BOE ZIP/JSON artifacts into `data/`, implementing a BOE parser, reconciling posted totals of 513,386 President votes and 491,948 U.S. Senate votes, collecting state-native turnout denominators, geometry/crosswalks, historical baselines for 2020/2016/2012, and normalized audit/CVR/recount/incident/correction/litigation records. Current advisory rows are absent for Rhode Island; future rows must remain public-interest review signals only, not findings of fraud or misconduct.
