# Connections Research Setup and Verification

The `/connections` explorer supports dated, source-linked reporting, ownership, technology, and procurement relationships. `/admin/connections` provides private research and designated-publisher review. New database-backed releases and Texas result-lineage reads are disabled by default. Implementing this workflow does not approve a production migration, data promotion, storage provisioning, or publication.

## Public and private boundaries

The public graph has draggable and pinnable nodes, selectable edges, date and geography filters, evidence classifications, a timeline, contract records, bounded connection paths, local saved views, shareable filters, and a source catalog that works without JavaScript. A color legend identifies relationship types; labels appear on selected or hovered edges, while the relationship list retains every label. Ownership links never become results-delivery paths. Unknown end dates do not establish continuing activity; document publication, observation, and effective dates remain separate.

With `CONNECTIONS_PUBLIC_RELEASES_ENABLED=0`, the page adapts the existing 30-node, 42-relationship, 28-source documentary catalog. Its earlier content checks are labeled as content checks, not retained-source verification. The public release API returns 503 in this state. With the flag enabled, only the current immutable reviewed release is served; a missing or corrupt release fails closed instead of substituting drafts or the old catalog.

Private research records include assignees, search history, working notes, custodian routing, source copies, and editorial decisions. Public responses whitelist relationship facts, public source URLs, hashes, exact locators, short excerpts, and reviewed findings. They do not serialize private workspace documents, storage paths, actor identities, or retained document bytes. Source-copy downloads and text comparisons require an authorized researcher session and use private no-store responses.

## Configuration and migration

Use the existing Clerk sign-in integration. Only verified email addresses in `CONNECTIONS_RESEARCHER_EMAILS` or `CONNECTIONS_PUBLISHER_EMAILS` may enter the editor. Publisher membership grants research access as well; neither the layout-admin allowlist nor a browser-supplied role grants research publication rights. Configure actual intended people through protected settings, not source files.

The research repository never inherits `DATABASE_URL`. Set a separate explicit `CONNECTIONS_DATABASE_URL` and `CONNECTIONS_DATABASE_ENVIRONMENT`:

- Local: `local`, loopback port 54329, database `crm_clone_dev` or `crm_connections_dev`. Writes additionally require `CRM_DATABASE_LOCAL_WRITES=true`.
- Preview or production: the environment must match `VERCEL_ENV`; `CONNECTIONS_APPROVED_DATABASE_HOST` and `CONNECTIONS_APPROVED_DATABASE_NAME` must exactly match the approved target.
- All editing requires `CONNECTIONS_WRITES_ENABLED=1`. Production editorial writes additionally require separately approved `CONNECTIONS_PRODUCTION_EDITORIAL_WRITES_APPROVED=1`.

Connection-address options may not override the target. Local addresses cannot include query options; remote addresses permit only supported secure `sslmode` and `channel_binding` options on the standard PostgreSQL port.

Migration `drizzle/0010_connection_research.sql` creates separate workspace, immutable workspace revision, immutable public release, and publication-pointer tables, and adds nullable `result_rows.source_locator`. Its journal and snapshot preserve migration 0009 and add only these changes. Apply it only to a separately approved target after a disposable rehearsal; do not use an unreviewed schema push against an existing database. Existing result rows remain unchanged and cannot receive retrospective verified lineage.

The fixed MCP rehearsal migration list now includes 0010. The project MCP skill requires restarting Codex after this server-code change before running the rehearsal tool. Docker Desktop must be running. The fixed native-import rehearsal checks migrations and importer behavior, but an additional authenticated researcher/publisher exercise is still required for the new editorial workflow.

Use a dedicated private Blob store token in `CONNECTIONS_BLOB_READ_WRITE_TOKEN` for deployed source copies. No public layout-asset token is reused. For development only, `CONNECTIONS_LOCAL_ARCHIVE=1` reads and appends content-addressed copies beneath ignored `.etl/connections`; redirected or escaping paths are rejected. Production does not use this local fallback. Provisioning a store and moving retained copies into it require separate approval.

## Source collection and editorial review

