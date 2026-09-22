import { candidateNamesForYear, historicalCountyRowsToResults } from "../../src/lib/state-year-results.ts";
import type { HistoricalResultRowSummary } from "../../src/lib/types.ts";

type Row = Record<string, unknown>;
export type DisplayRow = { code: string; tag: string | null; name: string; cells: Record<string, string> };
export type BrowserValueSnapshot = { state: string | null; year: string | null; rows: Array<{ code: string | null; tag: string | null; cells: Record<string, string> }> };
const count = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("invalid_expected_vote_count");
  return value;
};
const formatted = (value: number) => value.toLocaleString("en-US");

/** Independent arithmetic checks precede comparison with actual DOM text. */
export function expectedDisplayRows(rows: Row[], state: string, year: 2012 | 2016 | 2020 | 2024): DisplayRow[] {
  const candidates = candidateNamesForYear(year);
  const publicRows = year === 2024 ? rows : historicalCountyRowsToResults(rows as unknown as HistoricalResultRowSummary[], year) as unknown as Row[];
  const seen = new Set<string>();
  return publicRows.filter((row) => row.level === "county").map((row) => {
    if (row.state !== state || row.year !== year || typeof row.jurisdictionCode !== "string" || !row.jurisdictionCode
      || typeof row.jurisdictionName !== "string" || !row.jurisdictionName || seen.has(row.jurisdictionCode)) throw new Error("ambiguous_expected_display_identity");
    seen.add(row.jurisdictionCode);
    const votes = row.votes as Record<string, unknown>;
    if (!votes || typeof votes !== "object" || Array.isArray(votes)) throw new Error("missing_expected_votes");
    const ranked = Object.entries(votes).map(([name, value]) => [name, count(value)] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = ranked.reduce((sum, [, value]) => sum + value, 0);
    const margin = year === 2024 ? (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0) : Math.abs(count(votes[candidates.dem]) - count(votes[candidates.rep]));
    if (!Number.isSafeInteger(total) || count(row.totalVotes) !== total) throw new Error("inconsistent_expected_total");
    const winner = !total && year === 2024 ? "" : margin === 0 ? "Tie" : year === 2024 ? ranked[0][0]
      : Number(votes[candidates.dem]) > Number(votes[candidates.rep]) ? candidates.dem : candidates.rep;
    if (row.winner !== winner || row.marginVotes !== margin || Math.abs(Number(row.marginPct) - Number((total ? margin / total * 100 : 0).toFixed(2))) > 1e-8) throw new Error("inconsistent_expected_outcome");
    return { code: row.jurisdictionCode, tag: typeof row.jurisdictionTag === "string" ? row.jurisdictionTag : null, name: row.jurisdictionName, cells: {
      jurisdictionName: row.jurisdictionName, winner,
      demVotes: formatted(count(votes[candidates.dem] ?? 0)), repVotes: formatted(count(votes[candidates.rep] ?? 0)), totalVotes: formatted(total),
      margin: `${formatted(margin)} (${(total ? margin / total * 100 : 0).toFixed(2)}%)`,
    } };
  });
}

export function compareDisplayedRows(expected: DisplayRow[], actual: BrowserValueSnapshot, state: string, year: number) {
  const problems: Array<Record<string, unknown>> = [];
  if (actual.state !== state || actual.year !== String(year)) problems.push({ reason: "displayed_state_year_mismatch", state: actual.state, year: actual.year });
  const byCode = new Map(expected.map((row) => [row.code, row]));
  const seen = new Set<string>();
  let comparedCells = 0;
  for (const row of actual.rows) {
    if (!row.code || seen.has(row.code) || !byCode.has(row.code)) { problems.push({ reason: "unexpected_or_duplicate_display_row", code: row.code }); continue; }
    seen.add(row.code);
    const wanted = byCode.get(row.code)!;
    if ((row.tag || null) !== wanted.tag) problems.push({ reason: "displayed_tag_mismatch", code: row.code });
    for (const [field, value] of Object.entries(wanted.cells)) {
      comparedCells++;
      if (row.cells[field]?.trim() !== value) problems.push({ reason: "displayed_value_mismatch", code: row.code, field, expected: value, actual: row.cells[field] ?? null });
    }
  }
  const missing = expected.filter((row) => !seen.has(row.code));
  if (missing.length) problems.push({ reason: "missing_display_rows", count: missing.length, codes: missing.slice(0, 20).map((row) => row.code) });
  return { status: !expected.length || !actual.rows.length ? "inconclusive" : problems.length ? "fail" : "pass",
    expectedRows: expected.length, displayedRows: actual.rows.length, comparedCells, problems: problems.slice(0, 50), problemCount: problems.length,
    ...(!expected.length ? { reason: "no_supported_county_results" } : !actual.rows.length ? { reason: "numeric_dom_contract_unavailable" } : {}) };
}

export async function verifyNumericPage(page: import("playwright").Page, expected: DisplayRow[], state: string, year: number) {
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector(".results-explorer");
    return { state: root?.getAttribute("data-crm-state") ?? null, year: root?.getAttribute("data-crm-year") ?? null,
      rows: Array.from(document.querySelectorAll<HTMLTableRowElement>("tr[data-crm-jurisdiction]")).map((row) => ({
        code: row.getAttribute("data-crm-jurisdiction"), tag: row.getAttribute("data-crm-jurisdiction-tag"),
        cells: Object.fromEntries(Array.from(row.querySelectorAll<HTMLElement>("td[data-crm-field]")).map((cell) => [cell.dataset.crmField!, cell.innerText])),
      })),
    };
  });
  const table = compareDisplayedRows(expected, snapshot, state, year);
  if (table.status !== "pass") return { status: table.status, table, reason: "numeric_table_not_verified" };
  const titles = await page.locator("path[data-crm-map-jurisdiction]").evaluateAll((paths) => paths.map((path) => ({
    code: path.getAttribute("data-crm-map-jurisdiction"), title: path.querySelector("title")?.textContent?.trim() ?? "",
  })));
  const missingMapCodes: string[] = [], wrongMapCodes: string[] = [];
  for (const row of expected) {
    const paths = titles.filter((title) => title.code === row.code);
    if (!paths.length) { missingMapCodes.push(row.code); continue; }
    const percentage = /\(([^)]+)\)/.exec(row.cells.margin)?.[1];
    if (paths.some((path) => !path.title.includes(`${row.cells.winner} by ${percentage}`))) wrongMapCodes.push(row.code);
  }
  const drawerChecks: Array<{ code: string; status: string; fields: string[] }> = [];
  // Table and tooltip checks cover every expected county; interactive drawer is
  // explicitly a bounded sample and is never labelled exhaustive.
  for (const row of [...expected].sort((a, b) => a.code.localeCompare(b.code)).slice(0, 5)) {
    const index = snapshot.rows.findIndex((entry) => entry.code === row.code);
    await page.locator("tr[data-crm-jurisdiction]").nth(index).getByRole("button", { name: "Inspect", exact: true }).click();
    await page.waitForFunction((code) => document.querySelector("[data-crm-drawer-jurisdiction]")?.getAttribute("data-crm-drawer-jurisdiction") === code, row.code, { timeout: 5000 });
    const cells = await page.locator("[data-crm-drawer-jurisdiction]").evaluate((element) => Object.fromEntries(
      Array.from(element.querySelectorAll<HTMLElement>("dd[data-crm-field]")).map((cell) => [cell.dataset.crmField!, cell.innerText.trim()]),
    ));
    const mismatches = ["demVotes", "repVotes", "totalVotes"].filter((key) => cells[key] !== row.cells[key]);
    drawerChecks.push({ code: row.code, status: mismatches.length ? "fail" : "pass", fields: mismatches });
  }
  return { status: wrongMapCodes.length || drawerChecks.some((row) => row.status === "fail") ? "fail" : missingMapCodes.length ? "inconclusive" : "pass",
    table, mapTooltips: { expectedCountyCount: expected.length, checkedPaths: titles.length, missingMapCodes, wrongMapCodes },
    drawer: { sampleSize: drawerChecks.length, exhaustive: expected.length <= 5, checks: drawerChecks },
    scope: "All county result table cells and joined winner-map tooltip percentages; up to five deterministically selected county drawers. Other charts and non-county renderers are not covered." };
}
