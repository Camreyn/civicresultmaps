# Local sanitized database clone

This workflow creates an isolated local development copy without changing the production database. It accepts only `POSTGRES_URL_NON_POOLING` or `POSTGRES_DATABASE_URL_UNPOOLED`; the selected URL is supplied only to a single `docker exec` process as ephemeral split libpq variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE`, and `PGCHANNELBINDING`) and is never written to a file, Docker configuration, output, or manifest.

## Scope

The Postgres 17 clone service is loopback-only at `127.0.0.1:54329`, with a labelled volume and `C:\tmp\crm-db-clone` bind-mounted as `/backups`.

- `crm_clone_snapshot` is restored from the sanitized production dump. After `crm_clone_dev` is created, it remains available for validation reads but has `default_transaction_read_only=on`.
- `crm_clone_dev` is the writable database for local development and normalization.
- Dumps and SHA-256 manifests are kept under `C:\tmp\crm-db-clone`.

The dump covers `public` and excludes `public.ui_layout_*` data. The approved source is checked using the `bf2bf2213814` SHA-256 prefix over host plus database path, PostgreSQL major 17, 27 public tables, and only `plpgsql`. The manifest records the actual `server_version_num` and database bytes but size is not a gate.

Production lacks `drizzle/0008_typical_thunderbolts.sql`: the geography and `reporting_unit_geometry_crosswalks` tables are absent. The clone script does not apply 0008. After cloning, the coordinator may apply it only to `crm_clone_dev` for precinct normalization and perform any post-migration local sanitization there—never on the snapshot or production source.

## Start and clone

No host PostgreSQL tools are required: the verified labelled container provides `psql`, `pg_dump`, and `pg_restore`. Start it explicitly; the script does not start or stop containers.

```powershell
docker compose -f docker-compose.db-clone.yml up -d postgres
docker compose -f docker-compose.db-clone.yml ps
```

```powershell
$env:POSTGRES_URL_NON_POOLING = '<approved unpooled production URL>'
./scripts/clone-production-db.ps1
Remove-Item Env:POSTGRES_URL_NON_POOLING
```

The source preflight and dump run with `PGOPTIONS=-c default_transaction_read_only=on`. Local resets are limited to the verified container and exact `crm_clone_snapshot`/`crm_clone_dev` names.

## Application use

```powershell
$env:CRM_DATABASE_DRIVER = 'postgres'
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_STRICT = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
```

The public read adapter enforces `default_transaction_read_only`. Normalization or mutation tooling must use a separate guarded local path, never the public read adapter or `crm_clone_snapshot`.

The script attempts restrictive Windows ACLs: directories receive inheritable full-control entries for the current Windows identity and `SYSTEM`; files receive plain `F` entries. Keep all production-derived artifacts local and out of Git.



## Apply the precinct schema and validate the baseline

The production snapshot is intentionally pre-0008. Apply the additive precinct migration to `crm_clone_dev` only:

```powershell
docker cp drizzle/0008_typical_thunderbolts.sql crm-db-clone-postgres:/tmp/0008_typical_thunderbolts.sql
docker exec crm-db-clone-postgres psql --username crm_clone_admin --dbname crm_clone_dev --set ON_ERROR_STOP=1 --single-transaction --file /tmp/0008_typical_thunderbolts.sql
```

Then validate the pristine migrated clone before running an import experiment:

```powershell
./scripts/validate-local-database-clone.ps1
```

The validator reads Docker and both local databases with read-only PostgreSQL sessions. It verifies the labelled loopback container, preflight and dump hashes, exact sanitized snapshot counts, the 27-table snapshot, the 31-table development schema, migration tables and columns, and all validated constraints. Its non-secret report is `C:\tmp\crm-db-clone\local-clone-validation.json`.

This is a baseline validator: it expects the four new geography/reporting tables to be empty and the development core counts to match the restored snapshot. After an experiment, compare against `crm_clone_snapshot` or rebuild the clone before using this validator as a pristine-baseline check again.

## Guarded local native import

Local writes require every guard below. The wrapper never loads `.env.local`, forces the local Postgres driver, rejects the snapshot and every remote/nonstandard target, and leaves the default Neon promotion path on its pre-0008 SQL shape.

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_LOCAL_WRITES = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
npm.cmd run native:promote:local -- .etl/staging/mn-2024-staging.json
Remove-Item Env:CRM_DATABASE_ENVIRONMENT, Env:CRM_DATABASE_LOCAL_WRITES, Env:DATABASE_URL
```

Use `CRM_DATABASE_STRICT=true` with the read configuration when application queries must fail instead of falling back to seed data. The local read connection always requests read-only transactions even though `crm_clone_dev` itself is writable.

## Verified Minnesota 2024 pilot

On 2026-08-05, staging artifact SHA-256 `158e46a18f6a9e1cdf6f7c13203cdb108c577e8404fa914cebc05744670c4c33` was imported only into `crm_clone_dev`.