1. Register the exact public HTTPS URL and source authority. A changed URL needs a new stable source ID. Do not collect private correspondence, credentials, nonpublic records, or licensed AP feeds.
2. Retain a copy using the registered-source collector or the authenticated upload control. Browser uploads are limited to 3 MiB; the collector is limited to 20 MiB and checks public DNS addresses and redirects. HTML is retained as partial, nonexecuted source content. A public-source attestation is required for either descriptor import or upload.
3. Import the collector's revision descriptor while its exact private bytes are available. The server checks size and SHA-256. Revisions are immutable. Re-importing an older revision cannot roll the latest pointer backward and hide a pending comparison.
4. Compare source revisions in the editor. PDF page text and escaped text/HTML derivatives are aids to review, not substitutes for the retained document. Record each supporting, contradicting, or contextual passage with its exact page, section, or data pointer.
5. A designated publisher approves the source revision, then reviews each submitted relationship for dates, scope, and neutral wording. A newly captured but unreviewed source revision blocks affected relationships from advancing to another release. Existing public snapshots remain unchanged during research.
6. Publish explicitly with a decision note. Semantic edits reset relationship approval. Replacement releases cannot silently omit existing public relationships: approve their replacements or explicitly withdraw them. Initial migration likewise requires review or explicit withdrawal of all 42 legacy relationship IDs.

Example local collection, with no database or public writes:

```powershell
node --experimental-strip-types scripts/collect-connection-sources.ts --source=tx-systems-2026
node --experimental-strip-types scripts/collect-connection-sources.ts --source=tx-2024-official-county-results --retained-official-tx-county
```

The second command is restricted to the registered official retained Texas County.json artifact. It records an unknown original retrieval date rather than presenting the local copy as a fresh HTTP retrieval. A private workspace export may be placed at `.etl/connections/registry.json` for `--workspace-registry` collection; never commit that export. `--upload-private` is an explicit separate upload action and is not needed for local collection.

Copies are stored before version-checked registration. A concurrent edit can leave an unregistered private content-addressed copy; retry registration after reloading, or reconcile these copies manually under the retention policy. Never delete a registered immutable artifact to resolve a conflict.

Withdrawal immediately publishes a filtered snapshot of the current public release. A question finding that depended on the withdrawn claim returns to open. Restoring an earlier public release changes only the public pointer, not the private workspace, and refuses to restore withdrawn relationships. Public question findings must link to published evidence relationships. Records-request downloads are manual drafts, mark unverified custodian routing, and request fee estimates; no request is sent and no fee is accepted.

## Texas pilot and result lineage

The draft bootstrap preserves the old catalog without manufacturing source history. The five existing public questions remain open and included in the next explicitly published release; new research questions start private. It adds Anderson, Harris, and Travis county inventory observations from the Texas SOS inventory revised September 1, 2026, with locators on PDF pages 1, 15, and 32. Inventory entries do not establish use in the November 2024 election. County-specific deployment, acceptance, testing, contracts, amendments, and election-night reporting records remain separate research questions. No county procurement amounts or execution dates have been invented.

The DHS Cumulus award draft identifies the named contracting entity and award identifier but leaves ceiling, obligated amount, actual spend, and performance period unknown. Department-wide cloud procurement does not establish deployment by SAVE or Texas TEAM. Economic and voting interests are separate fields; unknown percentages remain unknown.

`RESULT_LINEAGE_ENABLED=1` enables only Texas 2024 county presidential lineage. The result drawer inspects the selected county through `/api/v1/result-lineage`, using the stored code or canonical `county:48xxx` tag. Existing synthetic jurisdiction codes are not changed. Precinct/VTD, turnout, review, and historical records are outside this first source family.

The fresh parser stores complete candidate contribution pointers and the county total pointer for all 254 counties. Staging records the observed source artifacts, parser-code hash, canonical config hash, and build time. The importer adds the exact staging-byte hash and retains locators for both Neon and PostgreSQL. Migration 0010 is required before promoting an artifact containing these new locators; missing schema causes failure rather than a fabricated chain.

A candidate is `source_and_import_matched` only when the official source identity, retained reviewed complete JSON revision, source/import digest agreement, expected parser and manifest version, raw candidate pointer set, candidate aggregation, county total, and promoted import fingerprints match. Revision selection uses the exact imported source digest, not revision-array ordering. Legacy imports lacking this evidence remain `incomplete`.

The endpoint checks a stable nonnull public-data revision before and after its row read and optionally rejects a stale `dataRevision` token from `/api/results`. The browser separately compares every inspected candidate and total with the displayed row. Server source/import agreement is not browser delivery verification, an audit, or evidence of misconduct.

Public endpoints and their schemas are described in `/api/v1/openapi`:

