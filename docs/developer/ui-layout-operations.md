# Workspace Layout Operations

The workspace layout system lets an allowlisted operator change tab and section order or visibility without redeploying application code. It does not make copy, components, data, permissions, or caveats editable.

## Safety boundaries

- The registry in `src/lib/workspace-layout.ts` is the code-owned list of allowed tabs and sections.
- Map, Review Center, Data & Sources, and Review Guide are required tabs.
- Results Map and Source Provenance are required sections.
- Data Notes stays outside the manifest and cannot be hidden or reordered.
- Every manifest is validated against the exact registry and protected by a SHA-256 digest.
- Runtime precedence is authorized draft preview, enabled candidate, stable, then the embedded default.
- Missing, malformed, stale, or tampered remote data fails closed to the next safe source.

## System surfaces

| Surface | Responsibility |
| --- | --- |
| `/admin/layout` | Clerk-protected reorder, visibility, revision, preview, and publication UI |
| Neon tables | Immutable revisions, idempotent publication requests, and audit events |
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

The layout schema is introduced by `drizzle/0004_uneven_hellcat.sql` and completed by `drizzle/0005_lazy_human_torch.sql`. Apply migrations separately to preview and production databases before enabling the editor there.

### 2. Configure private administration

Set these application environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser configuration |
| `CLERK_SECRET_KEY` | Clerk server authentication |
| `UI_LAYOUT_ADMIN_EMAILS` | Comma-separated, lowercase or mixed-case verified email allowlist |

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

## Operator workflow

1. Open `/admin/layout` and reorder tabs or sections by dragging or using the arrow buttons.
2. Add a change summary and save. This creates a new immutable child revision; concurrent stale edits are rejected.
3. Use **Draft preview** to set an eight-hour, HTTP-only admin cookie and inspect the revision on the public workspace. The banner provides an exit action.
4. Request **Stage candidate** in preview. The protected workflow disables the candidate flag, writes only `workspaceLayoutCandidate`, reads the resulting Edge Config digest, and records the outcome.
5. Enable a small candidate rollout in Vercel Flags and observe the preview deployment. The `crm_layout_visitor` HTTP-only cookie keeps evaluation consistent for a browser.
6. Request **Promote stable** after review. The publisher disables the candidate flag first, then writes the same envelope to stable and candidate so there is no stale candidate waiting behind the flag.
7. Repeat the protected production request and approval only after preview verification passes.

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
