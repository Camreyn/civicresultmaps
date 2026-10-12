import { NextResponse } from "next/server";
import { z } from "zod";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { getReadSql, hasReadableDatabase } from "@/db/read-sql";
import { readPublicDataRevision } from "@/db/public-data-revision";
import { evaluateResultLineage, retainedRevisionForLineage, type CandidateLineageRow } from "@/lib/result-lineage";
import { readPublishedConnections } from "@/lib/connection-research-repository";
import { reviewedResultSource } from "@/lib/reviewed-result-source";

const querySchema = z.object({ state: z.literal("TX"), year: z.literal("2024"), office: z.literal("president"), level: z.literal("county"), jurisdictionCode: z.string().min(1).max(100) });
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({ state: params.get("state")?.toUpperCase(), year: params.get("year"), office: params.get("office")?.toLowerCase(), level: params.get("level"), jurisdictionCode: params.get("jurisdictionCode") });
  if (!query.success) return NextResponse.json(apiErrorEnvelope({ code: "UNSUPPORTED_LINEAGE_SELECTION", message: "The initial lineage pilot supports Texas 2024 county presidential results." }), { status: 400, headers: publicApiErrorHeaders });
  if (process.env.RESULT_LINEAGE_ENABLED !== "1") return NextResponse.json(apiErrorEnvelope({ code: "LINEAGE_DISABLED", message: "Result lineage is not activated." }), { status: 503, headers: publicApiErrorHeaders });
  try {
    if (!hasReadableDatabase()) throw new Error("Database unavailable");
    const sql = getReadSql();
    const before = await readPublicDataRevision(sql);
    if (params.get("dataRevision") && params.get("dataRevision") !== before) return NextResponse.json(apiErrorEnvelope({ code: "DATA_REVISION_MISMATCH", message: "Results changed; reload before inspecting lineage." }, { dataRevision: before }), { status: 409, headers: publicApiErrorHeaders });
    const tag = /^48\d{3}$/.test(query.data.jurisdictionCode) ? `county:${query.data.jurisdictionCode}` : query.data.jurisdictionCode;
    const rows = await sql`
      select result.candidate_name as candidate, result.votes, source.slug as "sourceId",
        source.source_url as "sourceUrl", source.authority, source.metadata as "sourceMetadata",
        result.import_run_id as "importRunId", run.status as "importStatus", run.summary as "importSummary",
        result.source_locator as locator, result.jurisdiction_tag as "jurisdictionTag"
      from result_rows result
      join contests contest on contest.id = result.contest_id
      join elections election on election.id = contest.election_id
      join source_documents source on source.id = result.source_document_id
      left join import_runs run on run.id = result.import_run_id
      where result.state_code = 'TX' and election.year = 2024 and lower(election.office) = 'president'
        and source.source_url = 'https://results.texas-election.com/static/data/election/49664/1012/County.json'
        and source.slug in ('tx-2024-official-county-results', 'tx-2024-tx-2024-official-county-results')
        and result.level = 'county'
        and (result.jurisdiction_code = ${query.data.jurisdictionCode} or result.jurisdiction_tag = ${tag})
      order by result.candidate_name
    ` as CandidateLineageRow[];
    const after = await readPublicDataRevision(sql);
    if (!before || before !== after) return NextResponse.json(apiErrorEnvelope({ code: "LINEAGE_REVISION_UNSTABLE", message: "A stable public-data revision is required." }), { status: 409, headers: publicApiErrorHeaders });
    if (!rows.length) return NextResponse.json(apiErrorEnvelope("No matching county result rows"), { status: 404, headers: publicApiErrorHeaders });
    if (new Set(rows.map((row) => row.candidate)).size !== rows.length) throw new Error("Ambiguous county rows");
    let digests: string[] = [];
    let rawSource: unknown;
    try {
      const revisions = (await readPublishedConnections())?.revisions ?? [];
      const revision = retainedRevisionForLineage(rows, revisions);
      if (revision) { rawSource = await reviewedResultSource(revision); digests = [revision.sha256]; }
    } catch { /* Missing research release/storage remains unreviewed, not verified. */ }
    return NextResponse.json(apiEnvelope({ selection: query.data, candidates: evaluateResultLineage(rows, digests, rawSource), displayVerification: "not_checked", caveat: "County presidential source only. VTD review/turnout and contextual historical rows are separate source families." }, { schemaVersion: "result-lineage/1", dataRevision: after }), { headers: publicDataCacheHeaders });
  } catch {
    return NextResponse.json(apiErrorEnvelope({ code: "LINEAGE_UNAVAILABLE", message: "Result lineage unavailable; no seed or inferred chain is substituted." }), { status: 503, headers: publicApiErrorHeaders });
  }
}
