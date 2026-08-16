# North Carolina election-specific local geography release runbook

## Scope and terminology

This release contains three independently reviewed presidential-election
layers. The 2012 layer is an official voting-district (`vtd`) result universe;
the 2016 and 2020 layers are `precinct` result universes. The application,
database, manifests, delivery files, API requests, and labels must preserve
those exact grains. North Carolina 2012 must never be silently relabeled as a
precinct layer.

Each election keeps its own boundary vintage. These maps accurately display
the reviewed units for that election, but do not claim that same-named units
are unchanged or directly comparable across redistricting cycles. A separate,
reviewed common-geography crosswalk is required for apples-to-apples trend
analysis.

The package enforces four rules:

1. Every displayed vote comes from the retained official North Carolina State
   Board of Elections (NCSBE) presidential result artifact.
2. No result is divided, proportionally allocated, or copied to more than one
   polygon.
3. Geometry artifacts contain no candidate names, parties, or vote values.
4. Administrative or otherwise non-geographic result units stay in the
   database for reconciliation and never receive an invented polygon.

## Reviewed release universe

| Year | Grain | Official result units | Geographic units/features | Non-geographic units | Candidate rows | Mapped presidential votes | Official presidential votes | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | `vtd` | 3,011 | 2,692 | 319 | 8,076 | 4,492,613 | 4,505,372 | Reviewed; guarded release candidate |
| 2016 | `precinct` | 3,209 | 2,704 | 505 | 8,112 | 3,177,511 | 4,741,564 | Reviewed; guarded release candidate |
| 2020 | `precinct` | 3,065 | 2,662 | 403 | 7,986 | 3,201,711 | 5,524,802 | Reviewed; guarded release candidate |
| 2024 | `precinct` | 2,908 result units | 2,659 candidate features | 250 | Not in release | Not in release | Not in release | Blocked and excluded |

The three-election release contains 9,285 reporting units, 24,174 candidate
result rows, 8,058 polygons, and 9,285 reviewed relationship records. Exactly
8,058 relationships link one geographic result unit to one polygon; the other
1,227 retain official result units as explicitly non-geographic. The candidate
contains no zero-vote units and no unjoined delivery features.

The delivery package contains 300 county-scoped GeoJSON objects (100 per
election) and three year indexes, for 303 immutable objects. Geometry delivery
contains identifiers and review metadata only, never election values.

## Source and interpretation notes

- NCSBE is the sole vote authority for all three released years.
- The 2012 result artifact is official NCSBE VTD analysis data. NCSBE documents
  residence-based reassignment of accepted absentee and provisional ballots
  and statutory statistical noise, so it is not described as the certified
  canvass presentation. MGGG/North Carolina General Assembly geometry is
  retained with its ODbL/DBCL terms; its election fields are stripped.
- The 2016 layer uses the final retained official NCSBE boundary snapshot before
  November 8, 2016. Its 505 result-only units remain non-geographic.
- The 2020 layer uses the official October 18 snapshot, one reviewed multipart
  dissolve, and four restored units from the official August 27, 2019 snapshot.
  Older units are clipped to county coverage and subtracted from containing
  current features before insertion. All 403 official `Real Precinct=N` units
  remain non-geographic. No third-party allocated result is used.
- The 2024 crosswalk is retained as a candidate, but three restored 2019
  polygons lack public evidence that they were applicable on November 5, 2024.
  The release plan, database load, delivery, static activation, and publication
  tooling therefore reject 2024.

Every retained input and derived artifact records its authority, URL, local
path, SHA-256, byte count, election year, reporting grain, and caveats in the
per-election source evidence.

## Deterministic source-package replay

From a clean checkout, run:

```powershell
npm.cmd run precinct-gis:collect:nc
npm.cmd run test:precinct-geometry:nc
```

The suite replays the source builder in an isolated root and must reproduce the
normalized geometry, official result package, relationship records, report,
manifest, and source-evidence bytes. It also covers the guarded local database,
candidate, production evidence, Blob plan, static activation, API gate,
publication, rollback, and recovery contracts.

## Guarded local rehearsal and candidate sealing

Use only the fixed loopback Docker clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:plan:nc
npm.cmd run precinct-gis:setup:nc:local
npm.cmd run precinct-gis:validate:nc:local

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL

npm.cmd run precinct-gis:release-candidate:nc
npm.cmd run precinct-gis:release-candidate:nc:write
```

The validation report is `.etl/local-db/nc-local-gis-validation.json`. It must
show zero invalid constraints, three blocked geography versions, the exact
counts above, `publicDeliveryAuthorized: false`, and no 2024 release row.
Record the content-addressed candidate path and SHA-256 as `$PKG` and
`$PKG_SHA`. Candidate generation changes no production database, Blob object,
canonical manifest, deployment, or public eligibility state.

## Production evidence and hidden load

Use a clean checkout of the exact reviewed commit. Supply exactly one explicit
unpooled URL through `POSTGRES_URL_NON_POOLING` or
`POSTGRES_DATABASE_URL_UNPOOLED`; these tools deliberately do not load
`.env.local`.

Run the read-only preflight before the full backup:

```powershell
npm.cmd run precinct-gis:production-preflight:nc -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run precinct-gis:production-preflight:nc -- --package=$PKG --connect-read-only
```

Retain the preflight path, SHA-256, database identity, public revision, and
64-hex endpoint fingerprint. The initial-load path rejects preexisting rows for
the three-election North Carolina release.

Create and restore-verify the complete public-schema backup strictly after the
preflight:

```powershell
npm.cmd run precinct-gis:production-backup:nc -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_NC_LOCAL_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_NC_LOCAL_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT='<preflight endpoint fingerprint>'
npm.cmd run precinct-gis:production-backup:nc -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

