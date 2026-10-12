import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionEdges, connectionNodes, connectionPositions, connectionSources, connectionsFor, connectionViews, researchLeads } from "../../src/lib/election-connections.ts";
import { evidenceDescription, evidenceDescriptions, relationshipDescription, relationshipDescriptions, sourceDescriptions } from "../../src/app/connections/connection-descriptors.ts";
import { legacyExplorerDocument } from "../../src/lib/connection-explorer-data.ts";
import { guidedConnections } from "../../src/lib/connection-guides.ts";
import { compareConnectionReleases, validatedRelease } from "../../src/lib/connection-release-comparison.ts";
import { connectionJsonDigest } from "../../src/lib/connection-json-digest.ts";

test("beginner descriptors cover catalog relationship kinds without changing machine values", () => {
  for (const edge of connectionEdges) {
    const description = relationshipDescription(edge.kind);
    assert.ok(description?.label && description.description, edge.id);
    assert.equal(description, relationshipDescriptions[edge.kind]);
  }
  for (const attribution of ["official_record", "issuer_statement", "independent_reporting", "supplemental"]) {
    assert.equal(evidenceDescription(attribution), evidenceDescriptions[attribution]);
    assert.ok(evidenceDescriptions[attribution].label && evidenceDescriptions[attribution].description);
  }
  for (const unknown of ["all", "constructor", "toString", "__proto__", "not-a-kind"]) {
    assert.equal(relationshipDescription(unknown), null);
    assert.equal(evidenceDescription(unknown), null);
  }
  assert.match(relationshipDescriptions.survey.description, /not a count of ballots/);
  assert.match(relationshipDescriptions.technology.description, /does not establish its use/);
  assert.match(evidenceDescriptions.issuer_statement.description, /not independent corroboration/);
  for (const sourceClass of ["official", "issuer", "independent", "supplemental"]) {
    assert.ok(sourceDescriptions[sourceClass].label && sourceDescriptions[sourceClass].description);
  }
});

test("registry IDs are unique and every edge has source references and limits", () => {
  for (const records of [connectionNodes, connectionEdges, connectionSources, researchLeads]) {
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  }
  const nodes = new Set(connectionNodes.map((node) => node.id));
  const sources = new Set(connectionSources.map((source) => source.id));
  for (const connection of connectionEdges) {
    assert.ok(nodes.has(connection.from) && nodes.has(connection.to), connection.id);
    assert.ok(connection.sourceIds.length && connection.establishes && connection.limitation && connection.dated, connection.id);
    assert.ok(connection.sourceIds.every((id) => sources.has(id)), connection.id);
    assert.ok(connection.snapshots.length, connection.id);
  }
  for (const lead of researchLeads) assert.ok(lead.sourceIds.every((id) => sources.has(id)) && lead.needed, lead.id);
  for (const source of connectionSources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username + url.password, "");
    if (source.publishedOn) assert.match(source.publishedOn, /^\d{4}-\d{2}-\d{2}$/);
    if (source.eventOn) assert.match(source.eventOn, /^\d{4}-\d{2}-\d{2}$/);
  }
});

// These checks validate the recorded audit, not the external pages themselves.
test("each source has an explicit content-review record and locator", () => {
  for (const source of connectionSources) {
    assert.equal(source.review?.status, "content-checked", source.id);
    assert.match(source.review.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.review.locator && source.review.note, source.id);
  }
});

test("historical holdings and closing dates are not mislabeled as current or publication dates", () => {
  for (const id of ["paramount-control", "wbd-close"]) {
    const source = connectionSources.find((item) => item.id === id);
    assert.equal(source.publishedOn, undefined);
    assert.ok(source.eventOn);
  }
  for (const [id, year] of [["family-paramount", "2025"], ["paramount-cbs", "2025"], ["wbd-cnn", "2022"], ["trumpjr-kalshi", "2025"], ["county-team", "2022"], ["county-team-results", "2025"]]) {
    assert.ok(connectionEdges.find((item) => item.id === id).label.includes(year), id);
  }
});

