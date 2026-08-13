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

## Guarded three-election release

The release candidate is limited to 2016, 2020, and 2024. It contains 1,542
reporting units, 4,626 candidate-result rows, 1,542 polygons, 1,542 reviewed
relationships, 48 county-scoped GeoJSON files, and three indexes. The 2020
package preserves its one official zero-vote unit. The tooling rejects 2012
rather than silently dropping its five unmatched rows or weakening its source
and license gates. Resolving 2012 remains tracked in
[GitHub issue #230](https://github.com/Camreyn/civicresultmaps/issues/230).

The application, database, manifests, immutable delivery, and user-facing
labels all retain `local_reporting_unit`. Maine is now part of the guarded
publication contract, but only at that exact grain. A hidden Maine row cannot
be surfaced by the results API, and a static manifest cannot be served by the
geography API, until the same exact database release is published.

### Local database validation and package sealing

Use only the fixed loopback Docker clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run local-gis:plan:me -- --years=2016,2020,2024
npm.cmd run local-gis:setup:me:local -- --years=2016,2020,2024
npm.cmd run local-gis:validate:me:local -- --years=2016,2020,2024 --report=.etl/local-db/me-public-local-gis-validation.json

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL

npm.cmd run local-gis:release-candidate:me
npm.cmd run local-gis:release-candidate:me:write
```

Record the content-addressed package path and full SHA-256 as `$PKG` and
`$PKG_SHA`. Generation changes no production database, Blob object, canonical
manifest, Vercel setting, or public eligibility state.

### Static activation candidate

Static activation is a separate reviewed Git change:

```powershell
npm.cmd run local-gis:public-activation:me -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run local-gis:public-activation:me -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The writer changes exactly four tracked files: the canonical registry and the
2016, 2020, and 2024 coverage inventories. It preflights all four outputs,
stages them before replacement, and restores prior bytes on failure. It never
adds the 2012 manifest. Do not merge that activation change until the hidden
load, immutable Blob publication, delivery origin, and production deployment
sequence below are ready. Merging `main` automatically deploys Production on
this project.

### Production evidence and hidden load

Use a clean checkout of the exact reviewed commit. Supply exactly one explicit
unpooled URL in `POSTGRES_URL_NON_POOLING` or
`POSTGRES_DATABASE_URL_UNPOOLED`; none of these commands loads `.env.local`.

Run the read-only preflight before the backup:

```powershell
npm.cmd run local-gis:production-preflight:me -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_ME_LOCAL_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run local-gis:production-preflight:me -- --package=$PKG --connect-read-only
```

Retain the preflight path, SHA-256, database identity, and 64-hex endpoint
fingerprint. The initial-load path rejects preexisting Maine local-release
rows. Create and restore-verify the full public-schema backup strictly after
that preflight:

```powershell
npm.cmd run local-gis:production-backup:me -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_ME_LOCAL_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_ME_LOCAL_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT='<preflight endpoint fingerprint>'
npm.cmd run local-gis:production-backup:me -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the backup manifest and SHA-256. It must prove an exact PostgreSQL 17
restore, matching table and row sets, read-only default, and zero invalid
constraints. Both preflight and backup evidence must still be fresh when the
hidden-load transaction begins.

Generate an immutable NO-GO authorization template:

```powershell
npm.cmd run local-gis:production-release:me -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

A completed `GO_PRODUCTION` record identifies the owner, uses a unique active
authorization ID, pins both evidence hashes, and retains exactly these scopes:

- `apply_migration_0009`
- `load_me_local_reporting_results_and_geometry_hidden`
- `increment_public_data_revision`

Record its path and SHA-256 as `$AUTH` and `$AUTH_SHA`, then run the coupled
migration and hidden load:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_ME_LOCAL_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID='<authorization ID>'
$env:CRM_ME_LOCAL_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run local-gis:production-release:me -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
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

Plan first, then authorize exactly 51 content-addressed objects:

```powershell
npm.cmd run local-gis:delivery-publish:me -- --package=$PKG --package-sha256=$PKG_SHA

$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run local-gis:delivery-publish:me -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher writes all 48 county objects before the three indexes, refuses
overwrites and random suffixes, redownloads every public object, and verifies
its hash. Preserve the Blob evidence path, SHA-256, and its single
credential-free HTTPS `deliveryOrigin`.

### Deployment and atomic public cutover

1. Record the exact currently promoted, gate-capable rollback deployment and
   verify both Maine APIs are closed while the database is blocked.
2. Configure the exact Blob origin for Preview, deploy the static activation
   tree to a protected Preview, and verify its commit/tree and closed gates.
3. Configure the same origin for Production, merge the exact activation tree
   to `main`, await READY/PROMOTED, and verify both gates are still closed.
4. Build the publication plan and NO-GO authorization template from the exact
   hidden receipt and Blob evidence:

```powershell
npm.cmd run local-gis:publication-status:me -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-plan

npm.cmd run local-gis:publication-status:me -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-authorization-template
```

The completed `GO_PUBLIC` record pins the exact READY/PROMOTED activation
deployment, its Git tree, the closed-gate observations, and the previously
recorded rollback deployment. It retains exactly these scopes:

- `publish_me_local_geography_versions`
- `authorize_me_local_results`
- `increment_public_data_revision`

The final database transaction is the public cutover:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_MAINE_LOCAL_PUBLIC_CUTOVER'
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PUBLICATION_PLAN_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA
$env:CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_ACTIVATION_ID='<activation ID>'

npm.cmd run local-gis:publication-status:me -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLICATION_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That transaction publishes the exact three geography versions, authorizes
only their linked local result units, checks all postconditions, and increments
the public revision. Then verify 2016, 2020, and 2024 through both APIs and the
live map. Confirm that 2012 remains unavailable.

### Rollback and current authorization status

Rollback requires a new `GO_ROLLBACK` authorization bound to the exact
successful publication receipt. It blocks the database first while the
gate-capable application remains live, verifies both public endpoints are
closed, and only then restores the deployment pinned in that receipt. The
publication tool also provides read-only receipt recovery for an ambiguous
commit; it does not permit replaying the write.

This implementation and its local validation authorize no production write,
Blob upload, Vercel environment change, deployment, canonical activation, or
public database transition. All three candidate years remain blocked until the
complete sequence is separately reviewed and executed. Maine 2012 remains
outside the release.
