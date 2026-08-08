# Minnesota precinct GIS release runbook

## Purpose and current decision

This runbook covers the coordinated release of Minnesota presidential precinct
results and election-applicable precinct geometry for 2012, 2016, 2020, and
2024. The source and geometry work is complete locally, but production release
is not authorized by this document.

The current decision is `NO_GO_PRODUCTION`. Local preparation may generate
review artifacts only under:

```text
.etl/precinct-release-candidates/MN/mn-precinct-gis-four-election-v1-<package-hash-prefix>/
```

The content-addressed directory lets a later reviewed package coexist with an
earlier local draft without overwriting either one.

Canonical manifests must remain `blocked`, `rowLevelRenderingSafe` must remain
`false`, and `delivery` must remain `null` until the production gates in this
runbook are satisfied and the project owner explicitly authorizes activation.

## Frozen local release inputs

| Election | Reporting units | Candidate rows | Zero-vote units | Delivery bytes | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| 2012 | 4,102 | 12,306 | 33 | 43,222,011 | `f0f9727bd5b212c83d565bf343609d2bdd416a382be1975fd9fcaa525e737714` |
| 2016 | 4,120 | 12,360 | 31 | 26,793,881 | `ce27114ad1971cca472f635f0b2292c60be0c3104c44f49c794c7cfc5e74d207` |
| 2020 | 4,110 | 12,330 | 33 | 25,998,261 | `c06e1b9712c44c031262872faa70924dd9198928f0ae4274d2259787125e3e8c` |
| 2024 | 4,103 | 12,309 | 28 | 27,550,483 | `df94482464f9cd7065b2e6cf624eb6d19ab5717bb477ac57e798dd23066f9f06` |
| Total | 16,435 | 49,305 | 125 | 123,564,636 | Four reviewed statewide candidates |

The four statewide files are frozen review inputs, not the production serving
shape. The release builder deterministically divides each one into 87 county
GeoJSON files and one small parent index. The proposed public set therefore has
348 county files and four indexes. Each county file is independently
content-addressed and carries the same source authority, source URL, boundary
vintage, and complete LCC terms as its statewide input. Each draft manifest
pins the index hash, byte count, parent count, and feature count; the index in
turn pins every county file's hash, byte count, GEOID, and feature count.

The precinct API reads and verifies the index plus the one requested county.
It does not read a 26-43 MB statewide file on each request. The results API also
accepts a five-digit `parentGeoid` only with `level=precinct` and joins through
the same-election `reporting_units` row, so the browser receives only the
selected county's result rows.

Every feature has one reviewed `one_to_one`, `exact_official_id`, high-confidence
relationship to one same-election certified reporting unit. Each year covers all
87 Minnesota counties. Geometry and delivery properties contain no election
values.

The certified Minnesota Secretary of State workbook is the sole vote authority
for every year. The 2016 and 2020 LCC election layers contain preliminary or
non-certified election attributes; those attributes are retained as source
evidence but are excluded from normalized geometry, delivery, crosswalk
metadata, and public result rows.

The full LCC-GIS disclaimer is retained in every canonical source record and in
the delivery metadata. It must remain visible through the map UI and API. A
delivered copy must include the disclaimer as required by the source terms.

## OpenStreetMap presentation basemap

The precinct-detail surface uses the OpenStreetMap Standard raster tiles at
`https://tile.openstreetmap.org/{z}/{x}/{y}.png` as a presentation-only
background. Minnesota LCC-GIS precinct boundaries remain the geometry
authority, and the Minnesota Secretary of State workbooks remain the vote
authority. OpenStreetMap is not used to create, alter, name, or crosswalk any
election reporting unit.

The browser requests only tiles intersecting the selected county viewport at a
single fitted zoom. The application does not proxy, prefetch, scrape, archive,
or disable browser caching for tiles. The permanent on-map attribution links to
`https://www.openstreetmap.org/copyright`. These requirements follow the OSMF
Standard tile policy at
`https://operations.osmfoundation.org/policies/tiles/`.

The community tile service is best-effort and has no SLA. Before traffic grows
beyond normal modest interactive use, the project must move to an appropriately
licensed OSM-derived provider or self-hosted tiles rather than treating the
community server as an unlimited production CDN. A tile outage must leave the
official precinct polygons, joined results, legend, selection control, source
terms, and fallback map background usable.

