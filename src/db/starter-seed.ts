import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "./url";

const states = [
  {
    code: "WI",
    name: "Wisconsin",
    authority: "Wisconsin Elections Commission",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: true,
      notes: "Legacy static project has full Wisconsin coverage and should be migrated first.",
    },
  },
  {
    code: "MN",
    name: "Minnesota",
    authority: "Minnesota Secretary of State",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: true,
      notes: "Useful second acceptance state because the source shape differs from Wisconsin.",
    },
  },
  {
    code: "WA",
    name: "Washington",
    authority: "Washington Secretary of State",
    countyLabel: "County",
    capabilities: {
      sourcePlanner: true,
      certifiedResults: true,
      map: true,
      reviewGraphs: true,
      turnout: true,
      historicalBaseline: false,
      notes: "Useful acceptance state for HTML and all-state precinct CSV import paths.",
    },
  },
];

const sources = [
  {
    slug: "wi-2024-county-president",
    state: "WI",
    category: "Certified presidential county results",
    title: "Wisconsin certified county result report",
    sourceUrl:
      "https://elections.wi.gov/sites/default/files/documents/County%20by%20County%20Report_POTUS.pdf",
    authority: "Wisconsin Elections Commission",
    localArtifact: "data/County by County Report_POTUS.pdf",
    parser: "legacyStaticRegistry",
    timestampBasis: "HTTP Last-Modified metadata captured in the legacy static project.",
    confidence: "Official WEC certified county result report.",
  },
  {
    slug: "mn-2024-precinct-results",
    state: "MN",
    category: "Official precinct results",
    title: "Minnesota official federal/state precinct workbook",
    sourceUrl:
      "https://www.sos.mn.gov/media/yt3llxwd/2024-general-federal-state-results-by-precinct-official.xlsx",
    authority: "Minnesota Secretary of State",
    localArtifact: "data/mn-app-data.js",
    parser: "xlsxPrecinctComparison",
    timestampBasis: "HTTP Last-Modified timestamp captured by the legacy import pipeline.",
    confidence: "Official Minnesota Secretary of State workbook.",
  },
  {
    slug: "wa-2024-president-county-results",
    state: "WA",
    category: "Certified presidential county results",
    title: "Washington certified President/Vice President county page",
    sourceUrl: "https://results.vote.wa.gov/results/20241105/president-vice-president_bycounty.html",
    authority: "Washington Secretary of State",
    localArtifact: "data/wa-2024-president-county-results.html",
    parser: "washingtonCountyHtml",
    timestampBasis: "Official page shows last updated date in the legacy source inventory.",
    confidence: "Official Washington Secretary of State county results page.",
  },
];

const results = [
  {
    state: "WI",
    sourceSlug: "wi-2024-county-president",
    jurisdictionCode: "WI-DANE",
    jurisdictionName: "Dane",
    votes: { Harris: ["DEM", 268412], Trump: ["REP", 125283], Other: ["OTHER", 7972] },
  },
  {
    state: "WI",
    sourceSlug: "wi-2024-county-president",
    jurisdictionCode: "WI-WAUKESHA",
    jurisdictionName: "Waukesha",
    votes: { Harris: ["DEM", 111251], Trump: ["REP", 221059], Other: ["OTHER", 6621] },
  },
  {
    state: "MN",
    sourceSlug: "mn-2024-precinct-results",
    jurisdictionCode: "MN-HENNEPIN",
    jurisdictionName: "Hennepin",
    votes: { Harris: ["DEM", 474091], Trump: ["REP", 243133], Other: ["OTHER", 18150] },
  },
  {
    state: "WA",
    sourceSlug: "wa-2024-president-county-results",
    jurisdictionCode: "WA-KING",
    jurisdictionName: "King",
    votes: { Harris: ["DEM", 907310], Trump: ["REP", 329805], Other: ["OTHER", 32240] },
  },
] as const;

