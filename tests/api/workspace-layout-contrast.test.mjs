import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWorkspaceContrastRatio,
  inspectWorkspaceContrast,
  workspaceContrastRatio,
} from "../../src/lib/workspace-layout-contrast.ts";

test("contrast ratio follows WCAG reference values", () => {
  assert.equal(workspaceContrastRatio("#000000", "#ffffff"), 21);
  assert.equal(formatWorkspaceContrastRatio(4.567), "4.57:1");
  assert.equal(workspaceContrastRatio("invalid", "#ffffff"), null);
});

test("contrast inspection applies text and non-text thresholds", () => {
  const results = inspectWorkspaceContrast([
    { background: "#ffffff", foreground: "#767676", label: "Body", threshold: 4.5 },
    { background: "#ffffff", foreground: "#999999", label: "Focus", threshold: 3 },
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
});