The backup must prove an exact PostgreSQL 17 restore, identical table and row
sets, read-only default, and zero invalid constraints. Preflight and backup
evidence must both still be within four hours when the hidden transaction
begins.

Generate an immutable `NO_GO_PRODUCTION` authorization template:

```powershell
npm.cmd run precinct-gis:production-release:nc -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

A completed `GO_PRODUCTION` record pins the evidence and retains exactly these
scopes:

- `apply_migration_0009`
- `load_nc_local_results_and_geometry_hidden`
- `increment_public_data_revision`

Record the authorization path and SHA-256 as `$AUTH` and `$AUTH_SHA`, then run
the coupled migration and hidden load:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID='<authorization ID>'
$env:CRM_NC_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:nc -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

One transaction applies migration 0009 if necessary, loads and validates all
three elections, stores the exact audit evidence, and increments the public
revision. Every geography version and result unit remains blocked with
`publicDeliveryAuthorized=false`. Preserve the immutable
`COMMITTED_HIDDEN_NOT_PUBLIC` receipt. If commit acknowledgement or receipt
writing is ambiguous, preserve the `.pending` marker and use the command's
hash-authorized `--recover-receipt` mode under
`CRM_DATABASE_ENVIRONMENT=production-read-only`; never rerun the write.

## Immutable Blob delivery

Plan first, then separately authorize exactly 303 content-addressed objects:

```powershell
npm.cmd run precinct-gis:delivery-publish:nc -- --package=$PKG --package-sha256=$PKG_SHA

$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run precinct-gis:delivery-publish:nc -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher writes all 300 county objects before the three indexes, refuses
overwrites and random suffixes, downloads every public object again, and
verifies its hash. Preserve the Blob evidence path, SHA-256, and single
credential-free HTTPS `deliveryOrigin`.

## Static activation, deployment, and public cutover

Static activation is a separate reviewed Git change:

```powershell
npm.cmd run precinct-gis:public-activation:nc -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:nc -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The writer changes exactly four tracked files: the canonical manifest registry
plus the 2012, 2016, and 2020 coverage inventories. It never adds 2024. Do not
merge this activation until the hidden load, immutable Blob publication,
delivery origin, and deployment sequence are ready.

1. Record the currently promoted, gate-capable rollback deployment and verify
   both North Carolina APIs are closed while the database is blocked.
2. Configure the exact Blob origin for Preview; deploy the activation tree to a
   protected Preview and verify its commit, tree, and closed gates.
3. Configure the same origin for Production; merge the exact activation tree to
   `main`, await READY/PROMOTED, and again verify both gates are closed.
4. Build the publication plan and immutable `NO_GO_PUBLIC` template:

```powershell
npm.cmd run precinct-gis:publication-status:nc -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-plan

npm.cmd run precinct-gis:publication-status:nc -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-authorization-template
```

The completed `GO_PUBLIC` record pins the exact activation deployment and tree,
both closed-gate observations, Blob origin, static outputs, and rollback target.
Run the final database transaction only with all exact acknowledgements:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_NORTH_CAROLINA_LOCAL_PUBLIC_CUTOVER'
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PUBLICATION_PLAN_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA
$env:CRM_NC_LOCAL_GEOGRAPHY_PUBLICATION_ACTIVATION_ID='<activation ID>'

npm.cmd run precinct-gis:publication-status:nc -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLICATION_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That atomic transaction publishes exactly three geography versions, authorizes
the 8,058 linked geographic result units, verifies all 9,285 reviewed
relationships and 8,058 features, and increments the public revision once.

## Post-cutover checks

For 2012 use `level=vtd`; for 2016 and 2020 use `level=precinct`. Across several
county GEOIDs verify:

- the manifest endpoint returns exactly one eligible year/grain manifest;
- the parent-scoped geography endpoint returns the expected GeoJSON;
- the results endpoint returns database-backed rows that join one-for-one to
  the colorable features;
- administrative rows never appear as polygons;
- 2024 has no public manifest or delivery;
- the base map is OpenStreetMap and Exports & API links keep the selected year.

Run the production API smoke against the exact deployed Git SHA with
`--expect-source=database`, and preserve its evidence with the publication
receipt.

## Rollback and authorization status

Rollback requires a new hash-pinned `GO_ROLLBACK` authorization bound to the
exact successful publication receipt. Block the database first while the
gate-capable application remains live, verify both endpoints close, and only
then restore the deployment pinned in that receipt. Publication receipt
recovery is read-only and cannot replay the initial write or rollback.

This implementation and local rehearsal authorize no production database
write, Blob upload, Vercel environment change, deployment, canonical
activation, or public transition. All three candidate years remain blocked
until the complete sequence is separately executed; 2024 remains outside the
release.
