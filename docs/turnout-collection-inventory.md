# Turnout Collection Inventory

Generated from repo configs and current source-package pass on 2026-06-30.

This is an internal collection inventory. It is not rendered in the Civic Result Maps web app.

## Summary

- States checked: 50
- Turnout loaded in database or validated native staging: 10
- Loaded through official EAC fallback while state-native ward denominator remains missing: 1
- Need native turnout package: 39

## Loaded Turnout

| State | DB rows | Level | Denominator | Local artifact |
| --- | ---: | --- | --- | --- |
| IN Indiana | 92 | county | registeredVoters | `data/in-2024-general-turnout.csv` |
| MI Michigan | 83 | county | novemberActiveRegisteredVoters | `data/mi-2024-voter-turnout.txt` |
| MN Minnesota | 4,103 | precinct | registeredVotersPlusElectionDayRegistrations | `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx` |
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
| WI Wisconsin | Native presidential and review ETL is loaded, and official EAC 2024 EAVS V2 local-jurisdiction turnout rows are configured and loaded as fallback context. | Official Wisconsin registered-voter denominator data. Prefer ward-level data that can join to the WEC ward workbook; county- or municipality-level is usable only with caveats. |

## States Needing Native Turnout Packages Or State-Native Replacements

These states still need a state-native turnout package or review of whether fallback turnout coverage is sufficient for the current caveats.

`AK`, `AL`, `AR`, `AZ`, `CA`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `IA`, `ID`, `IL`, `KS`, `KY`, `LA`, `MA`, `MD`, `ME`, `MS`, `MT`, `NC`, `ND`, `NE`, `NJ`, `NM`, `NV`, `NY`, `OK`, `OR`, `RI`, `SD`, `TN`, `TX`, `UT`, `VT`, `WA`, `WY`

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

## Nebraska Update

Nebraska now retains the official Secretary of State post-general eligible-voter registration report at `data/ne-2024-post-general-eligible-voter-report.pdf`. The current ETL still uses EAC 2024 V2 turnout rows for ballots-cast normalization, with the Nebraska report recorded as a state-native denominator cross-check until a mixed-source turnout normalizer is added.

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

South Carolina now has a state-native official turnout package at `data/sc-2024-vrems-turnout.csv`, generated by `npm run etl:collect:sc:turnout` from SC VREMS 2024 General Election voter-history county statistics. The rows use `totalVoting` as participating voters and `totalRegistered` as printed registration-list voters. The SC VREMS source page states those registration counts include all active registered voters plus some inactive voters printed for the selected election, so the ETL marks all 46 rows warning-required. The source statewide summary includes an unassigned/null-county row with 2 registered voters and 1 participating voter; the normalized artifact keeps only the 46 county rows for map/API joins.

## Virginia Update

Virginia now retains official Department of Elections ENR precinct turnout rows at `data/va-2024-enr-election-turnout.csv`. The native ETL reads `TotalVoteTurnout` and `TotalRegisteredVoters` for 2,669 precinct rows. `TotalVoteTurnout` is election-level turnout across the ballot, not presidential contest votes, so presidential-result reconciliation should continue to use the certified contest rows.

## New Hampshire Update

New Hampshire now uses official Secretary of State town/ward ballots-cast and names-on-checklist workbooks normalized into `data/nh-2024-town-ward-president-governor.csv`. The detailed ballots-cast rows sum to 831,468 while the workbook county summary totals 831,467 after a source correction note; keep that caveat visible with the state-native turnout package.
## Indiana Update

Indiana now uses official Indiana Election Division county turnout and registration rows normalized from `data/in-2024-general-turnout-report.pdf` into `data/in-2024-general-turnout.csv` by `scripts/normalize-in-turnout.mjs`. The configured rows total 92 counties, 2,976,599 voters voting, and 4,837,802 registered voters. EAC 2024 V2 rows remain retained as benchmark context, but the active IN turnout config is now state-native county turnout. Remaining turnout-adjacent gaps are precinct-level turnout denominators and precinct boundary geometry if subcounty overlays or same-grain turnout screening are required.
