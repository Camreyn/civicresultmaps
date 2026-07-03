# Indiana 2024 Official Source Gap Request

This request seeks machine-readable official source records for the November 5, 2024 Indiana General Election. The public ENR county category JSON files currently available in this repository contain county totals, and the archived `JurR_*_B.json` county jurisdiction files contain office/contact and reporting-region/referendum structures, not candidate result rows.

## Evidence Already Checked

- Indiana Election Division ENR county category files retained in this repository expose 92 county/locality result regions for President and U.S. Senate, not precinct or lower reporting-unit result rows.
- The retained `JurR_*_B.json` county jurisdiction files contain zero candidate-result containers after rescan.
- The public ENR app script path documented in `data/in-2024-official-enr-public-data-inventory.json` identifies office-category JSON, ticker/settings JSON, turnout-statistics download JSON, map data, and referendum/jurisdiction files, but no public President or U.S. Senate precinct/subcounty candidate-result export.
- The Indiana Election Division Election Administrator's Portal links a 2026 "Public Record Requests & Retentions" presentation, confirming records-request/retention guidance is part of the official administrator materials path.
- The Indiana Election Division Census Data, Statistics and Maps page links the statewide county precinct-count PDF. That PDF reports 5,147 precincts, 1,342 precinct splits, and 1,092 precincts with splits as of September 20, 2023. Any result export should therefore identify whether rows are precincts, precinct splits, vote-center/reporting units, absentee/early/provisional units, or county summaries, and should include split identifiers where applicable.

Primary contact path currently listed by the Election Division: elections@iec.in.gov / 317-232-3939.

## Records Request Text

Please provide, or identify the custodian for, the following machine-readable records for the November 5, 2024 Indiana General Election. We are seeking official source records suitable for public-interest source reconciliation. We are not asking for conclusions about misconduct.

Requested result records:
- President and Vice President result rows by precinct, township, ward, vote center/reporting unit, or the lowest county-subdivision level maintained by the office.
- U.S. Senator result rows at the same reporting-unit level and with the same local-unit identifiers.
- Field definitions or export layout documentation for county, FIPS/county code, local unit, precinct/reporting-unit code, precinct split code, candidate, party, vote total, contest name, office/contest ID, district ID where applicable, and ballot/reporting mode fields.
- A county-level file manifest that identifies whether each county reports consolidated vote-center totals, precinct totals, precinct-split totals, absentee/early/provisional rows, election-day rows, or other non-precinct reporting units.
- Certification/finality status and the county-level reconciliation method tying the local rows back to the official ENR county President and U.S. Senate totals.
- Any known caveats for duplicated precinct labels, renamed precincts, precinct splits, non-geographic rows, or report modes that should not be summed with standard precinct rows.

Requested turnout and registration records:
- State-native ballots-cast and registered-voter denominator rows by county or lower reporting unit.
- Denominator timing and definitions, including whether inactive voters, election-day registrations, provisional ballots, absentee ballots, overseas/federal-only ballots, and same-day changes are included.
- Expected statewide ballots-cast and registered-voter totals for reconciliation.

Requested geography and baseline records:
- Precinct, ward, township, vote-center/reporting-unit, or other local geometry/crosswalk files needed to join subcounty result rows.
- Historical county or subcounty presidential result baselines for 2020, 2016, and 2012, with source URLs, certification status, and parser notes.

Requested administration-context records:
- Post-election audit reports, audit unit lists, discrepancy summaries, and statewide audit findings.
- Recount records or confirmations of no applicable statewide recounts for President or U.S. Senate.
- Cast vote record availability documentation, export rules, public-records limitations, or county custodian routing guidance.
- Incident, correction, amended canvass, litigation, certification, and other post-election records that change or qualify published 2024 result data.

Preferred formats: original election-management-system export, CSV, XLSX, JSON, fixed-width text with layout, shapefile/GeoJSON/geodatabase for geometry, PDF reports with source tables, or database extract. Please preserve original filenames, timestamps, certification status, and export settings.

If the Indiana Election Division does not maintain any of these records statewide, please identify the county election offices or other custodians most likely to maintain them, and whether each county custodian should be asked for precinct, precinct-split, vote-center, or election-management-system export terminology.
