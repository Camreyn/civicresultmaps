# South Carolina precinct GIS release runbook

This runbook covers the guarded South Carolina presidential precinct release for
2016, 2020, and 2024. The three elections use separate election-specific
boundaries and county-scoped delivery assets. The 2012 diagnostic package is not
part of this release and must remain absent from the public manifest registry.

## Reviewed release universe

| Year | Reporting units | Geographic result units | Non-geographic units | Result rows | Geometry features | Reviewed no-data features | Geographic presidential votes | Official presidential votes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2016 | 2,551 | 2,232 | 319 | 6,696 | 2,234 | 2 | 1,589,961 | 2,103,027 |
| 2020 | 2,399 | 2,261 | 138 | 6,783 | 2,263 | 2 | 2,504,220 | 2,513,329 |
| 2024 | 2,446 | 2,308 | 138 | 6,924 | 2,308 | 0 | 2,541,877 | 2,548,140 |

The South Carolina Election Commission CSVs are the sole vote authority. VEST
and NYT vote fields are stripped before normalized geometry is written. Reviewed
administrative rows remain in the database for reconciliation but never receive
a polygon. The two 2016 and two 2020 features without a result row remain visible
as explicit no-data shapes.

The 2016 and 2020 geometry is retained VEST election-specific geometry attributed
to South Carolina Revenue and Fiscal Affairs. The 2024 geometry is NYT
official-boundary geometry under retained non-commercial attribution terms.
These secondary geometry sources do not replace the official result totals.

## Fail-closed conditions

- Only 2016, 2020, and 2024 are accepted by the release plan.
- 2012 remains blocked because the retained 2013 archive does not prove the
  November 2012 boundary vintage, lacks a reviewed result crosswalk, and lacks
  affirmative derivative-redistribution terms.
- The release contains 7,396 reporting units, 20,403 candidate result rows,
  6,805 features, and 7,396 reviewed relationships.
- All 595 administrative reporting units are non-geographic.
- Delivery contains 138 county files and three indexes: 141 immutable objects.
- The static manifest and results APIs remain closed until the final database
  publication transaction.
- No precinct is compared across election years by name or shape alone. Each
  election retains its own boundary vintage; trend comparison needs a separate
  reviewed common-geography crosswalk.

## 1. Local clone rehearsal

Use a clean checkout at the exact reviewed commit. The database URL must be the
fixed loopback clone, never a remote endpoint.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='local'
$env:CRM_DATABASE_STRICT='true'
$env:CRM_DATABASE_LOCAL_WRITES='true'
$env:DATABASE_URL='postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'

npm.cmd run precinct-gis:plan:sc
npm.cmd run precinct-gis:setup:sc:local
npm.cmd run precinct-gis:validate:sc:local
```

The validation report is `.etl/local-db/sc-precinct-gis-validation.json`. It
must show invalid constraints `0`, three blocked geography versions, exact
per-year counts, and `publicDeliveryAuthorized: false`. It must contain no 2012
row.

## 2. Seal the deterministic candidate

```powershell
npm.cmd run precinct-gis:release-candidate:sc
npm.cmd run precinct-gis:release-candidate:sc:write
```

Record the exact candidate path and SHA-256 as `$PKG` and `$PKG_SHA`. The sealed
package contains one release document, three draft manifests, 138 county assets,
and three indexes. Candidate creation changes no canonical manifest, registry,
database, Blob object, deployment, or Git ref.

Before production work, run the focused South Carolina suite, typecheck, build,
and the hermetic API integration test:

```powershell
npm.cmd run test:precinct-geometry:sc
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e:api
```

## 3. Read-only production preflight

Use exactly one explicit unpooled production URL. Do not load `.env.local` into
the release shell.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'

npm.cmd run precinct-gis:production-preflight:sc -- --package=$PKG --connect-read-only
```

Retain the report path, report SHA-256, database name, public revision, and
64-hex endpoint fingerprint. The preflight must prove that no South Carolina
release rows already exist. It is valid for four hours.

## 4. Full restore-verified backup

Run this after the preflight so the backup represents a state at least as new as
the inspected database. The backup script requires PostgreSQL 17 tools, backs up
the complete public schema without exclusions, restores it to the fixed local
container, and compares the exact table set and row counts.

