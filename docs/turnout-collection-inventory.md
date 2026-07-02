# Turnout Collection Inventory

Generated from repo configs and current source-package pass on 2026-06-30.

This is an internal collection inventory. It is not rendered in the Civic Result Maps web app.

## Summary

- States checked: 50
- Turnout loaded in database or validated native staging: 15
- Loaded through official EAC fallback while state-native denominator remains missing: 3
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
| SC South Carolina | 46 | county | printedRegistrationListVoters | `data/sc-2024-vrems-turnout.csv` |
| VA Virginia | 2,669 | precinct | registeredVoters | `data/va-2024-enr-election-turnout.csv` |
| WI Wisconsin | 1,851 | local_jurisdiction | registeredVoters | `data/wi-2024-eac-turnout.csv` |
| WV West Virginia | 1,649 | precinct | registeredVoters | `data/wv-2024-county-detailxml-reports` |

## Loaded Fallback, State-Native Denominator Still Missing

| State | Current status | Needed |
| --- | --- | --- |
| AR Arkansas | Native TotalResults presidential and review ETL is loaded, and official EAC 2024 EAVS V2 jurisdiction turnout rows are configured as fallback context. | Official Arkansas turnout or voter-participation rows with registered-voter denominator timing at county, precinct, or TotalResults reporting-unit grain. |
| KS Kansas | Native presidential and precinct review ETL is loaded from official Kansas Secretary of State workbooks, and official EAC 2024 EAVS V2 county/jurisdiction turnout rows are configured as fallback context. | Official Kansas ballots-cast or voter-participation rows with registered-voter denominator timing. Prefer precinct or county rows that can be reconciled to the SOS result workbooks; keep EAC fallback caveats visible until then. |
| WI Wisconsin | Native presidential and review ETL is loaded, and official EAC 2024 EAVS V2 local-jurisdiction turnout rows are configured and loaded as fallback context. | Official Wisconsin registered-voter denominator data. Prefer ward-level data that can join to the WEC ward workbook; county- or municipality-level is usable only with caveats. |

## States Needing Native Turnout Packages Or State-Native Replacements

These states still need a state-native turnout package or review of whether fallback turnout coverage is sufficient for the current caveats.

`AK`, `AL`, `AR`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `ID`, `IL`, `KS`, `KY`, `LA`, `MA`, `MD`, `ME`, `MS`, `MT`, `NC`, `ND`, `NE`, `NJ`, `NM`, `NV`, `NY`, `OK`, `OR`, `RI`, `SD`, `TN`, `TX`, `UT`, `VT`, `WA`, `WY`

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

Mississippi currently uses official EAC 2024 V2 county/jurisdiction fallback rows at `data/eac-2024-state-turnout/ms-2024-eac-turnout.csv`, totaling 82 jurisdiction rows, 1,225,176 ballots cast, and 2,131,726 registered voters. This pass collected the official Mississippi SOS November 2024 Active Voter Count PDF at `data/ms-2024-november-active-voter-count.pdf` and normalized `data/ms-2024-november-active-voter-count.csv` with 82 county denominator-lead rows, 1,980,751 active voters, and a 2,238,135 CVAP estimate. The Mississippi SOS Active Voter Count Reports page (`https://www.sos.ms.gov/elections-voting/active-voter-count-reports`) is a state-native denominator lead because it publishes monthly county active-voter counts, but those reports are not a complete turnout replacement unless paired with official Mississippi ballots-cast or voter-participation rows and documented denominator timing.

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

Nevada still uses EAC 2024 V2 county/jurisdiction fallback turnout rows in `data/eac-2024-state-turnout/nv-2024-eac-turnout.csv`. A July 1, 2026 official-source pass found that the archived NVSOS statewide result page contains county result tables but no turnout/registration/export markers, while live NVSOS turnout and registration pages returned Incapsula challenge pages, empty content, or transport errors from scripted access. Keep Nevada in the native-turnout-needed list until a state-native county or precinct turnout denominator artifact is collected.

