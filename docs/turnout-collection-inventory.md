# Turnout Collection Inventory

Generated from repo configs and current source-package pass on 2026-06-30.

This is an internal collection inventory. It is not rendered in the Civic Result Maps web app.

## Summary

- States checked: 50
- Turnout loaded in database or validated native staging: 16
- Loaded through official EAC fallback while state-native denominator remains missing: 4
- Need native turnout package or state-native replacement: 36

## Loaded Turnout

| State | DB rows | Level | Denominator | Local artifact |
| --- | ---: | --- | --- | --- |
| AZ Arizona | 15 | county | totalEligibleRegistration | `data/az-2024-general-canvass-president.csv` |
| CA California | 58 | county | 15-day Report of Registration registered voters | `data/ca-2024-voter-participation-stats-by-county.csv` |
| IN Indiana | 92 | county | registeredVoters | `data/in-2024-general-turnout.csv` |
| IA Iowa | 1,651 | precinct | registeredVoters | `data/ia-2024-county-detailxml-reports` |
| KS Kansas | 105 | jurisdiction | registeredVoters | `data/eac-2024-state-turnout/ks-2024-eac-turnout.csv` |
| MI Michigan | 83 | county | novemberActiveRegisteredVoters | `data/mi-2024-voter-turnout.txt` |
| MN Minnesota | 4,103 | precinct | registeredVotersPlusElectionDayRegistrations | `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx` |
| MO Missouri | 116 | jurisdiction | registeredVoters | `data/mo-2024-general-turnout.csv` |
| NH New Hampshire | 304 | town_ward | namesOnChecklist | `data/nh-2024-town-ward-president-governor.csv` |
| OH Ohio | 8,878 | precinct | registeredVoters | `data/oh-2024-statewide-races-precinct-level.xlsx` |
| PA Pennsylvania | 67 | county | registeredVoters | `data/pa-2024-voter-registration-vote-history-summary.xlsx` |
| UT Utah | 29 | county | activeVoters | `data/ut-2024-general-turnout.csv` |
| SC South Carolina | 46 | county | printedRegistrationListVoters | `data/sc-2024-vrems-turnout.csv` |
| VA Virginia | 2,669 | precinct | registeredVoters | `data/va-2024-enr-election-turnout.csv` |
| WI Wisconsin | 1,851 | local_jurisdiction | registeredVoters | `data/wi-2024-eac-turnout.csv` |
| WV West Virginia | 1,649 | precinct | registeredVoters | `data/wv-2024-county-detailxml-reports` |

## Loaded Fallback, State-Native Denominator Still Missing

| State | Current status | Needed |
| --- | --- | --- |
| AR Arkansas | Native TotalResults presidential and review ETL is loaded, and official EAC 2024 EAVS V2 jurisdiction turnout rows are configured as fallback context. | Official Arkansas turnout or voter-participation rows with registered-voter denominator timing at county, precinct, or TotalResults reporting-unit grain. |
| ID Idaho | Native county presidential and U.S. House review ETL is loaded from official Vote Idaho artifacts, and official EAC 2024 EAVS V2 jurisdiction turnout rows are configured as fallback context. | Official Idaho turnout or voter-participation rows with registered-voter denominator timing at county, precinct, or Vote Idaho reporting-unit grain. |
| KS Kansas | Native presidential and precinct review ETL is loaded from official Kansas Secretary of State workbooks, and official EAC 2024 EAVS V2 county/jurisdiction turnout rows are configured as fallback context. | Official Kansas ballots-cast or voter-participation rows with registered-voter denominator timing. Prefer precinct or county rows that can be reconciled to the SOS result workbooks; keep EAC fallback caveats visible until then. |
| MA Massachusetts | Native PD43+ President/Senate review ETL is loaded, and official EAC 2024 EAVS V2 jurisdiction turnout rows are configured and validated as fallback context. The official Massachusetts turnout statistics page confirms the same 2024 statewide registered-voter and total-votes-cast figures. | Official Massachusetts local turnout or voter-participation denominator rows at city/town, ward, precinct, or another documented reporting grain. |
| OK Oklahoma | Native Oklahoma result and precinct review ETL is loaded from official Oklahoma State Election Board race, county, and precinct CSV exports, and official EAC 2024 EAVS V2 jurisdiction turnout rows are configured as fallback context. | Official Oklahoma ballots-cast or voter-history rows with registered-voter denominator timing. Prefer county or precinct rows that can be reconciled to the official OK result exports; keep EAC fallback caveats visible until then. |
| WI Wisconsin | Native presidential and review ETL is loaded, and official EAC 2024 EAVS V2 local-jurisdiction turnout rows are configured and loaded as fallback context. | Official Wisconsin registered-voter denominator data. Prefer ward-level data that can join to the WEC ward workbook; county- or municipality-level is usable only with caveats. |

