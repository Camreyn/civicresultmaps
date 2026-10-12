# Election Connections

`/connections` is a source-linked node explorer inspired by topics in the user-supplied TikTok video. It is not a transcript, an endorsement of the video's conclusions, a complete industry inventory, or live operational telemetry. The feature-gated Texas source-lineage inspector reads normalized public result rows; it does not access a voting system.

For the private research editor, immutable revisions, publisher workflow, Texas pilot, result-lineage checks, and activation gates, read [Connections research setup and verification](connection-research.md).

## Data and display path

The curated registry in `src/lib/election-connections.ts` remains the public documentary fallback while reviewed database releases are disabled. `connection-explorer-data.ts` adapts it without importing private research drafts. A route-loaded React Flow canvas supports pan, drag, pinning, native node buttons, and keyboard-selectable edges. `research-explorer.tsx` adds date filters, timeline, contract records, bounded paths, browser-local saved views, and public-only JSON downloads. The server renders the source library for JavaScript-free access. Existing `view`, `year`, `node`, and `edge` links remain compatible; new links include date, geography, evidence classification, and release identity.

The registry has three deliberately separate perspectives:

- Reporting and surveys: 2024 configuration versus a 2026 documentary snapshot reviewed October 11. Surveys are not a second certified ballot count; news networks retain independent race calls.
- Ownership and roles: dated company portfolios, acquisitions and organizational roles—not data paths or evidence of editorial intervention.
- Technology and public systems: explicitly documented products, partnerships and vendor work. Generic service availability is not proof of a particular deployment.

Publication, announcement, closing, review and effective dates must not be substituted for one another. Snapshot membership is editorial and does not claim exhaustive relationship history. Undated pages have a review date rather than an invented publication date. Source authority is recorded even for commercial announcements, whose claims remain attributable to their publishers.

## Source-content audit: October 11, 2026

The earlier documentary audit recorded opening all 28 exact source URLs and comparing the relevant passages with the referring relationships. The SSRS Voter Poll and DHS/SAM.gov records required browser rendering after text-fetch tools timed out or returned empty content. The registry preserves the check date, section/page locator, and scope note. Subsequent retention captured 22 of those URLs; six returned 403. Captured bytes are pending editorial review, not a replacement verification claim. See the setup guide for capture status and limits.

`content-checked` means the referenced document was read and supports the specifically attributed statement. It does not mean independent confirmation of a commercial issuer's announcement, a backend deployment audit, or verification of every claim in the video. Automated tests check registry consistency and the recorded audit fields, not external source truth or continued URL availability.

The audit corrected these scope/date issues:

- Ellison-family Class A holdings are historical to the August 2025 closing, not a confirmed post-2026 percentage. CBS and CNN portfolio links are labeled with the dates of their underlying disclosures.
- Kalshi's advisor appointment is dated 2025; continuation in 2026 is not confirmed by that announcement.
- Texas TEAM application-entry and election-night reporting descriptions retain their 2022/2025 dates rather than claiming unchanged 2026 mechanics. The Civix bulletin describes an issue and requested temporary file removal, not confirmed final resolution.
- SEC closing/report event dates are separate from unconfirmed filing publication dates. The Texas training cover and citizenship advisory establish their September 26, 2025 and June 4, 2024 dates.

The interface keeps the map and controls visible, with sources and unanswered connections collapsed by default. It omits promotional headings, oversized introductory copy and repeated generic disclaimers; relationship-specific evidence limits remain.

## Extending the map

Use the private editor workflow in the setup guide for new research. Preserve stable legacy IDs during migration. Register public sources, retain immutable copies, pin exact evidence passages, and submit neutral relationships for designated-publisher review. Unanswered claims remain questions rather than graph edges. New snapshots must reconcile prior relationships explicitly, keep source limitations, and distinguish actual effective dates from publication or observation dates. No technical route may be inferred from corporate roles or generic partnerships.

Unverified Oracle deployments for AP's core results database, current Texas TEAM and USCIS SAVE remain explicit questions. A possible SAVE match is not proof of noncitizenship or automatic removal. The supplied video's 2020 phone-call allegation and merger-timing interpretation are not established by this registry. None of the relationships is evidence of fraud or misconduct.

## Focused verification

```powershell
node --experimental-strip-types tests/api/election-connections.test.mjs
npm.cmd run typecheck
$env:PLAYWRIGHT_PORT = '3220'
npx.cmd playwright test tests/e2e/election-connections.spec.ts --workers=2
```

The tests cover registry referential integrity, source-review records, historical labels, event/publication-date separation, evidence limitations, graph positions, historical/provider separation, unresolved-deployment guards, selection and URL reload, search across views, JSON download, accessibility, mobile overflow and the JavaScript-free source catalog. The global footer and sitemap add a single `/connections` entry without changing the workspace layout.
