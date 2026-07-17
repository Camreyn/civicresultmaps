---
name: civic-layout-control
description: Inspect, validate, preview, and safely edit CivicResultMaps Layout Control Center drafts through the guarded layout MCP tools. Use for UI layout, theme, tab, group, row, column, or content-block changes. Do not use for data ETL or production publishing.
---

# Civic Layout Control

Use the `civic-layout-control` MCP server to work with the visual Layout Control Center. Its tools intentionally stop at immutable revision creation; they cannot publish to production.

## Required workflow

1. Call `layout_status` to see active drafts and the latest immutable revision.
2. Call `layout_get_draft` before proposing or applying changes. Treat its `version` and object IDs as authoritative.
3. Prefer an existing named draft when the user identifies one. Otherwise, create a draft from `latest` with `layout_create_draft` only when the user has asked to begin or save layout work.
4. Express edits as the smallest constrained operation batch. Use a unique lowercase `operationId` for every operation. Add and duplicate operations derive stable IDs from it, so those IDs can be referenced later in the same batch.
5. Call `layout_preview_changes` first. Explain the material diff, validation result, and any accessibility or required-component constraint.
6. Call `layout_save_changes` only after the user has approved the preview or has explicitly instructed you to apply the described changes. Pass the exact current draft version and `confirmation: "SAVE_DRAFT"`.
7. Reload after every save because the draft version increments. On a version conflict, never retry blindly; get the current draft and reconcile.
8. Call `layout_create_revision` only when the user explicitly asks for an immutable revision after reviewing the draft. Pass `confirmation: "CREATE_REVISION"` and a concrete change summary.

## Safety boundaries

- Never claim that a draft, preview, or revision is live. No tool in this plugin stages, schedules, promotes, rolls back, or publishes.
- Never bypass a failed operation with raw SQL, arbitrary JSON patching, direct database access, or Edge Config changes.
- Preserve required production components, source labels, data queries, calculations, caveats, and public-interest framing.
- Describe validation or reconciliation signals as advisory. Do not claim fraud or misconduct.
- Do not expose, repeat, log, or place the bearer token in source code, tool arguments, commits, or chat.
- Content-block deletion automatically prunes empty custom columns, rows, and groups; it still refuses any change that would leave a tab structurally invalid.
- For a production component, edit only supported presentation or variant configuration. Production content remains code-owned.

## Operation guidance

- Workspace design: `update_workspace`
- Tab visibility and presentation: `update_tab`
- Structure: `add_*`, `move_*`, `duplicate_*`, and `delete_*` operations for groups, rows, columns, and blocks
- Content and component presentation: `update_block`
- Locks and responsive spans: the matching `update_group`, `update_row`, `update_column`, or `update_block`

Use IDs returned by `layout_get_draft`; do not guess existing IDs. If validation rejects contrast, required surfaces, limits, links, visibility facts, or responsive spans, revise the proposal within the supported schema.
