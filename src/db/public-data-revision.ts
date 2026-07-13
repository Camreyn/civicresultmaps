export const publicDataRevisionScope = "public";

export type PublicDataRevisionSql = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<unknown[]>;

export async function readPublicDataRevision(sql: PublicDataRevisionSql) {
  const [row] = await sql`
    select revision::text as revision
    from public_data_revisions
    where scope = ${publicDataRevisionScope}
  ` as Array<{ revision: string }>;

  return row ? `public:${row.revision}` : null;
}

export async function bumpPublicDataRevision(
  sql: PublicDataRevisionSql,
  reason: string,
) {
  const [row] = await sql`
    insert into public_data_revisions (scope, revision, updated_at, reason)
    values (${publicDataRevisionScope}, 1, now(), ${reason})
    on conflict (scope) do update set
      revision = public_data_revisions.revision + 1,
      updated_at = now(),
      reason = excluded.reason
    returning revision::text as revision, updated_at
  ` as Array<{ revision: string; updated_at: Date | string }>;

  return {
    revision: row.revision,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}