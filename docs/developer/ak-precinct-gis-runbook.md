# Alaska precinct GIS runbook

## Scope and comparison semantics

This package covers the 2012, 2016, 2020, and 2024 presidential general
elections at Alaska's election-specific precinct grain. The web delivery is
parent-scoped by Alaska State House District (`HD01` through `HD40`), not by
borough or census area.

Each election keeps its own boundary vintage. Precinct IDs and polygons are
not assumed to describe the same land or voters across elections. The four
maps are therefore accurate snapshots of their respective elections, but they
are not an automatic apples-to-apples precinct trend series. Any common-
geography comparison must be a separate, reviewed crosswalk or areal
translation with disclosed split/merge handling.

Alaska reports absentee, early-voting, questioned-ballot, and federal-overseas
votes in separate administrative buckets. The pipeline retains every bucket
and reconciles it to the official statewide totals, but never assigns one to a
precinct polygon. Consequently, visible precinct votes do not sum to the
statewide certified total; the unpainted difference is explicit rather than
estimated.

## Reviewed source universes

| Year | Geographic precincts | Non-geographic units | Total source units | Mapped presidential votes | Official presidential total | Geometry |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | 438 | 120 | 558 | 203,048 | 300,495 | April 5, 2012 amended-proclamation plan, retained through a commit-pinned public mirror |
| 2016 | 441 | 121 | 562 | 197,924 | 318,608 | Official 2013 redistricting-plan precinct export |
| 2020 | 441 | 121 | 562 | 156,462 | 359,530 | Official 2013 redistricting-plan precinct export |
| 2024 | 402 | 121 | 523 | 173,953 | 338,177 | Official 2023 final-plan precinct export |

Displayed votes come only from Alaska Division of Elections artifacts. The
2012 mirror contributes polygon custody only. Its source DBF's `36-616` typo is
corrected to official result ID `36-040` only after the collector proves the
feature is Lake Iliamna No. 1 and matches the official 2013 successor feature's
topology, area, and population. The mirror states no formal license, so that
secondary custody and reuse limitation remain visible in provenance and map
caveats.

The 2020 text export omits write-ins. The collector parses all 41 official
Statement of Votes Cast PDFs to restore them before reconciliation. The 2024
presidential export reconciles exactly; its U.S. House comparison omits 750
statewide write-ins and is retained only as disclosed named-candidate context.

## Deterministic collection

From a clean checkout:

```powershell
npm.cmd run precinct-gis:collect:ak:2012
npm.cmd run precinct-gis:collect:ak:2016
npm.cmd run precinct-gis:collect:ak:2020
npm.cmd run precinct-gis:collect:ak:2024
npm.cmd run test:precinct-geometry:ak
```

Each election directory under `data/precinct-geometry/AK/` contains a canonical
blocked manifest, retained source evidence, normalized geometry, normalized
official results, a reviewed relationship package, and a reconciliation
report. Replay must reproduce all derived bytes. Geometry contains source and
CRM identity metadata only—never candidate names, parties, or vote values.

## Guarded four-election package

The deterministic release candidate contains:

- 2,205 reporting units: 1,722 geographic precincts and 483 explicit
  non-geographic administrative units;
- 12,021 mapped presidential candidate rows;
- 1,722 delivery polygons and 2,205 reviewed relationships;
- 160 House-District-scoped GeoJSON objects and four indexes; and
- two geographic zero-vote precincts retained as valid shapes.

The package is `NO_GO_PRODUCTION`. Building it does not contact production,
upload Blob data, change the canonical registry, or authorize public delivery.

### Local clone validation and sealing

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:plan:ak
npm.cmd run precinct-gis:setup:ak:local
npm.cmd run precinct-gis:validate:ak:local

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL

