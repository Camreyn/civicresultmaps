# Connections: guided examples, local records and reviewed comparisons

The October 12, 2026 expansion remains documentary and source-scoped. It does
not activate the research database, retained-source publication, result lineage,
migrations or production data imports.

## Public reading flow

`connection-guides.ts` selects examples only when a public claim, supporting
non-supplemental evidence and its source exist. An example resets relevant
filters and isolates one link; its share URL includes the stable claim ID.
The inspector retains the original claim wording, dates and limits. Changing a
filter or selecting another link exits isolation. Historical examples use the
historical documentary view, not an assumed current relationship.

The local-records panel reuses existing public claim scopes and geography.
It separates documented inventory, procurement, system certification and dated
local use. It does not infer an election year from a document date or convert an
inventory/contract into operational deployment. Missing executed contracts,
amounts and amendments remain explicit. This is a bounded Harris County example,
not a national deployment inventory or a precinct/GIS expansion.

USA TODAY sources distinguish parent-company identity, historical AP election
services, historical voter-survey context and employer-attributed syndicated
recruitment leads. The latter are supplemental research-question sources, not
graph edges or proof of an onward AP route. University listings were read directly
in the browser; no applications, recruiter contact or personal contact details
were collected. Individual source-check dates are preserved when the catalog's
overall update date advances.

## Comparison and withdrawal safety

With public releases disabled, the comparison explains why it is unavailable.
The documentary catalog and 2024/2026 views never become synthetic releases.
With releases enabled, the reader validates the current pointer and at most 12
earlier immutable release rows, ordered by workspace version. Every document
must pass the strict public DTO, unique-ID, production-format identity and
canonical-digest gates. Rows must match an editorial workspace revision's version
and actor; no workspace document or actor identity is serialized.
Corrupt or changed-pointer comparisons fail closed without substituting drafts.

Only summary counts, changed field names, current relationship labels and removed
stable IDs reach the browser. Earlier claim prose, source URLs, excerpts and
withdrawn labels are not republished. Removal is not evidence that a relationship
ended. These snapshots are not a complete publication/rollback log: the existing
schema does not retain publication-pointer event history. No new public archive
endpoint, source-copy access or private-workspace read is introduced.

## Checks

`npm.cmd run test:connections` covers source/guide integrity, scope distinctions,
historical versus current wording, semantic and evidence changes, digest/identity
checks and rejection of private or duplicate records. The Connections Playwright
suites cover isolated guides, shared restoration, local records, recruiting
caveats, disabled comparison, accessibility, mobile overflow and no-JavaScript
sources. Type checking and production build remain required.

The enabled database-backed comparison path still requires an approved disposable
or preview editorial rehearsal with real reviewed releases before activation;
synthetic tests and the disabled public flow do not verify such a deployment.
