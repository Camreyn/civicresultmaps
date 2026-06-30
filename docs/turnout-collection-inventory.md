# Turnout Collection Inventory

Generated from repo configs and current Neon counts on 2026-06-16.

This is an internal collection inventory. It is not rendered in the Civic Result Maps web app.

## Summary

- States checked: 50
- Turnout loaded in database: 4
- Native config present but turnout missing: 1
- Need native turnout package: 45

## Loaded Turnout

| State | DB rows | Level | Denominator | Local artifact |
| --- | ---: | --- | --- | --- |
| MI Michigan | 83 | county | novemberActiveRegisteredVoters | `data/mi-2024-voter-turnout.txt` |
| MN Minnesota | 4,103 | precinct | registeredVotersPlusElectionDayRegistrations | `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx` |
| OH Ohio | 8,878 | precinct | registeredVoters | `data/oh-2024-statewide-races-precinct-level.xlsx` |
| PA Pennsylvania | 67 | county | registeredVoters | `data/pa-2024-voter-registration-vote-history-summary.xlsx` |

## Native Config Present, Turnout Missing

| State | Current status | Needed |
| --- | --- | --- |
| WI Wisconsin | Native presidential and review ETL is loaded, but turnout rows are 0. | Official Wisconsin registered-voter denominator data. Prefer ward-level data that can join to the WEC ward workbook; county-level is usable with caveats. |

## States Needing Native Turnout Packages

These states do not currently have native turnout ETL configs or database turnout rows.

`AK`, `AL`, `AR`, `AZ`, `CA`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `IA`, `ID`, `IL`, `IN`, `KS`, `KY`, `LA`, `MA`, `MD`, `ME`, `MO`, `MS`, `MT`, `NC`, `ND`, `NE`, `NH`, `NJ`, `NM`, `NV`, `NY`, `OK`, `OR`, `RI`, `SC`, `SD`, `TN`, `TX`, `UT`, `VA`, `VT`, `WA`, `WV`, `WY`

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
