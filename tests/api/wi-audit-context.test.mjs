import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { wisconsinAuditReportFor, withWisconsinAuditCorrection } from "../../src/lib/wi-audit-context.ts";

const report = wisconsinAuditReportFor("WI", 2024);
const { percentageCorrection, humanErrorCount, humanErrorRateAsPrinted, humanErrorSourcePages,
  humanErrorCaveat, auditedContests, auditedContestsSourcePage, comparisonContestCaveat,
  ...legacyAggregate } = report.aggregateAuditResults;

function legacyIndicator() {
  return {
    id: "fixture-only", state: "WI", electionYear: 2024, jurisdictionCode: "EXAMPLE",
    jurisdictionName: "Example", level: "county", type: "average_down_ballot_difference",
    severity: 0.5, label: "Example advisory indicator", summary: "Unchanged", detail: "Unchanged",
    metrics: {
      demAverageDropoff: 2.5,
      auditContext: {
        sourceUrl: report.sourcePdfUrl,
        matchedSelectionRows: 0,
        auditedBallots: 0,
        aggregateAuditResults: structuredClone(legacyAggregate),
        caveat: report.caveat,
      },
    },
  };
}

test("read-time correction reaches legacy WI records, preserves original values, and is idempotent", () => {
  const legacy = legacyIndicator();
  const before = structuredClone(legacy);
  const corrected = withWisconsinAuditCorrection(legacy);
  assert.deepEqual(legacy, before, "Never mutate stored/input metrics");
  const audit = corrected.metrics.auditContext;
  assert.equal(audit.sourceReportSha256, report.sourcePdfSha256);
  assert.deepEqual(audit.aggregateAuditResults.percentageCorrection, percentageCorrection);
  assert.equal(audit.aggregateAuditResults.errorRateWithFiveReportedErrors, "0.0000009%");
  assert.equal(audit.aggregateAuditResults.finalEquipmentErrorRate, "0%");
  assert.equal(audit.matchedSelectionRows, 0, "No local audit selection may be invented");
  assert.equal(audit.auditedBallots, 0);
  assert.equal(corrected.metrics.demAverageDropoff, legacy.metrics.demAverageDropoff);
  assert.equal(corrected.severity, legacy.severity);
  assert.equal(corrected.type, legacy.type);
  assert.equal(corrected.summary, legacy.summary);
  assert.deepEqual(withWisconsinAuditCorrection(corrected), corrected);
});

test("correction fails closed for other states, years, reports, counts, or malformed context", () => {
  const changes = [
    (row) => { row.state = "MN"; },
    (row) => { row.electionYear = 2020; },
    (row) => { row.metrics = null; },
    (row) => { row.metrics.auditContext = null; },
    (row) => { row.metrics.auditContext = []; },
    (row) => { row.metrics.auditContext.aggregateAuditResults = null; },
    (row) => { row.metrics.auditContext.sourceUrl = "https://example.com/different-report.pdf"; },
    (row) => { row.metrics.auditContext.sourceReportSha256 = "unreviewed"; },
    (row) => { row.metrics.auditContext.aggregateAuditResults.ballotPositions = 10; },
    (row) => { row.metrics.auditContext.aggregateAuditResults.locallyReportedPotentialEquipmentIssueErrors = 6; },
    (row) => { row.metrics.auditContext.aggregateAuditResults.errorRateWithFiveReportedErrors = "different"; },
  ];
  for (const change of changes) {
    const row = legacyIndicator();
    change(row);
    assert.equal(withWisconsinAuditCorrection(row), row);
  }
  assert.equal(wisconsinAuditReportFor("MN", 2024), null);
  assert.equal(wisconsinAuditReportFor("WI", 2020), null);
});

test("notice renders both percentages, provenance and caveats, only for WI 2024", async () => {
  const require = createRequire(import.meta.url);
  const componentPath = new URL("../../src/app/wi-audit-report-note.tsx", import.meta.url);
  const helperUrl = new URL("../../src/lib/wi-audit-context.ts", import.meta.url).href;
  const compiled = ts.transpileModule(readFileSync(componentPath, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace('"@/lib/wi-audit-context"', JSON.stringify(helperUrl));
  const source = `import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};\n${compiled}`;
  const { WisconsinAuditReportNote } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const html = renderToStaticMarkup(React.createElement(WisconsinAuditReportNote, { state: "WI", electionYear: 2024 }));
  for (const text of ["0.0000009%", "0.0000892%", "0.0002%", "593", "0.011%", "U.S. Senate was not", "not a WEC-issued correction", "previously repeated the printed value", "are incorrect", "not a newly discovered candidate-vote error"]) {
    assert.ok(html.includes(text), text);
  }
  for (const page of [5, 9, 10, 11]) assert.ok(html.includes(`#page=${page}`));
  for (const props of [{ state: "WI", electionYear: 2020 }, { state: "MN", electionYear: 2024 }]) {
    assert.equal(renderToStaticMarkup(React.createElement(WisconsinAuditReportNote, props)), "");
  }
});

test("read adapter, cache version, UI placements and documented threshold stay connected", () => {
  assert.match(readFileSync("src/lib/data-access.ts", "utf8"), /\.map\(withWisconsinAuditCorrection\)/);
  assert.match(readFileSync("src/lib/api.ts", "utf8"), /indicators-wi-audit-correction-v1/);
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  assert.equal((tabs.match(/<WisconsinAuditReportNote state=\{selectedStateCode\} electionYear=\{electionYear\}/g) ?? []).length, 2);
  assert.match(tabs, /return `\$\{scope\}\$\{aggregate\}\$\{correctionNote\}\$\{caveat\}`/);
  const policy = readFileSync("src/lib/review-policy.ts", "utf8");
  assert.match(policy, /downBallotAverageThresholdPct: 2/);
  assert.match(readFileSync("docs/review-graph-calculations.md", "utf8"), /2 percentage points, in a scope with at least 8 local rows/);
});
