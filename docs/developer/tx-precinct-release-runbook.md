# Texas four-election precinct GIS release runbook

This runbook releases the reviewed Texas Legislative Council voting-tabulation
district (VTD) products used as public **VTD / precinct approximations** for
2012, 2016, 2020, and 2024. The public vote rows remain a distinct TLC local
product; they do not replace certified Texas Secretary of State county or
statewide totals.

The sealed release candidate is:

- ID: `tx-precinct-gis-four-election-v1`
- SHA-256: `41c2cc7f901b200f76eda265183d354a7f46f2ffc01ab477e1bd4f8d07c3ecb5`
- Path:
  `.etl/precinct-release-candidates/TX/tx-precinct-gis-four-election-v1-41c2cc7f901b/release-candidate.json`
- Four index objects plus 1,016 county objects: 1,020 immutable Blob objects,
  391,854,609 bytes total
- 36,762 reporting units, 110,286 grouped result rows, 36,762 features,
  36,762 reviewed official crosswalks, and 1,280 zero-vote units

All commands must run from a tracked-clean checkout of the reviewed merged
commit. Untracked retained source packages are allowed. Do not load production
from an unmerged branch.

## 1. Local proof and guarded deployment

Run the loopback-only validation and focused suite:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_STRICT = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
npm.cmd run precinct-gis:validate:tx:local
Remove-Item Env:CRM_DATABASE_ENVIRONMENT,Env:CRM_DATABASE_STRICT,Env:DATABASE_URL
npm.cmd run test:precinct-geometry:tx
```

The tracked activation includes four public-eligible static manifests and four
coverage rows. This is safe to deploy before any database write because both
Texas precinct endpoints are database-gated. With no published Texas database
rows, `/api/precinct-geography` returns 404 and `/api/results` returns no Texas
precinct rows.

After merge, wait for the exact `main` deployment to be `READY` and
`PROMOTED`. Record its deployment ID, HTTPS URL, and 40-hex Git SHA. Verify the
deployed SHA is the merged commit and both Texas gates remain closed.

## 2. Fresh read-only production preflight

Use exactly one explicit unpooled production URL. Do not load `.env.local`.

```powershell
$PKG = '.etl/precinct-release-candidates/TX/tx-precinct-gis-four-election-v1-41c2cc7f901b/release-candidate.json'
$PKG_SHA = '41c2cc7f901b200f76eda265183d354a7f46f2ffc01ab477e1bd4f8d07c3ecb5'

npm.cmd run precinct-gis:production-preflight:tx -- --package=$PKG

$env:CRM_DATABASE_ENVIRONMENT = 'production-read-only'
$env:CRM_TX_PRODUCTION_PREFLIGHT_ACK = $PKG_SHA
$env:POSTGRES_DATABASE_URL_UNPOOLED = '<explicit unpooled production URL>'
npm.cmd run precinct-gis:production-preflight:tx -- --package=$PKG --connect-read-only
```

Retain the emitted report path, report SHA-256, database name, and 64-hex
endpoint fingerprint. The report must show migration 0008 complete, zero
invalid constraints, a read-only transaction, and no pre-existing Texas
release-candidate rows. It remains valid for at most four hours.

## 3. Full public-schema backup and restore verification

The backup must start after the fresh preflight and complete its exact restore
verification within the same four-hour window.

```powershell
npm.cmd run precinct-gis:production-backup:tx -- `
  -ReleasePackagePath $PKG `
  -ReleasePackageSha256 $PKG_SHA

$env:CRM_TX_PRECINCT_BACKUP_ACK = 'CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_TX_PRECINCT_BACKUP_PACKAGE_SHA256 = $PKG_SHA
$env:CRM_TX_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT = '<64-hex preflight fingerprint>'
npm.cmd run precinct-gis:production-backup:tx -- `
  -ReleasePackagePath $PKG `
  -ReleasePackageSha256 $PKG_SHA `
  -Execute
```

Retain the dump and manifest. The manifest must prove the full `public` schema
was included, no table data were excluded, every table and row count matched
the restored copy, the restore database was read-only, and no constraints were
invalid.

## 4. Hash-bound hidden load

Generate the default `NO_GO_PRODUCTION` template using the exact preflight and
backup-manifest hashes:

```powershell
npm.cmd run precinct-gis:production-release:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --preflight-sha256='<preflight SHA-256>' `
  --backup-manifest-sha256='<backup manifest SHA-256>' `
  --write-authorization-template
```

