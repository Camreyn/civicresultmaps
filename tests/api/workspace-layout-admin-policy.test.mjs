import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPrivateAdminPath,
  parseLayoutAdminAllowlist,
  selectAuthorizedLayoutAdminEmail,
} from "../../src/lib/ui-layout-admin-policy.ts";

test("Clerk middleware is scoped to private admin routes", () => {
  assert.equal(isPrivateAdminPath("/"), false);
  assert.equal(isPrivateAdminPath("/api/states"), false);
  assert.equal(isPrivateAdminPath("/administrator"), false);
  assert.equal(isPrivateAdminPath("/admin"), true);
  assert.equal(isPrivateAdminPath("/admin/layout"), true);
  assert.equal(isPrivateAdminPath("/admin/sign-in"), true);
});

test("layout admin allowlist is normalized and fails closed", () => {
  assert.deepEqual([...parseLayoutAdminAllowlist(undefined)], []);
  assert.deepEqual(
    [...parseLayoutAdminAllowlist(" Admin@Example.com, reviewer@example.com, ")],
    ["admin@example.com", "reviewer@example.com"],
  );
});

test("only a verified email supplied by auth can match the allowlist", () => {
  assert.equal(
    selectAuthorizedLayoutAdminEmail(
      ["Verified@Example.com"],
      "verified@example.com,other@example.com",
    ),
    "verified@example.com",
  );
  assert.equal(selectAuthorizedLayoutAdminEmail([], "verified@example.com"), undefined);
  assert.equal(selectAuthorizedLayoutAdminEmail(["stranger@example.com"], "verified@example.com"), undefined);
});

test("server authorization filters Clerk emails by verified status", () => {
  const auth = readFileSync("src/lib/ui-layout-auth.ts", "utf8");
  const actions = readFileSync("src/app/admin/layout/actions.ts", "utf8");
  const exitRoute = readFileSync("src/app/admin/layout/preview/exit/route.ts", "utf8");

  assert.match(auth, /verification\?\.status === "verified"/);
  assert.match(auth, /selectAuthorizedLayoutAdminEmail/);
  assert.equal(actions.match(/await requireLayoutAdmin\(\)/g)?.length, 5);
  assert.match(exitRoute, /await requireLayoutAdmin\(\)/);
});

test("layout editor exposes a responsive constrained page builder", () => {
  const editor = readFileSync("src/app/admin/layout/layout-editor-v2.tsx", "utf8");
  const canvas = readFileSync("src/app/admin/layout/layout-builder-canvas.tsx", "utf8");
  const inspector = readFileSync("src/app/admin/layout/layout-builder-inspector.tsx", "utf8");
  const sidebar = readFileSync("src/app/admin/layout/layout-builder-sidebar.tsx", "utf8");
  const css = readFileSync("src/app/admin/layout/layout-editor.module.css", "utf8");

  assert.match(editor, /DragDropProvider/);
  assert.match(editor, /undo/);
  assert.match(editor, /redo/);
  assert.match(editor, /Before - saved revision/);
  assert.match(editor, /Pre-publish checks/);
  assert.match(canvas, /ProductionFixture/);
  assert.match(canvas, /GripVertical/);
  assert.match(canvas, /Settings2/);
  assert.match(canvas, /Data Notes/);
  assert.match(sidebar, /workspaceComponentLibrary/);
  assert.match(sidebar, /Approved components/);
  assert.match(inspector, /Responsive placement/);
  assert.match(inspector, /Verified labels, data queries, source caveats/);
  assert.match(css, /\.builderGrid/);
  assert.match(css, /\.canvasGrid/);
  assert.match(css, /\.compareGrid/);
  assert.match(css, /\.inspectorPanel/);
});

test("builder v3 exposes responsive rows, rich content, media, and publication controls", () => {
  const editor = readFileSync("src/app/admin/layout/layout-editor-v3.tsx", "utf8");
  const richText = readFileSync("src/app/admin/layout/layout-rich-text-editor.tsx", "utf8");
  const runtime = readFileSync("src/lib/workspace-layout-v2-runtime.ts", "utf8");
  const css = readFileSync("src/app/admin/layout/layout-editor-v3.module.css", "utf8");

  assert.match(editor, /workspaceCustomRows|createWorkspaceCustomNodeV2/);
  assert.match(editor, /desktop.*tablet.*mobile/s);
  assert.match(editor, /layout-media\//);
  assert.match(editor, /name="publicationAction"/);
  assert.match(editor, /VisibilityInspector/);
  assert.match(editor, /aria-label="Comparison mode"/);
  assert.match(editor, /Before - saved revision/);
  assert.match(editor, /workspace:accent-color/);
  assert.match(editor, /--preview-accent/);
  assert.match(richText, /LexicalComposer/);
  assert.match(runtime, /workspaceCustomRowsV2/);
  assert.match(css, /\.columns/);
  assert.match(css, /--preview-background: #101112/);
  assert.match(css, /var\(--preview-accent\)/);
  assert.match(css, /\.compareGrid/);
  assert.match(css, /\.inspector/);
});

test("builder v4 exposes grouped editing, recovery, scheduling, and safety controls", () => {
  const editor = readFileSync("src/app/admin/layout/layout-editor-v4.tsx", "utf8");
  const canvas = readFileSync("src/app/admin/layout/layout-editor-v4-canvas.tsx", "utf8");
  const inspector = readFileSync("src/app/admin/layout/layout-editor-v4-inspector.tsx", "utf8");
  const scheduler = readFileSync("src/lib/ui-layout-scheduler.ts", "utf8");
  const cron = readFileSync("src/app/api/cron/ui-layout-publications/route.ts", "utf8");
  const harness = readFileSync("src/app/layout-test-harness/page.tsx", "utf8");
  const flags = readFileSync("src/flags.ts", "utf8");
  const page = readFileSync("src/app/admin/layout/page.tsx", "utf8");
  const templateActions = readFileSync("src/app/admin/layout/template-actions.ts", "utf8");

  assert.match(editor, /DragDropProvider/);
  assert.match(editor, /Before.*After.*Compare/s);
  assert.match(editor, /RECOVERY_KEY/);
  assert.match(editor, /saveLayoutDraftAction/);
  assert.match(editor, /workspaceStarterGroupTemplatesV3/);
  assert.match(canvas, /layout-group/);
  assert.match(canvas, /layout-row/);
  assert.match(canvas, /layout-column/);
  assert.match(canvas, /layout-node/);
  assert.match(inspector, /Live design tokens/);
  assert.match(inspector, /Accessibility checks|Visibility rules/);
  assert.match(scheduler, /claimDueLayoutPublications/);
  assert.match(scheduler, /workspaceLayoutRetryDelayMinutes/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /UI_LAYOUT_SCHEDULER_ENABLED/);
  assert.match(harness, /UI_LAYOUT_TEST_HARNESS !== "true"/);
  assert.match(harness, /VERCEL_ENV === "production"/);
  assert.match(flags, /NODE_ENV === "development" && !process.env.VERCEL/);
  assert.match(page, /builderV4Enabled [?] listLayoutDrafts[(][)]/);
  assert.match(templateActions, /toWorkspaceLayoutManifestV3/);
});
