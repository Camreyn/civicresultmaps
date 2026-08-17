# Florida precinct GIS release runbook

This runbook covers the guarded Florida presidential precinct release for
2016, 2020, and 2024. The three elections use separate election-specific
boundaries and county-scoped delivery assets. The 2012 diagnostic package is not
part of this release and must remain absent from the public manifest registry.

## Reviewed release universe

| Year | Loaded result units | Excluded source units | Result rows | Geometry features | Reviewed no-data features | Displayed presidential votes | Full official source votes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2016 | 5,852 | 18 | 17,556 | 5,962 | 110 | 9,488,349 | 9,498,093 |
| 2020 | 5,989 | 17 | 17,967 | 6,010 | 21 | 11,088,665 | 11,090,844 |
| 2024 | 5,583 | 126 | 16,749 | 5,583 | 0 | 10,917,518 | 10,935,466 |

Florida Department of State precinct exports are the sole vote authority. VEST
and NYT vote fields are stripped before normalized geometry is written. The 161
official source units without reviewed geometry remain fully reconciled in the
source packages but are not loaded or spatially allocated. The 110 unlinked 2016
features and 21 unlinked 2020 features remain visible as explicit no-data shapes.

The 2016 and 2020 geometry is retained VEST election-specific geometry under
CC BY attribution. The 2024 geometry is NYT election-specific presentation
geometry under retained C-UDA non-commercial attribution terms; its 4,319
official-boundary and 1,264 generated-boundary features remain disclosed.
These secondary geometry sources do not replace the official result totals.

## Fail-closed conditions

- Only 2016, 2020, and 2024 are accepted by the release plan.
- 2012 remains blocked because no complete statewide boundary edition effective
  for November 6, 2012, with an authoritative result-to-feature crosswalk, was
  found. Census VTDs are retained only as an unsafe diagnostic alternative.
- The release contains 17,424 reporting units, 52,272 candidate result rows,
  17,555 features, and 17,424 reviewed one-to-one relationships.
- The 161 excluded source units and 29,871 candidate votes are never allocated.
- Delivery contains 201 county files and three indexes: 204 immutable objects.
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

npm.cmd run precinct-gis:plan:fl
npm.cmd run precinct-gis:setup:fl:local
npm.cmd run precinct-gis:validate:fl:local
```

The validation report is `.etl/local-db/fl-precinct-gis-validation.json`. It
must show invalid constraints `0`, three blocked geography versions, exact
per-year counts, and `publicDeliveryAuthorized: false`. It must contain no 2012
row.

## 2. Seal the deterministic candidate

```powershell
npm.cmd run precinct-gis:release-candidate:fl
npm.cmd run precinct-gis:release-candidate:fl:write
```

Record the exact candidate path and SHA-256 as `$PKG` and `$PKG_SHA`. The sealed
package contains one release document, three draft manifests, 201 county assets,
and three indexes. Candidate creation changes no canonical manifest, registry,
database, Blob object, deployment, or Git ref.

Before production work, run the focused Florida suite, typecheck, build,
and the hermetic API integration test:

```powershell
npm.cmd run test:precinct-geometry:fl
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e:api
```

## 3. Read-only production preflight

Use exactly one explicit unpooled production URL. Do not load `.env.local` into
the release shell.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_FL_PRECINCT_GEOGRAPHY_PRODUCTION_PREFLIGHT_ACK=$PKG_SHA
$env:POSTGRES_URL_NON_POOLING='<explicit unpooled production URL>'

npm.cmd run precinct-gis:production-preflight:fl -- --package=$PKG --connect-read-only
```

Retain the report path, report SHA-256, database name, public revision, and
64-hex endpoint fingerprint. The preflight must prove that no Florida
release rows already exist. It is valid for four hours.

## 4. Full restore-verified backup

Run this after the preflight so the backup represents a state at least as new as
the inspected database. The backup script requires PostgreSQL 17 tools, backs up
the complete public schema without exclusions, restores it to the fixed local
container, and compares the exact table set and row counts.

```powershell
$env:CRM_FL_PRECINCT_GEOGRAPHY_BACKUP_ACK='CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP'
$env:CRM_FL_PRECINCT_GEOGRAPHY_BACKUP_PACKAGE_SHA256=$PKG_SHA
$env:CRM_FL_PRECINCT_GEOGRAPHY_BACKUP_ENDPOINT_FINGERPRINT=$ENDPOINT_FINGERPRINT

npm.cmd run precinct-gis:production-backup:fl -- -ReleasePackagePath $PKG -ReleasePackageSha256 $PKG_SHA -Execute
```