## States Needing Native Turnout Packages Or State-Native Replacements

These states still need a state-native turnout package or review of whether fallback turnout coverage is sufficient for the current caveats.

`AK`, `AL`, `AR`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `ID`, `IL`, `KS`, `KY`, `LA`, `MA`, `MD`, `ME`, `MS`, `MT`, `NC`, `ND`, `NE`, `NJ`, `NM`, `NV`, `NY`, `OK`, `OR`, `RI`, `SD`, `TN`, `TX`, `VT`, `WA`, `WY`

## Standard Request For Each Missing State

Ask the data team for:

- Official turnout or voter participation source URL.
- Local artifact committed to `data/`.
- Reporting level: precinct, ward, county, municipality, or other.
- Ballots-cast field or calculation.
- Registration, eligible-voter, or voter-file denominator field and timing.
- Expected row count.
- Expected statewide ballots-cast total if available.
- Parser hints: sheet/table name, header row, join keys, county field, precinct/ward field.
- Caveats: inactive-voter treatment, election-day registration, provisional/absentee handling, overseas/federal-only ballots, or reporting-unit mismatch.

## Pennsylvania Update

Pennsylvania keeps loaded county turnout rows from the official DOS vote-history and voter-registration summary workbook at `data/pa-2024-voter-registration-vote-history-summary.xlsx`: 67 county rows, 7,074,630 vote-history ballots cast, and 9,175,132 registered voters. This pass also collected official DOS precinct voter-registration rows at `data/pa-2024-general-voter-registration-precinct.txt`: 9,186 non-placeholder precinct rows across 67 counties and 9,175,133 registered voters, one voter higher than the county workbook total. The precinct file is a denominator lead only. It is not loaded as turnout because no same-grain precinct vote-history or ballots-cast source has been collected. See `data/pa-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.
## Mississippi Update

Mississippi currently uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ms-2024-eac-turnout.csv`, totaling 82 jurisdiction rows, 1,225,176 ballots cast, and 2,131,726 registered voters. This pass collected the official Mississippi SOS November 2024 Active Voter Count PDF at `data/ms-2024-november-active-voter-count.pdf` and normalized `data/ms-2024-november-active-voter-count.csv` with 82 county denominator-lead rows, 1,980,751 active voters, and a 2,238,135 CVAP estimate. The Mississippi SOS Active Voter Count Reports page (`https://www.sos.ms.gov/elections-voting/active-voter-count-reports`) is a state-native denominator lead because it publishes monthly county active-voter counts, but those reports are not a complete turnout replacement unless paired with official Mississippi ballots-cast or voter-participation rows and documented denominator timing. The exact follow-up ask is tracked in `data/ms-2024-source-request-matrix.tsv` as `ms-state-native-ballots-cast-turnout`.

## Nebraska Update

Nebraska now retains four turnout-relevant source paths: EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ne-2024-eac-turnout.csv`, the official Secretary of State 2024 General Canvass Book at `data/ne-2024-general-canvass-book.pdf`, the official post-general eligible-voter registration report at `data/ne-2024-post-general-eligible-voter-report.pdf`, and a generated canvass/EAC reconciliation at `data/ne-2024-canvass-voting-statistics-reconciliation.csv` with summary `data/ne-2024-canvass-voting-statistics-reconciliation-summary.json`. The current ETL still emits EAC fallback turnout rows: 93 rows, 965,145 ballots cast, and 1,263,487 registered voters. The canvass book's county voting-statistics section reports the same 1,263,487 registered voters and 965,236 total voting statewide; the generated reconciliation shows a 91-vote canvass-minus-EAC ballots/total-voting difference across 34 county rows and no registered-voter denominator difference. Keep EAC fallback active until the replacement semantics are reviewed. The public inventory and request paths are documented in `data/ne-2024-admin-source-inventory.json`.

## Missouri Update

Missouri now uses official Secretary of State 2024 General Election voter-turnout rows at `data/mo-2024-general-turnout.csv`, normalized from `data/mo-2024-general-turnout.pdf` by `scripts/normalize-mo-sos-pdfs.mjs`. The rows include 116 county/reporting-jurisdiction records, 2,995,376 actual voters, and 4,433,383 registered voters. Kansas City is a separate reporting jurisdiction in the SOS source, matching the Missouri result CSV caveat. Remaining turnout-adjacent subcounty work is tracked in `data/mo-2024-source-request-tracker.json`, because precinct-level results and geometry/crosswalk fields are still request or purchase items rather than loaded turnout inputs.


## North Carolina Update

North Carolina still uses EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/nc-2024-eac-turnout.csv` for the active turnout contract. A July 1, 2026 official-source pass confirmed two state-native leads: the NCSBE 2024 General Election Turnout page cites `history_stats_20241105.zip` for statewide voting-method totals, and the NCSBE Historical Registered Voter Stats table links the 2024 Nov. 5 registered-voter stats ZIP with county/precinct/demographic registration fields. These official artifacts should be collected and normalized together before replacing EAC fallback rows, because the current NCSBE turnout page is statewide summary text and the registered-voter stats file is a denominator source rather than a complete ballots-cast replacement by itself.
## Iowa Update