The release operator completes a short-lived `GO_PRODUCTION` record under
`.etl/production-authorizations/TX/`. It names the sole project owner, pins the
package, preflight, and backup hashes, and contains only these scopes:

- `load_tx_precinct_results_and_geometry_hidden`
- `increment_public_data_revision`

Then run the hidden-load transaction. Migration 0008 is a precondition verified
by the preflight; this command does not apply schema migrations independently:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'production'
$env:CRM_TX_PRECINCT_PRODUCTION_WRITES = $PKG_SHA
$env:CRM_TX_PRECINCT_PRODUCTION_AUTHORIZATION_ID = '<authorization ID>'
$env:CRM_TX_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256 = '<authorization SHA-256>'
npm.cmd run precinct-gis:production-release:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --preflight='<preflight path>' `
  --preflight-sha256='<preflight SHA-256>' `
  --backup-manifest='<backup manifest path>' `
  --backup-manifest-sha256='<backup manifest SHA-256>' `
  --authorization='<authorization path>' `
  --authorization-sha256='<authorization SHA-256>' `
  --receipt='<planned .etl/production-release-receipts/TX receipt path>' `
  --apply
```

The result must be `COMMITTED_HIDDEN_NOT_PUBLIC`. It loads all four years in
one transaction, validates every result and GIS relationship, stores the exact
release audit in the database, increments the public revision once, and leaves
all geography versions `blocked` and all delivery flags false. Preserve the
receipt and SHA-256. If the command loses its connection after the transaction
body completes, do not rerun it: the retained `.pending` marker means the
commit outcome must first be reconciled read-only. Use the same exact evidence,
authorization, receipt target, and unpooled endpoint with this recovery mode:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'production-read-only'
$env:CRM_TX_PRECINCT_HIDDEN_RECEIPT_RECOVERY = $PKG_SHA
$env:CRM_TX_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256 = '<authorization SHA-256>'
npm.cmd run precinct-gis:production-release:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --preflight='<preflight path>' `
  --preflight-sha256='<preflight SHA-256>' `
  --backup-manifest='<backup manifest path>' `
  --backup-manifest-sha256='<backup manifest SHA-256>' `
  --authorization='<authorization path>' `
  --authorization-sha256='<authorization SHA-256>' `
  --receipt='<same receipt path>' `
  --recover-receipt
```

Recovery opens a PostgreSQL `READ ONLY` transaction, validates the exact
persisted audit and all four still-blocked year packages, performs no production
mutation, and writes the planned receipt with an explicit recovery record. A failed recovery preserves
an existing post-commit marker byte-for-byte.

Recheck that Texas precinct results remain empty and geometry remains 404.

## 5. Immutable Blob delivery

The Vercel Blob token must belong to the project's public Blob store. Plan
first, then authorize the exact package:

```powershell
npm.cmd run precinct-gis:delivery-publish:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA

$env:CRM_TX_PRECINCT_PUBLIC_FILE_WRITES = 'I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_TX_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256 = $PKG_SHA
$env:CRM_TX_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID = '<Blob authorization ID>'
npm.cmd run precinct-gis:delivery-publish:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --concurrency=4 `
  --write
```

The publisher uploads all 1,016 county objects before the four indexes, uses
public immutable paths without random suffixes or overwrites, downloads every
object again, and verifies its byte count and SHA-256. Preserve the evidence
path, SHA-256, and single credential-free HTTPS `deliveryOrigin`.

Set `CRM_PRECINCT_GEOGRAPHY_ORIGIN` to that exact origin for Preview and
Production if it is not already identical. Vercel environment changes are not
retroactive: trigger fresh deployments after any change. Verify the resulting
production deployment is the exact merged commit, `READY`, and `PROMOTED`, and
that both Texas gates are still closed before the database cutover.

## 6. Atomic public cutover

Create the deterministic publication plan and authorization template from the
exact hidden-load receipt and Blob evidence:

```powershell
npm.cmd run precinct-gis:publication-status:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --hidden-receipt='<hidden receipt path>' `
  --hidden-receipt-sha256='<hidden receipt SHA-256>' `
  --blob-evidence='<Blob evidence path>' `
  --blob-evidence-sha256='<Blob evidence SHA-256>' `
  --write-plan

