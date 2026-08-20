# District Compactness Explorer

The district compactness feature provides reproducible, advisory descriptions
of official 2024 congressional and state legislative boundary shape. It does
not infer gerrymandering severity, partisan intent, legality, representational
quality, election integrity, fraud, or misconduct.

## Source scope

The collector uses official U.S. Census Bureau geometry effective January 1,
2024:

- TIGERweb detailed layer 54: 119th Congressional Districts
- TIGERweb detailed layer 56: 2024 State Legislative Districts - Upper
- TIGERweb detailed layer 58: 2024 State Legislative Districts - Lower
- Generalized ACS 2024 legislative layers 5, 8, and 9 for the corresponding
  1:500,000 comparison geometry

The source context is documented by the Census Bureau's
[2024 TIGER/Line release](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.2024.html),
[119th Congressional District program](https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html),
and [2024 State Legislative District program](https://www.census.gov/programs-surveys/decennial-census/about/rdo/state-legislative-district.2024.html).

`scripts/collect-district-compactness.mjs` paginates each ArcGIS GeoJSON query
by `GEOID`, verifies source counts before writing, gzip-retains all six source
collections, records compressed and uncompressed SHA-256 values, and generates
the public JSON/CSV outputs. The collector writes only after all sources and
derived rows pass validation.

The detailed services contain 15 explicit placeholder polygons named
"districts not defined": three congressional, six upper-chamber, and six
lower-chamber areas. These source features remain in the retained detailed
collections and in `summary.json`, but they are not presented as real district
plans. The resulting public dataset has 7,272 rows:

| Geography | Rows |
| --- | ---: |
| 119th congressional districts | 441 |
| 2024 state upper-chamber districts | 1,958 |
| 2024 state lower-chamber districts | 4,873 |

## Calculations

The shared implementation is `src/lib/district-compactness-core.ts`.

### Area and perimeter

- Area is calculated on a sphere from longitude/latitude polygon rings.
  Interior holes are subtracted from exterior rings.
- Perimeter is the Haversine length of every exterior and interior boundary
  ring. Multipart districts, islands, enclaves, and holes stay explicit.
- The detailed geometry area is reconciled to Census `AREALAND + AREAWATER`.
  Collection fails when the maximum relative difference exceeds 3%.

### Polsby-Popper

The score is:

```text
4 * pi * area / perimeter^2
```

A circle approaches 1. The value is especially sensitive to coastline detail,
islands, holes, and source simplification. A low value is not, by itself, a
finding about why a boundary has its shape.

### Convex-hull ratio

Each district is projected around its own center with a Lambert azimuthal
equal-area projection. The metric divides the projected district area by the
convex hull of all exterior vertices. Disconnected or deeply concave geometry
usually produces a lower value.

### Resolution stability

Every real detailed district is matched by the same `GEOID` to the official
1:500,000 source. A row is labeled `stable` only when:

- the detailed/generalized Polsby-Popper relative difference is at most 20%;
- the detailed/generalized convex-hull relative difference is at most 10%.

Otherwise it is `resolution_sensitive`. The thresholds are screening guards,
not statistical significance or a judgment about the district.

The percentile field is a relative rank only among the same geography type
nationwide. It is not a severity score and should not be compared across plan
vintages or geography types.

## Election-result boundary

Election-result relationships are intentionally `not_calculated`. The
repository does not yet contain a nationwide certified district-result dataset
joined to these exact plan vintages. Results from another district plan, an
older boundary vintage, counties, or approximated geography must not be joined
to compactness rows. A future result analysis requires:

1. certified contest results at district grain;
2. an explicit identity to the same plan and election cycle;
3. complete reconciliation, including non-geographic votes;
4. a separately reviewed method that avoids causal or intent claims.

## Artifacts and replay

| Artifact | Purpose |
| --- | --- |
| `data/district-compactness/manifest.json` | URLs, source hashes, counts, parser, output hashes, and caveats |
| `data/district-compactness/raw-*.geojson.gz` | Six retained official source collections |
| `data/district-compactness/district-compactness.json` | Public application/API dataset |
| `data/district-compactness/district-compactness.csv` | Review-friendly export |
| `data/district-compactness/summary.json` | Counts, exclusions, stability totals, and area reconciliation |

Run:

```powershell
npm run district-compactness:replay
npm run test:district-compactness
npm run typecheck
npm run build
```

`--check` uses only retained source artifacts and fails if any generated byte
differs. Re-fetching official services requires `--refresh`; changed source
hashes fail closed unless a reviewer explicitly uses `--accept-source-drift`
after examining the upstream change.

## Public surfaces

- Explorer: `/district-compactness`
- API: `/api/district-compactness`
- OpenAPI description: `/api/openapi`

The API accepts `state`, `geography`, `stability`, `q`, `sort`, `limit`, and
`offset`. Every response repeats the plan, methodology, result-join status, and
advisory-only contract.
