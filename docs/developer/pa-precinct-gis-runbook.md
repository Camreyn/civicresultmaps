# Pennsylvania precinct GIS release runbook

This runbook covers the guarded Pennsylvania presidential precinct GIS release
path for the exact reviewed partial subsets from 2016 and 2020. It does not
authorize production work. Pennsylvania 2012 and 2024 remain blocked and must
remain absent from the public manifest registry until election-effective
geometry and reviewed result crosswalks exist.

## Reviewed release universe

| Year | Official source units | Loaded result units | Official units consumed | Excluded source units | Result rows | Geometry features | Reviewed no-data features | Displayed official votes | Full official votes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2016 | 9,176 | 8,014 | 8,018 | 1,158 | 24,042 | 9,167 | 1,153 | 5,331,613 | 6,114,296 |
| 2020 | 9,187 | 6,805 | 6,827 | 2,360 | 20,415 | 9,150 | 2,345 | 5,370,341 | 6,916,044 |

Pennsylvania Department of State (DOS) precinct returns are the sole vote
authority. VEST vote fields are stripped before normalized geometry is written.
Every displayed result is an exact complete-vector DOS source unit or an exact
sum of reviewed DOS source components. No vote is copied from VEST, estimated,
proportionally distributed, or spatially allocated.

The retained VEST reconstructions provide election-specific geometry under the
documented CC BY 4.0 database license. The collector restores CRLF only for the
two retained VEST `documentation.txt` files when a Git checkout converts them to
bare LF and the restored bytes exactly match the reviewed SHA-256 pin. All other
raw artifacts must already match their byte pins.

The candidate contains 14,819 reporting units and crosswalks, 44,457 candidate
result rows, 18,317 geometry features, and 3,498 explicit reviewed no-data
features. The 3,518 excluded official source units and their 2,328,386 votes
remain reconciled in source evidence but are not displayed or allocated. The
immutable delivery contains 134 county files and two election indexes: 136
objects. The sealed candidate has 139 files after adding the release document
and two draft manifests.

All 67 county geometry parents are retained for both elections. The 2020 result
subset covers 66 county parents; Pike County (`42103`) has 18 reviewed geometry
features and no mapped result unit, so its delivery must remain entirely
explicit no-data geometry.

## Fail-closed conditions

- The release plan accepts only 2016 and 2020. It rejects 2012, 2024, duplicate
  years, and any unsupported year.
- The canonical 2016 and 2020 source manifests remain
  `validation.status: blocked` with `delivery: null` during candidate
  preparation. The candidate uses separate draft manifests.
- The public registry and coverage inventories remain unchanged until a
  separately reviewed static activation change.
- The results and geometry APIs remain closed until both the static deployment
  and final database publication transaction are proven.
- Excluded official units never become polygons and their votes are never
  allocated. Reviewed no-data polygons never receive election values.
- Each election keeps its own boundary vintage. No precinct trend comparison is
  valid by name or shape alone; that requires a separate common-geography
  crosswalk.
- Production preflight, backup, hidden load, Blob upload, activation, and public
  cutover require separate, exact hash-pinned evidence and explicit authority.

## 1. Local clone rehearsal

Use a clean checkout at the exact reviewed commit. The database URL must be the
fixed loopback clone, never a remote endpoint.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:plan:pa
npm.cmd run precinct-gis:setup:pa:local
npm.cmd run precinct-gis:validate:pa:local
```

The validation report is `.etl/local-db/pa-precinct-gis-validation.json`. It
must show invalid constraints `0`, exactly two blocked geography versions, the
per-year counts above, and `publicDeliveryAuthorized: false`. It must contain no
2012 or 2024 release row.

## 2. Seal the deterministic candidate

```powershell
npm.cmd run precinct-gis:release-candidate:pa
npm.cmd run precinct-gis:release-candidate:pa:write
```

Record the emitted candidate path and SHA-256 as `$PKG` and `$PKG_SHA`.
Candidate creation changes no canonical manifest, registry, database, Blob
object, deployment, or Git ref.

Before production consideration, run the focused Pennsylvania suite, the shared
delivery regression, typecheck, build, and hermetic API integration test:

```powershell
npm.cmd run test:precinct-geometry:pa
node --experimental-strip-types --test tests/api/precinct-map-delivery.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e:api
```

## 3. Read-only production preflight

This step requires explicit production authority. Use exactly one explicit
unpooled production URL; do not load `.env.local` into the release shell.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_PA_PRECINCT_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'

npm.cmd run precinct-gis:production-preflight:pa -- --package=$PKG --connect-read-only
```

Retain the report path, report SHA-256, database name, public revision, and
64-hex endpoint fingerprint. The report must prove that no Pennsylvania release
rows already exist. It expires after four hours.

## 4. Full restore-verified backup

Run this after preflight so the backup is at least as new as the inspected
database. The script backs up the complete public schema, restores it into the
fixed local clone, and compares the exact table set and row counts.

