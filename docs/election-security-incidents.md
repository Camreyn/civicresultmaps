# Election Security Incident Layer

The Security map mode displays partial, official-source county-level records for documented November 5, 2024 election security incidents. It is an election-administration context layer, not a result, turnout, or advisory-indicator layer.

## Data contract

- Normalized rows: `data/election-security-incidents-2024.json`
- Nationwide coverage inventory: `data/election-security-incident-source-inventory-2024.json`
- Loader: `src/lib/security-incidents.ts`
- Public API: `GET /api/security-incidents?state=GA&year=2024`
- Validation: `npm run validate:security-incidents`

Rows join to county geometry by `jurisdictionTag` using the canonical `county:<GEOID>` contract. The map uses normalized county names only as a fallback when a geometry or result row lacks a tag.

## Initial official sources

The initial normalized package contains two Georgia county rows:

- Fulton County Board of Registration and Elections approved November 5, 2024 meeting minutes, supported by the county's polling-hours extension notice.
- DeKalb County Police Department's November 5, 2024 update identifying six active voting precincts that received bomb threats and temporarily suspended voting during police sweeps.

Neither county source provides an exact count of distinct threat messages, so normalized `threatCount` values remain null. The six documented DeKalb precincts are counted as affected locations only.

The FBI's November 5 national statement is retained as inventory context only because it identifies neither a state nor a county and therefore cannot support a county map row. The repository includes a hash-verified manual HTML archive of the official statement; companion presentation assets are omitted because the HTML contains the full statement and canonical source URL.

## Interpretation limits

The registry is not a complete census. A displayed row documents a qualifying official county record. An absent row does not establish that no incident occurred. The layer does not indicate altered votes or an incorrect outcome and is not evidence of fraud or misconduct.
