# November 2024 election security incidents

The Security layer presents source-linked administration context for bomb threats reported during the November 2024 election period. Incident records remain separate from election results, turnout, and advisory indicators. The national explorer can optionally shade the mapped incident counties by the 2024 presidential winner or margin; that county-FIPS overlay is geographic context and does not imply a relationship between the datasets.

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

### Follow-up on the 66 statewide-only threats

- Minnesota: the archived November 12 statement from the Minnesota Secretary of State confirms emailed threats to election offices in over half of the state's counties, but it publishes neither the exact 47-threat count nor a county list. The 47 count therefore remains sourced to the later tracker and all 47 remain statewide-unspecified.
- Georgia: the tracker's 19 statewide-unspecified threats are the arithmetic remainder of a reported statewide total after subtracting the threats assigned to Clayton, DeKalb, Fulton, and Gwinnett Counties. The underlying statewide report does not name counties for that remainder, so none of the 19 are reassigned to county polygons.

These are source limitations, not zeroes and not invitations to infer geography.

## Source and normalization path

Primary and supplemental context is recorded in data/election-security-incident-source-inventory-2024.json. The later tracker PDF is archived at data/us-2024-election-bomb-threat-tracker-brennan-center.pdf with a reviewed SHA-256. The official Minnesota statement is archived at data/mn-sos-2024-bomb-threats-county-election-offices.html. The official Philadelphia court order is archived at data/pa-2024-election-day-security-philadelphia-order.pdf; it names six polling locations and documents an extension at one address, but it does not independently establish the tracker's 10-threat count.

The reproducible pipeline is:

1. scripts/extract-brennan-security-tracker.mjs extracts the PDF text layer, preserves each row's cited public URLs, and joins named counties to public/data/national-counties.geojson.
2. data/brennan-2024-election-bomb-threat-tracker.json stores the normalized tracker capture and hard-checks 110 rows, nine states, 108 counties, two statewide-unspecified rows, and 227 threats.
3. scripts/build-security-incident-registry.mjs overlays reviewed official detail for Pima, DeKalb, Fulton, Chester, and Philadelphia Counties, adds the Minnesota state statement without inventing county assignments, and retains the earlier Milwaukee mention.
4. scripts/validate-security-incidents.mjs checks geography grain, totals, source tiers, local artifacts, hashes, caveats, and tracker-to-registry correspondence.

Run:

~~~powershell
npm run security-incidents:build
npm run validate:security-incidents
npm run test:security-incidents
node scripts/verify-security-incidents-deployment.mjs --base-url=http://localhost:3000 --attempts=1
~~~

Do not hand-edit the generated tracker capture or registry when the extraction or builder should be corrected instead.

## Website behavior

- The nationwide Security explorer maps county-attributed rows across the full 3,144-county geometry.
- Its map-layer control switches among incident-source fill, 2024 presidential winner fill, and 2024 presidential margin fill. In result modes, the incident source tier remains visible as a separate county outline.
- Result joins require the same canonical `county:<GEOID>` tag used by the incident registry and national result dataset. Statewide-only and ambiguous units are never forced onto a county; unavailable result joins remain explicitly unshaded and are not treated as zero.
- County inspection shows the joined vote totals, shares, winner, margin, source authority, source URL, confidence, and result caveat alongside the separate incident records.
- Filters, pinned county inspection, shareable report URLs, compact state/date summaries, CSV, source JSON, map SVG, and print/PDF reports operate in the browser.
- Reports include statewide-unspecified rows and their sources even though those rows are not drawn on the county map.
- State Security map mode shows statewide-only totals in the jurisdiction drawer, including Minnesota where no county was named.
- The state selector's “States with bomb-threat records” filter includes all nine states.
- Source labels distinguish official county detail, the later public-source tracker, and the earlier Election Day compilation.
- `/security` publishes page-specific Open Graph and Twitter metadata pointing to a 1,200-by-630 security preview card. The card repeats the separate-datasets interpretation limit and the mapped-versus-statewide counts.

The national page is statically generated and county geometry is cached in the browser. At build time, the page loads the national 2024 presidential dataset once and sends only the compact projection for canonical incident-county FIPS codes to the client. This adds no per-request result query or server-side geometry computation. Builds using the limited seed fallback show an explicit overlay-coverage warning.

## API

GET /api/security-incidents?year=2024&limit=<N> returns all loaded states using API schema 4.1.0. The optional state=<STATE> parameter narrows the same response to one state. Mixed-grain totals include countyRowCount, statewideUnspecifiedRowCount, and statewideUnspecifiedThreatCount.

Preview deployments and successful production deployments run cached smoke requests against the national, Georgia, and Minnesota totals. These checks run only during deployment and do not add per-request application compute.

## Interpretation limits

“Threats,” “polling locations,” “precincts,” “election offices,” and “facilities” are not interchangeable units. One message can name multiple places, and different sources may count messages, locations, or affected election units differently. The UI keeps those units separate and explains when a county is named but its exact count was not published.

An absent county row means only that no matching county record is loaded. It does not establish that no incident occurred. These records do not show that votes were altered or that an election outcome was incorrect, and they are not evidence of fraud or misconduct.
