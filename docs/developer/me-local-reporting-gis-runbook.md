# Maine local-reporting-unit GIS runbook

## Scope and terminology

Maine does not publish one uniform statewide precinct result table for these
four presidential elections. The Secretary of State workbooks mix towns,
plantations, townships, voting districts, and combined local units. The
normalized geography level is therefore `local_reporting_unit`, not
`precinct`.

The collector enforces three rules:

1. Displayed votes come only from the retained Maine Secretary of State
   workbook.
2. A town total is never copied onto multiple ward polygons and is never
   proportionally allocated. Ward components are dissolved before the one
   official local total is attached.
3. A missing or ambiguous relationship remains blocked or excluded rather
   than receiving an inferred polygon or vote total.

## Retained status

| Year | Official SOS source rows | Reviewed map units | Excluded source rows | Presidential votes represented | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| 2012 | 545 | 507 | 5 | 710,118 of 710,126 | Partial and blocked |
| 2016 | 532 | 532 | 0 | 743,941 of 743,941 | Source/crosswalk reviewed; delivery pending |
| 2020 | 516 | 516 | 0 | 813,742 of 813,742 | Source/crosswalk reviewed; delivery pending |
| 2024 | 512 | 494 | 0 | 824,806 of 824,806 | Source/crosswalk reviewed; delivery pending |

The 2024 reduction from 512 source rows to 494 map units is intentional:
34 small source rows are represented by 16 published official-boundary units.
The constituent source identities and exact summed values remain in the
normalized result artifact. T22 MD is the one gap in the NYT source. Its Maine
GeoLibrary shape is accepted only after the collector proves that its area and
bounds are unchanged between the retained July 2015 archive and the current
official service.

The 2012 candidate uses a retained MGGG election reconstruction as supplemental
geometry. It is derived from Maine GeoLibrary and other public boundaries, but
the exact November 2012 official boundary edition is not established and no
explicit derivative redistribution permission was located. Five separately
published units totaling eight votes also have no uniquely attributable
retained polygon. Those rows are enumerated in the normalized result exclusions
and 2012 remains fail-closed. The retained July 2015 official GeoLibrary archive
documents source lineage only; it is not backcast as 2012 geometry.

## Sources

- Maine Secretary of State official presidential workbooks are the sole vote
  source for every year.
- The retained public MGGG repository supplies the blocked 2012 secondary
  candidate. Its README, exact ZIP, official Maine GeoLibrary source-lineage
  archive, and Maine reuse statute are retained. MGGG election fields are never
  copied, and the derivative cannot be publicly delivered without explicit
  permission or an official replacement.
- The retained official Maine GeoLibrary Town and Township Boundary archive is
  also used as the historical side of the 2024 T22 MD temporal bracket.
- The 2016 and 2020 election-specific VEST geometry is used only as reviewed
  geometry under the retained version-specific CC BY 4.0 evidence. Embedded
  VEST vote fields are never copied.
- The 2024 New York Times official-boundary compilation is used under its
  retained C-UDA v1.0 Non-Commercial terms. Embedded NYT/AP vote fields are
  never copied. Public delivery must preserve attribution and terms.

Every retained artifact is recorded with authority, URL, local path, SHA-256,
byte count, reporting grain, and caveats in the per-year source evidence.

## Deterministic collection and replay

Run from a clean checkout:

```powershell
npm.cmd run precinct-gis:collect:me:2012
npm.cmd run precinct-gis:collect:me:2016
npm.cmd run precinct-gis:collect:me:2020
npm.cmd run precinct-gis:collect:me:2024
npm.cmd run test:precinct-geometry:me
```

The replay aliases use the same content timestamp and must reproduce every
derived byte:

```powershell
npm.cmd run precinct-gis:replay:me:2012
npm.cmd run precinct-gis:replay:me:2016
npm.cmd run precinct-gis:replay:me:2020
npm.cmd run precinct-gis:replay:me:2024
```

Derived artifacts for each election are:

- `manifest.json`;
- `source-evidence.json`;
- `normalized/me-<year>-local-reporting-units.geojson.gz`;
- `normalized/me-<year>-president-local-results.json.gz`;
- `crosswalk/me-<year>-local-result-crosswalk.json`; and
- `reports/me-<year>-local-reporting-geometry-report.json`.

The test replays all four years, validates manifest and source-evidence hashes,
checks every relationship and total, rejects future/invalid timestamps, proves
that secondary election fields are absent from normalized geometry, verifies
the retained 2012 MGGG/GeoLibrary provenance chain, and checks the 2012
exclusions and 2024 temporal bracket.

## Current public-release gate

All four manifests deliberately have `delivery: null` and
`validation.status: blocked`. They are not added to the canonical public
manifest registry by this collection change. No production database, Blob,
Vercel environment, deployment, or public alias is mutated.

The next reviewed change may build guarded database, immutable county-scoped
delivery, publication, activation, and rollback tooling for 2016, 2020, and
2024. It must extend the application contract to preserve
`local_reporting_unit` labels end to end; hard-coded `precinct` labels or SQL
filters must not silently admit Maine data. The 2012 package remains outside
that release until its explicit geometry, vintage, and derivative-permission
blockers are resolved.