npm.cmd run precinct-gis:release-candidate:ak
npm.cmd run precinct-gis:release-candidate:ak:write
```

Record the resulting package path as `$PKG` and its full SHA-256 as
`$PKG_SHA`. The validated post-load counts must be 2,205 reporting units,
12,021 result rows, four blocked geography versions, 1,722 features, 2,205
reviewed relationships, and zero invalid constraints.

### Production preflight, backup, and hidden load

Use a clean checkout of the exact reviewed commit and exactly one explicit
unpooled production URL. These commands deliberately do not load `.env.local`.

```powershell
npm.cmd run precinct-gis:production-preflight:ak -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_AK_PRECINCT_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run precinct-gis:production-preflight:ak -- --package=$PKG --connect-read-only
```

The preflight must prove the Alaska target rows are absent and retain its path,
SHA-256, database identity, and endpoint fingerprint. Create the full public-
schema backup strictly after that preflight:

```powershell
npm.cmd run precinct-gis:production-backup:ak -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_AK_PRECINCT_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_AK_PRECINCT_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_AK_PRECINCT_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT='<preflight endpoint fingerprint>'
npm.cmd run precinct-gis:production-backup:ak -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

The backup must be PostgreSQL 17 compatible, restore-verified, exact in table
and row sets, read-only by default, and free of invalid constraints. Preflight
and backup evidence expire after four hours.

Generate and complete the immutable `NO_GO_PRODUCTION` authorization template.
Its exact scopes are:

- `apply_migration_0009`
- `load_ak_precinct_results_and_geometry_hidden`
- `increment_public_data_revision`

Then apply the coupled migration/hidden-load transaction with the exact
package, preflight, backup, authorization paths, and SHA-256 values:

```powershell
npm.cmd run precinct-gis:production-release:ak -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

The required write environment is `CRM_DATABASE_ENVIRONMENT=production`, the
exact package hash in `CRM_AK_PRECINCT_GEOGRAPHY_PRODUCTION_WRITES`, and the
exact authorization ID and SHA-256 in their corresponding Alaska variables.
The committed rows remain blocked and `publicDeliveryAuthorized=false`.
Preserve the immutable hidden-load receipt. If commit acknowledgement is
ambiguous, do not retry the write; preserve the `.pending` marker and use the
hash-authorized, production-read-only `--recover-receipt` path.

### Immutable geometry publication

Plan, then explicitly authorize, 164 immutable public objects:

```powershell
npm.cmd run precinct-gis:delivery-publish:ak -- --package=$PKG --package-sha256=$PKG_SHA

$env:CRM_AK_PRECINCT_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_AK_PRECINCT_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_AK_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run precinct-gis:delivery-publish:ak -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher writes all 160 parent objects before the four indexes, refuses
overwrites/random suffixes, downloads each object again, and verifies its hash.
Retain the publication evidence and single credential-free HTTPS origin.

### Static activation and public cutover

Create the static activation candidate from the exact package:

```powershell
npm.cmd run precinct-gis:public-activation:ak -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:ak -- --package=$PKG --package-sha256=$PKG_SHA --write
```

It changes exactly five tracked files: the registry plus the 2012, 2016, 2020,
and 2024 coverage inventories. It does not publish database rows. Configure the
Blob origin in protected Preview, verify the exact commit/tree and both closed
API gates, then configure the same origin in Production. Merging the exact
activation tree to `main` deploys static manifests, but both APIs remain closed
until the database publication transaction.

Build the public plan and authorization template from the exact hidden receipt
and Blob evidence. `GO_PUBLIC` has only these scopes:

- `publish_ak_precinct_geography_versions`
- `authorize_ak_precinct_results`
- `increment_public_data_revision`

The final command uses the same package/evidence inputs plus the exact plan and
authorization SHA-256 values and `--apply`:

```powershell
npm.cmd run precinct-gis:publication-status:ak -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLICATION_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That one database transaction publishes four exact geography versions,
authorizes the linked geographic results and retained release metadata, checks
all postconditions, and increments the public revision. Verify all four years,
all 40 House District choices, geometry API delivery, and results API joins.
Confirm administrative buckets remain absent from map responses.

Rollback requires a separate `GO_ROLLBACK` record bound to the successful
publication receipt. Block the database first while the gate-capable app is
live, verify both endpoints close, and only then restore the pinned prior
deployment. Receipt recovery is read-only and never authorizes replay.
