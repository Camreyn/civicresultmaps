# Michigan precinct GIS runbook

This runbook covers the retained Michigan source and crosswalk packages for the
2012, 2016, 2020, and 2024 general elections. It does not authorize database,
Blob, manifest-registry, deployment, or production publication changes.

## Source authority

- Result values come only from the Michigan Department of State precinct ZIP
  for the matching election. The package never uses GIS or secondary-source
  vote fields.
- Geometry comes from Michigan DTMB/Center for Shared Solutions election-cycle
  GIS. The 2024 archived layer is explicitly the 2024 election edition. The
  historical packages preserve their more limited vintage evidence as a
  blocker instead of backcasting another year's boundaries.
- Michigan Biennial Precinct Reports and official Census municipality codes
  supply count, cross-county, and municipality-identity review evidence.
- Every retained raw input is checked against a byte count and SHA-256 before
  the builder parses data or writes a derived artifact.

## Rebuild and verify

From a clean repository checkout:

```powershell
npm.cmd run precinct-gis:collect:mi
npm.cmd run test:precinct-geometry:mi
```

The test copies the source package to an alternate local root, rebuilds all
four years, requires every derived byte to match, validates each manifest and
artifact, and proves a tampered raw ZIP is rejected before derived files can be
changed.

## Reviewed disposition

| Year | Geometry | Official result identities | Reviewed match | Explicit non-geographic | Source aliases | Disposition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | 4,874 | 5,238 | 4,862 | 371 | 5 | Blocked |
| 2016 | 4,810 | 5,077 | 4,788 | 266 | 2 | Blocked |
| 2020 | 4,752 | 4,923 | 4,699 | 168 | 5 | Blocked |
| 2024 | 4,340 | 4,434 | 4,340 | 87 | 7 | Reviewed; delivery pending |

Result-identity counts include explicit source-alias records. Aliases preserve
multiple official source rows that refer to one geometry unit; their votes are
summed once into the canonical geographic result and never duplicated.
Administrative/statistical and absent-voter-counting-board units are preserved
for official-total reconciliation and never assigned to a polygon.

## 2024 relationship rules

The reviewed 2024 package represents all 4,347 official geographic source
identities with 4,340 official polygons:

- 3,866 use the exact county, municipality, ward, and precinct composite;
- 8 use an exact statewide composite for cross-county municipalities;
- 473 use the unique official county, municipality, and precinct after the
  source and GIS ward conventions differ;
- 7 additional official source identities are retained as aliases;
- 87 administrative units remain non-geographic.

No centroid assignment, proportional allocation, copying of county totals, or
cross-election identifier reuse is permitted. The normalized geometry and
crosswalk relationship metadata contain no election-value properties.

The 2024 manifest deliberately remains `validation.status = blocked` and has a
null delivery declaration. It must stay outside
`data/precinct-geometry-manifests.json` until a separately reviewed local DB,
immutable parent-scoped delivery, hidden production load, deployment gate, and
atomic publication implementation has completed.

## Historical blockers

- 2012: the legacy live service labels an `ElectionYear=2012` cohort but does
  not prove an immutable November 6 snapshot; its 4,874 features differ from
  the Biennial report's 4,873; 12 polygons remain unlinked; affirmative
  derivative redistribution terms are not retained.
- 2016: 21 geographic result units remain unresolved and 22 polygons remain
  unlinked; the cycle layer does not prove an immutable November 8 snapshot.
- 2020: 51 geographic result units remain unresolved and 53 polygons remain
  unlinked; the cycle layer does not prove an immutable November 3 snapshot;
  the precinct export's scope differs from the certified statewide summary.

These packages remain useful, hash-pinned evidence, but they must not be added
to the public manifest registry until their blockers are resolved and their
crosswalks are independently reviewed.

## Cross-year comparisons

Each election keeps its own boundary vintage. A precinct ID or shape is never
assumed stable from one election to another. Direct cross-year comparison
requires a separate reviewed common-geography crosswalk or aggregation to a
stable higher-level geography; the site must not present raw precinct rows as
an apples-to-apples time series merely because their labels look alike.
