# Wisconsin local-reporting-unit GIS runbook

## Scope and terminology

Wisconsin Elections Commission workbooks report combinations such as a
municipality and one or more wards. Those combinations are election reporting
units, but they are not uniformly individual precinct or ward polygons. The
normalized geography level is therefore `local_reporting_unit`, not
`precinct` or `ward`.

The package enforces four rules:

1. Every displayed vote comes only from the retained official WEC/GAB
   presidential workbook.
2. No official result is divided, proportionally allocated, or copied onto
   multiple polygons.
3. Secondary packages contribute reviewed geometry only; every secondary vote
   field is discarded before normalized output is written.
4. A missing or ambiguous relationship remains a no-data shape or a
   reconciliation-only non-geographic unit rather than receiving inferred
   votes or geometry.

Each election keeps its own boundary vintage. These layers support accurate
display of that election; they do not claim that same-named units are
unchanged, or directly comparable, across redistricting cycles.

## Retained status

| Year | Official result units | Geographic units | Geographic zero-vote units | Non-geographic zero-vote units | Geometry features | No-data features | Presidential votes | Release status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | 3,525 | 0 approved | Not classified for release | Not classified for release | 0 approved | 0 | 3,047,999 | Blocked and excluded |
| 2016 | 3,636 | 3,626 | 126 | 10 | 3,648 | 22 | 2,976,150 | Reviewed; guarded release candidate |
| 2020 | 3,698 | 3,696 | 190 | 2 | 3,705 | 9 | 3,298,041 | Reviewed; guarded release candidate |
| 2024 | 3,603 | 3,503 | 0 | 100 | 3,503 | 0 | 3,422,918 | Reviewed; guarded release candidate |

The three-election release contains 10,937 official reporting units, 32,475
candidate-result rows, 10,856 polygons, and 10,937 reviewed relationship
records. Of those relationships, 10,825 link a geographic result unit to one
polygon and 112 retain an official zero-vote unit as explicitly
non-geographic. The 31 additional source polygons are intentionally delivered
as no-data shapes. Within the mapped geographic set, 316 official units report
zero presidential votes and remain visible as zero-vote outcomes.

The 2012 WEC/GAB result rows are retained and reconciled, but the LTSB evidence
does not provide an approved election-effective, vote-preserving relationship
between those rows and polygons. LTSB's contextual election fields were
population-disaggregated and cannot be substituted for the official result
rows. The tooling rejects 2012 from the release plan, database load, delivery,
and activation rather than backcasting or allocating it.

## Sources and terms

- Wisconsin Elections Commission/Government Accountability Board workbooks
  are the sole source of displayed presidential values in every year.
- The 2016 election-specific VEST geometry is retained under version-pinned CC
  BY 4.0 evidence. Its reconstruction uses Wisconsin LTSB boundaries and
  Wisconsin Department of Administration municipal-change records. All VEST
  vote fields are discarded.
- The 2020 election-specific VEST geometry is retained under version-pinned CC
  BY 4.0 evidence. It reconciles LTSB Fall 2020 and later ward information.
  All VEST vote fields are discarded.
- The 2024 New York Times package supplies features marked
  `official_boundary=true` under retained C-UDA v1.0 non-commercial
  attribution terms. Its election values are used only to prove an exact
  identity against WEC, then discarded. Public delivery must preserve the
  applicable attribution and terms.
- The official LTSB 2012 evidence remains diagnostic only. It is not promoted
  into a public election layer.

Every retained input and derived artifact records its source authority, URL,
local path, SHA-256, byte count, election year, reporting grain, and caveats in
the per-election source evidence.

## Deterministic source-package replay

Run the reviewed source-package suite from a clean checkout:

```powershell
npm.cmd run precinct-gis:build:wi
npm.cmd run test:precinct-geometry:wi
```

The test replays the builder in an isolated root and must reproduce the
normalized geometry, official result package,
crosswalk, report, manifest, and source-evidence bytes for all four retained
years. Tests prove that geometry contains no election values, that official
totals are exact, that every reviewed relation is county-scoped, and that 2012
remains blocked.

## Guarded three-election release

The release candidate is limited to 2016, 2020, and 2024. It contains 216
county-scoped GeoJSON objects (72 per election) and three year indexes, for 219
immutable delivery artifacts. It never includes the 2012 manifest or data.

The application, database, manifests, delivery files, API requests, and UI
labels all retain `local_reporting_unit`. Wisconsin is gated only at that
exact grain. Hidden Wisconsin rows cannot be returned by the results API, and
an eligible static manifest cannot be served by the geography API, until the
same exact database release is published.

### Local database validation and package sealing

Use only the fixed loopback Docker clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run local-gis:plan:wi -- --years=2016,2020,2024
npm.cmd run local-gis:setup:wi:local -- --years=2016,2020,2024
npm.cmd run local-gis:validate:wi:local -- --years=2016,2020,2024 --report=.etl/local-db/wi-public-local-gis-validation.json

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL

npm.cmd run local-gis:release-candidate:wi
npm.cmd run local-gis:release-candidate:wi:write
```

Record the content-addressed package path and full SHA-256 as `$PKG` and
`$PKG_SHA`. Package generation changes no production database, Blob object,
canonical manifest, Vercel setting, or public eligibility state.

### Static activation candidate

Static activation is a separate reviewed Git change:

```powershell
npm.cmd run local-gis:public-activation:wi -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run local-gis:public-activation:wi -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The writer changes exactly four tracked files: the canonical manifest registry
and the 2016, 2020, and 2024 coverage inventories. It preflights all outputs,
stages replacements, and restores prior bytes on failure. It never adds the
2012 manifest. Do not merge that activation change until the hidden load,
immutable Blob publication, delivery origin, and deployment sequence below
are ready. Merging `main` automatically deploys Production on this project.

