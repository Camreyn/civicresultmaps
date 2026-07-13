# Election Security Incident Layer

The Security map mode displays source-linked county records for documented November 5, 2024 election security incidents. It maps every county named in the published nationwide Election Day compilation and adds Pima County from a separate official after-action report. It is an election-administration context layer, not a result, turnout, or advisory-indicator layer.

## Data contract

- Normalized rows: `data/election-security-incidents-2024.json`
- Nationwide coverage inventory: `data/election-security-incident-source-inventory-2024.json`
- Loader: `src/lib/security-incidents.ts`
- Source capture: `data/nbc-2024-election-day-bomb-threat-county-compilation.json`
- Reproducible normalization: `npm run security-incidents:build`
- Public API: `GET /api/security-incidents?state=GA&year=2024`
- Validation: `npm run validate:security-incidents`
- API response schema: `meta.schemaVersion = 3.0.0`

Rows join to county geometry by `jurisdictionTag` using the canonical `county:<GEOID>` contract. The map uses normalized county names only as a fallback when a geometry or result row lacks a tag. API schema 3.0.0 adds `sourceTier`, `sourceStatus`, `namedLocations`, `threatCountBasis`, and count-source provenance. Mixed source units make the legacy aggregate fields `affectedLocations` and `knownAffectedLocations` null; clients must read `affectedLocationUnits` and must not treat an unknown count as zero.

## Coverage and source tiers

The normalized package contains 20 county rows across Arizona, Georgia, Michigan, Pennsylvania, and Wisconsin:

- All 19 counties named by the NBC News nationwide compilation are mapped. The accessible embedded table exposes 18 rows totaling 66 under a `Threats` column; the article prose also names Milwaukee but does not expose a separate Milwaukee count. Milwaukee is mapped with a null count rather than an inference.
- Four rows have county-level official records: Fulton, DeKalb, Chester, and Pima.
- Sixteen rows rely on the visibly labeled supplemental nationwide compilation because this review did not locate a qualifying county-level official incident artifact.
- Pima is an additional official county record outside the 19-county compilation. Its official PDF was verified, but direct scripted download was blocked by an anti-bot challenge, so a structured extract records the relevant page and canonical URL.

The source-reported threat count and the number of disrupted places remain separate. For example, the compilation reports 32 threats for Fulton while county records identify five polling locations whose hours were extended; DeKalb's compiled count is five while the official update identifies six active voting precincts. These figures describe different source scopes and are not added together.

The FBI's November 5 national statement is retained as context because it identifies neither a state nor a county. A December 11 Senate letter repeats a figure of at least 67 polling locations in 19 counties across five states, but cites NBC News and Reuters rather than a disclosed federal roster. Both the Senate PDF and the structured NBC table capture are hash-verified in the inventory.

## Interpretation limits

The registry covers the full published 19-county Election Day compilation plus one additional official county record; it is not an official federal census or a complete site-by-site roster. A supplemental row says a county appeared in the published compilation, not that every site, closure, or unique email is known. An absent row does not establish that no incident occurred. The layer does not indicate altered votes or an incorrect outcome and is not evidence of fraud or misconduct.