## Build the local review package

First validate the guarded local database using a read-only session:

```powershell
$env:CRM_DATABASE_ENVIRONMENT = 'local'
$env:CRM_DATABASE_STRICT = 'true'
$env:DATABASE_URL = 'postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev'
npm.cmd run precinct-gis:validate:mn:local
Remove-Item Env:CRM_DATABASE_ENVIRONMENT, Env:CRM_DATABASE_STRICT, Env:DATABASE_URL
```

Then build the package. The first command is a no-write dry run. The second
writes only to `.etl` and refuses to replace different bytes:

```powershell
npm.cmd run precinct-gis:release-candidate:mn
npm.cmd run precinct-gis:release-candidate:mn:write
```

The package contains:

- hashes and byte counts for the four certified workbooks, source evidence,
  raw artifacts referenced by that evidence, normalized geometry, and reviewed
  crosswalks;
- hashes for the migration, database/runtime dependencies, API/map code, tests,
  national registries, and shared inventories involved in the release;
- the exact four statewide candidate hashes, four parent-index hashes, all 348
  county artifact hashes, and proposed immutable public URLs;
- local-only draft reviewed manifests that preserve source authority, URLs,
  terms, warnings, and caveats;
- expected database counts and totals;
- the deployment order, rollback contract, stop conditions, and explicit
  pending gates.

The draft manifests are review artifacts. Generating them does not edit the
canonical per-election manifests or `data/precinct-geometry-manifests.json`.

## Build the isolated release overlay

Pass the exact content-addressed package path to the overlay tool. The first
command is read-only; the second writes only beneath
`.etl/precinct-release-overlays/MN/` and refuses to replace different bytes:

```powershell
npm.cmd run precinct-gis:release-overlay:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json
npm.cmd run precinct-gis:release-overlay:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json --write
```

The overlay contains exact copies of the release code/document dependencies,
Git-base hashes, per-file binary-capable patches for tracked changes, and
Minnesota-only semantic projections for national JSON registries. Large source
and normalized artifacts remain immutable hash references instead of being
duplicated. An overlay decision of `REVIEW_REQUIRED` is expected while shared
UI, database, package, documentation, or national-registry hunks await review;
creating the overlay alone does not pass the clean-branch gate.

## Classify the shared release diff

Run the deterministic review against the exact package and overlay paths. The
first command is read-only; the second writes an immutable review record only
under `.etl/precinct-release-reviews/MN/`:

```powershell
npm.cmd run precinct-gis:release-review:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json --overlay=.etl/precinct-release-overlays/MN/<overlay>/overlay.json
npm.cmd run precinct-gis:release-review:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json --overlay=.etl/precinct-release-overlays/MN/<overlay>/overlay.json --write
```

The review rechecks the package/overlay relationship and every copied file,
patch, and semantic-projection byte. It classifies every modified/shared
surface enumerated by the candidate, including API contracts, the results
route, migration journal, and OSM privacy page. Its curated policy keeps
Minnesota precinct UI/database hunks, the OSM tile privacy disclosure,
Minnesota-only national-registry projections, `postgres`/`shpjs` lock entries,
and the Minnesota documentation section. It explicitly excludes unrelated
indicator presentation, browser-R, security-version, MCP dependency,
other-state script, registry-row, and documentation changes.

`READY_FOR_HUMAN_CONFIRMATION` means the machine classification is complete;
it does not pass the clean-diff gate. An independent human must confirm the
include/exclude policy and apply it in a clean integration worktree. The
national continuation ledger remains an external hash-pinned review artifact
instead of being misrepresented as a Minnesota-only file.

The clean integration gate must run at least:

```powershell
npm.cmd run test:precinct-geometry:mn
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

The guarded browser rehearsal must additionally pass for all four years with
`CRM_RUN_MN_PRECINCT_REHEARSAL_E2E=true` against the loopback-only
`crm_clone_dev` server. A new candidate, overlay, or review hash supersedes the
earlier confirmation and requires the new review record to be confirmed.

## Production-readiness commands

The release-specific preflight defaults to a no-connection plan. It does not
load `.env.local`:

```powershell
npm.cmd run precinct-gis:production-preflight:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json
```

A real preflight additionally requires `--connect-read-only`, the exact package
hash in `CRM_MN_PRODUCTION_PREFLIGHT_ACK`,
`CRM_DATABASE_ENVIRONMENT=production-read-only`, and an explicitly supplied
unpooled production URL. It runs in a read-only transaction and writes only a
non-secret evidence report under `.etl/production-preflight-candidates/MN/`.
It records the endpoint fingerprint, database identity/version, public table
set, migration-0008 state, invalid constraints, public revision, Minnesota
year/result/source-document sets, and—when the precinct schema exists—reporting
unit, linked-result, geography, feature, and reviewed-crosswalk counts.

The production runner also defaults to a no-connection plan. It can write a
`NO_GO_PRODUCTION` authorization template for later human completion:

```powershell
npm.cmd run precinct-gis:production-release:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json --write-authorization-template
```

The runner cannot apply from that template. A database write requires all of
the following simultaneously:

- a fresh hash-pinned read-only preflight no more than four hours old;
- a fresh checksummed backup no more than four hours old with recorded restore
  verification, covering the complete `public` schema with no excluded table
  data;
- a `GO_PRODUCTION` authorization record naming authorizer, operator, verifier,
  and rollback owner, with at least two independent people;
- an active deployment window and rollback decision time;
- the exact database scopes for migration 0008, hidden Minnesota load, and
  public-revision increment;
- `CRM_DATABASE_ENVIRONMENT=production`, the exact package hash in
  `CRM_MN_PRECINCT_PRODUCTION_WRITES`, and the exact authorization ID in
  `CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID`.

When those guards pass, migration 0008 and the four-election hidden load run in
one PostgreSQL transaction. All source and package hashes are rechecked before
connection, every expected database count is validated inside the transaction,
and any error rolls back both schema and data. The transaction leaves geography
versions blocked and does not write public files, edit canonical manifests, or
promote an application deployment. Those remain separate authorization scopes.

The sanitized development-clone dump is not sufficient production rollback
evidence because it intentionally excludes `ui_layout_*` table data. It may be
used for local rehearsal, but the release runner requires a separate full
rollback backup manifest whose purpose is
`mn-precinct-production-release-rollback`, whose included schema is exactly
`public`, whose excluded-table-data list is empty, and whose restoration check
is recorded.

Generate the full-backup plan from the exact release package without connecting
to production:

```powershell
npm.cmd run precinct-gis:production-backup:mn -- -ReleasePackagePath .etl/precinct-release-candidates/MN/<candidate>/release-candidate.json -ReleasePackageSha256 <sha256>
```

Execution additionally requires `-Execute`, the exact package hash in
`CRM_MN_PRECINCT_BACKUP_PACKAGE_SHA256`, the literal
`CRM_MN_PRECINCT_BACKUP_ACK=CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP`, and an
explicitly supplied unpooled production URL. Execution also requires
`CRM_MN_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT` to equal the fresh preflight's
full 64-hex fingerprint over normalized host, port, and database name. The
legacy 12-hex host/database fingerprint remains only an independent approved-
endpoint check. The script uses the verified
loopback-only Postgres 17 clone container to make a custom-format dump of the
entire `public` schema with no exclusions. It restores into the fixed isolated
`crm_mn_precinct_restore_verify` database, compares every public table and
exact row count, checks constraints and archive `TABLE DATA` coverage, makes
the verification database read-only by default, and emits an ACL-restricted,
package-bound manifest under `C:\tmp\crm-db-clone\mn-release-backups`.

The immutable geometry publisher is also plan-only by default:

```powershell
npm.cmd run precinct-gis:delivery-publish:mn -- --package=.etl/precinct-release-candidates/MN/<candidate>/release-candidate.json --package-sha256=<sha256>
```

It verifies all 352 packaged files locally. A real upload is a separate public
production action: it requires `--write`, the exact package hash in
`CRM_MN_PRECINCT_PUBLIC_FILE_PACKAGE_SHA256`, the literal
`CRM_MN_PRECINCT_PUBLIC_FILE_WRITES=I_ACKNOWLEDGE_PUBLIC_IMMUTABLE_GEOMETRY_UPLOAD`,
and a nonempty `CRM_MN_PRECINCT_PUBLIC_FILE_AUTHORIZATION_ID`. It uses a public
Vercel Blob store, refuses overwrites and random suffixes, uploads every county
file before any index, re-downloads and re-hashes every object, and records the
single HTTPS origin. As of 2026-08-08 the linked Vercel project has an existing
Blob token/store, but no Minnesota delivery receipt has been produced. Any
future store provisioning or associated cost remains an explicit external-
resource choice. The resulting origin must be set as
the server-only `CRM_PRECINCT_GEOGRAPHY_ORIGIN` in a protected preview before
manifest activation.

## Required go/no-go gates

All of these gates must be `passed` in the reviewed release record:

1. Source, normalized geometry, crosswalk, candidate delivery, migration, and
   canonical-manifest preimage hashes match the local package.
2. The local database validator proves 16,435 reporting units, 49,305 candidate
   rows, 16,435 geometry features, 16,435 reviewed exact crosswalks, 125
   zero-vote units, and zero invalid constraints.
3. A clean release branch/worktree contains only the intended dependency set.
   Shared files are reviewed at the patch-hunk level because the current
   worktree contains unrelated work.
4. A current read-only production preflight records the schema, PostgreSQL
   version, existing Minnesota election/year row sets, constraints, current
   public revision, and current API baseline.
5. A fresh production backup is created, checksummed, and restoration-tested or
   otherwise verified under the normal production database procedure.
6. The additive `drizzle/0008_typical_thunderbolts.sql` migration is reviewed
   against the current production schema. The 2026-08-05 observation that it was
   absent is historical evidence, not a current preflight.
7. The separately guarded production transaction implementation is independently
   reviewed. The original Minnesota loader continues to accept only loopback
   `crm_clone_dev`; the release runner must retain its package, evidence,
   authorization, role, time-window, endpoint, transaction, and hidden-load
   guards.
8. A protected deployment preview confirms all four draft manifests, immutable
   files, API responses, and maps against the production-shaped database.
9. A deployment window, operator, verifier, rollback owner, and rollback
   decision point are recorded.
10. The project owner explicitly authorizes production migration, data load,
    public geometry delivery, and application cutover.

## Production sequence after explicit authorization

### 1. Isolate and review

Create a clean review branch/worktree from the intended base commit. Apply only
the package's hashed dependency set. For shared files, extract and review the
Minnesota/precinct-specific hunks without discarding unrelated user work.

Run type checking, focused precinct tests, the full precinct suite, production
build, maps validation, provenance validation, source-package validation, and
the normal Minnesota advisory report. Advisory indicators are review signals,
not evidence of fraud or misconduct.

### 2. Backup and read-only preflight

Before any write, create the verified production backup and perform the current
read-only preflight. Stop if the schema, live Minnesota year set, row counts,
source records, or public revision differ from the approved release record.

Compare the live and proposed Minnesota years explicitly. No existing year or
row may be removed merely because it is absent from a candidate artifact.

### 3. Apply the additive schema

Apply the exact pinned migration in a single migration transaction. Verify all
four tables, three nullable reporting-unit foreign-key columns, indexes, unique
constraints, foreign keys, and check constraints. Stop and roll back if any
object conflicts with current production.

### 4. Load data while public delivery remains blocked

In one reviewed Minnesota-specific transaction:

1. acquire an advisory lock;
2. verify all source, migration, manifest-preimage, normalized, and crosswalk
   hashes again;
3. upsert the four election/contest/candidate and source-document identities;
4. upsert 16,435 year-scoped precinct reporting units;
5. upsert 49,305 certified candidate rows linked to the same-election reporting
   units;
6. insert or replace four reviewed-but-not-yet-public geography versions;
7. insert 16,435 source-feature identities and 16,435 reviewed exact-ID
   crosswalks;
8. verify totals, zero-vote units, same-election links, source provenance, and
   constraints inside the transaction;
9. commit only if every expected count and semantic hash agrees.

The canonical manifests remain blocked throughout this phase, so the public
manifest and precinct-geometry APIs cannot expose the new layers. Both public
data paths also have Minnesota-specific fail-closed database gates. County-
scoped and unscoped precinct result queries require the exact same-election
reporting unit, authorized source document, `published` geography version,
reviewed exact crosswalk, and matching release-package metadata. The precinct-
geometry route additionally binds the selected static manifest's exact SHA-256,
delivery declaration, election, feature count, and release identity to the
same publication audit. Hidden-load rows therefore remain unavailable even
through direct results or geometry requests.

### 5. Validate the hidden load and protected preview

Verify all four statewide result-unit sets and a county-scoped sample for every
year. The established Hennepin County expectations are:

| Election | Hennepin features/results joined |
| --- | ---: |
| 2012 | 405/405 |
| 2016 | 422/422 |
| 2020 | 425/425 |
| 2024 | 396/396 |

Use the guarded local rehearsal to show the correct year, candidate names,
geometry, source authority/link, full terms, exact join counts, zero-vote
styling, visible OpenStreetMap attribution, and county-bounded tile requests.

The protected deployment proves the production build and environment shape,
not an early public-data bypass. Record its exact branch Git commit SHA, Git
tree SHA, deployment ID, Deployment Protection check, five tracked activation
hashes, and configured Blob origin. Reverify the 352 immutable Blob objects
against the publication receipt. While the database versions remain blocked,
direct Minnesota precinct results must be empty and the precinct-geometry route
must return its no-store `404` publication-inactive response. That fail-closed
behavior is the expected preview result. The full end-to-end public map check
occurs immediately after the atomic database transition inside the rollback
window.

### 6. Cut over the application

Upload and verify the 348 immutable county GeoJSON files first, then the four
immutable parent indexes. Never overwrite an immutable delivery URL. Any
changed byte requires a new manifest ID or delivery URL and a new review
package.

The linked Vercel project uses `main` as its production branch. A merge to
`main` automatically creates the production deployment; there is no later
manual-alias-only safety gate. The activation deployment by itself is not the
public data cutover: both Minnesota precinct endpoints remain fail-closed while
the database geography versions are blocked. Do not merge an activation
candidate until the protected preview proof is complete, the release roles and
window are agreed, the exact geometry origin is configured for Production, and
the previous gate-capable production deployment is recorded as the exact
rollback target. The final `GO_PUBLIC` decision remains unavailable until the
activation deployment itself is READY/PROMOTED and both public precinct
endpoints have been observed to stay blocked.

The canonical and database publication transition is executable only through
the receipt-bound follow-on tools. After the hidden-load receipt and Blob
publication evidence exist, generate the static protected-preview candidate:

```powershell
npm.cmd run precinct-gis:public-activation:mn -- --package=$PKG --package-sha256=$PKG_SHA --production-receipt=$DB_RECEIPT --production-receipt-sha256=$DB_RECEIPT_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_RECEIPT_SHA
npm.cmd run precinct-gis:public-activation:mn -- --package=$PKG --package-sha256=$PKG_SHA --production-receipt=$DB_RECEIPT --production-receipt-sha256=$DB_RECEIPT_SHA --blob-evidence=$BLOB_RECEIPT --blob-evidence-sha256=$BLOB_RECEIPT_SHA --write
```

The writer verifies the package's four blocked canonical preimages, the exact
committed hidden-load totals, every one of the 352 public object hashes/URLs,
and the single credential-free HTTPS origin. It changes only the canonical
registry and four year-specific coverage inventories. It writes a hash-pinned
activation candidate under `.etl/precinct-public-activations/MN`; it does not
contact production, change database status, deploy, promote, or publish Git.
Commit those five tracked changes on a review branch. Set the exact origin for
the Preview environment only, trigger a new preview deployment, and record its
deployment ID, URL, Deployment Protection check, exact 40-hex Git commit SHA,
and exact 40-hex Git tree SHA. Verify that the preview commit SHA is the
activation-branch HEAD, its tree SHA is `git rev-parse HEAD^{tree}`, and its five
tracked output hashes match the activation candidate. An environment change is
not retroactive: an older preview deployment cannot be used as evidence.

After an independent person verifies the preview, generate the separate public
authorization template. Leave it at `NO_GO_PUBLIC` until the production
deployment proof described below exists:

```powershell
npm.cmd run precinct-gis:publication-status:mn -- --activation=$ACTIVATION --activation-sha256=$ACTIVATION_SHA --write-authorization-template
```

The eventually completed record must change `decision` to `GO_PUBLIC`, bind the exact
release and activation hashes and both receipt hashes, name authorizer,
operator, verifier, and rollback owner, use at least two distinct people with
operator different from verifier, record an active UTC deployment/rollback
window, identify a protected preview verified within four hours, and include a
production deployment verified within four hours and no earlier than the
preview verification. The production evidence must record its deployment ID,
URL, 40-hex Git commit SHA, 40-hex Git tree SHA, READY and PROMOTED checks, exact
origin, all five activation hashes, and successful observations that results
remain empty and geometry remains `404` while the database is blocked. Preview
and production commit SHAs may differ after a merge or squash, but their Git
tree SHAs must be identical. The operator checkout must be tracked-clean, its
HEAD must equal the preview commit SHA, and its tree SHA must equal both
deployment tree SHAs. Fetch the relevant `origin` history immediately before
the database runner so it can resolve the recorded production and rollback
commit objects locally; each recorded commit's `^{tree}` must equal its claimed
tree SHA. The same authorization must pin the immediately previous production
deployment by ID, URL, commit SHA, and tree SHA, with fresh checks that it is
gate-capable, has blocked static manifests, and blocks both precinct endpoints.
`protectionVerified`, READY, PROMOTED, and the endpoint observations remain
explicit human attestations; retain the corresponding Vercel checks in the
release evidence.

Set the exact same origin for the Production environment before the activation
merge. This does not change an existing deployment; it ensures the next `main`
deployment receives the value. Record and freshly verify the current
gate-capable production deployment as `rollbackTarget` before merging. The
project owner then merges the activation PR. Wait for the exact activation
deployment to become READY/PROMOTED, record its production deployment ID,
commit SHA, and tree SHA, verify its five tracked hashes and origin, and confirm
that both Minnesota precinct endpoints still fail closed against the blocked
database state. Its tree SHA must equal the protected preview tree SHA even if
the merge commit SHA differs. Place a hold on unrelated `main` merges for the
remainder of the cutover/rollback window. Fill those facts into
`productionDeployment` and the pinned facts into `rollbackTarget`, have the two
people complete the final `GO_PUBLIC` record, and hash that exact authorization
artifact.

Only after that deployment proof, set all exact acknowledgements and run the
atomic database status transition as the single public data switch:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_WRITES='I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_CUTOVER'
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_CANDIDATE_SHA256=$ACTIVATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_AUTHORIZATION_SHA256=$PUBLIC_AUTHORIZATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_ID=$ACTIVATION_ID
npm.cmd run precinct-gis:publication-status:mn -- --activation=$ACTIVATION --activation-sha256=$ACTIVATION_SHA --authorization=$PUBLIC_AUTHORIZATION --apply
```