export async function seedStarterData() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to seed starter data.");
  }

  const sql = neon(databaseUrl);

  await sql`begin`;

  try {
    const [election] = await sql`
      insert into elections (year, office, election_date, label)
      values (2024, 'president', '2024-11-05', '2024 President')
      on conflict (year, office) do update set label = excluded.label
      returning id
    `;

    for (const state of states) {
      await sql`
        insert into states (code, name, authority, county_label)
        values (${state.code}, ${state.name}, ${state.authority}, ${state.countyLabel})
        on conflict (code) do update set
          name = excluded.name,
          authority = excluded.authority,
          county_label = excluded.county_label
      `;

      await sql`
        insert into capability_flags (
          state_code,
          election_year,
          certified_results,
          map,
          review_graphs,
          turnout,
          historical_baseline,
          source_planner,
          notes
        )
        values (
          ${state.code},
          2024,
          ${state.capabilities.certifiedResults},
          ${state.capabilities.map},
          ${state.capabilities.reviewGraphs},
          ${state.capabilities.turnout},
          ${state.capabilities.historicalBaseline},
          ${state.capabilities.sourcePlanner},
          ${state.capabilities.notes}
        )
        on conflict (state_code, election_year) do update set
          certified_results = excluded.certified_results,
          map = excluded.map,
          review_graphs = excluded.review_graphs,
          turnout = excluded.turnout,
          historical_baseline = excluded.historical_baseline,
          source_planner = excluded.source_planner,
          notes = excluded.notes
      `;

      const [contest] = await sql`
        insert into contests (election_id, state_code, office, title)
        values (${election.id}, ${state.code}, 'president', ${`${state.name} President`})
        on conflict (election_id, state_code, office) do update set title = excluded.title
        returning id
      `;

      for (const [index, [name, party]] of [
        ["Harris", "DEM"],
        ["Trump", "REP"],
        ["Other", "OTHER"],
      ].entries()) {
        await sql`
          insert into candidates (contest_id, name, party, ballot_order)
          values (${contest.id}, ${name}, ${party}, ${index})
          on conflict (contest_id, name, party) do update set ballot_order = excluded.ballot_order
        `;
      }
    }

    for (const source of sources) {
      await sql`
        insert into source_documents (
          slug,
          state_code,
          election_year,
          category,
          title,
          source_url,
          authority,
          local_artifact,
          parser,
          timestamp_basis,
          confidence,
          status
        )
        values (
          ${source.slug},
          ${source.state},
          2024,
          ${source.category},
          ${source.title},
          ${source.sourceUrl},
          ${source.authority},
          ${source.localArtifact},
          ${source.parser},
          ${source.timestampBasis},
          ${source.confidence},
          'loaded'
        )
        on conflict (slug) do update set
          category = excluded.category,
          title = excluded.title,
          source_url = excluded.source_url,
          authority = excluded.authority,
          local_artifact = excluded.local_artifact,
          parser = excluded.parser,
          timestamp_basis = excluded.timestamp_basis,
          confidence = excluded.confidence,
          status = excluded.status
      `;
    }

    for (const row of results) {
      const [contest] = await sql`
        select c.id
        from contests c
        inner join elections e on e.id = c.election_id
        where c.state_code = ${row.state} and e.year = 2024 and e.office = 'president'
        limit 1
      `;
      const [source] = await sql`
        select id from source_documents where slug = ${row.sourceSlug} limit 1
      `;

      for (const [candidateName, [party, votes]] of Object.entries(row.votes)) {
        await sql`
          insert into result_rows (
            contest_id,
            state_code,
            jurisdiction_code,
            jurisdiction_name,
            level,
            candidate_name,
            party,
            votes,
            source_document_id
          )
          values (
            ${contest.id},
            ${row.state},
            ${row.jurisdictionCode},
            ${row.jurisdictionName},
            'county',
            ${candidateName},
            ${party},
            ${votes},
            ${source.id}
          )
          on conflict (contest_id, level, jurisdiction_code, candidate_name, party)
          do update set
            votes = excluded.votes,
            source_document_id = excluded.source_document_id
        `;
      }
    }

    await sql`commit`;
  } catch (error) {
    await sql`rollback`;
    throw error;
  }
}