test("all displayed nodes have finite, nonoverlapping positions within their view", () => {
  for (const view of connectionViews) {
    for (const year of ["2024", "2026"]) {
      const ids = [...new Set(connectionsFor(view, year).flatMap((connection) => [connection.from, connection.to]))];
      const positions = ids.map((id) => connectionPositions[view][id]);
      assert.ok(positions.every((point) => point?.every(Number.isFinite)), `${view}/${year}`);
      for (let i = 0; i < positions.length; i++) {
        const [x, y] = positions[i];
        assert.ok(x >= 96 && x <= 1224 && y >= 38 && y <= 632);
        for (let j = i + 1; j < positions.length; j++) {
          assert.ok(Math.abs(x - positions[j][0]) >= 192 || Math.abs(y - positions[j][1]) >= 76, `${ids[i]} overlaps ${ids[j]}`);
        }
      }
    }
  }
});

test("historical reporting does not silently use the new network provider", () => {
  const past = new Set(connectionsFor("reporting", "2024").map((connection) => connection.id));
  const current = new Set(connectionsFor("reporting", "2026").map((connection) => connection.id));
  for (const id of ["abc", "cbs", "cnn", "nbc"]) {
    assert.ok(past.has(`nep-${id}`) && !past.has(`ap-${id}`));
    assert.ok(current.has(`ap-${id}`) && !current.has(`nep-${id}`));
  }
  assert.ok(!past.has("ssrs-poll") && current.has("ssrs-poll"));
});

test("unsupported Oracle deployment claims are research questions, not graph edges", () => {
  for (const id of ["ap", "team", "save"]) {
    assert.ok(!connectionEdges.some((connection) => [connection.from, connection.to].includes("oracle") && [connection.from, connection.to].includes(id)));
  }
  assert.ok(researchLeads.some((lead) => lead.id === "ap-oracle"));
  assert.ok(researchLeads.some((lead) => lead.id === "team-oracle"));
  assert.ok(researchLeads.some((lead) => lead.id === "save-oracle"));
});

test("survey, corporate and reporting relationship types remain separate", () => {
  assert.ok(connectionEdges.filter((connection) => connection.from === "voterpoll").every((connection) => connection.kind === "survey"));
  assert.ok(connectionEdges.filter((connection) => connection.from === "ap" && ["abc", "cbs", "cnn", "nbc", "fox"].includes(connection.to)).every((connection) => connection.kind === "results"));
  assert.equal(connectionEdges.find((connection) => connection.id === "paramount-wbd").kind, "ownership");
  assert.match(connectionEdges.find((connection) => connection.id === "ap-cnn").limitation, /independent race calls/);
});

test("USA TODAY source scopes do not create a 2026 stringer-to-AP route", () => {
  const document = legacyExplorerDocument();
  assert.equal(document.sources.find((source) => source.id === "usatoday-stringers-nc-2026").sourceClass, "supplemental");
  assert.equal(document.sources.find((source) => source.id === "usatoday-stringers-tx-2026").sourceClass, "supplemental");
  assert.equal(document.claims.find((claim) => claim.id === "ap-usatodayco-2024").observedOn, "2024-03-19");
  assert.match(document.claims.find((claim) => claim.id === "ap-usatodayco-2024").limitation, /not confirmation of renewal in 2026/);
  assert.ok(!document.evidence.some((evidence) => evidence.sourceId.startsWith("usatoday-stringers-")));
  assert.ok(!document.claims.some((claim) => claim.id.includes("stringer")));
  assert.ok(document.questions.some((question) => question.id === "usatoday-stringers-2026" && !question.finding && question.status === "open"));
  assert.equal(connectionSources.find((source) => source.id === "ap-networks").review.checkedOn, "2026-10-11");
  assert.equal(connectionSources.find((source) => source.id === "ap-gannett-2024").review.checkedOn, "2026-10-12");
});

