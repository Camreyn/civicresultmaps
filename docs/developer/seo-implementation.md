# Technical SEO implementation

## Scope and release boundary

This change adds server-rendered discovery pages, shared metadata, canonical and
indexing rules, structured data, and crawlable navigation. It is based on merged
application code, including the existing equipment, security, analytics, layout,
and optional Browser R features. Those features and their enablement remain
unchanged.

No election data, calculations, review rules, source records, API response
contracts, database contents, or production settings are changed. Release is
through a reviewed pull request and protected Vercel preview; merging and
production deployment require the maintainer's approval.

## Routes and data

New routes:

```text
/elections
/elections/2024/president
/states
/states/[stateSlug]
/states/[stateSlug]/elections/2024/president
/counties
/counties/[stateSlug]
/counties/[stateSlug]/[countySlug]
/counties/[stateSlug]/[countySlug]/elections/2024/president
/datasets
/datasets/[stateSlug]-2024-presidential-results
```

The existing `/developers` page documents the underlying results/source APIs
and links to the new directories. Existing `/county/[fips]` profiles keep their
broader content and self-canonicals, with a link to the semantic county guide.

New landing pages are Server Components with one H1, descriptive metadata,
breadcrumbs, ordinary anchor links, and useful initial HTML. They do not import
the interactive map/GIS workspace. Request-scoped caching deduplicates metadata
and page data reads; it is not a claim of measured Core Web Vitals improvement.

Only existing normalized 2024 presidential rows are read. Tables show candidate
values, reporting grain, and source links without calculating winners or
aggregating overlapping grains. County election routes require exact
county-grain tags matching the geography registry; a parent-county tag on a town
row is not treated as a county total.

A detail page is eligible for indexing only when every displayed row has a
`loaded` source record and usable public HTTP(S) source URL. This inventory check
does not establish that a source is official, certified, or recently updated.
Existing authority, confidence, and source caveats remain visible. Readable rows
with incomplete eligibility remain available with `noindex`, outside the
indexable dataset catalog and sitemap.

There is no seed fallback for SEO results. Missing database configuration yields
no published result inventory. Database query failures deliberately propagate
as server errors rather than silently producing an empty successful sitemap or
turning valid detail pages into 404s during a transient outage.

## Metadata, canonicals, and indexing

Canonical origin: `https://www.civicresultmaps.org`, consistent with the
application's existing production canonicals.

| URL class | Policy |
| --- | --- |
| Bare homepage | Indexable, canonical `/`; interactive application retained. |
| Semantic directories and geography guides | Indexable and self-canonical. |
| Semantic election and dataset details | Self-canonical; indexing depends on source eligibility. Empty details return 404. |
| Equivalent 2024 state map views | Canonical to the eligible state election page; preserve application deep links. |
| Equivalent state-aligned county map views | Canonical to the eligible county election page. |
| Exports, equipment, historical, review, unknown-filter, or repeated-parameter application views | `noindex, follow`; omit canonical and OpenGraph URL rather than reflecting arbitrary query values or naming an unrelated page. |
| Filtered readiness, compare, security, equipment directories, and district-compactness views | `X-Robots-Tag: noindex, follow`; existing base metadata retained. |
| Invalid semantic identifiers or unsupported election paths | Real 404. |
| API/download resources | Existing behavior and contracts; linked from dataset pages, not HTML sitemap entries. |
| Vercel preview responses | `X-Robots-Tag: noindex, follow`, in addition to configured deployment protection. |

The shared metadata helper builds absolute canonicals, titles, descriptions,
OpenGraph, and Twitter metadata. The root layout no longer supplies a homepage
canonical or unconditional Googlebot indexing directive to every page.

Homepage metadata preserves the existing state/year-specific, versioned social
card. The social helper's absolute image URL is converted to a relative path
before use by the shared utility. HTML-only crawler tests cover this integration,
including queries excluded from indexing.

The application proxy permanently redirects the apex production host to
`www` with HTTP 308, preserving path and query. Preview hosts are not redirected.
Vercel currently lists both production domains without a configured domain
redirect; no live domain settings were changed. Real production behavior must
be checked after the maintainer merges and deploys.