Iowa now uses state-native official precinct turnout rows from Iowa Secretary of State Clarity county detail XML reports at `data/ia-2024-county-detailxml-reports`. The parser reads each county `VoterTurnout` precinct `ballotsCast` and `totalVoters` field, with 1,651 turnout rows, 1,672,068 ballots cast, and 1,893,715 registered-voter denominator total. The same detail XML reports include President and U.S. House `VoteType` candidate splits such as Election Day and Absentee, but those fields are not yet normalized into the public vote-method API/UI contract. Wave 9 also documented official SOS county precinct shapefile ZIP leads and the 2024 General Election County Precinct Audits image source; both remain source leads rather than loaded turnout inputs. Remaining turnout-adjacent gaps are collected/crosswalked official precinct boundary geometry and a dedicated Iowa Clarity vote-method normalizer if method display rows are added.

## Arkansas Update

Arkansas currently uses official EAC 2024 V2 jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ar-2024-eac-turnout.csv`, totaling 73 jurisdiction rows, 1,122,278 ballots cast, and 1,750,202 registered voters in the AR config expectations. The Arkansas Secretary of State TotalResults election-info JSON includes a statewide turnout summary, but this pass did not collect a county, precinct, or reporting-unit turnout denominator artifact that can replace EAC fallback rows. Keep Arkansas in the native-turnout-needed path until an official Arkansas turnout or voter-participation artifact with denominator timing and join keys is collected and reconciled. See `data/ar-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## Colorado Update

Colorado currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/co-2024-eac-turnout.csv`, totaling 64 rows, 3,240,754 ballots cast, and 4,583,280 registered voters. Wave 18 committed the official Colorado Secretary of State Clarity 2024 General Election detail XML ZIP at `data/co-2024-clarity-detailxml.zip` for county result/review rows; its `ElectionVoterTurnout` rows remain a state-native turnout lead only. Those Clarity rows report 64 counties, 3,241,120 ballotsCast, and 4,058,938 totalVoters. Keep EAC fallback active until Colorado `totalVoters` denominator semantics and the 366-ballot Clarity-minus-EAC ballots-cast difference are reviewed. See `data/co-2024-data-coverage-inventory.json` and `data/co-2024-source-request-matrix.tsv` for the current source lead, caveats, and follow-up request fields.

## Idaho Update

Idaho currently uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/id-2024-eac-turnout.csv`, totaling 44 jurisdiction rows, 917,469 ballots cast, and 1,178,750 registered voters. The official Vote Idaho 2024 General Election turnout page is documented as a state-native source lead, but no Idaho-native local turnout denominator artifact has been normalized into the active turnout contract. Keep Idaho in the native-turnout-needed path until an official Idaho turnout or voter-participation artifact with denominator timing and join keys is collected and reconciled. See `data/id-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## Wisconsin-Specific Request

For Wisconsin, ask for:

- Official WEC or state source for registered-voter denominator data.
- Whether denominator is available at ward, municipality, county, or statewide level.
- Field names for registered voters and ballots cast.
- Join keys that match the WEC ward-by-ward workbook, if ward-level data exists.
- Expected row count and statewide denominator total.
- Caveats for same-day registration, inactive voters, absentee ballots, provisional ballots, and reporting-unit changes.

Current Wisconsin caveat: the WEC ward-by-ward federal/state results workbook does not include registered-voter denominator fields. The loaded EAC fallback uses A1a Total Reg and F1a Total Voters at EAC local-jurisdiction grain, totaling 1,851 rows, 3,933,068 registered voters, and 3,434,185 voters. It is official turnout context, but it is not same-grain WEC ward denominator data and is not used as an advisory flag input.

## West Virginia Update

West Virginia now has state-native precinct turnout rows configured from official Secretary of State county detail XML reports at `data/wv-2024-county-detailxml-reports`. The parser uses VoterTurnout precinct ballotsCast and totalVoters fields, with 1,649 turnout rows, 770,587 ballots cast, and 1,187,991 registered-voter denominator total. The remaining turnout-adjacent gap is official precinct boundary geometry for subcounty overlays, not turnout denominator provenance.

## South Carolina Update

South Carolina now has a state-native official turnout package at `data/sc-2024-vrems-turnout.csv`, generated by 
pm run etl:collect:sc:turnout` from SC VREMS 2024 General Election voter-history county statistics. The rows use `totalVoting` as participating voters and `totalRegistered` as printed registration-list voters. The SC VREMS source page states those registration counts include all active registered voters plus some inactive voters printed for the selected election, so the ETL marks all 46 rows warning-required. The source statewide summary includes an unassigned/null-county row with 2 registered voters and 1 participating voter; the normalized artifact keeps only the 46 county rows for map/API joins.