```powershell
$env:CRM_PA_PRECINCT_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_PA_PRECINCT_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_PA_PRECINCT_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT=$ENDPOINT_FINGERPRINT

npm.cmd run precinct-gis:production-backup:pa -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the dump, manifest, and manifest SHA-256. Backup and restore verification
must still be within four hours when the hidden load begins.

## 5. Hidden production load

Generate the default `NO_GO_PRODUCTION` authorization template from the exact
candidate, preflight, and backup evidence. A human-reviewed `GO_PRODUCTION`
artifact must be stored under `.etl/production-authorizations/PA/` and pinned by
SHA-256.

```powershell
npm.cmd run precinct-gis:production-release:pa -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

The only allowed scopes are `apply_migration_0009`,
`load_pa_precinct_results_and_geometry_hidden`, and
`increment_public_data_revision`.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_PA_PRECINCT_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_PA_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID=$AUTH_ID
$env:CRM_PA_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:pa -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

Migration 0009 and the hidden load are one guarded transaction. The receipt
decision must be `COMMITTED_HIDDEN_NOT_PUBLIC`; both versions remain blocked and
both public API gates remain closed. If commit acknowledgement or receipt
retention is uncertain, do not repeat the write. Preserve the `.pending` marker
and use the guarded read-only `--recover-receipt` path with the exact evidence
and `CRM_PA_PRECINCT_GEOGRAPHY_HIDDEN_RECEIPT_RECOVERY=$PKG_SHA`.

## 6. Immutable geometry publication

Plan first. This reads the candidate and computes the complete object plan but
does not contact Blob storage:

```powershell
npm.cmd run precinct-gis:delivery-publish:pa -- --package=$PKG --package-sha256=$PKG_SHA
```

Only after separate authorization may the 136 immutable objects be uploaded:

```powershell
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID=$BLOB_AUTH_ID

npm.cmd run precinct-gis:delivery-publish:pa -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher uploads 134 county assets before the two indexes, refuses
different bytes at an existing immutable path, re-downloads and re-hashes every
object, and records one credential-free HTTPS delivery origin.

## 7. Static activation and deployment gate

Generate the activation plan, review the three-file diff, then write it on a
dedicated branch:

```powershell
npm.cmd run precinct-gis:public-activation:pa -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:pa -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The only tracked outputs are the canonical manifest registry and the 2016 and
2020 coverage inventories. Both coverage rows retain the `partial`
disposition. The change adds no 2012 or 2024 manifest.

Configure the exact Blob origin for Preview, deploy the activation tree to a
protected preview, and verify both APIs stay closed while the database versions
are blocked. Configure the same origin for Production, merge the separately
reviewed activation tree to `main`, wait for the exact commit to be READY and
PROMOTED, and verify both gates are still closed. Record the immediately
previous gate-capable deployment as the rollback target.

## 8. Atomic public cutover

Build and write the publication plan from the exact hidden-load receipt and
Blob evidence:

```powershell
npm.cmd run precinct-gis:publication-status:pa -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --write-plan
```

Record `$PLAN_SHA`, then generate the separately hash-pinned `NO_GO_PUBLIC`
authorization template. These modes are mutually exclusive and must remain two
commands:

```powershell
npm.cmd run precinct-gis:publication-status:pa -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PLAN_SHA --write-authorization-template
```

The reviewed `GO_PUBLIC` artifact must pin the plan and authorization hashes,
READY/PROMOTED deployment commit and tree, closed result and geometry checks,
Blob origin, static registry SHA, and prior rollback deployment.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_PENNSYLVANIA_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLICATION_ACTIVATION_ID=$ACTIVATION_ID
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PLAN_SHA
$env:CRM_PA_PRECINCT_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA

npm.cmd run precinct-gis:publication-status:pa -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

This database transaction is the public cutover. It publishes exactly two
geography versions, authorizes 14,819 reporting units and crosswalks, retains
all excluded-unit reconciliation evidence, and increments the public revision
once.

## 9. Post-cutover verification

For both years and all 67 county parents, verify:

- `/api/geography-manifests?state=PA&electionDate=<YYYY-MM-DD>&level=precinct`
  returns exactly one eligible manifest. The route also accepts the canonical
  `electionId`; it does not implement a `year` filter.
- `/api/precinct-geography?manifestId=<id>&parentGeoid=<county GEOID>` returns
  the expected county-scoped GeoJSON.
- `/api/results?state=PA&year=<year>&level=precinct&office=president&parentGeoid=<county GEOID>`
  returns database-backed rows that join one-for-one to colorable features.
- All 3,498 reviewed no-data shapes remain visible without invented results;
  Pike County 2020 returns 18 no-data shapes and zero result rows.
- Excluded official units do not appear as polygons and their votes are not
  allocated.
- 2012 and 2024 have no public manifest or precinct delivery.
- The UI describes the layers as partial reviewed subsets, preserves the
  selected year in Exports & API links, and does not imply statewide
  completeness.

Run the production API smoke against the exact deployed Git SHA with
`--expect-source=database`. Preserve the publication receipt and exhaustive
verification evidence.

## Rollback

Rollback requires a distinct hash-pinned `GO_ROLLBACK` authorization and the
exact successful publication receipt. Block the database first while the
gate-capable application is live, verify both APIs close, and only then restore
the exact pinned prior deployment. Hold other `main` deployments until rollback
verification is complete. Receipt recovery is read-only and cannot perform the
initial publish or rollback.