## Sitemap and structured data

- Robots permits public crawling and references the production sitemap.
- The sitemap contains canonical HTML URLs, not query variants or API downloads.
- Page metadata, the dataset catalog, and sitemap share source-eligibility rules.
- Existing equipment sitemap routes and their feature/production-readiness gates
  are preserved, as are broader county profiles and district compactness.
- No fabricated `lastModified` dates are emitted.
- Root layout supplies Organization and WebSite identity. Hierarchical pages add
  BreadcrumbList; the dataset directory adds DataCatalog; details add Dataset
  with DataDownload distributions.
- Distributions use actual existing JSON API URLs, separated by reporting grain.
  They are live responses, not immutable snapshots.
- Source URLs use `isBasedOn`. No unverified license, dataset equivalence
  (`sameAs`), update/publication date, or nonexistent CSV download is invented.

Sitemap size follows the available normalized inventory. Split it only when
actual URL or uncompressed-size limits warrant it; do not treat historical
snapshot counts as current coverage promises.

## File inventory

### New implementation files

| File | Purpose |
| --- | --- |
| `src/lib/seo.ts` | Shared metadata, canonical origin, identity graph, public source URLs, safe JSON-LD serialization. |
| `src/lib/seo-geography.ts` | Stable registry-backed geography slugs, lookups, and route helpers. |
| `src/lib/seo-query-policy.ts` | Explicit query index/canonical policy. |
| `src/lib/seo-data.ts` | Read-only normalized result and availability queries with source and county-tag guards. |
| `src/lib/seo-structured-data.ts` | Breadcrumb, catalog, dataset, and real API distribution schemas. |
| `src/app/seo/landing.tsx` | Server-rendered layout, directories, source-linked result tables, and caveats. |
| `src/app/seo/landing.module.css` | Responsive landing styles, focus states, and scrollable tables. |
| `src/app/elections/page.tsx` | Election directory. |
| `src/app/elections/2024/president/page.tsx` | National election directory. |
| `src/app/states/page.tsx` | State directory. |
| `src/app/states/[stateSlug]/page.tsx` | State guide. |
| `src/app/states/[stateSlug]/elections/2024/president/page.tsx` | State election results. |
| `src/app/counties/page.tsx` | County directory entry point. |
| `src/app/counties/[stateSlug]/page.tsx` | State county/county-equivalent directory. |
| `src/app/counties/[stateSlug]/[countySlug]/page.tsx` | County guide and broader-profile link. |
| `src/app/counties/[stateSlug]/[countySlug]/elections/2024/president/page.tsx` | Exact-tag county election results. |
| `src/app/datasets/page.tsx` | Indexable dataset catalog. |
| `src/app/datasets/[datasetSlug]/page.tsx` | Dataset scope, provenance, reuse caveats, and distributions. |

### Existing files changed

| File | Change |
| --- | --- |
| `src/app/layout.tsx` | Metadata origin and identity JSON-LD; remove inherited homepage canonical and Googlebot indexing override. |
| `src/app/page.tsx` | Query-aware metadata and eligible semantic targets, preserving existing workspace behavior and social images. |
| `src/app/site-footer.tsx` | Directory anchor links. |
| `src/app/robots.ts` | Shared canonical sitemap origin. |
| `src/app/sitemap.ts` | Data-aware canonical inventory, existing feature routes preserved, artificial dates removed. |
| `src/proxy.ts` | Apex redirect and filtered-page/preview noindex headers; existing auth and visitor behavior retained. |
| `src/app/readiness/page.tsx` | Descriptive self-canonical metadata. |
| `src/app/privacy/page.tsx` | Shared metadata. |
| `src/app/developers/page.tsx` | Shared metadata, API documentation, and directory links. |
| `src/app/compare/page.tsx` | Shared metadata. |
| `src/app/releases/page.tsx` | Shared metadata. |
| `src/app/evidence/page.tsx` | Shared metadata. |
| `src/app/county/[fips]/page.tsx` | Preserve distinct profile canonical and link to semantic guide. |
| `tests/api/api-contract.test.mjs` | Update moved-metadata structural assertions. |
| `.github/workflows/ci.yml` | Add SEO unit and browser steps while retaining existing checks. |