Retain the dump, manifest, and manifest SHA-256. The backup and restore
verification must still be within four hours when the hidden load starts.

## 5. Hidden production load

Generate the default `NO_GO_PRODUCTION` authorization template with the exact
candidate, preflight, and backup evidence. Store a reviewed `GO_PRODUCTION`
artifact under `.etl/production-authorizations/FL/` and record its SHA-256.

```powershell
npm.cmd run precinct-gis:production-release:fl -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --write-authorization-template
```

The only allowed scopes are `apply_migration_0009`,
`load_fl_precinct_results_and_geometry_hidden`, and
`increment_public_data_revision`.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_FL_PRECINCT_GEOGRAPHY_PRODUCTION_WRITES=$PKG_SHA
$env:CRM_FL_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_ID=$AUTH_ID
$env:CRM_FL_PRECINCT_GEOGRAPHY_PRODUCTION_AUTHORIZATION_SHA256=$AUTH_SHA

npm.cmd run precinct-gis:production-release:fl -- --package=$PKG --package-sha256=$PKG_SHA --preflight=$PREFLIGHT --preflight-sha256=$PREFLIGHT_SHA --backup-manifest=$BACKUP --backup-manifest-sha256=$BACKUP_SHA --authorization=$AUTH --authorization-sha256=$AUTH_SHA --apply
```

Migration 0009 and the hidden load are one guarded transaction. Do not apply the
migration separately. The receipt decision must be
`COMMITTED_HIDDEN_NOT_PUBLIC`; all three versions remain blocked and both public
API gates remain closed.

If the command loses the commit acknowledgement or cannot retain its receipt,
do not rerun the write. Preserve the `.pending` marker and use the guarded
`--recover-receipt` mode with `CRM_DATABASE_ENVIRONMENT=production-read-only`,
the exact package and authorization hashes, and
`CRM_FL_PRECINCT_GEOGRAPHY_HIDDEN_RECEIPT_RECOVERY=$PKG_SHA`.

## 6. Immutable geometry publication

Plan first:

```powershell
npm.cmd run precinct-gis:delivery-publish:fl -- --package=$PKG --package-sha256=$PKG_SHA
```

Then explicitly authorize the immutable upload to the public Vercel Blob store:

```powershell
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLIC_FILE_WRITES='I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD'
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLIC_FILE_PACKAGE_SHA256=$PKG_SHA
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLIC_FILE_AUTHORIZATION_ID=$BLOB_AUTH_ID

npm.cmd run precinct-gis:delivery-publish:fl -- --package=$PKG --package-sha256=$PKG_SHA --write
```

The publisher uploads all 201 county assets before the three indexes, refuses
different bytes at an existing path, re-downloads and re-hashes every object,
and records one credential-free HTTPS delivery origin.

## 7. Static activation and deployment gate

Generate the activation plan, review the four-file diff, then write it on a
dedicated branch:

```powershell
npm.cmd run precinct-gis:public-activation:fl -- --package=$PKG --package-sha256=$PKG_SHA
npm.cmd run precinct-gis:public-activation:fl -- --package=$PKG --package-sha256=$PKG_SHA --write
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

Build and write the publication plan from the exact hidden-load receipt and
Blob evidence:

```powershell
npm.cmd run precinct-gis:publication-status:fl -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --write-plan
```

Record the emitted `$PLAN_SHA`, then generate the separately hash-pinned
`NO_GO_PUBLIC` authorization template. Publication-status modes are mutually
exclusive, so these must remain two commands:

```powershell
npm.cmd run precinct-gis:publication-status:fl -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PLAN_SHA --write-authorization-template
```

The reviewed `GO_PUBLIC` authorization must pin the plan SHA, authorization SHA,
READY/PROMOTED deployment commit and tree, closed result and geometry checks,
Blob origin, static registry SHA, and prior rollback deployment.

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLICATION_WRITES='I_ACKNOWLEDGE_ATOMIC_FLORIDA_PRECINCT_PUBLIC_CUTOVER'
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLICATION_ACTIVATION_ID=$ACTIVATION_ID
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLICATION_PLAN_SHA256=$PLAN_SHA
$env:CRM_FL_PRECINCT_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256=$PUBLIC_AUTH_SHA

