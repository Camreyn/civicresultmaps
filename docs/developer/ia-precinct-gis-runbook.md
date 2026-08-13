# Iowa precinct GIS runbook

This runbook covers Iowa presidential precinct results and map geometry for
2012, 2016, 2020, and 2024. The guarded public release is limited to 2016,
2020, and 2024. Iowa 2012 remains fail-closed until the incomplete official
county-map archive is replaced by a complete election-effective statewide
boundary set; that acquisition is tracked in
[GitHub issue #223](https://github.com/Camreyn/civicresultmaps/issues/223).

The geometry package contains stable feature and reporting-unit identities.
Displayed vote values always come from the retained Iowa Secretary of State
result artifacts, never from a polygon source.

## Reviewed scope

| Year | Geographic result units | Result rows | Polygon features | Reviewed relationships | Release status | Geometry basis |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 2012 | 1,686 | 5,058 | 0 | 0 | Blocked | Complete official results; only 52 official county map PDFs are retained. The later 2014 layer is diagnostic only. |
| 2016 | 1,680 | 5,040 | 1,680 | 1,680 | Package-ready | Official LSA/SOS election-cycle layer, joined through a hash-pinned reviewed identity bridge. |
| 2020 | 1,661 | 4,983 | 1,661 | 1,661 | Package-ready | VEST election-specific geometry under retained CC BY 4.0 terms, matched exactly to official Iowa results. |
| 2024 | 1,653 | 4,959 | 1,653 | 1,653 | Package-ready | New York Times official-boundary compilation under retained C-UDA v1.0 Non-Commercial terms, matched exactly to official Iowa results. |

The three-election release contains 4,994 reporting units, 14,982 candidate
rows, 4,994 polygons, 4,994 exact one-to-one crosswalks, zero unmatched units,
and zero zero-vote units. Every released year covers all 99 counties. The
immutable delivery set contains 297 county files followed by three indexes.

One all-zero Dallas `ABSENTEE` row in the 2012 source is retained as
non-geographic context and is never assigned a polygon. No later precinct is
backcast and no result identity or vote value is invented.

## Deterministic replay

From a clean checkout:

```powershell
npm.cmd run precinct-gis:replay:ia:2012
npm.cmd run precinct-gis:replay:ia:2016
npm.cmd run precinct-gis:replay:ia:2020
npm.cmd run precinct-gis:replay:ia:2024
npm.cmd run precinct-gis:finalize:ia
npm.cmd run test:precinct-geometry:ia
```

The four result collectors check byte-identical normalized output. Finalization
rehashes the reviewed evidence, normalized geometry, crosswalks, and canonical
blocked manifests. It must leave 2012 blocked.

## Local database validation and package sealing

Use only the fixed loopback Docker clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:setup:ia:local -- --years=2016,2020,2024
npm.cmd run precinct-gis:validate:ia:local -- --years=2016,2020,2024 --report=.etl/local-db/ia-public-precinct-gis-validation.json

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:CRM_DATABASE_LOCAL_WRITES,Env:DATABASE_URL

npm.cmd run precinct-gis:readiness:ia
npm.cmd run precinct-gis:release-candidate:ia
npm.cmd run precinct-gis:release-candidate:ia:write
```

Record the emitted content-addressed package path and full SHA-256 as `$PKG`
and `$PKG_SHA`. The package contains three public-eligible draft manifests,
three indexes, 297 county files, and the package document. Generation performs
no production database, Blob, Git, Vercel, or public-eligibility mutation.

## Guarded static activation change

Static activation is a separate reviewed Git change:

```powershell
npm.cmd run precinct-gis:public-activation:ia -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:ia -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The writer changes exactly four tracked files: the canonical manifest registry
and the 2016, 2020, and 2024 coverage inventories. It stages every output before
renaming and restores prior bytes if a later write fails. It never inserts the
blocked 2012 manifest. Both public APIs remain closed because the matching
database geography versions are still blocked.

Do not merge the activation change until the hidden load, immutable Blob
publication, exact delivery origin, and production deployment sequence below
are ready. On this Vercel project, merging `main` is the production deployment
action.

## Production evidence and hidden load

Use a clean checkout of the exact reviewed commit and exactly one explicit
unpooled production URL in `POSTGRES_URL_NON_POOLING` or
`POSTGRES_DATABASE_URL_UNPOOLED`. Do not load `.env.local`.

### 1. Read-only preflight

```powershell
npm.cmd run precinct-gis:production-preflight:ia -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_IA_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run precinct-gis:production-preflight:ia -- --package=$PKG --connect-read-only
```

Retain the preflight path, SHA-256, database name, and 64-hex endpoint
fingerprint. The initial-load path rejects preexisting Iowa precinct release
rows.

### 2. Full public-schema backup and restore proof

The backup must be created strictly after the preflight. Both artifacts must
remain within the guarded evidence window.

```powershell
npm.cmd run precinct-gis:production-backup:ia -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_IA_PRECINCT_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_IA_PRECINCT_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_IA_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT='<preflight endpoint fingerprint>'
npm.cmd run precinct-gis:production-backup:ia -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the backup manifest and its SHA-256. It must prove an exact PostgreSQL 17
restore, exact table and row counts, read-only default, and zero invalid
constraints.

### 3. Sole-owner hidden-load authorization

Generate an immutable NO-GO template:

```powershell
npm.cmd run precinct-gis:production-release:ia -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

The completed record changes the decision to `GO_PRODUCTION`, identifies the
project owner in `approvedBy`, uses a unique authorization ID and active time
window, and retains exactly these scopes:

- `apply_migration_0009`
- `load_ia_precinct_results_and_geometry_hidden`
- `increment_public_data_revision`

Record its path and SHA-256 as `$AUTH` and `$AUTH_SHA`.

### 4. Coupled migration and hidden load

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_IA_PRECINCT_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_IA_PRECINCT_PRODUCTION_AUTHORIZATION_ID='<authorization ID>'
$env:CRM_IA_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:ia -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

One transaction applies migration 0009 if needed, loads all three years,
validates the exact release and durable audit metadata, and increments the
public revision. Every geography version and reporting unit remains blocked
with `publicDeliveryAuthorized=false`. Preserve the immutable
`COMMITTED_HIDDEN_NOT_PUBLIC` receipt.

If the connection fails after the transaction body completes, do not rerun the
write. Preserve the `.pending` marker and use the command's hash-authorized
`--recover-receipt` mode in `production-read-only`; it verifies durable database
state and cannot perform another load:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_IA_PRECINCT_HIDDEN_RECEIPT_RECOVERY=$PKG_SHA
$env:CRM_IA_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:ia -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --recover-receipt
```

## Immutable Blob delivery

Plan first, then authorize the exact 300 content-addressed objects:

```powershell
npm.cmd run precinct-gis:delivery-publish:ia -- --package=$PKG --package-sha256=$PKG_SHA

$env:CRM_IA_PRECINCT_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_IA_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_IA_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run precinct-gis:delivery-publish:ia -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher writes all 297 county objects before the three indexes, refuses
overwrites or random suffixes, downloads every object again, and verifies its
hash. Preserve the Blob evidence path, SHA-256, and one credential-free HTTPS
`deliveryOrigin`.

## Deployment and atomic public cutover

1. Set `CRM_PRECINCT_GEOGRAPHY_ORIGIN` to the exact Blob `deliveryOrigin` for
   Preview only and create a fresh protected preview deployment of the static
   activation commit.
2. Confirm its Git SHA and verify both Iowa endpoints remain closed while the
   database rows are blocked.
3. Set the same origin for Production, merge the exact activation tree to
   `main`, and wait for its production deployment to be READY and PROMOTED.
4. Again verify precinct results are empty and precinct geography returns 404.
5. Build the database-publication plan from the exact hidden receipt and Blob
   evidence:

```powershell
npm.cmd run precinct-gis:publication-status:ia -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-plan

npm.cmd run precinct-gis:publication-status:ia -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --write-authorization-template
```

Complete the publication authorization as `GO_PUBLIC`, pin the READY/PROMOTED
production deployment and blocked-gate observations, and retain exactly these
scopes:

- `publish_ia_geography_versions`
- `authorize_ia_precinct_results`
- `increment_public_data_revision`

The final write requires all exact hash acknowledgements:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_IA_PRECINCT_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_IOWA_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_IA_PRECINCT_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_IA_PRECINCT_PUBLICATION_PLAN_SHA256=$PUBLICATION_PLAN_SHA
$env:CRM_IA_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA
$env:CRM_IA_PRECINCT_PUBLICATION_ACTIVATION_ID='<activation ID>'

npm.cmd run precinct-gis:publication-status:ia -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLICATION_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That single database transaction is the public cutover. It publishes the exact
three geography versions, authorizes only the linked Iowa reporting units,
verifies all postconditions, and increments the public revision. It performs no
Git, Blob, environment, or deployment mutation.

Afterward verify 2016, 2020, and 2024 in both `/api/results` and
`/api/precinct-geography`, then check the live map. Confirm that 2012 remains
unavailable and issue #223 remains open.

## Rollback

This implementation does **not** ship an executable, receipt-bound public
rollback transaction. The full-schema backup is disaster-recovery evidence;
it is not a substitute for a reviewed row-scoped rollback command. Therefore
`GO_PUBLIC` is a hard stop until a separate change implements and tests all of
the following:

- one authorization bound to the exact successful Iowa publication receipt;
- one atomic transaction that blocks the three geography versions and linked
  reporting units together, preserving the original publication audit;
- exact postconditions and read-only recovery for an ambiguous commit; and
- a pinned gate-capable application deployment and fail-closed rollback order.

Before `GO_PUBLIC`, a failed preview, deployment, or Blob check simply stops the
release while the database remains blocked. Do not improvise manual SQL, treat
the full backup as an ordinary rollback, or claim that a public cutover is
reversible with the tooling in this change.

## Current authorization status

This implementation and its local rehearsals authorize no production write,
Blob upload, Vercel environment change, deployment, canonical activation, or
public database transition. Hidden-load and publication tooling remain
fail-closed; the missing executable public rollback is an additional required
gate before any `GO_PUBLIC` authorization.