The runner accepts only an explicitly supplied unpooled production URL. In one
transaction it revalidates all 16,435 reporting units, 49,305 result rows,
certified candidate totals, 125 zero-vote units, source provenance, exact
features/crosswalks, same-election links, and constraints. It then changes only
the exact four package-bound geography versions to `published`, updates exact
release-bound metadata counts, stores the activation and authorization hashes
plus the exact pinned rollback target in the database, increments the public
revision, and verifies every postcondition. It is idempotent only for that exact
activation. It never deploys or publishes Git.

After this transaction succeeds, immediately run the post-cutover checks
against the already READY/PROMOTED activation deployment. The database
transaction is the public map/results cutover; the runner neither deploys nor
publishes Git.

If the database commit succeeds but writing its local receipt fails, recover
the receipt without extending the expired write window or mutating production:

```powershell
$env:CRM_DATABASE_ENVIRONMENT='production-read-only'
$env:CRM_MN_PRECINCT_PUBLIC_RECEIPT_RECOVERY='I_ACKNOWLEDGE_READ_ONLY_PUBLICATION_RECEIPT_RECOVERY'
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_CANDIDATE_SHA256=$ACTIVATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_AUTHORIZATION_SHA256=$PUBLIC_AUTHORIZATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_ID=$ACTIVATION_ID
npm.cmd run precinct-gis:publication-status:mn -- --activation=$ACTIVATION --activation-sha256=$ACTIVATION_SHA --authorization=$PUBLIC_AUTHORIZATION --recover-receipt
```

