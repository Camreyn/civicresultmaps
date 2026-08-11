# Nevada four-election precinct GIS runbook

This runbook covers the reproducible local Nevada precinct-GIS pipeline for the
2012, 2016, 2020, and 2024 presidential general elections. It deliberately does
not authorize production database writes, public Blob uploads, canonical
manifest activation, or deployment changes.

## Current status

| Year | Safe result units | Polygon features | Reviewed relationships | Reviewed no-data features | Current release gate |
| --- | ---: | ---: | ---: | ---: | --- |
| 2012 | 1,760 | 2,020 | 1,778 | 242 | Blocked until the election-date Washoe archive replaces the labeled 2016 proxy partition; five one-to-many result units also require an approved aggregate-rendering contract. |
| 2016 | 2,067 | 2,067 | 2,067 | 0 | Blocked because the precinct rows and polygons are a VEST secondary reconstruction. The official LCB map reconciles statewide percentages but does not establish official row-level provenance. |
| 2020 | 2,094 | 2,094 | 2,094 | 0 | Blocked until the exact Harvard Dataverse file-version-21 custom terms are retained and reviewed. |
| 2024 | 1,518 | 1,726 | 1,518 | 208 | Blocked until affirmative derivative-redistribution terms are retained for the public-authoritative LCB layer; its item `licenseInfo` and layer `copyrightText` are empty. |

All Nevada manifest entries remain blocked, have no public delivery declaration,
and are absent from the canonical public manifest registry. Suppressed vote
cells are unknown, not zero. The shared delivery contract now preserves all 208
reviewed 2024 no-data polygons with synthetic, non-result identities; joins
leave them uncolored and do not invent vote rows.

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

The reviewed local validation baseline is 7,439 reporting units, 22,317 result
rows, 7,907 features, 7,457 reviewed relationships, four blocked geography
versions, and zero invalid constraints.

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

## External source request: 2016 official row-level provenance

Primary recipient: Nevada Legislative Counsel Bureau Research Library,
`library@lcb.state.nv.us`.

Suggested subject:

`Request for source data used in Nevada's official 2016 presidential precinct map`

Suggested request:

> Please provide the machine-readable precinct result table, boundary files,
> metadata, and any result-to-boundary crosswalk used to create
> `ElectionResults2016USPres.pdf`. The retained official map states that its
> election data came from the Nevada Secretary of State. If those original
> files are no longer retained, please confirm whether the cited VEST Nevada
> 2016 V1.2 reconstruction may be used as a clearly attributed supplemental
> row-level source after its statewide totals reconcile to the official map.

The collector already proves that the retained VEST totals produce the LCB
map's published 47.92% Democratic, 45.50% Republican, and 6.58% other shares.
That statewide reconciliation does not by itself make the VEST precinct rows
an official Nevada export.

## External source request: 2020 VEST terms

Recipient: University of Florida Election Lab / VEST,
`election-lab@ufl.edu`.

Suggested subject:

`Request for version-specific license terms for Nevada VEST 2020 file 4863168`

Suggested request:

> We retain the Nevada `nv_2020.zip` artifact from Harvard Dataverse file
> 4863168, dataset version 21.0, SHA-256
> `bc6befa8917bb309540ff3414c036a577730bd301ecef119797b919c0abb2d90`.
> Please provide the exact custom license or terms that applied to that file and
> version, and confirm whether a public, noncommercial election-results website
> may redistribute derived county-scoped GeoJSON boundary files with clear VEST
> attribution and source caveats.

A license from a later Dataverse dataset version is not a substitute. Retain the
exact response as source evidence before changing the 2020 manifest gate.

## External source request: 2024 LCB derivative-redistribution terms

Primary recipient: Nevada Legislative Counsel Bureau Research Library,
`library@lcb.state.nv.us`.

Suggested subject:

`Request for reuse terms for Nevada LCB 2024 Precincts ArcGIS item 6303f14785fb401c8e4c53e333f44472`

Suggested request:

> Please confirm the reuse and public redistribution terms for attributed,
> derived county-scoped GeoJSON produced from the Nevada LCB `2024 Precincts`
> FeatureServer. The retained ArcGIS item is public and
> `public_authoritative`, identifies the layer as Nevada voting precincts for
> the 2024 election cycle, and the layer permits Query and Extract. However,
> the retained item `licenseInfo` and layer `copyrightText` fields are empty.

Retain the written response with the existing item and layer metadata before
changing the 2024 source gate.

## Release exit criteria

An all-four production release may be designed only after all four external
source gates are closed with retained evidence and the 2012 one-to-many
rendering decision is reviewed. The next implementation must then:

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
