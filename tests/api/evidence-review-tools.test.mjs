import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("review center exposes evidence readiness and flag explainability tools", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(tabs, /Evidence Review Toolkit/);
  assert.match(tabs, /buildEvidenceReadinessDimensions/);
  assert.match(tabs, /readinessGateLabel/);
  assert.match(tabs, /Flag Explainability Panel/);
  assert.match(tabs, /buildFlagExplanation/);
  assert.match(tabs, /source context/);
  assert.match(tabs, /denominator context/);
  assert.match(tabs, /audit context/);
  assert.match(tabs, /do not allege wrongdoing|not risk or proof|not to declare conclusions/);
  assert.match(styles, /evidence-toolkit/);
  assert.match(styles, /readiness-score/);
  assert.match(styles, /flag-explain-panel/);
});

test("guided tour includes evidence review toolkit steps", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");

  assert.match(tabs, /id: "evidence-toolkit"/);
  assert.match(tabs, /id: "evidence-readiness-score"/);
  assert.match(tabs, /id: "flag-explainability-panel"/);
  assert.match(tabs, /id: "evidence-toolkit-empty"/);
  assert.match(tabs, /target: "\[data-tour='evidence-toolkit'\]"/);
  assert.match(tabs, /target: "\[data-tour='flag-explainability-panel'\]"/);
  assert.match(tabs, /Low score means collect evidence before interpreting flags/);
});
test("review center exposes focused subviews", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(tabs, /type ReviewView = "overview" \| "tools" \| "screening" \| "indicators" \| "methodology"/);
  assert.match(tabs, /reviewViewOptions/);
  assert.match(tabs, /data-tour="review-subnav"/);
  assert.match(tabs, /data-tour="review-overview"/);
  assert.match(tabs, /data-tour="review-tools-view"/);
  assert.match(tabs, /data-tour="review-screening-view"/);
  assert.match(tabs, /data-tour="review-indicators-view"/);
  assert.match(tabs, /data-tour="review-methodology-view"/);
  assert.match(tabs, /reviewView: "tools"/);
  assert.match(tabs, /reviewView: "screening"/);
  assert.match(tabs, /reviewView: "methodology"/);
  assert.match(styles, /review-subnav/);
  assert.match(styles, /review-overview-grid/);
  assert.match(styles, /review-action-stack/);
});