Recovery opens a read-only transaction and succeeds only when all four live
versions, exact metadata, original commit time, authorization hash, and stored
revision match. It cannot perform the initial publication.

Rollback is a separate decision. Hold all new `main` merges and automatic
production cutovers. Verify that the exact `rollbackTarget` pinned in the
publish receipt is still available, but do not restore it yet. Use the exact
publish receipt to create a rollback template and complete it as `GO_ROLLBACK`
with a new rollback ID, two people, an active window, the unchanged pinned
target, and explicit acknowledgements that the database will be blocked first
and the application will be restored only afterward:

```powershell
npm.cmd run precinct-gis:publication-status:mn -- --activation=$ACTIVATION --activation-sha256=$ACTIVATION_SHA --rollback --publication-receipt=$PUBLICATION_RECEIPT --publication-receipt-sha256=$PUBLICATION_RECEIPT_SHA --write-authorization-template
$env:CRM_DATABASE_ENVIRONMENT='production'
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_WRITES='I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_ROLLBACK'
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_PACKAGE_SHA256=$PKG_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_CANDIDATE_SHA256=$ACTIVATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_AUTHORIZATION_SHA256=$ROLLBACK_AUTHORIZATION_SHA
$env:CRM_MN_PRECINCT_PUBLIC_ACTIVATION_ID=$ROLLBACK_ID
npm.cmd run precinct-gis:publication-status:mn -- --activation=$ACTIVATION --activation-sha256=$ACTIVATION_SHA --rollback --publication-receipt=$PUBLICATION_RECEIPT --publication-receipt-sha256=$PUBLICATION_RECEIPT_SHA --authorization=$ROLLBACK_AUTHORIZATION
```

