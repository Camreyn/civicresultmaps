# Workspace Layout Operations

The workspace layout system is a constrained production page builder for allowlisted operators. It can reshape the public workspace without a code deployment while keeping election data, verified production behavior, source caveats, permissions, and required trust surfaces code-owned.

## Builder capabilities

| Scope | Editable controls |
| --- | --- |
| Workspace | Theme, accent, spacing, type scale, corners, shadows, tab style, content width, default tab, and initial Data Notes state |
| Tab | Visibility where allowed, density, Data Notes position, and a responsive row/column hierarchy |
| Production component | Move between columns, responsive width, visibility where allowed, surface, emphasis, density, and allowlisted variants |
| Approved content block | Add, drag, hide, delete, format rich text, manage media, configure links/items, and attach visibility rules |
| Review workflow | Desktop/tablet/mobile preview, undo, redo, validation, immutable save, reusable templates, draft preview, and protected publication |

The approved content library contains Heading, Rich text, Narrative, Callout, Metric strip, Link list, Button group, Image, Video, Accordion, and Divider. Images use the linked Vercel Blob store; video blocks accept only YouTube or Vimeo IDs.

The canvas is a production-shaped preview with representative fixtures. It mirrors navigation, content hierarchy, responsive widths, hidden states, and the fixed Data Notes surface; it does not duplicate live election queries inside the admin page. Use **Draft preview** after saving to inspect the exact public runtime with real data before publication.

Rows use a responsive 12-column grid. Desktop spans are 3, 4, 6, 8, 9, or 12; tablet spans are 6 or 12; mobile is always 12. Production behavior remains code-owned even when its position, presentation, or allowlisted variant changes.

## Safety boundaries

- The registries in `src/lib/workspace-layout.ts` and `src/lib/workspace-layout-v2.ts` are the code-owned lists of allowed tabs and production components.
- Map, Review Center, Data & Sources, and Review Guide are required tabs.
- Results Map and Source Provenance are required production sections.
- Every visible tab must retain at least one visible production section.
- Data Notes remains a fixed trust surface. Operators may change its initial open state and side, below, or drawer placement, but not its source-driven content or remove it.
- Custom blocks are supplemental, can share rows with production components, and are limited to 12 per tab and 20 rows per tab.
- Required production components cannot use data-dependent visibility rules.
- Visibility rules use only allowlisted public state, year, capability, data-availability, and validation facts; viewport rules are CSS-safe and mobile remains stacked.
- Custom text is escaped. Links accept only safe internal paths, HTTPS URLs, and email links; protocol-relative links such as `//example.com` are rejected.
- Verified labels, data queries, interactions, source caveats, and authorization remain code-owned.
- Every manifest is validated against the exact registry and protected by a SHA-256 digest.
- Invalid editor state blocks saving.
- Runtime precedence is authorized draft preview, enabled candidate, stable, then the embedded default.
- Missing, malformed, stale, or tampered remote data fails closed to the next safe source.

## System surfaces

| Surface | Responsibility |
| --- | --- |
| `/admin/layout` | Clerk-protected page builder, validation, immutable revisions, preview, and publication requests |
| Neon tables | Immutable revisions, idempotent publication requests, audit events, shared templates, managed assets, and immutable asset references |
| Vercel Blob | Public `layout-media/` images with authenticated uploads, MIME/size limits, and stored dimensions/alt text |
| Vercel Edge Config | `workspaceLayoutStable` and `workspaceLayoutCandidate` envelopes |
| Vercel Flags | Browser-stable evaluation of `workspace-layout-candidate` |
| GitHub Actions | Protected, serialized Edge Config publisher with environment approvals |
| Public runtime | Validates envelopes and resolves draft → candidate → stable → embedded |

## Initial setup

### 1. Apply the database migrations

Configure `DATABASE_URL` or `POSTGRES_URL`, then apply all checked-in Drizzle migrations. For a linked development database:

```powershell
npm run db:push
```

The immutable revision schema is introduced by migrations 0004 and 0005. Migration `drizzle/0006_broad_quicksilver.sql` enables schema v2 and adds managed assets, shared templates, and immutable asset-reference tables. Apply migrations separately to preview and production databases before enabling Builder v3 there.

### 2. Configure private administration

Set these application environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser configuration |
| `CLERK_SECRET_KEY` | Clerk server authentication |
| `UI_LAYOUT_ADMIN_EMAILS` | Comma-separated verified email allowlist; matching is case-insensitive |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob upload token, normally injected by the linked Blob store |

Authorization is checked on the page and again in every Server Action. A signed-in user needs at least one verified Clerk email that matches the allowlist.

### 3. Link Edge Config and Flags

Create or select an Edge Config store and link it to each Vercel environment so the application receives `EDGE_CONFIG`. Configure the `workspace-layout-candidate` flag with the default value set to `false`. Set `FLAGS_SECRET` to protect the Flags discovery endpoint.

