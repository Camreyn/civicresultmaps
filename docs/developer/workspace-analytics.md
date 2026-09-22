# State workspace usage analytics

The public `/` workspace emits the Vercel Web Analytics custom event `state_loaded`
after its server data has resolved and the browser mounts the workspace tracker.
This measures a rendered workspace, not completion of every map tile or optional
client-side data request. Failed server renders, prefetch requests, unrecognized
states, and private draft-layout previews do not emit this event.

## Event properties

| Property | Values | Meaning |
| --- | --- | --- |
| `state` | Two-letter code for the 50 states or DC | State being viewed, **not** the visitor's location |
| `year` | 2012, 2016, 2020, 2024 | Resolved election year displayed by the workspace |
| `selection` | `default`, `explicit` | No state URL parameter versus a supplied state URL parameter |

The default landing state is Washington (`WA`). Compare all state loads and the
`selection=explicit` subset separately. Explicit includes bookmarks, shared links,
and navigation; it does not establish that someone clicked a state selector.
No visitor ID, layout cookie, county, search text, or arbitrary query value is added
to the custom properties. The public privacy page discloses this event.

## Reading the results

After deployment and new traffic, open the `civicresultmaps` project in Vercel,
then **Analytics → Events → state_loaded**. Inspect the `state` property breakdown
for the most-loaded states. Select the desired reporting period and production
environment; use `selection` and `year` filters for narrower comparisons.
Use event totals for load counts, not visitor counts.

Vercel documents custom events and their property drilldowns in
[Tracking custom events](https://vercel.com/docs/analytics/custom-events) and
[Filtering Analytics](https://vercel.com/docs/analytics/filtering). Custom events
require a supported Vercel plan; this project already uses the analytics SDK.

There is no historical backfill from ordinary pageviews: state query parameters
were not previously recorded as this custom event. Counts begin when this change
is deployed. Repeated page loads count again, including full-page tab/year
navigation; ordinary client rerenders and React Strict Mode effect replays do not.
Within a mounted workspace, a changed state/year/selection records a new load.
These are usage events, not unique people, political preferences, or verified human
visits. Blockers, disabled JavaScript, and failed delivery can undercount them.

## Implementation and checks

- `src/app/page.tsx` supplies resolved state/year values and excludes private draft previews.
- `src/app/workspace-state-analytics.tsx` emits after hydration and deduplicates
  repeated effects using only a component-local ref (no new browser storage).
  If the root analytics component has not initialized yet, the SDK's idempotent
  `inject` initializes the queue using its Next.js configuration, with automatic
  pageviews disabled. The existing root `<Analytics>` still owns pageview tracking.
- `src/lib/workspace-analytics.ts` allowlists the three custom properties.

Run `npm run test:analytics`, `npm run typecheck`, and the focused browser suite
`npm run test:e2e -- tests/e2e/workspace-analytics.spec.ts` before release. Browser
tests intercept the analytics script and inspect its queue; they do not send test
events to Vercel. Production ingestion must be checked after an authorized deployment.
