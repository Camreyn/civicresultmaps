import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { expectedDisplayRows, verifyNumericPage } from "../../tools/civicresultmaps-mcp/browser-values.ts";

const rows = [
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "001", jurisdictionName: "Alpha County", jurisdictionTag: "county:55001", votes: { Harris: 100, Trump: 90, "Write-in": 10 }, totalVotes: 200, winner: "Harris", marginVotes: 10, marginPct: 5 },
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "003", jurisdictionName: "Zero County", jurisdictionTag: "county:55003", votes: { Harris: 0, Trump: 0, "Write-in": 0 }, totalVotes: 0, winner: "", marginVotes: 0, marginPct: 0 },
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "005", jurisdictionName: "Tie County", jurisdictionTag: "county:55005", votes: { Harris: 50, Trump: 50 }, totalVotes: 100, winner: "Tie", marginVotes: 0, marginPct: 0 },
];

test("real Chromium verifies visible ResultsExplorer table, map titles, drawers, and tampered text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-browser-values-live-"));
  const fixture = await startFixtureServer();
  const expected = expectedDisplayRows(rows, "WI", 2024);
  const consoleErrors = [];
  const pageErrors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", locale: "en-US", viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(fixture.url, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator(".results-explorer").getAttribute("data-crm-state"), "WI");
    assert.equal(await page.locator(".results-explorer").getAttribute("data-crm-year"), "2024");

    const pass = await verifyNumericPage(page, expected, "WI", 2024);
    assert.equal(pass.status, "pass");
    assert.equal(pass.table.status, "pass");
    assert.equal(pass.mapTooltips.expectedCountyCount, 3);
    assert.equal(pass.mapTooltips.missingMapCodes.length, 0);
    assert.equal(pass.mapTooltips.wrongMapCodes.length, 0);
    assert.equal(pass.drawer.sampleSize, 3);
    assert.equal(pass.drawer.checks.every((check) => check.status === "pass"), true);

    const cleanScreenshot = path.join(root, "numeric-pass.png");
    await page.screenshot({ path: cleanScreenshot, fullPage: true });
    assert.ok((await readFile(cleanScreenshot)).byteLength > 0);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);

    await page.locator('tr[data-crm-jurisdiction="001"] td[data-crm-field="demVotes"]').evaluate((cell) => { cell.textContent = "99"; });
    const tampered = await verifyNumericPage(page, expected, "WI", 2024);
    assert.equal(tampered.status, "fail");
    assert.equal(tampered.reason, "numeric_table_not_verified");
    assert.ok(tampered.table.problems.some((problem) => problem.reason === "displayed_value_mismatch" && problem.field === "demVotes"));
    const tamperedScreenshot = path.join(root, "numeric-tampered.png");
    await page.screenshot({ path: tamperedScreenshot, fullPage: true });
    assert.ok((await readFile(tamperedScreenshot)).byteLength > 0);
  } finally {
    await browser?.close();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml());
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_server_address_unavailable");
  return { url: `http://127.0.0.1:${address.port}/?state=WI&year=2024&tab=map`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function fixtureHtml() {
  const display = expectedDisplayRows(rows, "WI", 2024);
  const tableRows = display.map((row) => `<tr data-crm-jurisdiction="${row.code}" data-crm-jurisdiction-tag="${row.tag}">
    <td data-crm-field="jurisdictionName">${row.cells.jurisdictionName}</td>
    <td data-crm-field="winner">${row.cells.winner}</td>
    <td data-crm-field="demVotes">${row.cells.demVotes}</td>
    <td data-crm-field="repVotes">${row.cells.repVotes}</td>
    <td data-crm-field="totalVotes">${row.cells.totalVotes}</td>
    <td data-crm-field="margin">${row.cells.margin}</td>
    <td><button type="button">Inspect</button></td>
  </tr>`).join("\n");
  const paths = display.map((row) => `<path data-crm-map-jurisdiction="${row.code}"><title>${row.cells.jurisdictionName}: ${row.cells.winner} by ${row.cells.margin.match(/\(([^)]+)\)/)[1]}</title></path>`).join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Results fixture</title></head><body>
  <main class="results-explorer" data-crm-state="WI" data-crm-year="2024">
    <section aria-label="WI result explorer"><h1>2024 President</h1>
      <table><tbody>${tableRows}</tbody></table>
      <svg aria-label="WI county map">${paths}</svg>
      <aside id="drawer"></aside>
    </section>
  </main>
  <script>
    document.querySelectorAll('tr[data-crm-jurisdiction] button').forEach((button) => button.addEventListener('click', () => {
      const row = button.closest('tr');
      const drawer = document.querySelector('#drawer');
      drawer.setAttribute('data-crm-drawer-jurisdiction', row.dataset.crmJurisdiction);
      drawer.innerHTML = '<dl>' + ['demVotes', 'repVotes', 'totalVotes'].map((field) => '<dd data-crm-field="' + field + '">' + row.querySelector('[data-crm-field="' + field + '"]').innerText + '</dd>').join('') + '</dl>';
    }));
  </script>
</body></html>`;
}