No Edge Config item has to exist at first. The application uses the embedded manifest until a stable envelope is published.

### 4. Protect the publisher

Create GitHub environments named:

- `ui-layout-preview`
- `ui-layout-production`

Require reviewer approval for `ui-layout-production`. Add these environment-scoped secrets:

| Secret | Purpose |
| --- | --- |
| `UI_LAYOUT_DATABASE_URL` | Database containing the requested immutable revision |
| `VERCEL_ACCESS_TOKEN` | Token used only by the protected publisher |
| `VERCEL_EDGE_CONFIG_ID` | Target Edge Config store |
| `VERCEL_ORG_ID` | Vercel organization identifier |
| `VERCEL_PROJECT_ID` | Vercel project identifier |
| `VERCEL_TEAM_ID` | Optional team scope for REST calls and CLI operations |

The application dispatch token is separate. Configure `UI_LAYOUT_GITHUB_TOKEN`, `UI_LAYOUT_GITHUB_REPOSITORY`, and optionally `UI_LAYOUT_PUBLISH_REF`. Give that token only enough repository Actions access to dispatch `ui-layout-publish.yml`.

Keep `UI_LAYOUT_PUBLISH_WORKFLOW_ENABLED=false` until the workflow and protected environments exist on the selected publish ref. Recorded requests remain safely queued while dispatch is disabled. Set it to `true` only after a preview publication has succeeded.

## Builder workflow

1. Open `/admin/layout` and choose a fixed production tab in the left Build pane.
2. Add rows and columns, then drag components by the six-dot handle or move whole rows with the arrow controls.
3. Select a row, column, component, or its gear to configure it in the right inspector.
4. Add approved content blocks, choose production variants, or start from a built-in/shared template.
5. Switch among Desktop, Tablet, and Mobile and set each column span at the active breakpoint.
6. Use Undo or Redo while editing. **Reset** restores the currently loaded saved manifest.
7. Resolve blocking validation, verify rich text/media alt text and visibility rules, then save an optional reusable template.
8. Enter a change summary and select **Save revision**. Saving never publishes the active layout.

Saving creates a child revision; it does not overwrite or publish the active layout.

## Exact-runtime review and publication

1. Select **Draft preview** beside a saved revision. This sets an eight-hour HTTP-only admin cookie and uses the real public renderer. The public banner provides an exit action.
2. Request **Stage candidate** in preview. The protected workflow disables candidate exposure, writes only `workspaceLayoutCandidate`, reads back the Edge Config digest, and records the result.
3. Enable a limited candidate rollout in Vercel Flags and inspect the preview deployment. The `crm_layout_visitor` HTTP-only cookie keeps evaluation stable for a browser.
4. Request **Promote stable** only after draft and candidate review pass.
5. Repeat the protected production request and approval after preview verification.

The workflow accepts only a publication UUID and target environment. It reloads the immutable revision and action from Neon rather than accepting a manifest or action from workflow input.

## Rollback

Select a previously known-good revision and request **Roll back**. The protected workflow disables candidate exposure first and writes that revision to both stable and candidate. Rollback is a new audited publication event; it does not mutate or delete later revisions.

If workflow dispatch is unavailable, leave the request queued. Do not hand-edit an envelope in Edge Config unless an incident commander explicitly accepts losing the normal audit and idempotency guarantees.

## Failure behavior

| Failure | Public behavior |
| --- | --- |
| Edge Config unavailable | Stable is unavailable, so the embedded layout renders |
| Candidate flag evaluation fails | Candidate remains off; stable or embedded renders |
| Candidate envelope invalid | Stable renders and a non-identifying fallback reason is logged |
| Stable envelope invalid | Embedded layout renders |
| Draft cookie invalid or user unauthorized | Draft is ignored |
| Clerk unconfigured | Public site works; admin route shows setup guidance |
| Database unconfigured | Public site works; authorized admin route shows database guidance |
| Publisher disabled | Request is audited and queued without external mutation |

Application layout logs include only source, revision ID, and fallback reasons. They do not include the raw rollout visitor ID.

## Verification

Run these checks before enabling publication dispatch:

```powershell
npm run test:layout
npm run typecheck
npm run build
npm run test:e2e
```

The publisher module can also be smoke-loaded without credentials; it should stop at its strict publication-ID validation:

```powershell
node --experimental-strip-types scripts/publish-ui-layout.ts
```

Do not run a real publication command locally unless an approved publication request, protected environment, and explicit production authorization are all in place.

## Privacy disclosure

The public rollout cookie contains a random UUID, not account or election-selection data. It is HTTP-only, SameSite Lax, secure in production, and expires after one year. The identifier is used for flag evaluation, is not written to the application database, and is not included in application logs. The public explanation lives at `/privacy`.
