# Nevada precinct GIS runbook

This runbook covers the reproducible Nevada presidential precinct-map pipeline.
The public release is intentionally limited to 2016, 2020, and 2024. Nevada
2012 remains fail-closed until an election-date Washoe County precinct archive
is retained and reviewed; follow-up is tracked in
[GitHub issue #220](https://github.com/Camreyn/civicresultmaps/issues/220).

Nothing in this runbook treats missing or privacy-suppressed vote cells as zero.
The delivery package contains geometry and stable join identities only. Vote
values remain in PostgreSQL behind the shared publication gate.

## Reviewed scope

| Year | Colorable result units | Result rows | Zero-vote units | Polygon features | Reviewed no-data polygons | Geometry basis |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | 1,760 | 5,280 | 177 | 2,002 | 242 | Blocked: the retained 2016 Washoe proxy is not election-date 2012 geometry. |
| 2016 | 1,843 | 5,529 | 206 | 2,067 | 224 | Official NVSOS results with attributed, CC BY 4.0 VEST election-specific geometry. |
| 2020 | 1,869 | 5,607 | 207 | 2,094 | 225 | Official NVSOS results with the exact retained VEST Dataverse v21 geometry and terms. |
| 2024 | 1,576 | 4,612 | 234 | 1,635 | 59 | Official Nevada LCB public-authoritative election-cycle precinct layer, NVSOS results, and Clark County Statement of Vote. |

The three-year release totals are 5,288 displayable reporting units, 15,748
result rows, 647 zero-vote units, 5,796 polygons, 5,288 reviewed one-to-one
relationships, and 508 reviewed no-data polygons. All 17 Nevada
county-equivalents are present in every released year.

For 2024 Clark County, every one of the 910 retained election-reporting
polygons has an official result relationship. Candidate detail is complete for
852. The county Statement of Vote supplies exact registration, turnout, and
total presidential votes for the remaining 58, which together report 164
votes. Their candidate allocation is legally suppressed, so the map renders a
distinct "candidate detail suppressed" state and the exact total; it never
estimates a winner or candidate split. Ninety-one LCB Clark shapes absent from
both official result universes are excluded from the election-specific layer
instead of being mislabeled as precincts with missing results.

Public presentation geometry is rounded to seven decimals and simplified at a
0.000005-degree tolerance. This is a sub-meter, presentation-only operation.
Raw and normalized source geometry, source hashes, result identities, and
crosswalks remain unchanged and hash-pinned. One retained zero-area polygon
part is omitted from presentation geometry; its feature's valid polygon part
and identity remain present.

## Deterministic source replay

From a clean checkout:

```powershell
npm.cmd run precinct-gis:replay:nv:2012
npm.cmd run precinct-gis:replay:nv:2016
npm.cmd run precinct-gis:replay:nv:2020
npm.cmd run precinct-gis:replay:nv:2024
npm.cmd run test:precinct-geometry:nv
```

The replay retains 2012 as diagnostic evidence but never includes it in the
public release package.

## Local database validation and package sealing

Use only the fixed loopback Docker clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:validate:nv:local -- --years=2016,2020,2024 --report=.etl/local-db/nv-public-precinct-gis-validation.json

Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:DATABASE_URL

npm.cmd run precinct-gis:release-candidate:nv
npm.cmd run precinct-gis:release-candidate:nv:write
```

Record the emitted package path and full SHA-256 as `$PKG` and `$PKG_SHA`.
The package contains three draft manifests, three indexes, and 51 county files.
It pins migrations 0008 and 0009, but package generation performs no database,
Blob, Git, or deployment mutation.

## Static activation change

Static activation is a reviewed Git change and must be prepared before the
release commit is merged:

```powershell
npm.cmd run precinct-gis:public-activation:nv -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:nv -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The writer changes exactly four tracked files: the canonical manifest registry
and the 2016, 2020, and 2024 coverage inventories. It stages all outputs before
renaming and restores prior bytes if a later write fails. The resulting app is
still fail-closed because both Nevada precinct endpoints require the exact
published database metadata. Nevada 2012 is not inserted into the registry.

## Production sequence

Use a clean checkout of the exact reviewed commit. Do not load `.env.local`.
Use exactly one explicit unpooled production URL through
`POSTGRES_URL_NON_POOLING` or `POSTGRES_DATABASE_URL_UNPOOLED`.

### 1. Read-only production preflight

```powershell
npm.cmd run precinct-gis:production-preflight:nv -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_NV_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'
npm.cmd run precinct-gis:production-preflight:nv -- --package=$PKG --connect-read-only
```

Retain `$PREFLIGHT` and `$PREFLIGHT_SHA`. The preflight opens a read-only
transaction, pins the host/port/database fingerprint, requires migration 0008,
and records whether migration 0009 is already present. The initial-load path
refuses preexisting Nevada precinct rows. The reviewed v1-to-v2 correction path
accepts only the exact year/count preimage recorded by the hash-pinned v1
publication receipt; the write transaction independently verifies its published
metadata, totals, features, crosswalks, and public activation before changing it.

### 2. Full backup and restore verification

The backup must be created after the preflight and both artifacts must remain
within the four-hour evidence window.

```powershell
npm.cmd run precinct-gis:production-backup:nv -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA

$env:CRM_NV_PRECINCT_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_NV_PRECINCT_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NV_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT='<64-hex preflight endpoint fingerprint>'
npm.cmd run precinct-gis:production-backup:nv -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain `$BACKUP_MANIFEST` and `$BACKUP_SHA`. The manifest must prove the exact
public table set and row counts after a PostgreSQL 17 restore, read-only default,
and zero invalid constraints.

### 3. Sole-owner hidden-load authorization

Generate the immutable NO-GO template:

```powershell
npm.cmd run precinct-gis:production-release:nv -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

For the reviewed Clark-result correction of the already-published v1 release,
also set the exact predecessor evidence and include both arguments in this and
every hidden-load/recovery command:

```powershell
$REPLACEMENT_RECEIPT='.etl/production-publication-receipts/NV/nv-publication-b13d531f79b0-nv-public-7002cd6-20260812T132755Z.json'
$REPLACEMENT_SHA='7725db704181321f8dca9717b6902387bcecbd424975a1b29e0e8e0aea43fc4e'

npm.cmd run precinct-gis:production-release:nv -- --package=$PKG --package-sha256=$PKG_SHA --preflight-sha256=$PREFLIGHT_SHA --backup-manifest-sha256=$BACKUP_SHA --replacement-publication-receipt=$REPLACEMENT_RECEIPT --replacement-publication-receipt-sha256=$REPLACEMENT_SHA --write-authorization-template
```

The completed record must change the decision to `GO_PRODUCTION`, identify the
sole project owner in `approvedBy`, set an active authorization ID and expiry,
and retain exactly these scopes:

- `apply_migration_0009`
- `load_nv_precinct_results_and_geometry_hidden`
- `increment_public_data_revision`

The v1-to-v2 correction instead uses `GO_PRODUCTION_UPGRADE` and has one
additional exact scope:

- `replace_reviewed_nv_precinct_release_v1_with_v2_hidden`

Record its path and hash as `$AUTH` and `$AUTH_SHA`.

### 4. Coupled migration and hidden load

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_NV_PRECINCT_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_NV_PRECINCT_PRODUCTION_AUTHORIZATION_ID='<authorization ID>'
$env:CRM_NV_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:nv -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

For the reviewed correction, also set and pass the predecessor receipt:

```powershell
$env:CRM_NV_PRECINCT_PRODUCTION_REPLACEMENT_RECEIPT_SHA256=$REPLACEMENT_SHA
npm.cmd run precinct-gis:production-release:nv -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --replacement-publication-receipt=$REPLACEMENT_RECEIPT --replacement-publication-receipt-sha256=$REPLACEMENT_SHA --apply
```

One PostgreSQL transaction upgrades the derivation-method constraint when
needed, loads all three years, validates exact rows/features/crosswalks and
durable audit metadata, and increments the public revision. Geography versions,
result units, source documents, and import runs remain blocked with
`publicDeliveryAuthorized=false`. The receipt decision is
`COMMITTED_HIDDEN_NOT_PUBLIC`.

The correction transaction is deliberately one-use and fail-closed. It accepts
only the exact v1 receipt SHA embedded in the reviewed code, locks and validates
all three published predecessor versions, candidate totals, zero-vote counts,
5,230 reporting units/crosswalks, 15,690 result rows, 5,887 features, six source
documents, three import runs, and their public-activation metadata. It then
removes only those three reviewed v1 geometry versions (features and crosswalks
cascade), upserts the sealed v2 rows, leaves all v2 publication flags blocked,
validates the complete v2 contract, and increments the revision in the same
transaction. A retry cannot match the v1 precondition.

If the connection fails after the transaction body completes, do not rerun the
write. Preserve the `.pending` marker and use the read-only recovery mode after
checking the database audit:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_NV_PRECINCT_HIDDEN_RECEIPT_RECOVERY=$PKG_SHA
$env:CRM_NV_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA
npm.cmd run precinct-gis:production-release:nv -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP_MANIFEST --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --recover-receipt
```

The correction recovery command must also retain
`CRM_NV_PRECINCT_PRODUCTION_REPLACEMENT_RECEIPT_SHA256` and both
`--replacement-publication-receipt*` arguments. Recovery opens a read-only
transaction and requires the persisted v2 audit to contain the exact predecessor
summary; it cannot perform another replacement.

### 5. Immutable Blob publication

Plan first:

```powershell
npm.cmd run precinct-gis:delivery-publish:nv -- --package=$PKG --package-sha256=$PKG_SHA
```

Then authorize the 54 exact content-addressed objects:

```powershell
$env:CRM_NV_PRECINCT_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_NV_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NV_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID='<owner authorization ID>'
npm.cmd run precinct-gis:delivery-publish:nv -- --package=$PKG --package-sha256=$PKG_SHA --write
```

All 51 county files upload before the three indexes. Existing objects must
rehash exactly; overwrites and random suffixes are disabled. Retain the Blob
evidence path/hash and its single credential-free HTTPS delivery origin.

### 6. Deploy while the database gate remains blocked

Set `CRM_PRECINCT_GEOGRAPHY_ORIGIN` to the exact Blob origin in Preview, create
a new protected preview deployment, and verify the exact commit. Both Nevada
precinct-result requests and precinct-geometry requests must still be blocked.

Set the same origin in Production and deploy the exact reviewed activation
commit. Wait for the main deployment to be READY/PROMOTED and again prove both
endpoints remain blocked. An environment change does not alter an existing
deployment; a new deployment is required.

### 7. Atomic public database cutover

Use the hidden receipt and Blob evidence to build the publication plan:

```powershell
npm.cmd run precinct-gis:publication-status:nv -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --write-plan
npm.cmd run precinct-gis:publication-status:nv -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --write-authorization-template
```

Complete the template as `GO_PUBLIC` with the sole owner, exact plan/evidence,
active expiry, and the verified production deployment ID, URL, Git SHA, Blob
origin, registry hash, READY/PROMOTED attestations, and blocked-endpoint checks.
Record `$PUBLIC_PLAN_SHA`, `$PUBLIC_AUTH`, and `$PUBLIC_AUTH_SHA`.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_NV_PRECINCT_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_NEVADA_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_NV_PRECINCT_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_NV_PRECINCT_PUBLICATION_PLAN_SHA256=$PUBLIC_PLAN_SHA
$env:CRM_NV_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA
$env:CRM_NV_PRECINCT_PUBLICATION_ACTIVATION_ID='<activation ID>'

npm.cmd run precinct-gis:publication-status:nv -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PUBLIC_PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

That one database transaction is the public cutover for both APIs. It publishes
three geography versions, authorizes 5,288 reporting units and crosswalks,
validates 15,748 result rows and 5,796 features, and increments the public
revision once.

If the public transaction becomes ambiguous after its body completes, preserve
the marker and use `--recover-receipt` with
`CRM_DATABASE_ENVIRONMENT=production-read-only`, the exact plan and
authorization hashes, and
`CRM_NV_PRECINCT_PUBLICATION_RECEIPT_RECOVERY=$PUBLIC_PLAN_SHA`.

## Verification and stop conditions

After public cutover, verify every released year and all 17 county-equivalents,
including reviewed no-data polygons. In Clark 2024, verify 910 map features,
852 candidate-complete precincts, and 58 privacy-suppressed precincts totaling
164 votes. Confirm 2012 remains unavailable. Stop and
do not publish if any hash, endpoint fingerprint, year set, row count, feature
count, crosswalk count, source attribution, privacy caveat, deployment SHA,
registry hash, or database publication flag differs from the sealed evidence.

The President-versus-Senate advisory pipeline is separate. Its indicators are
review signals only and are not evidence of fraud or misconduct.