## Virginia Update

Virginia now retains official Department of Elections ENR precinct turnout rows at `data/va-2024-enr-election-turnout.csv`. The native ETL reads `TotalVoteTurnout` and `TotalRegisteredVoters` for 2,669 precinct rows. `TotalVoteTurnout` is election-level turnout across the ballot, not presidential contest votes, so presidential-result reconciliation should continue to use the certified contest rows.

## New Hampshire Update

New Hampshire now uses official Secretary of State town/ward ballots-cast and names-on-checklist workbooks normalized into `data/nh-2024-town-ward-president-governor.csv`. The detailed ballots-cast rows sum to 831,468 while the workbook county summary totals 831,467 after a source correction note; keep that caveat visible with the state-native turnout package.

## Indiana Update

Indiana now uses official Indiana Election Division county turnout and registration rows normalized from `data/in-2024-general-turnout-report.pdf` into `data/in-2024-general-turnout.csv` by `scripts/normalize-in-turnout.mjs`. The configured rows total 92 counties, 2,976,599 voters voting, and 4,837,802 registered voters. EAC 2024 V2 rows remain retained as benchmark context, but the active IN turnout config is now state-native county turnout. Remaining turnout-adjacent gaps are precinct-level turnout denominators and precinct boundary geometry if subcounty overlays or same-grain turnout screening are required.

## Nevada Update

Nevada still uses EAC 2024 V2 county/jurisdiction fallback turnout rows in `data/eac-2024-state-turnout/nv-2024-eac-turnout.csv`. A July 1, 2026 official-source pass found that the archived NVSOS statewide result page contains county result tables but no turnout/registration/export markers, while live NVSOS turnout and registration pages returned Incapsula challenge pages, empty content, or transport errors from scripted access. Keep Nevada in the native-turnout-needed list until a state-native county or precinct turnout denominator artifact is collected. Wave 24 generated `data/nv-2024-non-clark-county-request-packets.json` from the county request matrix so each remaining jurisdiction request now explicitly asks for ballots-cast, registered-voter denominator, denominator timing, and active/inactive-voter treatment fields.

## Georgia Update

Georgia still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ga-2024-eac-turnout.csv`, totaling 159 rows, 5,297,500 ballots cast, and 8,234,335 registered voters. The 2024 Georgia SOS media export is loaded for county results and precinct President-versus-U.S.-House review rows, and official 2012/2016/2020 SOS media exports are now normalized for county historical baselines, but no Georgia-native ballots-cast plus registered-voter denominator package was loaded in this pass. Keep Georgia in the native-turnout-needed list until a state or county denominator artifact is collected and reconciled.

## Kansas Update

Kansas currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ks-2024-eac-turnout.csv`, totaling 105 jurisdiction rows, 1,342,102 ballots cast, and 2,031,119 registered voters. Native Kansas result and review rows are loaded from official Kansas Secretary of State presidential and U.S. House precinct workbooks, but no Kansas-native turnout or voter-participation denominator artifact is loaded. Keep EAC fallback active until a Kansas SOS or county ballots-cast plus registered-voter source is collected and reconciled. See `data/ks-2024-data-coverage-inventory.json` for the current source and caveat record.

## Kentucky Update

