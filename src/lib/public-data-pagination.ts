/** Opt-in, uncached pagination. A revision fence detects changes between pages;
 * it is not a database snapshot and relies on writers bumping public_data_revisions. */
export type PublicPageInput = { limit: number; offset: number; revision?: string };
export class PublicPageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

export function parsePublicPage(params: URLSearchParams): PublicPageInput {
  const integer = (key: string, fallback: number, maximum: number) => {
    const text = params.get(key) ?? String(fallback);
    if (!/^\d+$/.test(text)) throw new PublicPageError(`invalid_${key}`, 400);
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value > maximum || (key === "limit" && value < 1)) throw new PublicPageError(`invalid_${key}`, 400);
    return value;
  };
  const revision = params.get("revision") ?? undefined;
  if (revision !== undefined && !/^public:[1-9]\d{0,19}$/.test(revision)) throw new PublicPageError("invalid_revision", 400);
  const offset = integer("offset", 0, 200_000);
  if (offset > 0 && !revision) throw new PublicPageError("revision_required", 400);
  return { limit: integer("limit", 1000, 4000), offset, revision };
}

export async function readStablePublicPage<T>(input: PublicPageInput, deps: {
  revision: () => Promise<string | null>;
  rows: (request: { limit: number; offset: number; strict: true }) => Promise<T[]>;
}) {
  const before = await deps.revision();
  if (!before || !/^public:[1-9]\d{0,19}$/.test(before)) throw new PublicPageError("database_revision_unavailable", 503);
  if (input.revision && before !== input.revision) throw new PublicPageError("data_revision_changed", 409);
  const rows = await deps.rows({ limit: input.limit + 1, offset: input.offset, strict: true });
  const after = await deps.revision();
  if (after !== before) throw new PublicPageError("data_revision_changed", 409);
  const hasMore = rows.length > input.limit;
  const data = rows.slice(0, input.limit);
  return { data, meta: {
    source: "database", paginationVersion: 1, dataRevision: before,
    offset: input.offset, limit: input.limit, hasMore,
    nextOffset: hasMore ? input.offset + data.length : null,
    ...(!hasMore && (input.offset === 0 || data.length > 0) ? { total: input.offset + data.length } : {}),
  } };
}