- 4,103 distinct official VTDID reporting units were stored, all geographic precincts with source documents and 87 distinct parent county GEOIDs.
- 12,309 precinct candidate rows linked to those units; the 261 county candidate rows intentionally remained county aggregates without precinct IDs.
- All 4,075 review rows and all 4,103 turnout rows linked to reporting units.
- County and precinct result grains each reconciled to 3,253,920 votes: 1,656,979 Harris, 1,519,032 Trump, and 77,909 other. Twenty-eight official geographic precincts retained zero total votes.
- The local calculation stored 173 advisory indicator rows across 87 counties. These are review signals, not findings of fraud or misconduct.
- All public constraints remained valid and source/import metadata remained JSON objects.
- `crm_clone_snapshot` remained unchanged at 261 Minnesota result rows, 4,075 review rows, 4,103 turnout rows, public revision 3, and 27 public tables. The development revision advanced from 3 to 4.

That pilot established the normalized election-side identity contract. At the 2026-08-05 checkpoint the geometry tables were still empty; the four-election setup below completes the separate local source-preserving geometry phase without embedding vote totals in geometry.

## Minnesota four-election precinct GIS setup

The Minnesota command is deliberately separate from the production promotion path. It reads only repository-retained, hash-pinned source packages; requires the exact loopback `crm_clone_dev` target for writes; uses one transaction for every selected year; and never loads `.env.local`.

Rebuild all four reviewed packages deterministically from retained official
sources before reviewing the database plan:

```powershell
npm.cmd run precinct-gis:replay:mn:2012
npm.cmd run precinct-gis:replay:mn:2016
npm.cmd run precinct-gis:replay:mn:2020
npm.cmd run precinct-gis:replay:mn:2024
```

Review the plan without opening a database connection:

```powershell
npm.cmd run precinct-gis:plan:mn
```

Apply and then independently validate the local clone:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_LOCAL_WRITES = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
npm.cmd run precinct-gis:setup:mn:local
npm.cmd run precinct-gis:validate:mn:local
Remove-Item Env:CRM_DATABASE_ENVIRONMENT, Env:CRM_DATABASE_LOCAL_WRITES, Env:DATABASE_URL
```

Use `--years=2016,2024` to select a subset and `--report=.etl/<path>.json` to choose a non-secret report path. Reports are restricted to `.etl`. The default setup and validation reports are `.etl/local-db/mn-precinct-gis-setup-report.json` and `.etl/local-db/mn-precinct-gis-validation.json`.

| Election | Certified precinct units | Precinct result rows | Zero-vote units | Stored geometry | Stored reviewed crosswalks | Local disposition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2012 | 4,102 | 12,306 | 33 | 4,102 | 4,102 | Exact reviewed official election-result geometry loaded locally; version remains blocked from public delivery |
| 2016 | 4,120 | 12,360 | 31 | 4,120 | 4,120 | Exact reviewed geometry loaded locally; version remains blocked from public delivery |
| 2020 | 4,110 | 12,330 | 33 | 4,110 | 4,110 | Exact reviewed LCC election geometry identity loaded locally; preliminary vote fields are excluded and the version remains blocked from public delivery |
| 2024 | 4,103 | 12,309 | 28 | 4,103 | 4,103 | Exact reviewed geometry loaded locally; version remains blocked from public delivery |

The four years total 16,435 precinct reporting units, 49,305 precinct candidate rows, 16,435 reviewed source features, and 16,435 exact one-to-one crosswalks. The pre-existing 261 Minnesota county candidate rows remain separate county aggregates, making 49,566 Minnesota result rows in the development database.

The validator re-hashes every pinned workbook, manifest, normalized artifact, and crosswalk before database access. After setup it checks certified candidate totals and zero-vote units, exact same-election result-unit links, source-document provenance, every stored feature and relationship, absence of election-value fields in geometry properties, blocked public status, and all public constraints. Each year has exactly one local geography version, and every version remains fail-closed from public delivery.

The optional real-database integration test proves mid-transaction rollback and repeat-apply semantic stability:

```powershell
$env:CRM_RUN_LOCAL_DB_TESTS = 'true'
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_LOCAL_WRITES = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
node --experimental-strip-types tests/api/mn-precinct-gis-local-db.test.mjs
Remove-Item Env:CRM_RUN_LOCAL_DB_TESTS, Env:CRM_DATABASE_ENVIRONMENT, Env:CRM_DATABASE_LOCAL_WRITES, Env:DATABASE_URL
```

A successful rerun advances the local public-data revision but leaves reporting units, results, features, and crosswalk semantics unchanged. This tooling does not authorize a production migration, data promotion, or public geometry release.

## Minnesota release-transaction rehearsal

The shared row-writing primitive now accepts an injected PostgreSQL transaction
and an explicit execution context. `applyMinnesotaPrecinctGisPlan` still wraps
that primitive with the unchanged loopback `crm_clone_dev` and local-write
guards. The separate production-release wrapper is not a shortcut around those
guards: it requires the exact content-addressed release package, fresh read-only
preflight and restoration-verified backup evidence, named independent roles, an
active deployment window, and two exact environment acknowledgements before it
can connect for writes.

The production-context transaction can be exercised against `crm_clone_dev`
only by the opt-in integration test with an intentional pre-commit failure. The
test proves migration/data atomicity and then confirms that local database
semantics and revision are unchanged. It does not contact production and does
not generate a `GO_PRODUCTION` authorization record.