## Georgia Update

Georgia still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ga-2024-eac-turnout.csv`, totaling 159 rows, 5,297,500 ballots cast, and 8,234,335 registered voters. The 2024 Georgia SOS media export is loaded for county results and precinct President-versus-U.S.-House review rows, and official 2012/2016/2020 SOS media exports are now normalized for county historical baselines, but no Georgia-native ballots-cast plus registered-voter denominator package was loaded in this pass. Keep Georgia in the native-turnout-needed list until a state or county denominator artifact is collected and reconciled.

## Kansas Update

Kansas currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ks-2024-eac-turnout.csv`, totaling 105 jurisdiction rows, 1,342,102 ballots cast, and 2,031,119 registered voters. Native Kansas result and review rows are loaded from official Kansas Secretary of State presidential and U.S. House precinct workbooks, but no Kansas-native turnout or voter-participation denominator artifact is loaded. Keep EAC fallback active until a Kansas SOS or county ballots-cast plus registered-voter source is collected and reconciled. See `data/ks-2024-data-coverage-inventory.json` for the current source and caveat record.

## Kentucky Update

Kentucky currently uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ky-2024-eac-turnout.csv`, totaling 120 rows, 2,086,090 ballots cast, and 3,548,136 registered voters. Wave 7 collected Kentucky State Board of Elections 2024 General turnout PDFs by county and precinct at `data/ky-2024-general-turnout-by-county.pdf` and `data/ky-2024-general-turnout-by-precinct.pdf`, plus 2024 General registration statistics denominator PDFs at `data/ky-2024-general-registration-by-county.pdf` and `data/ky-2024-general-registration-by-precinct.pdf`. Wave 9 added `scripts/reconcile-ky-turnout-registration.mjs`, `data/ky-2024-turnout-registration-reconciliation.csv`, and `data/ky-2024-turnout-registration-reconciliation-summary.json`: the county State Board PDFs parse to 120 rows, 2,086,320 voters, 3,548,136 registered voters, and 3,232 precinct-count total, producing a 230-voter State Board minus EAC ballots-cast delta across 85 county rows and no registered-voter denominator delta. The State Board turnout page says those turnout reports are unofficial and can differ from election results because they are run after voter-registration rolls reopen, so EAC fallback remains active until county-clerk official documentation and replacement semantics are reviewed. See `data/ky-2024-data-coverage-inventory.json` for source URLs, caveats, and request fields.

## New York Wave 8 Update

New York still uses official EAC 2024 V2 county/jurisdiction fallback turnout rows at `data/eac-2024-state-turnout/ny-2024-eac-turnout.csv`, totaling 62 rows, 8,389,626 ballots cast, and 13,579,416 registered voters. A July 1, 2026 official-source pass documented NYSBOE state-native denominator leads: the Enrollment by County page includes `Voters Registered by County as of 11/01/2024`, and the Enrollment by Election District page publishes county-by-county election-district enrollment reports. These are denominator leads only, not ballots-cast or voter-history turnout replacements. Keep NY in the native-turnout-needed path until a state-native ballots-cast/voter-history artifact is collected and reconciled with county or election-district enrollment denominators. See `data/ny-2024-data-coverage-inventory.json` for source URLs, request fields, and caveats.

## California Update

California now uses official Secretary of State 2024 General Election voter participation rows at data/ca-2024-voter-participation-stats-by-county.csv, normalized from data/ca-2024-voter-participation-stats-by-county.pdf by scripts/normalize-ca-turnout.mjs. The rows include 58 counties, 16,140,044 total voters, and 22,595,659 registered voters. The registered-voter denominator is the SOS 15-day Report of Registration total, so it does not include voters who registered or updated registration through Same Day Voter Registration after the 15-day close. Current CA turnout is county-level and should stay caveated if future precinct/local review rows are added.
