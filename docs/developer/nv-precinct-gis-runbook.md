# Nevada four-election precinct GIS runbook

This runbook covers the reproducible local Nevada precinct-GIS pipeline for the
2012, 2016, 2020, and 2024 presidential general elections. It deliberately does
not authorize production database writes, public Blob uploads, canonical
manifest activation, or deployment changes.

## Current status

| Year | Safe result units | Polygon features | Reviewed relationships | Reviewed no-data features | Current release gate |
| --- | ---: | ---: | ---: | ---: | --- |
| 2012 | 1,760 | 2,002 | 1,760 | 242 | Blocked only until the election-date Washoe archive replaces the labeled 2016 proxy partition. Five multipart precincts, formerly represented by 23 relationships, are now retained as five deterministic MultiPolygon features, so every result relationship is one-to-one. |
| 2016 | 1,843 | 2,067 | 1,843 | 224 | Source and crosswalk gates passed. Results now come from the official statewide NVSOS precinct export; VEST is used only for attributed CC BY 4.0 election-specific geometry. Privacy-suppressed and non-geographic units remain excluded. |
| 2020 | 1,869 | 2,094 | 1,869 | 225 | Source and crosswalk gates passed. Results come from the official statewide NVSOS precinct export; the exact VEST Harvard Dataverse version-21 CC BY 4.0 terms are retained with the geometry. |
| 2024 | 1,518 | 1,726 | 1,518 | 208 | Source and crosswalk gates passed. The official public-authoritative LCB layer is covered by retained ArcGIS Online public-sharing terms and has no additional owner-stated constraint. |

All Nevada manifest entries remain blocked, have no public delivery declaration,
and are absent from the canonical public manifest registry. Suppressed vote
cells are unknown, not zero. The shared delivery contract now preserves all 208
reviewed no-data polygons with synthetic, non-result identities; joins leave
them uncolored and do not invent vote rows. The remaining manifest blocker for
2016, 2020, and 2024 is immutable delivery packaging and production review, not
an external source request.

## Deterministic replay

Run each collector from a clean checkout containing the retained raw artifacts:

```powershell
npm.cmd run precinct-gis:replay:nv:2012
npm.cmd run precinct-gis:replay:nv:2016
npm.cmd run precinct-gis:replay:nv:2020
npm.cmd run precinct-gis:replay:nv:2024
npm.cmd run test:precinct-geometry:nv
```

The test suite requires byte-identical source evidence, manifests, normalized
geometry, normalized result identities, crosswalks, and reports. It also proves
the public results and geometry gates apply to Nevada.

## Loopback database rehearsal

Use only the fixed Docker development clone on loopback. These commands do not
load `.env.local` and reject nonlocal database endpoints.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:plan:nv
npm.cmd run precinct-gis:setup:nv:local
npm.cmd run precinct-gis:validate:nv:local

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL
```

The reviewed local validation baseline is 6,990 reporting units, 20,970 result
rows, 7,889 features, 6,990 reviewed one-to-one relationships, four safely
blocked geography versions, and zero invalid constraints.

## All-four readiness decision

Generate the deterministic report without writing a file:

```powershell
npm.cmd run precinct-gis:readiness:nv
```

To retain the report under the ignored local `.etl` evidence tree:

```powershell
npm.cmd run precinct-gis:readiness:nv -- --write
```

The current decision must be `NO_GO_ALL_FOUR_PUBLIC_RELEASE`. The report is a
read-only source/release assessment; it cannot publish data or authorize a
database write.

## External source request: 2012 Washoe election-date archive

Primary recipient: Nevada Legislative Counsel Bureau Research Library,
`library@lcb.state.nv.us`. NRS 293.206 required the county clerk to submit the
county precinct maps in the even election year, and the LCB catalog identifies
the Research Library as the contact for retained map files.

Suggested subject:

`Request for Washoe County 2012 election precinct GIS/map files submitted under NRS 293.206`

Suggested request:

> Please provide the original electronic files submitted for Washoe County's
> precinct maps applicable to the November 6, 2012 general election under NRS
> 293.206, preferably the native GIS shapefile, file geodatabase, or other
> machine-readable boundary format. Please also include associated projection
> and field metadata, all corrected or superseding submissions, and the
> precinct-change index submitted under NRS 293.208. If only map PDFs or image
> files are retained, please provide the original-resolution files and any
> labels, lookup tables, or source GIS references needed to associate each
> polygon with its county precinct identifier.

The same request may be copied to the Nevada Secretary of State Elections
Division and Washoe County Registrar of Voters because each may retain another
copy. Do not replace the manifest's source gate with an undated current GIS
service or an unreviewed raster digitization.

## Release exit criteria

A 2016/2020/2024 production release may be designed from the retained public
sources now. An all-four release still requires the 2012 Washoe archive. The
next implementation must:

1. regenerate and re-review any affected source, normalized, crosswalk, and
   manifest bytes;
2. create immutable county-scoped GeoJSON delivery objects and indexes;
3. preserve all no-data, suppression, VEST attribution, proxy-removal, and
   source-vintage caveats;
4. rehearse the complete hidden-load and publication transaction against the
   loopback clone;
5. add Nevada-specific guarded preflight, backup, receipt recovery, Blob
   publication, canonical activation, and rollback tests before any production
   action.

The separate Clark/Washoe/Humboldt President-versus-Senate advisory pipeline is
not evidence that the four-year presidential map is incomplete or suspect. It
serves a different comparison-review purpose, and advisory indicators are not
findings of fraud or misconduct.
