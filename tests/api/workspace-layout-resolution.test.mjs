import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceLayoutEnvelope,
  validateWorkspaceLayoutEnvelope,
  workspaceLayoutDigest,
} from "../../src/lib/workspace-layout-digest.ts";
import {
  getEmbeddedWorkspaceLayoutEnvelope,
  resolveWorkspaceLayoutCandidates,
} from "../../src/lib/workspace-layout-resolution.ts";
import {
  cloneWorkspaceLayoutManifest,
} from "../../src/lib/workspace-layout.ts";

function envelope(revisionId) {
  return createWorkspaceLayoutEnvelope({
    manifest: cloneWorkspaceLayoutManifest(),
    publishedAt: "2026-07-15T12:00:00.000Z",
    revisionId,
  });
}

test("layout resolution follows draft, candidate, stable, embedded precedence", () => {
  const draft = envelope("draft");
  const candidate = envelope("candidate");
  const stable = envelope("stable");

  assert.equal(resolveWorkspaceLayoutCandidates({ draft, candidate, candidateEnabled: true, stable }).source, "draft");
  assert.equal(resolveWorkspaceLayoutCandidates({ candidate, candidateEnabled: true, stable }).source, "candidate");
  assert.equal(resolveWorkspaceLayoutCandidates({ candidate, candidateEnabled: false, stable }).source, "stable");
  assert.equal(resolveWorkspaceLayoutCandidates({ candidateEnabled: false }).source, "embedded");
});

test("an invalid candidate fails closed to stable", () => {
  const candidate = envelope("candidate");
  candidate.manifest.tabs.reverse();
  const stable = envelope("stable");
  const result = resolveWorkspaceLayoutCandidates({ candidate, candidateEnabled: true, stable });

  assert.equal(result.source, "stable");
  assert.equal(result.envelope.revisionId, "stable");
  assert.match(result.fallbacks.join(" "), /candidate_invalid:.*digest does not match/i);
});

test("invalid stable data fails closed to the embedded manifest", () => {
  const stable = { ...envelope("stable"), manifestDigest: "0".repeat(64) };
  const result = resolveWorkspaceLayoutCandidates({ candidateEnabled: false, stable });

  assert.equal(result.source, "embedded");
  assert.equal(result.envelope.revisionId, getEmbeddedWorkspaceLayoutEnvelope().revisionId);
  assert.match(result.fallbacks.join(" "), /stable_invalid:.*digest does not match/i);
});

test("manifest digests are stable across JSON object key order", () => {
  const manifest = cloneWorkspaceLayoutManifest();
  const reordered = {
    settings: {
      theme: manifest.settings.theme,
      tabStyle: manifest.settings.tabStyle,
      notesDefault: manifest.settings.notesDefault,
      defaultTab: manifest.settings.defaultTab,
      contentWidth: manifest.settings.contentWidth,
    },
    tabs: manifest.tabs.map((tab) => ({
      sections: tab.sections.map((section) => ({ visible: section.visible, id: section.id })),
      visible: tab.visible,
      id: tab.id,
    })),
    registryVersion: manifest.registryVersion,
    schemaVersion: manifest.schemaVersion,
  };

  assert.equal(workspaceLayoutDigest(manifest), workspaceLayoutDigest(reordered));
});

test("envelopes detect digest tampering", () => {
  const value = envelope("revision-1");
  value.manifest.tabs[0].sections.reverse();
  const result = validateWorkspaceLayoutEnvelope(value);

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /manifestDigest does not match/);
});