Run the database rollback while the activated, gate-capable application is
still live. The rollback must match the publish receipt's activation ID,
authorization hash, revision, original commit time, and exact pinned application
target. The runner rehashes and revalidates the original `GO_PUBLIC`
authorization referenced by the publication receipt and requires the same
target in the live publication metadata, so a rewritten receipt cannot
substitute another deployment. It restores the original four caveats, returns
exact release metadata to unauthorized/blocked, preserves both audit records,
and increments the public revision. At that moment both precinct endpoints fail
closed. Only then restore the exact pinned previous deployment and verify its
blocked static manifests and both blocked endpoint observations. The rollback
never deletes immutable Blob objects. If application restoration is delayed,
the data stays hidden behind the blocked database gate. A rolled-back release
cannot be republished in place; reseal and review a new release candidate rather
than erasing its retained activation history.

### 7. Post-cutover verification

Immediately verify:

- one eligible geography manifest for each of the four election dates;
- the manifest hash, delivery hash, feature count, parent count, and source
  terms;
- statewide precinct result counts and all 125 zero-vote units;
- Hennepin's four expected geometry/result joins;
- several additional county scopes, including at least one rural county;
- 2012 Obama/Romney, 2016 Clinton/Trump, 2020 Biden/Trump, and 2024
  Harris/Trump labels;
