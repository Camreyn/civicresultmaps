# Precinct GIS Implementation Program

This is the durable execution plan and work log for election-versioned local
geography in CivicResultMaps. Read it before changing precinct, ward, VTD,
election-district, town, or other local-boundary collection, identity,
crosswalk, validation, API, or map code. Update the status table and append an
evidence-backed work-log entry whenever a milestone changes.

The project remains public-interest, source-driven, and fail-closed. A map
relationship is a reviewed data relationship, not evidence of fraud or
misconduct. Production promotion is not authorized by this plan.

## Program Outcome

CivicResultMaps will preserve official local result units, collect the boundary
edition applicable to a specific election event, crosswalk the two without
relying on display names, validate geometry and vote reconciliation, and deliver
only approved map layers. Current county maps and county jurisdictionTag
behavior must remain backwards compatible.

The program is complete when:

1. Shared source, election-event, reporting-unit, geometry-version, feature, and
   crosswalk contracts are implemented and tested.
2. Every colored result unit has an exact or reviewed relationship to the
   geometry version used for that election. Non-geographic and unmatched votes
   remain visible in totals and are never silently assigned.
3. Iowa and Virginia exercise two official package patterns, while Wisconsin
   proves that a cross-vintage or row-allocation mismatch is rejected.
4. Precinct delivery uses immutable, versioned assets and an explicit manifest;
   the UI falls back to county geography when no approved local layer exists.
5. Every state/election in scope has a disposition of mapped, partial,
   official_geometry_unavailable, or blocked, with authority, URLs, retained
   artifacts, parser paths, counts, caveats, and confidence.
6. Historical 2020, 2016, and 2012 general-election layers are added only where
   an election-applicable official boundary or reviewed official crosswalk can
   be established. Current boundaries are never silently applied to old votes.

## Non-Negotiable Model

Keep these objects separate:

- Election event: date, type, office, and source election identifier. A year
  alone is not a safe boundary version.
- Reporting unit: the election source result identity, including its parent
  county/locality and whether it is geographic.
- Geometry version: one official or derived boundary edition with source,
  effective-date/vintage, CRS, derivation, and review status.
- Geometry feature: one version-specific polygon or multipart feature with its
  native source ID and parent geography.
- Crosswalk: an explicit reviewed relationship between reporting units and
  geometry features, including cardinality and match method.

Do not use normalized display names, localUnit, or the county-focused
jurisdictionTag as universal precinct identity. Do not split votes by area,
population, or spatial overlap unless an official allocation source explicitly
supports it. For a one-to-many boundary relationship without vote allocation,
dissolve/display the aggregate or leave it uncolored.

## Canonical Identity And Metadata

A source reporting-unit identity is scoped at least by:

state + election_event + reporting_grain + parent_geoid + source_unit_id

A geometry feature identity is scoped by:

geometry_version + source_feature_id

Every retained geometry artifact records:

- Source authority, HTTPS URL, retrieval time, raw local path, byte count, and
  SHA-256 checksum. Large structured raw payloads use deterministic lossless
  gzip when practical; evidence then records and validation checks both the
  compressed and uncompressed byte counts and SHA-256 checksums.
- Election date/type, reporting geography, boundary vintage/effective date, and
  vintage status: election_date_confirmed, current_only, or unknown.
- Native and served CRS, format, parser/normalizer, feature count, native ID
  fields, parent geography fields, and license/terms where available.
- Derivation method such as official_export, official_service, official_crosswalk, availability_diagnostic, or digitized_map;
  caveats; and confidence.
- Crosswalk artifact, method, relationship cardinalities, unmatched units and
  features, non-geographic units, reconciliation totals, and display-safety
  decision.

## Repository Layout

Use immutable, election-scoped paths:

    data/precinct-geometry/<STATE>/<election-id>/manifest.json
    data/precinct-geometry/<STATE>/<election-id>/raw/<county-or-locality>/
    data/precinct-geometry/<STATE>/<election-id>/normalized/
    data/precinct-geometry/<STATE>/<election-id>/crosswalk/
    data/precinct-geometry/<STATE>/<election-id>/reports/
    data/precinct-geometry-coverage-inventory.json
    data/precinct-geometry-coverage-inventory-2020.json
    data/precinct-geometry-coverage-inventory-2016.json
    data/precinct-geometry-coverage-inventory-2012.json
    public/data/geography/<state>/<election-date>/<level>/<version>.<format>

Retained raw source payloads are immutable once their canonical, optionally
gzip-compressed form and checksums are recorded. Normalized files preserve native
identifiers and source attributes. Browser artifacts contain only reviewed
presentation/join fields and use content- or version-addressed paths. Tests that
exercise source-tamper rejection must mutate only a disposable alternate package
root and must prove that canonical raw bytes and content timestamps remain
unchanged.

Refresh the canonical manifest registry with
`npm run refresh:precinct-registry`. Refresh an election-scoped 51-jurisdiction
ledger with the refresh-precinct-geometry-coverage-inventory script and its
election-id and inventory arguments, and validate the registry plus all four
ledgers through `npm run validate:precinct-geometry`. The ledgers are the
authoritative queues for Phases 9 and 10; this work log preserves the evidence
behind each disposition.

## Implementation Status

| Phase | Deliverable | Status | Acceptance evidence |
| --- | --- | --- | --- |
| 0 | Durable plan, required-read instruction, repository audit | Complete | This file; AGENTS.md; current-code and source audit |
| 1 | Shared TypeScript manifest/crosswalk contracts and JSON registry | Complete | precinct-geography-contract.test.mjs; blocked Wisconsin record |
| 2 | Additive geometry-version, feature, reporting-unit, and crosswalk tables | Complete | 0008_typical_thunderbolts.sql; schema/import tests; Drizzle check |
| 3 | Generic fail-closed source/geometry/crosswalk/reconciliation validator | Complete | source-package, geometry, and crosswalk contract tests; nested raw-artifact hash verification; validate:precinct-geometry |
| 4 | Iowa 2024 official county/city package collector and candidate crosswalk | Complete | 252 retained/hash-verified ZIPs; 2,415 selected source features; 1,370 normalized county candidates; 570/1,653 pending candidate matches; delivery blocked |
| 5 | Virginia 2024 locality-package collector and candidate crosswalk | Complete | Fairfax official current package retained as current_only; 264 colorable candidates remain pending; one non-geographic unit and one reviewed source alias; delivery blocked |
| 6 | Wisconsin regression in generic validator | Complete | 7,086-feature retained layer validates but current-only vintage, 25 unmatched rows, and 3,478 pending relationships keep delivery blocked |
| 7 | Geography-manifest API and immutable local delivery builder | Complete | Eligible-only manifest API; parent-scoped hash-verified delivery API; deterministic builder; API/delivery tests |
| 8 | Zoom/county-gated local map adapter with county fallback | Complete | County-gated eligible-only UI; explicit reporting-unit joins; accessible select/non-focusable paths; production-build API smoke check and review |
| 9 | 2024 fifty-state/DC acquisition waves | Complete | Waves 1-17 reviewed all 51 jurisdictions; all 51 registered 2024 packages are blocked, no public-eligible 2024 layer exists, and NY/SD/UT passed independent review |
| 10 | 2020, 2016, and 2012 historical waves | Complete | All 51 jurisdictions are reviewed and blocked for each of 2020, 2016, and 2012; all election-scoped ledgers validate, and the final 207-file precinct suite passes |
| 11 | Integrated validation and documentation closeout | Complete | Final 207-file precinct suite, typecheck, local MCP precinct validator, preserved 55-page production build/API smoke evidence, source/turnout/map/provenance validators, and bounded diff review pass locally |

Statuses are Not started, In progress, Blocked, or Complete. Do not mark a phase
complete without naming its validation evidence in the final column.

Phases 0-8 and 11 form the reusable local foundation milestone. Phases 9 and 10
complete the first national, election-scoped acquisition review. Completing
that review does not claim nationwide precinct-map coverage: every one of the
51 jurisdictions is reviewed and blocked for each of 2024, 2020, 2016, and
2012, and no registered manifest is public eligible. The remaining work is to
resolve the documented official-source, election-vintage, identity, crosswalk,
terms, topology, and reconciliation blockers for individual state/election
packages. No production promotion occurred.

Current execution checkpoint: the 2024, 2020, 2016, and 2012 programs are each
complete through Wave 17, with all 51 jurisdictions reviewed and blocked for
each election. The canonical registry contains 204 blocked manifests and no
public-eligible manifest. This is an acquisition-review and fail-closed
inventory milestone, not a claim that 204 usable precinct layers were obtained.

## Shared Contract

Add a versioned geometry-manifest contract and registry without changing current
county API semantics. The manifest describes:

- election event and geography version;
- source artifact and normalization provenance;
- a format-discriminated delivery artifact, starting with GeoJSON and allowing
  PMTiles later without changing the outer contract;
- feature identity fields;
- result-unit crosswalk artifact and cardinalities;
- validation status, reconciliation, display safety, and caveats;
- delivery metadata that carries source authority, source URL, boundary vintage,
  and the complete license or redistribution terms into the API and UI.

The first registry entry encodes Wisconsin as a candidate/blocked local layer so
tests prove that retained geometry does not imply public eligibility.

## Database Foundation

Add without repurposing jurisdictions.geometryKey:

- geography_versions
- geography_features
- reporting_units
- reporting_unit_geometry_crosswalks

Add nullable reporting_unit_id references to result and turnout rows only after
compatibility tests exist. Initially preserve current uniqueness and county
import behavior. Extend native artifacts with optional structured reporting-unit
identity; never derive source identity solely from the display name.

Before supporting primaries or specials, replace the current year/office-only
election identity and hard-coded election date with an event-safe key. This is a
shared migration requiring regression tests across native, legacy, and starter
imports.

## Fail-Closed Validation

The generic validator rejects public row-level eligibility unless:

1. Raw artifacts exist and hashes match.
2. Authority, source URL, election event, vintage status, CRS, parser, and
   expected counts are present.
3. Normalized output is nonempty Polygon/MultiPolygon geometry with valid
   coordinate ranges and unique native IDs within the declared parent.
4. Crosswalk keys are unique or explicitly declare many-to-one/one-to-many.
5. Every colorable result unit is mapped; non-geographic and unmatched units are
   separately classified.
6. Mapped candidate totals reconcile to official parent and statewide totals,
   with explicit documented exceptions.
7. Geometry vintage is election-date confirmed or a reviewed official crosswalk
   establishes applicability.

Reports include unmatched samples, topology findings, cardinality exceptions,
vote deltas, and separate jurisdiction-level versus row-level safety decisions.

## Pilot Order

### Iowa 2024

Use the official Secretary of State county and city precinct-shapefile indexes
and the already-retained 99 county Clarity detailxml.zip result packages. Parse
both indexes into an explicit package manifest instead of guessing filenames.
Preserve county context and native fields, normalize to WGS84, and build an
ID-first crosswalk with reviewed names only as fallback. City files do not
inherit a county merely from their filenames: multi-county cities require an
explicit parent assignment or spatial/source review.

### Virginia 2024

Use official state-published locality GIS packages and retained ENR fields:
LocalityCode, PrecinctId, and names. Do not approve a current 2026 package for
the 2024 election. Locate/archive the applicable edition or mark the layer
current_only. Preserve provisional and other non-geographic reporting units.

### Wisconsin regression

Generalize the existing ward join report. The 2025-boundary/2024-result package
remains unsafe for row-level coloring while mismatches or missing official
crosswalks remain, even when municipality totals reconcile.

## Image And PDF Exception Policy

- A result-table image can be transcribed/OCR-reviewed but supplies no boundary
  geometry.
- A vector PDF or GeoPDF may be extracted and georeferenced, subject to topology,
  CRS, identity, and review gates.
- A geographically accurate labeled scan may be georeferenced with recorded
  control points and RMSE, digitized, label-reviewed, and independently checked.
- A schematic, low-resolution, unlabeled, or unreferenced image is not suitable
  for authoritative polygon display. Pursue source GIS or a records request.

Derived layers use digitized_map and retain the source-image checksum, control
points/error, tool versions, reviewer, positional caveat, and public label
"digitized from official map." Pixel polygonization never establishes precinct
identity or vote assignment.

## Delivery And UI

Do not overload /api/jurisdictions, which is the canonical county registry.
Introduce a read-only election-scoped geography-manifest API. Keep /api/results
backwards compatible while precinct result codes become parent-qualified and
reporting-unit-backed.

A first reviewed pilot may use same-origin versioned GeoJSON. The delivery
object is format-discriminated so PMTiles/vector tiles can replace GeoJSON
without changing consumers. Every delivered copy must retain its source
authority, URL, boundary vintage, and complete license or redistribution terms.
Statewide precinct rendering must not add thousands of keyboard-focusable SVG
paths. Load local geography after county selection or a zoom threshold, retain a
searchable accessible result list, and render zero-vote geographic units as a
neutral no-votes outcome rather than assigning an alphabetic candidate.

## Wave Rules

After the pilots, work in source-pattern waves and refresh inventory between
waves:

1. Statewide official FeatureServer/download.
2. Official county/locality ZIP index.
3. Decentralized county collection.
4. Vector PDF/GeoPDF.
5. Raster image/manual digitization or records-request cases.

Use three states for messy PDFs, images, local-county work, or crosswalk risk;
use at most five for ordinary source collection. A state may be inventory
complete with an evidence-backed official_geometry_unavailable or blocked
disposition; it is not map-complete.

## Verification

Run focused tests throughout, then:

    npm run typecheck
    npm run test
    npm run build
    npm run validate:source-packages
    npm run validate:turnout-packages
    npm run validate:maps
    npm run validate:provenance

Run state ETL validation/import and the advisory indicator report for any pilot
whose state artifact changes. Do not run native promotion or production writes.

Before program closeout, every retained generic source-evidence artifact must
carry exactly one artifact-level HTTPS locator (`url`, `sourceUrl`, or
`sourceUrls`). Derived and extracted artifacts also explain their derivation,
and archive members name the retained member. Global source-page lists are not
a substitute for an exact artifact-to-source mapping.

The August 2 generic-evidence retrofit is complete for 47 retained artifacts in
DC, DE, FL, GA, HI, KS, KY, MD, MI, MT, OK, PA, and WA. The mapping is an
idempotent checked script, downstream source-evidence hash references and local
manifests are synchronized, and the generic validator now rejects missing,
ambiguous, insecure, or unexplained derivative locators. Maryland deliberately
records its canonical official layer plus the legacy pagination limitation
rather than inventing request URLs that were not retained. Several early
source-package schemas (IA, MN, NC, SC, VA, and WV) use different nested layouts.
Their separate field-level audit is complete: every retained geometry package
already has an exact HTTPS URL, path, SHA-256, and byte count under the validated
source-package contract. Focused regressions additionally verify Iowa's custom
city-index evidence and all 153 linked ZIPs, plus Virginia's nested Fairfax
evidence against its verified top-level package.

## Work Log

### 2026-08-01 - Program opened

- Audited the county-oriented map, database, native importer, state configs,
  source registries, and representative official source patterns.
- Verified that local review rows are not equivalent to map polygons and no
  state has an election-versioned production precinct map pipeline.
- Tested the current Fairfax package against retained 2024 presidential result
  IDs: 264 of 266 geometry IDs matched after normalization; two current polygons
  lacked 2024 matches, and results retained provisional/dirty-ID exceptions.
  Current package metadata is not a 2024 boundary guarantee.
- Confirmed the Wisconsin candidate layer is a required rejection fixture:
  3,478 of 3,503 review rows match, with 25 unmatched and 108 row-level vote
  mismatches.
- Created this plan and added it to AGENTS.md as a required conditional read.
- Implemented and tested the shared TypeScript manifest contract, immutable
  registry, blocked Wisconsin record, artifact hash checks, polygon/multipolygon
  structure checks, WGS84 coordinate/ring checks, and parent-scoped feature-ID
  uniqueness. The normal map validator now runs this fail-closed check.
- Added the election-scoped reporting-unit and geometry schema in migration
  0008, preserving every existing county uniqueness rule and making all links
  from current row tables nullable. Drizzle migration consistency passes.
- Extended native promotion with optional structured source IDs, parent GEOIDs,
  stable event-scoped codes, reporting-unit upserts, and result/review/turnout
  references. Legacy artifacts without structured identity remain unchanged.
- Completed the generic crosswalk validator and fixtures for one-to-one,
  one-to-many, many-to-one, unmatched, and non-geographic units. It rejects
  duplicate or noncanonical reporting-unit IDs, unknown or improperly reused
  features, false reconciliation passes, and reviewed packages with pending
  relationships. TypeScript and the full precinct-geometry suite pass.
### 2026-08-01 - Iowa county-index pilot


- Browser-collected all 99 ZIP links listed by the official Iowa SOS county
  index and retained the original 4,851,440 bytes with per-package SHA-256
  checksums. The index covers 97 county parents; Kossuth and Lyon are absent.
- Parsed and normalized 1,370 source features to WGS84 candidate GeoJSON:
  1,358 Polygon and 12 MultiPolygon features. Jackson and Polk county packages
  are wrong-grain district files, and several counties contain Unassigned or
  city-aggregate features.
- Generated a fail-closed candidate crosswalk for all 1,653 Iowa result units.
  It has 570 candidate matches and 1,083 unmatched units; all 1,653
  relationships remain pending review, reconciliation is false, and no public
  delivery artifact is declared.
- Added a multi-file official source-package contract and nested validation of
  every raw ZIP path, byte count, and checksum. The full precinct suite and
  registry validator pass; npm audit reports zero known vulnerabilities.
- Added a reproducible official-city-index collector and retained all 153 city
  ZIPs plus the index evidence: 3,180,265 bytes with per-package SHA-256
  checksums. Together with the county index, Iowa now retains 252 packages,
  8,031,705 bytes, and 2,415 selected source features.
- Kept all city packages out of normalized/colorable geometry pending explicit
  parent and precinct-versus-ward review. Multi-county city names are marked
  ambiguous, all other unassigned parents remain pending, and the Pleasant Hill
  multi-layer package explicitly selects its four-feature precinct layer rather
  than the 200-feature Census-block layer.
- Re-ran Iowa validation/import locally. The staging artifact has 1,653 native
  review rows and produces 134 advisory indicator rows across 73 flagged
  jurisdictions/areas: 70 vote_share_pattern and 64
  average_down_ballot_difference. Production API/DB counts were not checked.

### 2026-08-01 - Virginia locality-package pilot

- Retained and normalized the official current Fairfax County package as a
  diagnostic current_only layer, not a 2024 boundary claim. It contains 266
  features (265 Polygon, one MultiPolygon).
- Built 264 unique pending result-to-feature candidates. One provisional result
  unit is classified non-geographic, and the official 2024 directory supports
  classifying blank zero-vote Pioneer as a source alias of numeric precinct
  0409. Current Fairfax Court and post-election Montebello features have no
  result-bearing 2024 unit. All 264 colorable relationships remain pending, so public delivery stays blocked.
- Virginia ETL validation/import passes. Its staging artifact has 2,669 native
  review rows and produces 147 advisory indicator rows across 89 flagged
  jurisdictions/areas: 83 vote_share_pattern, 61
  average_down_ballot_difference, and three down_ballot_outliers. Production
  API/DB counts were not checked.

### 2026-08-01 - Delivery, UI, and image-derived contracts

- Added eligible-only election-scoped manifest discovery and a parent-scoped
  geometry route that verifies immutable bytes and SHA-256 before filtering.
  Blocked manifests cannot be requested through the delivery route.
- Added a deterministic reviewed-delivery builder and explicit
  resultUnitCode-based joins. Display names never assign votes to polygons.
- Added a county-gated precinct detail adapter. It requests local data only
  after a canonical county GEOID is selected, bounds the feature count, keeps
  SVG paths out of keyboard focus, and leaves the existing county map intact
  when no eligible layer exists.
- Extended digitized_map manifests with georeference basis, control-point count,
  RMSE, tool, reviewer, review time, label review, and topology review. Public
  eligibility fails closed until the required recorded reviews are complete.

### 2026-08-01 - Foundation verification closeout

- TypeScript, the focused precinct suite, the optimized Next.js build, and
  source-package, turnout-package, map, precinct-artifact, and provenance
  validators pass. The build exposes the two new read-only API routes.
- A production-build smoke check returned no eligible Iowa manifests, rejected
  blocked Iowa delivery, rejected an invalid parent GEOID, and served the
  existing application successfully. No production promotion or database write
  was performed.
- A bounded independent diff review identified four fail-closed gaps: aggregate
  crosswalk relationships, crosswalk parent consistency, feature/version
  referential integrity, and office scoping in result delivery. Each was fixed,
  covered by regression tests, and the same reviewer returned a pass with no
  actionable findings.
- Final closeout passes 46 focused precinct tests, the API contract test,
  TypeScript checking, the optimized build, Drizzle schema no-drift generation,
  and the strengthened precinct registry validator. The broader ETL suite has
  one preserved unrelated Arizona fixture/config source-count drift; Iowa's
  relevant coverage test passes.

### 2026-08-01 - 2024 acquisition wave 1

- Added `data/precinct-geometry-coverage-inventory.json`, a reproducibly
  refreshed ledger for all 50 states and the District of Columbia. Wave 1
  records Iowa, Virginia, and Wisconsin as reviewed but blocked, 48
  jurisdictions as queued/not started, and zero public-eligible 2024 layers.
- Iowa retains and hash-verifies 252 official ZIPs totaling 8,031,705 bytes,
  with 2,415 selected source features. Its county packages normalize to 1,370
  candidate polygons, but only 570 of 1,653 result units have automated
  candidates; 1,083 remain unmatched, Kossuth and Lyon are absent from the
  official county index, and city-parent assignment remains unresolved. All
  relationships remain pending and public delivery stays blocked.
- Virginia's official September 4, 2024 Fairfax precinct directory establishes
  265 distinct geographic precincts. The 264 numeric ENR result units map to
  result-bearing geography; provisional is non-geographic, and the blank
  zero-vote Pioneer record is now explicitly classified as a `source_alias` of
  numeric precinct 0409. The available FeatureServer still contains a
  post-election Montebello feature and remains `current_only`, so all 264
  colorable relationships remain pending and public delivery stays blocked.
- Wisconsin's official ArcGIS metadata identifies the retained 7,086-feature
  layer as January 2025 wards and says its election values were population
  disaggregated. It therefore cannot establish vote-preserving 2024 reporting
  boundaries. Of 3,503 WEC result rows, 3,478 match candidate geometry, 25 do
  not, and 108 rows have vote mismatches (1,850 votes in absolute differences),
  so public delivery remains blocked even though municipality aggregates
  reconcile.
- Revalidated local ETL/import and advisory calculations without production
  writes. Iowa has 1,653 review rows, 134 calculated advisory rows, and 73
  flagged areas; Virginia has 2,669 review rows, 147 advisory rows, and 89
  flagged areas; Wisconsin has 3,503 review rows, 187 advisory rows, 70 flagged
  jurisdictions, and 126 flagged areas. These are advisory signals, not proof
  of fraud or misconduct. Production API/DB counts were not checked.


### 2026-08-01 - 2024 acquisition wave 2

- North Carolina's official July 23, 2024 statewide precinct ZIP is retained
  and hash-verified at 22,091,618 bytes. It normalizes to 2,656 WGS84 features
  (2,649 Polygon and seven MultiPolygon) and produces 2,655 county-plus-source-ID
  candidates for 2,658 official Real Precinct=Y presidential result units.
  Henderson CV and Wake 01-07A/07-07A remain unmatched, Durham 48 is unused,
  election-day applicability is not explicitly certified, and every relationship
  remains pending; delivery therefore stays blocked.
- Pennsylvania retains an official York County diagnostic rather than claiming
  statewide coverage. The available service has 162 features, but its item was
  created in 2025 and modified in 2026. The 162 official result units share no
  exact stable identifier with those features; equal counts are not treated as
  a join, all result units remain unmatched, and delivery stays blocked pending
  an archived 2024 edition or official crosswalk plus the other 66 counties.
- Texas retains the official election-specific Precincts24G ZIP: 46,925,672
  bytes, 9,657 features, and all 254 counties. The candidate crosswalk contains
  9,489 exact and 215 trailing-letter aggregate candidates across 9,712 VTD
  result units, with eight unmatched units, 77 unused polygons, and 223 result
  units collapsing onto 94 polygons. Candidate-mapped totals remain short by
  11,296 presidential and 11,270 U.S. Senate votes, so all relationships remain
  pending and delivery stays blocked.
- Standardized all six reviewed jurisdictions under canonical
  `data/precinct-geometry/<STATE>/<election-id>/manifest.json` paths and added
  a deterministic registry refresh command. Registry and nested artifact
  validation cover all six blocked manifests; the focused precinct suite passes.
- Revalidated local ETL/import and advisory calculations without production
  writes. North Carolina has 2,658 review rows, 206 advisory rows, and 86 flagged
  areas; Pennsylvania has 9,154 review rows, 111 advisory rows, and 66 flagged
  areas; Texas has 9,348 review rows, 309 advisory rows, and 172 flagged areas.
  These are advisory signals, not proof of fraud or misconduct. Production
  API/DB counts were not checked.


### 2026-08-01 - 2024 acquisition wave 3

- Delaware's official FirstMap service and Department of Elections map cycle
  establish a November 2023 boundary edition applicable to the 2022-2032
  district cycle. The raw layer has 531 features; five features without a 2024
  result/county identity remain only in raw evidence, while 526 parent-resolved
  features have reviewed exact RDED relationships. Three official result
  districts remain unmatched, leaving a 922-vote presidential delta, so
  reconciliation fails and delivery remains blocked.
- Maryland's only located statewide official vector service explicitly contains
  SBOE precinct data collected and aggregated in 2026. Its 2,040 features are
  retained as current-only evidence. Only 170 of 1,958 official result units
  have exact county/VTD-format candidates; 1,788 are unmatched and candidate
  totals are 2,736,562 presidential votes short, so delivery remains blocked.
- South Carolina's official statewide RFA package contains 2,315 features
  across all 46 counties but is explicitly effective January 1, 2025. Because
  the official result export lacks stable precinct IDs, 2,075 parent-qualified
  name matches remain pending and 326 result units remain unmatched; candidate
  totals are 244,775 presidential votes short and delivery remains blocked.
- Strengthened shared standardization during integration: county-level
  normalized features now require a five-digit county/county-equivalent GEOID;
  statewide source packages can explicitly enumerate all covered parents; and
  FeatureServer source-evidence manifests recursively verify every retained raw
  metadata/GeoJSON path, byte count, and checksum. Regression tests cover each
  rule.
- The canonical registry now contains nine election-scoped manifests and the
  national ledger records nine reviewed/42 queued jurisdictions. The focused
  precinct suite and nested artifact validation pass with all nine layers
  ineligible by design.
- Revalidated local ETL/import and advisory calculations without production
  writes. Delaware has 529 review rows, six advisory rows, and three flagged
  areas; Maryland has 1,958 review rows, 48 advisory rows, and 24 flagged
  areas; South Carolina has 2,401 review rows, 78 advisory rows, and 45 flagged
  areas. These are advisory signals, not proof of fraud or misconduct.
  Production API/DB counts were not checked.

### 2026-08-01 - 2024 acquisition wave 4

- Georgia retains an official Fulton County current-only diagnostic, not a
  statewide or election-date boundary claim. All 437 official service features
  remain in raw evidence; only the 433 features with a unique exact Fulton SOS
  result ID are normalized and assigned county GEOID 13121. Four features with
  unproven parentage remain raw-only, 33 result units are unmatched, mapped
  presidential totals are 11,137 votes short, and delivery remains blocked.
- New Mexico's SOS/RGIS archive did not yield an election-applicable 2024
  boundary package. The closest retained diagnostic is a 1,977-feature 2020
  Census VTD service. All 2,165 official 2024 result units use county-qualified
  identities, but none exactly matches the VTD identifiers; no votes are
  assigned and delivery remains blocked pending an archived SOS/RGIS edition or
  official crosswalk.
- Oklahoma retains the statewide OU Center for Spatial Analysis service produced
  in cooperation with the State Election Board. It contains 1,984 features and
  1,975 exact PCT_CEB candidates whose mappable presidential votes reconcile at
  1,456,475. Two county-wide 9999 result rows are explicitly non-geographic and
  nine source features are result-unused. The service describes a 2022 update
  and January 2025 download rather than a certified November 2024 edition, so
  every geographic relationship remains pending and delivery stays blocked.
- Independent review caught and resolved two integration defects before registry
  inclusion: New Mexico had duplicate statewide-parent result codes and an
  unsupported match-method label, while Georgia assigned a county parent to four
  raw-only features without evidence. Focused shared validation now reports zero
  errors for all three packages.
- Standardized lossless raw-geometry compression. Maryland's 65,000,503-byte
  GeoJSON is retained as a 22,472,803-byte deterministic gzip, New Mexico's
  44,388,453-byte GeoJSON as 15,009,689 bytes, and Oklahoma's canonical
  43,401,841-byte GeoJSON payload as 14,766,899 bytes. Source evidence records
  and validation verify both compressed and uncompressed byte counts and
  SHA-256 values.
- The canonical registry now contains 12 blocked manifests and the national
  ledger records 12 reviewed/39 queued jurisdictions, with zero public-eligible
  layers.
- Revalidated local ETL/import and advisory calculations without production
  writes. Georgia has 2,684 review rows, 132 advisory rows, and 79 flagged
  jurisdictions/areas; New Mexico has 2,165 review rows, 53 advisory rows, and
  29 flagged areas; Oklahoma has 1,977 review rows, 99 advisory rows, and 66
  flagged areas. Indicator types were vote-share pattern and average down-ballot
  difference. These are advisory signals, not proof of fraud or misconduct.
  Production API/DB counts were not checked.

### 2026-08-01 - 2024 acquisition wave 5

- Florida retains an official Orange County Supervisor of Elections historical
  layer that explicitly applies from May 2024 through December 2025. All 259
  result precinct IDs match all 259 polygons exactly under county GEOID 12095,
  including two geographic zero-vote precincts. Major presidential and U.S.
  Senate candidates reconcile exactly, but the precinct export does not assign
  eight certified presidential and three certified Senate named write-in votes
  to precincts. Delivery remains blocked, and 66 counties still lack retained
  election-applicable geometry.
- Michigan retains the official statewide 2024 election-cycle layer: 4,340 raw
  source features and 4,335 normalized result candidates. All candidates remain
  pending because the MVIC municipality code is not officially crosswalked to
  Census MCDFIPS. Six geographic result units totaling 5,862 presidential votes
  are unmatched, 87 statistical-adjustment or AVCB rows are non-geographic,
  five features remain raw-only, and Flint Township Precinct 2 is tagged
  ELECTIONYE=2023 in the otherwise 2024 source. No votes are forced onto a
  polygon and delivery remains blocked.
- Minnesota retains the official election-day LCC-GIS statewide archive and the
  certified SOS workbook with the same 4,103 VTDIDs across all 87 counties.
  Every relationship is exact, reviewed, and one-to-one; statewide and county
  vote deltas are zero, and all 28 zero-vote geographic precincts remain
  explicit. The native importer now preserves 87 county aggregates and emits
  4,103 precinct ResultRows plus matching review and turnout identities. An
  independent review verified the linkage. Public delivery remains null until
  an explicitly authorized production promotion and geometry release occur
  together.
- Review found and fixed three shared safeguards before integration: Florida's
  Census county-parent artifact is now hash-verified source evidence;
  Minnesota's offline collector verifies cached ZIP bytes before reusing HTTP
  metadata; and every future geometry delivery carries source authority, URL,
  vintage, and full license/redistribution terms through the API and UI. A
  zero-total result helper prevents zero-vote or positive-tie rows from being
  labeled as an alphabetically first candidate win.
- The canonical registry now contains 15 blocked manifests and the national
  ledger records 15 reviewed/36 queued jurisdictions, with zero public-eligible
  layers. Focused state, zero-vote, delivery-license, source-package, ETL, and
  TypeScript checks pass.
- Local advisory calculations were rechecked without production writes. Florida
  has 5,618 review rows, 83 advisory rows, and 59 flagged jurisdictions/areas;
  Michigan has 4,428 review rows, 128 advisory rows, and 77 flagged
  jurisdictions/areas; Minnesota has 4,075 review rows, 173 advisory rows, and
  87 flagged jurisdictions/areas. These are advisory signals, not proof of
  fraud or misconduct. Production API/DB counts were not checked.
### 2026-08-02 - 2024 acquisition wave 6

- Kansas has no located official statewide election-applicable precinct
  boundary export. The retained Douglas County service is an official
  current-only diagnostic with 73 features, 2026 timestamps, native EPSG:3419,
  and WGS84 query output. Its identifiers do not occur in the SOS workbook.
  The crosswalk therefore preserves all 4,567 official result units, including
  3,739 nonzero and 828 zero-vote units, as reviewed-unmatched; no votes are
  assigned and delivery remains blocked.
- Montana retains the official State Library 2023 statewide precinct archive
  posted before the election. The 124,691,654-byte FileGDB exceeds the
  repository host limit, so its exact external byte count/SHA-256 and retrieval
  script are recorded while a deterministic native-properties WGS84 derivative
  is retained. The 727 features use parent-qualified official NUMBER identities
  because ID_UK is duplicated for two Richland features. Of 727 SOS result
  units, 544 normalized-name relationships remain pending and 183 are
  reviewed-unmatched; 183 polygons are unused, the 27-vote write-in gap is
  retained, no votes are assigned, and election applicability remains unknown.
- Washington retains the election-specific official statewide shapefile and
  GIS-ready federal-result archives, both pinned by byte count and SHA-256 in
  online and offline collection. The geometry has 8,134 unique St_Code
  features. The participating result export has 5,356 units: 3,836 exact
  parent-qualified candidates remain pending, 1,519 geographic units are
  reviewed-unmatched, and one King Countywide row is non-geographic. Another
  4,298 polygons are unused. The participating export is 5,309 presidential
  votes below the GIS-ready total, so no vote is forced onto a polygon and
  delivery remains blocked.
- Integration added validated provenance for oversized official upstream
  artifacts and independently reviewed each state package. Review caught and
  fixed Kansas CRS and zero-vote omissions, Montana's duplicate native ID and
  noncanonical crosswalk rows, and Washington's incomplete feature keys and
  unpinned offline caches before registry inclusion.
- The canonical registry now contains 18 blocked manifests and the national
  ledger records 18 reviewed/33 queued jurisdictions, with zero public-eligible
  layers. Focused state tests and nested source, geometry, crosswalk, and
  reconciliation validation pass.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Kansas has 3,739 review rows, 155 advisory rows, and 95 flagged
  jurisdictions/areas; Montana has 726 review rows, 61 advisory rows, and 29
  flagged jurisdictions/areas; Washington has 5,007 review rows, 57 advisory
  rows, and 37 flagged jurisdictions/areas. These are advisory signals, not
  proof of fraud or misconduct. Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 7

- District of Columbia retains 144 official DC Open Data precinct polygons and
  144 certified DCBOE presidential result units, with exact parent-qualified
  precinct-number identities and zero statewide candidate deltas across 325,869
  votes. The layer is titled Voting Precinct 2019, while retained March 6, 2024
  DCBOE board minutes state that current precinct assignments would be
  maintained for the 2024 election season. All 144 relationships remain pending
  an explicit human release review because no immutable election-day geometry
  snapshot or feature effective-date field was located; delivery remains null.
  Direct ArcGIS item metadata pins CC BY 4.0 terms, and all five retained source
  artifacts verify by byte count and SHA-256.
- Hawaii retains the official Statewide GIS 2024 Election Precincts service
  sourced to the Office of Elections in May 2024. Its 250 raw polygons dissolve
  three duplicated multipart IDs into 247 official base-precinct geometries.
  The certified result export has 494 geographic precinct-split units linked by
  exact official base-precinct ID and three zero-vote non-geographic units.
  County/county-equivalent parent scopes and the statewide scope reconcile all
  516,701 presidential votes with exact candidate totals and zero deltas.
  Public delivery remains null because 494 reviewed many-to-one split
  relationships require an explicit aggregate rendering contract that the
  delivery builder deliberately rejects.
- Ohio retains the official 23,053,730-byte SOS precinct canvass workbook and a
  fail-closed statewide availability diagnostic. No official statewide or
  complete 88-county November 2024 precinct-boundary package with a documented
  stable join identifier was located. All 8,878 official result units are
  preserved as reviewed-unmatched, no geometry is normalized, and no votes are
  assigned. An official-looking maintenance-page URL is recorded only as an
  unverified lead and is not treated as source evidence.
- Independent review caught and resolved Hawaii's missing five-parent
  reconciliation scopes, DC's missing manifest office field, and Ohio's
  unsupported crosswalk/reconciliation labels, future timestamp, and
  unsubstantiated advisory-page claims before national registration. Focused
  tests now pin these corrections and all three packages remain ineligible by
  design.
- The canonical registry now contains 21 blocked manifests and the national
  ledger records 21 reviewed/30 queued jurisdictions, with zero public-eligible
  layers. The complete precinct suite, nested artifact validator, source-package
  validator, TypeScript check, and production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. DC has zero review or advisory rows because no same-grain review rows
  are loaded. Hawaii has 467 review rows, 11 advisory rows, and four flagged
  jurisdictions/areas. Ohio has 8,878 review rows, 174 advisory rows, and 88
  flagged jurisdictions/areas. These are advisory signals, not proof of fraud
  or misconduct. Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 8

- Massachusetts now retains the authoritative MassGIS Wards and Precincts
  (2022) state service rather than the planning-agency mirror first located.
  The retained service has 2,256 polygons across all 351 municipality TOWN_IDs.
  Of 2,394 official PD43+ presidential units, 2,190 are literal official-key
  candidates, 58 depend only on a disclosed cardinal-direction normalization,
  and 146 remain unmatched. All relationships are pending, official
  subprecinct geometry remains required for units such as Acton 6A, candidate
  totals are 48,239 votes below the complete result universe, and delivery is
  null.
- Oregon retains an official-source availability diagnostic. No statewide or
  complete 36-county November 2024 precinct polygon edition, machine-readable
  statewide precinct President set, or stable result-to-feature crosswalk was
  verified. The 36 normalized county rows remain source context only; the
  target-grain geometry and crosswalk are explicitly empty, no votes are
  assigned, and delivery is null.
- Rhode Island retains 416 official RIGIS 2022-cycle precinct polygons and the
  complete 497-unit finalized-root BOE presidential universe. All 414 regular
  precincts have exact municipality-plus-ID candidates; 40 Limited, 39
  Presidential, and four Federal units are explicit non-geographic rows. The
  full source reconciles to 513,386 posted statewide votes, while the regular
  polygon subset is deliberately 11,026 votes lower. All regular relationships
  remain pending election-date release review and delivery is null.
- Independent review caught and resolved Massachusetts's mirror attribution,
  invalid contract enums, synthetic municipality parents, normalized-name
  labeling, and per-artifact URL gaps; Rhode Island's incomplete result subset,
  future timestamp, administrative-unit classification, and noncanonical
  vintage label; and Oregon's county-to-precinct metric leakage and empty-method
  contract edge case. The shared schema now uses an explicit
  availability_diagnostic derivation for no-geometry findings and permits an
  empty methods list only when the target-grain crosswalk has zero result units.
- The canonical registry now contains 24 blocked manifests and the national
  ledger records 24 reviewed/27 queued jurisdictions, with zero public-eligible
  layers. The complete precinct suite, nested artifact and source-package
  validators, TypeScript check, and production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Massachusetts has 2,382 review rows, 142 advisory rows, and 85 flagged
  jurisdictions/areas; Oregon has 36 review rows, six advisory rows, and six
  flagged jurisdictions/areas; Rhode Island has 444 review rows, six advisory
  rows, and five flagged jurisdictions/areas. These are advisory signals, not
  proof of fraud or misconduct. Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 9

- Tennessee retains a fail-closed availability diagnostic for the official
  Comptroller statewide voting-district service. The service reports 3,231
  current features, irregular updates, and no historic-moment support, so it
  cannot establish the November 5, 2024 boundary edition. All 1,862
  county-qualified SOS President result identities, including three zero-vote
  units, remain reviewed-unmatched; no votes are assigned and delivery is
  null.
- Vermont retains 256 current VCGI town polygons and official BNDHASH metadata
  as contextual evidence only. BNDHASH is edition 2025B, is described for
  general mapping rather than legally definitive boundaries, and is not a
  reporting-district layer. The SOS universe contains 283
  town/reporting-district identities, so all 283 remain reviewed-unmatched and
  delivery is null rather than substituting municipality polygons for split
  reporting districts.
- West Virginia retains a statewide WVGISTC archive with 1,656 polygons across
  all 55 county parents. The ZIP filename is dated August 29, 2024, but no
  retained source proves its publication or effective date or certifies it as
  the election-day edition. Clarity county-detail reports expose precinct
  labels without a documented SRVS_Pre_N or Precinct_I crosswalk, so all 1,649
  turnout-backed result identities, including Raleigh PRECINCT 3A with zero
  ballots cast, remain reviewed-unmatched and delivery is null.
- Independent review caught and resolved Tennessee's future retrieval
  timestamp, omitted manifest byte counts, and undocumented per-row vote field;
  Vermont's MapServer label, unretained BNDHASH provenance, and evidence-format
  label that initially bypassed nested national verification; and West
  Virginia's unsupported publication-date wording, mojibake terms text, and
  ambiguous zero-row evidence semantics. Every retained Wave 9 source artifact
  now verifies through the generic validator by byte count and SHA-256.
- The canonical registry now contains 27 blocked manifests and the national
  ledger records 27 reviewed/24 queued jurisdictions, with zero public-eligible
  layers. The complete precinct suite, nested artifact/source-package
  validators, source/provenance/turnout/map validators, TypeScript check, and
  55-page production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Tennessee has 1,859 review rows, 149 advisory rows, and 86 flagged
  jurisdictions/areas; Vermont has 283 review rows, 11 advisory rows, and nine
  flagged jurisdictions/areas; West Virginia has 1,648 review rows, 102
  advisory rows, and 55 flagged jurisdictions/areas. These are advisory
  signals, not proof of fraud or misconduct. Production API/DB counts were not
  checked.

### 2026-08-02 - 2024 acquisition wave 10

- Alaska retains a 401-feature official DCRA precinct-service candidate, but
  its election vintage is unknown. The retained 18-555 JBER feature has an
  AsOfDate of May 24, 2022, the service has no 18-556 feature, and the official
  2024 ENR contains both 18-555 and 18-556. The service exposes OBJECTID rather
  than ENR Pct_Id, no official crosswalk or explicit reuse license is retained,
  all 402 geographic result identities remain unmatched, 121 absentee/early/
  question/federal-overseas units remain non-geographic, and delivery is null.
- Alabama retains the official 67-workbook precinct-result ZIP and a complete
  2,085-unit county-qualified diagnostic: 1,950 precinct_or_unclassified rows
  remain unmatched candidates, 71 absentee and 64 provisional rows remain
  explicitly non-geographic, and 11 identities have zero presidential votes.
  No election-applicable geometry is retained. Listed SOS GIS pages are
  unretained follow-up leads rather than evidence that geometry does not exist;
  no votes are assigned and delivery is null.
- Wyoming retains the official result ZIP, May 31, 2024 SOS district-and-
  precinct-code PDF, and Census county parents. The PDF establishes published
  codes but supplies no polygons, stable geometry identifiers, effective-date
  record, or result-to-feature crosswalk. All 436 result identities, including
  five zero-vote rows, remain reviewed-unmatched; no votes are assigned and
  delivery is null.
- Independent review caught and resolved Alabama's doubled 134-county evidence
  metric and overconfident geographic/absence wording, Wyoming's initially
  unretained PDF claim, and Alaska's unsupported election-date vintage and
  incorrect EPSG:3338 source-CRS claim. The generic validator fixture now
  selects an explicit county-parent manifest rather than depending on registry
  sort order.
- The canonical registry now contains 30 blocked manifests and the national
  ledger records 30 reviewed/21 remaining jurisdictions, with zero
  public-eligible layers. The complete precinct suite, nested artifact and
  source-package validators, source/provenance/turnout/map validators,
  TypeScript check, and 55-page production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Alaska has 523 review rows, two advisory rows, and one flagged
  jurisdiction/area; Alabama has 2,083 review rows, 70 advisory rows, and 58
  flagged jurisdictions/areas; Wyoming has 431 review rows, 19 advisory rows,
  and 19 flagged jurisdictions/areas. Broad-signal warnings apply where shown
  by the report; these are advisory signals, not proof of fraud or misconduct.
  Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 11

- Arkansas retains current official statewide precinct-service metadata/count
  with 2,926 live features, but no dated November 2024 edition or official
  TotalResults-to-feature crosswalk. The complete 2,839-unit county-qualified
  President identity universe is preserved, including 60 zero-vote IDs. Every
  unit remains an explicitly unclassified unmatched candidate, no vote is
  assigned, and delivery is null. A declared input inventory now verifies exact
  paths, HTTPS URLs, byte counts, and SHA-256 hashes for all 78 retained
  TotalResults inputs.
- Illinois retains the official 2024 President CSV and the SBE precinct-map
  directory as a local discovery path. The package preserves 10,062 identities
  across 108 election authorities: 10,058 precinct-or-unclassified units remain
  unmatched, four empty-PrecinctName jurisdiction groups remain non-geographic,
  and 737 identities have zero votes. No statewide election-applicable vector
  boundary edition or official authority-qualified crosswalk is retained; no
  vote is assigned and delivery is null.
- Mississippi retains official MARIS and SOS availability evidence only. The
  1,834-feature statewide layer is explicitly a 2020 Census VTD product, the
  13 active county packages are labeled 2023 and incomplete statewide, and the
  SOS precinct-result PDF/OCR universe remains review-gated. Those sources do
  not enter 2024 target geometry, result-unit, crosswalk, zero-vote, or
  non-geographic metrics; no vote is assigned and delivery is null.
- Independent review caught and resolved Arkansas's missing per-input
  provenance and unsupported post-election-edit wording, and Illinois's
  unretained split-jurisdiction warning attribution. Review confirmed the
  diagnostic-only IL-EA election-authority namespace is non-FIPS and safe while
  delivery is null, and confirmed Mississippi keeps wrong-vintage/OCR context
  out of target metrics. All three post-fix reviews passed.
- The canonical registry now contains 33 blocked manifests and the national
  ledger records 33 reviewed/18 remaining jurisdictions, with zero
  public-eligible layers. Wave 12 is active for Arizona, California, and
  Colorado. The complete precinct suite, nested artifact/source-package
  validators, source/provenance/turnout/map validators, TypeScript check, and
  55-page production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Arkansas has 2,779 review rows, 117 advisory rows, and 71 flagged
  jurisdictions/areas; Illinois has 6,655 review rows, 90 advisory rows, and 60
  flagged jurisdictions/areas; Mississippi has 82 county-only review rows, five
  advisory rows, and five flagged jurisdictions/areas. Broad-signal warnings
  apply to Arkansas and Illinois. These are advisory signals, not proof of fraud
  or misconduct. Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 12

- Arizona retains the official 15-county certified result and county-parent
  context plus an inventory of all 15 official county canvass PDFs. Those
  county-specific precinct, vote-center, or local layouts remain parser-
  pending. No complete election-applicable precinct geometry, machine-
  normalized target result identity universe, or official result-to-feature
  crosswalk is retained; all target counts are zero, no vote is assigned, and
  delivery is null. Maricopa election-map paths remain local follow-up leads.
- California retains an official SOS circular asking counties to submit
  registration-precinct and sub-precinct GIS files to the California
  Statewide Database, plus the retained SWDB 2024 data and MPREC/SRPREC
  geography/conversion pages. This identifies a statewide supplemental
  acquisition product, not an SOS-certified precinct result/geometry release.
  Privacy masking, temporary artifacts, the recorded Madera mismatch, reuse
  terms, registration-versus-voting-precinct semantics, stable identifiers,
  and certified-total reconciliation remain unresolved. The 58 SOS county
  rows and county parents remain context only; all target counts are zero and
  delivery is null.
- Colorado retains the official statewide Clarity county candidate source,
  the SOS Historical Election Data voter-statistics export, and county-parent
  geometry. The voter-statistics export contains 12,732 precinct-statistic
  rows representing 3,183 precinct IDs, but only voter and ballots-cast
  statistics, not precinct candidate votes, polygon geometry, or a documented
  join key. The 64 county candidate rows and all turnout IDs remain context
  only; target counts are zero, no vote is assigned, and delivery is null.
- Independent review caught and resolved an unsupported Arizona statement
  about Maricopa 2022 boundary approval. California passed its authority and
  evidence review; coordinator review then removed a hidden `.etl/staging`
  dependency so the collector now counts the 58 county rows directly from the
  declared SOS workbook. The post-fix review and focused test passed. Colorado
  independently passed exact-artifact, authority, metric-isolation, and
  fail-closed review.
- The canonical registry now contains 36 blocked manifests and the national
  ledger records 36 reviewed/15 remaining jurisdictions, with zero public-
  eligible layers. Wave 13 is active for Connecticut, Idaho, and Indiana. The
  complete precinct suite, nested artifact/source-package validators, source/
  provenance/turnout/map validators, TypeScript check, and 55-page production
  build pass locally; the focused coverage test also passes after Wave 13
  activation.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Arizona has 15 county review rows, 14 advisory rows, and 14 flagged
  jurisdictions/areas; California has 58 county review rows, five advisory
  rows, and five flagged jurisdictions/areas; Colorado has 64 county review
  rows, 60 advisory rows, and 60 flagged jurisdictions/areas. Each produces
  `county_down_ballot_distribution`; broad-signal warnings apply to Arizona
  and Colorado. These are advisory signals, not proof of fraud or misconduct.
  Production API/DB counts were not checked.

### 2026-08-02 - 2024 acquisition wave 13

- Connecticut retains four exact official-source artifacts covering EMS district/
  polling-place context, EMS town-grain candidate results, and the current
  Census town/MCD response. EMS reports all 759 polling-place/precinct-context
  identifiers complete, but candidate rows remain 169 town groups; Census has
  169 non-placeholder town/MCD features plus five placeholders. No precinct
  candidate-result universe, precinct polygons, or stable result-to-feature
  identity chain is retained. Target counts and normalized features remain zero,
  no votes are assigned, and delivery is null.
- Idaho retains 980 valid State of Idaho candidate precinct polygons, all
  assigned canonical Census county parent GEOIDs. The ArcGIS item snippet says
  the county-supplied boundaries were aggregated for the Secretary of State and
  used in 2024 elections, but November 5 applicability is not confirmed. All 44
  official VoteIdaho county XML result files contain zero Precinct elements, so
  the target result universe and crosswalk remain empty. Item license and access
  fields are blank, reuse terms remain unresolved, no votes are assigned, and
  delivery is null.
- Indiana retains exact official metadata/count evidence for the live 5,126-
  feature Voting District Boundaries 2024 layer, the Election Division's 5,147-
  precinct September 2023 count, and official 2024 ENR President and U.S. Senate
  shapes containing 92 county/locality regions each. The live layer has a post-
  election edit timestamp and no historic-moment support, the 21-unit count
  difference is unexplained, and no official precinct candidate-result universe
  or crosswalk is retained. No geometry is normalized, no votes are assigned,
  and delivery is null.
- Independent review caught and resolved Connecticut authority/SOV wording that
  exceeded the retained artifacts and Idaho's missing item-snippet provenance,
  conflated metadata/data timestamps, unsupported reuse-terms claim, and overly
  broad election-applicability wording. Indiana passed exact-artifact, count,
  vintage, target-metric-isolation, and fail-closed review without correction.
  Post-fix review passed for all three states; Idaho reverified all 50 declared
  artifacts, including 44 nested county XML files.
- The canonical registry now contains 39 blocked manifests and the national
  ledger records 39 reviewed/12 remaining jurisdictions, with zero public-
  eligible layers. Wave 14 is active for Kentucky, Louisiana, and Maine. The
  complete precinct suite, nested artifact/source-package validators, source/
  provenance/turnout/map validators, TypeScript check, and 55-page production
  build pass locally; the focused coverage test also passes after Wave 14
  activation.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Connecticut has 169 town review rows, 12 advisory rows, and seven
  flagged jurisdictions/areas; Idaho has 44 county review rows, 27 advisory rows,
  and 27 flagged jurisdictions/areas; Indiana has 5,253 supplemental/caveated
  review rows, 154 advisory rows, and 87 flagged jurisdictions/areas. Broad-
  signal warnings apply to all three. These are advisory signals, not precinct-
  map evidence and not proof of fraud or misconduct. Production API/DB counts
  were not checked.
### 2026-08-02 - 2024 acquisition wave 14

- Kentucky retains the exact official current Commonwealth GIS VTD metadata and
  3,693 unique PrecinctID values across all 120 canonical county parents. The
  retained service exposes neither an immutable November 5, 2024 edition nor
  resolved reuse terms. KRS 117.055 proves that counties file georeferenced
  precinct-boundary files, but it does not prove the live service vintage; the
  statewide certification and one Kenton recap remain result context rather
  than a complete precinct identity universe. No geometry is normalized, no
  votes are assigned, and delivery is null.
- Louisiana retains the official Legislature source page, its December 31,
  2024 candidate precinct ZIP, and official SOS President plus six U.S. House
  precinct CSVs. The ZIP has 3,656 polygons across all 64 parish parents. SOS
  exposes 3,933 President identities: 3,805 geographic rows remain unmatched
  and 128 Early Voting/Provisional Votes mode rows remain non-geographic; 48
  rows have zero presidential votes. The retained page directly supports the
  June 27, 2024 precinct-change cutoff and ZIP label, but not November 5
  applicability or an SOS Parish/Ward/Precinct-to-VTD crosswalk. No vote is
  assigned, terms remain unresolved, and delivery is null.
- Maine retains exact SOS county/town President and U.S. Senate workbooks plus
  the registered-voter layout establishing ward/precinct registration context.
  A state-hosted current municipal/territory service exposes 8,421 candidate
  features, but its retained metadata does not establish publisher authority,
  an election-date snapshot, ward/precinct boundaries, or candidate-result
  coverage. Target geometry/result/crosswalk counts remain zero, no vote is
  assigned, and delivery is null.
- Independent review passed all three packages. Corrections removed a stray
  undeclared Kentucky raw file; pinned Louisiana's exact official page at
  44,132 bytes and SHA-256
  3b0515eab7ada8f3d93ccda3414def1e700af0f03f0c3793540c37c6cda5ea4b,
  corrected its source-package role/parent coverage, and removed duplicate
  collector object keys; and confirmed Maine wording treats the state-hosted
  municipal service as a candidate lead rather than an official ward layer.
- The canonical registry now contains 42 blocked manifests and the national
  ledger records 42 reviewed/9 remaining jurisdictions, with zero public-
  eligible layers. Wave 15 is active for Missouri, North Dakota, and Nebraska.
  The complete precinct suite, nested artifact/source-package validators,
  source/provenance/turnout/map validators, TypeScript check, and 55-page
  production build pass locally; the focused coverage test also passes after
  Wave 15 activation.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Kentucky has 3,067 review rows, 104 advisory rows, and 88 flagged
  jurisdictions/areas; Louisiana has 3,885 review rows, 75 advisory rows, and
  48 flagged jurisdictions/areas; Maine has 512 town review rows, 42 advisory
  rows, and 16 flagged jurisdictions/areas. Broad-signal warnings apply to all
  three. These are advisory signals, not precinct-map evidence and not proof of
  fraud or misconduct. Production API/DB counts were not checked.
### 2026-08-02 - 2024 acquisition wave 15

- Missouri retains the official SOS public-results page and exact November 5,
  2024 county and statewide result PDFs. The page states that precinct-level
  general-election files through 2024 are available for purchase; the public
  PDFs are county/statewide context only. No public downloadable statewide or
  complete county-set election-applicable precinct geometry, target result
  identity universe, or official crosswalk is retained. Target counts are zero,
  no vote is assigned, and delivery is null.
- North Dakota preserves 385 county-qualified official President/Senate result
  identities across all 53 county parents, including 383 nonzero review rows
  and two zero-President-vote Williams County keys. The evidence chain records
  108 exact ResultsAjax URLs and distinguishes deterministic derivatives from
  the retained provenance index. Current NDGIS/2026 material remains an
  unretrieved lead rather than November 5 geometry; all 385 identities remain
  precinct-or-unclassified and unmatched, no vote is assigned, and delivery is
  null.
- Nebraska retains the official canvass, a deterministic 93-county President
  context CSV, and 93 Census county parents. Four election/GIS URLs remain
  explicitly unretrieved follow-up leads whose contents are not asserted or
  counted. No complete statewide/93-county election-applicable precinct layer,
  machine-readable target result universe, or official crosswalk is retained;
  target counts are zero, no vote is assigned, and delivery is null.
- Independent review passed all three packages after two corrections. Nebraska
  removed an unsupported live-portal display/count claim and added a concrete
  multi-authority request path. North Dakota regenerated stale input byte/hash
  declarations and strengthened its focused test to recompute every evidence
  artifact while verifying the exact endpoint chain. Missouri passed exact-
  artifact, public-access wording, context isolation, and fail-closed review
  without correction.
- The canonical registry now contains 45 blocked manifests and the national
  ledger records 45 reviewed/6 remaining jurisdictions, with zero public-
  eligible layers. Wave 16 is active for New Hampshire, New Jersey, and Nevada.
  The complete precinct suite, nested artifact/source-package validators,
  source/provenance/turnout/map validators, TypeScript check, and 55-page
  production build pass locally; the focused coverage test also passes after
  Wave 16 activation.
- Local ETL/import and advisory calculations were rechecked without production
  writes. Missouri has 115 county review rows, 75 advisory rows, and 75 flagged
  jurisdictions/areas, all county_down_ballot_distribution with a broad-signal
  warning. North Dakota has 383 precinct review rows, 32 advisory rows, and 17
  flagged jurisdictions/areas (17 vote_share_pattern and 15
  average_down_ballot_difference) without a broad warning. Nebraska has 93
  county review rows, six county_down_ballot_distribution rows, and six flagged
  jurisdictions/areas without a broad warning. These are advisory signals, not
  precinct-map evidence and not proof of fraud or misconduct. Production API/
  DB counts were not checked.
### 2026-08-02 - 2024 acquisition wave 16

- New Hampshire retains exact official SOS President and Governor workbooks and
  preserves 320 county-qualified geographic town, ward, or unincorporated-unit
  identities: 304 positive-vote and 16 geographic zero-vote units. Write-ins
  are included while undervotes and overvotes are excluded. The 259-feature
  current GRANIT municipal layer is context only; it lacks ward coverage,
  election-date or historical-moment proof, and an official result-to-feature
  crosswalk. All 320 identities remain unmatched, no geometry or votes are
  assigned, and delivery is null.
- New Jersey retains the official election page, governing statute, President
  PDF, U.S. Senate PDF, and turnout PDF. The statute requires a unique-ID match
  between result CSV and election-district Shapefile releases, but it is legal
  availability evidence rather than proof that the actual 2024 files were
  retained. The PDFs provide 21-county tables, not maps; 6,402 district records
  remain context only. Target geometry, result-unit, and crosswalk counts are
  zero, no vote is assigned, and delivery is null.
- Nevada retains exact official Clark, Washoe, and Humboldt source chains.
  Clark exposes 1,015 candidate features, Washoe 448, and Humboldt 15, for
  1,478 current-or-unknown-vintage context polygons. Official partial CVR
  material preserves 1,057 local identities (749 Clark, 287 Washoe, and 21
  Humboldt), but no election-date snapshot or complete official crosswalk is
  retained; Humboldt's 21 result identities are not inferred onto 15 polygons,
  and 14 other county-equivalent jurisdictions remain absent. All 1,057
  identities remain unmatched, no geometry or votes are assigned, and delivery
  is null.
- Independent review passed all three packages after corrections. New Hampshire
  corrected zero-vote classification, removed vote totals from the identity
  crosswalk, and made county scope and mixed reporting grain explicit. Nevada
  added the omitted official Humboldt chain and retained exact metadata.
  New Jersey passed exact-artifact, statutory-wording, context-isolation, and
  fail-closed review without correction.
- At the Wave 16 checkpoint, the canonical registry contained 48 blocked
  manifests and the national ledger recorded 48 reviewed/3 remaining
  jurisdictions, with zero public-eligible layers. Wave 17 was assigned to New
  York, South Dakota, and Utah and is closed out below.
  Three stale source-count test expectations were updated to the already-
  declared Alaska, Arizona, and Indiana source totals. The unrestricted complete
  test suite, all-state ETL validation, complete precinct suite, nested
  artifact/source-package validators, source/provenance/turnout/map validators,
  TypeScript check, and 55-page production build pass locally.
- Local ETL/import and advisory calculations were rechecked without production
  writes. New Hampshire has 304 review rows, 14 advisory rows, and nine flagged
  jurisdictions/areas (six vote-share-pattern and eight average-down-ballot-
  difference rows), with a broad-signal warning. New Jersey has 21 county
  review rows, eight county-down-ballot-distribution rows, and eight flagged
  jurisdictions/areas without a broad warning. Nevada has 1,057 review rows,
  four advisory rows, and three flagged jurisdictions/areas (three average-
  down-ballot-difference and one vote-share-pattern row), with a broad-signal
  warning. These are advisory signals, not precinct-map evidence and not proof
  of fraud or misconduct. Production API/DB counts were not checked.
### 2026-08-02 - Historical acquisition tracking foundation

- The coverage validator and refresh command now accept a dated presidential
  general-election identity instead of hard-coding 2024. Registry checks are
  election-scoped, so a historical ledger neither hides nor incorrectly claims
  a manifest from another election.
- Separate 51-jurisdiction ledgers now track the 2020-11-03, 2016-11-08, and
  2012-11-06 general elections. They were seeded as not started and undecided;
  2020 Waves 1 through 8 have since moved AK, AL, AR, AZ, CA, CO, CT, DC,
  DE, FL, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA, MI, MN, NC, and WA to
  reviewed/blocked, while the remaining 129 state/election rows stay queued.
  This is acquisition tracking, not a claim that historical source review is
  complete.
- The generic validator checks election ID/date/year consistency, exact
  state/DC enumeration, source leads, manifest identity, eligibility counts,
  and summaries for every ledger. Tests prove all 153 rows are present and
  reject cross-election manifest references. The precinct-geometry validator
  now validates the 2024 and three historical ledgers together.

### 2026-08-02 - Generic retained-artifact provenance retrofit

- A reviewed, idempotent retrofit now maps 47 retained source-evidence
  artifacts across 13 state/DC packages to exact HTTPS download, query, service,
  or archive locators. Deterministic derivatives record how they were produced;
  Washington sidecars name their archive members; the Florida 2024 precinct
  ZIP is pinned to its exact official media endpoint.
- The retrofit synchronizes evidence hashes into local manifests, the existing
  canonical registry entries, and six diagnostic report references. A read-only
  check is part of the precinct validation command and has a focused regression
  test.
- Generic source-evidence validation now requires exactly one HTTPS locator per
  retained artifact and requires a derivation explanation for `sourceUrl` or
  `sourceUrls`. After Wave 17 and 2020 Waves 1-8 integration, the current
  75-manifest registry validates with zero eligible layers and zero validation
  errors.
- The separate provenance audit for the early nested IA, MN, NC, SC, VA, and WV
  layouts is complete. Their top-level source packages already enforce exact
  HTTPS URLs, safe paths, hashes, and byte counts. New regressions independently
  verify Iowa's custom index-to-153-ZIP linkage and Virginia's nested Fairfax
  evidence-to-package agreement without forcing either into the generic schema.
### 2026-08-02 - 2024 acquisition wave 17 closeout

- New York retains official 62-county President and U.S. Senate context plus
  five review artifacts, but the 10,408 partial local rows cover only 50 county
  equivalents and are not a complete official target identity universe. No
  complete election-date election-district geometry or official result-to-
  feature crosswalk is retained. Target, crosswalk, and feature counts remain
  zero; no votes are assigned and delivery is null.
- South Dakota retains all 691 official ENR reporting units across 66 counties:
  632 four-digit geographic candidates and 59 non-geographic units (50 vote
  centers and nine absentee units). The ENR President and House totals remain
  194 and 184 votes below the certified canvass, respectively. All 632
  geographic candidates remain unmatched; no geometry or votes are assigned
  and delivery is null. The retained-input replay pins all nine HTTP responses
  and reproduces all 15 package files byte-for-byte.
- Utah retains the complete official 3,105-unit nonvirtual President precinct
  identity universe across all 29 county endpoints, including seven confirmed
  zeros and 414 zero-or-privacy-redacted identities. The live Vista layer has
  3,322 features, 3,300 with post-election effective dates, and no official
  result-UUID-to-feature crosswalk. The Box Elder endpoint is 412 votes above
  the certified statewide county breakdown, while privacy-protected published
  precinct rows are 1,115 votes short of county endpoint totals. No vote is
  assigned, normalized geometry is empty, and delivery is null.
- Independent reviews passed all three packages after South Dakota added
  retained-input deterministic replay and fixed-response provenance. The
  canonical registry now includes all 51 reviewed 2024 manifests. The 2024
  ledger records 51 blocked jurisdictions, zero undecided jurisdictions, and
  zero public-eligible layers.
- Local ETL/import and advisory calculations were run without production writes.
  New York has 10,408 review rows, 85 advisory rows, and 50 flagged
  jurisdictions/areas; South Dakota has 66 review rows, 48 advisory rows, and
  48 flagged jurisdictions/areas; Utah has 29 review rows, 28 advisory rows,
  and 28 flagged jurisdictions/areas. These calculations are advisory signals,
  not precinct-map evidence and not proof of fraud or misconduct. Production
  API/DB counts were not checked.

### 2026-08-02 - 2020 historical acquisition wave 1

- District of Columbia retains the exact official DCBOE result CSV and 2019
  precinct-layer metadata. The result artifact contains 1,008 presidential
  candidate rows and 144 precinct/ward identities; Board minutes establish
  precinct 144 in December 2019 but do not prove full boundary stability for
  November 2020. Context identities are retained separately; target geometry,
  result-unit, and crosswalk counts are zero and delivery is null.
- Delaware retains 439 official 2020 election-district identities. The current
  official ArcGIS layer was updated in November 2023 and exposes no retained
  historical version or election-date archive; service-level update wording is
  not attributed to the blank FeatureServer layer description. Target metrics
  remain zero, no votes are assigned, and delivery is null.
- Florida retains the official 67-county precinct ZIP: 553,307 source rows,
  60,970 presidential-contest rows, and 6,097 county-qualified
  county-abbreviation/precinct/location identities, including 132 contextual
  identities with zero named-candidate votes. An independent recount confirmed
  the corrected county key and the five Palm Beach zero-vote regression cases;
  the constant third column is not treated as a county FIPS code. No complete
  election-applicable geometry or official crosswalk is retained, target
  metrics remain zero, and delivery is null.
- Independent reviews, focused tests, hash checks, scoped validation, and
  fixed-timestamp offline replays passed for all three packages. The 2020 ledger
  records three reviewed/blocked jurisdictions and 48 not started at the Wave 1
  checkpoint, with no public-eligible layer. Wave 2 subsequently passed the
  same closeout gates below; 2016 and 2012 remain queued for later waves.
### 2026-08-02 - 2020 historical acquisition wave 2

- Georgia retains the official SOS 2020 General export and official Fulton
  precinct-service metadata. The statewide export contains 159 county
  President contexts and 477 candidate rows but zero precinct-result records.
  The Fulton service is current single-county GIS evidence last edited in 2025,
  not an immutable statewide November 3, 2020 layer. Target, crosswalk, and
  feature counts remain zero; no votes are assigned and delivery is null.
- North Carolina retains the exact official 2020 result ZIP, the official
  October 18, 2020 precinct shapefile ZIP, and the NCSBE archive index. Context
  includes 19,889 President rows and 3,065 identities: 2,662 Real Precinct units
  and 403 administrative/non-geographic units. The geometry has 2,659 features
  but only 2,658 unique county/precinct IDs because `CUMBERLAND|G2C-2` appears
  twice. Exact comparison produces 2,658 candidates and four unmatched Real
  Precinct IDs (`BUNCOMBE|681`, `HENDERSON|CV`, `WAKE|1-07A`, and
  `WAKE|7-07A`). The archive does not expressly certify immutable Election Day
  applicability, the duplicate prevents a one-to-one crosswalk, no votes are
  assigned, approved target metrics remain zero, and delivery is null.
- Washington retains the official 2020 AllStatePrecincts CSV plus separate SOS
  original and consolidated-for-reporting 2020 General shapefile archives. The
  CSV has 394,186 source rows, 33,838 President rows, and 4,834 President
  identities: 4,795 geographic, 39 non-geographic county-total units, and 136
  zero-vote identities. The original archive has 7,465 features and the
  consolidated archive 7,380; exact `St_Code` candidate overlap is 3,489 and
  3,404, leaving 1,391 geographic result identities unmatched against the
  consolidated set. Election-year archives are confirmed, but no retained SOS-
  approved result-to-feature crosswalk or certified GIS-ready reconciliation
  establishes which geometry is safe for vote delivery. Approved target,
  crosswalk, and vote-assignment metrics remain zero and delivery is null.
- Independent reviews required North Carolina to compare geometry only against
  Real Precinct IDs and required both North Carolina and Washington to add
  exact collector shape gates plus independent retained-artifact recounts.
  After correction, syntax, focused tests, fixed-timestamp byte-identical
  replays, artifact/contract validation, and scoped diff checks passed for all
  three states.
- The canonical registry now contains 57 blocked manifests: 51 for 2024 and six
  for 2020. The 2020 ledger records six reviewed/blocked jurisdictions and 45
  not started, with zero public-eligible historical layers. No state ETL
  artifact or production database row was changed by these historical geometry
  diagnostics.
### 2026-08-02 - 2020 historical acquisition wave 3

- Iowa retains a deterministic ledger of all 99 official county-workbook links
  from the SOS 2020 General index. Independent review corrected the O'Brien
  workbook path to the exact percent-encoded `o%27brien.xlsx` locator. The
  workbook bodies could not be retained through the automated source session,
  so President identities and candidate rows remain unasserted. The only SOS
  statewide precinct ZIP found is expressly dated April 17, 2014, and the
  post-census city/county boundaries took effect in 2022; neither is treated as
  November 2020 geometry. Approved target metrics remain zero and delivery is
  null.
- Michigan retains the official statewide 2020 election-cycle layer as context:
  4,755 features and 4,752 unique nonblank `PRECINCTID` values. Independent
  recount found `WP-025-06720-00001` on three features and
  `WP-049-27780-00004` on two, so the identifier is not one-to-one. The official
  MVIC precinct-result page remained Cloudflare-blocked; no result artifact,
  crosswalk, vote assignment, or target geometry is approved. The manifest uses
  unknown election-date vintage, remains blocked, and has null delivery.
- Minnesota retains the certified/recount-inclusive SOS workbook with 4,110
  unique VTDID President contexts, 33 zero-vote contexts, and 3,277,171
  presidential votes. The official LCC-GIS catalog's `vtd2020general.zip` lead
  returned HTTP 404; the exact 34-byte response body and a hash-linked probe
  record are retained and replay-verified. Its metadata link is legacy 2018
  material, so no election-applicable geometry or crosswalk is approved and
  delivery is null.
- Independent reviews initially rejected Iowa's apostrophe encoding and
  Minnesota's unretained 404 assertion; both were corrected and re-reviewed.
  Michigan was updated to retain its duplicate-ID evidence and gained an
  independently verified offline collector/normalizer replay. All three final
  reviews passed syntax, exact artifact recounts, manifest/provenance gates,
  focused tests, fixed-timestamp byte-identical replay, and scoped whitespace
  checks.
- The canonical registry now contains 60 blocked manifests: 51 for 2024 and
  nine for 2020. The 2020 ledger records nine reviewed/blocked jurisdictions and
  42 not started, with zero public-eligible historical layers. No state ETL
  artifact or production database row was changed by these historical geometry
  diagnostics.
### 2026-08-02 - 2020 historical acquisition wave 4

- Alaska retains an official 2020 results-index and House District 1 Statement
  of Votes Cast source chain showing named precincts plus district-level
  absentee, early-voting, and question reporting units. Alaska results are not
  assigned to county equivalents. The live official precinct service returns a
  single `AsOfDate` of May 24, 2022, so it is a 2022-dated availability lead,
  not an election-date 2020 snapshot. No complete immutable statewide result
  target, official crosswalk, geometry, or vote assignment is approved and
  delivery is null.
- Alabama retains the exact 938,137-byte official SOS ZIP containing all 67
  county workbooks. Independent parsing confirms 2,111 county-qualified source
  headers: 1,975 precinct-or-unclassified, 69 absentee, and 67 provisional.
  Summing all four named presidential candidate rows produces 2,323,282 votes
  and exactly one zero-named-candidate-vote reporting unit; overvotes and
  undervotes are excluded from that context-only total. With no retained
  election-applicable statewide or complete county-set geometry or official
  crosswalk, all source identities remain evidence context, every approved
  target/crosswalk metric is zero, and delivery is null.
- Arkansas retains official TotalResults metadata for election 1841 and
  President contest 673, both marked official, with 75 county result
  locations. No immutable detailed 2020 result body, stable precinct identity
  universe, election-applicable boundary edition, or official crosswalk is
  retained. The official GIS lead describes a precinct compilation finalized
  in 2012 and is not reused for 2020. Approved targets and vote assignments
  remain zero and delivery is null.
- Independent review corrected Alabama's initial first-candidate-only vote
  count and prevented its 2,111 source headers from being promoted into target
  or relationship metrics. Alaska's service wording was corrected from
  unqualified current geometry to a live 2022-dated lead. Arkansas passed its
  first review. All three packages then passed syntax, fixed-timestamp
  byte-identical replay, artifact/hash validation, focused tests, and scoped
  whitespace checks.
- The canonical registry now contains 63 blocked manifests: 51 for 2024 and 12
  for 2020. The 2020 ledger records 12 reviewed/blocked jurisdictions and 39
  not started, with zero public-eligible historical layers. No state ETL
  artifact, production database row, or public map delivery was changed.
### 2026-08-02 - 2020 historical acquisition wave 5

- Arizona retains the exact official SOS 2020 General Detail XML ZIP:
  1,808,603 compressed bytes with one 36,305,861-byte XML member. The source
  confirms election date November 3, President contest key 3509, 11,912
  candidate rows, 1,489 distinct precinct keys, and 3,385,294 votes as source
  context. No immutable statewide or complete 15-county election-applicable
  boundary artifact or official result-to-feature crosswalk is retained. The
  live Maricopa map service is county-only and weekly refreshed, so it is not
  used for 2020 statewide geometry. Approved targets remain zero and delivery
  is null.
- California retains the official SOS Statement-of-Vote page and President-by-
  County workbook with 58 county context rows. Four retained artifacts also
  preserve California Statewide Database catalog leads, explicitly as a
  supplemental UC Berkeley product rather than a silent replacement for SOS or
  county sources. The retained pages mix a 2020 General label with Statement-
  of-Vote data described as by 2016 precinct and conversions based on 2010
  TIGER/Line blocks; those labels do not prove an election-date boundary/result
  vintage. No SWDB result, geometry, crosswalk, or reconciliation payload is
  admitted. Approved targets remain zero and delivery is null.
- Colorado retains the exact 14,341,332-byte official SOS President contest
  CSV. Independent parsing confirms 83,330 precinct rows: 76,920 named-
  candidate rows and 6,410 total-vote pseudocandidate rows across 3,205
  `division_id` values, 24 candidate IDs, 3,256,980 named-candidate votes, and
  five context units with zero named-candidate votes. The rows lack a parent-
  county field, and the reviewed GIS lead is county-scoped/undated rather than
  an immutable statewide November 3, 2020 layer. No parent FIPS, target
  identity, feature relationship, or vote assignment is inferred; delivery is
  null.
- Independent reviews passed Arizona and Colorado without correction.
  California passed after the mixed-vintage SWDB labels were made explicit and
  pinned in its regression test. All three packages passed exact artifact
  recounts, syntax, manifest/hash validation, focused fixed-timestamp offline
  replay, and scoped whitespace checks. The requested Luna reviewer profile was
  unavailable in this runtime, so bounded reviews used the available Terra
  profile and recorded that limitation.
- The canonical registry now contains 66 blocked manifests: 51 for 2024 and 15
  for 2020. The 2020 ledger records 15 reviewed/blocked jurisdictions and 36
  not started, with zero public-eligible historical layers. No state ETL
  artifact, production database row, or public map delivery was changed.
### 2026-08-02 - Reboot checkpoint after 2020 wave 5

- Work is intentionally paused for a system reboot. The three active Wave 6
  workers for Connecticut, Hawaii, and Idaho were interrupted; no worker remains
  running.
- The last integrated checkpoint is 66 blocked manifests: 51 for 2024 and 15
  for 2020. The 2020 ledger has 15 reviewed/blocked jurisdictions and 36
  `not_started`; 2016 and 2012 remain entirely queued. No layer is public-
  eligible and no production promotion or database write occurred.
- Wave 6 state-local candidate files already exist for CT, HI, and ID: one
  collector, one focused test, and an election-scoped artifact directory for
  each state. They were present when the workers were interrupted and must be
  treated as unreviewed, unintegrated work. They are not listed in the canonical
  registry, 2020 ledger, package test runner, or completed-wave log.
- Resume by inspecting the CT/HI/ID state-local diffs and asking each interrupted
  worker to finish its handoff. Run each focused fixed-timestamp replay, obtain
  an independent no-edit review, and correct/re-review any finding. Only after
  all three pass should the coordinator refresh the registry and 2020 ledger as
  Wave 6, update shared count/list tests and the package runner, append the Wave
  6 evidence log, run `npm run validate:precinct-geometry`, and rerun the
  complete precinct suite.
- At this checkpoint the complete 66-manifest precinct suite, generic manifest
  and four-ledger validation, TypeScript check, and local MCP integration tests
  pass. The MCP test initially encountered sandbox `spawn EPERM` and passed when
  rerun with child-process permission; this is an execution-environment note,
  not a product failure.

### 2026-08-02 - 2020 historical acquisition wave 6

- Connecticut retains five exact official EMS artifacts for election 54/version
  64824. They establish 169 town-level President result contexts and eight
  historical source county labels, but no precinct, ward, or voting-district
  candidate-result universe, election-applicable boundary edition, or official
  result-to-feature crosswalk. All target metrics remain zero, no vote is
  assigned, and delivery is null.
- Hawaii retains the certified statewide detail and summary exports: 1,506
  President candidate rows, 251 source identities, 250 numbered precinct/split
  identities, one non-geographic identity, and 574,469 named-candidate votes.
  Those are source context only. The May 2024 Statewide GIS service and the
  Office's 2018/2022 GIS-index links are not reused as November 2020 geometry;
  approved geometry and crosswalk metrics remain zero and delivery is null.
- Idaho retains the exact 1,699,218-byte official canvass HTML with SHA-256
  `282d5f54fb036a532352f31f25f1d3a01f8fe09d6ebba0132a2defb2816e3a42`.
  Independent recount records 889 county-nested precinct-label occurrences,
  795 unique label strings, and 94 duplicate occurrences. The 2024-named
  boundary service remains context only; no 2020 geometry, crosswalk, target
  identity, vote assignment, or delivery is approved.
- Independent review caught and corrected Connecticut's Version.json locator:
  the exact official endpoint is election-scoped at `/election/54/Version.json`,
  not under version 64824. Review also caught Idaho's inaccurate use of
  `distinct` for 889 label occurrences; the collector now preserves occurrence
  and unique-label counts separately and regenerates only from the hash-pinned
  retained artifact at a fixed timestamp. Both packages passed post-fix review;
  Hawaii passed its first review. The requested Luna reviewer profile was
  unavailable, so bounded no-edit reviews used the available Terra profile and
  recorded that limitation.
- The canonical registry now contains 69 blocked manifests: 51 for 2024 and 18
  for 2020. The 2020 ledger records 18 reviewed/blocked jurisdictions and 33
  `not_started`; 2016 and 2012 remain fully queued. The fixed MCP precinct
  validator, focused shared tests, all three deterministic state replays, the
  complete precinct suite, and TypeScript checking pass locally. No ETL staging
  artifact, production database row, public delivery asset, or Git publication
  was changed.

### 2026-08-02 - 2020 historical acquisition wave 7

- Illinois retains the exact official 2020 presidential results CSV, certified
  county workbook, and State Board precinct-map directory context. Independent
  recount confirms 63,063 CSV rows, 10,142 jurisdiction-qualified identities,
  10,113 named precinct identities, 29 no-precinct groups, 26 zero-vote
  identities, 108 election jurisdictions, and 102 county workbook names. The
  map directory mixes 2020-2024 material and supplies no statewide feature IDs,
  2020-specific CRS/reuse proof, or result crosswalk, so approved target metrics
  remain zero.
- Indiana retains its exact official 2020 President ENR export: 92 county/locality
  regions, 1,380 candidate rows, and 3,033,121 candidate votes. The official
  2023 count of 5,147 precincts and the current 2024-named IndianaMap layer of
  5,126 features are isolated as later context and are not reused as 2020
  geometry. Third-party MIT and OpenElections material remains excluded from
  geometry evidence.
- Kansas retains the official precinct-results workbook and certified totals PDF.
  Independent review confirms 8,265 long candidate rows, 2,755 long identities,
  1,112 wide identities, 3,867 contextual identities, and 462 contextual
  zero-vote identities. The workbook reconciles the certified presidential
  totals. Douglas County's 73-feature service has 2026 edit timestamps and is
  explicitly isolated as current context, not admitted as November 2020 geometry.
- All three deterministic state packages passed independent no-edit review with
  exact byte/hash verification and fixed-timestamp replay. The requested Luna
  reviewer profile was unavailable, so the available Terra profile performed
  and documented the bounded reviews. Each package remains fail-closed with
  unknown vintage, zero approved features/targets/crosswalks/vote assignments,
  blocked validation, and `delivery: null`.
- The canonical registry now contains 72 blocked manifests: 51 for 2024 and 21
  for 2020. The 2020 ledger records 21 reviewed/blocked jurisdictions and 30
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication was
  changed.
- Wave 7 focused contracts, the fixed MCP precinct validator, the complete
  precinct-geometry suite, TypeScript checking, and scoped diff checking all
  pass locally.

### 2026-08-02 - 2020 historical acquisition wave 8

- Kentucky retains the exact 355,106-byte official 2020 General Election
  Results PDF with SHA-256
  `66bb0eedd13f43b09b2e42f9b6119bf292e6361b0657fc4e2ab56907c3511773`.
  It proves 120 county President rows and 2,136,768 votes, but it supplies no
  precinct/VTD result identity universe, election-applicable boundary edition,
  or result-to-feature crosswalk. Current VTD data is not reused as 2020
  evidence; every target metric is zero and delivery is null.
- Louisiana retains the exact official SOS President CSV, Legislature source
  page, and Legislature-hosted 2019-named precinct ZIP. The SOS file has 4,062
  unique Parish/Ward/Precinct identities: 3,934 geographic and 128 early or
  provisional non-geographic units. The ZIP has 3,759 DBF records, but its
  filename is not an effective-date attestation; the indexed validated
  2020-Census VTD layer is dated August 23, 2021. With no official SOS-to-VTD
  crosswalk, all 3,934 geographic identities remain unmatched and no vote is
  assigned.
- Massachusetts retains the official PD43+ 2020 President export with 2,173
  unique city/town-ward-precinct identities and the complete 2,152-feature
  official MassGIS 2012-era layer, whose item metadata notes Boston edits in
  fall 2018. The later 2022 redistricting layer is explicitly excluded. No
  official source proves statewide November 3, 2020 continuity or supplies a
  PD43+-to-feature crosswalk, so approved geometry/result/crosswalk/vote metrics
  remain zero and delivery is null.
- Independent review passed Kentucky and Louisiana without a substantive
  correction. Massachusetts review caught an incomplete pagination locator and
  then a retained count-response mismatch. The final package pins the exact
  14-byte `{"count":2152}` response (SHA-256
  `4e6ecf9c54d26bed490ee2259a3989c65f588fbe16eb17d4770a6feba4d85fde`),
  both ordered query-page URLs, and deterministic concatenation/newline/gzip
  provenance; its final post-fix review passed. Luna/high was unavailable, so
  bounded no-edit reviews used the available Terra profile and recorded that
  limitation.
- The canonical registry now contains 75 blocked manifests: 51 for 2024 and 24
  for 2020. The 2020 ledger records 24 reviewed/blocked jurisdictions and 27
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication changed.
- Wave 8 focused state and shared contracts, the fixed MCP precinct validator,
  the complete precinct-geometry suite, TypeScript checking, and scoped diff
  checking all pass locally.

### 2026-08-02 - 2020 historical acquisition wave 9

- Maryland retains the exact official SBE presidential precinct CSV, Planning
  Department redistricting-data page, Green Report, and 68,966,362-byte
  Adjusted2020GeoJSON ZIP (SHA-256
  `a28f1912dc7fb42541a39d1dfbb8be2d92c3939d1e68c3965bdd66d618dc8cbc`).
  The archive contains only a 647,141,659-byte Census-block GeoJSON member:
  83,827 unique blocks, 2,033 numeric county-qualified VTD identities, and
  1,135 block records assigned to nine `ZZZZZZ` placeholders. The Green
  Report supports April 1, 2020 boundary context, not proven November 3
  continuity. A contextual comparison finds 2,002 exact identity candidates
  covering 3,004,934 votes, 33 unmatched SBE identities, and 31 archive-only
  VTDs, but there is no direct VTD polygon member, reviewed dissolve, or
  official result-to-feature crosswalk. Approved metrics remain zero.
- Maine retains the exact 46,629-byte official President county/town workbook
  (SHA-256
  `f873175d5fa449941bcf27f3efc4d30efca13d8865d4555f325a9811be3d1142`)
  and 36,280-byte election-date active-registration file (SHA-256
  `30d260d847c36d92455316249e85bd6dc95b71094231c60d9b83e25b0a5885d5`).
  The latter has 641 unique county/municipality/W/P keys, but it is
  registration context rather than a precinct candidate-result universe. The
  current 8,421-feature state municipal/territory service has no ward or
  precinct fields, historic moments, or 2020 applicability proof. No stable
  election result-to-boundary relationship is approved.
- Missouri retains the exact official SOS results page and 1,814,470-byte 2020
  county/election-authority PDF (SHA-256
  `ef232d6f4b81423187e3f70693f90bd4ecbb8a3c32daccdca7c95c5d79bdf22e`).
  The public precinct files for 1996-2024 are purchase-only. The PDF has 116
  election-authority rows reconcilable to 115 counties; its six-column
  normalized baseline is 3,025,160 votes, while three additional displayed
  write-in columns add 802 for an official all-candidate total of 3,025,962.
  That reconciliation is county context only. The reviewed DNR service contains
  legislative districts, not precincts, so no election-applicable geometry or
  precinct identity universe is retained.
- Independent review caught Maryland's initially overlooked official
  redistricting lead and Missouri's initially ambiguous vote-scope wording.
  Both were corrected and passed no-edit post-fix review; Maine passed without
  a substantive correction. Maryland's independent streaming recount matched
  the source hashes, archive member, block/VTD counts, and SBE comparison
  exactly. Luna/high was unavailable, so the bounded reviews used the available
  Terra profile and recorded that limitation.
- The canonical registry now contains 78 blocked manifests: 51 for 2024 and 27
  for 2020. The 2020 ledger records 27 reviewed/blocked jurisdictions and 24
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication changed.
- Wave 9 focused state and shared contracts, the fixed MCP precinct validator,
  the complete precinct-geometry suite, TypeScript checking, and scoped diff
  checking all pass locally.
### 2026-08-02 - 2020 historical acquisition wave 10

- Mississippi retains the exact 234,971-byte official SOS statewide recap CSV
  (SHA-256
  `f0f5174a3c6e792d40544602869c292871e131f1e9a7a86ae811d76d9a7337e5`)
  with 738 President candidate rows across 82 counties and 1,313,759
  named-candidate votes. Its official county index exposes 104 precinct-report
  PDF paths, but no complete reviewed machine-readable statewide precinct
  identity universe. The 1,834-feature MARIS layer is expressly a 2020 Census
  VTD product, not proof of November 3 election precinct boundaries or a
  result-to-feature crosswalk. Approved target metrics remain zero.
- Montana retains the exact official 2020 SOS workbook with 1,989 President
  candidate rows, 663 county-qualified precinct identities across 56 counties,
  and 603,640 DEM/LIB/REP votes; 34 separately reported write-ins remain
  unallocated context. Review found two distinct official State Library
  archives. The 1,182,012-byte `MontanaVotingPrecincts20210127.zip` actually
  contains a weed-district geodatabase. The authentic 80,594,718-byte
  `MontanaVotingPrecincts2021.zip` (SHA-256
  `610254789a409add7ce3608babdbe0689b37269a73095163f37315f4fbee8001`)
  contains 666 contextual precinct polygons, but its lineage records multiple
  post-election changes from November 23, 2020 through September 30, 2021.
  With no November 3 snapshot or official crosswalk, none is approved.
- North Dakota retains the exact 332,260-byte official archived dashboard
  (SHA-256
  `3d32f2e8b85fd12e0e6983a54ed250195709fd2dae0d7afc3e43327b66d62402`),
  which identifies election 313, 422 fully reported precincts, President race
  14775, and 361,819 displayed votes. The retained SOS JavaScript documents
  only the archived county endpoint. A proposed precinct URL returned a county
  aggregate placeholder and is explicitly unretained and non-evidentiary. The
  exact 356,407-byte Census VTD ZIP (SHA-256
  `ceb2907744a15c34f9bd8edeb435bb68f9bf1854c1fcf242ce07533faec9eb6a`)
  remains statistical geography context without SOS applicability or crosswalk
  proof; current NDGIS material is excluded.
- Independent review passed Mississippi directly. It caught Montana's
  overlooked authentic 2021 archive and then required explicit disclosure that
  the collector byte-pins the FileGDB while the 666-feature catalog facts are a
  separately reviewed fixed attestation, not a fresh replay parse. Review also
  removed North Dakota's unsupported archived-precinct endpoint template.
  Every correction passed no-edit post-fix review. Luna/high was unavailable,
  so bounded reviews used the available Terra profile and recorded that
  limitation.
- The canonical registry now contains 81 blocked manifests: 51 for 2024 and 30
  for 2020. The 2020 ledger records 30 reviewed/blocked jurisdictions and 21
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication changed.
- Wave 10 focused state and shared contracts, the fixed MCP precinct validator,
  the complete precinct-geometry suite, TypeScript checking, and scoped diff
  checking all pass locally.

### 2026-08-02 - 2020 historical acquisition wave 11

- Nebraska retains 1,402 official Census TIGERweb VTD polygons across all 93
  counties as context: 1,323 actual VTDs and 79 pseudo-VTDs. The official
  county baseline has 93 rows and 956,383 presidential votes. Official
  county-hosted Keith and Nemaha reports demonstrate heterogeneous precinct
  summary formats, while the retained Nebraska GIS catalog query returned no
  statewide election-precinct candidate. Census VTD equivalence, post-election
  2021 district maps, and the restricted $500 voter file are not used as an
  election-date crosswalk; approved geometry, result-unit, and vote metrics
  remain zero.
- New Hampshire retains the exact official SOS President and write-in workbooks
  plus the official GRANIT NHPolitDists ZIP. The workbooks establish 320
  county-qualified local result identities, including 18 zero-vote identities,
  803,833 named-candidate votes, and 2,372 recognized write-ins for 806,205
  context votes. The archive yields 324 WGS84 candidate polygons and 78 ward
  polygons, but its metadata period ends in 2017. Rockingham has 44 geometry
  features versus 41 result units, and Strafford has 28 versus 27. With no
  November 3 continuity proof or official crosswalk, all 320 identities remain
  reviewed-unmatched and no votes are assigned. Exact SHP, DBF, PRJ, and TXT
  members are recorded, including the metadata constraint "Not for legal use."
- New Jersey retains 6,348 unique official NJOGIS election-district candidate
  polygons from four ordered, hash-pinned ArcGIS pages covering all 21
  counties. The item and metadata describe a 2019-2020 Election Day layer, but
  the live service was edited November 24, 2021 and exposes no historical
  moment. The amended turnout report lists 6,346 districts; Camden alone
  accounts for the two-feature difference, with 343 reported versus 345 live
  features. The 2020 election page exposes county PDFs but no complete retained
  result-CSV universe matching ELECD_KEY. Result, crosswalk, and vote metrics
  remain zero; vintage is unknown and delivery is null.
- Independent review passed Nebraska and New Jersey. New Hampshire's first
  review rejected three obsolete pre-fix outputs that contradicted the
  corrected package. Those files were removed, exact archive-member and use
  constraint provenance was added, and no-edit post-fix review passed. Luna/high
  was unavailable through the reused-agent interface, so bounded reviews used
  the available fallback and recorded that limitation.
- The canonical registry now contains 84 blocked manifests: 51 for 2024 and 33
  for 2020. The 2020 ledger records 33 reviewed/blocked jurisdictions and 18
  not_started; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication changed.
- Wave 11 focused tests passed 40/40. The fixed MCP precinct validator passed
  with audit at .etl/mcp-runs/2026-08-02T23-05-22-764Z-12fcaf20/manifest.json.
  The complete precinct-geometry suite passed in 156.9 seconds, TypeScript
  checking passed, and scoped diff/text-hygiene checks passed locally.
### 2026-08-02 - 2020 historical acquisition wave 12

- New Mexico retains the exact official SOS precinct result JSON: 11,550
  candidate rows across 1,925 county-qualified result units and all 33
  counties. The deterministic masked-count inference produces 923,963 votes,
  two below the 923,965 certified statewide total. The retained official RGIS
  archive yields 2,163 polygon candidates, but its metadata conflicts across
  2020-2022 dates and identifies a post-Census/2021-redistricting lineage.
  Neither StatePrecinctID nor display-number diagnostics provide an approved
  crosswalk. All 1,925 colorable units remain unmatched, no votes are assigned,
  vintage is unknown, and delivery is null.
- Nevada retains exact official Census, Clark County, Washoe County, and
  archived SOS artifacts. Clark's streamed 1.33 GB CVR member establishes
  1,013 result identities and 972,236 presidential selections versus 972,510
  certified; Washoe establishes 563 geographic identities, four explicitly
  non-geographic rows, and 252,142 published presidential votes. The Census
  archive yields 2,102 statewide VTD candidate polygons, but its metadata does
  not establish November 3 election applicability and fifteen local election
  authorities remain absent. All 1,576 geographic result identities remain
  unmatched, no votes are assigned, vintage is unknown, and delivery is null.
- New York retains the official NYC BOE election-district result CSV and the
  exact DCP 20D water-included election-district archive. The package preserves
  5,901 result identities and 5,901 polygons across the five NYC
  county-equivalents. It reviews 5,760 colorable targets, 141 zero-vote
  source aliases, 5,656 one-to-one targets, and 104 one-to-many targets; every
  polygon is consumed once and all five county totals reconcile to 3,066,581.
  Election-date vintage is confirmed for this five-county package, but 57
  county-equivalents and a reviewed historical local-result import/display
  chain remain absent. No loaded or displayable vote assignment is asserted,
  and delivery remains null.
- Independent no-edit review passed all three packages. The delegated runtime
  did not expose the preferred Luna/high selector, so reviewers used the
  available fallback and recorded that limitation. A rejected 167-byte Census
  response in New Mexico was removed before review and replaced by the valid
  15,009,689-byte official contextual archive; New York's known-403 page was
  removed from its collector and declared inventory rather than retained as a
  source artifact.
- The canonical registry now contains 87 blocked manifests: 51 for 2024 and 36
  for 2020. The 2020 ledger records 36 reviewed/blocked jurisdictions and 15
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  production database row, public delivery asset, or Git publication changed.
- Wave 12 focused integration tests passed 54/54. The fixed MCP precinct
  validator passed with audit at
  .etl/mcp-runs/2026-08-03T00-20-47-020Z-91f70a3c/manifest.json. The complete
  precinct-geometry suite passed in 154.2 seconds, TypeScript checking passed,
  Nevada's newline-only hygiene normalization replayed successfully, and
  scoped diff/text-hygiene checks passed locally.

### 2026-08-02 - 2020 historical acquisition wave 13

- Ohio retains the 22,523,450-byte official SOS precinct workbook through a
  timestamped Internet Archive replay of the original official URL, plus the
  16,218,634-byte official Census TIGER2020PL VTD archive. The workbook proves
  8,933 county-qualified result identities across all 88 counties. Census has
  8,941 candidates: 8,933 actual VTDs and eight pseudo-VTDs. Every result code
  has one same-county candidate in the final three VTD-code characters, but no
  retained authority documents that suffix as a crosswalk or proves January 1
  boundaries remained effective November 3. All 8,933 result units remain
  unmatched, no votes are assigned, vintage is unknown, and delivery is null.
- Oklahoma retains exact official SBE PLCSV and CLCSV exports and official
  OKMaps/OU CSA context. The PLCSV has 1,950 presidential units: 1,948
  geographic identities, two countywide 9999 units holding 176,517 votes, and
  17 zero-vote geographic identities; all 77 counties and the 1,560,699-vote
  statewide total reconcile to CLCSV. The pre-election candidate WFS has 1,948
  polygons and exact identifier-set overlap, but its catalog calls it "2010
  Voter Precincts," published September 30, 2019, without election-date
  continuity evidence. Eleven native null county values are preserved and
  parent GEOIDs are inferred only from unique same-layer mappings (Pushmataha
  64 to FIPS 127; Tulsa 72 to FIPS 143). All 1,948 geographic results remain
  unmatched, no votes are assigned, vintage is unknown, and delivery is null.
- Oregon retains the exact 94,190,830-byte official ORMS EPD/21/1 archive and
  its 36 county files: 33 PDFs and three CSVs. Twenty PDFs are image-only result
  tables, not boundary maps; the three CSVs expose 216 President identities as
  limited context. The current SOS precinct product is an eight-column table
  with no geometry and a July 6, 2026 update, while the official Census Oregon
  directory lists 31 archives and no VTD layer. No complete election-applicable
  geometry or crosswalk was found, so feature/result/crosswalk metrics remain
  zero and delivery is null. OCR is explicitly barred from manufacturing GIS
  coordinates, topology, stable IDs, or result-to-polygon authority.
- Independent no-edit review passed all three state-local packages after
  coordinator-reserved shared integration was excluded from the review gate.
  The preferred Luna/high reviewer selector was unavailable; bounded reviews
  used the exposed Terra/medium or reused-agent fallback and recorded that
  limitation. Oklahoma review independently recomputed all raw hashes, vote
  totals, WFS canonical hashes, candidate overlap, and same-layer parent
  inferences.
- The canonical registry now contains 90 blocked manifests: 51 for 2024 and 39
  for 2020. The 2020 ledger records 39 reviewed/blocked jurisdictions and 12
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  database row, public delivery asset, production system, or Git publication
  changed.
- Final Wave 13 focused state/shared integration coverage passes 66/66 after a
  stale shared reviewed-wave map expectation was updated from Wave 12. The MCP
  precinct validator passed with audit at
  .etl/mcp-runs/2026-08-03T01-23-06-217Z-1bac3be8/manifest.json. The complete
  precinct-geometry suite passed in 215.2 seconds and TypeScript checking
  passed locally. Scoped diff/text-hygiene and registry/ledger/runner JSON
  invariant checks also passed.

### 2026-08-02 - 2020 historical acquisition wave 14

- Pennsylvania retains the exact 28,738,883-byte official Department of State
  election-return file, its ReadMe, and a generated source lead. The return file
  has 179,507 rows, including 27,561 presidential-candidate rows across all 67
  counties and 9,187 county-qualified precinct identities; each identity has
  exactly three candidate rows. The ReadMe supplies county, precinct, and VTD
  fields but no polygon geometry, election-date boundary edition, feature ID, or
  authoritative crosswalk. The legacy official download currently returns 404,
  so the exact hash-pinned official bytes are retained as an access-limited
  source; no absence claim is made. Geometry and crosswalk metrics remain zero,
  no votes are assigned, and delivery is null.
- Rhode Island retains the exact finalized Board of Elections result archive,
  statewide totals, and seven RIGIS/ArcGIS metadata or geometry artifacts. The
  finalized result universe has 504 units: 421 regular precincts, 40 Limited,
  39 presidential-only, and four Federal units; totals reconcile to 517,757
  votes. RIGIS metadata directs 2011-2021 users to the 2016 cycle, but the
  419-feature service is mutable, non-versioned, and post-election edited, with
  only OBJECTID, NAME, and shape fields and no municipality/parent/crosswalk.
  All 421 regular units remain unmatched; 83 administrative units remain
  explicitly non-geographic; no geometry is approved, no votes are assigned,
  and delivery is null. Coordinator integration also corrected the collector to
  emit the standard availability-diagnostic contract and added regression
  assertions after the registry rejected placeholder null/empty schema fields.
- South Carolina retains the exact official Election Commission result CSV,
  Census TIGER2020PL VTD archive, Census county-parent context, and a June 2022
  RFA official-origin ZIP retrieved through timestamped Internet Archive
  transport. Results contain 2,399 precinct rows: 2,261 ordinary geographic
  rows and 138 explicit Failsafe/Provisional administrative rows. Census has
  2,268 January 1 candidates, but election-date continuity and an official
  result-to-feature crosswalk are unproven, so all 2,261 ordinary rows remain
  unmatched and no votes are assigned. Review found that 36 Lancaster DBF
  records contain the literal 18991230 sentinel while citing 2022 Act No. 125
  (H.4495). The corrected audit records 1,980 genuine on-or-before dates, 214
  post-election dates, and 66 invalid dates: 36 sentinels plus 30 blank or
  unparseable values. A Tokyo-time replay regression proves all nine package
  artifacts remain byte-identical across timezone handling. Delivery is null.
- Independent no-edit review passed Pennsylvania and Rhode Island. South
  Carolina failed twice before passing: first for treating the 36 sentinel
  records as pre-election dates, then for timezone-dependent UTC conversion.
  Both defects were corrected in the reproducible collector and covered by
  tests before integration. The preferred Luna/high reviewer selector was
  unavailable; bounded reused-agent reviews recorded the limitation and made no
  model claim.
- The canonical registry now contains 93 blocked manifests: 51 for 2024 and 42
  for 2020. The 2020 ledger records 42 reviewed/blocked jurisdictions and nine
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  database row, public delivery asset, production system, or Git publication
  changed.
- Wave 14 focused state/shared integration coverage passed 64/64. The fixed
  MCP precinct validator passed with audit at
  .etl/mcp-runs/2026-08-03T02-52-52-480Z-76979cc4/manifest.json. The complete
  precinct-geometry suite passed in 241.5 seconds and TypeScript checking
  passed locally. Scoped registry/ledger/runner invariants, diff checks, and
  generated-text hygiene also passed.

### 2026-08-02 - 2020 historical acquisition wave 15

- South Dakota retains six exact official artifacts for ElectionID 422: the
  election-history page, President and U.S. Senate ResultsAjax payloads, state
  and county canvass PDFs, and the polling-place directory. The 149,141,181-byte
  county canvass is retained without treating PDF text or imagery as geometry.
  ResultsAjax contains the same 693 county-qualified StatePrecinctID units
  across all 66 counties for both contests: 2,079 President candidate rows and
  422,567 votes, plus 1,386 Senate rows and 420,178 votes. The SOS page labels
  the archive unofficial, and no retained source supplies election-date
  polygons, authoritative feature IDs, or a result-to-feature crosswalk.
  Geometry/result-target/crosswalk metrics remain zero, no votes are assigned,
  and delivery is null.
- Tennessee retains the exact 169,716-byte official SOS 2020 General by County
  PDF plus current Comptroller service metadata and count evidence. Independent
  parsing confirms 95 county President rows and 3,053,851 votes: 1,852,475
  Trump, 1,143,711 Biden, and 57,665 other. That county-grain source provides no
  precinct result identity universe. The current Comptroller service reports
  3,231 features but describes irregular updates and does not support historic
  moments, so it cannot establish a November 3, 2020 edition or crosswalk.
  Geometry/result-target/crosswalk metrics remain zero, no votes are assigned,
  and delivery is null.
- Texas retains seven exact official artifacts: a 46,736,728-byte TLC 2020
  General VTD shapefile ZIP, a 54,629,265-byte TLC election-data ZIP, both CKAN
  metadata records, the separate 47,065,588-byte county-precinct context ZIP
  and metadata, and an 81,434-byte Texas SOS presidential-results page. TLC
  explicitly directs a VTDKEY/vtdkeyvalue-to-VTDKEY join. The paired source has
  9,157 valid election-date VTD polygons and 9,157 result units across all 254
  counties, with 9,157 reviewed one-to-one relationships, no missing/extra
  keys, and 353 zero-vote VTDs. The VTD layer remains distinctly labeled and is
  not silently relabeled as an administrative county precinct layer.
- Texas TLC President totals are Trump 5,889,022, Biden 5,257,513, Jorgensen
  126,212, Hawkins 33,378, and generic Write-In 10,927, totaling 11,317,052.
  The retained official SOS page totals 11,315,056; TLC-minus-SOS deltas are
  -1,325, -1,613, -31, -18, and +4,983 respectively, or +1,996 overall. The
  exact official join is reviewed, but VTD product semantics, this unresolved
  source-scope difference, and the absence of an immutable delivery artifact
  keep validation blocked and delivery null. Vote values are absent from the
  normalized geometry and crosswalk.
- Review gates prevented defects from entering shared state. Texas first emitted
  invalid status/count schema fields and a stale feature-ID form; coordinator
  checks returned it for correction. Independent review then rejected a source
  CRS described as geographic even though the raw PRJ is NAD_1983 Lambert
  Conformal Conic in meters. Evidence, report, manifest, and tests now preserve
  the projected source CRS and EPSG:4326 served CRS separately; corrected
  independent replay passed. South Dakota and Tennessee also passed no-edit
  review. Preferred Luna/high review was unavailable, so bounded Terra/high or
  available-runtime fallbacks recorded the limitation.
- The canonical registry now contains 96 blocked manifests: 51 for 2024 and 45
  for 2020. The 2020 ledger records 45 reviewed/blocked jurisdictions and six
  `not_started`; 2016 and 2012 remain fully queued. No ETL staging artifact,
  database row, public delivery asset, production system, or Git publication
  changed.
- Wave 15 focused state/shared integration coverage passed 65/65. The fixed
  MCP precinct validator passed with audit at
  .etl/mcp-runs/2026-08-03T03-33-50-694Z-5741f16e/manifest.json. The complete
  precinct-geometry suite passed in 278.5 seconds and TypeScript checking
  passed locally. Scoped registry/ledger/runner invariants, diff checks, and
  generated-text hygiene also passed.
### 2026-08-02 - 2020 historical acquisition wave 16

- Utah retains four exact official artifacts: the 25,073-byte historical-
  results page, 1,856,696-byte 2020 General canvass PDF, 361,940-byte
  statewide canvass workbook, and 50,238-byte UGRC Vista product page. The
  canvass artifacts provide county/statewide context, while the UGRC page
  describes a periodically updated current product and change history rather
  than an immutable November 3, 2020 boundary edition. No complete official
  precinct-result identity export or official result-to-feature crosswalk is
  retained. Approved geometry, result-target, crosswalk, and delivery counts
  remain zero; no votes are assigned and delivery is null.
- Virginia retains the exact 140,611-byte official ElectionStats President
  CSV and 45,752-byte current Department of Elections GIS page. Independent
  parsing proves 2,775 unique sequential locality-qualified precinct
  identities across 133 parents (95 counties and 38 independent cities),
  with zero duplicate identities and 4,460,524 votes: 2,413,568 Biden,
  1,962,430 Trump, and 84,526 other.
- Virginia also retains the official 19,997,192-byte TIGER2020PL VTD ZIP,
  37,436-byte ISO metadata, 2,523,504-byte technical document, and
  130,106-byte data.gov Census VTD-series catalog page. Deterministic parsing
  finds 2,465 unique GEOID20 features across 133 parents, including 2,460
  Polygon and five MultiPolygon features. The catalog supports its recorded
  2019-06-01 through 2020-05-01 series span, while the retained ISO temporal
  fields are empty. The package does not reinterpret a catalog issue date as
  a VTD boundary vintage and does not equate Census VTDs with ElectionStats
  precincts. No November 3 applicability or official crosswalk is proven, so
  the candidate polygons stay out of approved normalization; crosswalk and
  vote-assignment counts remain zero and delivery is null.
- Vermont retains the exact 19,014-byte official Election Archive 144513
  municipality CSV, 2,034,224-byte current VCGI town GeoJSON, and
  93,814-byte VCGI BNDHASH metadata. The archive has 246 unique City/Town
  President units after excluding TOTALS. The 256 current town polygons and
  2025B/general-mapping metadata cannot establish the 2020 split-town, ward,
  or reporting-district configuration. All 246 result units remain reviewed-
  unmatched; the normalized geometry is empty, no votes are assigned, and
  delivery is null.
- Independent review passed Utah and Vermont without edits. Virginia first
  failed review because the Census VTD candidate had been overlooked and the
  result parser did not strictly prove unique parent-qualified identities.
  After correction, a second review rejected unsupported temporal and
  boundary-date claims. The final package retains the official catalog
  evidence, asserts the empty ISO dates, and removes the VTD-specific January
  1 claim; final no-edit review passed. Preferred Luna/high review was
  unavailable, so bounded Terra/high fallbacks were used. The final Virginia
  reviewer had to be reused because the runtime reached its thread cap.
- The canonical registry now contains 99 blocked manifests: 51 for 2024 and
  48 for 2020. The 2020 ledger records 48 reviewed/blocked jurisdictions and
  three not_started, with zero public-eligible layers. Wisconsin, West
  Virginia, and Wyoming are the final queued 2020 wave. No ETL staging
  artifact, database row, public delivery asset, production system, or Git
  publication changed.
- Wave 16 focused state/shared integration coverage passed 33/33. The fixed
  MCP precinct validator passed with audit at
  .etl/mcp-runs/2026-08-03T04-17-00-516Z-a32b2d62/manifest.json. The complete
  precinct-geometry suite passed in 276.1 seconds and TypeScript checking
  passed locally. Scoped registry/ledger/runner invariants, diff checks, and
  generated-text hygiene also passed.

### 2026-08-02 - 2020 historical acquisition wave 17

- Wisconsin retains the official WEC certified workbooks and proves 3,698
  unique President reporting-unit identities across all 72 counties: 2,292
  single-ward units and 1,406 combined-ward units, totaling 3,298,041 votes.
  The same identity parser finds 3,698 U.S. House rows, 1,699 State Senate
  rows, and 3,698 State Assembly rows.
- Wisconsin also retains the official LTSB item titled `2012 to 2020 Election
  Data with 2020 Wards`. Its July 2020 candidate layer contains 7,078 unique
  ward polygons across 72 counties and 1,911 municipality parents, with 49
  observed alphanumeric `STR_WARDS` values and source CRS WKID 102100/3857.
  All 183 election-value fields were excluded. LTSB documentation says its
  election values were population-disaggregated from WEC reporting units, so
  the layer is not treated as an authoritative WEC result crosswalk. The 7,059
  Census TIGER2020PL VTDs remain separate context. Approved geometry,
  result-to-feature relationships, vote assignments, and delivery remain zero.
- West Virginia retains the statewide Clarity election page plus all 55 exact
  county President detail archives. Deterministic parsing proves 1,706 unique
  county-qualified precinct identities, four choices per county, and 6,824
  candidate-precinct rows. The exact candidate totals are 545,382 Trump,
  235,984 Biden, 10,687 Jorgensen, and 2,599 Hawkins, totaling 794,652; every
  county/candidate total equals its precinct-row sum with delta zero. The
  Census VTD and WVGISTC material remains context because no immutable
  November 3 boundary edition or official result-to-feature crosswalk is
  retained. Approved geometry, crosswalk, vote-assignment, and delivery counts
  remain zero.
- Wyoming retains all 23 official county precinct-by-precinct workbooks and
  proves 480 unique county-qualified precinct identities. Candidate selections
  total 276,765: 193,559 Trump, 73,491 Biden, and 9,715 other. The official
  total-ballots-cast workbooks total 278,503; the 1,738 difference is exactly
  279 overvotes plus 1,459 undervotes and is contest non-selection context,
  not a geometry mismatch. The 512 Census VTD candidate polygons cover all 23
  counties but are not proven equivalent to SOS precinct reporting units or
  applicable on election day. All 480 result units remain reviewed-unmatched;
  no votes are assigned and delivery is null.
- Wisconsin passed independent review without correction. West Virginia and
  Wyoming initially failed because their exact vote universes were retained
  but not fully proved in machine-checkable reconciliation fields. Their
  collectors and tests were corrected to establish the totals above, and
  independent final re-reviews passed. Preferred Luna/high review was
  unavailable, so bounded Terra/high fallbacks were used on the reusable
  review threads.
- The canonical registry now contains 102 blocked manifests: 51 for 2024 and
  51 for 2020. The 2020 ledger records all 51 jurisdictions as reviewed and
  blocked, with zero public-eligible layers. The 2016 and 2012 ledgers remain
  separate and fail closed; no historical layer is inferred from another
  election.
- Adding the final tests exceeded the Windows command-line limit of the former
  inline `&& node ...` package script. The independently reviewed replacement
  is `scripts/run-precinct-geometry-tests.mjs`, which runs the same explicit,
  ordered 105-file inventory serially through `process.execPath`, without a
  shell, and propagates the first nonzero exit status. This also provides a
  scalable runner for the 2016 and 2012 waves.
- Wave 17 focused state/shared integration coverage passed 70/70. The fixed
  MCP precinct validator passed with audit at
  `.etl/mcp-runs/2026-08-03T05-11-27-273Z-6281fbd6/manifest.json`. The complete
  105-file precinct-geometry suite passed in 297.7 seconds, TypeScript checking
  passed, and scoped registry, ledger, runner, artifact-hygiene, and generated-
  text invariants passed locally. No ETL staging artifact, database row, public
  delivery asset, production system, or Git publication changed.

### 2026-08-02 - 2016 historical acquisition wave 1

- Rhode Island retains the official Board of Elections finalized long-format
  ZIP, official statewide JSON, and official RIGIS 2016-cycle item, service,
  layer metadata, and GeoJSON. Deterministic parsing proves 501 President
  result identities across 39 municipalities: 420 regular, 40 Limited, 39
  Presidential-only, and two Federal units. The exact totals reconcile with
  zero delta: 252,525 Democratic, 180,543 Republican, 31,076 other, and
  464,144 total.
- The Rhode Island RIGIS candidate contains 419 unique four-digit `NAME`
  features: 348 Polygon and 71 MultiPolygon. There are 418 literal code
  overlaps, result-only codes `1018` and `2631`, and geometry-only code `0729`.
  Those comparisons remain unapproved because the service is mutable and
  non-versioned, was created after the election, records a 2021 data edit,
  lacks municipality/parent fields, and does not define `NAME` as the BOE
  `precinctCode`. The reviewed crosswalk therefore retains 420 regular units
  as unmatched and 81 explicitly labeled administrative units as
  non-geographic; approved geometry, matches, and vote assignments remain
  zero and delivery is null.
- North Carolina retains the official 2,583,551-byte NCSBE result ZIP and the
  official 19,254,674-byte `SBE_PRECINCTS_20161004.zip` archive from the dated
  NCSBE index. The result export contains 16,041 President candidate rows and
  3,209 county-qualified identities across all 100 counties, including 45
  zero-vote identities. Exact totals are 2,189,316 Clinton, 2,362,631 Trump,
  189,617 other, and 4,741,564 total.
- North Carolina's result export has no `Real Precinct` field. A conservative,
  tested label rule supports only 268 administrative identities; the other
  2,941 remain identity-only reviewed-unmatched and are never presumed
  geographic. The dated statewide archive contains 2,704 unique
  `COUNTY_NAM|PREC_ID` features, with 2,704 source-field comparison candidates,
  505 result-only identities, and no geometry-only identities. Object date and
  field equality do not prove immutable election-day applicability or an
  official crosswalk, so target result units, normalized features,
  relationships, and vote assignments remain zero and delivery is null.
- Washington retains the official SOS all-counties CSV and the official
  `Statewide_Prec_2016.zip` candidate geometry. The CSV proves 273 President
  candidate rows, exactly seven choices in each of 39 counties, totaling
  1,221,747 Trump, 1,742,718 Clinton, 244,749 other, and 3,209,214 total. The
  geometry archive contains 7,198 unique county/precinct/state-code tuples:
  6,966 Polygon and 232 MultiPolygon features in the documented HARN
  Washington South StatePlane feet CRS.
- Washington's retained election export is county-grain. The SOS page also
  links a separate participating-county precinct export, so the package does
  not make a false source-availability claim; it only refuses to allocate the
  retained county totals among the 7,198 polygons. Its crosswalk keeps 39
  county result identities unmatched, with empty approved geometry, no vote
  fields or assignments, and null delivery.
- Independent no-edit review passed all three states. Reviewers recomputed
  source hashes and byte counts, independently parsed result and geometry
  identities, challenged result-grain/classification rules, verified offline
  replay, and accepted the zero-target or unmatched crosswalk choices. No
  state required a correction. Preferred Luna/high review was unavailable, so
  bounded Terra/high fallbacks were used on reusable review threads.
- The canonical registry now contains 105 blocked manifests: 51 for 2024, 51
  for 2020, and three for 2016. The 2016 ledger records three reviewed/blocked
  jurisdictions, 48 not started, and zero public-eligible layers. The 2012
  ledger remains separate and untouched.
- Wave 1 focused state/shared integration coverage passed 65/65. The fixed MCP
  precinct validator passed with audit at
  `.etl/mcp-runs/2026-08-03T05-50-23-682Z-66f9f980/manifest.json`; independent
  RI review audit is `.etl/mcp-runs/2026-08-03T05-46-00-694Z-d00be230/manifest.json`,
  NC review audit is `.etl/mcp-runs/2026-08-03T05-41-36-273Z-627d6ec5/manifest.json`,
  and WA review audit is `.etl/mcp-runs/2026-08-03T05-40-51-661Z-58358950/manifest.json`.
  The complete 108-file precinct-geometry suite passed in 307.9 seconds,
  TypeScript checking passed, and scoped registry, ledger, runner, artifact-
  hygiene, and generated-text invariants passed locally. No ETL staging
  artifact, database row, public delivery asset, production system, or Git
  publication changed.
### 2026-08-02 - 2016 historical acquisition wave 2

- Massachusetts retains the official PD43 precinct result export and the
  official MassGIS voting-district item, service, layer metadata, count, and
  geometry. Deterministic parsing proves 2,174 unique municipality/ward/
  precinct result identities and exactly 3,378,801 President votes. The
  candidate layer has 2,152 features across 351 `TOWN_ID` parents: 2,045
  Polygon and 107 MultiPolygon features, with 1,897 records marked `YEAR2012`
  and 255 marked `YEAR2016`. A literal diagnostic yields one candidate for
  2,092 result identities and none for 82, but 390 subprecinct result units
  and the mixed vintage fields prevent an official election-result crosswalk.
  All 2,174 colorable result units remain reviewed-unmatched; approved geometry,
  vote assignments, and delivery remain zero/null.
- Texas retains the official Legislative Council paired 2016 VTD election-data
  and boundary archives, CKAN metadata, exact readme, and SOS canvass context.
  The official readme defines the join as result `cntyvtd` to geometry
  `CNTYVTD`. Parsing proves 44,705 President rows, 8,941 unique one-to-one
  CNTYVTD identities across all 254 counties, 285 zero-vote units, and 8,941
  polygons with 8,976 rings. TLC candidate totals equal 8,981,860 votes:
  4,684,288 Trump, 3,877,626 Clinton, 283,462 Johnson, 71,546 Stein, and
  64,938 generic Write-In. The SOS statewide total is 8,969,226, a net
  12,634 difference driven chiefly by the generic write-in treatment. The
  8,941 exact source-ID relationships are retained, but statewide evidence
  does not prove 254 county-parent reconciliation; validation therefore stays
  blocked and delivery is null.
- Minnesota retains official Legislative Coordinating Commission boundary
  metadata/archive, official preliminary result metadata/archive and map/PDF,
  plus the SOS certified workbook. Exact `VTDID` equality holds across all
  three sources using the documented state-plus-county-plus-precinct code.
  The 4,120 election-date-confirmed features cover 87 county parents: 3,682
  Polygon and 438 MultiPolygon geometries in NAD83 UTM zone 15N. Certified
  President totals are 2,944,813 with 31 zero-vote units; the explicitly
  unofficial preliminary export totals 2,938,405, differs in 261 VTDs, and
  is 6,408 votes lower. The reviewed one-to-one geometry relationships carry
  no vote fields, but there is no approved public certified-result activation
  path, so row-level rendering stays unsafe and delivery is null.
- Independent no-edit review passed Massachusetts and Minnesota. Texas first
  failed because readme evidence normalized CRLF whitespace and claimed parent
  reconciliation from a statewide-only comparison. The package was corrected
  to preserve the exact readme text separately from its normalized paraphrase
  and to set `parentTotalsReconciled` false; independent re-review then passed.
  Preferred Luna/high review was unavailable, so bounded Terra/high fallbacks
  were used on the reusable review threads.
- The canonical registry now contains 108 blocked manifests: 51 for 2024, 51
  for 2020, and six for 2016. The 2016 ledger records six reviewed/blocked
  jurisdictions, 45 not started, and zero public-eligible layers. The 2012
  ledger remains separate and untouched.
- Wave 2 focused state/shared integration coverage passed 50/50. The fixed MCP
  precinct validator passed with audit at
  `.etl/mcp-runs/2026-08-03T06-44-47-647Z-8b103a1f/manifest.json`; independent
  Massachusetts review audit is
  `.etl/mcp-runs/2026-08-03T06-15-52-876Z-523f6fd4/manifest.json`, Minnesota
  review audit is `.etl/mcp-runs/2026-08-03T06-35-32-252Z-5d096ce3/manifest.json`,
  and corrected Texas review audit is
  `.etl/mcp-runs/2026-08-03T06-38-03-292Z-8aa7dd38/manifest.json`. The complete
  111-file precinct-geometry suite passed in 361 seconds, TypeScript checking
  passed, and scoped registry, ledger, runner, and diff invariants passed
  locally. No ETL staging artifact, database row, public delivery asset,
  production system, or Git publication changed.

### 2026-08-02 - 2016 historical acquisition wave 3

- Iowa retains the official Legislative Services Agency/Secretary of State
  precinct service, all 99 official county workbooks, and the 288-page
  canvass. The workbooks prove 1,680 unique county-qualified result identities
  and 1,089 President candidate rows. Candidate selections total 1,566,031:
  800,983 Trump, 653,669 Clinton, and 111,379 other. Adding 12,914
  undervotes and 2,426 overvotes yields the official 1,581,371 canvass total;
  all county candidate, absentee, Election Day, and combined totals reconcile.
  Adair has two metadata columns while the other 98 workbooks include
  `PoliticalPartyName`.
- Iowa candidate geometry contains 1,681 unique `SOSID_NEW` features across
  99 county parents: 1,652 Polygon and 29 MultiPolygon features, 1,771 closed
  rings, and 494,022 valid WGS84 positions. The official workbooks expose no
  field identified as `SOS_ID` or `SOSID_NEW`. Same-parent literal diagnostics
  find 65 one-candidate `SOS_ID`/`DISTRICT` comparisons and 152 one-candidate
  plus one ambiguous `NAME` comparison, but none is promoted to a relationship.
  All 1,680 result units remain reviewed-unmatched; the March 2016 service
  description does not prove November 8 continuity, so vintage remains unknown,
  normalized geometry is vote-free, and delivery is null.
- Michigan retains 4,810 official 2016-election-cycle precinct features across
  83 county parents: 4,403 Polygon and 407 MultiPolygon geometries, 6,298
  closed rings, and 639,234 valid WGS84 positions. All features record
  `ElectionYe=2016` and have unique county-qualified `VTD2016` identities. The
  official MVIC page identifies election 670 and 13 statewide President rows
  totaling 4,799,284, but only statewide election-result and turnout links were
  exposed. A separately derived precinct-download candidate was not retained
  after a Cloudflare challenge, so result units, joins, and vote assignments
  remain zero. Independent review correctly rejected `election_date_confirmed`;
  the corrected package says the election cycle is documented but November 8
  applicability is unproven, keeps vintage unknown, and has null delivery.
- Wisconsin retains official WEC results plus two independent secondary
  library archives of the LTSB-origin Spring 2016 ward layer. The 42,342,831-
  byte UWM ZIP and 19,687,970-byte UW-Madison ZIP use different packaging and
  XML, but their CPG/DBF/PRJ/SHP/SHX components are byte-identical. Embedded
  metadata identifies LTSB, a March 23, 2016 acquisition, and WGS84; secondary
  custody and Spring timing do not prove November 8 applicability. The
  normalized vote-free candidate has 6,837 features across 72 counties and
  1,914 county-municipality parents: 6,130 Polygon, 707 MultiPolygon, 9,902
  closed rings, and 2,062,610 valid positions. Three duplicate `WARD_FIPS`
  groups span seven features and remain caveated.
- The Wisconsin WEC workbook proves 3,636 President reporting units: 2,222
  single-ward, 1,414 combined-ward, and 136 zero-total units, totaling
  2,976,150 votes. No official WEC-to-LTSB crosswalk or allocation rule is
  retained, so all 3,636 rows remain unmatched/pending, combined wards are
  never disaggregated, vintage is unknown, and delivery is null. The original
  203 MB normalized GeoJSON was replaced by a deterministic 30,459,130-byte
  gzip while both source archives remain pinned.
- Independent no-edit review passed Iowa and Wisconsin. Michigan first failed
  only on the temporal overclaim, then passed after correction and re-review.
  Reviewers recomputed source hashes, independently parsed result and geometry
  metrics, challenged identity and vintage assumptions, verified offline replay,
  and ran the fixed validator. Luna/high was unavailable; reusable Terra/high
  reviewers were used, while the Iowa author remained Terra/medium.
- The canonical registry now contains 111 blocked manifests: 51 for 2024, 51
  for 2020, and nine for 2016. The 2016 ledger records nine reviewed/blocked
  jurisdictions, 42 not started, and zero public-eligible layers. The 2012
  ledger remains separate and untouched.
- The first shared integration run passed 72 of 73 tests and exposed one stale
  Wave 2 ledger-count assertion; after updating the reviewed-wave map, the
  corrected shared set passed 64/64. The fixed MCP validator passed at
  `.etl/mcp-runs/2026-08-03T08-00-55-526Z-bd81bc6e/manifest.json`. The
  complete 114-file precinct-geometry suite passed in 431 seconds, TypeScript
  checking passed, and scoped registry, ledger, runner, diff, and generated-
  text invariants passed locally. No ETL staging artifact, database row, public
  delivery asset, production system, or Git publication changed.


### 2026-08-02 - 2016 historical acquisition wave 4

- Alabama retains the byte-identical official Secretary of State 67-county
  precinct ZIP, the official election-data and election-information pages, the
  198-page certified canvass, later 2023 SOS/Legislature GIS context, and
  Census county parents used only for GEOIDs. The 67 legacy workbooks prove
  2,341 unique county-qualified reporting identities: 2,197
  `precinct_or_unclassified`, 73 absentee, and 71 provisional, with 34
  zero-named-candidate units and no duplicate parent-qualified IDs. Mobile is
  the sole workbook with four named President rows and no write-in, overvote,
  or undervote row.

- Alabama workbook candidate totals are 727,869 Clinton, 1,317,127 Trump,
  44,373 Johnson, 9,367 Stein, and 20,333 write-in, or 2,119,069 named
  candidate votes, plus 4,060 overvotes and 7,945 undervotes. Independent PDF
  parsing proves the certified candidate total is 2,123,372: 729,547 Clinton,
  1,318,255 Trump, 44,467 Johnson, 9,391 Stein, and 21,712 write-in. The
  exact by-candidate differences total 4,303 and remain unresolved rather than
  allocated. No complete election-applicable 2016 precinct geometry or stable
  official result-to-feature crosswalk is retained. The normalized geometry is
  empty; all 2,197 potentially geographic rows remain reviewed-unmatched, 144
  absentee/provisional rows remain non-geographic, and delivery is null.

- Kansas retains a byte-identical official SOS President workbook, statewide
  results PDF, results page, and election-standards context. The workbook has
  68,057 President candidate rows across 2,723 `County|Precinct|VTD`
  identities in 101 counties, including 378 zero-vote identities. Candidate
  row counts are 25 for 2,722 identities and seven for Douglas County Kawaka
  Township S19. Johnson, Sedgwick, Shawnee, and Wyandotte are absent, so the
  workbook total of 581,342 is not a statewide precinct universe and those
  counties are never inferred or filled.

- Kansas independent review rejected the first package because its hard-coded
  statewide PDF total was six votes low. The corrected collector now parses
  all 25 printed President rows in the retained 21-page official PDF, including
  seven blank-as-zero entries, and proves 1,184,402 statewide votes. The
  corrected uncovered difference is 603,060. Independent corrective re-review
  passed. No immutable November 8, 2016 precinct/VTD geometry or official
  result-to-feature crosswalk is retained; target geometry, crosswalk rows,
  vote assignments, and delivery all remain zero/null.

- Maryland retains the byte-identical official SBE all-by-precinct CSV, 2016
  archive and data-index pages, official data instructions, and bounded MDP
  archive metadata. The CSV proves 171,576 records, including 115,824
  President rows and 2,032 county/election-district/precinct identities across
  24 parents with 57 candidate rows per identity. It contains 45 nonzero
  precinct-000 identities, 45 distinct zero-vote non-000 identities, and
  1,661,651 Election Night candidate votes. Official instructions say
  pre-2020 precinct files contain Election Day votes only; early/mail-in and
  provisional votes are county-level, so this total is never described as a
  complete statewide/all-mode contest total.

- Maryland archive evidence lists 2022 rather than 2016 precinct geometry and
  is used only as a bounded availability check, not proof that no local 2016
  geometry existed. No later layer is substituted. The vote-free normalized
  layer is empty; all 2,032 identities remain reviewed-unmatched, no votes are
  assigned or reconciled, and delivery is null.

- Independent no-edit review passed Alabama and Maryland. Kansas first failed
  on the six-vote PDF discrepancy, then passed after source-derived correction
  and fresh re-review. Review audits are
  `.etl/mcp-runs/2026-08-03T08-50-37-497Z-8655b3df/manifest.json` for
  Alabama, `.etl/mcp-runs/2026-08-03T08-41-14-454Z-40b8873f/manifest.json`
  for corrected Kansas, and
  `.etl/mcp-runs/2026-08-03T08-30-06-943Z-d5ac1a9c/manifest.json` for
  Maryland. Luna/high was unavailable, so reusable Terra/high reviewers were
  used; the Alabama author used Terra/medium and the other reusable author
  threads used the available Terra/high fallback.

- The canonical registry now contains 114 blocked manifests: 51 for 2024, 51
  for 2020, and 12 for 2016. The 2016 ledger records 12 reviewed/blocked
  jurisdictions, 39 not started, and zero public-eligible layers. Package
  sizes are 14,671,757 bytes across 12 Alabama files, 2,941,228 bytes across
  10 Kansas files, and 18,128,177 bytes across nine Maryland files. The 2012
  ledger remains separate and untouched.

- Wave 4 state/shared integration passed 69/69 tests. The fixed MCP validator
  passed at `.etl/mcp-runs/2026-08-03T08-54-59-802Z-cfd3ff4f/manifest.json`.
  The complete 117-file precinct-geometry suite passed in 446.8 seconds and
  TypeScript checking passed. No ETL staging artifact, database row, public
  delivery asset, production system, or Git publication changed. 2016 Wave 5
  is active for Hawaii, Montana, and Vermont.

### 2026-08-03 - 2016 historical acquisition wave 5

- Hawaii retains 14 byte-pinned direct inputs: official Office of Elections
  precinct-detail and summary exports, the official 2016 turnout Feature
  Service item/service/layer metadata, the public Service Definition bytes,
  vote-free layer-10 geometry, layer-9 ZEROPOP subset evidence, official
  boundary and Kalawao map PDFs, Census county identifiers, the Hawaii GIS
  terms page, and an explicitly caveated Internet Archive custody copy of the
  now-404 official historical-precinct metadata PDF. The pinned source ledger
  is 8,986 bytes with SHA-256
  `c0f28088a8d191e4dfa06455e0c899a4ef6fd3a6d5f552c540405881d55972da`.
  The unavailable `precincts_2016.pdf` is not represented by cached search
  text or a guessed substitute.

- Robust parsing proves 15,148 official detail data rows, 1,240 presidential
  candidate rows, and 248 result identities: 247 numbered precincts plus one
  zero-registration, zero-ballot, zero-candidate-vote non-geographic
  placeholder. The five-candidate statewide total is 428,937. The retained LF
  downloads are exactly equivalent to the pre-existing repository CRLF copies
  after newline normalization; both byte forms and hashes remain documented.

- Hawaii layer 10 contains 260 unique vote-free polygons: all 247 active result
  IDs match exactly in both directions, while 13 additional identities are
  explicitly marked ZEROPOP. Layer 9 is exactly that 13-identity subset and is
  retained as evidence only, never appended. Structural review records 255
  Polygon and five MultiPolygon features, 268 rings, 44,271 positions, no
  unclosed/zero-area rings or proper self-intersections, and four repeated
  non-closure vertices. This is not a legal-boundary or GIS-engine gap/overlap
  claim.

- Independent review approved 247 exact one-to-one relationships and the sole
  non-geographic placeholder. All five county/county-equivalent parent totals
  and the statewide total reconcile exactly. Precinct 13-09 is assigned to
  Kalawao GEOID 15005 using the retained official 2016 boundary description
  and Office of Elections note, rather than the service's administrative Maui
  value. Hawaii remains blocked: the ArcGIS item has null `licenseInfo` and
  `accessInformation`, no immutable public delivery/import-display activation
  path was built or authorized, `rowLevelRenderingSafe` is false, and delivery
  is null.

- Montana retains the official Secretary of State precinct workbook, statewide
  canvass and named-write-in context, Montana State Library availability
  evidence, and Census county parents. It proves 3,430 presidential candidate
  rows across 686 unique county-qualified identities in all 56 counties. The
  five named-candidate total is 494,526; 2,621 statewide write-ins have no
  precinct allocation and are not assigned. No complete election-applicable
  2016 precinct geometry or official result-to-feature crosswalk is retained;
  all 686 identities remain reviewed-unmatched with `exact_official_id`
  terminology, vote-free empty geometry, and null delivery. The narrowly
  recorded State Library TLS trust failure is an access limitation, not a
  claim that historical geometry never existed.

- Vermont retains the official Election Results Archive municipality context
  and `precincts_include:1` export plus VCGI metadata. The precinct export has
  275 non-TOTAL mixed-grain identities: 47 Ward/Pct rows and 228
  municipality-only rows. Its 315,067 candidate votes reconcile exactly to the
  municipality context; the source also records 4,574 blanks, 826 spoiled
  ballots, and 320,467 total votes cast. VCGI BNDHASH 2016A is documented as a
  general-mapping town-boundary composite, not an election reporting-district
  product. No official geometry key or election-applicable split-municipality
  boundary product is retained, so all 275 identities remain
  reviewed-unmatched, vote-free, and undelivered.

- Independent no-edit review passed Vermont. Montana passed after correcting
  unmatched relationship terminology from `official_crosswalk` to
  `exact_official_id`. Hawaii passed author-stage review and a second review of
  the promotion to reviewed local evidence. Final review audits are
  `.etl/mcp-runs/2026-08-03T09-23-03-323Z-bdc698e8/manifest.json` for Vermont,
  `.etl/mcp-runs/2026-08-03T09-34-54-160Z-ae8808c6/manifest.json` for Montana,
  and `.etl/mcp-runs/2026-08-03T10-18-18-800Z-cf6d045e/manifest.json` for
  Hawaii. Luna/high was unavailable, so reusable Terra/high reviewers were
  used; state authors used the available Terra/medium or documented fallback.

- The canonical registry now contains 117 blocked manifests: 51 for 2024, 51
  for 2020, and 15 for 2016. The 2016 ledger records 15 reviewed/blocked
  jurisdictions, 36 not started, and zero public-eligible layers. Package
  sizes are 9,478,941 bytes across 20 Hawaii files, 2,594,888 bytes across 12
  Montana files, and 963,882 bytes across 10 Vermont files. The 2012 ledger
  remains separate with all 51 jurisdictions not started.

- Wave 5 state/shared checks passed after correcting the generic reviewed-wave
  count map. The fixed MCP validator passed at
  `.etl/mcp-runs/2026-08-03T10-24-35-216Z-10e7cec6/manifest.json`. The complete
  120-file precinct-geometry suite passed in 450.4 seconds and TypeScript
  checking passed. No ETL staging artifact, database row, public delivery
  asset, production system, or Git publication changed. 2016 Wave 6 is active
  for Pennsylvania, West Virginia, and Wyoming.

### 2026-08-03 - 2016 historical acquisition wave 6

- Pennsylvania retains the official Department of State bulk precinct returns
  and ReadMe plus a package-local Census county-parent artifact. Deterministic
  parsing proves 204,013 official records, 45,880 President candidate rows,
  9,176 unique county-qualified precinct identities across all 67 counties,
  6,114,296 candidate votes, and 14 zero-vote units. The four raw dependencies
  replay entirely from the election package, the source ledger is pinned at
  SHA-256 `52757df6e429f820ece9c0d7ee45c582a5ac028dcc48f905a7efa8e1d4560833`,
  and an isolated drift probe fails closed without changing the package.
  No complete election-applicable official 2016 precinct boundary edition or
  official result-to-feature crosswalk is retained. York County's 2025-created
  service is excluded. Independent review approved all 9,176 identities as
  reviewed-unmatched; normalized geometry remains empty and delivery is null.

- West Virginia retains the official Secretary of State download index and all
  55 official county CSV exports, WVGISTC catalog/archive evidence, and a
  package-local Census county-parent file. The 59 source artifacts total
  17,597,459 verified bytes. Independent parsing proves 8,820 President rows,
  1,764 county-qualified precinct identities across all 55 counties, 713,021
  named-candidate votes, 2,228 zero candidate rows, and 347 zero-vote units.
  The legacy SOS page explicitly excludes write-in candidate information, so
  the named-candidate total is not represented as a complete all-candidate
  statewide total. The retained WVGISTC archive lists exactly four later
  precinct ZIPs--one 2021, two 2024, and one 2025--and zero 2016-named ZIPs;
  none is substituted for 2016 geography. All 1,764 identities are
  reviewed-unmatched, the no-geometry sentinel is non-deliverable JSON, and
  delivery is null. The final source-ledger SHA-256 is
  `6ca5651aa2f96de2a10afadaed01ec4c4680609fd396b3973817d8264c166752`.

- Wyoming retains the official Secretary of State statewide results ZIP,
  results page, election-information page, district/precinct summary PDF, and
  a package-local Census county-parent artifact. All five sources have complete
  artifact-level authority, URL, checksum, parser, expected-count, caveat, and
  confidence metadata; the ledger is pinned at SHA-256
  `eb37201b8b3cee35e348cc0fbd6f71acd5a01a8b5cefdb312d0ecbbe2251151b`.
  The 23 county workbooks prove 482 unique county-qualified precinct identities
  with no zero-vote units. Candidate totals are 174,419 Trump, 55,973 Clinton,
  13,287 Johnson, 2,042 Castle, 709 De La Fuente, 2,515 Stein, and 6,904
  write-ins, or 255,849 candidate votes. Adding 278 overvotes and 2,661
  undervotes reconciles exactly to 258,788 ballots. The official summary's
  total is 247 election districts, 482 precincts, and 234 polling places. No
  election-applicable official polygon edition or feature crosswalk is
  retained, so all 482 identities remain reviewed-unmatched and delivery null.

- Independent no-edit review initially rejected all three packages and forced
  substantive reproducibility or metadata corrections: Pennsylvania's disabled
  ledger guard and mutable-input replay, West Virginia's incomplete evidence
  contract and later-archive count, and Wyoming's incomplete artifact metadata
  and external county-parent dependency. The corrected packages then passed
  fresh independent re-review. Final state review validator audits include
  `.etl/mcp-runs/2026-08-03T11-09-44-240Z-24aed029/manifest.json` for the
  Pennsylvania/Wyoming review window and
  `.etl/mcp-runs/2026-08-03T11-16-04-957Z-08ebd957/manifest.json` for West
  Virginia. Luna/high was unavailable, so bounded Terra/high reviewers were
  used; state authors used Terra/medium.

- The canonical registry now contains 120 blocked manifests: 51 for 2024, 51
  for 2020, and 18 for 2016. The 2016 ledger records 18 reviewed/blocked
  jurisdictions, 33 not started, and zero public-eligible layers. Package sizes
  are 43,555,152 bytes across 10 Pennsylvania files, 18,877,955 bytes across 65
  West Virginia files, and 15,753,678 bytes across 11 Wyoming files. The 2012
  ledger remains separate with all 51 jurisdictions not started.

- Wave 6 focused state/shared integration passed 71/71 tests. The complete
  123-file precinct-geometry suite passed in 468.1 seconds, TypeScript checking
  passed, and the registry/provenance/coverage validator reported zero errors.
  The final fixed MCP precinct validator passed at
  `.etl/mcp-runs/2026-08-03T11-29-31-283Z-a0019df6/manifest.json`. No ETL
  staging artifact, database row, public delivery asset, production system, or
  Git publication changed. 2016 Wave 7 is active for the District of Columbia,
  Georgia, and Oklahoma.

### 2026-08-03 - 2016 historical acquisition wave 7

- The District of Columbia package retains the certified DCBOE result CSV,
  the official Data.gov catalog, its live sublayer 27 GeoJSON/metadata/item
  information, and the January 2020 DCBOE minutes. Independent parsing proves
  8,724 certified rows, 1,001 President rows, 143 precinct identities, 282,830
  Clinton votes, 12,723 Trump votes, 15,715 other candidate votes, 243
  overvotes, and 1,064 undervotes. Data.gov labels item
  `44cdf2570d8545dd9c9868e2a2f570c8` as Voting Precinct 2012, but the same
  official distribution now resolves to live `Voting Precinct - 2019`
  sublayer 27 with 144 features and no historic-moment support. The later
  minutes document establishment of Precinct 144 on December 3, 2019; they do
  not prove complete 2016 continuity. The live layer is excluded, all 143
  result identities remain reviewed-unmatched, geometry is empty, and delivery
  is null. The six-artifact ledger is pinned at SHA-256
  `b028df64159a49fb47611a6d528ef405cd63d95211db37fd436afc927cd642f4`.

- Georgia retains the official SOS 2016 export and current Fulton County layer
  metadata as bounded discovery context. The export has 159 county President
  contexts and 477 candidate rows but exactly zero `precinctResults` records;
  it therefore does not establish a precinct result universe. Its statewide
  totals are 2,089,104 Trump, 1,877,963 Clinton, and 125,306 Johnson, and the
  same candidate totals independently sum across all county contexts. The
  current single-county Fulton layer is not treated as statewide or
  election-applicable 2016 geometry. The package has zero result crosswalk
  rows, zero normalized features, and null delivery. Its ledger is pinned at
  SHA-256 `f061d3c6daa0a68c9e4d348eef8e924dd81edc143efac64178edd7fab738b394`.

- Oklahoma retains 13 official or official-cooperation source artifacts,
  including the SBE PLCSV and CLCSV exports, Census county parents, and bounded
  OU CSA/SBE GIS availability evidence. The PLCSV has 86,471 all-contest rows,
  5,874 President rows, and 1,958 result units: 1,956 geographic units plus the
  two countywide non-geographic `559999` and `729999` units. Eighteen geographic
  identities have zero President votes. Candidate totals are 949,136 Trump,
  83,481 Johnson, and 420,375 Clinton, or 1,452,992 votes. Every two-digit CEB
  prefix maps uniquely to one of all 77 official CLCSV county vectors under the
  exact same-election three-candidate totals, and the county and statewide
  deltas are zero; Census supplies only the resulting parent GEOIDs. The
  current cooperation layer is explicitly last updated June 7, 2022 and has no
  historic-moment support, so it is not backcast. All 1,956 geographic units
  are reviewed-unmatched, two units remain non-geographic, normalized geometry
  is empty, and delivery is null. The ledger is pinned at SHA-256
  `7bbf777104a202636a4165b87b3ac6b303b4314c399b17c98515c341be375b43`.

- Independent no-edit review forced substantive reproducibility and provenance
  corrections before integration. Georgia initially wrote its ledger before
  checking the pin. DC initially mixed sublayers 27 and 45, misstated the live
  feature count and source years, claimed mapped totals with no relationships,
  and used an inadequate shared-package tamper proof; a later review also
  caught that the first corrected test could repair residue before inspecting
  it. Both packages now verify ledger bytes before derived writes and prove
  exact immediate no-residue rejection in isolated packages. Oklahoma passed
  its independent review; its sequential byte-identical derived-file rewrite
  is recorded as a non-blocking local concurrency caveat. Luna/high was not
  available, so bounded Terra/high reviewers were used. Final review audits are
  `.etl/mcp-runs/2026-08-03T11-47-51-810Z-2a712818/manifest.json` for Georgia,
  `.etl/mcp-runs/2026-08-03T12-02-44-913Z-863b851a/manifest.json` for DC, and
  `.etl/mcp-runs/2026-08-03T12-01-27-249Z-2970347b/manifest.json` for Oklahoma.

- The canonical registry now contains 123 blocked manifests: 51 for 2024, 51
  for 2020, and 21 for 2016. The 2016 ledger records 21 reviewed/blocked
  jurisdictions, 30 not started, and zero public-eligible layers. Package sizes
  are 4,525,022 bytes across 12 DC files, 2,415,178 bytes across 8 Georgia
  files, and 10,807,243 bytes across 19 Oklahoma files. The 2012 ledger remains
  separate with all 51 jurisdictions not started.

- Wave 7 focused state/shared integration passed 87/87 tests after the generic
  reviewed-wave map was updated. The complete 126-file precinct-geometry suite
  passed in 471 seconds, TypeScript checking passed, and the canonical
  registry/provenance/coverage validator reported zero errors. The final fixed
  MCP precinct validator passed at
  `.etl/mcp-runs/2026-08-03T12-18-37-616Z-e356f33e/manifest.json`. No ETL
  staging artifact, database row, public delivery asset, production system, or
  Git publication changed. 2016 Wave 8 is active for Illinois, Louisiana, and
  Tennessee.

### 2026-08-03 - 2016 historical acquisition wave 8

- Illinois retains the official State Board of Elections President by-office
  CSV, the official GE2016 county workbook, and a bounded official geometry
  source review. Independent parsing proves 36,470 CSV rows, 9,003
  jurisdiction-qualified precinct-name contexts across 109 election
  authorities, 52 source-context zero-vote identities, and 4,324,101 votes.
  Candidate totals are 1,672,726 Trump, 2,392,211 Clinton, 156,697 Johnson,
  57,769 Stein, and 44,698 write-ins preserved under four case-distinct source
  labels. The county workbook has 2,923 President rows across all 102 counties
  and 5,536,424 votes, leaving a deliberately unreconciled 1,212,323-vote
  source-completeness difference. Without an authority-qualified geometry key
  or complete election-applicable boundary edition, both sources remain
  context only: the precinct target universe, crosswalk, and normalized
  features are empty, and delivery is null. The nine-file, 5,750,730-byte
  package ledger is pinned at SHA-256
  6852285ac8510a9a95e50fbabae780832bb5b761a2350f00bca33c72e5ebfb24.

- Louisiana retains the official SOS 2016 President ByParish CSV and a
  package-local Census parish-parent artifact. The 64 parish rows independently
  total 780,154 Clinton, 1,178,638 Trump, 70,240 other, and 2,029,032 votes.
  Parish totals are county-equivalent context and are never converted,
  disaggregated, or allocated to precincts. No official election-applicable
  precinct geometry or result-to-feature crosswalk is retained, so target
  result units and relationships are zero, the sentinel is vote-free, and
  delivery is null. The eight-file, 7,846,147-byte package ledger is pinned at
  SHA-256 bf5e5b7c98ea12c5f0286abea0da785ddb7a3d7e262b521c11f5b2a9ad493c17.

- Tennessee retains the official SOS 2016 President-by-county PDF, current
  Comptroller service availability evidence, and package-local Census county
  parents. Independent parsing proves 95 county rows and 870,695 Clinton,
  1,522,925 Trump, 114,407 other, and 2,508,027 total votes. The current
  3,231-feature service is truthfully labeled current, lacks historic-moment
  support, and is not backcast to 2016. County totals are context only and are
  never disaggregated. The target universe is explicitly unavailable, geometry
  and crosswalk relationships are zero, and delivery is null. The ten-file,
  10,335,966-byte package ledger is pinned at SHA-256
  8b139fc7840c93d1efae1594663dbe9a74e639f94811296af515aa689fecbeef.

- Independent no-edit review initially rejected each package and forced
  cross-state contract corrections: canonical source metadata, package-local
  replay dependencies, true pre-write ledger guards, complete no-residue
  drift tests, explicit context-versus-target metrics, and portable handling
  of Illinois case-distinct write-in labels. Corrected packages passed fresh
  Terra/high review because Luna/high was unavailable. Final state review
  audits are .etl/mcp-runs/2026-08-03T12-46-19-790Z-2b6ddc09/manifest.json
  for Illinois, .etl/mcp-runs/2026-08-03T12-43-59-670Z-6b0452ce/manifest.json
  for Louisiana, and
  .etl/mcp-runs/2026-08-03T12-43-29-923Z-d2f6e737/manifest.json for Tennessee.

- The canonical registry now contains 126 blocked manifests: 51 for 2024, 51
  for 2020, and 24 for 2016. The 2016 ledger records 24 reviewed/blocked
  jurisdictions, 27 not started, and zero public-eligible layers. The 2012
  ledger remains separate with all 51 jurisdictions not started.

- Wave 8 focused state/shared integration passed 55/55 tests. The stable
  complete 129-file precinct-geometry suite passed in 517.4 seconds,
  TypeScript checking passed, and the registry/provenance/coverage validator
  reported zero errors. The final fixed MCP precinct validator passed at
  .etl/mcp-runs/2026-08-03T13-06-46-934Z-c823f6c8/manifest.json. No ETL
  staging artifact, database row, public delivery asset, production system,
  or Git publication changed. 2016 Wave 9 is active for New Mexico, Ohio, and
  South Carolina.

### 2026-08-03 - 2016 historical acquisition wave 9

- New Mexico retains the official SOS 2016 President precinct API response,
  official SOS/RGIS availability evidence, and package-local Census county
  parents. Independent parsing proves 11,936 candidate rows, 1,492 unique
  county-qualified precinct identities across all 33 counties, eight candidate
  rows per identity, 6,211 masked cells, and 792,620 published numeric votes.
  Every identity contains at least one masked value and zero identities have
  all eight published candidate values equal to zero. No masked value is
  imputed and no mapped-total reconciliation is attempted. All 1,492 exact
  source identities are retained as vote-free reviewed-unmatched relationships;
  normalized geometry remains empty and delivery is null. The ten-file,
  8,450,945-byte package ledger is pinned at SHA-256
  ac143c938d944d6018c4ca87295cfb98d147768d8c86391d0cee552e68f0f763.

- Ohio retains two exact official SOS response captures documenting this
  review environment's source-access state. Both are HTTP 403 maintenance
  responses whose final URL equals the requested URL; neither contains a
  Results by Precinct listing or XLSX. A search snippet is retained only as an
  unverified discovery lead, listingConfirmed is false, and the package makes
  no claim that the workbook is globally unavailable or that any result total
  was recovered. With no authoritative local result universe or
  election-applicable geometry retained, target and crosswalk counts are zero,
  the sentinel is vote-free, and delivery is null. The recovery/request path
  through the SOS, county boards, and state GIS offices is explicit. The
  eight-file, 2,590,650-byte package ledger is pinned at SHA-256
  73c281536ac855d2cd81a7fa0f9f3cad381ff2f0d3fc9200109b3e9136e4b5df.

- South Carolina retains the official Election Commission President CSV,
  package-local Census county parents, and a June 2022 official-origin RFA
  archive only as later geometry context. Independent parsing proves 2,551
  county-scoped result identities across all 46 counties, 2,103,027 candidate
  votes, 20,602 over/under votes, and 2,123,629 ballots. The source explicitly
  distinguishes 2,301 ordinary precinct contexts, including 48 zero-vote
  contexts, from 250 absentee, failsafe, or provisional administrative rows.
  The ordinary identities remain reviewed-unmatched and the administrative
  rows remain non-geographic. The 2022 archive is not backcast to 2016; no
  votes are assigned, geometry is empty, and delivery is null. The nine-file,
  13,845,824-byte package ledger is pinned at SHA-256
  62213cb2147a5a7220a17949b7b1d89c35e5dda63977baa8fc74c9ec3d71b50e.

- Independent no-edit review rejected all three first drafts and forced
  substantive corrections. New Mexico initially discarded authoritative local
  identities and misstated masked/zero metrics. Ohio initially claimed a
  redirect and confirmed listing that its retained 403 bodies did not prove.
  South Carolina initially lacked a checked-in direct raw-input tamper test.
  Corrected packages preserve local identities consistently, distinguish
  retained evidence from discovery leads, verify real source bytes and
  semantic ledger pins before derived writes, and prove immediate no-residue
  rejection. Terra/high reviewers were used because Luna/high was unavailable.
  Final review audits are
  .etl/mcp-runs/2026-08-03T13-19-42-785Z-777b9f8d/manifest.json for New Mexico,
  .etl/mcp-runs/2026-08-03T13-11-55-042Z-dae9ac3b/manifest.json for Ohio, and
  .etl/mcp-runs/2026-08-03T13-14-30-409Z-1f486387/manifest.json for South
  Carolina.

- The canonical registry now contains 129 blocked manifests: 51 for 2024, 51
  for 2020, and 27 for 2016. The 2016 ledger records 27 reviewed/blocked
  jurisdictions, 24 not started, and zero public-eligible layers. The 2012
  ledger remains separate with all 51 jurisdictions not started.

- Wave 9 focused state/shared integration passed 55/55 tests. The stable
  complete 132-file precinct-geometry suite passed in 486.2 seconds,
  TypeScript checking passed, and the registry/provenance/coverage validator
  reported zero errors. The final fixed MCP precinct validator passed at
  .etl/mcp-runs/2026-08-03T13-34-18-417Z-e822cfc7/manifest.json. No ETL
  staging artifact, database row, public delivery asset, production system,
  or Git publication changed. 2016 Wave 10 is active for Delaware, Nevada, and
  Virginia.

### 2026-08-03 - reboot checkpoint during 2016 historical wave 10

- Work is intentionally paused for a user-requested system reboot. All Wave 10
  workers were interrupted cleanly. Do not refresh the canonical registry or
  2016 coverage ledger from the Wave 10 drafts until each state package passes
  fresh independent no-edit review.

- The last accepted checkpoint remains 129 blocked manifests: 51 for 2024, 51
  for 2020, and 27 for 2016. The accepted 2016 ledger has 27 reviewed/blocked
  jurisdictions and 24 not started. Wave 9 passed its 55 focused tests, stable
  132-file suite, TypeScript check, repository validator, and fixed MCP audit
  at .etl/mcp-runs/2026-08-03T13-34-18-417Z-e822cfc7/manifest.json.

- Delaware Wave 10 is an early unreviewed acquisition draft: its election
  package directory currently contains three files totaling 784,852 bytes and
  has no collector or focused test yet. Nevada has an unreviewed nine-file
  draft totaling 8,626,694 bytes, with collector/test present and a current
  ledger hash of
  7fee11aa08dea9710104f1011841cc095d93a2432feeebe0a3e5bf8885000a6b.
  Neither draft has been independently reviewed or accepted.

- Virginia has an unreviewed eight-file draft totaling 2,462,285 bytes, with
  collector/test present and ledger hash
  b63fc5ec0c787fa52ef429f6da53e1c2e1ae780b989935446cb3d8336f9b0d06.
  Its official contest source currently proves 133 localities, 2,881 precinct
  rows, 2,590 geographic contexts, 291 absentee/provisional administrative
  rows, 135 geographic zero-vote contexts, and a documented 11-vote difference
  between the statewide total and locality roll-up. This draft is known invalid
  until package-local official Census county-equivalent parents are retained
  and all 133 locality parents resolve uniquely to canonical 51xxx GEOIDs.
  The 2,590 geographic identities must remain reviewed-unmatched and the 291
  administrative identities non-geographic; no geometry or votes may be
  assigned.

- After reboot, run crm_doctor once, reread this checkpoint, inspect the three
  draft directories for partial-write residue, then resume the bounded DE/NV/VA
  workers. Require package-local replay, canonical metadata, pre-write ledger
  pins, direct raw plus semantic no-residue tests, fixed MCP/advisory checks,
  and fresh independent review before shared Wave 10 integration. No staging,
  database, public delivery, production, or Git action is authorized.

### 2026-08-03 - 2016 historical acquisition wave 10

- Delaware retains three official source-evidence artifacts totaling 784,852
  bytes. The official election package proves 432 election-district identities
  and 441,590 presidential votes as source context, but it supplies no stable
  geographic join key, reviewed administrative classification, or
  election-applicable polygon edition. Target result identities, geometry,
  crosswalk rows, assigned votes, and delivery therefore remain empty. The
  package-local ledger is pinned at
  `6b44ece5c8ba86b39724d7b963ecf84500aafc89b640338afe92a838c36b3758`.

- Nevada retains the official 8,605,504-byte Legislative Counsel Bureau visual
  map and official Census county-parent context. The map depicts 2016 results
  but says it uses later boundary sources and provides neither exact local vote
  rows nor stable source feature IDs. It is not digitized, backcast, OCR-assigned,
  or treated as election-date geometry. All 17 county equivalents remain explicit
  source-coverage gaps; target results, geometry, crosswalk rows, assigned votes,
  and delivery remain empty. The ledger is pinned at
  `7fee11aa08dea9710104f1011841cc095d93a2432feeebe0a3e5bf8885000a6b`.

- Virginia retains the official election-statistics CSV and a package-local
  official Census county-equivalent parent artifact. Exact case-normalized
  Census `NAME` matching resolves all 133 official localities to 133 distinct
  canonical `51xxx` GEOIDs. The crosswalk preserves 2,881 result identities:
  2,590 geographic reviewed-unmatched rows, including 135 zero-vote rows, and
  291 explicit non-geographic administrative rows. The official statewide
  3,984,631-vote total is 11 above the 3,984,620 locality roll-up; no value is
  allocated to geometry. Geometry, matches, assigned votes, and delivery remain
  empty/null. The ledger is pinned at
  `a3e512db5d9f0a1ef3b29a486eb1573510cd4129ac1e2deac95e3ca771ed21cb`.

- Initial independent review rejected Delaware's incomplete collector, Nevada's
  missing standard-suite registration, and Virginia's ambiguous parent-name
  mapping. Those defects were corrected, each package replayed byte-identically,
  direct raw and semantic drift tests failed closed without residue, and fresh
  independent no-edit reviews accepted all three blocked packages.

- The canonical registry now contains 132 blocked manifests: 51 for 2024, 51
  for 2020, and 30 for 2016. The 2016 ledger records 30 reviewed/blocked
  jurisdictions, 21 not started, and zero public-eligible layers. The 2012
  ledger remains separate with all 51 jurisdictions not started.

- Wave 10 focused integration passed 56/56 tests. A condensed exact-file replay
  passed all 135 standard precinct test files, and the canonical
  `npm run test:precinct-geometry` rerun passed in 412.2 seconds. TypeScript
  checking passed. The fixed MCP precinct validator passed at
  `.etl/mcp-runs/2026-08-03T20-56-06-054Z-3d8d849a/manifest.json`. An earlier
  wrapper invocation exited nonzero without a reproducible failing assertion;
  both the diagnostic replay and canonical rerun were clean.

- The 2016 advisory report found zero review rows, calculated indicator rows,
  flagged jurisdictions, or flagged areas for Delaware, Nevada, and Virginia,
  with `no_historical_review_rows` as the explicit reason. These advisory
  indicators are review signals only and are not evidence of misconduct. No ETL
  staging artifact, database row, public delivery asset, production system, or
  Git publication changed.

### 2026-08-03 - 2016 historical acquisition wave 11 start

- Arizona, Colorado, and Florida are the bounded three-state wave. Each already
  has an official historical result path, while their boundary-source patterns
  exercise county-hosted, state historical-portal, and statewide-result/local-GIS
  acquisition paths. State workers are isolated to state package, collector, and
  focused-test files; shared registry, coverage-ledger, runner, plan, integration,
  and final review remain coordinator-owned.

- The accepted starting checkpoint is 132 blocked manifests: 51 for 2024, 51
  for 2020, and 30 for 2016. The 2016 ledger has 30 reviewed/blocked, 21 not
  started, and zero public-eligible jurisdictions. Wave 11 drafts must not enter
  the shared registry or ledger before fresh independent no-edit review. No
  production promotion, database mutation, public delivery, or Git publication
  is authorized.

### 2026-08-03 - 2016 historical acquisition wave 11

- Arizona retains the 9,624,192-byte official signed statewide canvass
  (SHA-256 `a765b3d03bcbdcaba4e3e869bd24cbb6dc2288841d7848eaa18b46e099ccaada`)
  and a fixed 1,405-byte source ledger (SHA-256
  `752444dd308f246af0349626071a5d50cff79897f099ec52de9c869fa6a0187a`).
  The canvass supplies 15 county context rows, not a machine-normalized
  precinct universe. The official directory lists 15 county TXT files and
  one workbook, but attempted scripted retrieval returned a Cloudflare
  challenge, so their exact bytes are not retained. This is an access and
  retention limitation, not a claim that 2016 geometry never existed.

- Colorado retains the official 21,114,250-byte Marketplace CSV (SHA-256
  `9c83808a012f847bb79bb5b4f5f5ff05b7e95de53d6738a42226c4a60ed7bd15`)
  under a fixed 1,638-byte ledger (SHA-256
  `373d870023fea1cc2ef9184d644707f19ec29174684ea2323bb3bd31791044bd`).
  It establishes 84,284 presidential candidate rows, 3,011 county-qualified
  precinct contexts across all 64 counties, 21 zero-vote contexts, and
  2,780,247 candidate votes. No election-applicable polygon edition, stable
  feature relation, or official result-to-feature crosswalk is retained.

- Florida retains the 31,144-byte official catalog HTML (SHA-256
  `e760428e1f4e75cb27dc8ec4b0140b87e98a75dbedf72dbaf9e0aa2b9fd083d4`)
  and 4,952,971-byte official results ZIP (SHA-256
  `0d9b6ee46f9c5b4399b8909a3df91d8cc270c0b8daaf0589e515c69160d35657`)
  under the fixed ledger SHA-256
  `4e123f860b205aca0ad636b231b11e3d9aae4a158f33f403e35c46a7b1387395`.
  The archive has 68 files, 627,023 source rows, 50,617 President rows,
  5,811 county-qualified context identities across 66 President counties,
  and 33 zero-vote contexts. Seminole's standard county file exists but has
  no President rows. The statutory historical precinct/block database and
  PctMap material remain access leads, not retained 2016 geometry.

- Every package remains deliberately vote-free at the target layer: zero
  target result units, normalized geometry features, crosswalk rows, mapped
  votes, or delivery artifacts. All three manifests are blocked with
  `delivery: null`. Initial Arizona and Florida reviews rejected missing
  provenance/replay gates, and Colorado review rejected a pre-validation raw
  write. Remediation added fixed ledgers, complete pre-write validation,
  byte-identical offline replay, injected online/missing-source checks where
  applicable, raw/ledger/semantic drift rejection, and no-residue tests.
  Fresh independent no-edit reviews then accepted all three packages.

- The canonical registry now contains 135 blocked manifests: 51 for 2024,
  51 for 2020, and 33 for 2016. The 2016 ledger records 33 reviewed/blocked,
  18 undecided at the Wave 11 close, and zero public-eligible jurisdictions.
  Focused Wave 11 state/shared integration passed 60/60 tests; the complete
  138-file precinct suite passed in 437.5 seconds; `npm run typecheck`
  passed. The fixed MCP validator passed with no MCP warnings at
  `.etl/mcp-runs/2026-08-03T21-51-19-773Z-1ca6e458/manifest.json`.

- The required 2016 advisory-path report found 15 Arizona review rows, 10
  calculated advisory rows, 10 flagged county jurisdictions/areas, and only
  `county_down_ballot_distribution` under
  `presidentVsUSSenateCounty`. Its broad-signal warning and caveat require
  candidate/contest and split-ticket context. Colorado and Florida each had
  zero review and indicator rows with `no_historical_review_rows` as the
  explicit reason. These are screening signals only, never evidence of fraud
  or misconduct. No staging artifact, database row, production system,
  public delivery asset, or Git publication was changed.

### 2026-08-03 - 2016 historical acquisition wave 12 start

- Arkansas, Idaho, and Utah are the next bounded three-state wave. Official
  preflight found a state results/current-AGIO service pattern in Arkansas,
  an official archived-results/current-map-record pattern in Idaho, and an
  official 2016 results plus versioned UGRC VISTA pattern in Utah. Current
  services, legal duties, and non-2016 archives are access leads only until
  election-date applicability and exact result-to-feature identity are
  proven; no later geometry will be backcast.

- The 2016 ledger now marks Arkansas, Idaho, and Utah in progress in Wave 12:
  33 jurisdictions remain reviewed/blocked, three are active, 15 are not
  started, and zero are public eligible. State work stays isolated to each
  package, collector, and focused test; shared registry, ledger, runner,
  integration, final review, and all production decisions remain
  coordinator-owned.

### 2026-08-03 - 2016 historical acquisition wave 12 close

- Arkansas retains four official/context sources (462,225 raw bytes): exact
  official TotalResults election metadata and President federal-result JSON,
  current Arkansas GIS Office layer metadata, and the October 7, 2016 Lee
  County precinct-update notice. Election 1836 / contest 467 contains 75
  county result identities, 600 candidate rows, and 1,130,676 votes, all
  excluded from precinct targets. The current 2026 service is mutable,
  non-versioned, lacks historic-moment support, and cannot establish the
  November 8, 2016 feature edition or an official result-to-feature
  crosswalk. The 6,617-byte source ledger is pinned at SHA-256
  `55f518685e29b96bf913feead61fb15fbc0b3b50b151e91cc40d1ada78e33b43`;
  evidence is pinned at
  `e178fedcd5d0bc6c1c27181130224108cbe9bfb1f9913310256ba0f235d8e277`.

- Idaho retains 95,663 official raw-source bytes. Its President HTML contains
  44 county rows and a 690,255-vote statewide total; its separate 1,398-row
  precinct-nested workbook contains legislative contests, 546 contextual
  precinct-like rows, and no President contest. Neither source supplies an
  election-applicable geometry edition or an official President
  result-to-feature crosswalk. The 2,588-byte ledger is pinned at SHA-256
  `b7681272ca945ecd70e831826cbf68305592bfc0312e97877ecaa6c77ed6c8bf`;
  evidence is pinned at
  `202ce4d165bf3a983bb9edd34fa3e58fdcd35285fe0f33d3699e566693f73fcc`.

- Utah retains five official artifacts totaling 1,092,323 raw bytes: the
  election-record page, official canvass PDF and XLSX, and current UGRC VISTA
  page/service metadata. The workbook has 13 sheets and its President sheet
  has 29 county result identities, retained as context only. Current VISTA
  evidence is explicitly source-vintage 2026, while the package election year
  remains 2016; the public 2011 archive and current service are not backcast.
  The 5,822-byte ledger is pinned at SHA-256
  `c09f29301e1cf603dea59b686d23dbf96ac2948f5ae885d5246555c5663e7e15`;
  evidence is pinned at
  `5227915fc22af3e47f5ae23618b814fc4fca5becd4d1524b3992e009dea7026c`.

- All three packages remain deliberately fail-closed: zero normalized
  features, target result units, crosswalk rows, mapped votes, or delivery
  artifacts; every manifest is blocked with `delivery: null`. Independent
  reviews rejected incomplete per-artifact provenance, a mislabelled current
  GIS source year, ignored package-root replay, hash-only rather than parsed
  semantic checks, and partial error matching. Remediation added complete
  persisted provenance, source-vintage separation, real isolated package-root
  replay, post-pin parsed semantic mutations, exact rejection assertions,
  byte-identical restoration, and no-residue checks. Fresh independent
  no-edit reviews accepted Arkansas, Idaho, and Utah.

- The canonical registry now contains 138 blocked manifests: 51 for 2024,
  51 for 2020, and 36 for 2016. The 2016 ledger records 36 reviewed/blocked,
  15 not started, and zero public-eligible jurisdictions. Wave 12 state tests
  passed 4/4; focused state/shared integration passed 77/77 in 42.1 seconds;
  the complete 141-file precinct suite passed in 445.9 seconds; and
  `npm run typecheck` passed. The fixed MCP precinct validator passed with
  no MCP warnings at
  `.etl/mcp-runs/2026-08-03T22-30-33-933Z-a648df23/manifest.json`.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for Arkansas,
  Idaho, and Utah, with `no_historical_review_rows` as the explicit reason
  for each state. No indicator types were produced. Advisory indicators are
  screening signals only, never evidence of fraud or misconduct. Production
  API/DB counts were not checked, and no staging artifact, database row,
  public delivery asset, or Git publication was changed.

### 2026-08-03 - 2016 historical acquisition wave 13 close

- Alaska retains ten hash-pinned source artifacts (19,707,280 bytes) under
  ledger SHA-256
  `e3209fd58acecc756c8f88e2a69c9ad706151c2fb995a22e543acf80d39b210e`.
  The core live official 2013 statewide precinct ZIP is 10,660,812 bytes
  (SHA-256
  `ad14aa1515d3b2922397c42fd20526d44e433d511e4dfcdceac489bff6a1260e`).
  Its 441 DBF/SHP records are exact-ID set-equal to the 441 numbered
  geographic identities in the official 2016 result export. The vote-free
  candidate has 421 Polygon and 20 MultiPolygon features, 428 normalized
  display-name agreements, and 13 documented name deltas; names never create
  a relationship. All 121 absentee, questioned, early-voting, and
  federal-overseas rows remain pending non-geographic units. The official 442
  report-precinct figure is preserved as 441 numbered precincts plus one
  HD99 federal-overseas reporting contribution. No county-equivalent tags are
  assigned, the current November 2022 service contributes zero features,
  reuse terms remain unresolved, and delivery is null.

- California retains 71 hash-pinned official artifacts (118,329,664 source
  bytes) under ledger SHA-256
  `19a0aaaa49652e3eda435839e7b8b6eb40e06db2240e17239f211ce4bb13774a`,
  including 58 separately pinned county RG/RR/SR/SV conversion tables because
  the advertised statewide ZIP returned HTTP 404 over both HTTP and HTTPS.
  The vote-free SRPREC candidate contains 21,757 features (17,529 Polygon,
  4,228 MultiPolygon; 4,078,569 positions). The 23,785 SR result keys and
  21,757 geometry keys intersect at 21,501; 2,284 result rows are
  geometry-unmatched and 256 polygons are result-unmatched. Of those 2,284
  result-only rows, 369 carry 24,540 votes across the five named SWDB
  President fields; no fallback assignment is made. The MPREC conversion has
  66,477 rows and all 21,757 SR keys, while the matched subset has 9,339
  one-feature and 12,162 one-to-many mappings (maximum fan-out 83). Exact SR
  candidates remain pending because the result edition is dated 2021 and the
  geometry/conversion edition 2019. The five SWDB candidate fields are 25
  votes below the same five SOS certified totals, omit 120,739 certified
  candidate-specific write-in votes, and SWDB TOTVOTE is nine above the SOS
  participation total. The Lassen erratum concerns voter-history assignment,
  not a candidate or boundary correction. Per-row geometry and crosswalk
  objects are election-value-free, redistribution terms remain unresolved,
  and delivery is null.

- Connecticut retains 12 hash-pinned official artifacts (11,275,122 bytes)
  under ledger SHA-256
  `a47a5db3051c354e2428e7fb0d135c6435fd52d36d3039c7676a8c5b67ce259e`.
  The CGA CSV proves 3,686 President rows, 743 exact Town-plus-VTD identities
  across all 169 towns, and 1,644,920 votes: 897,572 Clinton, 673,215 Trump,
  and 74,133 other. All 743 full labels agree with active official EMS
  district records; the one additional Clinton EMS context record remains
  explicitly unresolved. The retained 2010 Census candidate has 774 features
  and only 512 apparent matches; the post-election 2020 Census candidate has
  766 and 716. Both are rejected as substitutes for an official November 8,
  2016 local-boundary edition. Admitted geometry, target rows, crosswalk rows,
  assigned votes, and delivery all remain zero.

- Fresh independent no-edit reviews accepted Alaska, California, and
  Connecticut in their blocked states. The final California test additionally
  locks every per-row crosswalk key so election-value fields cannot be added
  silently. Offline replay, retained-source hashes, fixed ledgers, parsed
  semantic mutations, package-root isolation, exact failure messages,
  all-or-nothing acquisition where applicable, and no-residue behavior pass.

- The canonical registry now contains 141 blocked manifests: 51 for 2024, 51
  for 2020, and 39 for 2016. The 2016 ledger records 39 reviewed/blocked, 12
  not started, zero in progress, and zero public-eligible jurisdictions.
  Focused historical-inventory coverage passes 33/33; the complete 144-file
  precinct suite passes in 558.3 seconds; and `npm run typecheck` passes.
  The fixed MCP precinct validator passed without MCP warnings at
  `.etl/mcp-runs/2026-08-03T23-35-41-258Z-b6bef3ad/manifest.json`.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for Alaska,
  California, and Connecticut. Each reports `no_historical_review_rows`; no
  indicator types were produced. Advisory indicators are screening signals
  only, never evidence of fraud or misconduct. Production API/DB counts were
  not checked, and no staging artifact, database row, public delivery asset,
  or Git publication changed.

### 2026-08-03 - 2016 historical acquisition wave 14 start

- Indiana, Kentucky, and Maine are the next bounded three-state wave. The
  2016 ledger marks all three in progress in Wave 14: 39 jurisdictions remain
  reviewed/blocked, three are active, nine are not started, and zero are
  public eligible. State workers remain confined to their package, collector,
  and focused test; shared registry, inventory, runner, integration, final
  review, and production decisions remain coordinator-owned.

- Indiana's official final ENR archive reports 5,382 of 5,382 precincts, but
  its retained presidential category data contains only 92 county regions and
  does not reconcile to later official/FEC statewide totals. No statewide
  2016 precinct geometry edition was found. Marion County is a bounded
  exception: its official certified historic-results service exposes 600
  unique 2016 presidential precincts, 2,400 candidate-feature rows, and one
  polygon per precinct. Wave work may retain a Marion-only vote-free exact-ID
  candidate under county GEOID 18097, while statewide coverage, write-in
  reconciliation, reuse terms, and delivery remain explicitly blocked.

- Kentucky's official 2016 page links a certified statewide county-results
  PDF and a separate document labelled By Precinct that is actually voter
  registration statistics, not candidate results. State-hosted county recap
  sheets are explicitly labelled unofficial and may be retained only with
  that caveat; they cannot silently replace certified totals. The current
  Commonwealth VTD service lacks a retained 2016 edition and is exclusion
  evidence only. Wave work will test all county recap links for machine
  readability and preserve the statewide PDF, registration report, geometry
  access path, and any complete result context without backcasting polygons.

- Maine's official 2016 President workbook is machine-readable and already
  retained, but the current importer aggregates it to 16 county rows plus
  State UOCAVA. Wave work will parse the workbook's underlying municipality,
  ward, or precinct labels directly, preserve UOCAVA as non-geographic, and
  establish exact target counts before deciding whether unmatched result rows
  are warranted. Current municipal geometry and registration-layout fields
  do not prove an election-applicable 2016 local boundary or crosswalk. No
  PDF/image conversion is presently indicated.

### 2026-08-03 - 2016 historical acquisition wave 14 close

- Indiana, Kentucky, and Maine are reviewed and remain blocked. The 2016
  inventory now records 42 reviewed/blocked jurisdictions, nine not started,
  zero in progress, and zero public eligible. No Wave 14 package has a public
  delivery artifact.

- Indiana retains 27 hash-pinned official artifacts totaling 20,090,559 bytes
  under the 36,702-byte ledger SHA-256
  `8aa7cb69368e4edf3dcac7607b3233df2d82daf7dc02d4439db9de8e3c19636f`.
  State ENR context proves 5,382 of 5,382 precincts and 2,728,138 presidential
  candidate votes, while the later official/FEC total is 2,734,958, a 6,820
  difference. The only admitted geometry candidate is Marion County: 2,400
  physical FeatureClass result rows resolve to 600 source-native precinct
  polygons, four candidate rows per precinct, 601 rings, and 115,405
  positions. The same exact IDs and geometries match the retained 2012 and
  2016 presidential result-feature cohorts. The FeatureClass itself carries
  `ELECTIONID = 2016-General`, so `election_date_confirmed` is scoped strictly
  to those 600 Marion features, not to statewide Indiana.

- Indiana's 600 exact parent-qualified ID relationships remain pending and
  vote-free. The mutable service is unarchived, unversioned, has no
  historic-moment support or explicit reuse license, covers only county GEOID
  18097, and leaves 91 counties missing. Its 366,791 candidate votes exceed
  the official ENR Marion total of 361,070 by 5,721; the required
  mapped-minus-result reconciliation delta is therefore -5,721 and status is
  failed. Raw, ledger, FeatureClass, statewide-result, and candidate-row drift
  gates all fail before writes. Independent review caught and corrected an
  overbroad historical-cohort phrase, then accepted the regenerated blocked
  package without further findings.

- Kentucky retains nine official/context artifacts totaling 1,887,094 bytes
  under ledger SHA-256
  `f7e65ea379e12180b638ff878657d04fc85e18741056ceee7ae4ec572f20f2bc`.
  The official publication page, not the recap index, supplies the exact
  `2016 Primary and General Recap Sheets Unofficial results` attribution. The
  recap index exposes 118 county links. A pinned official Census TIGERweb
  county identity response proves the complete 120-county universe and the
  exact missing complement, Breathitt and Nicholas. No complete certified
  precinct result universe, election-applicable 2016 geometry, or official
  crosswalk is retained, so features, result units, matches, and delivery all
  remain zero. Fresh independent review accepted the remediated package.

- Maine retains seven official artifacts totaling 329,025 bytes under ledger
  SHA-256
  `51074ea2f0004d01f9306a16ea934689f8e309c32826dc6eb64a6136604b023b`.
  Its official President workbook proves 532 geographic local election-unit
  identities across all 16 county parents plus one non-geographic State
  UOCAVA identity. It records 747,927 candidate selections, 23,965 blanks,
  and 771,892 ballots. All 532 geographic identities remain reviewed-unmatched;
  no current municipal, registration-layout, or apportionment context is
  backcast into 2016 geometry. Features, assigned votes, matches, and delivery
  remain zero. Fresh independent review accepted the blocked package.

- The canonical registry now contains 144 blocked manifests: 51 for 2024, 51
  for 2020, and 42 for 2016. Focused Wave 14 state tests pass 5/5; historical
  inventory coverage passes 34/34; registry artifact validation passes 11/11;
  the complete 147-file precinct suite passes in 599.2 seconds; and
  `npm run typecheck` passes. The audited MCP precinct validator passed with
  no warnings at
  `.etl/mcp-runs/2026-08-04T01-35-01-860Z-fc014fbe/manifest.json`.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for Indiana,
  Kentucky, and Maine. Each reports `no_historical_review_rows`; no indicator
  types were produced. Advisory indicators are screening signals only, never
  evidence of fraud or misconduct. Production API/DB counts were not checked,
  and no staging artifact, database row, public delivery asset, production
  promotion, or Git publication changed.

### 2026-08-03 - 2016 historical acquisition wave 15 start

- Missouri, Mississippi, and North Dakota are the next bounded three-state
  wave. The 2016 ledger marks all three in progress in Wave 15: 42
  jurisdictions remain reviewed/blocked, three are active, six are not
  started, and zero are public eligible. State workers remain confined to
  their state package, collector, and focused test; the coordinator owns
  shared registry, inventory, runner, integration, final review, and all
  production decisions.

- Missouri's official elections page advertises precinct-level general files
  for 1996 through 2024 as a purchase product. An official 2016 general
  election-by-county PDF is already retained, but no complete public statewide
  precinct result export or election-applicable 2016 precinct geometry is
  currently retained. Wave work will preserve the exact official access terms
  and available result context, test any official public endpoints, and remain
  zero-geometry/zero-crosswalk unless a source-native precinct universe and
  dated geometry can be proved.

- Mississippi's official county recapitulation index links exactly 82 county
  PDFs and says they contain precinct results with only reporting precincts
  listed. Sampled PDFs appear to be scanned system printouts, so OCR and human
  review may be needed. The existing official statewide recap reconciles 82
  county rows to 485,131 Democratic, 700,714 Republican, and 1,209,357 total
  presidential votes, but it is county context only. Wave work will retain the
  exact official PDF hrefs, create identities only from rows actually printed,
  preserve page/row evidence, never infer zero-vote precincts, and reconcile
  county extraction before acceptance. MARIS 2008/2012, Census VTD10/VTD20,
  current county services, and the partial 2023 county set are not silently
  backcast to November 8, 2016.

- North Dakota's official archive exposes complete President and U.S. Senate
  precinct result endpoints across all 53 counties. Preflight found 432 exact
  county-plus-StatePrecinctID identities: 3,024 presidential candidate rows
  totaling 344,360 votes and 2,160 Senate candidate rows totaling 342,501
  votes. No official 2016 precinct geometry edition is currently retained;
  the current 2026 layer is exclusion context only. Wave work will pin the
  official archive responses, retain the 432 source-native result identities
  as reviewed-unmatched, verify same-grain contest identity coverage, and keep
  geometry and delivery at zero unless election-date boundaries are proved.

### 2026-08-03 - 2016 historical acquisition wave 15 close

- Missouri, Mississippi, and North Dakota are reviewed and remain blocked. The
  2016 inventory now records 45 reviewed/blocked jurisdictions, six not
  started, zero in progress, and zero public eligible. No Wave 15 package has
  a public delivery artifact.

- Missouri retains four hash-pinned official/context artifacts totaling
  2,244,718 bytes under the 6,455-byte ledger SHA-256
  `f775017d0c14ba2a960d7955c7f0ad09c28fb461bd9eed79ed03844dd4656e6a`.
  The official SOS access page says November-general precinct files for
  1996-2024 are available by purchase/contact rather than by a public file
  link. The retained 136-page official PDF supplies county/reporting-authority
  context only: 116 authority rows, 115 reviewed county-equivalent rows, and
  2,808,605 presidential votes after five main columns and five named write-in
  columns are combined. Jackson County/Kansas City remains context rather than
  a target crosswalk. The retained DNR service exposes legislative layers, and
  the MSDIS archive exposes only 2010 Census VTD candidates plus an unrelated
  2016 land-boundary item. Result targets, features, matches, and delivery
  remain zero. Fresh independent review accepted the package without changes.

- Mississippi retains 108 hash-pinned sources under the 242,180-byte ledger
  SHA-256
  `0cf848ba4d8f9fb354bb01f57ec02eee535a1f47c8c154ff855320d762533e21`.
  They include all 82 official county-recap PDFs, 11 certification PDFs, and
  one statewide recap. Each archived SOS PDF records its exact official-origin
  URL and separately identifies Internet Archive as secondary transport.
  The 82 county reports total 63,552,799 bytes and 692 pages, with zero
  substantive machine-text characters. The official index says only reporting
  precincts are listed, so no zero-vote unit is inferred and no partial,
  uncorrected OCR is admitted. The statewide recap provides 82 county rows and
  1,209,357 named-candidate votes only as context.

- Mississippi's later MARIS 2023 page is a distinct 80-county source universe
  that omits Harrison and Pearl River; mixed 2008/2012 material and Census
  VTD10/VTD20 are also excluded rather than backcast. No retained official
  boundary edition is proven effective November 8, 2016, and no complete
  correction-reviewed result identity universe or official crosswalk exists.
  Result targets, features, crosswalk rows, assigned votes, and delivery remain
  zero. Independent review recomputed all 108 hashes and accepted the package
  without changes.

- North Dakota retains 110 hash-pinned artifacts totaling 629,834 bytes under
  the 212,647-byte ledger SHA-256
  `1b4b6d4da8ce023f2c04baa5801193834a78015a8933d2ae3e9211ffe4faf1e0`.
  Fifty-three county-scoped President responses contain 3,024 candidate rows,
  432 exact county-plus-StatePrecinctID identities, and 344,360 votes. The same
  432 identities appear in 2,160 U.S. Senate rows totaling 342,501 votes, and
  all 432 precincts are reported. Census parent evidence resolves all 53 county
  GEOIDs without retaining county geometry. All 432 result identities remain
  vote-free, parent-qualified, and reviewed-unmatched; normalized features and
  matches remain zero, and delivery is null.

- North Dakota's retained client script documents archived county-map request
  construction, not a precinct template. The fixed precinct responses are
  independently pinned official endpoint evidence, while the live archive
  remains mutable and the local pins are not an immutable official snapshot.
  No explicit reuse terms, election-date polygons, shared stable feature ID,
  or official result-to-feature crosswalk is retained, and current 2026
  geometry is not backcast. Independent review reproduced all contest totals,
  identities, parent resolutions, and hashes and accepted without changes.

- The canonical registry now contains 147 blocked manifests: 51 for 2024, 51
  for 2020, and 45 for 2016. Focused Wave 15 state tests pass 7/7; historical
  inventory coverage passes 35/35; registry contract and artifact validation
  pass 11/11 each; the complete 150-file precinct suite passes in 639.3
  seconds; and `npm run typecheck` passes. The audited MCP precinct validator
  passed with no warnings at
  `.etl/mcp-runs/2026-08-04T02-51-27-145Z-cee43a56/manifest.json`.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for Missouri,
  Mississippi, and North Dakota. Each reports
  `no_historical_review_rows`; no indicator types were produced. Advisory
  indicators are screening signals only, never evidence of fraud or
  misconduct. Production API/DB counts were not checked, and no staging
  artifact, database row, public delivery asset, production promotion, or Git
  publication changed.

### 2026-08-03 - 2016 historical acquisition wave 16 start

- Nebraska, New Hampshire, and New Jersey are the next bounded three-state
  wave. The 2016 ledger marks all three in progress in Wave 16: 45
  jurisdictions remain reviewed/blocked, three are active, three are not
  started, and zero are public eligible. State workers remain confined to
  their state package, collector, and focused test; the coordinator owns
  shared registry, inventory, runner, integration, final review, and all
  production decisions.

- Nebraska already retains the official 2016 General Canvass Book as
  county-level presidential context. Its 2020 precinct diagnostic found
  county-local result PDFs, a current official GIS portal with no admitted
  precinct item, Census VTD context, and official request paths, but no
  election-applicable statewide precinct layer or reviewed crosswalk. Wave
  work will search official 2016 election/GIS archives and county sources,
  retain exact source artifacts, and remain zero-target/zero-geometry unless
  a complete source-native result universe or dated boundary edition is
  proved.

- New Hampshire retains official 2016 President workbook sets and the official
  GRANIT `NHPolitDists.zip` candidate first collected in the 2020 package.
  Its metadata spans September 1, 2012 through October 26, 2017, and its 324
  polygons include town and ward fields. That span is a candidate lead, not
  automatic November 8, 2016 applicability. Wave work will independently parse
  exact 2016 result identities, inspect native geometry fields and metadata,
  test town/ward coverage and cardinality, and require an official or reviewed
  relationship before any feature is colorable.

- New Jersey retains the official statewide 2016 President PDF and all 21
  official county President PDFs. The existing official NJOGIS package is
  explicitly a 2019-2020 election-district edition with 6,348 features, so it
  cannot be backcast to 2016. Wave work will inventory machine-readable county
  election-district identities, search official archives for a 2016 boundary
  edition or exact crosswalk, preserve the state/county source distinction,
  and keep later geometry excluded unless election applicability is proved.

### 2026-08-03 - 2016 historical acquisition wave 16 close

- Nebraska, New Hampshire, and New Jersey are reviewed and remain blocked. The
  2016 inventory reached 48 reviewed/blocked jurisdictions, three not started,
  zero in progress, and zero public eligible at close. No Wave 16 package has
  a public delivery artifact. Fresh independent review accepted all three
  state packages without changes.

- Nebraska retains 23 ledger artifacts totaling 3,568,883 bytes under the
  37,785-byte ledger SHA-256
  `aba8d1a0261c7dc63089df7dbe6e20cadaa35450103d8deb39fefafc398abaa0`.
  The 60-page official canvass proves 93 county rows, 1,384 printed precincts,
  1,211,101 registered voters, and 844,227 presidential votes. The official
  election application instead reports 1,481 precincts and 1,211,113 voters,
  leaving source deltas of 97 precincts and 12 voters unresolved. Sixty-five
  counties have an observed official local-results path; 28 remain unresolved.
  Douglas and Lancaster supply detailed result context, but no complete
  statewide source-native precinct identity universe or election-applicable
  polygon edition is retained. Targets, features, crosswalk rows, matches,
  assigned votes, and delivery remain zero.

- New Hampshire retains 11 ledger artifacts under the ledger SHA-256
  `f95eff1f7e979afc77e68e792b36f4ce678a90b9e2e76113c749d3ea61acaee1`.
  Nine official-origin county detail workbooks plus the write-in workbook yield
  324 unique result identities: 320 geographic units and four administrative
  units. Named detail rows total 732,262 votes; the official statewide workbook
  totals 732,267, with the five-vote difference isolated to Rafael De La Fuente
  in Carroll County and retained as a failed source reconciliation. The GRANIT
  candidate has 324 polygons, including 78 ward polygons, but its metadata
  spans 2012-2017, labels currentness as publication date, and warns that it is
  not for legal use. Its 2016 election applicability is therefore unproved.
  All 320 geographic identities remain reviewed-unmatched; no votes or delivery
  are admitted.

- New Jersey retains 31 official/context artifacts totaling 2,176,973 source
  bytes under the 59,232-byte ledger SHA-256
  `163f7889584bf146477578300c05ef4402be23bf6fcab359afb46cf2806099e7`.
  Twenty-one official county PDFs yield 574 exact local result rows: 565
  municipality rows and nine Federal Overseas administrative rows. Candidate
  sums reconcile to 3,874,046 statewide votes and every geographic row has an
  exact county GEOID parent. The reports are municipality totals, however, and
  the official historical summary's 6,338 election-district count supplies no
  district identities. The available 6,348-feature NJOGIS layer is explicitly
  a 2019-2020 edition and remains excluded. All 565 geographic result units are
  reviewed-unmatched; features, matches, assigned votes, and delivery remain
  zero.

- The canonical registry now contains 150 blocked manifests: 51 for 2024, 51
  for 2020, and 48 for 2016. Focused Wave 16 state tests pass 7/7; historical
  inventory coverage passes 36/36; registry contract and artifact validation
  pass 11/11 each; the complete 153-file precinct suite passes in 675.3
  seconds; and `npm run typecheck` passes. The audited MCP precinct validator
  passed at
  `.etl/mcp-runs/2026-08-04T04-12-19-974Z-c5f0aa1f/manifest.json`.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for Nebraska, New
  Hampshire, and New Jersey. Each reports `no_historical_review_rows`; no
  indicator types were produced. Advisory indicators are screening signals
  only, never evidence of fraud or misconduct. Production API/DB counts were
  not checked, and no staging artifact, database row, public delivery asset,
  production promotion, or Git publication changed.

### 2026-08-03 - 2016 historical acquisition wave 17 start

- New York, Oregon, and South Dakota are the final bounded 2016 wave. The 2016
  ledger marks all three in progress in Wave 17: 48 jurisdictions remain
  reviewed/blocked, three are active, zero are not started, and zero are public
  eligible. State workers remain confined to their state package, collector,
  and focused test; the coordinator owns shared registry, inventory, runner,
  integration, final review, and all production decisions.

- New York already retains the official 2016 statewide/county presidential PDF
  and extensive 2024 county election-district source reconnaissance. Wave work
  will search the NYSBOE archive, VEDA/Flateau records, and county-board sources
  for a complete 2016 result-identity universe and election-applicable polygon
  editions. County totals, enrollment files, current layers, and partial county
  sets remain context unless an exact local identity and applicability chain is
  proved.

- Oregon retains the official 2016 Abstract of Votes as county context, while
  its 2024 work found image-heavy county precinct reports and a current tabular
  Voting Districts by Precinct source but no verified statewide election-date
  polygon edition. Wave work will search Oregon SOS records, state digital
  collections, and county sources for 2016 precinct identities, dated geometry,
  and a reviewed crosswalk. Later or current districts will not be backcast.

- South Dakota's official results application exposes archived precinct endpoints
  and the 2020/2024 collectors provide a reproducible diagnostic pattern. Wave
  work will pin the 2016 election/race responses, distinguish geographic from
  absentee or vote-center units, reconcile available official totals, and seek
  an election-applicable polygon layer or official stable-ID crosswalk. Result
  rows remain vote-free geometry targets unless that chain is proved.
### 2026-08-04 - 2016 historical acquisition wave 17 close

- New York, Oregon, and South Dakota are reviewed and remain blocked. The 2016
  inventory is complete at 51 reviewed/blocked jurisdictions, zero not started,
  zero in progress, and zero public eligible. No Wave 17 package has a public
  delivery artifact.

- New York retains eight package files totaling 1,067,995 bytes, including
  three raw files totaling 1,053,811 bytes. The official 62-county statewide
  PDF supplies county-only presidential context: 4,556,118 Clinton votes,
  2,819,533 Trump votes, 426,334 other-candidate votes, and 7,801,985 total
  votes. The separate New York City election-district source is retained only
  as a five-county-equivalent lead and excluded from statewide completeness
  metrics. No complete statewide source-native precinct identity universe,
  election-applicable geometry, or reviewed crosswalk was proved, so result
  units, features, matches, assigned votes, and delivery remain zero. Initial
  review found that the collector could not replay entirely from retained
  inputs; package-root replay, raw hash pins, and tamper-before-write checks
  were added, after which independent review accepted the package.

- Oregon retains eight package files totaling 996,657 bytes, including three
  raw files totaling 977,609 bytes. Its 38-page official abstract supplies 36
  county presidential totals but no precinct identities. The current official
  Voting Districts by Precinct metadata exposes eight text columns and no
  geometry, and it is not an election-date boundary edition. Result units,
  features, matches, assigned votes, and delivery therefore remain zero. The
  first integration pass exposed a noncanonical manifest shape; the collector,
  manifest, and tests were repaired to the shared contract, with deterministic
  offline replay and source-tamper rejection, and a fresh independent review
  accepted the corrected package.

- South Dakota retains 80 package files totaling 13,408,395 bytes, including 74
  raw files totaling 12,642,899 bytes. The official archived results postback
  yielded 65 county workbooks plus a statewide President workbook; Harding
  County's county export reproducibly returned the retained official error
  response, while the statewide workbook still covers all 66 counties. The
  statewide source contains 707 unique county-qualified non-total result
  identities: 700 geographic candidates and seven exact Absentee Precinct
  administrative rows. Candidate totals reconcile exactly to 370,047 votes:
  227,701 Trump, 117,442 Clinton, 20,845 Johnson, and 4,059 Castle. All 65
  successful county workbooks reconcile exactly to the statewide source. No
  election-applicable precinct geometry or reviewed crosswalk was proved, so
  all 700 geographic identities remain reviewed-unmatched, the seven absentee
  rows remain non-geographic, and features, matches, assigned votes, and
  delivery remain zero. Expanded replay, workbook-tamper, and timestamp tests
  passed, and a second independent review accepted the upgraded package.

- The canonical registry now contains 153 blocked manifests: 51 for 2024, 51
  for 2020, and 51 for 2016. Focused Wave 17 state tests pass 10/10; historical
  inventory coverage passes 37/37; registry contract and artifact validation
  pass 11/11 each; the complete 156-file precinct suite passes in 686.9
  seconds; and npm run typecheck passes. An independent shared-integration
  review confirmed the registry counts, exact 2016 state list, Wave 17 metrics,
  empty 2016 in-progress queue, and runner inclusion without changes. The
  audited MCP precinct validator passed with no warnings at
  .etl/mcp-runs/2026-08-04T05-32-49-334Z-24281651/manifest.json.

- The required 2016 advisory-path report found zero review rows, calculated
  advisory rows, flagged jurisdictions, and flagged areas for New York,
  Oregon, and South Dakota. Each reports no_historical_review_rows; no
  indicator types were produced. Advisory indicators are screening signals
  only, never evidence of fraud or misconduct. Production API/DB counts were
  not checked, and no ETL staging artifact, database row, public delivery
  asset, production promotion, or Git publication changed.

### 2026-08-04 - 2012 historical acquisition wave 1 start

- North Carolina, Rhode Island, and Washington are the first bounded 2012 wave.
  The 2012 ledger marks all three in progress in Wave 1: zero jurisdictions are
  reviewed, three are active, 48 are not started, and zero are public eligible.
  State workers remain confined to their state package, collector, and focused
  test; the coordinator owns shared registry, inventory, runner, integration,
  final review, and all production decisions.

- North Carolina already has an official NCSBE 2012 presidential result trail
  in its historical normalization inputs, while the current precinct shapefile
  is a 2024 edition. Wave work will pin the exact 2012 reporting-unit export,
  classify geographic versus administrative units from source evidence, search
  official election/GIS archives for an election-applicable boundary edition
  or stable-ID crosswalk, and avoid backcasting the current layer.

- Rhode Island already retains the official finalized 2012 long-format result
  ZIP and statewide JSON. Its known RIGIS candidates are election-cycle layers
  whose applicability and result-key relationship must be proved independently
  for November 6, 2012. Wave work will parse the complete source-native result
  universe, separate Federal or other administrative rows, test municipality-
  plus-precinct identities, and keep all relationships pending until boundary
  vintage and crosswalk evidence pass review.

- Washington has official election-specific 2024 geometry and result packages,
  but its active historical baseline currently begins in 2016. Wave work will
  search the Secretary of State 2012 result archive and precinct-shapefile
  records for paired election-specific artifacts, retain exact source evidence,
  reconcile participating versus certified totals, and admit no later geometry
  as 2012 geography without explicit applicability evidence.

### 2026-08-04 - 2012 historical acquisition wave 1 close

- North Carolina, Rhode Island, and Washington are reviewed and remain blocked.
  The 2012 inventory now records three reviewed/blocked jurisdictions, 48 not
  started, zero in progress, and zero public eligible. No Wave 1 package has a
  delivery artifact or assigns an election vote to geometry.

- North Carolina retains nine package files totaling 23,317,744 bytes,
  including three raw files totaling 22,183,257 bytes. The official result ZIP
  contains 15,270 presidential candidate rows, 3,054 county-qualified source
  identities across 100 counties, 76 zero-vote identities, and 4,505,372 votes.
  The official archive candidate contains 2,746 geometry features, but only 655
  source-field identities overlap the unclassified result universe; 2,399
  result identities and 2,091 geometry identities remain outside that candidate
  overlap. The September 1 filename, later object metadata, missing Real
  Precinct field, and absence of an official election-day applicability or
  result-to-feature crosswalk keep approved targets, features, matches, assigned
  votes, and delivery at zero. Independent review accepted the repaired exact-
  timestamp, deterministic replay, and tamper-before-write gates.

- Rhode Island retains 12 package files totaling 10,271,406 bytes, including
  seven raw files totaling 9,658,134 bytes. The finalized-root result source
  contains 494 presidential reporting units and reconciles exactly to 446,049
  votes: 413 regular geographic candidates, 40 Limited units, 39 presidential-
  only units, and two federal units. The later mutable RIGIS 2016 layer has 419
  features and only supplies a diagnostic literal-code comparison: 413 result
  candidates and six geometry-only codes. No immutable 2012 boundary edition,
  official crosswalk, or reviewed continuity chain was proved, so all 413
  colorable units remain unmatched and no geometry, vote, or delivery is
  admitted. The focused deterministic/tamper test and independent review pass.

- Washington retains 14 package files totaling 112,135,433 bytes, including
  nine raw files totaling 108,151,043 bytes. Its year-labeled vector archive
  has 7,031 features; the same official archive has 7,003 election-date
  workbook identities, with 6,998 exact ID overlaps. The participating result
  export has 4,480 geographic units, 4,476 exact St_Code candidates, four
  unmatched units, and 39 county Total rows. Geographic presidential rows total
  2,155,355 votes versus 3,125,516 in county totals. The separately retained
  King e-canvass supplies 967,154 of the 970,161-vote gap, leaving 3,007 votes
  across 17 other counties. King has 2,499 precinct names and no St_Code field;
  the other 38 county workbooks span three schema families. Those facts improve
  source completeness but do not prove a certified, election-date result-to-
  geometry relationship. All 4,476 exact-ID relationships remain pending, no
  vote enters the crosswalk, and delivery remains null. An independent review
  accepted the package after the isolated replay root was made workspace-
  portable.

- Focused Wave 1 state tests pass 6/6: North Carolina 3/3, Rhode Island 1/1,
  and Washington 2/2. Registry contract and artifact validation pass 11/11
  each; historical inventory coverage passes 38/38; `npm run typecheck` and
  `npm run validate:precinct-geometry` pass; and the complete 159-file precinct
  suite passes in 735.2 seconds. The canonical registry contains 156 blocked
  manifests: 51 each for 2024, 2020, and 2016, plus three for 2012. The MCP
  precinct validator passed with no warnings at
  `.etl/mcp-runs/2026-08-04T06-52-43-746Z-3eef388d/manifest.json`.

- The advisory reporter and MCP indicator tool explicitly support only 2016,
  2020, and 2024, so a 2012 indicator calculation is not available and was not
  fabricated. This precinct-GIS wave generated no native staging artifact or
  native review row; calculated indicator rows, flagged jurisdictions, flagged
  areas, and indicator types are therefore not evaluated for 2012. Production
  API/DB counts were not checked. No staging promotion, database row, public
  delivery asset, production mutation, or Git publication changed.

### 2026-08-04 - 2012 historical acquisition wave 2 start

- Massachusetts, Minnesota, and Texas are the second bounded 2012 wave. The
  2012 ledger keeps North Carolina, Rhode Island, and Washington reviewed and
  blocked, marks the three Wave 2 states in progress, and leaves 45
  jurisdictions not started. Zero 2012 jurisdictions are public eligible.

- Massachusetts has an official PD43+ 2012 presidential county trail and the
  prior diagnostic retains the authoritative MassGIS 2012 wards-and-precincts
  service. Wave work will pin the complete 2012 PD43+ local result universe,
  distinguish the September 2012 statewide source from later Boston edits, test
  only source-native municipality/ward/precinct identifiers, and require an
  election-date applicability and crosswalk chain before admitting geometry.

- Minnesota has proven election-specific LCC-GIS/SOS VTDID pairings for 2016
  and 2024. Wave work will search the same official catalogs for a
  `vtd2012general`-era boundary archive and certified 2012 precinct workbook,
  pin both sources, reconcile all 87 county parents and statewide totals, and
  exclude any unofficial geometry-attached vote fields from result assignment.

- Texas has a documented Texas Legislative Council pattern pairing General
  Election VTD data and geometry by a source-defined field. Wave work will
  locate and pin the 2012 General VTD archives and readme, verify the actual
  source-native join key and all parent/statewide totals against official SOS
  context, preserve the VTD-versus-county-precinct distinction, and keep any
  scope or boundary-vintage discrepancy fail-closed.

- State workers are confined to their assigned package, collector, and focused
  test. The coordinator owns the shared registry, 2012 inventory, runner,
  integration, independent review, documentation, and production decisions.
  No production promotion or public delivery is authorized.

### 2026-08-04 - 2012 historical acquisition wave 2 close

- Massachusetts, Minnesota, and Texas are reviewed and remain blocked. The 2012
  inventory now records six reviewed/blocked jurisdictions, 45 not started,
  zero in progress, and zero public eligible. No Wave 2 package assigns a vote
  to geometry or exposes a public delivery artifact.

- Massachusetts retains 13 package files totaling 11,062,879 bytes, including
  eight raw files totaling 8,640,849 bytes. The official PD43+ precinct export
  contains 2,174 municipality/ward/precinct units and reconciles exactly to the
  official 3,184,196-vote election-page total. The retained MassGIS candidate
  has 2,152 features: 1,897 labeled 2012 and 255 labeled 2016. A literal
  diagnostic finds one candidate for 2,092 result identities and none for 82,
  but the live service, later Boston revisions, and absence of an official
  PD43+-to-feature crosswalk do not prove a November 6 boundary relationship.
  All result rows remain unmatched/pending, approved features and assigned
  votes remain zero, and delivery is null. The initially future-dated source
  stamp was rejected before integration and regenerated at the truthful fixed
  `2026-08-04T07:18:30.000Z` timestamp.

- Minnesota retains 13 package files totaling 12,146,271 bytes, including eight
  raw files totaling 12,128,346 bytes. Its certified post-recount SOS workbook
  has 4,102 VTDIDs across all 87 counties, 33 zero-vote units, and 2,936,561
  presidential votes. The retrievable official-hosted `vtd2012general.zip`
  candidate also has 4,102 polygons but only 4,100 valid VTD keys. Two Blue
  Earth features have blank keys while SOS IDs `270130165` and `270130197`
  remain result-only; no name, order, or spatial inference was made. The exact
  archive linked by the retained official metadata, `vtd2012.zip`, now returns
  a pinned 34-byte 404 response, while `vtd2012general.zip` is not linked by
  that metadata. The 4,100-ID overlap remains diagnostic evidence only;
  normalized geometry and crosswalk rows are empty and delivery is null.

- Texas retains 11 package files totaling 150,708,270 bytes, including six raw
  files totaling 86,950,422 bytes. The Texas Legislative Council readme
  explicitly defines `cntyvtd` to `CNTYVTD`, yielding 8,952 exact VTD pairs
  across 254 counties, including 278 zero-vote units. The paired TLC scope
  totals 7,997,303 presidential votes, while separate SOS official context
  totals 7,993,851; the unresolved +3,452 delta is driven chiefly by generic
  write-ins. The pair describes legislative VTDs, not proven county election
  precincts, and immutable election-date applicability is not independently
  established. Candidate geometry and exact relationships remain vote-free;
  validation is blocked and delivery is null.

- Focused Wave 2 state tests pass 12/12: Massachusetts 4/4, Minnesota 5/5,
  and Texas 3/3. Every timestamp, alternate-root replay, and source-tamper path
  was independently reviewed; tampering now occurs only inside disposable
  copied package roots and leaves canonical source bytes and content timestamps
  untouched. Final independent reviews accepted all three packages.

- Registry contract and artifact validation pass 11/11 each; historical
  inventory coverage passes 39/39; `npm run typecheck` and
  `npm run validate:precinct-geometry` pass; and the complete 162-file precinct
  suite passes in 808.6 seconds. The canonical registry contains 159 blocked
  manifests: 51 each for 2024, 2020, and 2016, plus six for 2012. The MCP
  precinct validator passed with no warnings at
  `.etl/mcp-runs/2026-08-04T07-44-59-088Z-e9011061/manifest.json`.

- The advisory reporter and MCP indicator tool still support only 2016, 2020,
  and 2024. This wave generated no native staging artifact or native review
  row, so 2012 advisory rows, flagged jurisdictions, flagged areas, and
  indicator types were not evaluated or fabricated. Production API/DB counts
  were not checked. No staging promotion, database row, public delivery asset,
  production mutation, or Git publication changed.

### 2026-08-04 - 2012 historical acquisition wave 3 start

- California, Iowa, and Wisconsin are the third bounded 2012 wave. The 2012
  ledger keeps six Wave 1-2 jurisdictions reviewed/blocked, marks CA/IA/WI in
  progress, and leaves 42 jurisdictions not started. Zero 2012 jurisdictions
  are public eligible.

- California's Statewide Database exposes election-specific statewide result
  and geography/conversion patterns for general elections. Wave work will
  locate and pin the 2012 General pages and files, distinguish SOS-certified
  totals from supplemental SWDB statistical-merge precinct products, verify
  SRPREC/SVPREC/MPREC identity semantics and masking, and admit no relationship
  that depends only on a transformed display name or later geometry edition.

- Iowa's official SOS archive and Legislative Services Agency GIS service
  already establish the 2016 county-workbook and statewide precinct-layer
  pattern. Wave work will locate the 2012 canvass and complete source-native
  precinct result universe, search the official service/catalog for the
  election-applicable 2012 boundary edition and SOS IDs, and never backcast the
  retained 2015, post-2020, or 2024 packages without explicit continuity.

- Wisconsin's official LTSB metadata identifies a product titled
  `2012 to 2018 Election Data with 2011 Wards`, making it a strong
  election-cycle lead for 2012. Wave work will pin the item/service/data bytes
  and official WEC 2012 ward results, test the product's ward allocation and
  combined-reporting-unit semantics, reconcile statewide and parent totals, and
  require a reviewed source-defined relationship before any delivery.

- State workers remain confined to their assigned package, collector, and
  focused test. The coordinator owns the shared registry, 2012 inventory,
  runner, integration, independent review, documentation, and production
  decisions. No production promotion or public delivery is authorized.
### 2026-08-04 - 2012 historical acquisition wave 3 close

- California, Iowa, and Wisconsin are reviewed and remain blocked. The 2012
  inventory now records nine reviewed/blocked jurisdictions, zero in progress,
  42 not started, and zero public-eligible layers. The canonical registry has
  162 blocked manifests: 51 each for 2024, 2020, and 2016, plus nine for 2012.

- California retains the complete official SWDB candidate universe across
  SRPREC, SVPREC, and MPREC products and 143 physically pinned raw sources.
  Direct SRPREC supplies 21,552 vote-free candidate geometries for 23,771
  result rows; 21,507 exact-key candidates and 2,264 unmatched rows all remain
  pending. The 74,389-feature MPREC alternative could improve direct coverage
  by only one result key after a validated dissolve, so no union is fabricated.
  Sutter relation-chain totals, the separate San Diego readme discrepancy,
  three-vote SWDB/SOS candidate reconciliation gap, constructed-unit semantics,
  topology, reuse terms, and delivery review remain blockers. No votes are
  assigned and delivery is null.

- Iowa retains 99 official SOS county workbooks, 52 official county map PDFs,
  and evidence for 47 unavailable canonical map URLs among 163 declared raw
  dependencies. All 1,687 workbook result identities reconcile to certified
  county and statewide slices; participation contains 1,688 identities, with
  the difference fully localized to Dallas (-1) and Lee (+2). Dallas's all-zero
  `ABSENTEE` row is the sole reviewed non-geographic result. The other 1,686
  rows remain county-qualified, pending, and unmatched with zero geometry
  features or assigned votes. Map-body evidence proves the January 15, 2012
  effective date for 38 retained PDFs; 14 remain vintage-unproven. The official
  Dubuque scan bridges 35 geographic codes plus code 46 absentee but also
  preserves four official-source cell conflicts. Vector GeoPDF extraction is
  feasible for a subset, but page clipping, topology, label association,
  statewide completeness, and authoritative polygon/result joins require a
  separate reviewed converter. No PDF-derived polygon or vote assignment is
  claimed and delivery is null.

- Wisconsin retains ten raw/evidence artifacts for the official LTSB product
  binding, 6,634 2011-ward identities across 72 counties and 1,907 municipality
  parents, and statewide 2012 presidential context totals. The contemporaneous
  WEC response is retained only as a Cloudflare challenge and is not treated as
  evidence that the source is unavailable. With no approved source-defined
  ward-result allocation or public delivery terms, normalized features,
  crosswalk rows, matched units, and assigned votes all remain zero; delivery
  is null.

- Independent no-edit review accepted all three state packages. California's
  final review recomputed all relationship counts and pending statuses; Iowa's
  review rehashed every raw source, reproduced all nine derived outputs from an
  alternate root, and reran all 163 tamper gates; Wisconsin's review confirmed
  its fail-closed source binding and counts. The coordinator's combined focused
  run passed 9/9 in 281.2 seconds, including every declared source-tamper case,
  timestamp rejection, deterministic replay, validator checks, and canonical
  raw byte/time preservation.

- Shared closeout passed 62/62 registry, historical-inventory, and validator
  tests; `npm run typecheck`; `npm run validate:precinct-geometry`; and the
  complete 165-file `npm run test:precinct-geometry` suite in 1,141.6 seconds.
  The fixed MCP precinct validator passed in 48.3 seconds and retained its audit
  at `.etl/mcp-runs/2026-08-04T10-54-02-628Z-307be3d7/manifest.json`; its
  pre-run and post-run repository snapshots are identical.

- The 2012 program does not have a native staging/review-row or advisory
  indicator calculation path; current advisory tooling supports only 2016,
  2020, and 2024. No 2012 indicator rows, flagged jurisdictions, flagged areas,
  or indicator types were fabricated. No staging promotion, database or
  production mutation, public delivery asset, or Git publication occurred.
### 2026-08-04 - 2012 historical acquisition wave 4 start

- Indiana, Pennsylvania, and Utah are the fourth bounded 2012 wave. The 2012
  ledger keeps nine Wave 1-3 jurisdictions reviewed/blocked, marks IN/PA/UT in
  progress, leaves 39 jurisdictions not started, and keeps every 2012 layer
  ineligible for public delivery.

- Indiana's official IndyGIS historical election service contains a 600-feature
  Marion County 2012 presidential cohort with source-native precinct IDs and
  physically co-resident polygon geometry. Wave work will retain the exact 2012
  cohort and official statewide/county result context, distinguish its 2011
  precinct-feature and 2012 result-feature semantics, reproduce the known
  county-total discrepancy, and preserve mutable-service, archival-custody,
  statewide-completeness, and reuse-term blockers. No Marion candidate is a
  statewide layer.

- Pennsylvania already retains the official 29,126,226-byte 2012 precinct-
  returns text and its ReadMe. Read-only reconnaissance counted 205,268 source
  records, 40,295 presidential candidate records, 9,246 county-qualified
  precinct result identities across all 67 counties, and 9,197 nonblank VTD
  codes. Wave work will independently parse and reconcile the complete official
  result universe. A VTD code remains reporting metadata, not a polygon join,
  until an election-applicable official boundary edition and crosswalk prove
  that relationship.

- Utah's official May 2012 UGRC publication identifies the statewide VISTA
  ballot-area dataset as compiled from county clerks for the 2012 election
  cycle, while the official 2012 canvass workbook retained in the source trail
  is county-level. Wave work will locate and pin the referenced prior VISTA
  archive, inspect `VISTAID`, `PRECINCTID`, `SUBPRECINCTID`, `VERSIONNBR`, and
  `EFFECTIVEDATE`, establish or reject November 6 applicability, and seek an
  official local result/crosswalk source. The 2012 blog or a current service is
  not by itself immutable election-date geometry.

- Arizona and Florida remain the next result-rich candidates: each has an
  official statewide 2012 precinct-result archive pattern but no approved
  statewide boundary edition or crosswalk. They are deferred to a later wave,
  not treated as unavailable.

- State workers remain confined to their state package, collector, and focused
  test. The coordinator owns the shared registry, 2012 inventory, runner,
  integration, independent review, and production decisions. No staging,
  database, production, public delivery, or Git publication is authorized.

### 2026-08-04 - 2012 historical acquisition wave 4 close

- Indiana, Pennsylvania, and Utah are now reviewed and fail-closed. The 2012
  inventory records 12 reviewed jurisdictions, 39 not started, zero in
  progress, and zero public-eligible. The registry contains 165 validated
  manifests: 51 each for 2024, 2020, and 2016, plus 12 for 2012. All 165 remain
  blocked because the evidence does not yet prove every required geometry,
  result-unit, crosswalk, reconciliation, licensing, and delivery condition.

- Indiana retains the official IndyGIS Marion County cohort as a real but
  partial candidate: 600 source IDs and polygon features with co-resident 2012
  presidential result attributes. The other 91 counties are absent. The
  service rows total 359,006 votes versus the official Marion total of 359,008;
  the exact two-vote difference is the official Jill Stein write-in count and
  is documented without repair. A separate 590-feature 2011 layer was not
  substituted. All 600 relationships remain pending review, normalized and
  crosswalk artifacts remain vote-free, and delivery remains null. Independent
  review first rejected an overclaim that the mutable service proved immutable
  election-day custody. The package was corrected to `vintageStatus: unknown`,
  with the election ID treated only as result association evidence, and the
  corrected package was accepted.

- Pennsylvania independently parses the complete official Department of State
  source: 205,268 total records, 40,295 presidential rows, 9,246 county-scoped
  precinct identities across all 67 counties, and 5,734,022 presidential votes.
  Twenty-eight identities have zero presidential votes. Of the 9,246 identities,
  9,201 have nonzero VTD codes, 45 retain literal-zero placeholders, and four
  county-scoped VTD codes are duplicated. Those codes are retained only as
  source metadata. No election-applicable official polygon edition or reviewed
  crosswalk was found, so there are zero normalized features, zero matched
  result units, zero assigned votes, and no delivery asset. Independent review
  accepted the fail-closed package.

- Utah pins seven official artifacts: the Lieutenant Governor's 2012 records
  page and canvass workbook, the May 2012 UGRC VISTA announcement, the current
  official UGRC product page, the official-linked State of Utah archive page,
  and the archive's 2011 shapefile and file-geodatabase ZIPs. The canvass has 12
  sheets and reconciles its 29 county rows to 1,283,526 registered voters,
  1,028,786 ballots, and 1,017,440 presidential candidate votes. The May 2012
  announcement proves that a replacement statewide VISTA layer existed and
  that 26 of 29 counties used GIS VISTA data, but the published historical
  files are explicitly the wrong vintage: all 2,818 rows end on 2011-12-31,
  embedded metadata says they were used for the 2011 general election and would
  not be used for 2012, and the 2,765 unique county/VISTA keys include 38
  duplicated keys and 53 excess rows. Twenty-three 2012 receipt dates do not
  prove applicability. No backcast was made; normalized features, target result
  units, and assigned votes remain zero, vintage remains unknown, and delivery
  remains null. Independent review accepted this disposition.

- The three focused state suites pass 8/8, and the shared registry, historical
  inventory, and validation suites pass 63/63. The reviewer interface did not
  offer the requested Luna runtime, so bounded independent review used the
  available Terra runtime at high reasoning; the coordinator retained all
  cross-state, integration, and final validation decisions.

- Repository-wide closeout passes: `npm run typecheck` in 5.8 seconds,
  `npm run validate:precinct-geometry` in 49.5 seconds, and the complete
  168-file `npm run test:precinct-geometry` suite in 1,162.2 seconds. The fixed
  MCP precinct validator passed in 47.6 seconds and retained its audit at
  `.etl/mcp-runs/2026-08-04T11-53-27-356Z-39801bb0/manifest.json`.

- The advisory-indicator tooling supports only 2016, 2020, and 2024, so no
  2012 review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or production
  mutation, public delivery asset, or Git publication occurred.

### 2026-08-04 - 2012 historical acquisition wave 5 start

- Arizona, Florida, and Michigan form the fifth bounded 2012 wave. The durable
  ledger now records 12 reviewed jurisdictions, three in progress, 36 not
  started, and zero public-eligible. Each state begins from an unapproved
  evidence lead, not from a presumed reusable modern boundary.

- Arizona has official historical election-result and county-election archives,
  plus Maricopa election-map and redistricting leads, but no approved statewide
  2012 precinct boundary edition or result-to-polygon crosswalk. Wave work will
  retain and reconcile the best official 2012 presidential reporting-unit
  source available, seek election-applicable state or county geometry, and keep
  any county-only candidate explicitly partial.

- Florida publishes an official statewide precinct-level result archive pattern
  and has official state and county GIS services. Wave work will parse the 2012
  presidential result universe, locate contemporaneous official boundary files
  where available, and measure county coverage. A later statewide layer or a
  single county's geometry cannot be backcast or described as statewide 2012
  coverage.

- Michigan's official DTMB boundary service and MVIC election-history system
  provide promising 2012 leads and established 2016/2020 diagnostic patterns.
  Wave work will seek the 2012 election-cycle layer and precinct-result export,
  while treating an election-cycle label, layer count, or identifier similarity
  as context rather than proof of November 6 applicability or a reviewed join.

- State workers are confined to their state package, collector, and focused
  test. The coordinator owns shared registry, inventory, runner, documentation,
  independent review, integration, and all delivery decisions. New Arizona and
  Florida workers use the requested Terra/medium exploration role. The reused
  Michigan worker interface did not expose model selection, so its task remains
  bounded to routine state reconnaissance and implementation. No staging,
  database, production, public delivery, or Git publication is authorized.

### 2026-08-04 - pause checkpoint during 2012 historical acquisition wave 5

- Work is intentionally paused at the user's request. The durable 2012 ledger
  remains at 12 reviewed, three in progress (AZ, FL, and MI), 36 not started,
  and zero public-eligible. The canonical registry remains at 165 validated,
  blocked manifests; Wave 5 state manifests have not yet been integrated.

- Arizona is complete and independently accepted after remediation. It retains
  byte-pinned Internet Archive transports of the official AZSOS election page
  and directory, derives exactly 15 county TXT identities totaling 31,831,556
  listed bytes, and excludes the separate 45,568-byte format document. The 15
  county result bodies remain inaccessible through the live challenge-blocked
  host. Result units, geometry, matches, and votes remain zero; vintage is
  unknown and delivery is null. Its focused suite passes 4/4.

- Florida is complete and independently accepted after a review-forced parser
  correction. The official 67-county archive has 688,407 source rows, 73,925
  President-contest rows, 59,854 named-candidate rows, 14,071 administrative
  rows, 6,319 contextual identities, 8,472,156 named-candidate votes, and 56
  zero-vote identities. No approved 2012 geometry or crosswalk is retained;
  target units and delivery remain empty/null. Its focused suite passes 3/3.

- Michigan's state-scoped package is complete but not independently accepted.
  It retains 4,874 official `ElectionYear=2012` candidate polygons across all
  83 counties and preserves the official Biennial Report comparison of 4,873
  precincts and 7,309,761 registered voters. The live service is non-versioned,
  exposes no historic-moment proof, contains mixed year cohorts, and the exact
  November 6 applicability is unproven. The official MVIC result page is
  identified but challenge-blocked, so no result export, election ID, guessed
  endpoint, crosswalk, or votes are retained. Worker tests pass 3/3. A fresh
  independent review was interrupted cleanly for this pause and must be rerun.

- Resume by rerunning the final Michigan focused test and a fresh independent
  no-edit Michigan review. If accepted, integrate all three manifests into the
  shared registry, mark AZ/FL/MI reviewed as Wave 5, reset the in-progress map,
  add all three focused tests to the standard runner, update shared count and
  state-specific assertions, then run combined, shared, typecheck, repository,
  complete-suite, and fixed MCP validation. Append the Wave 5 close only after
  every gate passes. The 2012 advisory path remains unsupported; do not
  fabricate review or indicator rows. No staging, database, production, public
  delivery, or Git action occurred.

### 2026-08-04 - 2012 historical acquisition wave 5 close

- Arizona, Florida, and Michigan are now integrated as reviewed, fail-closed
  Wave 5 diagnostics. The canonical registry contains 168 validated manifests,
  all blocked and ineligible. The 2012 inventory contains 15 reviewed
  jurisdictions, 36 not started, zero in progress, and zero public-eligible.
  The standard runner contains 171 isolated precinct-geometry test files.

- Arizona was accepted only after an independent review rejected the first
  package for a future timestamp, a self-validating source ledger, and missing
  retained official pages. The corrected package uses the fixed retrieval time
  `2026-08-04T12:11:00.000Z` and retains byte-pinned Internet Archive
  transports of the official AZSOS election page and county-file directory
  because the live official host returns an access challenge. It derives all
  15 county TXT identities totaling 31,831,556 listed bytes and excludes the
  separate 45,568-byte format document. The county result bodies remain
  unavailable, so result units, geometry features, matches, and votes are all
  zero; vintage is unknown and delivery is null. The final independent review
  accepted these limitations without treating the archive transport as a new
  source authority.

- Florida was accepted only after an independent review found that the first
  parser incorrectly counted `Times Over Voted` and `Number of Under Votes` as
  candidate votes. The corrected official 67-county archive preserves 688,407
  source rows, 73,925 President-contest rows, 59,854 named-candidate rows,
  14,071 administrative rows, 6,319 contextual county/precinct/location
  identities, 8,472,156 named-candidate votes, and 56 zero-vote contextual
  identities. Administrative rows remain explicit and contribute no candidate
  votes. No approved 2012 geometry or result-to-polygon crosswalk exists, so
  the 6,319 identities remain source context rather than target polygons;
  delivery is null.

- Michigan retains 4,874 official legacy BOE service features labeled
  `ElectionYear=2012` across all 83 counties: 4,538 Polygon and 336
  MultiPolygon features with unique VP and OBJECTID values. The official
  Biennial Report separately records 4,873 precincts and 7,309,761 registered
  voters; the one-feature discrepancy is preserved rather than reconciled by
  assumption. The service is non-versioned, exposes no historic-moment field,
  and contains mixed year cohorts. Its uniform 2012 CreateDate and
  ConfirmationDate values are administrative attributes, the XML `CreaDate`
  is metadata-document creation rather than proof of service republication,
  and the literal `canModifyLayer=true` metadata value is not interpreted as
  evidence of actual edit capability. The official SOS catalog identifies the
  November 6, 2012 MVIC result page, but direct access is challenge-blocked;
  no guessed election ID, result endpoint, crosswalk, or votes were retained.
  Vintage remains unknown and delivery is null. A fresh independent no-edit
  review accepted the corrected custody and applicability language.

- Independent review was completed for all three states. Arizona and Florida
  were initially rejected, corrected, and then accepted; Michigan was accepted
  after a fresh post-reboot review. The requested Luna review model was not
  available in the active interface, so the review tasks were kept bounded and
  no claim was made that Luna ran. Cross-state interpretation, integration,
  delivery decisions, and final validation remained with the coordinator.

- Validation passed at every required gate: the combined Wave 5 focused suite
  passed 10/10 tests; the shared contract, inventory, and validation suite
  passed 64/64; `npm.cmd run typecheck` passed; and
  `npm.cmd run validate:precinct-geometry` validated 168 manifests with zero
  eligible and 168 blocked. The complete 171-file
  `npm.cmd run test:precinct-geometry` suite passed in 1,325.7 seconds. The
  fixed MCP precinct validator passed in 52.341 seconds and retained its audit
  at `.etl/mcp-runs/2026-08-04T20-17-37-543Z-aeab7e05/manifest.json`.

- The advisory-indicator path supports only 2016, 2020, and 2024. No 2012
  review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or production
  mutation, public delivery asset, or Git publication occurred.

### 2026-08-04 - 2012 historical acquisition wave 6 start

- District of Columbia, Delaware, and Hawaii form the sixth bounded 2012
  acquisition wave. The durable 2012 ledger records 15 reviewed jurisdictions,
  three in progress, 33 not started, and zero public-eligible. The guarded MCP
  state inventories for all three states passed without warnings or workflow
  drift before state work began.

- District of Columbia has a compact official certified-results system and an
  established single county-equivalent context. Wave work will seek the exact
  official 2012 precinct result export and an election-applicable 2012 precinct
  boundary edition or direct applicability evidence. The Voting Precinct 2019
  service and 2024 assignment-retention evidence cannot be backcast to 2012.

- Delaware has official historical result archives and official FirstMap
  election-district services. Wave work will seek the 2012 presidential
  election-district universe and the correct 2012 map-cycle boundary edition or
  crosswalk. The November 2023 / 2022-through-2032 FirstMap layer is later-cycle
  context only and cannot establish 2012 applicability.

- Hawaii has official statewide summary/detail result patterns and official GIS
  services. Wave work will seek the exact 2012 summary and precinct/split export,
  contemporaneous geometry or map evidence, and 2012-specific county/Kalawao
  handling. Neither the May 2024 geometry nor the reviewed 2016/2020 district
  ranges or Kalawao assignment may be reused without 2012-specific proof.

- Three Terra/medium state workers are confined to their state package,
  collector, and focused test. The coordinator owns shared registry, inventory,
  runner, documentation, independent review, cross-state interpretation, and
  every delivery decision. No staging, database, production, public delivery,
  or Git publication is authorized. The 2012 advisory path remains unsupported;
  no review or indicator rows may be fabricated.

### 2026-08-04 - 2012 historical acquisition wave 6 close

- District of Columbia, Delaware, and Hawaii are now integrated as reviewed,
  fail-closed Wave 6 diagnostics. The canonical registry contains 171 validated
  manifests, all blocked and ineligible. The 2012 inventory contains 18
  reviewed jurisdictions, 33 not started, zero in progress, and zero
  public-eligible. The standard runner contains 174 isolated
  precinct-geometry test files.

- District of Columbia retains the official 100,186-byte, 32-page certified
  result PDF with SHA-256
  `a9aabb4fe6d16e417f2b0e4b949e3009a9f6132f4cb27ff5a4979f2a07b08f87`.
  It reports eight ward columns and 293,764 named presidential candidate votes:
  267,070 Obama, 21,381 Romney, 2,458 Stein, 2,083 Johnson, and 772 write-in.
  This is ward-level context, not an exact precinct result export. Independent
  review rejected the first package because it used a future custody stamp,
  retained an authored raw source-review in place of upstream bytes, and
  encoded unknown precinct/non-geographic and overvote/undervote classifications
  as zero or empty. The corrected package retains only the official PDF, uses
  `2026-08-04T20:24:58.441Z` from the retained file's UTC metadata, and records
  those source classifications as unknown/null. No 2012 precinct geometry,
  target result units, crosswalk, or vote assignment is asserted; vintage
  remains unknown and delivery is null. Fresh independent review accepted the
  corrected package.

- Delaware retains the official 643,557-byte result HTML and independently
  derives 433 unique source-native representative-district/election-district
  identities with 413,890 contextual presidential votes. It also retains the
  official 240,049-byte `DELAWARE ELECTION DISTRICT STRUCTURE (2012 thru 2022)`
  PDF, whose applicability note takes effect after completion of the November 6,
  2012 general election. That PDF is informational and contains no GIS
  structures. The current FirstMap layer reports a November 2023 update and no
  historic-moment or versioned 2012 capability, so it is exclusion evidence
  only. The 433 result identities remain source context rather than approved
  target rows; geometry, crosswalk, and assigned votes remain zero, vintage is
  unknown, and delivery is null. Independent review accepted the package.

- Hawaii retains the official summary text, media result export, and precinct
  detail PDF. The detail source contains 14,747 rows, including 1,012 President
  rows and 504 U.S. Senate rows. It establishes 253 presidential source
  identities: 250 numbered precinct/split units plus `Overseas 1|251`,
  `Overseas 2|252`, and `PRES|253`. Named candidate votes total 434,697:
  306,658 Obama, 121,015 Romney, 3,840 Johnson, and 3,184 Stein. No
  2012-specific county/Kalawao assignment, polygon source, or result-to-feature
  crosswalk was proven, and no 2024 or 2016/2020 interpretation was reused.
  Independent review rejected the initial future custody timestamp. The
  corrected collector uses `2026-08-04T20:29:08.174Z`, supported by the latest
  retained raw completion time, rejects invalid or future timestamps before
  exact-stamp drift, and has explicit future, missing, drift, replay, and raw
  tamper coverage. Fresh review accepted it. Geometry, target result units,
  crosswalk rows, and assigned votes remain zero; vintage is unknown and
  delivery is null.

- Repeated state-package timestamp findings produced a shared contract
  hardening. Registry `updatedAt`, manifest source `retrievedAt`, and digitized
  map review `reviewedAt` values must now be parseable and nonfuture. Manifest,
  registry, nested-manifest, and public-eligibility validation reuse one injected
  validation instant, with exact one-millisecond before/after boundary tests.
  The first shared review rejected repeated live-clock sampling and the missing
  digitization-review route test; the remediation added deterministic snapshot
  propagation and all three routes. Fresh independent review accepted the
  invariant. A non-blocking follow-up remains: manifest-view listing still
  samples its own clock, although registry-first validation and per-manifest
  validation remain fail-closed.

- Independent review was completed for all state packages and the shared
  timestamp invariant. District of Columbia, Hawaii, and the first shared
  invariant draft were initially rejected, corrected, and freshly accepted;
  Delaware was accepted on first review. The requested Luna review runtime was
  unavailable in the active interface, so bounded independent reviews used the
  available Terra runtime at high reasoning and no claim was made that Luna ran.
  Cross-state interpretation, integration, delivery decisions, and final
  validation remained with the coordinator.

- Validation passed at every required gate: the combined Wave 6 focused suite
  passed 8/8; the shared contract, historical inventory, and validation suite
  passed 66/66; and `npm.cmd run typecheck` passed. The official
  `npm.cmd run validate:precinct-geometry` workflow validated 171 manifests
  with zero eligible and 171 blocked, plus all four year ledgers. The complete
  174-file precinct suite finished in 1,330.3 seconds with all 174 start markers,
  zero failure markers, and the required `Precinct geometry suite passed (174
  files).` terminator. Windows PowerShell classified Node's harmless
  experimental-warning stderr as a redirection error record; the captured log
  itself passed an explicit integrity check and has SHA-256
  `27c594913299e0ef3854f75bd11c867ba18986873d6d970c1a2529f76abc8c1a`.
  The fixed MCP precinct validator passed in 51.902 seconds without warnings and
  retained its audit at
  `.etl/mcp-runs/2026-08-05T02-00-54-769Z-ec35e439/manifest.json`.

- The advisory-indicator path supports only 2016, 2020, and 2024. No 2012
  review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or production
  mutation, public delivery asset, or Git publication occurred.
### 2026-08-04 - 2012 historical acquisition wave 7 start

- Alabama, Kansas, and Maryland form the seventh bounded 2012 acquisition
  wave. The durable 2012 ledger records 18 reviewed jurisdictions, three in
  progress, 30 not started, and zero public-eligible. The guarded MCP state
  inventories for all three states passed without warnings or workflow drift
  before state work began.

- Alabama retains an official 2012 county presidential workbook and has official
  precinct-matrix patterns for later elections, but no approved 2012 precinct
  result universe, election-applicable geometry, or result-header-to-feature
  crosswalk. Wave work will search the SOS election archive, official state GIS
  leads, and authoritative county sources. Current district maps or later GIS
  procurement cannot be backcast to November 6, 2012.

- Kansas retains the official 2012 certified result PDF, while current ETL uses
  secondary county context because that PDF did not expose machine-readable
  county presidential rows in the prior pass. Wave work will seek official
  precinct-level results and contemporaneous statewide, DASC, or complete
  county boundary evidence. The current 73-feature Douglas County service has
  2026 timestamps and cannot establish statewide or 2012 applicability.

- Maryland has a strong official election-data archive pattern and a current
  statewide precinct service, but the reviewed service explicitly reflects 2026
  collection and has no historical moment. Wave work will seek the official
  2012 all-precinct result/reference artifacts and a dated 2012 election-boundary
  edition or official crosswalk. The 2026 layer and 2024 identifiers cannot be
  reused without 2012-specific applicability evidence.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. The coordinator owns the shared registry,
  inventory, runner, documentation, independent review, cross-state
  interpretation, and every delivery decision. No staging, database,
  production, public delivery, or Git publication is authorized. The 2012
  advisory path remains unsupported; no review or indicator rows may be
  fabricated.

### 2026-08-04 - 2012 historical acquisition wave 7 close

- Alabama, Kansas, and Maryland are now integrated as reviewed, fail-closed
  Wave 7 diagnostics. The canonical registry contains 174 validated manifests,
  all blocked and ineligible. The 2012 inventory contains 21 reviewed
  jurisdictions, 30 not started, zero in progress, 21 blocked, and zero
  public-eligible. The standard runner contains 177 isolated precinct-geometry
  test files.

- Alabama retains the official 4,509,321-byte SOS ZIP with SHA-256
  `e17626e084615306fbc37f6e2d1957dde2a8a23249d439f0156b6cb0e71fc3a8`
  and all 67 county workbooks. Only Bullock, Butler, Hale, and Wilcox are
  literally marked unavailable. Montgomery's transposed `Precinct Results`
  matrix contributes 111 nonempty unique source columns, eight presidential
  source rows, five named-candidate rows, and 101,924 named-candidate votes:
  63,085 Obama, 38,332 Romney, 68 Goode, 339 Johnson, and 100 Stein.
  Statewide source context contains 2,153 rows and 2,152 unique literal
  identities, preserving the one duplicate `Morgan|DECATUR FIRE & RESCUE`
  label. Named-candidate totals are 770,344 Obama, 1,220,051 Romney, 2,881
  Goode, 12,037 Johnson, and 3,278 Stein, or 2,008,591 total. Independent
  review rejected the first parser because it mislabeled Montgomery as
  unavailable. The corrected collector also validates the ZIP bytes in memory
  before creating the canonical raw path; mismatch coverage proves zero
  residue. Its focused suite passes 4/4. No election-applicable geometry,
  crosswalk, target polygons, or assigned votes is asserted; vintage remains
  unknown and delivery is null.

- Kansas retains the official 82,604-byte, 21-page certified PDF with SHA-256
  `eecf7e924a034adc8ef913ac5964524616334f1b1165ed67a2161fe688ccab6f`
  and the official 90,543-byte result page with SHA-256
  `7be769da9ad8f3f38322d6c730c2610279493b67383dccbac1aa94b4ea45293b`.
  The PDF contains 20 statewide presidential rows and 1,159,971 votes,
  including 440,726 Obama and 692,634 Romney. The result page says historical
  precinct-specific results are available upon request; that is retained as a
  request lead rather than treated as proof that the data do not exist. The
  current 73-feature Douglas County service is later-cycle context and is
  excluded. Independent review rejected the first collector because it could
  write one response before the second response's hash was accepted. The
  remediation validates both official responses in memory before either raw
  write, and regression coverage proves that a changed second response
  preserves both raw and all six derived artifacts byte-for-byte, including
  timestamps. Its focused suite passes 4/4. Geometry, target units, crosswalk,
  and assigned votes remain zero; vintage is unknown and delivery is null.

- Maryland retains four official artifacts: the 10,473,299-byte all-precinct
  CSV with SHA-256
  `023946c7a43b60e1e397823b8189ea332a35b40cfd0a07f669e41bb69a12bd16`,
  the 318,464-byte precinct-reference XLS with SHA-256
  `6c933febb1ebbaae5ad4e3ddf411f180fff6ef86d20b312fa55af57784b2ce59`,
  the 5,308-byte iMAP archived-boundaries metadata response with SHA-256
  `dc3b87332e8657c28c32cf33833f685b1a7db6ae1c74e3bec25ea9dcf2ac5dfe`,
  and the 96,611-byte Planning 2010-precinct page with SHA-256
  `2cd712d449b1fdb5c324cbfa63eb7945c64e4bf0a761ef3bc3e090ebdcc3e8e1`.
  The CSV contains 111,199 rows, 69,005 President rows, all 24 county
  equivalents, 1,865 county/district/precinct identities, 15 zero-vote
  identities, and 2,058,928 contextual Election Night candidate votes across
  37 candidate labels, including 1,218,709 Obama and 792,564 Romney. iMAP
  exposes 2002, 2011, and 2012 district editions but only 2022 precincts and no
  historical-moment precinct snapshot. The Planning page describes a 2010
  precinct shapefile and does not prove November 2012 applicability. No
  geometry, crosswalk, target polygon, or assigned vote is approved; vintage
  remains unknown and delivery is null. Independent review accepted the
  package on first pass, and its focused suite passes 2/2. A nonblocking note
  remains that the collector decodes the CSV as UTF-8 although the retained
  bytes include CP1252 characters; current identity and count fields are ASCII,
  but future candidate-text use should decode CP1252 explicitly.

- Independent review was completed for all three state packages. Alabama and
  Kansas were initially rejected, corrected, and freshly accepted; Maryland
  was accepted on first review. A fresh read-only shared-integration review
  independently confirmed registry uniqueness, exact 2012 membership, all
  retained artifact hashes, the empty in-progress map, the Wave 7 inventory
  metrics, and the 177-file runner. The requested Luna review runtime was not
  available, so bounded reviews used Terra at high reasoning and no claim was
  made that Luna ran. Cross-state interpretation, integration, delivery
  decisions, and final validation remained with the coordinator.

- The Wave 6 manifest-view clock follow-up is resolved. Manifest listing now
  accepts one optional validation instant and passes that same snapshot to
  registry inspection and every per-manifest inspection. The dedicated
  one-validation-instant regression and the 13/13 manifest-view contract suite
  passed, and fresh independent review accepted the remediation.

- Validation passed at every required gate: the combined Wave 7 focused suite
  passed 10/10; the shared contract, historical inventory, and validation
  suite passed 68/68; and `npm.cmd run typecheck` passed. The official
  `npm.cmd run validate:precinct-geometry` workflow passed in 59.8 seconds,
  validating 174 manifests with zero eligible and 174 blocked plus all four
  year ledgers. The complete 177-file suite passed in 1,382.5 seconds with all
  177 start markers, zero failed assertions, and exactly one required
  `Precinct geometry suite passed (177 files).` terminator. Its 452,152-byte
  evidence log has SHA-256
  `039856c4f946e7debc223a210574247a65d21ea602981c904b1d7c51731c9136`.
  A restricted-sandbox attempt was discarded after Windows denied a nested
  Node process with `EPERM`; the isolated South Dakota replay then passed 2/2
  and the controlled complete run passed outside that restriction. The fixed
  MCP precinct validator passed in 54.181 seconds without warnings and retained
  its audit at
  `.etl/mcp-runs/2026-08-05T03-10-28-632Z-344b6a4d/manifest.json`.

- The advisory-indicator path supports only 2016, 2020, and 2024. No 2012
  review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or production
  mutation, public delivery asset, or Git publication occurred.

### 2026-08-04 - 2012 historical acquisition wave 8 start

- Montana, Ohio, and Oklahoma form the eighth bounded 2012 acquisition wave.
  The durable 2012 ledger records 21 reviewed jurisdictions, three in
  progress, 27 not started, and zero public-eligible. The guarded MCP state
  inventories for all three states passed without warnings or workflow drift
  before state work began.

- Montana has official precinct-result workbooks for 2016, 2020, and 2024 and
  an official State Library historical precinct-geometry archive. Wave work
  will seek the exact 2012 general-election precinct result workbook, the
  contemporaneous archived boundary edition, and an explicit result-to-feature
  key. The archived 2023 geometry and later result identities cannot be
  backcast to November 6, 2012.

- Ohio has an official precinct-canvass workbook pattern, including 8,878
  result identities in 2024, but the reviewed later-year package did not find
  a public statewide or complete 88-county boundary edition. Wave work will
  seek the official 2012 precinct result universe and an election-applicable
  statewide or complete county boundary set with a stable join. Later canvass
  rows and current/advisory map leads cannot establish 2012 applicability.

- Oklahoma has stable official race, county, and precinct extract patterns for
  later elections and a statewide OU/SBE-cooperation precinct service. Wave
  work will test the official 2012 election archive and extract patterns, seek
  a dated 2012 boundary edition or official crosswalk, and preserve any records
  request path. The service's 2022/current-only context cannot be treated as
  the November 2012 boundary edition.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. The coordinator owns the shared registry,
  inventory, runner, documentation, independent review, cross-state
  interpretation, and every delivery decision. No staging, database,
  production, public delivery, or Git publication is authorized. The 2012
  advisory path remains unsupported; no review or indicator rows may be
  fabricated.

### 2026-08-04 - 2012 historical acquisition wave 8 close

- Montana, Ohio, and Oklahoma are now integrated as reviewed, fail-closed
  Wave 8 diagnostics. The canonical registry contains 177 validated manifests,
  all blocked and ineligible. The 2012 inventory contains 24 reviewed
  jurisdictions, 27 not started, zero in progress, 24 blocked, and zero
  public-eligible. The standard runner contains 180 isolated precinct-geometry
  test files.

- Montana retains the official 130,561-byte Secretary of State certified
  canvass PDF with SHA-256
  `428ba0629e7f9fe76d86bf6b6e7a0e920bacb797ede122eed39d5426a9c86e8a`.
  The 28-page canvass covers 56 counties, reports 794 precincts, 681,608
  registered voters, and 491,966 ballots cast, and records 483,932 named
  presidential votes: 201,839 Obama, 14,165 Johnson, and 267,928 Romney.
  The official result application and index remain source leads only: they
  report 794 precincts fully reported but expose county delivery rather than a
  retained statewide precinct-row export. The official State Library historic
  directory produced a TLS certificate-name failure that was not bypassed;
  this is not treated as proof that historical geometry does not exist.
  Later 2021 and 2023 precinct archives are excluded. With no verified 2012
  result identities, election-applicable boundary edition, or crosswalk, all
  public geometry/result/crosswalk metrics remain zero and delivery is null.
  Its focused suite passes 2/2, and independent review accepted it on first
  pass after independently reproducing the source hash, certified context,
  tamper rejection, and fail-closed interpretation.

- Ohio retains a 21,273,277-byte Wayback transport of the official Secretary
  of State original `2012statewidebyprecinct.xlsx`, with SHA-256
  `52b65835251927da8c437f3fe1a7148155c5eb458f462f9ff2f5b0413728a2e4`.
  It establishes exactly 9,230 unique county/precinct contextual identities
  across all 88 counties. Ohio also retains the official 18,918,996-byte
  Census TIGER2012 VTD ZIP with SHA-256
  `965b18cdd76af564f3c1fbfddace9b8fd729ba123cf87113df50f5800ec2ec8a`
  as a candidate layer only. No evidence proves that the VTD layer is the
  November 6 boundary edition or supplies a stable SOS result-to-feature
  crosswalk, so approved features, target result units, relationships,
  assigned votes, and delivery remain zero/null. Independent review rejected
  the first collector because online responses were checked only for a ZIP
  signature. The remediation pins both exact sizes and hashes, holds and
  validates both responses before either raw or derived write, enforces the
  exact 9,230/88 semantics, and behaviorally tests clean acquisition, drift in
  either ZIP-shaped response, tampering of each raw input, and source-ledger
  drift with zero residue or unchanged bytes and timestamps. Fresh review
  accepted the remediation; the focused suite passes 7/7.

- Oklahoma retains four official-source artifacts totaling 282,226 bytes: the
  135,185-byte election index with SHA-256
  `f92e053d81ad1d703e770aa504e2406cde24c21d9e56f462d48536d3f578a2ea`,
  the 1,444-byte results-application shell with SHA-256
  `75a49bddd937caea5d97445b849e81dd107635b4b67cf0e8cc0df8fab5948168`,
  the 137,004-byte records-request page with SHA-256
  `9912a7397cb57bee9178c71660ea2bff0626113c2d9d5e383ec06e8962953f1d`,
  and the 8,593-byte OU/SBE-cooperation layer metadata with SHA-256
  `375026d56335fe578fea6b6a5a6986431e020522e797c8ec0457c6ab5cba4ff4`.
  The official 2012 race, county, and precinct export routes were identified,
  but unauthenticated direct requests returned the official application's
  authorization-denied response. No session token was retained or bypassed,
  and the response is not treated as proof that exports do not exist through
  the application; source metrics therefore remain null. The GIS metadata
  describes a layer last updated in 2022 and downloaded in January 2025, with
  no archive or historic-moment support, so it cannot establish 2012
  applicability. Independent review rejected the first package for four
  missing evidence derivations, missing crosswalk identity/time fields, and a
  source-text-only tamper assertion. The corrected package passes all direct
  validators and behaviorally proves copied raw tampering leaves every derived
  byte and timestamp unchanged. Fresh review accepted it; the focused suite
  passes 3/3. Geometry, result units, crosswalk relationships, assigned votes,
  and delivery remain zero/null.

- Independent state review was completed for all three packages. Montana was
  accepted on first review; Ohio and Oklahoma were rejected, corrected, and
  freshly accepted. A separate read-only shared-integration review confirmed
  177 unique manifests, exact canonical snapshot equality, 24 sorted 2012
  entries, 24 reviewed/27 remaining with no stale in-progress rows, 180 unique
  existing test paths, exact Wave 8 metrics, and all retained raw hashes. The
  requested Luna review runtime was unavailable, so bounded reviews used Terra
  at high reasoning and no claim was made that Luna ran. Cross-state
  interpretation, integration, delivery decisions, and final validation
  remained with the coordinator.

- Validation passed at every required gate: the combined Wave 8 state suite
  passed 12/12; the shared contract, historical inventory, and validation
  suite passed 69/69; and `npm.cmd run typecheck` passed. The official
  `npm.cmd run validate:precinct-geometry` workflow passed in 56.4 seconds,
  validating 177 manifests with zero eligible and 177 blocked plus all four
  year ledgers. The complete 180-file suite passed in 1,479.3 seconds with all
  180 start markers, zero failed assertions, and exactly one required
  `Precinct geometry suite passed (180 files).` terminator. Its 462,502-byte
  evidence log has SHA-256
  `937fe77c099e2a79b933be71c80ad5df74e02ee110f0f4121eab7c0aa1dd5a0f`.
  The fixed MCP precinct validator passed in 59.987 seconds without warnings
  and retained its audit at
  `.etl/mcp-runs/2026-08-05T04-25-08-792Z-cb3b4f48/manifest.json`.

- The advisory-indicator path supports only 2016, 2020, and 2024. No 2012
  review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or production
  mutation, public delivery asset, or Git publication occurred.

### 2026-08-04 - 2012 historical acquisition wave 9 start

- South Carolina, Virginia, and West Virginia form the ninth bounded 2012
  acquisition wave. The durable 2012 ledger records 24 reviewed
  jurisdictions, three in progress, 24 not started, and zero public-eligible.
  The guarded MCP state inventories for all three states passed without
  warnings or workflow drift before state work began.

- South Carolina has an official Election History export path that already
  supplies precinct rows for 2016, 2020, and 2024, plus an official RFA
  statewide precinct-geometry program. Wave work will locate the exact 2012
  presidential export and a contemporaneous boundary edition or official
  crosswalk. The retained January 1, 2025 RFA layer cannot be backcast to
  November 6, 2012.

- Virginia has an official Elections Database 2012 locality baseline and
  official later-year precinct exports. Wave work will seek the complete 2012
  precinct result universe, an election-applicable statewide or complete local
  geometry set, and stable result-to-feature identifiers. Current Fairfax
  geometry and post-election edits cannot establish the 2012 boundary edition.

- West Virginia already retains the official 2012 legacy state/county export
  and an official WVGISTC archive path. Wave work will test the legacy precinct
  export routes, seek an archived 2012 boundary edition, and require an
  official result-label-to-feature key. The August 2024 WVGISTC candidate is
  later-cycle evidence and cannot be treated as November 2012 geometry.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. The coordinator owns the shared registry,
  inventory, runner, documentation, independent review, cross-state
  interpretation, and every delivery decision. No staging, database,
  production, public delivery, or Git publication is authorized. The 2012
  advisory path remains unsupported; no review or indicator rows may be
  fabricated.
### 2026-08-05 - 2012 historical acquisition wave 9 close

- South Carolina, Virginia, and West Virginia are integrated as reviewed,
  fail-closed Wave 9 diagnostics. The canonical registry contains 180 valid
  manifests: 51 each for 2024, 2020, and 2016, plus 27 for 2012. All 180 are
  blocked and ineligible. The 2012 inventory contains 27 reviewed/blocked
  jurisdictions, 24 not started/undecided, zero in progress, and zero
  public-eligible. The standard runner contains 183 unique existing isolated
  precinct-geometry test files.

- South Carolina retains the official 116,772-byte Election Commission
  contest 9112 CSV with SHA-256
  `26d5c6aa23b1f6c259f2178c20114c82027acbb586d487047d99483dff89a33c`.
  It establishes 2,477 unique county-qualified precinct identities across all
  46 counties. Exact named-candidate totals are 1,071,645 Romney, 865,941
  Obama, 16,321 Johnson, 5,446 Stein, and 4,765 Goode, or 1,964,118 votes;
  adding 18,302 over/undervotes yields 1,982,420 ballots. County and precinct
  aggregates exactly reconcile to the state vector. Eighty-four identities
  have zero named-candidate votes and 82 have zero ballots. All 2,477
  crosswalk rows are vote-free, pending, and unmatched with null feature IDs.
  The official 11,884,326-byte RFA ZIP, SHA-256
  `6ee19351a68bd7b5f95045b811540518e30be5b662662c18db5b10cdf2a392d2`,
  is retained only as excluded later-cycle context; it does not establish a
  November 6, 2012 boundary edition or crosswalk. Approved geometry,
  relationships, assigned votes, and delivery remain zero/null. The focused
  suite passes 8/8, and fresh independent state review accepted the package.

- Virginia retains the official 150,738-byte Department of Elections contest
  44930 CSV with SHA-256
  `5a786c318e97f4f63ac8ce43a79f4e60521344728bbde59c3b43f83344765704`.
  It establishes 2,723 unique locality-qualified precinct identities across
  134 localities and 3,858,043 statewide votes. The official 17,594,061-byte
  Census TIGER2012 Virginia VTD ZIP, SHA-256
  `1e7ee39bbde8c67d64d81f501aa262719c04868fedb7fa05f08fc58f12882d6e`,
  is retained as a candidate only. No source proves its November 6
  election-date applicability, equivalence to Virginia result precincts, or a
  stable result-to-feature crosswalk. Approved geometry, target result units,
  relationships, assigned votes, and delivery remain zero/null. Independent
  review rejected the first package because media types were not pinned. The
  corrected collector validates `text/csv` and `application/zip` across live,
  injected, and offline paths and behaviorally rejects wrong media with zero
  residue. The focused suite passes 7/7, and fresh review accepted it.

- West Virginia retains 58 hash-pinned official inputs totaling 29,156,779
  bytes: the Secretary of State download index, state/county results, all 55
  county precinct exports, and the Census TIGER2012 VTD ZIP. Its 34,700-byte
  raw ledger has SHA-256
  `b9f49e96662fd4371a739f4fe187a914a9be26b4a293bb531c76c3ef7dfc8712`.
  The 9,230 official President candidate rows establish 1,846 unique
  county-qualified precinct identities across all 55 counties, five named
  candidates per identity, and zero zero-vote identities. Exact totals are
  417,655 Romney, 238,269 Obama, 6,302 Johnson, 4,406 Stein, and 3,806 Randall
  Terry, or 670,438 named-candidate votes. All 275 county/candidate context
  rows reconcile exactly, with delta zero; the official no-write-in caveat is
  preserved. The Census ZIP contains 1,856 candidate VTD features, but its
  election applicability and SOS result-to-feature relationship are unproven.
  All 1,846 crosswalk rows are vote-free, pending, and unmatched with null
  feature IDs. Approved geometry, relationships, assigned votes, and delivery
  remain zero/null. A coordinator validation caught invalid enum labels before
  integration; remediation used the contract-valid
  `normalized_name_candidate`/`low` values and regenerated the hash chain. The
  focused suite passes 4/4, and fresh independent review accepted the complete
  58-input package.

- Independent state review accepted all three corrected packages. A separate
  read-only shared-integration review independently rehashed every retained
  Wave 9 source, verified manifest/evidence/ledger/normalized/crosswalk chains,
  recursively confirmed vote-free crosswalks, compared the registry objects
  to all three canonical manifests, and returned ACCEPT with no architectural
  or cross-state concern. It confirmed registry SHA-256
  `971811e08619db5a45c7e44b16686612e9c94a95a79870ff7ac1b5962c94b693`,
  2012 inventory SHA-256
  `675eb9b7a766cea4323d6bf7cb60feb2d0595a66347b0c9395a9d4aafac98564`,
  and runner SHA-256
  `1beffd972aab978aa7d225c4e381ac6446672991d84c8387bcfa19666454f211`.
  The requested Luna review runtime was unavailable, so bounded reviews used
  Terra at high reasoning and no claim was made that Luna ran. Cross-state
  interpretation, integration, and delivery decisions remained with the
  coordinator.

- Validation passed at every required gate: the combined Wave 9 state suite
  passed 19/19; the shared contract, historical inventory, and validation
  suite passed 70/70; `npm.cmd run typecheck` passed; and the official
  `npm.cmd run validate:precinct-geometry` workflow passed in 60.3 seconds,
  validating 180 manifests with zero eligible and 180 blocked plus all four
  year ledgers. The first long-suite attempt reached Massachusetts 2012 before
  Windows returned a transient `UNKNOWN` file-open error. Canonical hashes
  remained unchanged, Massachusetts immediately passed 4/4 in isolation, and
  no code or data remediation was warranted. A fresh uninterrupted 183-file
  suite then passed in 1,501.4 seconds with all 183 start markers, zero
  `not ok` or nonzero-fail lines, and exactly one required
  `Precinct geometry suite passed (183 files).` terminator. Its 128,449-byte
  stdout evidence log has SHA-256
  `4654a9f5abc5eebb7df30015841d25c00e539852acfbe0a901d27e0142375861`;
  the superseded transient-attempt log is retained separately under `.etl`.
  The fixed MCP precinct validator passed in 56.655 seconds without warnings
  and retained its audit at
  `.etl/mcp-runs/2026-08-05T06-39-12-690Z-45d3fa1c/manifest.json`.

- The advisory-indicator path supports only 2016, 2020, and 2024. No 2012
  review rows, calculated indicators, flagged jurisdictions or areas, or
  indicator types were fabricated. No staging artifact, database or
  production mutation, public delivery asset, or Git publication occurred.
### 2026-08-05 - 2012 historical acquisition wave 10 start

- Colorado, New Mexico, and Nevada form the tenth bounded 2012 acquisition
  wave. The accepted checkpoint is 180 valid blocked manifests, including 27
  reviewed/blocked 2012 jurisdictions. The durable 2012 ledger now records 27
  reviewed, three in progress, 21 not started, and zero public-eligible.

- Colorado has an official Secretary of State Historical Election Data system,
  county election-office directories, and state/county GIS leads. Its reviewed
  2016/2020 diagnostics provide source-handling patterns but cannot establish
  2012. Wave work will seek the exact 2012 presidential precinct result
  universe, a complete election-applicable boundary edition, and an
  authority-documented result-to-feature key; county turnout IDs, current
  layers, or later election products will remain context only.

- New Mexico has official archived election-result services, an SOS Elections
  Database, and an official GIS Voting District Data Archive. Wave work will
  identify and pin the exact 2012 general-election precinct result endpoint and
  contemporaneous GIS archive, then test county/precinct identifiers without
  backcasting the reviewed 2016, 2020, or 2024 products.

- Nevada administers precinct data through the Secretary of State and 17 county
  election offices. Official Clark, Washoe, Humboldt, state-result, and county
  GIS/archive leads are retained from later-year review, but none may silently
  substitute for complete 2012 statewide coverage. Wave work will seek the
  official 2012 result universe and election-applicable county boundary set,
  explicitly inventory missing counties, and require stable parent-qualified
  result-to-feature identities before any delivery decision.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. The coordinator owns the shared registry,
  inventory, runner, documentation, independent review, cross-state
  interpretation, and every delivery decision. No staging, database,
  production, public delivery, or Git publication is authorized. The 2012
  advisory path remains unsupported; no review or indicator rows may be
  fabricated.

### 2026-08-05 - 2012 historical acquisition wave 10 close

- Colorado, New Mexico, and Nevada completed the tenth bounded 2012
  acquisition wave. The registry now contains 183 manifests: 51 each for
  2024, 2020, and 2016, plus 30 for 2012. All 183 remain blocked and
  ineligible. The 2012 ledger contains 30 reviewed/blocked jurisdictions,
  21 not-started/undecided jurisdictions, no in-progress work, and no
  publicly eligible delivery.
- Colorado retains the official Secretary of State contest 5017 CSV from
  `https://historicalelectiondata.coloradosos.gov/api/download_contest/5017_list.csv?split_party=false`:
  9,448,139 bytes, SHA-256
  `b709f7459a70b8f27949362ee4f7e0bb7e9aeded26061d94a8a670d6490e6440`.
  It establishes 55,765 precinct candidate rows, 2,935 source IDs, 2,916
  display names, 19 candidates, 7,708,566 named-candidate votes, 24
  zero-named-candidate-vote precinct IDs, and 1,216 county candidate rows
  across 64 county contexts. The precinct rows contain no county-parent
  field, and no complete election-applicable 2012 boundary edition, stable
  feature join, or official crosswalk is retained. The package therefore
  promotes zero target result units, features, relationships, or votes.
  Source evidence is 6,012 bytes with SHA-256
  `635a6d8030c161e3455c66b6126549fea3642166a07cdbdbaf440344063b7990`;
  the manifest is 4,177 bytes with SHA-256
  `3ade35098b1bd98b642ced49ad69315b86295da598d23f1f7306e652dc8925c9`.
- New Mexico retains the official Secretary of State 2012 archive page
  (112,812 bytes, SHA-256
  `7a58a77d09fdad2a0bb506e56448986fa3d0bc4bf654391d8c9c8943a01b3fc1`),
  its linked 13-page statewide/county certified-results PDF (146,207 bytes,
  SHA-256
  `9fcad21d4f4a38de359f6ff9931511700aed9797ecb1e80315b0fc0a34ad523d`),
  the official GIS voting-district archive page (109,599 bytes, SHA-256
  `f516f678a2651f04474dbfc83f58d0213e2b3cf8c6b000bc8f53e79a2df253bb`),
  and a 33-parent Census county-context artifact (4,612 bytes, SHA-256
  `112a82f40d01dcec1ff94d52788d008d8bd0452d836bfe4d97ae10e672930d4e`).
  The official archive does not expose a 2012 presidential precinct export,
  and the GIS archive does not prove a November 6 boundary edition or
  crosswalk. No precinct identities, features, relationships, or votes are
  invented. Source evidence is 7,076 bytes with SHA-256
  `82628a18c9ce906c92c653924d63a867fa970a7dab84fafed41ff88f66bb6937`.
- Nevada retains a 32,694-byte SOS-attributed archival presentation of the
  original Silver State Election results page, SHA-256
  `f7109d7b69f3b3970cb42b9f0b33747fe00ab6d9270386cd2453850ab18ddb5b`.
  The retained byte artifact is hosted by the American Presidency Project
  rather than NVSOS, so the evidence records the original official URL and
  medium-confidence archival caveat. Direct text-layer validation proves a
  complete 17-county-equivalent by five-candidate table: Obama 531,373,
  Romney 463,567, Johnson 10,968, None 5,770, and Goode 3,240, totaling
  1,014,918 with zero reconciliation delta and 100 percent precinct
  reporting context. It does not provide a precinct candidate-result
  universe. All 17 counties therefore have retained county result context,
  while all 17 remain unsupported for 2012 geometry and crosswalk delivery.
  Source evidence is 10,598 bytes with SHA-256
  `89cd4aed2d8291f9ba34c808a682f43f1c03887b1eeda43640a458fbd83caee5`;
  the corrected manifest is 4,456 bytes with SHA-256
  `d2a0c06d5d1e4f9e94c48f4624bcb7b09092ce521d77910bab4912e1fc79396b`.
- Independent state review accepted Colorado and New Mexico without
  substantive discrepancies. Nevada's first review rejected an inaccurate
  claim that no county candidate table was retained. The collector and
  package were corrected to parse and reconcile all 17 county rows before
  any derived write, separate result-context coverage from geometry and
  crosswalk coverage, and update the deterministic/tamper tests. A fresh
  disk-based re-review then accepted Nevada. The requested Luna review
  runtime was unavailable; the independent reviews used the available
  Terra/high runtime and make no Luna claim.
- All three manifests remain `validation.status: "blocked"` with
  `delivery: null`. Normalized geometry and crosswalk derivatives are
  recursively vote-free. No current, later-cycle, partial-county, Census,
  label, count, or spatial relationship is backcast as 2012 election
  geometry. The advisory-indicator path supports only 2016, 2020, and 2024,
  so Wave 10 creates zero review rows, calculated indicators, flagged
  jurisdictions/areas, or indicator types.
- The combined Wave 10 and shared contract run passed 75 tests with zero
  failures, and `npm run typecheck` passed. The final guarded
  `precinct-geometry` validator passed all three fixed stages with no
  warnings in 56,256 ms; audit:
  `.etl/mcp-runs/2026-08-05T07-47-13-882Z-3013d2c3/manifest.json`.
  The uninterrupted full suite passed all 186 listed files in 1,527.8
  seconds with 186 start markers, zero `not ok` markers, zero nonzero
  failure summaries, and one terminator. Its stdout log is 130,034 bytes,
  SHA-256
  `d3e1df3dbea4bfc002d01db1a4eb480891f31049b9b5bc95d00558682a02ffd6`;
  stderr is 104,580 bytes, SHA-256
  `9c206bb4e08a245f633dea058b25cc2f14e9b7c1cceaa38d2eaf1ca025a78c09`.
- Integrated shared-file hashes before this documentation-only append are:
  registry
  `61c5114c590ad19bd3f9fcbaf1c30a24ddcf14d16c93179b3c1606e535b41e26`,
  2012 inventory
  `9f311ca7b9c7ee9619f8a218d99d8b5f17bcaee45ae1156a59b38902220d85ff`,
  suite runner
  `610fde1d8a9cc6a0fa80757157607530d33c0e1a54984d14f0d7d792b70fc0cc`,
  contract test
  `2dea037503b849743c6156b723b6f56a2b6ca0489663c19fdf06a8c76c06545b`,
  validation test
  `eac6c373f6860e9e36b4a5358769f8f7d5b902ba724a5729d9095e27939823d4`,
  and historical-ledger test
  `8cb80be0c6ae627057929c4bc18502a7f9b3d2e00e183f9e282c16b07593e3d3`.
  No staging import, database mutation, production promotion, public
  delivery, or Git publication was performed.

### 2026-08-05 - 2012 historical acquisition wave 11 start

- Illinois, Maine, and New Hampshire form the eleventh bounded 2012
  acquisition wave. The durable ledger now records 30 reviewed/blocked,
  three in-progress, and 18 not-started jurisdictions. Disposition totals
  remain 30 blocked, 21 undecided, and zero publicly eligible.
- Illinois has official historical vote-total routes and an official
  precinct-maps program. Wave work will seek the exact 2012 presidential
  precinct result universe, a complete election-applicable boundary set,
  stable parent-qualified identities, and an authoritative crosswalk.
  Current precinct maps or later election files cannot establish the
  November 6, 2012 boundary vintage.
- Maine publishes official previous-election results, commonly at
  municipality or local reporting-unit grain. Wave work will preserve the
  source-native 2012 presidential grain and seek matching election-date
  geography without treating municipality polygons as precincts or
  inventing local subdivisions.
- New Hampshire publishes official town/ward election results and current
  town/ward geography leads. Wave work will seek the exact 2012 workbook
  or report universe and a dated election-applicable town/ward boundary
  edition with stable identity and parent semantics. Current or 2022
  districting material will not be backcast to 2012.
- Each state remains isolated to its own package, collector, and focused
  test until independent review. Retained artifacts must carry authority,
  URL, local path, year, reporting grain, parser, expected counts/totals,
  byte count, SHA-256, and caveats. Online/injected inputs must be
  validated before writes; derivatives and crosswalks must remain
  recursively vote-free. Incomplete source or county/local coverage must
  fail closed with delivery null.
- No staging import, database mutation, production promotion, public
  delivery, or Git publication is authorized. The 2012 advisory-indicator
  path is unsupported and must remain zero rather than being fabricated.

### 2026-08-05 - 2012 historical acquisition wave 11 close

- Illinois, Maine, and New Hampshire completed the eleventh bounded 2012
  acquisition wave. The registry now contains 186 manifests: 51 each for
  2024, 2020, and 2016, plus 33 for 2012. All 186 remain blocked and
  ineligible. The 2012 ledger contains 33 reviewed/blocked jurisdictions,
  18 not-started/undecided jurisdictions, no in-progress work, and no
  publicly eligible delivery.

- Illinois retains the official Illinois State Board of Elections
  `GE2012Cty.xls` workbook from
  `https://www.elections.il.gov/Downloads/ElectionOperations/VoteTotals/GE2012Cty.xls`:
  803,840 bytes, SHA-256
  `81d116baf4755bda35ce58211e6f6946340319db4806d3d95ff5fb90e21ff433`.
  It establishes 1,886 President candidate/county rows across all 102
  counties and exactly reconciles 5,242,014 votes: 3,019,512 Obama,
  2,135,216 Romney, 56,229 Johnson, 30,222 Stein, and 835 votes across 25
  candidate IDs lacking a party abbreviation. It does not contain a precinct result universe,
  parent-qualified precinct identities, an election-applicable boundary
  edition, or an official crosswalk. Result context is therefore 102/102
  counties while geometry and crosswalk coverage are 0/102; approved target
  result units, features, relationships, assigned votes, and delivery remain
  zero/null. Source evidence is 3,867 bytes with SHA-256
  `73ef2e542c2da1c87de932945464114b014e83cc44fe1137e87e488ea5398709`;
  the manifest is 3,744 bytes with SHA-256
  `a189df0cb112b36548230290b481517653628279b847a5942ed67b72290043db`.

- Maine retains two official Secretary of State workbooks: the 119,808-byte
  municipal file, SHA-256
  `991dbda07568d45ddb3841550c5bc0ce9217c398651384b36fdc7c9a0e5e6d3c`,
  and the 77,312-byte county file, SHA-256
  `9042744a64198e991c7d18fff4d4ba66d0e19ba9010c9626b1c5b8c7b35a9c14`.
  The municipal workbook establishes 545 unique source-native local
  reporting identities under 16 county parents; one State UOCAVA identity is
  retained for reconciliation but excluded from geometry correspondence.
  The municipal/local-plus-UOCAVA vector reconciles exactly to the 16 county
  subtotals and statewide vector `[9352, 401306, 292276, 8119, 62, 2035,
  30, 11578]`. All 545 crosswalk rows remain vote-free and
  reviewed-unmatched. No municipality, plantation, township, or voting-district label
  is silently relabeled as a precinct, and no current polygon is backcast.
  Approved features, relationships, vote assignments, and delivery remain
  zero/null. The retention ledger is 3,167 bytes with SHA-256
  `e957d29a0bfd867e708860088d77756941c0be76fc8680a8c741085c78a1a9ef`;
  source evidence is 5,327 bytes with SHA-256
  `38b9559f2b661b5c778975362661053216140c7470619ae5a9442940e659031d`;
  the manifest is 3,572 bytes with SHA-256
  `3d04db97219cb0248005a9b01b0f53e6698a54eeef995b42d4594c698101d6f6`.

- New Hampshire retains a one-page, 27,593-byte PDF hosted by The American
  Presidency Project at UC Santa Barbara, SHA-256
  `3078233792059b47ee0761c4754257c777018c68e5a97cb4791a4b052c945e70`.
  The document is attributed to the New Hampshire Secretary of State, but no
  official-host URL, custody proof, or explicit reuse license is retained.
  It is therefore recorded at source tier `unknown` and used only as
  supplemental context, not as a replacement for an official certified
  source. Its parsed content contains all ten county summaries but detailed
  local rows only for Belknap: 16 town/city-ward units, including six Laconia
  wards. Belknap totals are 17,571 Romney, 15,890 Obama, 276 Johnson, 27
  Goode, 72 Ron Paul write-in, 15 Jill Stein write-in, and 36 scatter:
  33,851 named-candidate votes or 33,887 including scatter. The other nine
  counties lack local detail, and no dated complete town/ward geometry or
  official crosswalk is retained. Target result units, features,
  relationships, assigned votes, and delivery remain zero/null. Source
  evidence is 4,950 bytes with SHA-256
  `981f3ddb2a60a18a6688bf0ffb32307cd5647efe5eeff9d42adfcee3f5532992`;
  the manifest is 3,928 bytes with SHA-256
  `7a4c94c14e1b0241b0035dee222ca5852b3eacffb97e35c1aff5b0a97354188e`.

- Integration validation caught a missing nonempty `source.licenseOrTerms`
  field in the first Illinois and New Hampshire manifests. Both source
  evidence/manifest pairs were corrected and their tests now require exact
  terms agreement. Independent review then rejected two remaining closeout
  defects: New Hampshire was incorrectly described as an official-hosted
  tier-1 source, and Maine's offline replay test lacked a before/after byte
  snapshot. The New Hampshire authority, terms, caveats, inventory source
  tier, and source leads were corrected to the secondary-archive facts. The
  Maine test now snapshots all six replay-produced artifacts and requires
  byte-for-byte equality. A fresh independent review rehashed the guarded
  80-file scope, verified both remediations, and returned ACCEPT with no new
  discrepancy. The requested Luna runtime was unavailable, so bounded review
  used Terra/high and no Luna claim is made; cross-state and delivery
  judgments remained with the coordinator.

- The final focused state/shared integration suite passed 76/76 tests with
  zero failures. Its 40,760-byte stdout log has SHA-256
  `ee081efc79bf759aace26ae3bde5de9d15f30b4087121c2ef361f7742769bc91`;
  stderr is empty. Typecheck passed. The final uninterrupted full suite was
  rerun through a `cmd` wrapper that preserves the real Node exit code and
  exited zero after all 189 listed files. It has 189 start markers, zero
  `not ok` markers, zero nonzero failure summaries, and exactly one
  `Precinct geometry suite passed (189 files).` terminator. Its 131,552-byte
  stdout log has SHA-256
  `148d9fc38623f089b516a5708dfa6f40c6ec4f738bbbf37dded87a9d1b8311d5`;
  its 106,328-byte warning-only stderr log has SHA-256
  `b89e18649c1bbacae218b212f8fc4de448db0c41de37f1984d62cd87de3c28ae`.
  A prior complete 189-file pass is retained separately because its
  PowerShell-hosted outer tool result was ambiguous despite reaching the
  runner's success branch; only the explicit exit-zero rerun is used as
  final evidence.

- The final guarded MCP `precinct-geometry` validator passed all three fixed
  provenance, manifest, and coverage stages with no warnings in 57,296 ms;
  audit:
  `.etl/mcp-runs/2026-08-05T09-55-00-957Z-a39eaa96/manifest.json`.
  Integrated shared-file hashes before this documentation-only close are:
  registry
  `580fa2e31f4db5a49129cf983ac04be3e0f1db45406bc24a7039c373046ac7d0`,
  2012 inventory
  `1e843286db77488ff665ef9a457cabde2c318f9b093ece1644c20c054eee2d08`,
  suite runner
  `989664e8becf4c97913215817b5e367ad46439b6cbe19fb6dae1072e364a9db6`,
  geography-contract test
  `79bae8b561a3987107c31b028c741191fc0fd642af17f917659fb697a06c4cc6`,
  validation test
  `708db1ce1eaecf8e2210501232b426d6a06001f0857a449e85e13f97975de7ef`,
  and historical-ledger test
  `88cfe3c8a6b520951944eb76ec20aefbb68baa67399f1ff89fc0a192d1c31f3f`.

- All three manifests remain `validation.status: "blocked"` with
  `delivery: null`, and all normalized/crosswalk derivatives are recursively
  vote-free. The advisory-indicator path supports only 2016, 2020, and 2024,
  so Wave 11 creates zero review rows, calculated indicators, flagged
  jurisdictions/areas, or indicator types. No staging import, database
  mutation, production promotion, public delivery, or Git publication was
  performed.

### 2026-08-05 - 2012 historical acquisition wave 12 start

- North Dakota, Vermont, and Wyoming form the twelfth bounded 2012
  acquisition wave. The accepted checkpoint is 186 valid blocked manifests,
  including 33 reviewed/blocked 2012 jurisdictions. The durable 2012 ledger
  now records 33 reviewed, three in progress, 15 not started, 33 blocked,
  18 undecided, and zero publicly eligible.

- North Dakota's reviewed 2016 package establishes a reusable official SOS
  ResultsAjax archive pattern with county-qualified precinct identities. Wave
  work will identify the exact 2012 election and presidential contest IDs,
  retain the complete official response set and reconciliation context, and
  separately seek an election-applicable boundary edition and authoritative
  result-to-feature crosswalk. Current NDGIS precinct layers cannot be
  backcast to November 6, 2012.

- Vermont's official Election Results Archive and VCGI metadata provide
  result and boundary-discovery paths. Wave work will locate and pin the exact
  2012 President local-result export, preserve municipality and Ward/Pct
  identities without collapsing split reporting units, and evaluate any dated
  VCGI boundary candidate against election-date applicability. A town polygon
  cannot silently represent ward or precinct rows without an official
  relationship.

- Wyoming already has a hash-retained official 2012 General Election Results
  ZIP in the state ETL source set. Wave work will verify its county
  precinct-by-precinct workbook universe, preserve county-qualified result
  identities, seek the matching official districts-and-precinct publication
  and boundary edition, and require a stable result-to-feature relationship.
  The reviewed 2016, 2020, and 2024 packages are patterns and context only;
  none may establish 2012 geometry.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. Each must retain authority, URL, local path,
  year, reporting grain, parser, expected counts/totals, byte count, SHA-256,
  terms, caveats, and deterministic replay evidence; injected/live inputs
  must be rejected before derived writes. The coordinator owns shared
  registry, ledger, runner, documentation, cross-state interpretation,
  independent review, and every delivery decision.

- No staging import, database mutation, production promotion, public
  delivery, or Git publication is authorized. The 2012 advisory-indicator
  path is unsupported and must remain zero rather than being fabricated.

### 2026-08-05 - 2012 historical acquisition wave 12 close

- North Dakota, Vermont, and Wyoming completed the twelfth bounded 2012
  acquisition wave. The registry now contains 189 manifests: 51 each for
  2024, 2020, and 2016, plus 36 for 2012. All 189 remain blocked and
  ineligible. The 2012 ledger contains 36 reviewed/blocked jurisdictions,
  15 not-started/undecided jurisdictions, no in-progress work, and no
  publicly eligible delivery.

- North Dakota retains 110 exact artifacts totaling 2,561,859 bytes. The
  221,423-byte source ledger has SHA-256
  `4bad655a07ba6ada7a0d4a779bfcbf88a3c10b2c08bb0cb601ed45905a64a24e`,
  and the 225,411-byte source-evidence record has SHA-256
  `761d7c14637eaec7e742d69b08b882bb3c23e39fc2d74c7bab492125bc5dba5a`.
  Election 35 / President race 4949 / office sequence 100 contains 2,556
  candidate rows, 426 county-qualified result identities across all 53
  counties, and 322,627 votes. U.S. Senate race 5002 / sequence 110 contains
  1,278 rows, the same 426 identities, and 320,851 votes. The official archive
  reports 426 fully reported precincts, zero partial or unreported precincts,
  turnout of 325,564, and 532,776 eligible voters. SOS county selectors are
  not interpreted as FIPS; exact county names resolve to 53 Census parent
  GEOIDs. The current `BuildCountyMap.js` is explicitly 2026 context and is
  not backcast. No election-applicable 2012 precinct polygons, stable shared
  feature IDs, or official crosswalk were proven, so all 426 result units
  remain reviewed-unmatched and vote-free. The 4,617-byte blocked manifest
  has SHA-256
  `34de3c298c6daa69cef5c1607eb533dbbaca7d354b065280421301985d526239`.

- Vermont retains the exact official Election Results Archive export for
  Election 68979 at precinct grain (11,792 bytes, SHA-256
  `94c33985ed745d3e7e2665be89d4da284c2ff515366b5768707d34811d7291e2`),
  the municipality export (9,836 bytes, SHA-256
  `8ab8195baac776d33b2f2574602303e3f1bf55c483604ded5c42d540a25ca886`),
  the pinned election detail page (346,242 bytes, SHA-256
  `1195bc8df7da03a4a6fc8229130611ba043d8a3e9214215ecd805c4614698c97`),
  general 2012 archive-search context (2,253,385 bytes, SHA-256
  `30cfc751d02e45e09288e3246ceaf4a0b94dd45bf2afd432188217f2cca0d111`),
  and VCGI BNDHASH metadata (93,814 bytes, SHA-256
  `4c054514e543fc6a83ae617b168fa495c3bc5b7f5c1e1288a28dabe1eacf6ea9`).
  The precinct export establishes 275 mixed municipality/Ward/Pct identities:
  47 Ward/Pct rows and 228 municipality-only rows, with no county field or
  stable geometry key. Both row-level exports total 299,290 candidate votes:
  Obama 199,239, Romney 92,698, Johnson 3,487, Anderson 1,128, Lindsay 695,
  and write-ins 2,043. Adding 1,400 blanks and 495 spoiled ballots yields
  301,185 ballots cast. A structured official-source conflict remains
  unresolved: both exports total Gary Johnson at 3,487, while the pinned
  Election 68979 detail page reports 3,483, a four-vote delta. Its status is
  `unresolved_official_source_presentation_conflict`, its disposition is
  `delivery_blocked_no_silent_resolution`, and resolution is null. The search
  page is general context only and is not conflict evidence. VCGI BNDHASH is
  general-mapping, non-legally-definitive context and cannot represent the
  split result units. All 275 identities therefore remain reviewed-unmatched,
  vote-free, and blocked. The 8,014-byte source evidence has SHA-256
  `08463c960df68684ff5c2f77af123c8ae8234ca748578e379405899383772877`;
  the 4,673-byte manifest has SHA-256
  `b83372e16cdfcc3e08bfabff8d5694e8d58b4098b4dffe491361f7f0b8c52ee2`.

- Wyoming retains the official 19,347,818-byte General Election Results ZIP,
  SHA-256
  `bec0b1585468cca23057531f2fff4a5384d33f66e25fd740e08e4972c54200a1`,
  plus the official results page, election-information page, and 947,114-byte
  districts-and-precincts PDF, SHA-256
  `a392f29ac98bb6f37fead748ebeb5d1a57a6fd46ed2f510d7c91e70c6657908e`.
  The ZIP contains 23 precinct-by-precinct and 23 total-by-county workbooks
  and establishes 482 unique county-qualified precinct identities with no
  zero-vote unit. Candidate totals are Obama 69,286, Romney 170,962, Goode
  1,452, Johnson 5,326, and write-ins 2,035, or 249,061 candidate votes.
  Adding 273 overvotes and 1,367 undervotes exactly reconciles to 250,701
  ballots cast. The PDF is a tabular count publication, not an image boundary
  map or GIS: it supplies no coordinates, CRS, georeferencing, boundary
  labels, feature schema, or topology. It was therefore not digitized, and no
  control points, RMSE, label review, or topology review is claimed. All 482
  result identities remain reviewed-unmatched and vote-free. The 12,518-byte
  source evidence has SHA-256
  `83e3f088a38a557de153b98be17af3715b13d4bc9f60733038d6caae8dbb1d99`;
  the 4,022-byte manifest has SHA-256
  `73d6e6858d60ffe8d7f7422fb1408be52dddcf5652b69982827d650562ca98d1`.
  At independent review, the current official ZIP and PDF still matched the
  retained bytes while both SOS HTML templates had changed bytes; the
  collector correctly rejects status, media, or byte drift before any write.

- Independent state review required substantive fail-closed corrections in
  all three packages. North Dakota's initial draft failed the canonical
  manifest contract, used a noncanonical crosswalk, under-specified the
  retention ledger and dashboard evidence, mislabeled current map context,
  and lacked sufficient drift/tamper coverage. The rebuilt package now pins
  every response and semantic total, resolves parents without treating
  selectors as FIPS, has canonical reviewed-unmatched rows, and passed fresh
  review. Vermont's first review rejected wording that conflated the detail
  and search pages and a conflict represented only in prose; the package now
  records the exact structured four-vote conflict and its blocking
  disposition. Wyoming's first review rejected unpinned response status and
  media metadata; the collector now fetches and validates all four official
  responses before the first write and rejects status/media drift. Fresh
  independent re-reviews returned ACCEPT for each state. The shared
  integration also received an independent read-only ACCEPT after verifying
  the exact guarded patch, canonical hashes, registry/ledger counts, state
  metrics, Vermont conflict, and 192 unique existing runner paths. The
  requested Luna runtime was unavailable, so bounded reviews used the
  available Terra/high runtime and make no Luna claim; cross-state and
  delivery judgments remained with the coordinator.

- The exact shared integration delta is retained at
  `.etl/wave12-integration-backup/wave12-integration.patch`: 38,696 bytes,
  SHA-256
  `c253afb0dbe0897c6d88e3a125fb10ee29dcb705931754f818e404b33e910189`.
  It passed `git apply --check`; every canonical file then byte-matched its
  reviewed guarded after-copy. Integrated shared-file hashes before this
  documentation-only close are: registry
  `63bce7669f7c09741a46b5bed3f1520a8a64c0ed0bae2365b7ec3ce6d41a6df2`,
  2012 inventory
  `3f8267bfb746c6faf6d944daff5f8ebf10b003f7c61aaf116b83148bba63423c`,
  suite runner
  `850eb58fe559f5d3d987f092764875441bed130cd1818a4c762ce57d675603bd`,
  geography-contract test
  `53e78053dbb1a6b4303f702f8ce90e4d78868d11d088ab7242dc46d2ddc0b702`,
  validation test
  `b61e31d7aa08f35454c8a8d832555dbc236d9b56d58616c2da24355004f3716c`,
  and historical-ledger test
  `7e9f677089b247c05b0019d2592a4754d9fdd626e9d05727cfc3ceb6e9635c10`.

- The final focused state/shared integration run passed 108/108 tests with
  zero failures. Its 27,820-byte stdout log has SHA-256
  `4dcaa806e9cfcade25e90b8365b22d8b966f26a847cdd4616d444cb8a8f9ce84`;
  stderr is empty. `npm run typecheck` passed. The guarded MCP
  `precinct-geometry` validator passed all three fixed provenance, manifest,
  and coverage stages with no warnings in 56,220 ms; audit:
  `.etl/mcp-runs/2026-08-05T11-07-54-786Z-f6cb45fd/manifest.json`.

- The final uninterrupted `cmd`-wrapped full suite exited zero after all 192
  listed files in 1,607.5 seconds. It has 192 start markers, zero `not ok`
  markers, zero nonzero failure summaries, and exactly one
  `Precinct geometry suite passed (192 files).` terminator. Its 133,854-byte
  stdout log has SHA-256
  `c2bfa9038a5e4811949a61f3837430ddb83db9cf4096b26bb08ed7346ea8f01e`;
  its 108,026-byte warning-only stderr log has SHA-256
  `061463fdfc3021554297ac0049ceac944090b0ebda32f333b40672e49c2ac28d`.

- All three manifests remain `validation.status: "blocked"` with
  `delivery: null`, zero normalized features, and recursively vote-free
  normalized/crosswalk derivatives. The advisory-indicator path supports only
  2016, 2020, and 2024, so Wave 12 creates zero review rows, calculated
  indicators, flagged jurisdictions/areas, or indicator types. No staging
  import, database mutation, production promotion, public delivery, or Git
  publication was performed.

### 2026-08-05 - 2012 historical acquisition wave 13 start

- Arkansas, Georgia, and Louisiana form the thirteenth bounded 2012
  acquisition wave. The accepted checkpoint is 189 valid blocked manifests,
  including 36 reviewed/blocked 2012 jurisdictions. The durable 2012 ledger
  now records 36 reviewed, three in progress, 12 not started, 36 blocked,
  15 undecided, and zero publicly eligible.

- Arkansas has an official Secretary of State TotalResults election-list
  entry for 2012 (election ID 1832), but prior historical-baseline work records
  that the official contest payload was empty/non-official in that pass and
  used a secondary county table only as caveated context. Wave work must
  re-probe and pin the official 2012 archive response, establish whatever
  local result identities it actually exposes, and keep any secondary table
  supplemental. The current Arkansas GIS precinct layer and its 2,926
  features cannot establish November 6, 2012 boundaries or an official
  result-to-feature relationship.

- Georgia already retains the official SOS
  `export-2012NovGen.json` media export as county historical context. Wave work
  will inspect the complete export structure rather than assuming the selected
  county contest options exhaust the archive, pin the exact presidential
  result universe and reconciliation totals, and seek an official statewide
  or complete county boundary edition applicable to November 6, 2012. Current
  or later-cycle precinct layers, recount tables, and county-only rows cannot
  be silently promoted to 2012 precinct geometry.

- Louisiana has reusable official SOS static result endpoints and official
  Legislature redistricting-data archives, but the current state inventory
  explicitly leaves 2012 historical results uncollected. Wave work will locate
  and pin the exact 2012 presidential parish/ward/precinct result universe,
  preserve non-geographic vote-mode rows separately, seek a dated complete
  election-applicable boundary package, and require an authority-documented
  Parish/Ward/Precinct-to-feature relationship. The December 31, 2024 VTD
  package and 2016/2020 parish baselines are patterns and context only, not
  evidence of the 2012 boundary vintage.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. Each must retain authority, URL, local path,
  election year, reporting grain, parser, expected counts/totals, byte count,
  SHA-256, terms, caveats, and deterministic replay evidence. Official sources
  take priority; supplemental sources must be explicit. Injected/live inputs
  must be validated before derived writes, derivatives must remain recursively
  vote-free unless a reviewed delivery contract explicitly permits otherwise,
  and incomplete statewide or county/local coverage must fail closed. The
  coordinator owns shared registry, ledger, runner, documentation,
  cross-state interpretation, independent review, and delivery decisions.

- No staging import, database mutation, production promotion, public
  delivery, or Git publication is authorized. The 2012 advisory-indicator
  path remains unsupported and must stay zero rather than being fabricated.

### 2026-08-05 - 2012 historical acquisition wave 13 close

- Arkansas, Georgia, and Louisiana completed the thirteenth bounded 2012
  acquisition wave. The registry now contains 192 manifests: 51 each for
  2024, 2020, and 2016, plus 39 for 2012. All 192 remain blocked and
  ineligible. The 2012 ledger contains 39 reviewed/blocked jurisdictions,
  12 not-started/undecided jurisdictions, no in-progress work, and no
  publicly eligible delivery. The remaining queue is AK, CT, ID, KY, MO, MS,
  NE, NJ, NY, OR, SD, and TN.

- Arkansas retains five official artifacts totaling 150,995 bytes. The
  1,964-byte response-metadata record has SHA-256
  `935d59ebcedfd476c3b47d3d0f1972d28f859ef52681b54e405eedb9af6d53b6`,
  and the 7,402-byte source ledger has SHA-256
  `620e123c1cce765e2f6270f0d4ffc60627d6d3c5fa6d193ed73d827b9ce620ac`.
  The Secretary of State archive identifies General Election 1832, but both
  retained TotalResults endpoints are HTTP-successful explicitly
  non-official empty/default responses and establish no official President
  precinct universe or totals. The Arkansas GIS Office's December 6, 2012
  announcement establishes that a county-precinct product existed after the
  election; the reachable statewide FeatureServer is mutable, non-versioned,
  and has no historic-moment support. It is not backcast. The current archive
  page has since changed bytes, and live bootstrap correctly rejects that
  drift before any write. The package therefore has zero target result units,
  features, relationships, or votes and null delivery. The 10,648-byte source
  evidence has SHA-256
  `6d8995377fb316522b56cff83464fcbe1dbbc4d5810f0a47b836d15d43f8bfed`;
  the 4,466-byte blocked manifest has SHA-256
  `4f4d5dad3acd34a892ac28309fafd732968f8c8d0e77067b6bf5517970eedaf8`.

- Georgia retains the exact 2,055,048-byte official SOS
  `export-2012NovGen.json`, SHA-256
  `0167a3c3ffd0629f4bb14d538cea2622d2018e8795fcb89b52f18e2a0eebda58`.
  It contains 477 presidential candidate rows across 159 unique county
  identities and exactly reconciles 3,897,839 votes: Romney 2,078,688, Obama
  1,773,827, and Johnson 45,324. It contains zero precinct-result records.
  The retained 11,481-byte Fulton County layer metadata, SHA-256
  `ca5e04c411ff77594f417cfea07f3ce69b2b8db644d39a6302b3461ae4cf482f`,
  is current-only, single-county context and is not evidence for a statewide
  2012 boundary edition. No county rows, current layer, recount context, or
  image is promoted, so target result, feature, relationship, and vote counts
  remain zero with null delivery. The 7,505-byte source evidence has SHA-256
  `d72c2ca7092b435afd0b78a8a83f00ac21411158e4dbd04360d3de067dd8773b`;
  the 4,783-byte blocked manifest has SHA-256
  `b446c6f409e9711fc060bde0e5353bfc69934ca08c28cdf1f7a5a845f7353f73`.

- Louisiana retains the exact 419,276-byte official SOS race 46257 precinct
  CSV, SHA-256
  `983dc8781ef4109cb2426b9efbfb0b79b2cf7caa542c9c9f1b10f281bc3bc2b7`,
  and the 19,188,581-byte official Legislature ZIP, SHA-256
  `abd3d21e05bac750053440cc109327f36d7e4bcf58825772c02eb04512ec3f4d`.
  The results contain 4,395 rows: 4,267 geographic, 128 non-geographic, and
  72 zero-vote rows, totaling 1,994,065 presidential votes across all 64
  parishes. The ZIP contains exactly seven shapefile members and 4,063 unique
  `UNIT_CODE` features with no collisions. Its PRJ records NAD83 / GCS North
  American 1983. Structurally extracted XML records 2010 Census VTD
  provenance, purpose/use constraints, legal limitations, native field
  labels, and copy-lineage dates 2011-11-15, 2012-12-18, and 2013-02-14.
  Basic SHP checks identify 4,033 Polygon and 30 MultiPolygon records with
  4,138 closed finite nonzero-area rings, but do not certify election
  topology. A computed non-authoritative identity comparison finds only
  1,582 overlaps, with 2,685 SOS-only and 2,481 geometry-only identities.
  No retained authority proves that this exact edition governed November 6
  or supplies the SOS Parish/Ward/Precinct-to-`UNIT_CODE` relationship, so
  all 4,267 geographic rows remain reviewed-unmatched, all normalized geometry
  remains empty, and authoritative matches, promoted votes, and delivery
  remain zero/zero/null. The 8,708-byte offline source ledger has SHA-256
  `65a7a10b82590a32af8f6495388aa8d261563a605999d8ecd8a3cbc75bb8b961`;
  the separately pinned bootstrap-fixture ledger has SHA-256
  `e3c1e1ff48e3312593fc33e760e8c2dfa723d0d6adcbd632aa8b8bad811fa46d`.
  The 20,827-byte source evidence has SHA-256
  `6fc848904af3846b8c6941eff847f0ab36f67c1c1b3b64ef442560936c8c1037`;
  the 4,074-byte blocked manifest has SHA-256
  `5f82bccc3fd56812a6446d5d4849c7435e23a2271d9585abecee19dff1a5ed38`.

- Independent state review rejected incomplete first passes and required
  material fail-closed corrections. Arkansas added exact observed status,
  full Content-Type, media type, URL, bytes, and hash validation for all five
  sources plus missing/wrong transport cases and rollback proofs. Georgia
  replaced loose counts with exact export hashes, county identity digest,
  candidate reconciliation, coherent-tamper tests, and an accurate current
  Fulton characterization. Louisiana replaced hard-coded DBF/overlap claims
  with real CSV/ZIP/DBF/PRJ/XML/SHP parsing, validated final redirect URLs,
  separated deterministic live/offline ledger pins, added true missing-value
  tests, and made commit-phase writes backup/restore transactional. Fresh
  independent re-reviews returned ACCEPT for all three state packages. A
  separate read-only integration review also returned ACCEPT, confirming the
  exact guard, registry order/counts, ledger rows, 195 unique existing runner
  paths, and the absence of public delivery. The requested Luna runtime was
  unavailable, so bounded reviews used the available Terra/high runtime and
  make no Luna claim; cross-state and delivery judgments remained with the
  coordinator.

- The exact shared integration delta is retained at
  `.etl/wave13-integration/wave13-integration.patch`: 38,364 bytes, SHA-256
  `d29042573216fbabf31827ee776350b2a5d2f8a6b3bff2557b883e07d50eeeb2`.
  It is LF/no-BOM, passed plain `git apply --check` against its guarded
  before-tree, and every canonical file byte-matches its guarded after-copy.
  Integrated shared-file hashes before this documentation-only close are:
  registry
  `d3e4ed0e7cf2e8b60617fab1df216cfb174564cffaac5a810e8b284fb4499f01`,
  2012 inventory
  `ea1b8066fb3cbb02be0e42b60d313e74503f382fd1a003b8297a2f7f6428b20e`,
  suite runner
  `8032991ea32b2206cf35c63f5f9394bc217172e2f4e625089534f2f13a221990`,
  geography-contract test
  `c56afc9fe041ee8a8582f4bcac3c440bc9cbed13c6483b2599368d8ace7ee3ac`,
  validation test
  `2c9573e450dbd23eb5b287778bae57343e2a19eb78b1d7376acca085928e8862`,
  and historical-ledger test
  `2fa43d2bf23bdb777fa5e98ea29b01a58bb36cfb438bdf4c8824dba7b5be402a`.

- The focused AR/GA/LA plus shared integration command passed 85/85 tests
  with zero failures. `npm run typecheck` passed. The guarded MCP
  `precinct-geometry` validator passed all three fixed provenance, manifest,
  and coverage stages with no warnings in 58,028 ms; audit:
  `.etl/mcp-runs/2026-08-05T13-02-27-811Z-b88fc352/manifest.json`.

- The final uninterrupted `cmd`-wrapped full suite exited zero after all 195
  listed files in 1,690.6 seconds. It has 195 start markers, zero `not ok`
  markers, zero nonzero failure summaries, no stderr error markers, and exactly
  one `Precinct geometry suite passed (195 files).` terminator. Its
  137,327-byte stdout log has SHA-256
  `54a14fe7f9f66955b055b4f8c7a0366ad5a825f832bc69c837e9d839c6510acd`;
  its 109,789-byte warning-only stderr log has SHA-256
  `6e793e773bcd84c2c8979d5767fa2245d7474a89215cf339714ca4d2f3f6a77a`.

- All three Wave 13 manifests remain `validation.status: "blocked"` with
  `delivery: null`, zero normalized features, and recursively vote-free
  normalized/crosswalk derivatives. The advisory-indicator path supports only
  2016, 2020, and 2024, so Wave 13 creates zero review rows, calculated
  indicators, flagged jurisdictions/areas, or indicator types. No staging
  import, database mutation, production promotion, public delivery, or Git
  publication was performed.

### 2026-08-05 - 2012 historical acquisition wave 14 start

- Connecticut, Idaho, and Missouri form the fourteenth bounded 2012
  acquisition wave. The accepted checkpoint is 192 valid blocked manifests,
  including 39 reviewed/blocked 2012 jurisdictions. The durable 2012 ledger
  now records 39 reviewed, three in progress, nine not started, 39 blocked,
  12 undecided, and zero publicly eligible.

- Connecticut has reusable official Elections Management System and Secretary
  of the State archive patterns, but the retained 2016 and 2020 packages are
  town-grain and the current Census planning-region/MCD crosswalk is expressly
  a current comparison geography. Wave work will identify and pin the exact
  2012 election/version and result semantics, determine whether any official
  response exposes voting-district rather than town identities, and seek an
  immutable election-date precinct boundary edition plus an official
  result-to-feature relationship. Town rows, current MCDs, and Census VTDs are
  not silently substituted for 2012 election precincts.

- Idaho already retains the official 2012 Secretary of State county
  presidential archive as historical context. Wave work will pin its exact
  bytes and reconciliation, inspect the official archive for any public 2012
  precinct-result universe, and separately characterize the current official
  980-feature precinct layer. County rows cannot become precinct result units,
  and the current layer cannot establish November 6, 2012 applicability or a
  historical crosswalk without authoritative evidence.

- Missouri already retains the official 2012 Secretary of State by-county PDF
  and official source evidence that general-election precinct files for
  1996-2024 are available through a purchase/contact route. Wave work will pin
  the 2012 county artifact and exact acquisition terms, seek a downloadable or
  obtainable statewide precinct result package, election-date geometry, and
  an official crosswalk, and record the acquisition dependency without
  inventing target units. County rows and undated local/current geometry remain
  context only.

- Three Terra/medium workers are confined to their assigned state package,
  collector, and focused test. Each must retain authority, URL, local path,
  election year, reporting grain, parser, expected counts/totals, byte count,
  SHA-256, terms, caveats, and deterministic replay evidence. Official sources
  take priority; supplemental sources must be explicit. Injected/live inputs
  must be validated before derived writes, derivatives must remain recursively
  vote-free unless a reviewed delivery contract explicitly permits otherwise,
  and incomplete statewide or county/local coverage must fail closed. The
  coordinator owns shared registry, ledger, runner, documentation,
  cross-state interpretation, independent review, and delivery decisions.

- No staging import, database mutation, production promotion, public
  delivery, or Git publication is authorized. The 2012 advisory-indicator
  path remains unsupported and must stay zero rather than being fabricated.

### 2026-08-05 - 2012 historical acquisition wave 14 close

- Connecticut, Idaho, and Missouri completed bounded official-source acquisition,
  deterministic replay, fail-closed validation, independent state review, and
  guarded shared integration. The registry now contains 195 valid blocked
  manifests, including 42 for 2012. The durable 2012 ledger records 42 reviewed,
  zero in progress, nine not started, 42 blocked, nine undecided, and zero
  publicly eligible. The remaining queue is AK, KY, MS, NE, NJ, NY, OR, SD, and
  TN.

- Connecticut retains the exact official 1,002,840-byte CGA CSV (14,765 rows,
  3,537 Presidential rows, 744 Town/VTD identities, 168 towns, and 1,550,737
  votes) plus two independently parsed SOTS PDFs. Each SOTS publication retains
  169 town identities and ten ticket totals summing 1,558,960 votes. East Granby
  is absent from the CGA result context, the official-source vote delta remains
  8,223, and the SOTS `New Millford`/CGA `New Milford` spellings remain verbatim
  source context rather than an inferred spatial join. No immutable election-date
  precinct/VTD edition or official result-to-feature relationship was found.
  The 7,574-byte source ledger has SHA-256
  `9116fb4acf5e01231fe26657ad29a1ffbaa35485b36586e6ac1c07c765bb4856`;
  the 15,918-byte source evidence has SHA-256
  `269b97a25570746a0c5632f481bb12e7f4dfbb822558a5a5f8864e8b8b4ef760`;
  and the 6,184-byte manifest has SHA-256
  `783a47843e60edacb1c2be0d495afd73b32799524a92b603a31842ff0af75977`.

- Idaho retains the exact 806,400-byte official federal precinct workbook with
  four worksheets, all 44 counties, 967 unique county-plus-label Presidential
  identities, 43 absentee-labelled context rows, zero zero-vote rows, and all six
  candidate totals summing 652,274 votes. A separately pinned 980-feature State
  of Idaho layer is explicitly 2024/current context and is excluded from 2012.
  No election-applicable 2012 boundary edition or authority-documented crosswalk
  was found. The 11,234-byte source ledger has SHA-256
  `78342c14bf98b8d1d907e1bf5bac9bf296eb73d381f8cb75b9fae7bc4169a93b`;
  the 197,986-byte source evidence has SHA-256
  `4793945ae44d6d0c91fa70c65ac2d68d3d80627f21e4be2f8bc4b6aacf4db4a9`;
  and the 4,224-byte manifest has SHA-256
  `a55d2ae8f40948c3af46c7d7e9e993bff27f1c669d5e2d384799ce4e216cb111`.

- Missouri retains the exact 3,394,841-byte official 170-page PDF with 116
  county/reporting-authority Presidential rows and 2,757,323 votes (Obama
  1,223,796; Romney 1,482,440; Johnson 43,151; Goode 7,936). The official access
  page states that 1996-2024 general-election precinct files are available through
  purchase/contact, but no purchased or otherwise authorized 2012 precinct file
  is retained. The stable PDF still matches live bytes; the dynamic page wrapper
  is pinned and correctly fails closed on byte drift. The 4,771-byte source ledger
  has SHA-256
  `18c8fcbbd7800e03931cbc696c00dc2d46358c3b93ee5ff9ce64b5611dec64dc`;
  the 9,809-byte source evidence has SHA-256
  `92094674b05a78300dcebe64161028e697ed2258d11f40780ff7dc2e2b6b9346`;
  and the 4,287-byte manifest has SHA-256
  `0f751a9b15f237a974eca8d5191d249473bdfb274883bb7ab091d7960d7a22a5`.

- Independent review rejected every incomplete first pass. Connecticut added true
  online/fixture transport evidence, independent parsing of both SOTS publications,
  and transactional writes. Idaho added coherent artifact IDs, all candidate totals,
  current-layer exclusion, transport evidence, and transactional writes; a fresh
  re-review then caught eight empty directories left by injected rollback, which
  was fixed by tracking only newly created directories and removing them deepest-
  first only when empty. Missouri added source-specific terms, observed transport,
  true missing/drift cases, and backup/restore rollback. Fresh independent re-reviews
  returned ACCEPT for all three. A separate read-only integration review also
  returned ACCEPT. The requested Luna runtime was unavailable, so bounded reviews
  used the available Terra/high runtime and make no Luna claim; cross-state and
  delivery judgments remained with the coordinator.

- The exact six-file shared integration delta is retained at
  `.etl/wave14-integration/wave14-integration.patch`: 38,316 bytes, SHA-256
  `b52f49496faa2f06c6ec31e63bf7510b72e73df03774fb30022d770532bd2c25`.
  It is LF/no-BOM, has six file diffs, passed forward `git apply --check` against
  the guarded before tree and reverse `git apply --check` against the canonical
  after tree. Canonical files byte-match the guarded after copies. Integrated hashes
  before this documentation-only close are: registry
  `03f199aa1d019da8964e7067fc273639bcc64322f602e03207bc7c0932dc2724`,
  2012 inventory
  `2a7514d05300b4b5b9b6994225d9b2de3f8d6b882786e584d8554efd087d3067`,
  runner `fbdb90272a28ead88401c0b7e94bd600847330b145261061a44748ae77e93726`,
  geography-contract test
  `0b7d9e7c536946bfcd31beeb02f581a23814cd60e79848f788f0bcaa8af4eb8f`,
  validation test
  `cccbfb35356b1adefd355392675d31b9c7ccdb09451709b3534f8fe8e42952f5`,
  and historical-ledger test
  `1b69a881ca946f4ca040a371d04bff5f66aeed33b4e26e43ec37ee6865fb2455`.

- The CT/ID/MO plus shared focused command passed 91/91 tests. `npm run
  typecheck` passed. The guarded MCP `precinct-geometry` validator passed all
  provenance, manifest, and four-ledger stages without warnings in 60,750 ms;
  audit: `.etl/mcp-runs/2026-08-05T14-44-29-576Z-e5aea18e/manifest.json`.
  The final uninterrupted full suite exited zero after all 198 listed files in
  1,642.7 seconds, with 198 start markers, zero `not ok` markers, zero nonzero
  failure summaries, and one exact completion terminator. Its 141,865-byte stdout
  log has SHA-256
  `fed6b8ac24ffaa5f6abb0c5869ad72f8c85277570f39eea2c808bf5737b85062`;
  its 111,460-byte warning-only stderr log has SHA-256
  `55a453f30382c6729004becd3a7dd5587679e5689fd5800366d59316f8db8f23`.

- The canonical registry refresh is byte-idempotent. The generic 2012 coverage
  refresh is not currently globally byte-idempotent: it would rewrite curated
  fields in AR, GA, IL, LA, ND, NH, NV, VT, and WY because source-tier/manifest
  metadata has drifted since those reviews. Wave 14 therefore merged only CT, ID,
  and MO and proved the other 48 jurisdiction rows JSON-identical to the guarded
  preimage. Future coverage refreshes must remain guarded and delta-reviewed.

- All three Wave 14 manifests remain `validation.status: "blocked"` with
  `delivery: null`, zero normalized features, zero target crosswalk rows, and no
  assigned votes. The 2012 advisory-indicator path remains unsupported and all
  related counts remain zero. No staging import, database mutation, production
  promotion, public delivery, or Git publication was performed.

### 2026-08-05 - 2012 historical acquisition wave 15 start

- Mississippi, New York, and South Dakota form the fifteenth bounded 2012
  acquisition wave. The accepted checkpoint is 195 valid blocked manifests,
  including 42 reviewed/blocked 2012 jurisdictions. The durable 2012 ledger now
  records 42 reviewed, three in progress, six not started, 42 blocked, nine
  undecided, and zero publicly eligible.

- Mississippi has the strongest remaining official GIS lead: MARIS publishes
  political-boundary availability pages and prior state work has reusable result,
  OCR, and geometry-diagnostic patterns. Wave work will locate and pin any exact
  2012 precinct/VTD archive and metadata, establish its effective/election vintage,
  identify a complete official 2012 precinct result universe, and prove or reject
  the parent-qualified result-to-feature relationship. Current, 2020 Census, 2023
  county-only, incomplete, or OCR-review-gated material is context only and cannot
  be backcast into a 2012 statewide map.

- New York retains official 2012 statewide county presidential baseline material,
  but election districts are county-administered and no complete statewide 2012
  local geometry/crosswalk package is retained. Wave work will search NYSBOE and
  official county archives for machine-readable election-district results, dated
  boundary editions, identifiers, and publication/reuse terms. County totals,
  current enrollment districts, Flateau/VEDA future paths, partial county rows, and
  undated maps remain source context only; images or PDFs are not digitized into
  authoritative polygons without control points, topology, and independent review.

- South Dakota has reusable official ResultsAjax/ResultsExport collection patterns,
  but the currently retained ElectionID 684 evidence is for 2024. Wave work must
  discover and pin the exact 2012 General election and Presidential race identifiers
  rather than reuse or guess current IDs, reconcile the official county/precinct
  identity universe, and seek election-applicable geometry plus an official
  CountyID-and-StatePrecinctID relationship. Current or later GIS and unofficial
  archive values remain context only unless their 2012 applicability is proven.

- Three Terra/medium workers are confined to their assigned state package, collector,
  and focused test. Each must retain authority, exact URL/final URL, status, full
  Content-Type, local artifact path, election year, reporting grain, parser,
  normalization path, counts/totals, bytes/hash, terms, caveats, confidence, and
  deterministic replay evidence. Missing/drifting inputs and injected commit failures
  must leave fresh and preexisting roots unchanged. Derivatives remain recursively
  vote-free unless an independently reviewed delivery contract proves otherwise.

- The coordinator owns shared registry, ledger, runner, documentation, cross-state
  interpretation, independent review, and delivery decisions. No staging import,
  database mutation, production promotion, public delivery, or Git publication is
  authorized. The unsupported 2012 advisory-indicator path remains zero.

### 2026-08-05 - 2012 historical acquisition wave 15 close

- Mississippi, New York, and South Dakota completed independent state review and
  remain correctly blocked from public precinct-map delivery. The canonical
  registry now contains 198 blocked manifests, including 45 for 2012. The 2012
  ledger records 45 reviewed, zero in progress, six not started, 45 blocked, six
  undecided, and zero publicly eligible. The remaining queue is AK, KY, NE, NJ,
  OR, and TN.

- Mississippi retains the exact 303,187-byte official MARIS 2012 voting-precinct
  metadata response (SHA-256
  `b2d22ae5a7fee83a1c84fa2a4d4658b41a3d8eb925f8d92c31350733c21fa415`).
  It describes 1,962 source features, but only nine named counties were updated in
  March 2012 and the other 73 use 2008 county submissions originally supplied for
  the December 2010 Census. No complete official machine-readable precinct result
  universe, statewide November 6 applicability proof, stable result join, or
  authority-issued crosswalk is retained. The mixed-vintage layer is evidence only;
  zero features, result units, and votes are admitted.

- New York retains the exact 451,087-byte official NYSBOE statewide results PDF
  (SHA-256
  `8490a66edd76193bb982a7cd84f703c8f0c9c4a3251009ebbbb634ddefab29ba`).
  Its deterministic parser reproduces 62 county-equivalent Presidential rows:
  4,485,741 Democratic, 2,490,431 Republican, 159,150 other, and 7,135,322 total.
  No complete statewide election-district/precinct identity universe, immutable
  election-date geometry, stable feature IDs, official crosswalk, or resolved reuse
  terms is retained. County partials and map images remain evidence leads only and
  were not digitized or backcast.

- South Dakota retains 13 exact official-source responses plus a deterministic
  20-file package. ElectionID 5, Presidential Electors RaceID 4265, and OSN 100
  reconcile 735 CountyID-qualified display identities across 66 counties and exact
  candidate totals of 145,039 Obama, 210,610 Romney, 5,795 Johnson, and 2,371 Goode.
  Official turnout semantics identify 69 Vote Center Level rows and five exact
  Absentee Precinct rows with four overlapping, yielding 70 reviewed
  non-geographic units and 665 unmatched geographic candidates. Shannon/Oglala
  Lakota is used only for exact parent aggregate reconciliation.

- The exact South Dakota PREC request returns zero rows and the official XLSX has
  735 blank precinct-identity cells. The official 902-feature Census 2010 VTD layer
  is recorded only as an excluded lead because November 6, 2012 applicability and
  an ElectionID 5 result-to-feature relationship are unproven. Four volatile-source
  live probes preserve canonical bytes while testing stable election semantics.
  Two additional nonpersisting JSON probes narrowly allow Content-Length framing
  to vary between null and the exact body-byte decimal while retaining exact body
  hashes and every other transport field. The final live run passed all six probes
  without changing the canonical 20-file tree. South Dakota's final manifest is
  SHA-256 `cf8db6fbb3187b76f25adf2b16eddca2b336edf7324879563095b9533e4ddb65`.

- Independent state review accepted all three packages. Focused suites passed MS
  6/6, NY 4/4, and SD 9/9. South Dakota also reproduced all 20 files byte-for-byte
  from copied raw inputs. Shared contract, historical-ledger, and registry validation
  passed 76/76; `npm run typecheck` passed; and the local MCP precinct-geometry
  validator passed with audit
  `.etl/mcp-runs/2026-08-05T16-56-56-415Z-59e11d96/manifest.json`.

- The guarded shared integration added only the MS, NY, and SD manifests, preserved
  all other registry entries, and merged only the three selected inventory rows.
  The generic 2012 coverage refresh would also rewrite AR, GA, IL, LA, ND, NH, NV,
  VT, and WY, so it was not applied wholesale. The runner now enumerates 201 files.
  The uninterrupted full suite passed all 201 files in 1,734.5 seconds with 201
  start markers, zero `not ok` markers, and one exact completion terminator. Its
  305,618-byte UTF-16LE stdout log has SHA-256
  `ce1f99bc542d3ca7a39b4305c05dd088243a7c4dcc892dff1e005856219b5747`;
  its 230,714-byte warning-only stderr log has SHA-256
  `71371902c36db661fb971c746bc8dd093fd052fcdb496c1ce9697954e8eb1742`.

- The exact six-file shared integration delta is retained at
  `.etl/wave15-integration/wave15-integration.patch`: 43,145 bytes,
  SHA-256
  `9538c87377255ec477263bb2a57e7e5ac8bb9f5ba0784412561dfe8a3b04293c`.
  It is LF/no-BOM, contains six file diffs, passes forward `git apply --check`
  against the guarded before tree and reverse check against the guarded after
  tree, and the six canonical files byte-match those after copies. Final hashes
  are registry
  `068f94a55973fef1c00b0e89d0ca5da9bdbf1e942f708720cc5412193c97b832`,
  2012 inventory
  `23fdb0a36f8f818645a93f8e4e76ed18d34102496a975aaa43002476378e4a27`,
  runner `89270944435d18757610e00fc8ba2666c5300173d323e7b311291c2dc196da33`,
  geography contract
  `5dd04e50b2ec44880f8f253e5fed184f9d870401be0d41bc873aa4dacbdd5532`,
  validation test
  `5c0be0bc863ad1f90f7ee378d068dc4b72448b6c64de96fa7c2a69eab4547dd6`,
  and historical coverage test
  `3a77610f96206a736b8ee6e1265ec59309668341ed761832656d6597dec5af0e`.

- All three manifests have `validation.status: "blocked"`, `delivery: null`, zero
  normalized features, and no assigned votes. Historical 2012 advisory indicators
  remain unsupported and explicitly zero. No staging import, database mutation,
  production promotion, public delivery, or Git publication occurred. Read-only
  reconnaissance recommends Wave 16 as AK/NJ/OR, with Alaska the only plausible
  exact-2012 precinct-geometry path, followed by Wave 17 as KY/NE/TN. Alaska must
  remain fail-closed unless an exact 2012 boundary edition and official result-unit
  reconciliation are proven; the retained 2013 plan is not by itself 2012 evidence.

### 2026-08-05 - 2012 historical acquisition wave 16 start

- Alaska, New Jersey, and Oregon form the sixteenth bounded 2012 acquisition
  wave. The accepted checkpoint is 198 valid blocked manifests, including 45
  reviewed/blocked 2012 jurisdictions. The guarded 2012 ledger now records 45
  reviewed, three in progress, three not started, 45 blocked, six undecided,
  and zero publicly eligible. Only AK, NJ, and OR changed; the other 48 state
  rows remain JSON-identical to the Wave 15 close preimage. The fixed activation
  timestamp is 2026-08-05T17:40:00.000Z.

- Alaska is the only remaining plausible 2012 public-geometry path. The official
  2012 General result archive reports all 438 precincts, but the retained 2013
  proclamation plan is not evidence of November 6, 2012 applicability. Wave work
  must locate and pin the exact April 2012 amended-redistricting boundary edition,
  prove its effective date and reuse terms, parse the full official statement-of-
  vote identity universe, classify district-level absentee/early/questioned rows,
  and establish stable result-to-feature identifiers. Any unresolved vintage or
  crosswalk ambiguity keeps delivery blocked.

- New Jersey work starts from the official 2012 election archive, statewide
  Presidential canvass, and county result PDFs. It must establish the complete
  municipality/election-district identity universe and locate an official archived
  2012 election-district boundary or authority-issued crosswalk. Current or 2020
  election-district services cannot be backcast. Municipal or county totals may be
  retained as source evidence but do not authorize precinct coloring.

- Oregon work starts from the official 2012 General Election Abstract record and
  the existing historical presidential parser context. It must locate exact local
  precinct results, election-applicable geometry, stable identifiers, and terms.
  OCR may recover tabular result evidence only when exact source pages and totals
  reconcile; map images are never converted into authoritative polygons without
  authority controls, topology validation, and independent review. Current voting-
  district tables or layers remain excluded from historical delivery.

- Three Terra/medium workers are restricted to their assigned state package,
  collector, and focused test. They must retain exact official bytes and SHA-256
  evidence, deterministic replay, transport metadata, counts and reconciliations,
  and transaction rollback coverage. Missing or drifting inputs must fail closed;
  derivatives remain vote-free unless every delivery gate is independently proven.
  The coordinator retains all shared-file, cross-state, architecture, and delivery
  decisions.

- Historical 2012 advisory indicators remain unsupported and explicitly zero. No
  staging import, database mutation, production promotion, public delivery, or Git
  publication is authorized.
### 2026-08-05 - 2012 historical acquisition wave 16 close

- Alaska, New Jersey, and Oregon completed independent state review and remain
  correctly blocked from public precinct-map delivery. The canonical registry now
  contains 201 valid blocked manifests, including 48 for 2012. The 2012 ledger
  records 48 reviewed, zero in progress, three not started, 48 blocked, three
  undecided, and zero publicly eligible. Kentucky, Nebraska, and Tennessee form
  the remaining Wave 17 queue.

- Alaska retains one exact 7,118-byte official-source ledger (SHA-256
  `7e7a1d914d74efe1fba96006f1311cb523fb8264a441a7fd17d7e311159f9d38`)
  and four official source leads that were not retained as source artifacts. The
  intermittently observed 438-of-438 result context remains explicitly unverified
  because no exact response body, transport record, complete SOVC inventory, or
  reporting-unit universe survived WAF/TLS access failures. The July 2013
  proclamation-plan lead is later than the election and contributes zero admitted
  features or votes; no exact April 2012 boundary edition was retained.

- New Jersey retains 29 exact official/context artifacts totaling 1,235,222 bytes:
  all 21 county Presidential PDFs, the official statewide candidate list, and the
  reviewed archive, Census, NJOGIS, and statutory context. The deterministic parser
  records 572 reporting units: 566 unmatched geographic municipality rows and six
  non-geographic Federal Overseas rows. Every county PDF reconciles candidate-wise
  to its printed county total. It preserves, without adjustment, the unresolved
  one-vote conflict between the county aggregation (3,640,293 total; 1,477,569
  Romney) and statewide list (3,640,292 total; 1,477,568 Romney). The later 6,348-
  feature NJOGIS layer is excluded and contributes zero admitted geometry.

- Oregon retains the exact 1,849,939-byte, 38-page official 2012 General Election
  Abstract PDF (SHA-256
  `2305edd4de989e91dfbeb7543d4a52c88897dbdc2c23f273496b544bf31b53fa`),
  with 40,682 extracted text characters. No Presidential candidate table was
  observed in extracted text; visual inspection and OCR were not performed, so the
  package makes no claim about unseen visual rows. The current official voting-
  district metadata has eight tabular fields and zero geometry-typed fields and is
  excluded from historical delivery.

- Independent final review accepted all three state packages. Focused state suites
  passed 9/9; the shared geography contract, manifest validation, historical
  inventory, and national coverage suites passed 96/96. `npm run typecheck` passed.
  The local MCP precinct-geometry validator passed with audit
  `.etl/mcp-runs/2026-08-05T18-30-48-154Z-6b7de299/manifest.json` and confirmed 201
  blocked manifests, 48 reviewed 2012 jurisdictions, and zero public-eligible
  historical layers.

- The guarded integration added exactly the AK, NJ, and OR manifests, removed none,
  changed no prior manifest, and merged only those three inventory rows. The generic
  inventory refresh would also have rewritten AK, AR, GA, IL, LA, ND, NH, NJ, NV,
  OR, VT, and WY, so only the three selected rows were applied. The runner now
  enumerates 204 unique test files. The uninterrupted full suite passed all 204 in
  1,799.5 seconds, with 204 file markers, zero `not ok` markers, and one exact
  completion terminator. Its 311,246-byte stdout log has SHA-256
  `ebbf5e99baed1cd735a191c2833c4096dfd169b736ec2f2bf579a68b02d80dae`;
  its 243,230-byte stderr log contains Node warnings plus five expected Alaska
  negative-path error traces exercised by passing assertions and has SHA-256
  `31754e9d7fdd52ef8948a241be45e10a44897fc60a81ac2dc9599a2b097a85b1`.

- The exact six-file shared integration delta is retained at
  `.etl/wave16-integration/wave16-integration.patch`: 40,410 bytes, SHA-256
  `0ef4ccb835749b795f724c619ae6dc7acc3b0e603025970802ea97e8cb662b04`.
  It is LF/no-BOM, contains six canonical file diffs, passes forward apply-check
  against the guarded before tree and reverse apply-check against the canonical
  after tree, and all six canonical files byte-match their frozen after copies.
  Final hashes are registry
  `2a1ea38a95ab5d50d28968f63347bf7509c1a67bcd046f52b8fae61c1e62bda3`,
  2012 inventory
  `457d99d04dfebf570b07ac10e7a24737dbb83fa59651c66fac0ee820e52e7233`,
  runner `8abf0b37cc3ef18ab117021e22ffb8de0f8296be57066e7b6c6fe28ed4d61cbd`,
  geography contract
  `e22a6d2360c5349621fee61e042103996a5390324cc7d4d9fff3ce3b685bb232`,
  validation test
  `e378e298a4dea04d7ebfbb633e74723a51b8954323d4e7b5819dfcfc88522a52`,
  and historical coverage test
  `80cce2bd4e8c4cb8a6b0ba5195c38a48bfc3466790616b3231dfd396a3e18f6b`.

- All three manifests have `validation.status: "blocked"`, `delivery: null`, zero
  normalized features, and no assigned votes. Historical 2012 advisory indicators
  remain unsupported and explicitly zero. No staging import, database mutation,
  production promotion, public delivery, or Git publication occurred.
### 2026-08-05 - 2012 historical acquisition wave 17 start

- Kentucky, Nebraska, and Tennessee form the final bounded 2012 acquisition wave.
  The accepted checkpoint is 201 valid blocked manifests, including 48 reviewed/
  blocked 2012 jurisdictions. The guarded 2012 ledger now records 48 reviewed,
  three in progress, zero not started, 48 blocked, three undecided, and zero
  publicly eligible. Only KY, NE, and TN changed; the other 48 state rows remain
  JSON-identical to the Wave 16 close preimage. The fixed activation timestamp is
  2026-08-05T19:12:00.000Z.

- Kentucky starts with the retained official 2012 county Presidential result PDF
  and normalized 120-county baseline plus the existing current Commonwealth VTD
  diagnostic. Wave work must locate exact 2012 precinct-result identities and an
  election-applicable boundary edition with effective-date and reuse evidence, or
  document the official acquisition gap. Current VTD identifiers and later
  geometry cannot be backcast; county totals do not authorize precinct coloring.

- Nebraska starts with the retained official 2012 General Canvass Book and
  normalized 93-county Presidential baseline. Wave work must distinguish county
  canvass context from a complete precinct/subcounty result universe and seek a
  publishable election-applicable statewide or complete 93-county boundary set
  plus official crosswalk. District/subdivision shapefiles are not precinct
  geometry, and restricted voter-file paths are not public delivery sources.

- Tennessee must first locate and retain the official 2012 result source because
  the active historical baseline currently covers only 2016 and 2020. It must then
  establish complete 2012 precinct identities, an election-applicable boundary
  edition, stable identifiers, terms, and an official crosswalk. The current/
  unknown-vintage 3,231-feature Comptroller service cannot be backcast, and labels
  or spatial overlap alone do not authorize vote assignment.

- Three Terra/medium workers are restricted to their assigned state package,
  collector, and focused test. Each must prefer official sources, retain exact
  authority/URL/transport/bytes/SHA-256 evidence, record election year, reporting
  grain, parser and normalization paths, counts/totals, terms, caveats, and
  confidence, and provide deterministic replay plus precommit/mid-swap/tamper
  rollback coverage. Missing or drifting inputs must leave fresh and preexisting
  roots unchanged. Derivatives remain vote-free unless every delivery gate is
  independently proven. The coordinator retains all shared-file, cross-state,
  architecture, and delivery decisions.

- Historical 2012 advisory indicators remain unsupported and explicitly zero. No
  staging import, database mutation, production promotion, public delivery, or Git
  publication is authorized.

### 2026-08-05 - 2012 historical acquisition wave 17 close and national inventory closeout

- Kentucky, Nebraska, and Tennessee completed independent state review and remain
  correctly blocked from public precinct-map delivery. The canonical registry now
  contains 204 valid blocked manifests, exactly 51 for each of 2024, 2020, 2016,
  and 2012. The 2012 ledger records 51 reviewed, zero not started, zero in
  progress, 51 blocked, zero undecided, and zero publicly eligible. All four
  election-scoped ledgers now have that same reviewed/blocked/eligible disposition.

- Kentucky retains the exact 268,981-byte official 2012 Presidential county-result
  PDF (SHA-256
  4d69774e9b1c1704f539d14b9a2c420ce4f21f876d2c9ef2a17b2535eed81375)
  and a deterministic 89,827-byte derivative county baseline (SHA-256
  337dc6f2a6e3c3423bec36939fed2aca17c2bbd3af674137554f61777a8b6dea).
  Its 120 counties reconcile 1,797,212 Presidential votes: 1,087,190 Republican,
  679,370 Democratic, and 30,652 other. The original transport status, final URL,
  and content type were not retained and remain explicitly unavailable. County
  totals, a current VTD layer, and labels do not establish a complete 2012
  precinct identity universe, election-applicable geometry, or official crosswalk,
  so the package admits zero target result units, features, or votes.

- Nebraska retains the exact 479,560-byte official canvass PDF (SHA-256
  3b416ecb644c0c7d19a74dcc20b92d8ca21397faa7399c31737510685d0601e2),
  61,613-byte official index (SHA-256
  45c3a044258d566ce9a1776f686c987d3bdf3edc40bd0407e2090715713248b0),
  and 51,049-byte deterministic county baseline (SHA-256
  79689c905d12419516cb135c8dea2f7eca86eafd54437909acb3da3841c8a394).
  Its 93 counties reconcile 794,379 Presidential votes: 475,064 Republican,
  302,081 Democratic, and 17,234 other. Five additional request targets are
  recorded only as unretained follow-up leads: no contents or transport are
  asserted and they admit no evidence. No complete 2012 precinct identity
  universe, geometry, terms, or crosswalk is retained.

- Tennessee retains the exact 352,686-byte official 2012 precinct-result PDF
  (SHA-256
  2e1a269fbd64ddf21503a91250b505c6acfbbbf4649399d676c416862042a4bf)
  from the Secretary of State. It reconciles 95 county totals and 1,456 parseable
  county-associated line observations to 2,458,577 Presidential votes: 1,462,330
  Romney, 960,709 Obama, and 35,538 other. Review found only 1,175 unique
  county-plus-label pairs and 75 duplicated keys, with displaced or reordered
  fields, so the observations do not prove a complete unique result-unit identity
  universe. The current Comptroller service has 3,231 features but no confirmed
  2012 vintage and is excluded rather than backcast. The package therefore admits
  zero target result units, features, or votes.

- Independent final state review accepted all three packages. Focused state suites
  passed 7/7; shared geography-contract, registry-validation, historical-ledger,
  and national-coverage suites passed 97/97; and npm run typecheck passed. The
  local MCP precinct validator passed with audit
  .etl/mcp-runs/2026-08-05T19-47-44-376Z-73b63283/manifest.json, confirming 204
  blocked manifests, all four 51-jurisdiction ledgers reviewed/blocked, and zero
  public-eligible layers.

- The guarded integration added exactly the KY, NE, and TN manifests, removed no
  manifest, changed no prior manifest, and merged only those three 2012 inventory
  rows. The generic refresh would also have rewritten AR, GA, IL, LA, ND, NH, NV,
  VT, and WY, so it was not applied wholesale. The runner now enumerates 207
  unique test files. A preliminary independent integration audit accepted the
  exact three-state delta, inventory close, fail-closed metrics, runner, shared
  assertions, and patch reproducibility.

- The first uninterrupted national-suite attempt stopped after 148 file markers
  when the first clean offline replay inside the Missouri 2016 test returned status
  1 once; it recorded one not-ok marker and no completion terminator. Its
  203,236-byte stdout log has SHA-256
  40005e14df6b920e6c7ac20bac617777156455be8b5aa831945111f7cb675558,
  and its 168,586-byte stderr log has SHA-256
  75bda5bbff40c33d329b926f9c62978f8ec591ec43266427c9e3dcbfc85cccb9.
  The complete Missouri 2016 file immediately passed 3/3 without a code or data
  change, and a later durable focused retry also passed 3/3; its 3,166-byte stdout
  log has SHA-256
  e199041cf3e8520a9859ba7126f0a83521b56885a375bcd75a8ca82a5b7f15ea
  and its empty stderr has SHA-256
  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.

- The second uninterrupted national-suite attempt passed all 207 files in about
  1,823 seconds, with 207 file markers, zero not-ok markers, and one exact
  completion terminator. Its 315,870-byte stdout log has SHA-256
  44d480ae0b6c1d4b9fe9971e82b021c6870c477c97bba4b4ff84da5f2b030557.
  Its 261,378-byte stderr log has SHA-256
  67f3ef1747ff1e8af2ff648619a959f1042652356662aff12fffd2c0f42c3b78
  and contains Node warnings plus 13 expected negative-path error traces exercised
  by passing assertions: five Alaska, four Nebraska, and four Tennessee traces.

- The exact six-file shared integration delta is retained at
  .etl/wave17-integration/wave17-integration.patch: 38,494 bytes, SHA-256
  89b05f6f44dbd37e29c1726161b36ee3da8350a06ab341fde8e73fb37a34d272.
  It is LF/no-BOM, contains six canonical file diffs, passes forward apply-check
  against the guarded before tree and reverse apply-check against the canonical
  after tree, and all six current canonical files byte-match their frozen after
  copies. Final hashes are registry
  97415f98462555572d07f654846aab4678b9a71a99a5ad2c0e22690b2e009e0d,
  2012 inventory
  b6693a73a2c00f7ecbf565e162bfcad4079e3a8bd722ebf2e4ae8573bbcb365f,
  runner 63b2a57dd255efae025997569fde12eac3d090ce838cb1266cc3cf4671b1dfa7,
  geography contract
  ab827c9d45186285b91ac372135764e606e224b49b3c01b287e156a7beeff341,
  validation test
  a8c8a394635bcc8dcbd9180c1ad97d31ca48155855df3ed7504a03751d374b80,
  and historical coverage test
  33b9a6500b123c46d20ae1cf45278f45cabe88a8921cc92581bf5ce5cd30557f.

- All three Wave 17 manifests have validation status blocked, delivery null,
  zero normalized features, and no assigned votes. Historical 2012 advisory
  indicators remain unsupported and explicitly zero. No staging import, database
  mutation, production promotion, public delivery, or Git publication occurred.
  Future progress is state/election-specific source resolution and reviewed
  crosswalking; image digitization remains a candidate derivation only when source
  authority, election applicability, control points, topology, identity, terms,
  reconciliation, and independent review all pass.
### 2026-08-05 - isolated local clone and Minnesota reporting-unit pilot

- A read-only production preflight confirmed PostgreSQL 17.10, 27 public tables, and no migration-0008 geography/reporting-unit tables or foreign-key columns. The approved endpoint was represented only by fingerprint `bf2bf2213814`; no production URL or credential was written to the repository, dump manifest, validation output, or logs. All remote preflight and dump sessions forced `default_transaction_read_only=on`, and no production mutation occurred.

- `docker-compose.db-clone.yml` and `scripts/clone-production-db.ps1` now create a dedicated, labelled PostgreSQL 17 service bound only to `127.0.0.1:54329`. The checksummed sanitized public-schema dump lives outside Git under `C:\tmp\crm-db-clone` and excludes operational `ui_layout_*` table data. `crm_clone_snapshot` exactly matches every other production preflight row count and has database-level read-only mode enabled. `crm_clone_dev` is a separate writable copy.

- `drizzle/0008_typical_thunderbolts.sql` was applied transactionally to `crm_clone_dev` only. The snapshot remains at 27 public tables; development has 31, with `geography_versions`, `geography_features`, `reporting_units`, `reporting_unit_geometry_crosswalks`, and nullable reporting-unit IDs on result, review, and turnout rows. The pristine-clone validator passed the dump hash, schema, row-count, constraint, read-only, label, health, and loopback-binding checks. Its report is `C:\tmp\crm-db-clone\local-clone-validation.json`.

- The application has an opt-in local read adapter and a separate guarded local native-import path. Local writes require `CRM_DATABASE_ENVIRONMENT=local`, `CRM_DATABASE_LOCAL_WRITES=true`, an explicit loopback `DATABASE_URL`, port 54329, and database `crm_clone_dev`; the snapshot and every other target are rejected. The production-default Neon importer retains its pre-0008 insert shape and never executes reporting-unit table or column statements. Focused driver, transaction, importer, reporting-unit, full API, typecheck, and independent review checks passed.

- A forced local update failure proved postgres.js transaction rollback: public revision remained 3 before and after the intentional rejection. The first full pilot then exposed a driver portability issue in JSON batch parameters. PostgreSQL saw a JSON-encoded string rather than an array; the entire import rolled back to 261 Minnesota result rows, 4,075 review rows, 4,103 turnout rows, zero reporting units, and revision 3. Native JSON text parameters now use the driver-neutral `::text::jsonb` path, and the retry succeeded.

- Minnesota 2024 was the first normalized pilot because the official Secretary of State workbook and official election-applicable LCC-GIS archive share exactly 4,103 VTDIDs across all 87 counties. Staging SHA-256 `158e46a18f6a9e1cdf6f7c13203cdb108c577e8404fa914cebc05744670c4c33` retained `sourceUnitId`, `sourceDisplayName`, `reportingGrain`, `parentGeoid`, and `isGeographic` on result, review, and turnout rows.

- The development database now contains 4,103 distinct sourced Minnesota precinct reporting units and 87 parent county GEOIDs. It stores 12,309 linked precinct candidate rows plus 261 intentionally unlinked county aggregate candidate rows; all 4,075 review rows and all 4,103 turnout rows are linked. County and precinct result grains independently reconcile to 3,253,920 votes (1,656,979 Harris, 1,519,032 Trump, 77,909 other), including 28 zero-vote geographic precincts. No public constraint is invalid, and source/import metadata remains JSON objects.

- The end-of-state advisory report calculated 173 rows across 87 counties: 87 `average_down_ballot_difference`, 67 `vote_share_pattern`, and 19 `down_ballot_outliers`. These are advisory comparison signals, not evidence of fraud or misconduct. The national precinct geometry/provenance validator also passed all 204 reviewed blocked manifests and four 51-jurisdiction year inventories.

- The immutable snapshot remains unchanged at its original Minnesota counts, revision 3, and 27-table schema. The development revision advanced to 4. No production migration, data promotion, public geometry release, or Git publication occurred.

- Work resumes here: build a local-only geometry loader that retains the official archive/source document, inserts one Minnesota 2024 `geography_versions` record and all 4,103 source-feature identities, then inserts 4,103 reviewed `one_to_one` / `exact_official_id` / high-confidence crosswalks. Validate archive and derivative hashes, topology, source terms, feature count, VTDID uniqueness, all reporting-unit joins, and the 28 zero-vote units before considering another state/year. Geometry tables currently remain deliberately empty; vote totals must remain in election tables rather than geometry payloads.

### 2026-08-06 - Minnesota four-election local GIS setup start

- Scope is the presidential general elections of 2012-11-06, 2016-11-08,
  2020-11-03, and 2024-11-05. The setup path remains local-only and guarded to
  `crm_clone_dev`; production migration, promotion, delivery, and publication
  are not authorized.

- The tool will retain the reporting-unit/geometry separation. Certified SOS
  workbooks support 4,102, 4,120, 4,110, and 4,103 VTDID reporting-unit
  identities respectively. Only 2016 and 2024 currently have
  election-date-confirmed geometry plus reviewed exact one-to-one crosswalks,
  totaling 4,120 and 4,103 features/relationships.

- Minnesota 2012 remains fail-closed because two Blue Earth County source
  features have blank VTD keys while certified result IDs `270130165` and
  `270130197` remain result-only. Minnesota 2020 remains fail-closed because the
  exact official `vtd2020general.zip` catalog lead returned 404 and no approved
  election-applicable boundary artifact is retained. The setup tool may retain
  certified result identities for those years, but it must create no geometry
  version, feature, or crosswalk rows for either year.

- Planned acceptance gates are: pinned manifest/workbook/normalized/crosswalk
  hashes; event-date and state checks; VTDID and parent uniqueness; Polygon or
  MultiPolygon-only normalized features; no election values in normalized
  feature properties or relationship rows; passed reconciliation; reviewed
  exact-ID relationships; one transaction; local-target enforcement; rollback
  on any mismatch; idempotent reruns; and a non-secret audit report that states
  each year's loaded or blocked disposition.

### 2026-08-06 - Minnesota four-election local GIS setup completed

- Added a deterministic Minnesota planner and guarded database loader for the 2012, 2016, 2020, and 2024 presidential general elections. The planner pins every retained SOS workbook, manifest, source/evidence artifact, normalized geometry, and crosswalk by SHA-256 and byte count before any database connection is opened. Geometry and relationship payloads are recursively rejected if they contain election-value fields.

- Added `precinct-gis:plan:mn`, `precinct-gis:setup:mn:local`, and `precinct-gis:validate:mn:local`. The write command accepts only the explicit loopback `crm_clone_dev` target with local environment and write opt-in; it never loads `.env.local`, never invokes the Neon transaction path, and wraps all selected years in one PostgreSQL transaction plus an advisory lock.

- The local clone now has 16,435 year-scoped Minnesota precinct reporting units and 49,305 linked precinct candidate rows: 4,102/12,306 for 2012, 4,120/12,360 for 2016, 4,110/12,330 for 2020, and 4,103/12,309 for 2024. Certified totals and 33/31/33/28 zero-vote unit counts reconcile exactly. The prior 261 county rows remain separate, so Minnesota has 49,566 total result rows locally.

- Minnesota 2016 and 2024 store 4,120 and 4,103 source-feature identities plus the same number of reviewed `one_to_one`, `exact_official_id`, high-confidence crosswalks. Both geography versions remain `blocked`, carry `publicDeliveryAuthorized: false`, and have no delivery artifact. Minnesota 2012 and 2020 create no geography version, feature, or crosswalk rows.

- The persistent validator proves all precinct result rows point to canonical reporting units from the same election; checks result and geometry source-document provenance; compares every stored feature and crosswalk with the pinned plan; rejects election values in persisted geometry properties; verifies fail-closed version metadata; reconciles candidate totals and zero-vote units; and requires all public constraints to remain validated.

- A forced failure after a completed 2012 write phase left elections, units, results, geometry tables, and revision exactly unchanged. The opt-in integration test also forced rollback after 2016 and ran repeated full applies. Reporting-unit, result, feature, and crosswalk semantic hashes remained stable; only the deliberately monotonic local public-data revision advanced.

- Focused database-driver and Minnesota package/setup checks passed 24/24, the real local-database rollback/idempotency test passed 1/1, `npm.cmd run typecheck` passed, and `npm.cmd run test:api` passed. The independent implementation review identified missing persistent same-election and fail-closed assertions; both were added and verified.

- The fixed MCP precinct-geometry validator passed with audit `.etl/mcp-runs/2026-08-06T14-18-56-686Z-d894f8dd/manifest.json`. The Minnesota 2024 staging advisory report remains 4,075 review rows and 173 calculated advisory rows across 87 counties: 87 `average_down_ballot_difference`, 67 `vote_share_pattern`, and 19 `down_ballot_outliers`. These are advisory review signals, not evidence of fraud or misconduct.

- Remaining Minnesota source work is explicit: 2012 needs authoritative resolution of the two blank Blue Earth geometry keys; 2020 needs the missing official election-applicable boundary archive and effective-date evidence. Public promotion and map delivery for even the reviewed 2016/2024 layers remain separate, unauthorized work. No production migration, promotion, public release, or Git publication occurred.

### 2026-08-06 - Minnesota 2012 and 2020 source resolution and guarded local activation

- This milestone supersedes the prior Minnesota 2012 and 2020 source blockers. The
  official LCC-GIS catalog separately publishes the 2012 election-results archive
  `2012generalresults.zip`; it is not the earlier `vtd2012general.zip` boundary
  candidate with two blank keys. The election-results archive has 4,102 Polygon or
  MultiPolygon features, 87 county parents, and 4,102 exact VTDIDs. Every retained
  presidential field and `TOTVOTING` agrees numerically with the certified SOS
  workbook. Two `PCTNAME` strings are transposed display-only differences and do
  not affect VTDID, PCTCODE, county-parent, or result assignment.

- The retained official 2020 `PreliminaryElectionResults2020.zip` archive has 4,110
  Polygon or MultiPolygon features and an exact 4,110-ID VTDID/county/PCTCODE set
  match to the certified SOS workbook across all 87 counties. Its preliminary
  election values are explicitly excluded: the presidential candidate vector
  differs for 1,026 VTDIDs, the presidential total differs for 1,021, and the
  preliminary statewide total is 2,011 votes above the certified total. The
  certified SOS workbook remains the sole vote authority.

- Added deterministic reviewed collectors for both years. Each retains official
  source pages and archives with byte counts and SHA-256 pins, emits identity-only
  WGS84 geometry, produces reviewed exact-ID one-to-one crosswalks, reconciles 87
  county scopes plus statewide, preserves all 33 zero-vote geographic units, and
  leaves `delivery` null with validation status `blocked`. Offline replay is
  byte-identical, source tampering fails before derived writes, and fixed review
  timestamps prevent silent provenance drift.

- The active 2012 manifest is
  `mn-2012-11-06-lcc-2012generalresults-v1` (SHA-256
  `0658bae1392349e5256325ac2a358bf80263235a961dd1e37bad2474d2373194`).
  The active 2020 manifest is
  `mn-2020-11-03-lcc-preliminary-identity-geometry-v1` (SHA-256
  `2a4e0e24e831d760b28a7dc605be3ca56c22020e98b2459d08bc3aaf0c7b5a34`).
  The canonical registry and historical ledgers replace only the prior Minnesota
  diagnostic entries; unrelated state rows remain untouched.

- The guarded `crm_clone_dev` setup and independent read-only validator now pass
  with one blocked, non-public geography version per election year: 4,102 features
  and crosswalks for 2012, 4,120 for 2016, 4,110 for 2020, and 4,103 for 2024.
  Together the local clone holds 16,435 year-scoped reporting units, 49,305 linked
  precinct candidate rows, 16,435 reviewed features, and 16,435 exact one-to-one
  crosswalks. Certified vote totals and the 33/31/33/28 zero-vote counts reconcile,
  and all database constraints remain valid.

- Remaining Minnesota work is no longer an archive or public-record request for
  these two years. It is a separate authorization and release task: review the
  production result activation, build immutable public delivery artifacts with
  source terms, and verify the map/API path before any public promotion. No
  production migration, promotion, public release, or Git publication occurred.

- Verification passed: the 2012 and 2020 focused suites each passed 4/4, the
  local planner suite passed 4/4, and the opt-in real-database rollback and
  idempotency suite passed 1/1. `npm.cmd run typecheck` and the repository-wide
  precinct manifest, artifact-provenance, registry, and four historical ledger
  validators passed with 204 valid blocked manifests and zero public-eligible
  layers.

- The fixed MCP precinct-geometry validator passed with audit
  `.etl/mcp-runs/2026-08-06T23-07-33-322Z-13a12c79/manifest.json`. The unchanged
  Minnesota 2024 staging advisory path reports 4,075 review rows and 173 advisory
  rows across 87 counties: 87 `average_down_ballot_difference`, 67
  `vote_share_pattern`, and 19 `down_ballot_outliers`. These are advisory review
  signals, not proof of fraud or misconduct.

### 2026-08-06 - Minnesota local delivery-readiness implementation start

- Scope is a local/staging-only delivery-readiness path for Minnesota 2012,
  2016, 2020, and 2024. The four reviewed geometry packages and certified-result
  joins remain the source of truth. Production migration, result promotion,
  public eligibility, public release, and Git publication are not authorized.

- The implementation will audit and test the immutable delivery builder, API,
  map UI, source attribution, historical-year selection, zero-vote precincts,
  and fail-closed release controls. Candidate delivery bytes may be generated
  locally for review, but blocked manifests must remain blocked with
  `rowLevelRenderingSafe: false`, `delivery: null`, and no public API exposure.

- Acceptance requires deterministic presentation-only GeoJSON with no election
  values, exact feature/crosswalk cardinality, certified result-unit identity,
  retained authority/URL/terms metadata, stable SHA-256 and byte counts, safe
  output confinement, non-overwrite behavior, all zero-vote reporting units,
  local API/map verification where supported, and unchanged production state.

### 2026-08-06 - Minnesota local delivery-readiness pipeline completed

- Added a local candidate mode to the immutable precinct-delivery builder. It
  accepts only the four public-release blockers deliberately retained on
  otherwise reviewed packages, while continuing to enforce election vintage,
  geometry validity, reconciliation, exact reviewed crosswalks, parent scope,
  and supported cardinality. Candidate output is confined to
  `.etl/precinct-delivery-candidates`; the public builder remains strict.

- Deterministic presentation-only GeoJSON now exists locally for all four
  tracked elections. The immutable review bytes are:
  - 2012: 4,102 features, 43,222,011 bytes, SHA-256
    `f0f9727bd5b212c83d565bf343609d2bdd416a382be1975fd9fcaa525e737714`.
  - 2016: 4,120 features, 26,793,881 bytes, SHA-256
    `ce27114ad1971cca472f635f0b2292c60be0c3104c44f49c794c7cfc5e74d207`.
  - 2020: 4,110 features, 25,998,261 bytes, SHA-256
    `c06e1b9712c44c031262872faa70924dd9198928f0ae4274d2259787125e3e8c`.
  - 2024: 4,103 features, 27,550,483 bytes, SHA-256
    `df94482464f9cd7065b2e6cf624eb6d19ab5717bb477ac57e798dd23066f9f06`.

- Each candidate has 87 county parents and one unique certified reporting-unit
  code per feature. Tests exercise every parent-scoped map selection and exact
  result join across all 16,435 features, including all 125 zero-vote units
  (33/31/33/28 by year). Geometry properties contain no election values.

- The 2012 and 2020 source-terms question was resolved from official LCC-GIS
  pages already retained with the source archives. The collectors now validate
  and hash-pin the complete available disclaimer text into source evidence and
  manifests. No public-record request is needed for those terms. The 2020
  preliminary election attributes remain excluded; certified SOS rows are the
  sole vote authority.

- The local `crm_clone_dev` database remains normalized at revision 21 with
  16,435 Minnesota reporting units, 49,305 linked candidate-result rows,
  16,435 geometry features, and 16,435 reviewed exact-ID crosswalks. All four
  versions remain blocked and non-public, certified totals and zero-vote counts
  reconcile, and all persistent constraints pass.

- The normal map workspace now supports 2012 with Obama/Romney labels and the
  November 6, 2012 election date. The national comparison and county-profile
  product contracts remain limited to 2016, 2020, and 2024.

- Independent review identified and verified a release-safety correction: the
  future public writer now checks its declared byte count and SHA-256 before
  reaching any directory or file write. A regression test proves a mismatch
  leaves neither the target file nor its parent directory behind.

- Public release remains intentionally unauthorized. Every Minnesota manifest
  still has `validation.status: blocked`,
  `rowLevelRenderingSafe: false`, validation activation errors, and
  `delivery: null`; registry and API selection therefore expose none of these
  candidate files. A future release must deliberately review those gates, add
  immutable delivery declarations matching these bytes, coordinate production
  result and geometry activation, and perform production API/UI smoke checks.

- Final verification passed candidate replay and non-overwrite checks, the
  public pre-write mismatch regression, focused delivery/map/workspace/local
  database tests, and every one of the precinct runner's 210 explicitly listed
  test files. Long retained-source replay files were split into attributable
  runs after shell-wrapper timeouts; all completed with real zero exit codes.

- `npm.cmd run typecheck`, `npm.cmd run test:layout`, and the optimized
  production build passed. The fixed maps validator passed with audit
  `.etl/mcp-runs/2026-08-07T00-19-36-391Z-59102f9c/manifest.json`; the fixed
  production provenance validator passed with audit
  `.etl/mcp-runs/2026-08-07T00-14-55-028Z-741b4fdf/manifest.json`.

- The independent read-only local database validator passed at revision 21
  with zero invalid constraints and no production mutation. The unchanged
  Minnesota advisory report contains 4,075 review rows and 173 advisory rows
  across 87 counties. Those indicators are review signals only, not proof of
  fraud or misconduct.

### 2026-08-07 - Minnesota guarded local API/UI rehearsal completed

- Added a fail-closed, local-only Minnesota rehearsal adapter in
  `src/lib/mn-precinct-rehearsal-server.ts`. It activates only when
  `CRM_PRECINCT_REHEARSAL=mn`, `NODE_ENV` is `development` or `test`, the
  PostgreSQL read driver is selected, strict database reads are enabled, and
  the shared local-clone guard confirms a loopback port 54329 connection to
  `crm_clone_dev`. Production mode, the read-only snapshot, a remote host, the
  wrong port, a different database, a different flag, or a missing strict-read
  setting all fail closed.

- The adapter pins the four candidate filenames, byte counts, SHA-256 values,
  election years, and feature counts. It rechecks the canonical manifest
  contract before every rehearsal view or file read, verifies bytes before
  parsing, confines reads to `.etl/precinct-delivery-candidates`, validates
  delivery metadata, and returns only the requested county. The production
  output tracer explicitly excludes these local candidates, and the clean
  optimized build produced no tracing or bundling warning.

- The manifest API may return a marked `localRehearsal` view only under that
  guard. The view keeps `eligible: false`, the canonical `delivery: null`, all
  four public-eligibility reasons, and a visible notice that it is not public.
  The precinct-geometry API uses a separate local reader and reports
  `localRehearsal: true` and `publicEligible: false`. The browser never requests
  `includeBlocked`, and the normal public eligible-manifest path is unchanged.

- Added `npm run precinct-gis:rehearsal:mn:verify -- --base-url=http://127.0.0.1:<port>`.
  Against the real Next development server
  and `crm_clone_dev`, it verified the manifest, geometry, result, and workspace
  routes for all four tracked elections, all statewide result-unit counts, all
  zero-vote units, exact candidate hashes and byte counts, one county-scoped
  geometry transfer per year, and exact result joins. Hennepin County (`27053`)
  returned and joined 405/405 features in 2012, 422/422 in 2016, 425/425 in
  2020, and 396/396 in 2024. An unknown manifest remained a 404.

- Added `tests/e2e/mn-precinct-rehearsal.spec.ts`, gated by
  `CRM_RUN_MN_PRECINCT_REHEARSAL_E2E=true` so the ordinary browser suite does
  not expect a local clone. The requested
  `agent-browser` executable was not installed, so the repository's installed
  Playwright/Chromium runtime was used for the equivalent browser-verification
  checklist. All four Minnesota year pages rendered their precinct maps and
  exact joined counts, displayed `Local rehearsal - not public`, retained the
  official source link and terms, showed no framework error overlay, produced
  no browser console or page error, and had no failed API response. The 2024
  visual record is `.etl/mn-precinct-rehearsal-2024.png`.

- Focused guard, overlay, byte-pin, county-selection, delivery-server,
  map-join, UI-contract, and API-contract tests passed. The new rehearsal test
  is included in the explicit precinct runner, increasing it from 210 to 211
  files. `npm.cmd run typecheck` and the optimized `npm.cmd run build` passed.
  The prior complete 210-file precinct run remains valid because this change
  does not alter collectors, normalized artifacts, crosswalks, manifests, or
  the registry; the new and directly affected tests were rerun after the
  rehearsal implementation.

- The read-only local database validator passed again at revision 21: 16,435
  reporting units, 49,305 linked candidate rows, 16,435 geometry features,
  16,435 exact reviewed crosswalks, the expected 33/31/33/28 zero-vote units,
  and zero invalid constraints. The fixed maps validator passed with audit
  `.etl/mcp-runs/2026-08-07T23-14-04-403Z-211b3237/manifest.json`; the fixed
  provenance validator passed with audit
  `.etl/mcp-runs/2026-08-07T23-15-47-699Z-7832bef1/manifest.json`.

- The unchanged Minnesota 2024 staging report still has 4,075 review rows and
  173 advisory rows across 87 counties: 87
  `average_down_ballot_difference`, 67 `vote_share_pattern`, and 19
  `down_ballot_outliers`. These are advisory screening signals only, not proof
  of fraud or misconduct.

- Both temporary Next servers were stopped and the loopback rehearsal port was
  closed. No production database operation, public file write, canonical
  manifest or registry mutation, public eligibility change, production
  promotion, or Git publication occurred. The isolated PostgreSQL clone remains
  available locally for subsequent work.

### 2026-08-07 - Minnesota production-release candidate preparation start

- Scope is a deterministic, local-only release package for the reviewed
  Minnesota 2012, 2016, 2020, and 2024 precinct result/geometry pairs. The
  package will freeze the candidate delivery bytes, canonical-manifest
  preimages, proposed public delivery declarations, schema migration, source
  artifacts, exact expected database counts, deployment ordering, verification
  checks, and rollback requirements.

- The current canonical manifests must remain blocked, their `delivery` values
  must remain null, and no public file may be written while the package is
  prepared. Draft reviewed manifests may exist only under `.etl` for review.
  The package must report `NO_GO_PRODUCTION` until a current production backup
  and schema preflight, an isolated release diff, a reviewed production
  transaction path, a deployment window/rollback owner, and explicit production
  authorization are all present.

- The worktree contains hundreds of unrelated or shared changes. Release
  preparation must hash a narrow Minnesota dependency inventory and call out
  shared files that require patch-level isolation before any Git publication.
  No production mutation, public geometry release, canonical registry change,
  or Git publication is authorized by this milestone.

### 2026-08-07 - Minnesota production-release candidate preparation complete

- Added the deterministic, fail-closed release-candidate builder in
  `scripts/lib/mn-precinct-release-candidate.mjs`, its CLI in
  `scripts/prepare-mn-precinct-release-candidate.mjs`, and the operator runbook
  in `docs/developer/mn-precinct-release-runbook.md`. The builder verifies the
  four existing local candidate files byte-for-byte, replays the public
  delivery builder without writing public files, and writes only beneath
  `.etl/precinct-release-candidates/MN/` when `--write` is requested.

- Each output directory is content-addressed from the complete package. The
  package freezes source, normalized geometry, crosswalk, candidate-delivery,
  migration, canonical-manifest preimage, proposed reviewed-manifest, test,
  script, documentation, and shared-inventory hashes. It also records exact
  deployment ordering, expected database counts, verification queries,
  rollback triggers, and the distinction between local tooling and a future
  reviewed production transaction path. The canonical manifests and registry
  remain unchanged, blocked, ineligible, and without delivery declarations.

- The package decision is deliberately `NO_GO_PRODUCTION`. Passed gates are
  the four candidate byte pins, exact local-clone joins, and unchanged blocked
  canonical preimages. Pending gates are an isolated release diff, a current
  verified production backup, a current read-only production schema/row
  preflight, a reviewed atomic production transaction path, a named deployment
  window and rollback owner, and explicit production authorization. The
  existing database loader remains hard-limited to the loopback
  `crm_clone_dev` clone and is not a production writer.

- The refreshed read-only local database report at
  `.etl/local-db/mn-precinct-gis-validation.json` passed at revision 21 with
  zero invalid constraints. It proves 16,435 reporting units, 49,305 candidate
  rows, 16,435 geometry features, 16,435 reviewed exact crosswalks, and the
  expected 33/31/33/28 zero-vote units for 2012/2016/2020/2024. Production was
  not contacted or changed.

- The focused release, delivery, local-clone, rehearsal, zero-vote, manifest,
  schema, database-driver, map, server, UI, and API suite passed 63/63 tests.
  The new release test is included in the explicit precinct runner, increasing
  it from 211 to 212 files. `npm.cmd run typecheck` and the optimized
  `npm.cmd run build` passed.

- Fixed MCP validators passed with these audit manifests:
  precinct geometry
  `.etl/mcp-runs/2026-08-07T23-58-31-165Z-122fac55/manifest.json`, maps
  `.etl/mcp-runs/2026-08-07T23-59-23-716Z-5257f3f2/manifest.json`, provenance
  `.etl/mcp-runs/2026-08-08T00-01-05-069Z-a7c62d7d/manifest.json`, source
  acquisition tiers
  `.etl/mcp-runs/2026-08-08T00-01-14-730Z-ee112219/manifest.json`, and source
  packages `.etl/mcp-runs/2026-08-08T00-01-17-066Z-2d631ad3/manifest.json`.
  The source-package audit retained pre-existing legacy/app-ready warnings,
  including missing `data/mn-app-data.js` and `data/mn-counties.js`; those are
  not inputs to this precinct release package and do not relax any release
  gate.

- The refreshed Minnesota 2024 advisory report remains 4,075 review rows and
  173 advisory rows across 87 counties: 87
  `average_down_ballot_difference`, 67 `vote_share_pattern`, and 19
  `down_ballot_outliers`. Its broad-signal caveat remains applicable. These are
  advisory screening signals only, not proof of fraud or misconduct.

- No production database operation, public-data write, canonical manifest or
  registry mutation, public eligibility change, production promotion, Git
  commit, push, or publication occurred. The content-addressed package is a
  review artifact, not deployment authorization.

### 2026-08-07 - Minnesota production-readiness implementation start

- The next local phase will isolate the release package's exact dependency set
  from the 654-file shared worktree, record base and working hashes, and emit a
  reviewable content-addressed overlay without changing or discarding unrelated
  user work. Shared registries, database code, package metadata, and product UI
  require explicit hunk- or semantic-projection review rather than a blanket
  filename-level claim.

- A separately guarded Minnesota release transaction path and release-specific
  production preflight will be implemented and exercised only against the
  loopback `crm_clone_dev` database. The production preflight contract must
  capture transaction read-only state, endpoint fingerprint, schema/migration
  state, validated constraints, Minnesota election/year and row sets, public
  revision, source-document identities, and canonical-manifest preimages.

- This phase does not contact production, create a production backup, choose an
  operator or rollback owner, activate canonical manifests, write public files,
  or authorize a deployment. Those gates remain pending until current evidence
  and explicit human decisions exist.

### 2026-08-07 - Minnesota guarded production-readiness tooling complete

- Added an isolated, content-addressed release-overlay builder. It copies the
  exact Minnesota code and documentation bytes into `.etl`, records Git base
  and working-tree hashes, produces binary-capable patches for tracked files,
  and creates Minnesota-only semantic projections for shared JSON registries
  and `package.json`. It never rewrites, discards, or silently includes
  unrelated worktree changes. Shared-file review remains a human release gate.

- Added a release-specific, read-only production preflight contract. Its
  default mode opens no connection. A real preflight requires an explicit
  read-only production environment marker, an acknowledgement containing the
  exact release-package digest, and an unpooled non-loopback connection URL.
  The preflight freezes database identity, transaction write mode,
  migration/schema state, invalid constraints, public revision, Minnesota core
  year/result sets, source-document identities, precinct row sets, endpoint
  fingerprint, and the canonical-manifest preimages already pinned by the
  package. Evidence is immutable and content-addressed under `.etl`.

- Added a separately guarded atomic production transaction path. It requires a
  fresh matching preflight, a fresh verified full-public-schema rollback dump,
  different named operator and verifier roles, an active deployment window,
  exact evidence hashes and scopes, and two environment acknowledgements tied
  to the package and authorization IDs. At transaction start it reacquires the
  advisory lock and rechecks the approved production preconditions; any drift
  aborts before mutation. Migration `0008`, all four hidden Minnesota datasets,
  and their validation execute in one transaction. Canonical manifests,
  public-delivery files, registry activation, and UI cutover remain outside the
  writer and stay disabled.

- The existing sanitized local-clone dump is intentionally rejected as a
  production rollback artifact because it omits table data. A production
  release still requires a current full rollback backup with a verified restore
  rehearsal. The generated authorization template starts at `NO_GO`, so merely
  creating the template cannot enable writes.

- The first real local production-context rehearsal exposed an incorrect
  result-row conflict target. PostgreSQL rejected the statement and the entire
  transaction rolled back without changing the clone. The target was corrected
  to the database's actual five-column unique key, after which the full
  production-context forced-failure rehearsal and the ordinary local
  idempotence/rollback checks passed. A second rehearsal after adding the
  transaction-start drift comparison also passed.

- The final read-only clone validation passed at revision 27 with zero invalid
  constraints: 16,435 Minnesota reporting units, 49,305 linked candidate rows,
  16,435 geometry features, and 16,435 exact reviewed crosswalks. Per-year unit,
  feature, and crosswalk counts remain 4,102 / 4,120 / 4,110 / 4,103; result-row
  counts remain 12,306 / 12,360 / 12,330 / 12,309; and zero-vote unit counts
  remain 33 / 31 / 33 / 28 for 2012 / 2016 / 2020 / 2024.

- All 26 focused database-driver, four-year Minnesota geometry, setup,
  transaction, rollback, release, overlay, delivery, schema, map, UI, and
  provenance test files passed. The two new release-readiness tests are listed
  in the explicit precinct runner, increasing it from 212 to 214 files.
  `npm.cmd run typecheck` and the optimized `npm.cmd run build` passed.

- Fixed MCP validators passed with these audit manifests: precinct geometry
  `.etl/mcp-runs/2026-08-08T00-52-54-104Z-bce62be4/manifest.json`, maps
  `.etl/mcp-runs/2026-08-08T00-53-47-432Z-c10799ce/manifest.json`, provenance
  `.etl/mcp-runs/2026-08-08T00-55-29-241Z-06066ebf/manifest.json`, source
  acquisition tiers
  `.etl/mcp-runs/2026-08-08T00-55-38-336Z-c8f8f55a/manifest.json`, and source
  packages `.etl/mcp-runs/2026-08-08T00-55-40-652Z-0ba1ddb9/manifest.json`.
  The validators retained unrelated legacy/app-ready map warnings, including an
  88-feature versus 87-row Minnesota equipment-geometry warning and missing
  `data/mn-app-data.js` / `data/mn-counties.js`; none is an input to this
  precinct transaction, and none relaxes a release gate.

- The unchanged Minnesota 2024 advisory calculation contains 4,075 review rows
  and 173 advisory rows across 87 counties: 87
  `average_down_ballot_difference`, 67 `vote_share_pattern`, and 19
  `down_ballot_outliers`. These are screening signals only, not proof of fraud
  or misconduct.

- Production was not contacted or mutated. No public file, canonical manifest,
  registry, eligibility flag, Git commit, branch, push, or publication changed.
  Remaining gates are the generated overlay's shared-hunk review, a current real
  production preflight, a verified full rollback backup, named independent
  roles and an active window, explicit authorization, and a separate reviewed
  public cutover.

### 2026-08-07 - Minnesota isolated overlay review start

- Review is pinned to release package
  `a47f26fd19fedd09af93a51467c15ab608b12be74a1f4cc800d61a4ca5935635`
  and overlay
  `656596d3cd295323a249d4f771a51a44e7af4c53c9597eab066e65adc25ffa66`.
  Neither artifact may be silently refreshed while this review is in progress.

- Each of the overlay's 21 shared-file review items will be classified as a
  Minnesota-required hunk or semantic projection, a reviewed shared
  prerequisite, or unrelated work that must be excluded from the Minnesota
  integration diff. The review must reference exact base and working hashes and
  retain enough evidence to reproduce every inclusion decision.

- A deterministic local review record and focused validator will be created
  under the release package's hash boundary. Passing this review can satisfy the
  isolated-diff evidence requirement only; it cannot substitute for a current
  production preflight, a restoration-verified full backup, named independent
  roles, an active deployment window, explicit authorization, or public-cutover
  review.

- This phase remains local. It does not contact production, change a database,
  write public geometry, edit canonical manifest eligibility, mutate Git, or
  authorize a release.

### 2026-08-07 - Minnesota deterministic overlay classification complete

- Added `scripts/lib/mn-precinct-release-review.mjs` and
  `scripts/review-mn-precinct-release-overlay.mjs`. The reviewer requires the
  exact content-addressed package/overlay relationship and rechecks every
  copied file, patch, and semantic-projection byte before producing an
  immutable review record under `.etl/precinct-release-reviews/MN/`.

- The original 21-file shared review queue was inspected in full. The review
  also covers the modified results API route and migration journal, which the
  first overlay correctly hash-pinned but did not put in the human queue. The
  resulting 23-surface policy has eight wholly relevant patches, five curated
  mixed-hunk files, nine semantic projections, and one external national
  continuation ledger.

- The curated inclusions are the precinct-detail UI styles and component,
  2012-supported-year/candidate changes, explicit result-contest selection,
  normalized geography/reporting-unit schema and transaction paths, strict
  production-shaped local reads, the Minnesota source/documentation entries,
  and the exact `postgres`/`shpjs` dependency closure. Explicit exclusions are
  unrelated indicator-presentation, browser-R, security-incident version, MCP
  dependency/script, other-state precinct script, registry-row, and
  documentation changes.

- The overlay now embeds byte counts and SHA-256 values for each copied file,
  patch, and projection, while retaining the Git-base byte count and digest for
  every tracked preimage. Its package projection is allowlisted to
  the reviewed Minnesota/shared-precinct commands, and its package-lock
  projection traverses only the `postgres` and `shpjs` runtime dependency
  closure. This closes the prior gap where a path could be pinned while a
  derived patch or projection lacked an explicit digest in the overlay record.

- Added immutable-write, semantic-exclusion, policy-cardinality, relationship,
  and tamper-rejection tests. The focused release-candidate, overlay, review,
  production-guard, and local-setup run passed 20/20 tests. The new review test
  is listed in the explicit precinct runner, increasing it from 214 to 215
  files. `npm.cmd run typecheck` and the optimized `npm.cmd run build` passed.

- Fixed MCP validators passed with no MCP warnings: precinct geometry
  `.etl/mcp-runs/2026-08-08T01-21-22-865Z-d7837dcd/manifest.json`, maps
  `.etl/mcp-runs/2026-08-08T01-22-16-577Z-c9f51c19/manifest.json`, provenance
  `.etl/mcp-runs/2026-08-08T01-24-01-439Z-5d27347e/manifest.json`, source
  acquisition tiers
  `.etl/mcp-runs/2026-08-08T01-24-10-403Z-454c8a0e/manifest.json`, and source
  packages `.etl/mcp-runs/2026-08-08T01-24-15-560Z-86a50721/manifest.json`.

- A passing classifier result is
  `READY_FOR_HUMAN_CONFIRMATION`, not a production approval. The
  `clean_isolated_release_diff` gate remains pending until an independent human
  confirms the exact policy and it is applied/tested in a clean integration
  worktree. Current production preflight, full restoration-verified backup,
  named independent roles/window, explicit authorization, and the separate
  public cutover also remain pending.

- No production connection or mutation, public file write, canonical manifest
  or registry activation, Git mutation/publication, or release authorization
  occurred during this review.

### 2026-08-07 - OpenStreetMap precinct basemap implementation start

- Scope is the county-scoped precinct-detail presentation layer. OpenStreetMap
  Standard raster tiles will provide geographic context beneath the existing
  election polygons; official state/LCC precinct geometry and certified state
  election results remain the only boundary and vote authorities.

- The renderer must use the exact OSM Standard tile origin, Web Mercator-align
  polygons and tiles, request only the single fitted zoom intersecting the
  visible viewport, preserve normal browser caching and referrer behavior, and
  show permanent on-map `© OpenStreetMap contributors` attribution. It must not
  proxy, prefetch, scrape, archive, geocode, or derive precinct identities from
  OpenStreetMap.

- The OSMF community tile service is best-effort and not an unlimited CDN. The
  release runbook must retain the traffic caveat and require a suitable
  OSM-derived provider or self-hosted tiles if usage outgrows modest interactive
  viewing. A tile failure must not remove official precinct polygons, joined
  results, source terms, or the fallback background.

- Because the Minnesota release candidate hash-pins the precinct UI, styles,
  tests, runbook, and this continuation ledger, the existing candidate/overlay/
  review hashes become superseded by this requested change and must be rebuilt
  after verification. Production and canonical publication remain unauthorized.

### 2026-08-07 - OpenStreetMap precinct basemap implementation complete

- Added a dependency-free Web Mercator tile planner in
  src/lib/openstreetmap-basemap.ts. It uses the exact OSM Standard tile
  origin, computes one fitted zoom, emits only tiles intersecting the visible
  county viewport, and projects the official precinct polygons through the
  same transform so roads, labels, and boundaries align.

- The precinct-detail component now draws OSM tiles beneath the unchanged
  official election polygons and leaves the candidate colors, exact result
  joins, selection control, source authority link, full boundary terms, and
  local/public eligibility guards intact. Visible on-map
  © OpenStreetMap contributors attribution links to the OSM copyright page.
  A neutral fallback background remains if the best-effort tile service is
  unavailable.

- The first focused browser screenshot exposed a container-layout defect: the
  existing two-column grid compressed the map to roughly 110 pixels in the
  current workspace. The corrected styles use a container query and retain the
  960-by-520 aspect ratio. The verified Hennepin County 2024 screenshot is
  .etl/mn-precinct-rehearsal-2024-osm-map.png.

- Updated the public privacy page to disclose the direct browser request to
  tile.openstreetmap.org, the ordinary request metadata visible to that
  service, and the governing OSMF privacy policy. The release runbook records
  the tile-use, caching, no-prefetch, no-SLA, fallback, attribution, and
  future-provider/self-hosting requirements.

- The OpenStreetMap contract, projection, viewport intersection, attribution,
  responsive-layout, privacy, official-source-preservation, and release-review
  tests pass. The focused precinct/release suite passed 28/28; the final
  privacy/review subset passed 6/6. The guarded real-browser rehearsal passed
  all four Minnesota years with the exact 405/422/425/396 Hennepin feature and
  result joins, no API/page/console/framework error, visible tiles, and visible
  attribution. The explicit precinct runner now contains 216 test files.
  npm.cmd run typecheck and the optimized npm.cmd run build passed.

- Fixed MCP validators passed: maps
  .etl/mcp-runs/2026-08-08T02-03-37-426Z-5487c48d/manifest.json, provenance
  .etl/mcp-runs/2026-08-08T02-05-19-138Z-c3b0844f/manifest.json, and precinct
  geometry .etl/mcp-runs/2026-08-08T02-05-28-610Z-34ece226/manifest.json.
  Existing national equipment-geometry count warnings, including Minnesota's
  88 GIS areas versus 87 equipment rows, remain unrelated to the precinct
  basemap and do not relax any release gate.

- OpenStreetMap remains presentation context only. It is not a precinct source,
  result source, name source, crosswalk input, geocoder, or offline archive.
  The superseded Minnesota release candidate chain will be resealed after this
  ledger entry. No production connection or mutation, public geometry write,
  canonical manifest/registry activation, Git mutation/publication, or release
  authorization occurred.


### 2026-08-07 - Minnesota clean integration gate

- The project owner confirmed the prior Minnesota overlay review and authorized
  local clean integration. A local-only worktree on branch
  `feature/mn-precinct-gis-integration` was created from exact base commit
  `32a458f5ebb2d5984e417fa4ac8326309d7cf60a`. The existing dirty development
  worktree was not reset, cleaned, or used as proof of a clean diff.

- Applying the sealed overlay to its recorded base exposed an incomplete
  dependency closure. Its package projection referenced missing generic
  precinct commands, its national runner referenced 203 tests absent from the
  base, the validation helper imported an undeclared source-package module,
  and the candidate omitted the 2024 Minnesota collector/test plus retained
  reports needed to rebuild the release evidence. Some one-state semantic JSON
  projections were also not valid standalone registries. These are packaging
  defects, not Minnesota geometry or result-data failures. The original sealed
  candidate, overlay, and review remain immutable and `NO_GO_PRODUCTION`.

- The isolated integration now declares the four Minnesota collectors/replays,
  a focused 20-file Minnesota/shared-contract runner, required shared source
  modules and contract tests, the API contract update, and all five retained
  geometry reports. The semantic manifest and coverage projections are valid
  one-state registries with recomputed Minnesota-only summaries. Generic
  national commands and tests that cannot run from this base are excluded from
  the Minnesota integration closure.

- Clean-worktree verification passed: the focused Minnesota suite (20/20), the
  full repository `npm test` suite, `npm run typecheck`, and the optimized
  `npm run build`. The guarded loopback Chromium rehearsal against
  `crm_clone_dev` passed all four elections, rendered visible OpenStreetMap
  tiles and attribution, preserved the exact Hennepin joins
  (405/422/425/396), and reported no failed API responses, page errors, console
  errors, or framework overlay. Local Vercel Flags telemetry could not obtain
  an OIDC token outside Vercel; this did not affect the application or test.

- Because dependency-closure corrections change candidate bytes, a new
  content-addressed candidate, overlay, and review must supersede the earlier
  chain. The new review record requires confirmation before any commit or
  production step. Production preflight, full restoration-tested backup,
  independent release roles/window, explicit production authorization,
  immutable public geometry placement, canonical eligibility activation, and
  post-cutover verification all remain pending.

- No production connection or mutation, public geometry write, canonical
  manifest eligibility change, Git commit/push, or public deployment occurred
  during this clean integration gate.

### 2026-08-08 - Minnesota Vercel preview packaging correction

- Draft PR #208's native Vercel preview deployment
  `dpl_6s72pMzuRq1jpsdrbrHh5bhgF844` failed at commit `d69b17f` because
  `.vercelignore` excluded `data/precinct-geometry-manifests.json` while both
  precinct API routes import that registry at build time. The local build did
  not reproduce the failure because `.vercelignore` applies to Vercel's source
  upload rather than an ordinary local checkout.

- Added one exact Vercel source-bundle exception for
  `data/precinct-geometry-manifests.json`. The broad `data/**` exclusion stays
  in place, and neither `data/precinct-geometry/` nor its raw, normalized,
  crosswalk, report, or delivery-candidate artifacts are uploaded by this
  exception.

- Added regression contracts in `tests/api/precinct-map-ui.test.mjs` and the
  CI-executed `tests/api/api-contract.test.mjs`. They require the exact registry
  exception, while the focused contract also rejects directory-wide
  precinct-geometry exceptions. The complete `npm run test:api` suite and the
  focused 5/5-test file passed, `npm run typecheck` passed, and the optimized
  `npm run build` passed with both precinct API routes present. The native
  Vercel preview remains the final source-bundle verification after the
  corrected commit is pushed.

- This packaging correction changes files hash-pinned by the Minnesota release
  candidate, so the prior confirmed review record remains immutable evidence
  for its earlier bytes rather than approval of this correction. Any future
  production package must be resealed and reviewed. No database, canonical
  delivery eligibility, public geometry, certified result, crosswalk, or
  production environment changed.

### 2026-08-08 - Minnesota production-safe county delivery implementation

- A clean worktree on `feature/mn-precinct-production-release` was created from
  merged `origin/main` commit `8230621`. The existing development checkout and
  its uncommitted work were left untouched. Fresh local validation again proved
  all four reviewed elections: 16,435 reporting units, 49,305 certified
  candidate rows, 16,435 features, 16,435 exact reviewed crosswalks, 125
  zero-vote units, and zero invalid constraints.

- The merged delivery path would have read and parsed one 26-43 MB statewide
  GeoJSON file in the server function for every county request. The browser
  also requested every precinct result row in Minnesota. That shape was not a
  safe Vercel production contract even though the underlying reviewed bytes
  were correct.

- The release builder now preserves those four statewide files as frozen
  evidence and deterministically produces 87 content-addressed county GeoJSON
  files plus one hash-pinned index per election. The proposed serving set is
  348 county files and four indexes. Both index and county bytes retain the
  complete source metadata and LCC terms; no election value is added to
  geometry. Draft manifests use the explicit `parent_scoped_geojson` contract
  and pin index byte/hash, parent count, feature count, and property names.

- The server accepts either the legacy reviewed GeoJSON contract or the new
  parent-scoped index. For the new contract it verifies the manifest-pinned
  index, selects the requested five-digit county GEOID, verifies only that
  county's index-pinned byte count and SHA-256, validates metadata against the
  manifest, and rejects extra or missing county features. A server-only
  `CRM_PRECINCT_GEOGRAPHY_ORIGIN` can point to a credential-free HTTPS immutable
  origin; local rehearsal retains filesystem delivery.

- `/api/results` now accepts `parentGeoid` only for `level=precinct`. That
  branch joins `result_rows.reporting_unit_id` to the same-election
  `reporting_units` row and filters its county parent. The ordinary query stays
  separate so pre-migration county/state APIs do not acquire a dependency on
  migration 0008. The precinct UI sends the selected county GEOID.

- Added a plan-first Vercel Blob publication tool. It verifies every packaged
  asset, requires exact package/public-write acknowledgements before any remote
  mutation, refuses overwrite and random suffix behavior, uploads all parent
  files before indexes, re-downloads and re-hashes each object, and leaves
  canonical manifests blocked. No Blob store is currently installed, and no
  store was provisioned or file uploaded during this implementation.

- Added a plan-first full production backup tool bound to the exact release
  package. Its execution path makes a complete custom-format `public` schema
  dump with no excluded table data, restores it to the fixed isolated local
  verification database, compares every public table and exact row count,
  checks constraints and archive coverage, and writes restrictive rollback
  evidence. The existing sanitized development clone remains intentionally
  insufficient for release rollback.

- Focused parent-index, server-delivery, UI/API contract, Blob-plan, release
  candidate, and backup-evidence tests pass, as does TypeScript validation at
  this checkpoint. An exact overlay dry run then correctly failed closed because
  16 modified delivery surfaces lacked explicit review-policy classifications
  and `src/lib/api.ts` was missing from the dependency inventory. The inventory,
  hunk-review set, policy, and regression contracts now cover those surfaces;
  the policy tests pass and the corrected package must be resealed before the
  overlay/review check is repeated.

- Final package resealing, full suite/build, protected-preview validation, fresh
  package-bound production preflight/backup, named release roles/window, Blob
  provisioning/upload, database mutation, canonical activation, and public
  cutover remain separate pending gates. No production write, public file
  upload, environment mutation, manifest activation, Git publication, or
  deployment promotion occurred.

- The fresh package-bound production preflight opened a read-only transaction
  against endpoint fingerprint `bf2bf2213814` and confirmed PostgreSQL 17, 27
  public tables, zero invalid constraints, migration 0008 absent, and only the
  existing 261 Minnesota 2024 county result rows. The full-backup execution
  check then found that its clean-worktree path unnecessarily depended on an
  untracked developer-local Compose file. The backup now inspects the fixed
  `crm-db-clone-postgres` container directly and still independently verifies
  its name, labels, health, loopback binding, backup mount, and PostgreSQL 17
  tools. This correction requires one final package reseal; production remained
  read-only and no backup or public change had occurred at this checkpoint.

- The full backup then completed and restored successfully with all 27 public
  tables and exact row counts matching production. A subsequent release-runner
  handoff audit caught that the consumer looked for the verified dump at the
  backup root even though the manifest and dump live together in the guarded
  `mn-release-backups` directory. The runner now resolves the basename beside
  the already root-validated manifest, re-hashes it, and has a direct sibling-
  path and root-escape regression test. This is a local evidence-consumption
  correction; the production backup session remained read-only and no schema,
  data, public geometry, environment, or canonical manifest was changed.

### 2026-08-08 - Minnesota receipt-bound public activation tooling

- PR #209 is merged and deployed at `b540c6d`. A clean merged-main audit found
  that its intentionally separated release surfaces stopped after the hidden
  load and immutable Blob upload: there was no executable consumer for those
  receipts, no deterministic canonical-registry transition, and no guarded
  `geography_versions` publication-status transition. The four canonical MN
  registry rows therefore remain blocked and delivery-null.

- Added a plan-first public-activation candidate builder. It requires the exact
  sealed release-package hash, committed hidden-load receipt, and Blob
  publication evidence. It validates the four blocked source-manifest
  preimages, all production totals, one credential-free HTTPS origin, and every
  one of the 348 county files plus four indexes. Its only tracked projections
  are `data/precinct-geometry-manifests.json` and the four year-specific
  coverage inventories. The writer is deterministic and idempotent and emits a
  hash-pinned `.etl` candidate for protected preview; it cannot contact or
  mutate production, deploy, promote, or publish Git.

- Added a separate guarded database publication-status runner. It consumes the
  exact activation candidate, re-hashes the five tracked preview surfaces, and
  requires a `GO_PUBLIC` record bound to the package, activation, database, and
  Blob evidence. Four named release roles, at least two distinct people,
  operator/verifier separation, an active rollback window, and a protected
  preview verified within four hours are mandatory. Exact environment
  acknowledgements and an explicitly supplied unpooled production URL are also
  required.

- The database transition is atomic, package-scoped, and idempotent. It locks
  the Minnesota release scope, verifies exactly four blocked geography
  versions and 16,435 reviewed crosswalks, changes publication status and
  release metadata together, and increments the public revision. It still does
  not deploy or promote the application. A separately acknowledged rollback
  path returns the exact versions to blocked without deleting immutable public
  objects.

- Added focused fixtures covering exact receipt binding, deterministic five-
  file activation, tamper rejection, verified-preview/two-person authorization,
  and the atomic publication transition. The first focused run passed all six
  tests. Production remains unchanged: no database write, Blob upload,
  environment mutation, canonical activation, deployment promotion, or Git
  publication occurred during this implementation checkpoint. Because these
  tooling and inventory bytes are release dependencies, the earlier
  `57d671a02c09...` package is preliminary evidence only; a fresh candidate must
  be sealed from merged main after this change is reviewed and merged.

- Independent release review found that the first activation draft did not yet
  make evidence hashes mandatory, could partially write the five tracked
  surfaces, trusted an editable activation document at execution time, and did
  not revalidate the live result/join/provenance data immediately before public
  status. Those paths now fail closed: both receipt SHA-256 values are required,
  all five files are preflighted before any mutation and restored on a later
  failure, the activation document is reconstructed byte-for-byte from pinned
  evidence, and the existing exact Minnesota database validator runs inside the
  publication transaction before its first write.

- The same review identified a more fundamental hidden-load exposure: the
  public results API previously filtered precinct rows only by `level`. Both its
  parent-scoped and unscoped Minnesota precinct queries now require the exact
  same-election reporting unit, authorized source document, `published`
  geography version, reviewed one-to-one exact-ID crosswalk, linked feature,
  and matching release-package flags. Missing database configuration or a read
  error returns no Minnesota precinct rows rather than seed fallback.

- A final deployment-order audit found that the eligible static registry and
  results gate could still expose geometry or votes at different moments,
  depending on whether the application or database transition ran first. The
  precinct-geometry route now applies the same database publication gate. It
  binds the selected static manifest's serialized SHA-256, exact delivery,
  election, manifest ID, feature/link counts, release package, authorized
  source rows, and publication audit before reading Blob bytes. The safe order
  is now activation deployment first while both endpoints remain unavailable,
  followed by the atomic database transaction as the single public data
  switch. Protected preview verifies the exact candidate and deliberately
  blocked routes; the guarded local rehearsal supplies the pre-cutover visual
  map proof. The final `GO_PUBLIC` authorization now also requires the exact
  READY/PROMOTED production deployment, its five activation hashes and origin,
  and observed blocked result/geometry gates before the database runner can
  write. Preview and production records now include exact Git tree SHAs and
  must resolve to the same tree even when their commit SHAs differ after merge
  or squash. The operator checkout must match the preview commit and the shared
  deployment tree, and the runner resolves both the production and pinned
  rollback commit objects locally to prove their claimed tree identities.

- Publication metadata now preserves the exact authorization hash, original
  caveat, activation candidate, Blob receipt/origin, commit time, and public
  revision in the database. Exact postconditions cover four versions, 16,435
  features/crosswalks/reporting units, eight source documents, and four import
  runs. A read-only recovery mode can reconstruct a missing local receipt from
  that audit state without reopening an expired write window. Rollback requires
  a new two-person `GO_ROLLBACK` record and the exact publish
  receipt/hash/revision/time. The original `GO_PUBLIC` record and publication
  receipt pin the immediately previous gate-capable deployment, including its
  commit/tree identity and blocked endpoint observations. Rollback blocks the
  database first while the activated gate-capable application remains live.
  The exact target is also stored in live publication metadata, and rollback
  rehashes the original authorization before comparing all three copies. Only
  then does the procedure restore that pinned deployment; it restores the
  original caveats and retains both audit records.

- Production endpoint fingerprints are now full 64-hex SHA-256 values over the
  normalized host, explicit/default port, and database name. The backup retains
  the historical 12-hex host/database value only as an independent approved-
  endpoint check and requires the fresh preflight fingerprint as a separate
  execution acknowledgement. Public cutover documentation now reflects the
  actual Vercel behavior: `main` auto-deploys to production, preview environment
  changes require a new preview deployment, and the clean operator HEAD/tree
  must match the protected preview and production evidence. Rollback holds
  `main`, blocks the database publication state first, and then restores the
  exact gate-capable deployment pinned before cutover.

- The expanded focused activation and public-result-gate tests pass. No hidden
  production load, public status change, Blob upload, Vercel environment edit,
  deployment, or Git publication was performed while closing these review
  findings.

### 2026-08-08 - Minnesota hidden-load authorization hardening

- A post-merge release rehearsal stopped before the first production write
  when independent review found that the hidden-load runner did not bind the
  exact `GO_PRODUCTION` authorization bytes, treated differently cased versions
  of one name as distinct release people, and allowed execution after the
  recorded rollback-decision cutoff. The runner now requires the authorization
  artifact SHA-256 in both its CLI and environment acknowledgements, normalizes
  release identities with Unicode normalization plus case folding, and rejects
  execution after that cutoff.

- The documented release-overlay, release-review, and project-owner
  confirmation gates are now executable inputs rather than manual prose only.
  A deterministic `NO_GO_OWNER_CONFIRMATION` template pins the clean integration
  commit/tree and empty tracked-status hash; the project owner must explicitly
  complete it, and the runner rechecks the same tree and requires a different
  database operator.
  Their exact safe `.etl` paths and SHA-256 values are carried in the
  authorization, relationship-validated against the sealed package, and
  written into the hidden-load receipt. Backup evidence now proves that the
  backup follows preflight and that restore verification occurred at or after
  backup creation, is not future-dated, exactly matches every public table and
  row count, uses a read-only restored database, has zero invalid constraints,
  and remains within the same four-hour freshness window.

- The production release audit is persisted with the loaded Minnesota database
  metadata, not solely in the local post-commit receipt. It binds the exact
  authorization, overlay, review, confirmation, preflight, backup/dump,
  endpoint, authorization ID, transaction time, and public revision.
  Existing-row validation and the later public-activation transaction require
  exact semantic equality between the receipt audit and live database audit.
  The output path is reserved before opening PostgreSQL and finalized atomically
  after commit. If finalization fails, a separately acknowledged read-only mode
  can reconstruct a distinct recovery receipt from the exact blocked database
  audit and artifacts; it rejects revision or metadata drift and never retries
  the production mutation.

- The runbook now gives the executable order as read-only preflight, full
  restore-verified backup, exact two-person authorization, and hidden load. It
  also preserves the fail-closed rollback order: block the database while the
  gate-capable application is live, then restore only the pinned prior
  deployment.

- Expanded focused Minnesota release, activation, deterministic projection,
  and publication-gate tests pass, including authorization-byte tampering,
  backup/restore timing and exact counts, case-normalized roles, release-
  evidence binding, transaction-time cutoff revalidation, post-commit receipt
  failure/read-only recovery, and a mismatched hidden-load audit. TypeScript
  validation also passes. The candidate
  sealed before these changes is intentionally stale and cannot be used for a
  production release. No production database write, Blob upload, Vercel
  environment mutation, manifest activation, deployment promotion, or public
  data cutover occurred during this checkpoint.

### 2026-08-08 - Production data smoke isolation

- PR #211 exposed a live-environment regression rather than a change-local map
  failure: the deployed API was reading a newly connected starter Neon database
  containing only the Wisconsin, Minnesota, and Washington starter county rows.
  The 51-state geometry validator remained green, while the pull-request job's
  live request to `civicresultmaps.org` correctly found the other production
  county joins missing.

- Pull-request CI now gates the deterministic, repository-owned 51-state map
  geometry validation. Strict live map-join and provenance validation remains
  enabled in a separate scheduled and manually dispatchable production-data
  smoke workflow. That workflow has no soft-failure setting, so incomplete live
  data remains a visible production alarm without making an unrelated pull
  request's result depend on mutable production state.

- This workflow separation does not authorize or perform a production data
  promotion, database mutation, environment change, or Minnesota public
  activation. Restoring the complete production result corpus remains a
  separate reviewed production operation.

### 2026-08-08 - Minnesota local rehearsal publication-gate repair

- The clean merged-main release rehearsal found that the production
  publication gate correctly hid blocked Minnesota precinct result rows but
  also hid them from the explicitly guarded local-only rehearsal. The result
  API now bypasses that gate only after
  `resolveMinnesotaPrecinctRehearsal()` proves the process is running in
  development or test mode, uses the PostgreSQL driver in strict mode, and is
  connected to the loopback `crm_clone_dev` database on port 54329.

- Canonical manifests remain blocked and public production requests still
  require the exact reviewed database publication state. The rehearsal test
  now checks that the result-query path is wired to the guarded local adapter.
  Rehearsal result reads also bypass the persistent public-result cache so a
  blocked response cached before the guarded adapter is enabled cannot mask
  valid clone rows. These checks prevent another production-gate or cache
  change from silently making the required four-year browser rehearsal
  impossible.

### 2026-08-08 - Minnesota sole-owner release authorization

- The project owner confirmed that CivicResultMaps has one human maintainer.
  Minnesota production, public-activation, and rollback authorization templates
  therefore retain `TWO_PERSON` as the default while adding an explicit
  `SOLE_OWNER` human-control declaration for that operating model.

- Sole-owner authorization is fail-closed: all authorizer, operator, verifier,
  rollback-owner, confirmer, and approved-owner identifiers must normalize to
  the same person, and the exact acknowledgement records responsibility for
  authorization, execution, verification, and rollback. Automated agents must
  not be represented as a second human.

- The exception changes no release-data or cutover guard. Exact artifact
  hashes, clean Git evidence, production read-only preflight, full restore-
  verified backup, active windows, authorization-byte acknowledgement,
  transactional database validation, immutable Blob verification, deployment
  proof, fail-closed endpoint gates, and receipt-bound rollback remain required.
  Existing candidates and evidence must be resealed after this reviewed code
  change; no production mutation or public activation is authorized by the
  template alone.

### 2026-08-09 - Minnesota durable-audit JSONB validation repair

- The first guarded Minnesota hidden-load attempt reached its in-transaction
  validation and rolled back before commit because the durable release-audit
  comparison cast serialized JSON parameters directly to `jsonb`. With
  Postgres.js, that encodes the parameter as a JSON string scalar instead of
  decoding the serialized object.

- Reporting-unit and import-run audit comparisons now cast the parameters
  through `text` before `jsonb`. A focused regression test pins both casts and
  rejects the unsafe direct-cast form. The attempted transaction produced no
  receipt, public file, canonical activation, or production data change; a new
  package and evidence chain is required after this repair is merged.

- The same production investigation found that the public result query joined
  `reporting_units` even for county rows. Because migration 0008 correctly
  rolled back with the hidden load, that table did not exist; the caught SQL
  error silently returned the Minnesota, Washington, and Wisconsin starter
  rows and left 48 state maps empty. Non-gated county/state queries now use a
  compatibility path that does not reference precinct-only tables, while both
  Minnesota precinct paths retain the exact publication gate. The production
  database was not mutated during this incident response.

### 2026-08-09 - Minnesota post-repair release reseal

- A clean `feature/mn-precinct-map-activation` worktree was created from merged
  production commit `ccb8fa89e5816e80461cd07f40e388883f4b7eaa`. The 55
  reviewed local-only Minnesota source/normalized/crosswalk artifacts and four
  statewide delivery candidates were copied from the prior clean release
  worktree only after byte-for-byte SHA-256 comparison with the primary local
  copies found no difference. They remain untracked release inputs and are not
  candidates for Git publication.

- The strict loopback `crm_clone_dev` validator again proved 16,435 reporting
  units, 49,305 certified candidate rows, 16,435 geometry features, 16,435
  reviewed exact-ID crosswalks, 125 zero-vote units, and zero invalid
  constraints. The focused Minnesota precinct suite, complete repository test
  suite, TypeScript validation, and optimized production build passed.

- The guarded local rehearsal passed for all four tracked elections while the
  canonical manifests remained blocked. Hennepin County rendered and joined
  405/405 precincts for 2012, 422/422 for 2016, 425/425 for 2020, and 396/396
  for 2024. The browser check retained the official source terms and visible
  OpenStreetMap attribution and reported no failed API response, browser error,
  or framework overlay.

- A provisional post-repair package/overlay/review chain was generated as
  `d56a0bd04069...`, `e55e382a50a7...`, and `e8da7ac12601...`. This required
  ledger entry is itself a package-pinned dependency, so that provisional chain
  is intentionally superseded by the final reseal after this entry is
  committed. No production database write, Blob upload, Vercel environment
  change, canonical activation, deployment, or Git publication occurred.

### 2026-08-09 - Minnesota import-run durable-audit schema repair

- The next guarded hidden-load attempt passed migration execution and reached
  the in-transaction durable-audit checks, where it rolled back because the
  import-run audit query referenced a nonexistent `import_runs.metadata`
  column. The established import-run JSON document is stored in the required
  `summary` column, and the loader already writes `productionReleaseAudit`
  there.

- The validator now reads `import_runs.summary` while retaining the serialized
  text-to-`jsonb` comparison required by the prior repair. The focused SQL
  regression test pins the real schema column and continues to reject unsafe
  direct JSONB parameter casts. The failed transaction created no hidden-load
  receipt and made no production database, public-file, canonical-manifest, or
  deployment change.

- Because the validator and this ledger are package-pinned inputs, the prior
  `aec5476e19a3...` package and its preflight, backup authorization, and review
  chain are superseded. A fresh clean commit, local validation, package seal,
  preflight, and restore-verified backup are required before another production
  attempt.

### 2026-08-09 - Minnesota hidden load and immutable delivery completed

- Corrected release package `d0804cf50313...` passed strict loopback
  validation, the complete repository test suite, TypeScript validation, and
  the production build. A fresh production read-only preflight found migration
  0008 absent and zero invalid constraints. The subsequent full `public`
  backup restored and exactly matched all 27 tables before the guarded write.

- The coupled migration and four-election load committed as
  `COMMITTED_HIDDEN_NOT_PUBLIC` under receipt `fe5fc5cede9...`. Production now
  contains 16,435 Minnesota precinct reporting units, 49,305 certified
  candidate rows, 16,435 geometry features, and 16,435 reviewed exact-ID
  crosswalks. The transaction retained blocked geography-version status and
  `publicDeliveryAuthorized=false`; live Hennepin checks returned zero precinct
  rows and 404 geometry responses for 2012, 2016, 2020, and 2024.

- All 352 parent-scoped delivery objects (348 county GeoJSON files and four
  indexes, 124,197,990 bytes total) were uploaded to the existing public Vercel
  Blob store, downloaded again, and SHA-256 verified. Publication evidence
  `83ff6a673fdb...` records the single credential-free origin
  `https://ehnlruzhgkm5byoi.public.blob.vercel-storage.com`; canonical manifests
  and database publication status remained unchanged by the upload.

- The receipt-bound activation generator updated exactly the four annual
  coverage inventories and canonical manifest registry. Local rehearsal tests
  now prove that the obsolete blocked-manifest rehearsal cannot override an
  activated canonical manifest, and the release-candidate test proves an
  activated registry cannot be resealed as a blocked preimage. The 24-file
  Minnesota suite, national map/provenance validators, and production build
  pass. Public access remains fail-closed until the activation branch has a
  protected preview, is merged and deployed with the exact Blob origin, and a
  separately authorized database publication transaction completes the final
  cutover.

### 2026-08-10 - Minnesota publication postcondition JSONB cast repair

- Activation PR #215 merged and the exact activation tree was rebuilt in
  Production with the reviewed Blob origin. Fresh protected-Preview,
  Production, and prior gate-capable rollback-deployment checks all passed
  while the database remained blocked.

- The first guarded publication transaction revalidated the complete
  Minnesota GIS plan and performed its status changes inside PostgreSQL, but
  its final geography-version postcondition rejected the transaction and
  rolled everything back. Live precinct results remained empty, geometry
  remained 404, and no publication receipt was issued.

- Forced-rollback diagnostics proved that status, authorization flags,
  activation/package/Blob hashes, delivery origin, operation mode, and revision
  all matched for four versions. Only the rollback target comparison failed:
  the stored value was a JSON object, while the direct `$9::jsonb` parameter
  comparison interpreted the serialized expectation as a JSON string.

- Both publish and rollback postconditions now use the established
  `$9::text::jsonb` boundary used elsewhere in this release tooling. Focused
  regression assertions pin that exact cast for both operations. This repair
  requires its own reviewed deployment and fresh deployment-bound public
  authorization before the atomic database cutover is retried.

### 2026-08-10 - Texas four-election VTD precinct-map release preparation

- The official Texas Legislative Council election-specific VTD geometry and
  paired election-result products now cover every tracked presidential year.
  The reviewed plans contain 8,952 reporting units for 2012, 8,941 for 2016,
  9,157 for 2020, and 9,712 for 2024: 36,762 exact one-to-one relationships
  across all 254 county parents per election. The result pipeline groups each
  official candidate set into Democratic, Republican, and Other rows, yielding
  110,286 result rows and retaining 1,280 zero-presidential-vote VTDs.

- The former 2024 blocker was a source-layer mismatch. `Precincts24G` has
  9,657 administrative precinct polygons and cannot exactly color the 9,712
  TLC VTD result identities. The official `VTDs_24PG` resource instead has
  exactly 9,712 `VTDKEY` polygons and matches every result unit with no missing
  or extra geometry. `Precincts24G` remains contextual evidence only.

- Texas VTDs are census-geographic precinct approximations. CivicResultMaps
  stores them at the product's public `precinct` reporting grain so the shared
  county detail-map contract can resolve them, while every manifest, source
  note, and UI caveat must retain the explicit `VTD / precinct approximation`
  label. TLC VTD totals remain a distinct official local product and never
  replace certified Texas SOS county or statewide totals. The documented 2024
  difference remains 15,854 votes, principally the generic VTD Write-In scope;
  it is a source limitation, not evidence of misconduct.

- The loopback-only `crm_clone_dev` load and independent read-only validation
  passed with 36,762 reporting units, 110,286 result rows, 36,762 geometry
  features, 36,762 reviewed official crosswalks, four safely blocked geography
  versions, and zero invalid constraints. Production was not contacted or
  changed, and every public-delivery authorization flag remains false.

- Content-addressed package `41c2cc7f901b...` deterministically produces four
  immutable indexes and 1,016 county GeoJSON files. Public presentation
  coordinates are rounded to five decimal degrees without changing source
  artifacts, reporting identities, parents, or joins. The complete delivery is
  391,854,609 bytes; the largest county response is 4,254,829 bytes, below the
  enforced 4,350,000-byte response guard. The shared per-county feature cap is
  now 1,500 because Harris County has 1,070 election-specific VTD features.

- The package remains `NO_GO_PRODUCTION`, and no Blob object or production row
  was changed. A deterministic guarded-static activation added the four exact
  public draft manifests to the tracked registry and added Texas to each
  coverage inventory. This does not expose data by itself: both Texas precinct
  APIs now require the matching database geography version and all linked
  result/crosswalk/source flags to be published in one final transaction.

- The loopback SQL rehearsal performed the complete hidden load followed by the
  exact public cutover, verified 36,762 authorized units/crosswalks and 110,286
  result rows, then forced the enclosing transaction to roll back. The database
  revision and published-version count returned to their pre-test values.
  Production was not contacted. The operational sequence is pinned in
  `docs/developer/tx-precinct-release-runbook.md`.

- Independent release review found and closed three fail-closed gaps before the
  branch was published. Minnesota's local rehearsal bypass is now explicitly
  state-scoped and cannot bypass Texas. Both the read-only preflight and the
  write transaction reject any prior Texas precinct load, and the SQL rehearsal
  proves a second hidden load cannot re-block an already published release.
  Hidden-load and public-cutover runners now also provide hash-bound, read-only
  receipt recovery for ambiguous post-commit connection or filesystem failures;
  reused `.pending` evidence is preserved on unsuccessful recovery.

- The existing 2024 Texas advisory path remains separate: 9,348 native review
  rows calculate 309 advisory indicators across 172 county/jurisdiction areas
  (`vote_share_pattern`, `average_down_ballot_difference`, and one
  `down_ballot_outliers` row). Those are source-review signals only, not
  findings of fraud or misconduct.

### 2026-08-11 - Nevada four-election precinct-source reconstruction

- A deterministic four-election collector now verifies every retained raw
  source by exact byte count and SHA-256 before writing normalized artifacts.
  Each year produces a source-evidence document, a vote-free EPSG:4326 GeoJSON
  archive, a separately compressed presidential-result document, a reviewed
  result-to-feature crosswalk, a reconciliation report, and a fail-closed
  manifest. Replaying all four collectors produces byte-identical output.

- The 2012 candidate starts from the official Nevada Secretary of State
  precinct export: 2,023 presidential source units across all 17
  county-equivalents. Cells suppressed for ballot secrecy remain unknown and
  are never coerced to zero or estimated. Official Clark election GIS and
  reviewed Census rural VTD relationships are retained. Washoe uses a clearly
  labeled 2016 proxy partition only where the county change log does not record
  a post-2012 boundary change; 14 known changed precinct codes are rejected.
  The resulting local plan has 2,020 polygon features, 1,760 safely colorable
  units, 1,778 reviewed relationship records, and 263 exclusions. Its boundary
  vintage remains `unknown`, and 242 retained polygons have no result data.
  Five result units use reviewed one-to-many geometry relationships, which the
  public delivery builder deliberately rejects until an aggregate-rendering
  contract is designed. The year cannot be published until the election-date
  Washoe archive is obtained from the Nevada SOS, LCB Research Library, or
  Washoe County custodian and that rendering decision is reviewed.

- The 2016 VEST V1.2 election-specific reconstruction has 2,067 polygons and
  2,067 exact source-record relationships across all 17 county-equivalents.
  Its three-bucket presidential total is 1,125,385. The database content is
  documented as CC BY 4.0 and must be credited to VEST. The retained official
  LCB `ElectionResults2016USPres.pdf` has SHA-256
  `e61953a77b75326fbfb577eae4e3261e07dd97a253aa32ee0a4cfd19f8cec53a`,
  attributes its election data to the Nevada Secretary of State, and publishes
  47.92% Democratic, 45.50% Republican, and 6.58% other. The collector proves
  those percentages from the exact normalized totals. This remains a secondary
  reconstruction, not an official Nevada row-level export, so public release is
  blocked pending the original machine-readable source/crosswalk or an explicit
  reviewed supplemental-source decision.

- The 2020 VEST artifact is pinned to Harvard Dataverse file `4863168`, dataset
  version `21.0`, with SHA-256
  `bc6befa8917bb309540ff3414c036a577730bd301ecef119797b919c0abb2d90`.
  It has 2,094 statewide polygons and exact source-record relationships and a
  three-bucket presidential total of 1,405,376. The current DOI has advanced to
  later dataset versions and advertises custom terms. Because the exact
  version-21 redistribution terms have not been retained, this year remains
  publication-blocked even though its geometry and crosswalk validate.

- The 2024 candidate pairs the official April 5, 2024 Nevada Legislative
  Counsel Bureau precinct layer with the official Nevada Secretary of State
  presidential precinct export. It retains all 1,726 official polygons and all
  17 county-equivalents, colors 1,518 reviewed exact-ID units, and excludes 153
  unsafe result identities. Exactly 208 polygons are reviewed no-data features:
  115 correspond to excluded major-party-suppressed result identities and 93
  lack a retained joinable result identity. Twenty-nine source result identities
  have no matching feature and are not invented as polygons. The safely
  colorable three-bucket total is 1,484,382. Retained ArcGIS item metadata
  (SHA-256 `72b5f30fc8eafb7e790c559858afe94c9f9419a9078ee09a9ee39ea849edef70`)
  identifies the public-authoritative layer as Nevada voting precincts for the
  2024 election cycle; retained layer metadata (SHA-256
  `23f1c9cd1d2ec61d07f84b6b7befef723fa5e31720f16d66da9e02348cdb4643`)
  records static Query/Extract data and April 2024 edit timestamps. Both
  `licenseInfo` and `copyrightText` are empty, so public derivative
  redistribution remains blocked pending affirmative retained terms.

- Migration `0009_public_wolfpack.sql` adds the explicit
  `secondary_reconstruction` and `hybrid_reconstruction` derivation methods.
  The shared publication matcher now distinguishes total polygon count from
  reviewed relationship and reporting-unit counts, which is required for
  legitimate no-data polygons without weakening the public gate. The manifest
  contract now pins reviewed relationship-record and reviewed no-data-feature
  counts; the delivery builder preserves declared no-data polygons with
  non-result identities. One-to-many or many-to-one relationships remain
  explicitly public-ineligible until aggregate rendering is implemented.

- The loopback-only `crm_clone_dev` load and independent read-only validation
  pass with 7,439 reporting units, 22,317 candidate rows, 7,907 polygon
  features, 7,457 reviewed relationship records, four safely blocked geography
  versions, and zero invalid constraints. The focused Nevada suite passes all
  collector replay, suppression, source-gate, plan, schema, and publication-
  gate assertions.

- This work does not authorize public delivery. All four years retain explicit
  source gates: the 2012 Washoe archive, official row-level provenance or an
  approved supplemental-source decision for 2016, exact version-specific terms
  for 2020, and affirmative LCB derivative-redistribution terms for 2024. The
  2012 aggregate-rendering decision also remains unresolved. No production
  database row, canonical manifest, Blob object, Vercel setting, or deployment
  was changed.

### 2026-08-11 - Nevada public-source alternatives exhausted before records requests

- Public alternatives closed the 2016 result-provenance gate. The exact
  official NVSOS statewide precinct export is retained and supplies every
  normalized vote value. It contains 2,002 presidential source units across
  all 17 county-equivalents. After excluding 40 special/non-geographic units
  and 119 units with an unknown major-party privacy-suppressed cell, 1,843
  units are safely colorable. They join by reviewed county/precinct identity
  to 2,067 VEST election-specific geometry features; 224 polygons remain
  explicit no-data. The known-colorable total is 1,122,216. VEST is now used
  only for attributed CC BY 4.0 geometry, never for displayed vote values.

- Public alternatives also closed the 2020 result and terms gates. The exact
  official NVSOS statewide precinct export supplies every normalized vote
  value. It contains 2,012 source units; 21 special/non-geographic units and
  122 major-party-suppressed units are excluded, leaving 1,869 colorable units
  joined to 2,094 VEST geometry features and 225 explicit no-data polygons.
  The known-colorable total is 1,404,657. A retained evidence record pins
  Harvard Dataverse file 4863168 to dataset version 21.0 and the version-pinned
  Terms tab's Creative Commons Attribution 4.0 grant.

- The 2024 redistribution gate is closed without an email. The retained LCB
  ArcGIS item is public and `public_authoritative`, says it covers Nevada's
  2024 election cycle, permits Query and Extract, and states no additional use
  constraint. Retained ArcGIS Online Terms of Use expressly grant end users
  permission to use, reproduce, prepare derivative works of, and distribute
  publicly shared content subject to owner-stated constraints. A subsequent
  Clark County Statement-of-Vote review, documented below, narrows this raw
  1,726-feature source layer to 1,635 election-relevant polygons rather than
  treating every administrative shape as a reporting precinct.

- The 2012 rendering blocker is also closed locally. Five reviewed multipart
  precincts, formerly represented by 23 relationship records, are
  deterministically retained as five MultiPolygon features without coordinate
  union or boundary edits. The normalized set is 2,002
  features with 1,760 one-to-one result relationships and 242 no-data
  features. The only remaining external four-year map-source gate is the
  election-date Washoe 2012 archive; broad public web, archive, statutory
  catalog, LCB library-index, current county-service, and likely historical URL
  checks did not expose the underlying map/GIS files.

- This work still authorizes no public delivery or production write. The
  2016, 2020, and 2024 source/crosswalk gates are ready for immutable delivery
  package implementation and review. An all-four release remains blocked only
  by the Washoe 2012 vintage evidence. A loopback-only database replay and
  independent read-only validation pass with 6,990 reporting units, 20,970
  result rows, 7,889 features, 6,990 reviewed one-to-one relationships, four
  safely blocked geography versions, and zero invalid constraints.

### 2026-08-11 - Nevada three-election guarded release implementation

- Nevada 2016, 2020, and 2024 now have a deterministic content-addressed
  release package. Its corrected v2 contract contains 5,288 displayable
  reporting units, 15,748 result rows, 647 zero-vote units, 5,796 polygons,
  5,288 reviewed exact one-to-one relationships, and 508 reviewed no-data
  polygons. Each year
  covers all 17 county-equivalents. Nevada 2012 is excluded from the package
  and canonical registry; the election-date Washoe archive is tracked in
  GitHub issue #220.

- The package produces three immutable indexes and 51 county GeoJSON files.
  Presentation geometry is rounded to seven decimals and simplified at a
  0.000005-degree tolerance, keeping every precinct feature and join identity
  while reducing the largest county response below the existing 4,350,000-byte
  safety limit. Source and normalized geometry artifacts remain unchanged and
  hash-pinned. One zero-area polygon part in a retained MultiPolygon is omitted
  from presentation bytes while the feature's valid polygon part remains.

- Guarded operational tooling now covers plan-first Blob publication, read-only
  production preflight, a full public-schema backup with exact restore proof,
  hash-bound sole-owner authorization, coupled migration 0009 and hidden load,
  durable production audit metadata, guarded static activation, atomic database
  publication, and read-only receipt recovery for ambiguous hidden-load or
  publication commits. The static manifests do not open either API while the
  database status remains blocked.

- A loopback transaction rehearses the exact three-year hidden load and final
  public publication, validates 5,288 authorized units and crosswalks, 15,748
  result rows, and 5,796 features, rejects a replay, and then deliberately
  rolled back. The local public revision and published-version count returned
  to their pre-test values. No production database, Blob object, Vercel setting,
  deployment, or GitHub merge was changed by the rehearsal.

- The shared publication matcher now permits Nevada's explicit
  `nv-precinct-gis-three-election-v*` identity while preserving Minnesota and
  Texas four-election identities. The end-to-end sequence and stop conditions
  are documented in `docs/developer/nv-precinct-gis-runbook.md`.

### 2026-08-12 - Clark County 2024 result-completeness correction

- The official Clark County Election Department presidential Statement of
  Vote is now retained at
  `data/precinct-geometry/NV/2024-11-05-general/raw/clark-county-election-department/2024-general-president-statement-of-vote.txt`.
  The collector verifies its 197,621 bytes and SHA-256
  `2fedeb8f8457b9a66d05ee9f6141a2bbf6b1074281198858dec1c0cbd0041380`
  before parsing. Its 916 `Totals` rows reconcile to 1,491,072 registered
  voters, 1,033,285 ballots cast, and 1,031,223 presidential votes.

- The prior 2024 delivery incorrectly treated 149 raw Clark LCB shapes as
  no-data map features. The official result-universe comparison now retains
  exactly 910 Clark election-reporting polygons, and every one has an official
  result relationship. Eight hundred fifty-two have complete candidate
  detail. For 58 low-count precincts the Statement of Vote supplies exact
  registration, turnout, and total presidential votes (164 votes combined),
  while candidate allocation remains legally suppressed. The normalized
  result contract records those exact totals in a distinct
  `candidate_detail_suppressed` state; it never estimates a candidate split,
  winner, or margin.

- Ninety-one Clark shapes in the raw LCB layer do not occur in either the
  official statewide result export or the county Statement of Vote. They are
  retained in the reconciliation report as source-feature exclusions and are
  omitted from the election-specific map rather than mislabeled as precincts
  with missing results. Six county Statement-of-Vote identities have no LCB
  geometry: five are zero-vote units and special unit 9996 reports 40 votes.
  None is assigned an invented polygon.

- The corrected 2024 statewide contract has 1,635 election-relevant polygons,
  1,576 reviewed one-to-one result relationships, 59 reviewed no-data polygons
  outside Clark, 4,612 result rows, and a displayable presidential total of
  1,484,546. The three-year immutable release identity is bumped to
  `nv-precinct-gis-three-election-v2`; all production count guards and public
  activation inputs are resealed so the old blank-feature package cannot be
  replayed as this release.

### 2026-08-12 - Nevada reviewed v1-to-v2 production replacement guard

- The corrected v2 static registry can be deployed while the database still
  contains published v1 rows; both geometry delivery and the corrected map stay
  fail-closed because the registry and database release hashes do not match.
  The normal hidden-load tool intentionally rejects that existing release, so a
  separate reviewed replacement contract is required rather than bypassing the
  replay guard or issuing manual SQL.

- The replacement contract is pinned to the exact retained v1 public receipt
  SHA-256 `7725db704181321f8dca9717b6902387bcecbd424975a1b29e0e8e0aea43fc4e`,
  v1 package SHA-256
  `0546735717fd46f501c23d931160fc45baf8f9b123f97faa5410bf684f951c9a`,
  public plan, hidden receipt, Blob receipt, authorization, delivery origin,
  activation ID/time/revision, and per-year predecessor counts and totals. The
  authorization decision is `GO_PRODUCTION_UPGRADE` and carries the additional
  `replace_reviewed_nv_precinct_release_v1_with_v2_hidden` scope plus an exact
  environment receipt-hash acknowledgement.

- Inside the locked transaction, the tool independently verifies the three
  published v1 geography versions, public flags and activation metadata, 5,230
  reporting units and crosswalks, 15,690 result rows, 5,887 features, candidate
  totals, zero-vote units, six source documents, three import runs, and zero
  invalid constraints. Only then does it remove the three v1 geometry versions,
  upsert the sealed v2 contract, validate 5,288 units/crosswalks, 15,748 result
  rows, and 5,796 features, leave every v2 public flag blocked, and increment the
  public revision. The exact predecessor proof is persisted in the durable
  release audit and hidden receipt; a replay cannot satisfy the v1 precondition.

- The transaction was rehearsed against the fresh restore-verified production
  backup in the fixed Docker clone. It upgraded the exact published v1 state to
  blocked v2, rejected a second replacement attempt, validated all corrected
  counts, and deliberately rolled back. The clone returned to the original
  published v1 revision and three-version state.

### 2026-08-12 - Iowa four-election collection and guarded three-election release

- Complete official Iowa Secretary of State presidential precinct result
  universes are retained and deterministically replayed for all four target
  years. Iowa has 1,686 geographic result units and 5,058 candidate rows in
  2012, 1,680 and 5,040 in 2016, 1,661 and 4,983 in 2020, and 1,653 and 4,959 in
  2024. County and statewide candidate totals reconcile exactly, and no
  geographic unit has a zero presidential total. One all-zero Dallas 2012
  `ABSENTEE` row remains explicitly non-geographic.

- The 2016 reviewed layer contains 1,680 exact one-to-one joins to the official
  Iowa LSA/SOS election-cycle precinct geometry through a retained identity
  bridge. The 2020 layer contains 1,661 exact joins to the version-pinned VEST
  election-specific geometry under retained CC BY 4.0 terms. The 2024 layer
  contains 1,653 exact joins to the New York Times official-boundary
  compilation; every source feature declares `official_boundary=true`, and the
  retained C-UDA v1.0 Non-Commercial terms govern downstream delivery. Every
  displayed vote remains sourced only from the Iowa Secretary of State.

- Iowa 2012 remains fail-closed. Fifty-two official county map PDFs are
  retained, but the archive is not statewide. A later 2014 layer is kept only
  as a change diagnostic: four 2012 result identities lack later geometry and
  seven later polygons have no 2012 result identity. No later boundary is
  backcast. The remaining archive acquisition and acceptance criteria are
  tracked in [GitHub issue #223](https://github.com/Camreyn/civicresultmaps/issues/223).

- The content-addressed three-election package contains 4,994 reporting units,
  14,982 candidate rows, 4,994 polygons, 4,994 reviewed exact crosswalks, 297
  county objects, and three indexes. The loopback-only `crm_clone_dev` load and
  independent read-only validation pass with zero invalid constraints. The
  immutable package, canonical activation, production preflight, full backup
  and restore proof, sole-owner hidden load, Blob publication, database-gated
  deployment, atomic public cutover, and read-only receipt-recovery paths are
  documented in `docs/developer/ia-precinct-gis-runbook.md`.

- The follow-up Iowa rollback contract binds a new `GO_ROLLBACK` authorization
  to the exact successful publication receipt and reloads the original
  hash-pinned `GO_PUBLIC` authorization. The original receipt's activation,
  revision, time, delivery origin, authorization hash, and gate-capable rollback
  deployment are checked again inside the locked transaction. The database is
  blocked first across all three geography versions, crosswalks, reporting
  units, source records, and import runs; original caveats and publication
  provenance remain intact under a nested rollback audit. Only afterward may
  the exact pinned application deployment be restored. An ambiguous commit has
  a read-only, receipt-recovery path that preserves the pending marker on failed
  reconciliation.

- This work performs no production database mutation, Blob upload, Vercel
  setting or deployment change, canonical activation, or public eligibility
  transition. The three public years remain blocked until the complete guarded
  sequence is separately reviewed and authorized; 2012 remains outside that
  release.

- The separate native 2024 ETL remains valid with 1,653 precinct review rows.
  Its required advisory report calculates 134 indicator rows across 73 county
  jurisdictions: 70 `vote_share_pattern` and 64
  `average_down_ballot_difference` rows. Because the comparison contest is
  district-based U.S. House and the signal is broad, these remain advisory
  review inputs rather than evidence of fraud or misconduct. No production
  promotion or production indicator-count check was performed in this task.

### 2026-08-13 - Maine four-election local-reporting-unit collection

- Maine's official statewide presidential workbooks do not expose one uniform
  precinct grain. They mix towns, plantations, townships, voting districts,
  and combined local units. The new contract therefore uses
  `local_reporting_unit`; it never relabels every unit as a precinct, copies a
  town total onto multiple ward polygons, or allocates votes by area or
  population.

- `scripts/collect-me-local-reporting-geometry.mjs` now parses the retained
  Maine Secretary of State workbooks for all four target elections. Those
  workbooks are the sole source of displayed votes. Secondary geometry vote
  fields are stripped before normalization. Deterministic replay retains
  manifests, source evidence, normalized geometry and result universes,
  reviewed crosswalks, and reconciliation reports under
  `data/precinct-geometry/ME/`.

- The reviewed 2016 package maps all 532 official rows and all 743,941 votes.
  The 2020 package maps all 516 rows and all 813,742 votes. The 2024 package
  maps all 512 source rows and 824,806 votes into 494 shapes: 34 small source
  rows are summed exactly into 16 published official-boundary units, with
  every constituent identity retained. The T22 MD gap is accepted only after
  proving the official boundary's area and bounds are unchanged between the
  retained July 2015 and current GeoLibrary snapshots.

- The 2012 package remains partial and fail-closed. It maps 540 of 545 source
  rows into 507 reviewed local shapes and represents 710,118 of 710,126 votes.
  Five rows totaling eight votes have no unique polygon. The candidate uses a
  retained MGGG secondary election reconstruction whose exact official
  November 2012 boundary edition and derivative redistribution permission are
  unresolved. The retained July 2015 official GeoLibrary archive documents
  source lineage only and is not backcast to election day. The omitted rows
  and totals are explicit; no shape is guessed.

- The exact MGGG ZIP and README are retained for 2012, and its unresolved
  derivative terms remain a public-release blocker. Version-specific VEST CC
  BY evidence is retained for 2016 and 2020. The 2024 NYT C-UDA Non-Commercial
  terms and attribution are retained. Maine's official GeoLibrary reuse statute
  is retained for the original boundary source. All four manifests remain
  blocked with `delivery: null`; this change performs no
  database load, Blob publication, canonical activation, deployment, or public
  eligibility transition. The next release phase is documented in
  `docs/developer/me-local-reporting-gis-runbook.md`.

- The required native 2024 advisory report still evaluates all 512 Maine
  review rows and calculates 42 advisory indicator rows across 16 county
  jurisdictions: 10 `vote_share_pattern`, 16
  `average_down_ballot_difference`, and 16 `down_ballot_outliers`. All 16
  evaluated county jurisdictions receive at least one broad-signal advisory.
  Because the comparison contest includes a major independent U.S. Senate
  candidate, these are directional review inputs rather than evidence of fraud
  or misconduct. Production was neither promoted nor queried for indicator
  counts in this collection task.

### 2026-08-13 - Maine guarded three-election local release tooling

- The application publication contract now maps Maine specifically to
  `local_reporting_unit`. Existing IA, MN, NV, and TX releases remain pinned to
  `precinct`. Manifest lookup, exact database publication checks, parent-scoped
  result queries, delivery joins, and map copy all preserve the selected grain.
  A Minnesota-only local rehearsal cannot bypass Maine's publication gate.

- New deterministic Maine plan, local setup, read-only validation, release
  candidate, production preflight, full backup/restore proof, hidden-load,
  immutable Blob publication, static activation, database publication,
  database-first rollback, and read-only receipt-recovery tools cover only
  2016, 2020, and 2024. The loaders use Maine SOS values exclusively and reject
  2012 at plan construction.

- The exact three-election plan contains 1,542 reporting units, 4,626
  candidate rows, 1,542 polygons, and 1,542 reviewed relationships across all
  16 counties per year. It produces 48 parent-scoped GeoJSON files followed by
  three hash-pinned indexes. The one official 2020 zero-vote unit is retained.

- The fixed loopback `crm_clone_dev` load and an independent read-only
  validation passed with exact per-year feature, result, relationship, and vote
  totals, zero invalid constraints, all versions blocked, and all public
  authorization flags false. The resulting immutable local candidate is
  `me-local-reporting-gis-three-election-v1`; its package SHA-256 is
  `9c92f333130825f3e573de75d927878ecc2cb782550642cda4b3f763d4f3e4f6`.
  A dry static-activation plan produced exactly the registry plus three
  coverage-ledger outputs and did not write them.

- Maine 2012 remains separately fail-closed and tracked in issue #230. Its five
  unmatched source rows/eight votes, election-vintage uncertainty, and
  unresolved derivative redistribution permission are not waived by the
  three-election tooling.

- This implementation performs no production database mutation, public Blob
  upload, Vercel environment or deployment change, canonical registry change,
  or public eligibility transition. The guarded operational sequence is in
  `docs/developer/me-local-reporting-gis-runbook.md`.

### 2026-08-14 - Alaska four-election precinct collection

- Alaska now has deterministic, election-specific precinct packages for the
  2012, 2016, 2020, and 2024 presidential general elections under
  `data/precinct-geometry/AK/`. Displayed votes come only from Alaska Division
  of Elections artifacts. Normalized geometry carries source and CRM identity
  metadata but no candidate, party, or vote fields.

- The source universes contain 438 geographic and 120 non-geographic units in
  2012; 441 and 121 in both 2016 and 2020; and 402 and 121 in 2024. Absentee,
  early-voting, questioned-ballot, and federal-overseas buckets are retained
  for exact statewide reconciliation but receive no polygon and cannot be
  painted on the map. The visible geographic vote totals are therefore
  explicitly smaller than the official statewide totals.

- The 2016 and 2020 maps use the official 2013 plan; 2024 uses the official
  2023 final plan. The 2012 map uses a commit-pinned public mirror of the
  April 5, 2012 amended-proclamation plan, reconciled against official result
  identities and official successor-plan evidence. Its secondary custody and
  lack of a stated formal license remain visible caveats. One source DBF typo,
  `36-616`, is corrected to official result ID `36-040` only after exact
  topology, area, population, and name checks identify Lake Iliamna No. 1.

- The collector restores the 2020 write-in rows from all 41 official Statement
  of Votes Cast PDFs, producing exact certified presidential and Senate totals.
  The 2024 presidential rows also reconcile exactly. The 2024 U.S. House
  comparison remains named-candidate context only because the precinct export
  omits 750 statewide write-in votes.

- Each election preserves its own boundary vintage. The application does not
  imply that the same precinct identifier or polygon is stable across years.
  Apples-to-apples trends require a separate reviewed common-geography
  crosswalk or areal translation with explicit split/merge treatment.

### 2026-08-14 - Alaska guarded four-election release tooling

- The application now supports Alaska's exact House District parent contract,
  `HD01` through `HD40`, without forcing precincts into borough or county-
  equivalent parents. API validation, immutable delivery lookup, map joining,
  and the House District selector use the same contract. IA, ME, MN, NV, and TX
  retain their prior parent/grain behavior.

- The fixed loopback clone successfully loaded and independently validated all
  four elections: 2,205 reporting units, 12,021 geographic presidential result
  rows, four blocked geography versions, 1,722 polygons, 2,205 reviewed
  relationships, and zero invalid constraints. Every public-delivery flag is
  false. The 483 non-geographic units remain query-ineligible map metadata.

- Deterministic guarded tooling now covers local plan/setup/validation,
  candidate sealing, read-only production preflight, full restore-verified
  backup, hidden-load receipt recovery, immutable Blob planning/publication,
  static activation, atomic database publication, database-first rollback, and
  read-only publication-receipt recovery. Initial production preflight rejects
  any preexisting Alaska release rows.

- The sealed local candidate is `ak-precinct-gis-four-election-v1`, SHA-256
  `270e3c771cfb7544ef9c9b4c1b4963babf448327ddeb4846d24e45dfcf969749`.
  It produces 160 House-District-scoped GeoJSON objects followed by four
  indexes (164 immutable public objects total), with no election values in
  delivery geometry. Static activation would change only the registry and the
  four year-specific coverage inventories while both public APIs remain
  database-gated.

- This task performs no production database mutation, Blob upload, Vercel
  environment/deployment change, canonical activation, or public eligibility
  transition. The reviewed sequence is documented in
  `docs/developer/ak-precinct-gis-runbook.md`.

### 2026-08-14 - Alaska guarded production staging and static activation

- A fresh package resealed from merged commit `4406cbb7` is
  `ak-precinct-gis-four-election-v1`, SHA-256
  `0eefe7cc4690876a76d8cc7b5e5ae5ea7fc04264ead3304a12e98dcfe218c3e5`.
  A fresh production preflight found no preexisting Alaska release rows, and a
  full 31-table public-schema backup was restored with exact table and row
  counts before the guarded write.

- The four-election package is now loaded in production in the hidden,
  database-blocked state at public data revision 16. Both Alaska result and
  geography APIs were checked after the transaction and remained closed. The
  164 immutable delivery objects were then uploaded parent-first, downloaded,
  and hash-verified; the Blob evidence SHA-256 is
  `a7a979c1e2f523973a5935036eb81e3b948021e14bc28b8bd15eb592aa072064`.

- The static activation candidate SHA-256 is
  `d386d7210e25bf8bab1c027cb42de56429095f836ec359cd4ddb16a6ea816c61`.
  It changes only the manifest registry and the four year-specific coverage
  inventories. An off-by-one guard in the atomic writer was corrected to
  require those exact five outputs. Deployment of these files still cannot
  expose Alaska data until the separately authorized atomic database
  publication transaction succeeds.

### 2026-08-14 - Merge-gated public API verification

- Pull requests now boot the real application in a separate `Public API
  integration` GitHub job and exercise public HTTP routes before merge. The
  reusable smoke suite checks response content types and envelopes, CORS,
  state/year/grain filters, historical Alaska isolation, publication-gated
  result and geometry behavior, and invalid parent/date errors.

- The same smoke suite runs against `civicresultmaps.org` after every successful
  Vercel production deployment. The pre-merge check is hermetic and uses seed
  fallback data; the post-deployment check requires database-backed responses
  and requires the public alias to report the exact triggering deployment Git
  SHA. Neither check mutates election data or publication state.

### 2026-08-14 - Alaska publication receipt recovery correction

- Alaska's read-only public-cutover receipt recovery now requires all four
  election geography versions. The prior guard incorrectly retained a
  three-version count from a three-year release pattern, which would have
  rejected recovery after an ambiguous successful Alaska commit.

- A focused regression assertion pins the four-version recovery contract and
  rejects reintroduction of the stale three-version condition. The normal
  publication transaction, source artifacts, manifests, and public eligibility
  are unchanged.

### 2026-08-14 - Alaska four-election production publication complete

- Production deployment `dpl_G5oQrrA97nv3TWcRgWZPqSzBQefA`, Git commit
  `031b8857d3cd24c7b417ca40d47fc31b9542d1f9`, was verified `READY` and
  `PROMOTED` with the exact static Alaska registry and immutable Blob origin.
  Before publication, all four eligible manifests were visible while both the
  result and geometry APIs remained closed for 2012, 2016, 2020, and 2024.

- The hash-authorized atomic database transaction used publication plan
  SHA-256 `10eec31062436626ffd2f668e03e72042e790f137c52e7286593879bdf4d0265`
  and activation ID `ak-public-20260814T213902Z-031b8857`. It published all
  four reviewed geography versions, authorized only their linked geographic
  result units and retained release metadata, and advanced the public data
  revision from 16 to 17.

- The immutable publication receipt is
  `.etl/production-publication-receipts/AK/ak-precinct-publish-10eec3106243-ak-public-20260814T213902Z-031b8857.json`,
  SHA-256 `6661c3be4355cf65c89456a968d87dde4d09276b8047b8907d377796458ce42f`.
  The pinned rollback target is the preceding gate-capable production
  deployment at commit `f4b5c87b4e00d58b2f6996d321c2861a838dd869`.

- Post-cutover verification exercised both public endpoints for every one of
  the 40 House District parents in every election. Served result rows and
  polygons matched exactly: 438 in 2012, 441 in 2016, 441 in 2020, and 402 in
  2024. Administrative parent `HD99` was rejected with HTTP 400 in all four
  years. The production API smoke passed against the exact deployment SHA.

- Browser verification loaded the OpenStreetMap-backed precinct detail map,
  joined result rows, source/vintage text, and correct election title for all
  four years with no console errors. The 2020 Exports & API view also retained
  `year=2020` and displayed year-pinned public API paths rather than reverting
  to 2024.

### 2026-08-14 - Michigan official four-election precinct source review

- Michigan now retains hash-pinned official precinct-result ZIPs and official
  election-cycle geometry for 2012, 2016, 2020, and 2024. The deterministic
  builder verifies every raw byte before parsing or writing and emits a
  vote-free normalized geometry, official normalized result rows, explicit
  relationship records, source evidence, a review report, and a fail-closed
  manifest for every election.
- The reviewed 2024 package maps all 4,347 official geographic source
  identities to all 4,340 official polygons without proportional allocation.
  It retains seven duplicate/cross-county source identities as aliases and all
  87 statistical or absent-voter-counting-board units as non-geographic. The
  official presidential total is 5,664,186. Exact matching uses 3,866 parent
  composites, eight statewide cross-county composites, and 473 unique official
  county/municipality/precinct relationships after ward-convention review.
- The historical packages remain explicit evidence rather than public maps.
  The 2012 package has 4,862 matched units and 12 unlinked polygons plus an
  election-snapshot/count/redistribution-terms block. The 2016 package has
  4,788 matched, 21 unresolved, and 22 unlinked. The 2020 package has 4,699
  matched, 51 unresolved, and 53 unlinked; two repeated source geometry IDs are
  correctly merged into 4,752 unique polygon identities, while AVCB and
  statistical rows remain unallocated.
- The coverage ledgers record Michigan for all four years. Public eligibility
  stays zero because no Michigan manifest is added to the canonical public
  registry in this change. The 2024 next step is separately reviewed guarded
  local-DB, immutable county delivery, hidden production load, deployment gate,
  and atomic publication tooling. Historical activation remains blocked until
  each documented source/crosswalk issue is resolved.
- The replay test rebuilds all four packages under an alternate root and
  requires byte-identical output. It also corrupts a copied official ZIP and
  proves the raw-source preflight rejects it before any derived file changes.
  Cross-election labels and shapes are never assumed stable; apples-to-apples
  comparison still requires a separate reviewed common-geography crosswalk or
  aggregation to a stable higher-level geography.
- The normal Michigan 2024 ETL still emits 4,428 native review rows. The
  advisory report calculates 128 screening rows across 77 flagged
  jurisdictions/areas: 70 `vote_share_pattern` rows and 58
  `average_down_ballot_difference` rows. These are review signals only, not
  evidence of fraud or misconduct. This source-package task did not promote
  staging or query production API/database indicator counts.

### 2026-08-14 - South Carolina four-election precinct source review

- South Carolina now retains the exact official Election Commission
  presidential contest CSV for 2012, 2016, 2020, and 2024. A deterministic
  builder verifies every raw artifact before parsing or writing and emits
  vote-free normalized geometry, official normalized result rows, explicit
  relationship records, source evidence, a review report, and a fail-closed
  manifest for each election. Earlier ledger-only RFA/Census diagnostics are
  superseded by these materialized packages.
- The reviewed 2016 package collapses only the two source polygons for Laurens
  6 into one multipart feature and maps 2,232 official geographic result rows
  one-to-one. Hall's Store is an official zero-vote row with no reviewed
  feature and remains a no-geometry reconciliation row. The 318 countywide
  administrative rows and 513,066 votes are never allocated; two unlinked
  geometry features remain explicit reviewed no-data shapes.
- The reviewed 2020 package maps all 2,261 geographic result rows to the
  election-specific VEST geometry attributed to South Carolina RFA. The 138
  administrative rows and 9,109 votes remain non-geographic, and two unlinked
  features remain explicit no-data shapes. VEST documentation says its source
  vote fields include allocated countywide provisional/failsafe values, so
  every such field is stripped and no VEST vote is eligible for display.
- The reviewed 2024 package maps all 2,308 official geographic rows to 2,308
  NYT features marked `official_boundary=true` by county and a unique complete
  presidential vote signature. The geographic total is 2,541,877. The 138
  administrative rows account for the exact remaining 6,263 official votes
  and are never assigned to polygons. NYT non-commercial attribution terms are
  retained and must accompany any future delivery.
- The 2012 package retains 2,477 official result rows, 1,964,118 presidential
  votes, and 2,155 RFA-origin candidate features from a July 2013 archive, but
  approves zero result relationships. Exact November 2012 applicability,
  affirmative derivative terms, and an official or independently reviewable
  result crosswalk remain unresolved; 2012 stays outside the public registry.
- All four coverage ledgers now record South Carolina. The 2016, 2020, and
  2024 crosswalks are reviewed, but public eligibility remains zero because
  immutable county-scoped delivery and guarded database/deployment activation
  are separate future changes. Each election retains its own boundary vintage;
  the packages do not imply that precinct shapes are stable across elections.
- The normal 2024 South Carolina ETL still validates with 46 result rows,
  2,401 native review rows, 46 turnout rows, and nine configured sources. The
  advisory report calculates 78 screening rows across 45 flagged counties:
  41 `vote_share_pattern` rows and 37 `average_down_ballot_difference` rows.
  These are review signals only, not evidence of fraud or misconduct. This
  source-package task does not promote staging or mutate production data.

### 2026-08-15 - South Carolina guarded three-election release tooling

- The guarded release plan now accepts only 2016, 2020, and 2024 and rejects
  2012 before any database or delivery action. It loads 7,396 reporting units,
  20,403 official candidate rows, 6,805 geometry features, and 7,396 reviewed
  relationships. All 595 administrative units remain non-geographic, and the
  four reviewed no-data features remain visible without invented results.
- Local clone rehearsal completed with three blocked geography versions,
  exact per-year result and geometry counts, public delivery disabled, and
  zero invalid constraints. The deterministic local-development candidate
  `sc-precinct-gis-three-election-v1` was sealed from that validation as
  SHA-256 `f3ee8f4bb78ee154eab8e89c427951b01386ea18a19d0b0bef22ee95667a6bed`.
  It contains 138 county-scoped GeoJSON objects followed by three indexes, with
  no election values in geometry delivery. Production evidence must use a new
  candidate resealed from the exact clean merged commit.
- South Carolina is added to the shared fail-closed publication contract. The
  API accepts its explicitly reviewed `reviewed_name` relationships only for
  South Carolina; existing guarded states retain the narrower exact-ID or
  official-crosswalk methods. Static activation changes only the registry and
  the 2016, 2020, and 2024 coverage inventories while database status remains
  blocked.
- The production tooling includes read-only preflight, full restore-verified
  backup, hash-pinned hidden load and receipt recovery, immutable Blob
  publication, four-file static activation, exact deployment/rollback-tree
  verification, atomic public publication, database-first rollback, and
  read-only publication-receipt recovery. No production database, Blob,
  Vercel, canonical registry, or public eligibility mutation occurs in this
  tooling change.

### 2026-08-15 - South Carolina production publication

- The production package was resealed from the merged guarded-release code as
  SHA-256 `ea6b131f7c942865773beacacb8dbaf1d1b872da3b7d0b0f6260fa10f928eee2`.
  A read-only production preflight and full public-schema backup with verified
  restore preceded the atomic hidden load. The hidden-load receipt is pinned
  at SHA-256
  `fdac8ec10763580db17a3810cb5ef81ae8f3541ffaef3e15856337584c0c1e10`,
  with the three geography versions still blocked at public revision 18.
- Immutable delivery publication created 138 county-scoped objects followed
  by three index objects. The Blob evidence is pinned at SHA-256
  `fa8822ed6310f12cb155553a6e2e5d73d32224eea65fd48fc82f5c30452a15c4`.
  Static activation was merged in pull request 244 and deployed from commit
  `17596de9e5622b3b9bd7a7f341f76f0721267c75`, tree
  `9290df7c40affc5f41b75d9062fda60de4e8b0f7`, as READY/PROMOTED deployment
  `dpl_Bp3uLzvq4wqxW6LUWdVpJ9BrU3yt`. Both public APIs remained closed while
  the database versions were blocked.
- Publication plan SHA-256
  `e5cd5bf599a1127f3bcee256250b69067b37061264f18bc740442c75735a84de`
  was applied under activation
  `sc-public-20260815T161351Z-17596de9`. The atomic database transition
  published all three versions and incremented public revision 18 to 19. The
  immutable publication receipt is pinned at SHA-256
  `a29eede3945d78f89473fd7c0ccf6cca7a8e4ac827d2533f8de231d76f10ca92`.
- Post-cutover verification covered every county in every published election:
  2016 serves 2,234 features and 2,232 joined result units, with two reviewed
  no-data shapes; 2020 serves 2,263 features and 2,261 joined result units,
  with two reviewed no-data shapes; and 2024 serves 2,308 features and 2,308
  joined result units. All 138 county result/geometry joins passed, the public
  API smoke passed against the exact deployed commit and database source, and
  browser checks confirmed the 2016/2020/2024 maps, OpenStreetMap base layer,
  and year-pinned 2020 export/API examples. The 2012 manifest, results, and
  geometry endpoints remain unavailable as designed.

### 2026-08-15 - Wisconsin four-election local-reporting geometry review

- Wisconsin is modeled as `local_reporting_unit`, not generically relabeled as
  precinct or ward. WEC/GAB result rows frequently combine several municipal
  wards into one reporting unit, so each reviewed output feature represents
  the complete official reporting row and may be a multipart geometry.
- A deterministic builder hash-verifies every retained input before parsing or
  writing. It emits vote-free normalized geometry, official normalized result
  rows, explicit relationship records, source evidence, a review report, and
  a fail-closed manifest for each election. No official result is divided,
  proportionally allocated, or copied to multiple polygons.
- The 2016 package retains 3,636 official WEC recount result units and maps
  3,626 of them to 3,648 reviewed local-reporting features. Ten official
  zero-vote rows remain no-geometry reconciliation records, and 22 source
  features remain reviewed no-data shapes. All 2,976,150 official presidential
  votes are preserved. VEST supplies attributed election-specific geometry
  only; every VEST election field is removed from normalized output.
- The 2020 package retains 3,698 official WEC recount result units and maps
  3,696 of them to 3,705 reviewed features. Two official zero-vote rows remain
  no-geometry reconciliation records, and nine source features remain reviewed
  no-data shapes. All 3,298,041 official presidential votes are preserved.
  VEST is again geometry-only and its documented disaggregated result values
  are never eligible for display.
- The 2024 package retains 3,603 official WEC result units and maps all 3,503
  units with votes to 3,503 NYT features marked `official_boundary=true`.
  The remaining 100 official rows report zero votes and have no reviewed
  geometry. All 3,422,918 official WEC presidential votes are preserved. NYT
  election values are used only as a join check and are stripped; its retained
  non-commercial attribution terms must accompany any future delivery. The
  official LTSB January 2025 ward layer is retained only as contrary-source
  evidence because its own metadata says reporting-unit votes were
  population-disaggregated and ward totals may differ from WEC totals.
- The 2012 package hash-pins 3,525 official GAB/WEC result rows totaling
  3,047,999 votes but approves zero geometry relationships. The public LTSB
  layer uses 2011 wards and describes population-disaggregated 2012 election
  values rather than a preserved vote-preserving reporting-unit crosswalk.
  Its election fields are excluded from derivatives, and 2012 remains outside
  delivery and the public registry pending authoritative crosswalk evidence.
- All four coverage ledgers now record Wisconsin. Public eligibility remains
  zero for every year because immutable county-scoped delivery and guarded
  database/deployment activation are separate future changes; only 2016,
  2020, and 2024 are eligible for that next release-tooling phase. Each year
  retains its own boundary vintage and is not treated as a stable trend layer.
- The normal Wisconsin ETL validates with 72 county result rows, 3,503 native
  review rows, 1,851 turnout rows, and 14 configured sources. The advisory
  report calculates 187 screening rows across 70 flagged jurisdictions and
  126 flagged areas: 103 `vote_share_pattern` rows and 84
  `average_down_ballot_difference` rows. These are review signals only, not
  evidence of fraud or misconduct. This source-package task does not promote
  staging or mutate production data.

### 2026-08-15 - Wisconsin guarded three-election release tooling

- Added a Wisconsin-only local database plan, guarded loader, validator,
  content-addressed release-candidate builder, production preflight and backup
  contracts, hidden-load receipt recovery, immutable Blob publisher, static
  activation builder, atomic database publication, rollback, and read-only
  publication-receipt recovery. The implementation follows the hardened
  local-reporting-unit release model and never relabels Wisconsin units as
  precincts.
- The candidate is fixed to 2016, 2020, and 2024: 10,937 official reporting
  units, 32,475 candidate-result rows, 10,856 polygons, 10,937 reviewed
  relationship records, 112 explicit zero-vote non-geographic units, 316
  geographic zero-vote units, and 31 reviewed no-data polygons. Delivery
  consists of 216 county-scoped objects plus three year indexes.
- The application publication contract gates Wisconsin only at
  `local_reporting_unit`. Both the results and geometry APIs remain closed
  until one exact static manifest set, hidden database release, immutable Blob
  evidence, reviewed deployment, and atomic publication transaction agree.
- The release plan rejects 2012 before database or delivery work. Its 3,525
  official rows and 3,047,999 votes remain retained evidence, but the
  population-disaggregated LTSB context is not a vote-preserving crosswalk.
- This tooling change does not modify the canonical public registry, upload a
  Blob object, contact the production database, change a deployment, or make
  Wisconsin public. Those are separately authorized release operations after
  clean merged-code validation.
- The loopback-only Docker rehearsal loaded and then read-only validated all
  three elections at public revision 24 with zero invalid constraints. It
  confirmed 126 mapped zero-vote units in 2016, 190 in 2020, and zero in 2024,
  in addition to the 112 reconciliation-only units without geometry.
- A local content-addressed rehearsal sealed package SHA-256
  `ee04bd4bd4989fba8d11de7b625f02d5a1e3f91261c7e1de087d371320809311`
  with 219 delivery artifacts and a 46,695,130-byte Blob plan. This local
  package is validation evidence only and must be resealed from the clean
  merged commit before production evidence is collected.
- Verification passed the 36-test Wisconsin source/release suite, the full
  standard repository suite (including 183 Python ETL tests), TypeScript,
  production build, source-tier/source-package/map validators, and the 2-test
  merge-gated HTTP API suite. The API smoke now explicitly proves that
  Wisconsin local result rows, manifests, and geometry remain closed before
  the later activation transaction.

### 2026-08-16 - North Carolina four-election VTD/precinct source packages

- Added one deterministic, hash-pinned North Carolina builder for 2012, 2016,
  2020, and 2024. It writes vote-free normalized geometry, official NCSBE
  presidential result rows, explicit one-to-one/no-geometry relationships,
  source evidence, reconciliation reports, and fail-closed manifests. Every
  raw artifact is verified before any output write, and no result is divided,
  proportionally allocated, copied to several polygons, or inferred from
  area.
- The 2012 election is explicitly modeled as `vtd`, not silently relabeled as
  ordinary precinct geometry. The official NCSBE precinct-sorted export has
  3,011 VTD/result identities and 4,505,372 presidential votes. MGGG/NC
  General Assembly geometry supplies 2,692 VTD features: 2,654 relationships
  reconcile by county-qualified VTD identity and 38 by a unique complete
  five-candidate vote signature. Those 2,692 mapped units retain 4,492,613
  votes; 319 result-only units totaling 12,759 votes remain no-geometry
  reconciliation rows. MGGG election fields are removed and never displayed.
  NCSBE documents residence-based reassignment of accepted absentee and
  provisional ballots plus statutory statistical noise in the sorted data,
  so the source is described as official VTD analysis data rather than the
  certified canvass presentation. MGGG ODbL/DBCL terms are retained.
- The 2016 package uses the final retained NCSBE statewide snapshot before the
  November 8 election. All 2,704 features match exactly one official
  county-qualified result identity and retain 3,177,511 mapped votes. The 505
  result-only units totaling 1,564,053 votes remain non-geographic. The
  official export's signed -4 absentee write-in correction remains only in the
  excluded source evidence and is never introduced into a mapped row.
- The 2020 package begins with the official October 18 snapshot, dissolves its
  one reviewed multipart duplicate, and restores Buncombe 681, Henderson CV,
  Wake 01-07A, and Wake 07-07A from the official August 27, 2019 snapshot.
  This is the same missing-unit source method independently identified by the
  retained RDH/VEST validation report. CivicResultMaps performs its own
  topology-preserving operation: each older feature is clipped to current
  county coverage and its exact overlap is subtracted from every containing
  current feature before insertion. The result has 2,662 features and maps all
  2,662 official `Real Precinct=Y` units and 3,201,711 votes. All 403
  `Real Precinct=N` units and 2,323,091 votes remain no-geometry rows; no VEST
  allocated result is used.
- The same procedure produces a complete 2024 candidate with 2,659 features:
  all 2,658 official `Real Precinct=Y` result units are matched, all 250
  `Real Precinct=N` units remain separate, and official Durham feature 48 is
  retained as an explicit no-data shape. Henderson CV and Wake 01-07A /
  07-07A are restored from August 2019, but no public source yet confirms that
  those three polygons remained applicable on November 5, 2024. The exact
  crosswalk is reviewed, but row-level public rendering and delivery remain
  blocked on that temporal gate.
- The four coverage ledgers and source inventories now record North Carolina.
  Public eligibility remains zero because no manifest is added to the static
  registry and no immutable delivery is declared. The next guarded-release
  phase may include 2012, 2016, and 2020; it must exclude 2024 until its three
  supplemental boundaries have election-date confirmation.
- This source-package change does not load a database, publish Blob assets,
  modify the public manifest registry, deploy the application, or change
  production. Each election retains its own boundary vintage, so the maps are
  not an apples-to-apples trend geography without a separate reviewed
  cross-election correspondence.

### 2026-08-16 - North Carolina guarded three-election release tooling

- Added a North Carolina-only guarded local database plan, loader, validator,
  content-addressed candidate builder, production preflight and backup
  contracts, hidden-load receipt recovery, immutable Blob publisher, static
  activation builder, atomic publication, rollback, and read-only publication
  receipt recovery. The release preserves 2012 as `vtd` and 2016/2020 as
  `precinct`; shared API and map code select the reviewed grain by state and
  election year instead of relabeling North Carolina 2012.
- The fixed release universe is 9,285 official reporting units, 24,174
  candidate-result rows, 8,058 polygons, and 9,285 reviewed relationships.
  Exactly 8,058 relationships are geographic one-to-one joins and 1,227 are
  explicit non-geographic reconciliation rows. Delivery consists of 300
  county-scoped objects plus three year indexes. Geometry contains no election
  values.
- The plan, loader, candidate, public activation, and publication paths reject
  2024. Its three restored 2019 polygons remain blocked until election-date
  applicability is supported by retained public evidence.
- The fixed loopback Docker rehearsal loaded and read-only validated 2012 at
  3,011 units / 8,076 result rows / 2,692 features, 2016 at 3,209 / 8,112 /
  2,704, and 2020 at 3,065 / 7,986 / 2,662. All three geography versions stayed
  `blocked`, every public-delivery flag stayed false, and invalid constraints
  were zero at local public revision 26.
- A local validation rehearsal sealed candidate SHA-256
  `6362c56c1834ba5c81ec395b1643fbaec6689d2163a15bf7e8be3a89195cfdcc`
  with 303 immutable delivery artifacts. This ignored `.etl` package is local
  evidence only and must be resealed from the clean merged commit before any
  production evidence is collected.
- The implementation changes no canonical manifest, public eligibility,
  production database, Blob object, Vercel setting, deployment, or Git ref.
  Static activation and the final database publication remain distinct,
  separately reviewed operations so both public endpoints stay fail-closed
  until one exact release is authorized.
- Verification passed the 35-test North Carolina source/release suite, 30
  cross-state publication-gate and delivery regressions, TypeScript, the
  production build, the two-test merge-gated HTTP API suite, North Carolina
  ETL validation/import, and the source-package, map, and provenance
  validators. Existing repository validators retained only their documented
  legacy-file/equipment-shape warnings and reported no failure.
- The normal 2024 staging advisory audit evaluated 2,658 North Carolina review
  rows and produced 206 advisory indicator rows across 86 counties/areas: 81
  `vote_share_pattern`, 86 `average_down_ballot_difference`, and 39
  `down_ballot_outliers`. These are broad review signals, not evidence of fraud
  or misconduct. This branch did not check or change the production API/DB
  indicator counts.
