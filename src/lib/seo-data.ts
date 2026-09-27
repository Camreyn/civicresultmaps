import { cache } from "react";
import { getReadSql, hasReadableDatabase } from "@/db/read-sql";
import { publicSourceUrl } from "./seo";
import { countyByTag } from "./seo-geography";

export type SeoCandidateRow = {
  id: string; state: string; level: string; jurisdictionCode: string; jurisdictionName: string;
  jurisdictionTag: string | null; candidate: string; party: string; votes: number;
  sourceId: string | null; sourceTitle: string | null; sourceUrl: string | null;
  authority: string | null; confidence: string | null; timestampBasis: string | null;
  parser: string | null; sourceStatus: string | null;
};

export type SeoAvailability = { state: string; level: string; jurisdictionTag: string | null; sourceLinked: boolean };

// Read only existing normalized public rows. No seed fallback, geography inference,
// election arithmetic, ETL, or database mutation. Errors propagate as a 5xx response:
// never turn a transient database outage into a successful empty sitemap or a 404.
export const loadSeoResults = cache(async (state: string): Promise<SeoCandidateRow[]> => {
  if (!hasReadableDatabase()) return [];
  const sql = getReadSql();
  return await sql`
    select r.id, r.state_code as state, r.level, r.jurisdiction_code as "jurisdictionCode",
      r.jurisdiction_name as "jurisdictionName", r.jurisdiction_tag as "jurisdictionTag",
      r.candidate_name as candidate, r.party, r.votes,
      s.slug as "sourceId", s.title as "sourceTitle", s.source_url as "sourceUrl",
      s.authority, s.confidence, s.timestamp_basis as "timestampBasis", s.parser, s.status as "sourceStatus"
    from result_rows r
    inner join contests c on r.contest_id = c.id
    inner join elections e on c.election_id = e.id
    left join source_documents s on r.source_document_id = s.id
    where r.state_code = ${state} and e.year = 2024 and lower(e.office) = 'president'
      and r.level in ('county', 'state', 'city', 'city_town', 'town', 'federal_precincts', 'non_geographic')
    order by r.level, r.jurisdiction_name, r.candidate_name, r.id
  ` as SeoCandidateRow[];
});

export const loadSeoAvailability = cache(async (state?: string): Promise<SeoAvailability[]> => {
  if (!hasReadableDatabase()) return [];
  const sql = getReadSql();
  const rows = await sql`
    select r.state_code as state, r.level, r.jurisdiction_tag as "jurisdictionTag",
      jsonb_agg(distinct jsonb_build_object('url', s.source_url, 'status', s.status)) as sources
    from result_rows r
    inner join contests c on r.contest_id = c.id
    inner join elections e on c.election_id = e.id
    left join source_documents s on r.source_document_id = s.id
    where e.year = 2024 and lower(e.office) = 'president'
      and (${state ?? null}::text is null or r.state_code = ${state ?? null})
      and r.level in ('county', 'state', 'city', 'city_town', 'town', 'federal_precincts', 'non_geographic')
    group by r.state_code, r.level, r.jurisdiction_tag
  ` as Array<Omit<SeoAvailability, "sourceLinked"> & { sources: Array<{ url: string | null; status: string | null }> }>;
  return rows.map(({ sources, ...row }) => ({ ...row,
    sourceLinked: sources.length > 0 && sources.every((source) => source.status === "loaded" && Boolean(publicSourceUrl(source.url))),
  }));
});

export function resultsAreIndexable(rows: SeoCandidateRow[]) {
  return rows.length > 0 && rows.every((row) => row.sourceStatus === "loaded" && publicSourceUrl(row.sourceUrl));
}

export function indexableStateCodes(rows: SeoAvailability[]) {
  return new Set([...new Set(rows.map((row) => row.state))]
    .filter((state) => rows.filter((row) => row.state === state).every((row) => row.sourceLinked)));
}

export function countyResultRows(rows: SeoCandidateRow[], tag: string) {
  // Tags on towns/subcounty rows are parent context, not county result totals.
  return rows.filter((row) => row.level === "county" && row.jurisdictionTag === tag);
}

export function availableCountyTags(rows: SeoCandidateRow[]) {
  return [...new Set(rows.filter((row) => row.level === "county" && countyByTag(row.jurisdictionTag)?.state === row.state).map((row) => row.jurisdictionTag!))];
}

export function resultSources(rows: SeoCandidateRow[]) {
  return [...new Map(rows.filter((row) => row.sourceId).map((row) => [row.sourceId!, row])).values()];
}