- `/api/v1/connections`: reviewed release, schema `connections/2`.
- `/api/v1/connections/sources/{id}`: published revision metadata and passages; `id` is a revision ID.
- `/api/v1/result-lineage`: strict pilot selection, schema `result-lineage/1`; disabled/unavailable is 503, stale/unstable revision is 409.

## Local verification and activation gates

Focused checks:

```powershell
npm.cmd run test:connections
node --experimental-strip-types tests/api/native-import.test.mjs
node --experimental-strip-types tests/api/crm-database-rehearsal.test.mjs
python -m unittest tests.python.test_pipeline.PipelineTests.test_texas_county_json_parser_builds_county_rows_with_vtd_review
npm.cmd run typecheck
npm.cmd run build
$env:PLAYWRIGHT_PORT = '3235'
npx.cmd playwright test tests/e2e/election-connections.spec.ts tests/e2e/connection-research.spec.ts --workers=2
```

Policy and browser tests cover public/private separation, role enforcement, review resets, immutable source registration, publication coverage, date uncertainty, manual requests, raw-source lineage, keyboard edges, saved views, source downloads, no-JavaScript sources, mobile overflow, and accessibility. The rehearsal unit tests use mocked disposable resources; they are not proof that a real database migration ran. Before activation, exercise real Clerk identities, denied roles, both researcher and publisher workflows, private storage, optimistic conflicts, source comparisons, publish, withdrawal, public-only rollback, and a reviewed Texas import plus browser value checks on a disposable/approved preview target.

October 11 local evidence:

- Guarded Texas config validation and staging import succeeded. The staged county result count is 254 and presidential total remains 11,388,674. All 254 raw pointer sets and totals were checked.
- Before/after comparison confirms identical result, review, turnout, and historical rows except the new result-source locator field. Source comparison text extraction succeeded on all three pilot inventory pages.
- The full existing `npm test` chain passed, including 195 Python tests with one skip and validation of all 51 state configs. The 29 focused connections tests and all 12 browser tests passed; the affected graph/accessibility checks were rerun after the final label adjustment. Platform-dependent symlink checks were skipped where unavailable. Type checking and the production build passed. These are local results, not verified CI or deployed behavior.
- Staging SHA-256 is `636111ff7852ad8e3363ad3aa8c51a3393dcbb29f85a7ee15ba7554257d8b0db`; the retained official county JSON SHA-256 is `fa818d6a89dd0b6ec7dd5f04120dc3073d2a83edba51c8dafbbd0186b1492b9a`. Previous local staging was preserved at `.etl/connections/before-lineage-tx-2024-staging.json`.
- The automatic end-state report calculated 309 advisory indicator rows from 9,348 review rows, covering 172 counties/jurisdictions and 172 areas: vote-share pattern 150, average down-ballot difference 158, and down-ballot outlier 1. Broad ticket-splitting patterns remain advisory. Production counts and promotion were not checked or performed.
- Validation audit: `.etl/mcp-runs/2026-10-11T22-38-30-082Z-afb76eed/manifest.json`. Import/indicator audit: `.etl/mcp-runs/2026-10-11T22-38-35-824Z-61fc0fac/manifest.json`.
- 22 of the original 28 URLs were captured privately, plus the Texas inventory and retained county JSON. All 24 retained revisions await editorial comparison/approval. Six original URLs returned HTTP 403: `paramount-control`, `paramount-roles`, `paramount-close`, `wbd-close`, `oracle-role`, and `openai-oracle`. A browser-readable prior content check is not a successful fresh capture; SAM.gov HTML is partial.
- Real database rehearsal remains unverified because Docker is stopped and the connector requires restart. No source approvals, public release, production migration, production promotion, Blob upload, or records request occurred.
- Dependency audit reports 23 advisories, including two critical advisories in existing Next.js and shell-quote dependencies. No graph-library advisory was reported. Resolve and verify these separately before deployment; this feature does not silently upgrade unrelated dependencies.

## Feature-only release integration

The release branch was based on current `main`, not the older equipment checkout. Its migration is `0010_connection_research`, following and preserving `0009_public_wolfpack`. The existing locked React Flow dependency is reused; no dependency upgrade is included. Main's state-specific parsers, importer preservation guards, geometry constraint, SEO entries, and equipment/district API contracts are retained. Only the connections additions and Texas lineage changes are included. Private `.etl` research exports and source bytes remain excluded.