### Production evidence and hidden load

Use a clean checkout of the exact reviewed commit. Supply exactly one explicit
unpooled URL in `POSTGRES_URL_NON_POOLING` or
`POSTGRES_DATABASE_URL_UNPOOLED`; these commands do not load `.env.local`.

Run the read-only preflight before the backup:

```powershell
npm.cmd run local-gis:production-preflight:wi -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_WI_LOCAL_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run local-gis:production-preflight:wi -- --package=$PKG --connect-read-only
```

Retain the preflight path, SHA-256, database identity, and 64-hex endpoint
fingerprint. The initial-load path rejects preexisting Wisconsin release rows.
Create and restore-verify the full public-schema backup strictly after that
preflight:

```powershell
npm.cmd run local-gis:production-backup:wi -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_WI_LOCAL_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_WI_LOCAL_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT='<preflight endpoint fingerprint>'
npm.cmd run local-gis:production-backup:wi -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the backup manifest and SHA-256. It must prove an exact PostgreSQL 17
restore, matching table and row sets, read-only default, and zero invalid
constraints. Both preflight and backup evidence must still be fresh when the
hidden-load transaction begins.

Generate an immutable NO-GO authorization template:

```powershell
npm.cmd run local-gis:production-release:wi -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

A completed `GO_PRODUCTION` record identifies the owner, uses a unique active
authorization ID, pins both evidence hashes, and retains exactly these scopes:

- `apply_migration_0009`
- `load_wi_local_reporting_results_and_geometry_hidden`
- `increment_public_data_revision`

Record its path and SHA-256 as `$AUTH` and `$AUTH_SHA`, then run the coupled
migration and hidden load:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_WI_LOCAL_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID='<authorization ID>'
$env:CRM_WI_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run local-gis:production-release:wi -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

One transaction applies migration 0009 if needed, loads and validates all
three elections, stores the exact audit evidence, and increments the public
revision. Every geography version and reporting unit remains blocked with
`publicDeliveryAuthorized=false`. Preserve the immutable
`COMMITTED_HIDDEN_NOT_PUBLIC` receipt. If commit acknowledgement or receipt
writing is ambiguous, preserve the `.pending` marker and use the command's
hash-authorized `--recover-receipt` mode under
`CRM_DATABASE_ENVIRONMENT=production-read-only`; never rerun the write.

### Immutable Blob delivery

Plan first, then authorize exactly 219 content-addressed objects:

```powershell
npm.cmd run local-gis:delivery-publish:wi -- --package=$PKG --package-sha256=$PKG_SHA

$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run local-gis:delivery-publish:wi -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher writes all 216 county objects before the three indexes, refuses
overwrites and random suffixes, redownloads every public object, and verifies
its hash. Preserve the Blob evidence path, SHA-256, and its single
credential-free HTTPS `deliveryOrigin`.

### Deployment and atomic public cutover

1. Record the exact currently promoted, gate-capable rollback deployment and
   verify both Wisconsin APIs are closed while the database is blocked.
2. Configure the exact Blob origin for Preview, deploy the static activation
   tree to a protected Preview, and verify its commit/tree and closed gates.
3. Configure the same origin for Production, merge the exact activation tree
   to `main`, await READY/PROMOTED, and verify both gates are still closed.
4. Build the publication plan and NO-GO authorization template from the exact
   hidden receipt and Blob evidence:

```powershell
npm.cmd run local-gis:publication-status:wi -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-plan

npm.cmd run local-gis:publication-status:wi -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-authorization-template
```

The completed `GO_PUBLIC` record pins the exact READY/PROMOTED activation
deployment, its Git tree, both closed-gate observations, and the recorded
rollback deployment. It retains exactly these scopes:

- `publish_wi_local_geography_versions`
- `authorize_wi_local_results`
- `increment_public_data_revision`

The final database transaction is the public cutover:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_WISCONSIN_LOCAL_PUBLIC_CUTOVER'
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PUBLICATION_PLAN_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA
$env:CRM_WI_LOCAL_GEOGRAPHY_PUBLICATION_ACTIVATION_ID='<activation ID>'

npm.cmd run local-gis:publication-status:wi -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLICATION_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That transaction publishes the exact three geography versions, authorizes
only the 10,825 linked geographic result units, verifies all 10,937 reviewed
relationships and 10,856 features, checks exact result/source/import
postconditions, and increments the public revision. Then verify 2016, 2020,
and 2024 through both APIs and the live map. Confirm that 2012 remains
unavailable.

### Rollback and authorization status

Rollback requires a new `GO_ROLLBACK` authorization bound to the exact
successful publication receipt. It blocks the database first while the
gate-capable application remains live, verifies both public endpoints are
closed, and only then restores the deployment pinned in that receipt. The
publication tool also provides read-only receipt recovery for an ambiguous
commit; it cannot replay the write.

This implementation and its local validation authorize no production write,
Blob upload, Vercel environment change, deployment, canonical activation, or
public database transition. All three candidate years remain blocked until
the complete sequence is separately reviewed and executed. Wisconsin 2012
remains outside the release.
