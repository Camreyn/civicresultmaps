import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isWorkspaceLayoutPublicationAction,
  isWorkspaceLayoutPublicationEnvironment,
  workspaceLayoutEdgeKeys,
  workspaceLayoutPublicationChannel,
} from "../../src/lib/workspace-layout-publisher-policy.ts";

test("publisher accepts only protected deployment environments", () => {
  assert.equal(isWorkspaceLayoutPublicationEnvironment("preview"), true);
  assert.equal(isWorkspaceLayoutPublicationEnvironment("production"), true);
  assert.equal(isWorkspaceLayoutPublicationEnvironment("development"), false);
});

test("publisher accepts only immutable publication actions", () => {
  for (const action of ["stage", "promote", "rollback"]) {
    assert.equal(isWorkspaceLayoutPublicationAction(action), true);
  }
  assert.equal(isWorkspaceLayoutPublicationAction("edit"), false);
});

test("stage updates only candidate while promote and rollback align both keys", () => {
  assert.deepEqual(workspaceLayoutEdgeKeys("stage"), ["workspaceLayoutCandidate"]);
  assert.deepEqual(workspaceLayoutEdgeKeys("promote"), ["workspaceLayoutStable", "workspaceLayoutCandidate"]);
  assert.deepEqual(workspaceLayoutEdgeKeys("rollback"), ["workspaceLayoutStable", "workspaceLayoutCandidate"]);
  assert.equal(workspaceLayoutPublicationChannel("stage"), "candidate");
  assert.equal(workspaceLayoutPublicationChannel("promote"), "stable");
  assert.equal(workspaceLayoutPublicationChannel("rollback"), "stable");
});
test("protected workflow does not interpolate dispatch inputs into shell syntax", () => {
  const workflow = readFileSync(".github/workflows/ui-layout-publish.yml", "utf8");
  const editor = readFileSync("src/app/admin/layout/layout-editor.tsx", "utf8");
  const page = readFileSync("src/app/admin/layout/page.tsx", "utf8");

  assert.match(workflow, /UI_LAYOUT_PUBLICATION_ID: \$\{\{ inputs\.publication_id \}\}/);
  assert.match(workflow, /UI_LAYOUT_ENVIRONMENT: \$\{\{ inputs\.environment \}\}/);
  assert.doesNotMatch(workflow, /run:.*\$\{\{ inputs\./);
  assert.doesNotMatch(editor, /useId/);
  assert.match(page, /requestKey=\{randomUUID\(\)\}/);
});

test("publisher disables the candidate flag with the boolean off variant", () => {
  const publisher = readFileSync("scripts/publish-ui-layout.ts", "utf8");

  assert.match(publisher, /"--variant",\s*"false"/);
  assert.doesNotMatch(publisher, /"--variant",\s*"off"/);
});

test("publisher upserts Edge Config items without an existence race", () => {
  const publisher = readFileSync("scripts/publish-ui-layout.ts", "utf8");

  assert.match(publisher, /operation: "upsert"/);
  assert.doesNotMatch(publisher, /edgeItemExists/);
  assert.doesNotMatch(publisher, /await Promise\.all\(items\.map/);
});
