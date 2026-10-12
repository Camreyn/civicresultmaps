# News and shared site navigation

## Ownership and boundaries

The root layout owns one public toolbar on every HTML page. It exposes only
public destinations, including on protected admin pages; admin authorization
and controls remain in their existing pages and APIs. It performs no auth or
database lookup. API, RSS, download and image responses do not receive HTML chrome.

`src/lib/site-navigation.ts` is the destination registry for desktop navigation,
the mobile menu and footer. Whole-path-segment matching handles nested routes.
Equipment remains governed by the existing catalog/feature gate. The More menu
groups secondary tools, directories, data/API links and policies.

Menus use native details/summary, including without JavaScript. Client enhancement
provides Escape, outside-click dismissal, focus return and measured header height.
Public sticky panels use `--site-header-height`; table headers in scroll
containers and the editor's internal inspector retain their local offsets.
The private editor toolbar also clears the public header without changing its
permissions or drafts. PageTools retains route-specific tours.

The cleanup removes duplicate global page headers and the Evidence app switcher,
along with their unused CSS-module selectors. It does not consolidate separate
result, equipment, evidence or Connections models, remove source limitations,
or alter Layout Control drafts. Required data notes remain page-owned.

## Public content registry

`data/news.json` contains publication-ready public briefs only. This is a public
repository: never commit private drafts, embargoed material, researcher identities,
notes, tokens or source artifact paths, even if a UI filter would hide them.
There is no automatic ingestion, database write, publication scheduler or new CMS.

Each brief has a stable ID/slug, type, original event date/label, coverage review
date, topics, geography tags, sources, related canonical references, original
summary/body, explicit evidence limits and an append-only correction history.

Election briefs resolve source IDs against the existing Connections catalog,
without cloning URLs or dates. Site-code updates resolve a commit source record.
Related tool IDs resolve against the navigation registry; graph links resolve
existing source-supported claim IDs. If those references no longer resolve,
validation fails instead of silently substituting a different record.

`src/lib/news.ts` validates strict schemas, calendar dates, chronology, IDs,
source-package duplication, public HTTPS source URLs, reference resolution,
correction dates and supersession cycles. It rejects unknown/private fields.
Body text is rendered as text, never arbitrary HTML.

## Editorial workflow

1. Read the primary record and verify its date and stated scope. Attribute issuer
   announcements to their issuer. A recruiting listing or an announced plan does
   not establish deployment, and an agreement does not establish its backend.
2. Add/confirm the canonical public source record. Write an original short brief
   and explicit limitations; do not copy an article or manufacture an event date.
3. Set `eventOn` to the documented event; an Announced date must match a cited
   source publication date. `coverageReviewedOn` means the evidence was reviewed,
   not that the site published a new announcement that day.
4. For a material edit, record its actual date in `updatedOn` and append an
   explanation to `corrections`. Never overwrite prior correction history.
   To replace a brief, point `supersededBy` at the replacement ID and retain the
   original slug/article. Supersession is labeled on archive, article and RSS.
5. Run contracts, browser checks and a build, then use the normal reviewed Git
   publication process. An implementation request does not authorize deployment.

The initial archive has three primary AP-announcement briefs and one site-code
update. It is curated, not comprehensive or live. New primary-source categories
can be added explicitly; do not scrape secondary stories into approved coverage.

## Delivery and dates

- `/news`: server-rendered GET filters for type, topic, geography, original event
  year and search; dated archive and meaningful empty state.
- `/news/[slug]`: source links, evidence limits, related tools and correction
  history; unknown slugs return 404.
- `/news/feed.xml`: RSS with stable canonical GUIDs, original summaries and
  attribution. Date-only records do not become invented RSS publication times.
- `/api/news-social-card`: 1200×630 general card, or a validated article slug;
  unknown slugs return 404. No remote assets or user-provided display text.
- Metadata and sitemap use canonical article URLs. Source/event/review dates
  are not editorial publication timestamps. Modification dates are included
  only when an explicit `updatedOn` exists.

`src/lib/source-dates.ts` shares date-only formatting/unknown-date wording with
Connections without merging distinct source-review semantics. Deployment upload
rules explicitly include the small public News registry.

## Checks

- `npm run typecheck`
- `npm run test:news`
- `npm run test:connections`
- `npm run test:layout`
- `node --experimental-strip-types tests/api/seo.test.mjs`
- `npx playwright test tests/e2e/site-navigation-news.spec.ts --workers=1`
- Existing Connections, workspace and equipment navigation/tour regressions
- `npm run build`

News contracts and browser checks run in the existing hermetic CI job. They do
not add deployment actions, secrets, source approvals or production data writes.

### Local verification limits

The isolated checkout was verified with database/auth credentials blank and
research writes disabled. One existing database-backed result/dataset reconciliation
browser check skips in that fixture; this update does not claim a new live-data
validation or perform any production data promotion.

The locked dependency installation reports 23 existing advisories (including
two critical); dependency versions and the lockfile were not changed. Existing
vote-method cache-size and local Vercel-flag telemetry warnings also remain
outside this navigation/news change. Address these in a separately scoped review.