npm.cmd run precinct-gis:publication-status:fl -- --package=$PKG --package-sha256=$PKG_SHA --hidden-receipt=$HIDDEN_RECEIPT --hidden-receipt-sha256=$HIDDEN_SHA --blob-evidence=$BLOB_EVIDENCE --blob-evidence-sha256=$BLOB_SHA --plan-sha256=$PLAN_SHA --authorization=$PUBLIC_AUTH --authorization-sha256=$PUBLIC_AUTH_SHA --apply
```

This database transaction is the public cutover. It publishes exactly three
geography versions, authorizes 17,424 reporting units and crosswalks, retains
all unmatched-unit reconciliation evidence, and increments the public revision once.

## 9. Post-cutover verification

For every year and several counties, verify:

- `/api/geography-manifests?state=FL&electionDate=<YYYY-MM-DD>&level=precinct`
  returns exactly one eligible manifest. The route also accepts its canonical
  `electionId`; it does not implement a `year` filter;
- `/api/precinct-geography?manifestId=<id>&parentGeoid=<county GEOID>` returns
  the expected county-scoped GeoJSON;
- `/api/results?state=FL&year=<year>&level=precinct&office=president&parentGeoid=<county GEOID>`
  returns database-backed rows that join one-for-one to colorable features;
- 2016/2020 reviewed no-data features remain visible with no invented results;
- excluded source units do not appear as polygons and their votes are not allocated;
- 2012 has no public manifest or precinct delivery;
- the base map is OpenStreetMap and the selected year stays pinned in Exports &
  API links.

Run the production API smoke against the exact deployed Git SHA with
`--expect-source=database`. Preserve the publication receipt and verification
evidence.

## Completed 2026-08-16 production checkpoint

- Human-merged commit: `89d4030402e1c4bbe16e8104978715cdd333fe51`;
  reviewed tree: `6234e3d568bb5dbfbe5e89db75de80e65df18e42`.
- READY/PROMOTED production deployment:
  `dpl_4FPtsSkeF7pzM2BNbRThoZFU2kNC`.
- Gate-capable rollback deployment:
  `dpl_EArfLj4sHW4HNWD5LyP7Q5JCVUgW` at commit
  `11f8497795819f90033e2005242c093b0f196ef9`.
- Publication activation:
  `fl-precinct-public-20260816T225352Z-57c2b8fb8873`; public revision `25`.
- Publication plan SHA-256:
  `57c2b8fb88730adfc25e5d2a93f6d8359d227544f4e84055e31466a1c3444993`.
- Publication receipt SHA-256:
  `1e79f8e2058472b37d65842d2888065de52e344679b9365e22f9da887e2ca2ae`.
- Exhaustive API verification SHA-256:
  `80bcce2c3b8291178e2f830fac99b6677dc4145a7c23874e8768d1338bb045ab`.
- Independent read-only database verification SHA-256:
  `64e722f1312fdd83c07e788c383d1b0103589c3d080a81f99b3d2eeb655a000a`.
- Browser verification SHA-256:
  `bddca4b0d1fc6c9c36857e70bee7f3ec832fd3c17c261fb78da6be315961f487`.
- Combined production verification SHA-256:
  `01fb7e0edc7096249ba794e1d14900e1e54ea4b43e00e9e79cef04dbacb8886f`.

The live checks covered all 201 county/year parent scopes. They confirmed
17,424 result units, 17,555 features, 131 explicit reviewed no-data features,
140 mapped zero-vote units, 31,494,532 displayed official votes, and zero
invalid public constraints. Browser checks confirmed the three published maps,
OpenStreetMap attribution, source/vintage labels, interactive selection, and
year-pinned Exports & API examples. Florida 2012 remained unavailable.

The parent-validation hardening was subsequently human-merged as commit
`6aad834fa31306c3117f2bf974b81544b8a2859a` (tree
`e989a76490d2c8046f3eae03002c370621008d88`) and promoted as production
deployment `dpl_GhN6DNUBedB67u4ruNTiocquQuUo`. Live checks against the exact
deployment SHA confirmed that a Florida request using Georgia county GEOID
`13001` now returns HTTP 400 from both the results and geometry endpoints with
the Florida-prefix validation message. Valid Alachua County `12001` checks
still returned one manifest, 63 result units, and 63 features for each of 2016,
2020, and 2024; 2012 still returned no manifest or precinct results. The
exact-SHA, database-backed public smoke passed all 22 checks, and the deployment
had no HTTP 500 or error-level runtime logs during the verification window.
This hardening changed no database row, Blob object, environment variable,
manifest eligibility, or public revision.

## Rollback

Rollback requires a distinct hash-pinned `GO_ROLLBACK` authorization and the
exact successful publication receipt. Block the database first while the
gate-capable application is live, verify both APIs close, and only then restore
the exact pinned prior deployment. Hold other `main` deployments until rollback
verification is complete. Receipt recovery is read-only and cannot perform the
initial publish or rollback.
