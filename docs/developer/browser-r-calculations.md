# Browser R calculation blocks

Browser R calculation blocks are an experimental custom block for Workspace Builder. A Layout Admin writes a bounded R expression in the protected layout editor. A normal visitor can run it against the public result rows already loaded for the state and year being viewed, inspect the exact formula and variables, and see the result. The R interpreter runs in the visitor's browser; CivicResultMaps does not invoke a Vercel Function to perform the calculation.

The feature is feasible because [webR](https://docs.r-wasm.org/webr/latest/) compiles R for WebAssembly. The runtime is pinned to webR 0.6.0 / R 4.6.0, prepared from the exact npm lockfile artifact, self-hosted as static application assets, and loaded only after the visitor selects **Run calculation**.

## Roles and lifecycle

| Role | Capability |
| --- | --- |
| Layout Admin | Add one R calculation block per tab; edit its title, explanation, R source, visibility, placement, presentation, and allowlisted timeout; save it through the normal immutable revision workflow |
| Normal visitor | Run the published formula, view its output, and expand **Proof-check formula and current variables**; cannot edit or persist formula source |

Formula source is part of the validated layout manifest and its SHA-256 digest. Changing it therefore requires a new admin draft/revision and the existing protected publication process. R calculation fields are intentionally not exposed through the layout-agent MCP operation vocabulary.

Unlike C or C++, a basic R calculation does not need a header and implementation file. The first version stores one source string with a maximum of 8,000 characters. Base R is the supported contract; per-formula package installation and arbitrary additional files are not supported.

## Dedicated variables

Each manual run creates a fresh R environment containing only these dedicated inputs:

| Variable | Shape | Meaning |
| --- | --- | --- |
| `crm_context` | Named list | Current `state`, `year`, `tab`, optional `fips`, optional map `mode`, row counts, and `inputTruncated` |
| `crm_results` | Data frame | Result rows loaded for the selected state and year |
| `crm_view_results` | Data frame | Rows matching the currently viewed county FIPS; all loaded rows when no FIPS is selected |
| `crm_votes` | Data frame | Candidate votes from `crm_results` in long form |
| `crm_view_votes` | Data frame | Candidate votes from `crm_view_results` in long form |

`crm_results` and `crm_view_results` columns:

| Column | Meaning |
| --- | --- |
| `rowId` | Stable join key within this run |
| `state`, `year`, `office`, `level` | Election context |
| `jurisdictionCode`, `jurisdictionName`, `jurisdictionTag` | Reporting-unit identity and canonical tag when present |
| `totalVotes`, `marginVotes`, `marginPct`, `winner` | Published result summary |
| `sourceId` | CivicResultMaps source identifier |

`crm_votes` and `crm_view_votes` contain `rowId`, `candidate`, and `votes`. Join them to a result data frame with `rowId`.

The runner listens to the same browser context event used by the map. County/FIPS and map-mode changes immediately update the proof panel and mark an older result stale. State, year, and tab changes use the normal navigation and reload the page with the newly selected dataset. Calculations never rerun silently; the visitor selects **Run calculation** again so the cost and input context are explicit.

Example metric result:

```r
list(
  label = "Total votes in the current view",
  value = sum(crm_view_results$totalVotes),
  detail = paste(nrow(crm_view_results), "result row(s)")
)
```

## Display contract

The final expression may return:

- A scalar or atomic vector.
- A named list. A list with `label` and `value` is displayed as a metric; `detail` is optional.
- A data frame, displayed as a table.

Unsupported nested values are converted to a short placeholder. Browser inputs are capped at 5,000 result rows, 25,000 long-form vote rows, 512 characters per input string, and 2,000,000 serialized bytes after the full/current-view tables are assembled. Display output is capped at 100 rows, 12 columns, 100 vector/list values, 200 characters per label, and 2,000 characters per cell. `crm_context$inputTruncated`, `crm_context$inputBytes`, `crm_context$inputByteLimit`, `crm_context$truncatedStringCount`, and the proof panel disclose input sizing and truncation.

## Isolation and resource model

Admin-authored R is executable code, not a safe expression language. The implementation therefore treats Layout Admins as trusted code authors and isolates each visitor run:

1. A hidden iframe is created only for a manual run.
2. The iframe has `sandbox="allow-scripts"` without `allow-same-origin`, giving it an opaque origin that cannot read the CivicResultMaps page, cookies, storage, or DOM.
3. Its Content Security Policy denies all resources by default and allows scripts, workers, WebAssembly, and connections only to the exact current CivicResultMaps origin used for the versioned runtime files. webR dynamic-library loading requires JavaScript `unsafe-eval`; it is allowed only inside this opaque, script-only sandbox and is not added to the CivicResultMaps page CSP.
4. The R environment receives only the public calculation variables above.
5. The parent accepts messages only from the exact active iframe window and opaque origin.
6. A formula may use only an allowlisted 1,000, 2,500, or 5,000 millisecond execution window. On timeout, completion, or failure, the entire iframe and its worker are destroyed.

webR 0.6.0 assumes a non-opaque `location.origin` while choosing its worker loader. `scripts/prepare-browser-r-runtime.mjs` applies one exact, counted compatibility rewrite while preparing the npm artifact at build time. It refuses a different package version, npm integrity value, or loader shape, copies only the reviewed runtime file set, and writes a byte count plus SHA-256 digest for every generated file to `runtime-manifest.json`. No runtime CDN loader is fetched or rewritten in a visitor browser.

The generated directory is ignored by Git and recreated by `predev` and `prebuild`. It also contains the exact `LICENSE.md` distributed in the pinned npm package. Keep that notice with every hosted copy; do not summarize or replace its terms in generated assets.

The PostMessage webR channel itself is not interruptible while R is busy, which is why timeout enforcement tears down the complete isolated execution context instead of trying to cancel an evaluation in place.

This moves R interpreter CPU and memory use to the normal visitor's device. Vercel still serves the ordinary page, result data, and approximately 48 MB of generated static webR files; it does not execute the formula in a Function. The tradeoffs are a substantial first-run download, CDN bandwidth, browser CPU/memory use, slower mobile devices, and browser WebAssembly/worker/CSP compatibility. There is no per-formula WebAssembly memory ceiling: row, byte, output, single-block, manual-run, and timeout limits reduce exposure, while iframe destruction is the final cancellation boundary. Do not use this block for a calculation required for core navigation, accessibility, source provenance, or a required trust surface.

The opaque frame cannot send authenticated CivicResultMaps requests because it has no same-origin capability or access to page credentials. Its runtime fetches use static, CORS-enabled assets. Layout Admins remain trusted executable-code authors, so formula review is required even with this boundary.

The sandbox limits impact on CivicResultMaps, but it does not make a malicious formula trustworthy. Visitors can and should inspect the formula and digest. A formula's output is explanatory content, not source data and not evidence of fraud or misconduct.

## Enablement and verification

The public runner is fail-closed. Set this server-side environment variable only after local and preview verification:

```text
WORKSPACE_R_CALCULATIONS_ENABLED=true
```

When unset or false, published blocks still show their proof panel, but the run button is replaced with a disabled-deployment notice.

Run:

```powershell
npm run test:layout
npm run typecheck
npm run build
```

For a real browser check, set both `UI_LAYOUT_TEST_HARNESS=true` and `WORKSPACE_R_CALCULATIONS_ENABLED=true`, start the local application, open `/layout-test-harness`, and run the local-only browser R fixture. The harness remains a 404 in production and does not bypass the R feature flag. Verify the metric result, proof variables, formula digest, CSP/console output, timeout teardown, static runtime response headers, and keyboard access in the supported browser matrix before enabling a preview deployment.
