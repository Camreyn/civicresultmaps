# New York 2026 midterm workspace

The main explorer now offers a separate **2026 midterms** entry point at
`/?state=NY&year=2026&tab=equipment`. This is an administration-source snapshot,
not a presidential year, result import, forecast, or claim about election conduct.
The existing 2012–2024 presidential years and all 2024 data remain unchanged.

## Sources and provenance

Authority: New York State Board of Elections. Checked November 2, 2026.
Reporting grain: county. Workspace election: November 3, 2026 General Election,
as identified by the [NYSBOE election information page](https://elections.ny.gov/election-information).

| Official page | Retained section | County count |
| --- | --- | --- |
| [Clear Ballot](https://elections.ny.gov/clear-ballot) | Full suite | 17 |
| [Liberty Vote](https://elections.ny.gov/liberty-vote) | Liberty Vote Counties | 27 |
| [ES&S](https://elections.ny.gov/election-systems-software-ess) | ES&S Counties; NYC explicitly expands to five named counties | 11 |
| [Hart Verity](https://elections.ny.gov/hart-verity) | Hart Verity Counties | 7 |
| [Clear Ballot](https://elections.ny.gov/clear-ballot) | Central Count/Audit tool only; separate role | 24 |

The four family lists cover 62 unique canonical `county:36xxx` identities.
The 24 central-count/audit-only entries overlap these families and do not replace
them. They do not establish that an audit occurred.

The [current hub](https://elections.ny.gov/voting-technology) links the family pages
above. A [legacy ES&S AutoMARK page](https://elections.ny.gov/node/276) still lists
Nassau, while the hub-linked ES&S page excludes it and the Clear Ballot full-suite
list includes it. Nassau retains both references and a visible conflict note.
The package does not infer retirement or election-effective transition dates.

- Source observation artifact: `data/ny-2026-equipment-source-observations.json`.
- Source URL registry: `scripts/ny-2026-equipment-sources.mjs`.
- Deterministic normalizer: `scripts/build-ny-2026-equipment.mjs`.
- Generated package: `data/ny-2026-equipment.json`.
- Public read path: `/api/midterms/equipment?state=NY&year=2026` (JSON), adding
  `&format=csv` produces the source-linked export.

Direct HTML downloads encountered a Cloudflare challenge. The retained input is
an explicitly labeled, reviewed transcription of the web reader's official
county-list sections, not an original HTML archive. The generated package pins
that observation artifact's SHA-256 and byte length; it makes no original-byte
verification claim. A later original-page capture should be retained separately
and reviewed, never silently substituted for this snapshot.

## Limits

The pages have no publication or election-effective date. November 2 is the
observation date, not confirmation that a system was installed for November 3.
Confidence is high for the observed official county-to-family listing, but
election deployment is not independently confirmed. Exact county models,
firmware, quantities, pollbooks, and polling-place/vote-mode uniformity remain
unknown. No model/firmware values are borrowed from the component catalog or
certification records. This does not modify the detailed equipment dossier
editorial lifecycle, feature flags, or publication gates.

Other states show an explicit not-loaded state. Results, turnout, and advisory
indicators are not loaded for 2026 and do not fall back to 2024. The equipment
snapshot creates zero review rows and zero advisory indicator rows because it
contains no results or same-grain comparison contests. Existing NY 2024 staging,
indicator calculations, and production database counts are unchanged; production
database counts were not checked as part of this static administration addition.

## Reproduce and validate

```powershell
node scripts/build-ny-2026-equipment.mjs
node scripts/build-ny-2026-equipment.mjs --check
npm.cmd run test:midterms
npm.cmd run typecheck
npx.cmd playwright test tests/e2e/midterm-workspace.spec.ts --workers=1
npm.cmd run build
```

The normalizer rejects unknown counties, missing/duplicate assignments, unknown
sources, and conflated source roles. Browser tests reconcile every family/source
link against the JSON response, exercise filters/exports/empty states, and check
mobile overflow and serious/critical accessibility findings.

No production database mutation, promotion, publication, or GIS change occurs.

## Local verification record

- MCP `crm_doctor`: healthy (`ok: true`), no warnings or workflow drift.
- MCP `crm_state_inventory(NY)`: reviewed existing 2024 inventory; unchanged.
- Deterministic replay and five feature unit tests: passed.
- Existing workspace/layout and equipment catalog/editorial/usage tests: passed.
- Three Chromium flows: passed, including all 62 county family/source links,
  JSON/CSV, Nassau conflict, filters, unsupported states, result isolation,
  repeated-query metadata, and 390px mobile overflow.
- Axe: no serious or critical violations in the new equipment view.
- Production build and TypeScript: passed. No production credentials needed.
- Review subagent: no blocking findings; repeated-state metadata edge corrected.
- Actual indicator calculation with empty NY 2026 review input: 0 review rows,
  0 calculated rows, 0 flagged county/jurisdictions, 0 flagged areas, no types.
  No 2026 native result staging artifact was generated: the package is static
  administration context, and the native report currently supports 2016/2020/2024,
  not 2026. Existing result staging was intentionally not rebuilt.

Local browser logs include existing Vercel Flags telemetry warnings because no
local OIDC token is available; the tested UI and API flows still pass without
that telemetry credential. No disposable database rehearsal was needed or run.
