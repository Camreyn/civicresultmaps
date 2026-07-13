export const publicDataRevisionScope = "public";

export const bumpPublicDataRevisionSql = [
  "insert into public_data_revisions (scope, revision, updated_at, reason)",
  "values ($1, 1, now(), $2)",
  "on conflict (scope) do update set",
  "revision = public_data_revisions.revision + 1,",
  "updated_at = now(),",
  "reason = excluded.reason",
  "returning revision::text as revision, updated_at",
].join("\n");

export async function bumpPublicDataRevision(sql, reason) {
  const [row] = await sql.query(bumpPublicDataRevisionSql, [publicDataRevisionScope, reason]);
  return {
    revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}