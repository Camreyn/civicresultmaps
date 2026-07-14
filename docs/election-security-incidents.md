# November 2024 election security incidents

The Security layer presents source-linked administration context for bomb threats reported during the November 2024 election period. It is separate from election results, turnout, and advisory indicators.

## What the 227 figure means

The broadest reproducible source currently loaded is the Brennan Center for Justice's *2024 Election Bomb Threat Tracker*, last updated March 28, 2025. It records at least 227 threats reported from November 5 through November 9, 2024 across nine states.

The 227 figure is not an official FBI count or roster. The tracker was assembled from publicly available reports and says it may not be exhaustive. The FBI's November 5 statement confirms threats occurred in several states but publishes neither a national count nor a state, county, or site list.

The earlier Election Day snapshot remains in the source inventory for comparison. A Senate letter and NBC News reported at least 67 polling locations in 19 counties across five states. That is a narrower, earlier snapshot, not the source of the later 227 total.

## Loaded geography

The normalized registry contains:

- 110 rows from the later tracker, totaling 227 threats.
- 108 tracker rows with named counties and canonical county GEOIDs.
- Two tracker rows totaling 66 threats whose counties were not specified: 19 in Georgia and 47 in Minnesota.
- One additional Milwaukee County row retained from the earlier 67-location compilation because the earlier article names Milwaukee but does not publish a separate Milwaukee count.
- 111 total normalized rows, 109 mapped counties, nine states, a known minimum of 227 threats, and one county row with no separately published count.

Statewide-unspecified counts remain in state and national totals, reports, and exports. They are never assigned to a county polygon. An unknown county count is never converted to zero.

## Source and normalization path

Primary and supplemental context is recorded in data/election-security-incident-source-inventory-2024.json. The later tracker PDF is archived at data/us-2024-election-bomb-threat-tracker-brennan-center.pdf with a reviewed SHA-256.

The reproducible pipeline is:

1. scripts/extract-brennan-security-tracker.mjs extracts the PDF text layer, preserves each row's cited public URLs, and joins named counties to public/data/national-counties.geojson.
2. data/brennan-2024-election-bomb-threat-tracker.json stores the normalized tracker capture and hard-checks 110 rows, nine states, 108 counties, two statewide-unspecified rows, and 227 threats.
3. scripts/build-security-incident-registry.mjs overlays reviewed official county detail for Pima, DeKalb, Fulton, and Chester Counties and retains the earlier Milwaukee mention.
4. scripts/validate-security-incidents.mjs checks geography grain, totals, source tiers, local artifacts, hashes, caveats, and tracker-to-registry correspondence.

Run:

~~~powershell
npm run security-incidents:build
npm run validate:security-incidents
npm run test:security-incidents
~~~

Do not hand-edit the generated tracker capture or registry when the extraction or builder should be corrected instead.

## Website behavior

- The nationwide Security explorer maps county-attributed rows across the full 3,144-county geometry.
- Filters, pinned county inspection, CSV, source JSON, map SVG, and print/PDF reports operate in the browser.
- Reports include statewide-unspecified rows and their sources even though those rows are not drawn on the county map.
- State Security map mode shows statewide-only totals in the jurisdiction drawer, including Minnesota where no county was named.
- The state selector's “States with bomb-threat records” filter includes all nine states.
- Source labels distinguish official county detail, the later public-source tracker, and the earlier Election Day compilation.

The national page is statically generated and county geometry is cached in the browser. Expanding the registry does not add a per-request database query or server-side geometry computation, keeping Vercel Fluid CPU use effectively unchanged.

## API

GET /api/security-incidents?state=<STATE>&year=2024&limit=<N> returns API schema 4.0.0. Mixed-grain totals include countyRowCount, statewideUnspecifiedRowCount, and statewideUnspecifiedThreatCount.

## Interpretation limits

“Threats,” “polling locations,” “precincts,” “election offices,” and “facilities” are not interchangeable units. One message can name multiple places, and different sources may count messages, locations, or affected election units differently. The UI keeps those units separate and explains when a county is named but its exact count was not published.

An absent county row means only that no matching county record is loaded. It does not establish that no incident occurred. These records do not show that votes were altered or that an election outcome was incorrect, and they are not evidence of fraud or misconduct.