- public API cache behavior, application logs, error monitoring, and the public
  revision;
- unchanged county aggregates, review rows, turnout rows, historical tables,
  and non-Minnesota data.

## Stop and rollback conditions

Stop immediately if any frozen hash, count, certified total, year set,
same-election identity, source term, constraint, API response, or UI result
differs from the reviewed package.

Before a transaction commits, let the transaction roll back and leave canonical
manifests blocked. After application cutover, restore the immediately previous
application deployment so the eligible manifests and geometry endpoints
disappear together. Restore the verified pre-release database backup, or use a
separately reviewed Minnesota-only rollback, if committed database changes must
be reversed.

Do not drop the additive precinct schema during an ordinary Minnesota rollback;
other states or subsequent work may depend on it. Do not overwrite or reuse the
immutable geometry URLs. Unreferenced immutable files may remain while the
previous manifest deployment is restored.

## Production authorization boundary

The following are separate, explicit production decisions:

- applying migration 0008;
- running a production Minnesota data transaction;
- changing geography-version publication status;
- provisioning public immutable-object storage and uploading geometry;
- setting the server-side immutable geometry origin;
- changing canonical manifest validation/delivery fields or registry rows;
- merging the activation commit to the auto-deployed `main` production branch;
- publishing a Git branch or pull request.

Local generation, testing, draft manifests, and `.etl` release-package writes do
not authorize any of those actions.
