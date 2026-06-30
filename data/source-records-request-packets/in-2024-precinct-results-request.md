# Indiana 2024 Official Source Gap Request

This request seeks machine-readable official source records for the November 5, 2024 Indiana General Election. The public ENR county category JSON files currently available in this repository contain county totals, and the archived `JurR_*_B.json` county jurisdiction files contain office/contact and reporting-region/referendum structures, not candidate result rows.

Requested result records:
- President and Vice President result rows by precinct, township, ward, vote center/reporting unit, or the lowest county-subdivision level maintained by the office.
- U.S. Senator result rows at the same reporting-unit level and with the same local-unit identifiers.
- Field definitions or export layout documentation for county, local unit, precinct/reporting-unit code, candidate, party, vote total, contest name, and ballot/reporting mode fields.
- Any county-level file manifest that identifies whether a county reports consolidated vote-center totals, precinct totals, absentee/early/provisional rows, or other non-precinct reporting units.

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

If the Indiana Election Division does not maintain any of these records statewide, please identify the county election offices or other custodians most likely to maintain them.