Kentucky currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ky-2024-eac-turnout.csv`, totaling 120 rows, 2,086,090 ballots cast, and 3,548,136 registered voters. Wave 7 collected Kentucky State Board of Elections 2024 General turnout PDFs by county and precinct at `data/ky-2024-general-turnout-by-county.pdf` and `data/ky-2024-general-turnout-by-precinct.pdf`, plus 2024 General registration statistics denominator PDFs at `data/ky-2024-general-registration-by-county.pdf` and `data/ky-2024-general-registration-by-precinct.pdf`. Wave 9 added `scripts/reconcile-ky-turnout-registration.mjs`, `data/ky-2024-turnout-registration-reconciliation.csv`, and `data/ky-2024-turnout-registration-reconciliation-summary.json`: the county State Board PDFs parse to 120 rows, 2,086,320 voters, 3,548,136 registered voters, and 3,232 precinct-count total, producing a 230-voter State Board minus EAC ballots-cast delta across 85 county rows and no registered-voter denominator delta. The State Board turnout page says those turnout reports are unofficial and can differ from election results because they are run after voter-registration rolls reopen, so EAC fallback remains active until county-clerk official documentation and replacement semantics are reviewed. See `data/ky-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## New York Wave 8 Update

New York still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ny-2024-eac-turnout.csv`, totaling 62 rows, 8,389,626 ballots cast, and 13,579,416 registered voters. A July 1, 2026 official-source pass documented NYSBOE state-native denominator leads: the Enrollment by County page includes `Voters Registered by County as of 11/01/2024`, and the Enrollment by Election District page publishes county-by-county election-district enrollment reports. These are denominator leads only, not ballots-cast or voter-history turnout replacements. Keep NY in the native-turnout-needed path until a state-native ballots-cast/voter-history artifact is collected and reconciled with county or election-district enrollment denominators. See `data/ny-2024-data-coverage-inventory.json` for source URLs, request fields, and caveats.

## New York Wave 13 Check

The July 2, 2026 NY check did not identify a state-native ballots-cast or voter-history artifact that can replace EAC fallback turnout. The NYSBOE county enrollment report and election-district enrollment pages remain denominator leads only, and VEDA/Flateau still has no 2024 replacement data. Keep NY in the native-turnout-needed path.


## New York Wave 19 Turnout/Source Request Update

New York remains on official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ny-2024-eac-turnout.csv`: 62 rows, 8,389,626 ballots cast, and 13,579,416 registered voters. Wave 19 added `data/ny-2024-source-request-matrix.tsv` to keep the replacement condition explicit: collect a state-native ballots-cast or voter-history artifact, then reconcile it with NYSBOE county or election-district enrollment denominators before replacing EAC fallback. NYSBOE enrollment reports remain denominator leads only.

## California Update

California now uses official Secretary of State 2024 General Election voter participation rows at data/ca-2024-voter-participation-stats-by-county.csv, normalized from data/ca-2024-voter-participation-stats-by-county.pdf by scripts/normalize-ca-turnout.mjs. The rows include 58 counties, 16,140,044 total voters, and 22,595,659 registered voters. The registered-voter denominator is the SOS 15-day Report of Registration total, so it does not include voters who registered or updated registration through Same Day Voter Registration after the 15-day close. Current CA turnout is county-level and should stay caveated if future precinct/local review rows are added.

## Massachusetts Update

Massachusetts currently uses official EAC 2024 V2 jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ma-2024-eac-turnout.csv`, totaling 351 jurisdiction rows, 3,512,930 ballots cast, and 5,142,343 registered voters. Wave 11 confirmed the official Massachusetts Secretary turnout statistics page reports the same 2024 statewide registered-voter and total-votes-cast figures, so the statewide denominator is cross-checked. The state page is not a local turnout replacement because it does not provide the city/town, ward, or precinct rows needed to replace the active EAC fallback package. See `data/ma-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## Oregon Update

Oregon currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/or-2024-eac-turnout.csv`, totaling 36 jurisdiction rows, 2,269,608 ballots cast, and 3,060,374 registered voters. Wave 12 confirmed an official Oregon Secretary of State 2024 General Election voter registration and turnout statistics PDF lead at `https://records.sos.state.or.us/ORSOSCM/Recordhtml/13735459`, linked from the Oregon election history page. Keep EAC fallback active until that state-native PDF is collected, parsed, and reconciled against the loaded rows. See `data/or-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## Utah Update