npm.cmd run precinct-gis:publication-status:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --hidden-receipt='<hidden receipt path>' `
  --hidden-receipt-sha256='<hidden receipt SHA-256>' `
  --blob-evidence='<Blob evidence path>' `
  --blob-evidence-sha256='<Blob evidence SHA-256>' `
  --write-authorization-template
```

Complete the short-lived `GO_PUBLIC` record with the exact production
deployment ID, URL, merged Git SHA, delivery origin, and static-registry hash.
Record that the deployment is ready/promoted and that both blocked gates were
observed. The publication runner independently requires a tracked-clean checkout
whose `HEAD` equals that deployed Git SHA.

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'production'
$env:CRM_TX_PRECINCT_PUBLICATION_WRITES = 'I_ACKNOWLEDGE_ATOMIC_TEXAS_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_TX_PRECINCT_PUBLICATION_PACKAGE_SHA256 = $PKG_SHA
$env:CRM_TX_PRECINCT_PUBLICATION_PLAN_SHA256 = '<publication plan SHA-256>'
$env:CRM_TX_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256 = '<GO_PUBLIC SHA-256>'
$env:CRM_TX_PRECINCT_PUBLICATION_ACTIVATION_ID = '<activation ID>'
npm.cmd run precinct-gis:publication-status:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --hidden-receipt='<hidden receipt path>' `
  --hidden-receipt-sha256='<hidden receipt SHA-256>' `
  --blob-evidence='<Blob evidence path>' `
  --blob-evidence-sha256='<Blob evidence SHA-256>' `
  --plan-sha256='<publication plan SHA-256>' `
  --authorization='<GO_PUBLIC path>' `
  --authorization-sha256='<GO_PUBLIC SHA-256>' `
  --output='<planned .etl/production-publication-receipts/TX receipt path>' `
  --apply
```

This final transaction changes all four geography versions to `published`,
authorizes exactly 36,762 crosswalks and reporting units, eight source
documents, and four import runs, verifies 110,286 result rows, writes the exact
manifest/delivery activation metadata, and increments the public revision once.
If the transaction becomes ambiguous after its body completes, preserve the
`.pending` marker and recover the receipt without another write transaction:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'production-read-only'
$env:CRM_TX_PRECINCT_PUBLICATION_RECEIPT_RECOVERY = '<publication plan SHA-256>'
$env:CRM_TX_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256 = '<GO_PUBLIC SHA-256>'
npm.cmd run precinct-gis:publication-status:tx -- `
  --package=$PKG `
  --package-sha256=$PKG_SHA `
  --hidden-receipt='<hidden receipt path>' `
  --hidden-receipt-sha256='<hidden receipt SHA-256>' `
  --blob-evidence='<Blob evidence path>' `
  --blob-evidence-sha256='<Blob evidence SHA-256>' `
  --plan-sha256='<publication plan SHA-256>' `
  --authorization='<GO_PUBLIC path>' `
  --authorization-sha256='<GO_PUBLIC SHA-256>' `
  --output='<same publication receipt path>' `
  --recover-receipt
```

This recovery is read-only and succeeds only when the exact four published
versions, activation metadata, row counts, authorization, deployment commit,
and public revision are still identical to the committed cutover.

## 7. Live verification

For 2012, 2016, 2020, and 2024:

1. Verify `/api/results?state=TX&year=<year>&level=precinct&office=president`
   returns the expected grouped rows.
2. Verify `/api/precinct-geography` resolves the exact public manifest and a
   county-scoped object through the configured origin.
3. Open the Texas election page, choose a county, and confirm colored VTD /
   precinct-approximation polygons, basemap tiles, tooltips, and totals.
4. Include Harris County in 2024 because its 1,070 features exercise the raised
   1,500-feature client guard. Include at least one small rural county and one
   zero-vote VTD in each year.
5. Rerun map, provenance, and source-package validators.

Advisory indicators are separate from map publication. The current Texas
native staging report contains 9,348 review rows, 309 calculated advisory
indicator rows, 172 flagged county/jurisdiction areas, and indicator types
`vote_share_pattern`, `average_down_ballot_difference`, and
`down_ballot_outliers`. These are public-interest screening signals, not
findings of fraud or misconduct.

## Rollback rule

If the live cutover fails, close the database gate before changing application
deployment or Blob configuration. Do not expose a blocked/older app while the
Texas database flags remain public. Preserve the publication receipt and all
pending markers, stop new production deployments, and use the fresh full-schema
backup only through a separately reviewed restore decision. Blob objects are
immutable evidence and should not be deleted during rollback.