test("local records separate procurement, certification, fielded use and inventory", () => {
  const document = legacyExplorerDocument();
  for (const [id, scope] of [["harris-verity-procurement", "procured"], ["harris-verity-certification", "certified"], ["harris-verity-fielded-2022", "fielded"], ["harris-verity-inventory-2026", "documented"]]) {
    assert.equal(document.claims.find((claim) => claim.id === id).scope, scope);
  }
  assert.match(document.claims.find((claim) => claim.id === "harris-verity-fielded-2022").dated, /2022/);
  assert.equal(document.claims.find((claim) => claim.id === "harris-verity-fielded-2022").geography, "county:48201");
  assert.equal(document.contracts.length, 0);
});

test("guided examples only use extant public supporting records", () => {
  const document = legacyExplorerDocument();
  assert.equal(guidedConnections(document).length, 7);
  document.evidence = document.evidence.filter((item) => item.claimId !== "ap-cnn");
  assert.ok(!guidedConnections(document).some((claim) => claim.id === "ap-cnn"));
  document.claims = [];
  assert.deepEqual(guidedConnections(document), []);
});

test("reviewed comparison detects semantic and evidence changes without republishing prior wording", () => {
  const previous = { ...legacyExplorerDocument(), releaseId: "synthetic-previous" };
  const current = structuredClone(previous); current.releaseId = "synthetic-current";
  previous.claims[0].establishes = "OLD CORRECTED WORDING";
  previous.claims[1].label = "WITHDRAWN LABEL";
  current.claims = current.claims.filter((claim) => claim.id !== previous.claims[1].id);
  current.sources.find((source) => source.id === "ap-networks").title += " Updated";
  const diff = compareConnectionReleases(previous, current);
  assert.ok(diff.changes.some((item) => item.id === current.claims[0].id && item.fields.includes("establishes")));
  assert.ok(diff.changes.some((item) => item.id === "ap-cnn" && item.fields.includes("linked entity / source records")));
  assert.ok(diff.removedIds.includes(previous.claims[1].id));
  assert.equal(diff.counts.claims.removed, 1);
  assert.ok(!JSON.stringify(diff).includes("OLD CORRECTED WORDING"));
  assert.ok(!JSON.stringify(diff).includes("WITHDRAWN LABEL"));
  assert.ok(!JSON.stringify(diff).includes("https://"));
  const reordered = structuredClone(previous); reordered.claims.reverse(); reordered.sources.reverse(); reordered.evidence.reverse(); reordered.entities.reverse();
  assert.equal(compareConnectionReleases(previous, reordered).changes.length, 0);
  assert.throws(() => compareConnectionReleases(legacyExplorerDocument(), current), /not a reviewed release/);
});

test("archived snapshot validation rejects bad digest, identity, duplicates and private fields", () => {
  const document = { ...legacyExplorerDocument(), releaseId: `connections-${"a".repeat(64)}` };
  const row = { id: document.releaseId, document, digest: connectionJsonDigest(document) };
  assert.equal(validatedRelease(row).releaseId, document.releaseId);
  assert.throws(() => validatedRelease({ ...row, digest: "0".repeat(64) }), /digest/);
  assert.throws(() => validatedRelease({ ...row, id: "wrong-id" }), /identity/);
  const synthetic = { ...document, releaseId: "synthetic-release" };
  assert.throws(() => validatedRelease({ id: synthetic.releaseId, document: synthetic, digest: connectionJsonDigest(synthetic) }), /identity/);
  const duplicate = structuredClone(document); duplicate.claims.push(duplicate.claims[0]);
  assert.throws(() => validatedRelease({ ...row, document: duplicate, digest: connectionJsonDigest(duplicate) }), /Duplicate/);
  const privateDocument = { ...document, workingNotes: "PRIVATE" };
  assert.throws(() => validatedRelease({ ...row, document: privateDocument, digest: connectionJsonDigest(privateDocument) }));
});