Utah now uses official county standardized canvass turnout rows at `data/ut-2024-general-turnout.csv`, generated by `node scripts/normalize-ut-official-results.mjs` from sheet `G24` of the Utah aggregated county canvass statistics workbook at `data/ut-2024-master-aggregated-numbers-2023-2025.xlsx`. The rows include 29 counties, 1,529,139 total ballots counted, and 1,793,317 active voters. Total ballots counted is election-level turnout across the ballot, not presidential contest votes. EAC rows remain retained as a benchmark only. Remaining turnout-adjacent gaps are precinct/local denominators if subcounty result rows are later collected, plus official precinct geometry/crosswalks.

## Louisiana Update

Louisiana currently uses official EAC 2024 V2 parish/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/la-2024-eac-turnout.csv`, totaling 64 rows, 2,021,588 ballots cast, and 3,046,376 registered voters. Native Louisiana result and review rows are loaded from official Louisiana Secretary of State precinct CSV artifacts, but no Louisiana-native ballots-cast plus registered-voter denominator package was loaded in this pass. Keep EAC fallback active until a Secretary of State or parish denominator artifact is collected, normalized, and reconciled. See `data/la-2024-data-coverage-inventory.json` for the current source and caveat record.

## Alabama Update

Alabama now has official SOS 2024 result/review native ETL active, but turnout remains on official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/al-2024-eac-turnout.csv`, totaling 67 jurisdiction rows, 2,272,911 ballots cast, and 3,868,040 registered voters. This pass collected the Alabama SOS Total Ballots Cast PDF at `data/al-2024-general-total-ballots-cast.pdf`, the ALVR-2024 registration workbook at `data/al-2024-registered-voters.xlsx`, and the Comprehensive Voter Turnout PDF at `data/al-comprehensive-voter-turnout-1986-2024.pdf`. `scripts/normalize-al-sos-results.mjs` also writes `data/al-2024-turnout-denominator-lead.csv` with 67 county rows pairing 2,272,731 precinct-ZIP ballots cast with 3,880,115 November ALVR active voters. Keep EAC fallback active until the 180-ballot precinct-ZIP-versus-EAC/SOS ballots-cast difference and ALVR denominator timing are reviewed.
## Delaware Wave 14 Update

Delaware still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/de-2024-eac-turnout.csv`, totaling 3 jurisdiction rows, 514,367 ballots cast, and 788,441 registered voters. Wave 14 confirmed a state-native Delaware Department of Elections turnout lead at `https://elections.delaware.gov/voter/registrationtotals/reports/agprpt_2024.txt`: the 2024 age-group/party report includes election-district rows plus county/state summary rows and reports 788,864 registered voters and 518,086 voted statewide. The official November 1 party-registration CSV sums to 790,955 registered voters. Keep EAC fallback active until a DOE AGP parser and reconciliation report reviews denominator timing and voted-versus-ballots-cast semantics. Follow-up fields are tracked in `data/de-2024-source-request-matrix.tsv`.
## Connecticut Update

Connecticut now uses official Connecticut Secretary of the State EMS town turnout rows in native staging from `data/ct-2024-ems-election-91-version-80741/voterTurnout_Electiondata.json`, collected for election ID 91/version 80741. The parser emits 169 town rows with EMS EV registered/elector denominator total 2,348,545 and VV voters-checked total 1,788,981. All rows are warning-required until EMS EV/VV/ABR/ABC/EBR/EBC/EDR/EDC field semantics and Statement-of-Vote/EAC differences are reviewed. The former EAC fallback rows at `data/eac-2024-state-turnout/ct-2024-eac-turnout.csv` remain retained as an official benchmark, not the active CT staging turnout source.
## Hawaii Update