### New verification and documentation files

| File | Purpose |
| --- | --- |
| `tests/api/seo.test.mjs` | Geography, metadata, query, schema, serialization, data-read, and sitemap contracts. |
| `tests/e2e/seo.spec.ts` | Seven browser/HTTP checks covering initial HTML, metadata, source-backed result equality, real distributions, 404s, filters, sitemap/robots, and redirects. |
| `docs/developer/seo-implementation.md` | This implementation and release handoff. |

## Verification

Local verification on September 27, 2026:

| Check | Result |
| --- | --- |
| Clean dependency install | Passed. |
| `npm.cmd run typecheck` | Passed; latest production build also completed TypeScript checking. |
| `npm.cmd run build` | Passed on Next.js 16.2.7. |
| `node --experimental-strip-types tests/api/seo.test.mjs` | Passed, 14 tests. |
| `npm.cmd run test:api` | Passed. |
| `npm.cmd run test:analytics` | Passed. |
| `npm.cmd run test:layout` | Passed, including optional Browser R policy checks. |
| `npm.cmd run test:security-incidents` | Passed. |
| `npm.cmd run test:equipment-catalog` | Passed. |
| SEO browser checks against production build | Six passed; one data-backed comparison skipped because this isolated local build has no database connection. |
| Desktop and mobile visual checks | State directory and county-guide navigation passed, with no observed overflow or page errors. |
| `git diff --check` | Passed. |
| `npm.cmd run lint` | Existing script invokes `next lint`, unsupported by installed Next.js 16. Not a lint pass. Tooling repair is outside this change. |

The browser suite uses an existing production server when
`PLAYWRIGHT_BASE_URL` is set:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3217'
npx.cmd playwright test tests/e2e/seo.spec.ts --workers=1
```

It checks useful initial HTML with JavaScript disabled, one canonical/H1, JSON-LD
and existing API distributions, real 404s, preserved query links, and the apex
redirect. It samples sitemap routes rather than fetching every entry. The
data-backed test explicitly skips seed-only API responses; it must pass against
a preview with existing published data before claiming result reconciliation.

Independent bounded reviews checked source/indexability parity, geometry-tag
handling, feature preservation, and metadata. They prompted preservation of
equipment sitemap entries, consistent catalog eligibility, omission of arbitrary
query values from noindex metadata, and explicit preview noindex protection.

The full hosted CI result and preview verification belong in the pull request
record for the exact commit. No field Core Web Vitals, PageSpeed, external Google
rich-result validation, or Search Console result is claimed by these local tests.

## Release checklist

1. Review the isolated SEO diff and fresh CI. The production runtime is Node 24.x;
   confirm the hosted preview build in that runtime.
2. Verify the protected preview: representative Wisconsin state, Outagamie county,
   and dataset pages; initial HTML; source-linked values against the unchanged
   API; distributions; query preservation; robots/sitemap; invalid paths; existing
   maps/exports and new-feature gates.
3. Validate representative structured data. Missing undocumented license/date
   fields must remain absent; do not invent values to suppress warnings.
4. Maintainer reviews and merges. Do not auto-merge or promote from this task.
5. After production deployment, verify the apex-to-www redirect, canonicals,
   sitemap, robots, representative landing pages, and original application links.
6. With Search Console access, submit the production sitemap and inspect the
   homepage, one state, one county, and one dataset URL.
7. Measure PageSpeed and field Core Web Vitals separately.

Dedicated precinct-result pages are deferred pending their own meaningful
coverage rules. Existing equipment pages remain available; this change does not
add a parallel `/states/[stateSlug]/voting-equipment` hierarchy. No precinct
geometry, crosswalk, ETL, or advisory-indicator work is part of this release.

## References

- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: duplicate URL consolidation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: faceted navigation](https://developers.google.com/crawling/docs/faceted-navigation)
- [Google: Dataset structured data](https://developers.google.com/search/docs/appearance/structured-data/dataset)
- [Next.js: metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js: sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
