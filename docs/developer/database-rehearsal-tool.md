# Disposable database rehearsal

`crm_rehearse_database` exercises database changes without selecting production
or either existing CRM clone. It is a confirmed local action, not a deployment.

```json
{"tool":"crm_rehearse_database","arguments":{"profile":"native-import","confirmation":"REHEARSE_LOCAL_DATABASE"}}
```

CLI equivalent: `npm.cmd run db:rehearse`. This can create a new local container;
`npm.cmd run test:mcp:database` runs deterministic safety/fixture tests instead.

The fixed workflow checks the reviewed `0000` through `0009` migration list
against `drizzle/*.sql`,
starts a unique labelled `postgres:17-alpine` container on a dynamically mapped
loopback port, records its resolved image content ID, applies migrations, and
invokes the real native importer with a wholly synthetic fixture. It imports
twice, deliberately changes a fixture and throws before commit to test rollback,
dumps/restores into a second generated database, and exercises real
`listResults`, `listReviewRows`, `listTurnoutRows`, and
`listHistoricalResultRows` through a scoped read-only connection.

Idempotence compares serving-table contents and schema. It explicitly excludes
append-only `import_runs`/`validation_reports`, the monotonic public revision,
generated primary IDs, import-run pointers, and creation/update timestamps.
Other foreign keys and values are preserved. Rollback and restoration compare
all table rows, schema columns, and constraints without those exclusions.
The report records fixture/migration hashes, image identity, database hashes,
application-read assertions, and cleanup status when those phases execute.

The runner accepts no URL, path, SQL, image, environment, or command override.
Docker uses the local Windows named pipe or Linux socket; inherited remote
Docker routing is discarded. Each command has a 60-second limit and 256 KiB
output bound. Cancellation stops work and still attempts bounded cleanup.
Only the exact generated container with the exact ownership label may be
removed. Cleanup uses forced container removal with anonymous-volume removal,
runs before the report is saved, and records both resources as removed.
Unconfirmed cleanup is not reported as a clean pass.

Rehearsal targets are frozen and registered by object identity, not merely a
caller-supplied flag. A copied/retargeted object is refused. The existing
production and persistent-clone paths retain their existing policies; the
rehearsal does not change their environment or opt-ins.

Reports live at `.etl/mcp-runs/database-rehearsal-<uuid>/database-rehearsal.json`.
An unavailable daemon is `inconclusive`; a failed assertion is `failed`. A
successful tool invocation alone is not a passing database rehearsal.

## Verified here

Safety and pre-database failure-path tests pass, including ownership checks,
cleanup ordering, migration drift, cancellation, bad ports, and forged targets.
The fixed application-loader import resolves successfully. A real disposable
Docker run on 2026-09-22 then exposed an existing clean-replay gap: migration
`0002_historical_review_candidates.sql` attempts to alter
`historical_result_rows`, which no earlier tracked migration creates. The run
therefore reported `failed`, retained its audit at
`.etl/mcp-runs/database-rehearsal-57a96add-3381-45d5-807d-8750d3f0c454/database-rehearsal.json`,
and confirmed `owned_container_and_anonymous_volumes_removed`. This is a
migration-chain blocker, not a passing rehearsal. A preliminary pre-review run
did not verify removal of its image-created anonymous volume; the runner now
uses `docker rm -v` only after verifying the generated container label. No
existing clone or production database was mutated.
