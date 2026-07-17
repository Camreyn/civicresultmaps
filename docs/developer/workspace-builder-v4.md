# Workspace Builder v4

Workspace Builder v4 extends the constrained layout system with grouped composition, collaborative named drafts, revision comparison, and scheduled publication. It keeps election data, verified labels, calculations, source caveats, and required trust surfaces code-owned.

## What changed

- Schema v3 models `Tab -> Group -> Row -> Column -> Component` and projects back to the compatibility renderer for hardened production components.
- Groups have an editor name plus optional public heading, description, spacing, surface, alignment, and divider settings.
- Rows and columns can be moved independently. Columns use a 12-column desktop/tablet grid and always stack at full width on mobile.
- Production and approved custom components support constrained height, visibility, presentation, locking, duplication where safe, and reusable settings.
- The preview provides Before, After, and side-by-side Compare modes for desktop, tablet, and mobile.
- Workspace colors are live design tokens. Validation blocks a revision when required WCAG contrast thresholds fail.
- Named drafts autosave with optimistic version checks. A concurrent edit produces a conflict choice instead of silently overwriting another session.
- Local recovery preserves unsaved browser work after refresh or a crashed session.
- Whole-workspace templates remain available, and custom-only groups can be saved as shared group templates.
- Revision review shows structured additions, removals, and changed fields before publication.
- Publication requests can run immediately or at a future time, with cancellation, claim recovery, bounded retries, and audit events.

The builder canvas uses representative fixtures so editing stays fast and cannot accidentally mutate live election data. The saved-revision preview is the exact public-data review surface and remains required before publication.

## Runtime and rollout flags

Two independent Vercel Flags limit rollout risk:

| Flag | Production default | Responsibility |
| --- | --- | --- |
| `workspace-builder-v4` | Off | Enables v4 controls on `/admin/layout` |
| `workspace-layout-runtime-v3` | Off | Enables schema-v3 group presentation and design tokens in the public workspace |

Local development defaults both flags on. All Vercel environments, including preview and production, default them off until the matching database migration is applied and the flags are deliberately enabled. Keep the runtime flag off until a schema-v3 revision has passed saved-revision and candidate review.

The existing `workspace-layout-candidate` flag still controls visitor routing between stable and candidate envelopes. Builder rollout and public-layout rollout are intentionally separate.

## Database migration

Migration `drizzle/0007_sudden_agent_brand.sql`:

- permits immutable revision schema version 3;
- adds named drafts and draft-to-asset references;
- adds shared group templates and template-to-asset references;
- adds scheduling, retry, claim, and cancellation fields to publication requests;
- adds `scheduled`, `retrying`, and `cancelled` publication statuses and scheduler indexes.

Apply 0007 to a preview database before enabling Builder v4 in preview. Applying it to production is a separate production database change and requires explicit authorization. The application does not auto-apply this migration during deployment.

## Scheduled publication

Vercel Cron calls `GET /api/cron/ui-layout-publications` every five minutes. Vercel sends `Authorization: Bearer <CRON_SECRET>`; the route fails closed when the secret is absent or incorrect. Keep `UI_LAYOUT_SCHEDULER_ENABLED=false` until migration 0007 and protected workflow dispatch are ready; while disabled, authenticated cron requests return without querying scheduling columns.

The scheduler:

1. selects due `scheduled` or `retrying` requests;
2. atomically claims each request so overlapping cron invocations cannot dispatch it twice;
3. dispatches only the publication UUID and environment to the protected GitHub workflow;
4. clears successful claims and records an audit event;
5. retries failures with bounded backoff, then marks the request failed after the configured attempt limit;
6. allows an administrator to cancel only a pending scheduled or retrying request.

Schedule entry is interpreted in the administrator's browser time zone and submitted to the server as an ISO timestamp. The activity list converts stored UTC timestamps back to the viewer's local time.

Scheduling does not bypass the GitHub environment approval gate. A scheduled production request still requires the normal protected workflow and production approval.

## Draft collaboration model

Named drafts are shared among allowlisted layout administrators. Every write records the acting Clerk user and verified email. Autosave supplies the expected draft version; if another browser saved first, the editor offers the current server copy or an explicit overwrite based on its newer version.

Drafts may contain incomplete work, but an immutable revision cannot be saved until the complete schema, registry, required-component, URL/media, visibility, and contrast validation passes. Draft and template asset references prevent managed media from being removed while it is still in use.

## Safe deployment order

1. Run `npm run test:layout`, `npm run typecheck`, `npm run build`, and the targeted v4 browser test.
2. Push the feature branch and open a draft pull request.
3. Apply migration 0007 to the preview database after approval.
4. Deploy a Vercel preview and enable `workspace-builder-v4` only for the allowlisted admin test session.
5. Create a named draft, exercise undo/redo and responsive Compare, save a revision, and open its exact-runtime preview.
6. Stage the revision as a candidate in preview and verify it with real state data.
7. Merge through normal review. Do not enable production flags or apply the production migration as part of the preview step.
8. After explicit production database approval, apply 0007, verify the cron secret and protected workflow, set `UI_LAYOUT_SCHEDULER_ENABLED=true`, then enable Builder v4 for administrators.
9. Enable the v3 public runtime for an internal/candidate audience first. Promote stable only after candidate acceptance.

## Rollback

- Turning off `workspace-builder-v4` returns the admin page to the v3 compatibility editor.
- Turning off `workspace-layout-runtime-v3` keeps schema-v3 envelopes readable but projects them through the compatibility renderer.
- Turning off `workspace-layout-candidate` sends visitors back to the stable envelope.
- A stable rollback remains an audited publication of a known-good immutable revision.
- Database migration 0007 is additive except for widening the revision-version check and enum values. Leave the schema in place during an application rollback; destructive database rollback is neither required nor recommended.

## Local test harness

Set `UI_LAYOUT_TEST_HARNESS=true` to expose `/layout-test-harness` locally for deterministic browser tests without Clerk or database mutations. The route is no-index and always returns 404 when `VERCEL_ENV=production`, even if the variable is accidentally present.