Hawaii now has native President county rows and same-grain precinct/split President-versus-U.S.-Senate review rows from official Hawaii Office of Elections text exports, but turnout still uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/hi-2024-eac-turnout.csv`: 5 jurisdiction rows, 522,236 ballots cast, and 861,333 registered voters, including a warning-required Kalawao placeholder row. The Hawaii Office Registration and Turnout Statistics page remains the state-native replacement lead: the 2024 General Election table reports 860,868 registered voters and 522,236 turnout statewide, plus county rows for Hawaii, Maui, Kauai, and Honolulu. Keep EAC fallback active until that table is normalized, county registered-voter distribution and Kalawao handling are reconciled, and denominator timing is documented. See `data/hi-2024-data-coverage-inventory.json` and `data/hi-2024-source-request-matrix.tsv` for source URLs, caveats, and parser fields.
## North Dakota Wave 18 Update

North Dakota now has official SOS President county rows and same-key county-scoped precinct President-versus-U.S.-Senate review rows loaded through `scripts/collect-nd-sos-results.mjs`, but active turnout still uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/nd-2024-eac-turnout.csv`: 53 rows, 371,974 ballots cast, and 0 registered voters. This zero denominator is expected source semantics because North Dakota does not require voter registration. The official SOS dashboard remains the state-native turnout lead, reporting 371,975 voter turnout, 594,140 eligible voters, 62.61% statewide turnout, and 385 of 385 precincts fully reported. Keep EAC fallback active until an SOS turnout/export normalizer captures eligible-voter fields, reconciles the one-ballot SOS-versus-EAC turnout difference, and updates public denominator labels away from registered-voter assumptions. See `data/nd-2024-data-coverage-inventory.json` and `data/nd-2024-source-request-matrix.tsv` for source URLs, caveats, and parser fields.

## New Jersey Wave 18 Update

New Jersey now uses official Department of State, Division of Elections county turnout rows normalized from `data/nj-2024-official-general-voter-turnout.pdf` into `data/nj-2024-official-turnout-county.csv` by `scripts/normalize-nj-doe-pdfs.mjs`. The rows include 21 counties, 4,321,921 ballots cast, 6,682,699 registered voters, 26,600 rejected ballots, and 6,402 election districts. The retained reconciliation summary at `data/nj-2024-turnout-reconciliation-summary.json` records that EAC fallback reports the same 4,321,921 ballots cast but 6,630,364 registered voters, a 52,335 registered-voter denominator difference. Remaining turnout-adjacent work is parsing the 21 county municipal registered-voters/ballots-cast PDFs and building municipal geometry/crosswalks if subcounty joins are pursued.

## New Mexico Wave 18 Update

New Mexico still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/nm-2024-eac-turnout.csv`, totaling 33 jurisdiction rows, 927,923 ballots cast, and 1,415,984 registered voters in the active NM config. Wave 18 activated official SOS 2024 President county results and President-versus-U.S. Senate precinct review rows, but did not replace turnout. The New Mexico Secretary of State 2024 General Election results system turnout page at `https://electionresults.sos.nm.gov/VoterTurnoutDetails.aspx?eid=2882` reports 928,290 ballots cast and 1,343,825 eligible voters, with precinct-level turnout detail. Keep EAC fallback active until eligible-voter denominator semantics and the 367-ballot SOS-minus-EAC ballots-cast difference are reviewed. Follow-up fields are tracked in `data/nm-2024-source-request-matrix.tsv`.
## Maine Wave 17 Turnout Update

- Active source: Maine remains on the EAC 2024 fallback turnout package in `etl/state-configs/me.json`, with 497 jurisdiction rows and the EAC caveat preserved.
- State-native lead collected: the Maine Secretary of State active and inactive registered/enrolled files for the November 5, 2024 General/Referendum Election are now retained at `data/me-official-sources/me-2024-registered-enrolled-active-20241105.txt` and `data/me-official-sources/me-2024-registered-enrolled-inactive-20241105.txt`.
- Replacement condition: these registered/enrolled files are denominator leads only. Do not replace EAC turnout until official Maine ballots-cast or voter-participation rows at compatible grain are collected, parsed, and reconciled against certified totals.
- Handoff: use `data/me-2024-data-coverage-inventory.json` and `data/me-2024-source-request-matrix.tsv` for caveats and remaining request fields.

## Rhode Island Wave 17 Update

Rhode Island now has native President and same-key U.S. Senate review rows from official BOE artifacts, but turnout still uses official EAC 2024 V2 city/town jurisdiction fallback rows at `data/eac-2024-state-turnout/ri-2024-eac-turnout.csv`, totaling 39 rows, 522,164 ballots cast, and 792,075 registered voters. The BOE result ZIP/JSON files are result sources, not a complete registered-voter denominator replacement. Keep EAC fallback active until a Rhode Island-native ballots-cast plus registered-voter denominator artifact is collected, parsed, and reconciled. Follow-up fields are tracked in `data/ri-2024-data-coverage-inventory.json` and `data/ri-2024-source-request-matrix.tsv`.

## Delaware Wave 17 Turnout Reconciliation