```powershell
$env:CRM_SC_PRECINCT_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_SC_PRECINCT_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_SC_PRECINCT_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT=$ENDPOINT_FINGERPRINT

npm.cmd run precinct-gis:production-backup:sc -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the dump, manifest, and manifest SHA-256. The backup and restore
verification must still be within four hours when the hidden load starts.

## 5. Hidden production load

Generate the default `NO_GO_PRODUCTION` authorization template with the exact
candidate, preflight, and backup evidence. Store a reviewed `GO_PRODUCTION`
artifact under `.etl/production-authorizations/SC/` and record its SHA-256.

```powershell
npm.cmd run precinct-gis:production-release:sc -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

The only allowed scopes are `apply_migration_0009`,
`load_sc_precinct_results_and_geometry_hidden`, and
`increment_public_data_revision`.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID=$AUTH_ID
$env:CRM_SC_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:sc -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

Migration 0009 and the hidden load are one guarded transaction. Do not apply the
migration separately. The receipt decision must be
`COMMITTED_HIDDEN_NOT_PUBLIC`; all three versions remain blocked and both public
API gates remain closed.

If the command loses the commit acknowledgement or cannot retain its receipt,
do not rerun the write. Preserve the `.pending` marker and use the guarded
`--recover-receipt` mode with `CRM_DATABASE_ENVIRONMENT=production-read-only`,
the exact package and authorization hashes, and
`CRM_SC_PRECINCT_GEOGRAPHY_HIDDEN_RECEIPT_RECOVERY=$PKG_SHA`.

## 6. Immutable geometry publication

Plan first:

```powershell
npm.cmd run precinct-gis:delivery-publish:sc -- --package=$PKG --package-sha256=$PKG_SHA
```

Then explicitly authorize the immutable upload to the public Vercel Blob store:

```powershell
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID=$BLOB_AUTH_ID

npm.cmd run precinct-gis:delivery-publish:sc -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher uploads all 138 county assets before the three indexes, refuses
different bytes at an existing path, re-downloads and re-hashes every object,
and records one credential-free HTTPS delivery origin.

## 7. Static activation and deployment gate

Generate the activation plan, review the four-file diff, then write it on a
dedicated branch:

```powershell
npm.cmd run precinct-gis:public-activation:sc -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:sc -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The change is exactly the canonical registry plus the 2016, 2020, and 2024
coverage inventories. It adds no 2012 registry manifest. Configure the exact
Blob origin for Preview, deploy the activation tree to a protected preview, and
verify both APIs stay closed while the database versions are blocked. Configure
the same origin for Production, merge the reviewed activation tree to `main`,
wait for the exact commit to be READY and PROMOTED, and verify both gates are
still closed. Record the immediately previous gate-capable deployment as the
rollback target.

## 8. Atomic public cutover

Build and write the publication plan and `NO_GO_PUBLIC` authorization template
from the exact hidden-load receipt and Blob evidence:

```powershell
npm.cmd run precinct-gis:publication-status:sc -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --write-plan --write-authorization-template
```

The reviewed `GO_PUBLIC` authorization must pin the plan SHA, authorization SHA,
READY/PROMOTED deployment commit and tree, closed result and geometry checks,
Blob origin, static registry SHA, and prior rollback deployment.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_SOUTH_CAROLINA_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLICATION_ACTIVATION_ID=$ACTIVATION_ID
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PLAN_SHA
$env:CRM_SC_PRECINCT_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA

npm.cmd run precinct-gis:publication-status:sc -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

This database transaction is the public cutover. It publishes exactly three
geography versions, authorizes 7,396 reporting units and crosswalks, retains all
non-geographic exclusions, and increments the public revision once.

## 9. Post-cutover verification

For every year and several counties, verify:

- `/api/geography-manifests?state=SC&year=<year>&level=precinct` returns exactly
  one eligible manifest;
- `/api/precinct-geography?manifestId=<id>&parentGeoid=<county GEOID>` returns
  the expected county-scoped GeoJSON;
- `/api/results?state=SC&year=<year>&level=precinct&office=president&parentGeoid=<county GEOID>`
  returns database-backed rows that join one-for-one to colorable features;
- 2016/2020 no-data SRS features remain visible with no invented results;
- administrative categories do not appear as polygons;
- 2012 has no public manifest or precinct delivery;
- the base map is OpenStreetMap and the selected year stays pinned in Exports &
  API links.

Run the production API smoke against the exact deployed Git SHA with
`--expect-source=database`. Preserve the publication receipt and verification
evidence.

## Rollback

Rollback requires a distinct hash-pinned `GO_ROLLBACK` authorization and the
exact successful publication receipt. Block the database first while the
gate-capable application is live, verify both APIs close, and only then restore
the exact pinned prior deployment. Hold other `main` deployments until rollback
verification is complete. Receipt recovery is read-only and cannot perform the
initial publish or rollback.