Delaware still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/de-2024-eac-turnout.csv`, totaling 3 jurisdiction rows, 514,367 ballots cast, and 788,441 registered voters. Wave 17 collected the official DOE AGP registered/voted report at `data/de-2024-agp-registered-voted-report.txt` and November 1 registration CSV at `data/de-2024-november-1-party-registration.csv`, then generated `data/de-2024-agp-turnout-reconciliation.csv` and summary JSON with `scripts/normalize-de-agp-turnout.mjs`. The reconciliation totals are 537 AGP election-district rows, 788,864 registered voters, and 518,086 voted statewide; the November 1 registration CSV sums to 790,955 registered voters. Keep EAC fallback active until AGP denominator timing and voted-versus-ballots-cast semantics are reviewed.

### Vermont Wave 21 Turnout Lead (2026-07-03)

Vermont now has native 2024 President county rows and town/reporting-district President-versus-U.S.-Senate review rows loaded from official SOS static JSON, but active turnout still uses official EAC 2024 V2 fallback rows in `etl/state-configs/vt.json`: 247 jurisdiction rows, 361,604 ballots cast, and 500,986 registered voters. The official SOS turnout JSON/PDF artifacts are retained at `data/vt-2024-official-sources/2024-general-turnout.json` and `data/vt-2024-official-sources/2024-general-voter-turnout.pdf`. The observed official JSON lead has 247 town rows, 517,051 registered voters, 372,885 voters cast, and 234,848 early/absentee ballots, while the certified canvass cover page reports 522,600 registered voters. Replacing the EAC fallback remains blocked on denominator-timing review and reconciliation; no production promotion was performed.
## South Dakota Wave 20 Update

South Dakota remains on official EAC 2024 V2 jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/sd-2024-eac-turnout.csv`: 66 rows, 435,739 ballots cast, and 690,306 registered voters. Wave 20 added caveated county-level 2024 President and at-large U.S. House staging rows generated by `scripts/collect-sd-2024-county-results.mjs` from secondary Wikipedia county tables that cite the South Dakota Secretary of State 2024 General Election Canvass and Certificate. Wave 23 retained official SD SOS archive/export evidence at `data/sd-2024-official-results-archive-evidence.json` and `data/sd-2024-general-statewide-results.xlsx`, generated by `scripts/collect-sd-official-archive-evidence.mjs`: ElectionID 684 returns 66 official county turnout rows with 436,478 `calcVoterTurnout` and 625,192 `Voters`, and the official ResultsExport statewide XLSX header reports the same turnout figures. That turnout archive/export is a state-native lead only; keep EAC fallback active until denominator timing and replacement semantics are reviewed. The same official app artifacts identify 2024 federal result data, but their President and U.S. House totals do not reconcile to the current certified-style staging totals, so the certified canvass/export request remains open in `data/sd-2024-source-request-matrix.tsv`.

## Alaska Wave 22 Update
Alaska still uses official EAC 2024 V2 statewide/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ak-2024-eac-turnout.csv`, totaling 1 row, 340,981 ballots cast, and 611,078 registered voters. Wave 22 located and retained the official Alaska Division of Elections `ENRbyPrecinct.csv` at `data/ak-2024-general-enr-by-precinct.csv` and generated 523 same-grain President-versus-U.S.-House review rows at `data/ak-2024-general-precinct-president-us-house-review.csv`. The ENR file includes `Reg_voters` and `total_ballots` fields, but active turnout remains EAC fallback until denominator timing, non-geographic reporting units, and statewide reconciliation semantics are reviewed. Follow-up fields are tracked in `data/ak-2024-data-coverage-inventory.json` and `data/ak-2024-source-request-matrix.tsv`.
## Wyoming Wave 20 Update

Wyoming now has official SOS 2024 certified results and precinct review rows loaded, and the SOS total-ballots-cast workbook cross-checks the EAC ballots-cast total at 271,123. The active turnout denominator remains the EAC fallback because a state-native registered-voter denominator artifact and denominator timing have not been collected.
## Tennessee Wave 20 Update

Tennessee now has official 2024 SOS President county rows and same-key precinct President-versus-U.S.-Senate review rows loaded through `scripts/normalize-tn-sos-results.mjs`, but active turnout still uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/tn-2024-eac-turnout.csv`: 95 rows, 3,090,161 ballots cast, and 4,825,601 registered voters. The official SOS result PDFs do not replace turnout because they are contest-result canvass reports, not registered-voter denominator artifacts. Keep EAC fallback active until a Tennessee-native ballots-cast or voter-participation artifact with registered-voter denominator timing is collected and reconciled. See `data/tn-2024-data-coverage-inventory.json` for source URLs, caveats, and parser fields.
