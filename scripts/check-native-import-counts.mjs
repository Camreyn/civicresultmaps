import { neon } from "@neondatabase/serverless";

const stateCode = (process.argv[2] ?? "OH").toUpperCase();
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const sql = neon(databaseUrl);

const [resultRows, reviewRows, turnoutRows, importRuns] = await Promise.all([
  sql`select count(*)::int as count from result_rows where state_code = ${stateCode}`,
  sql`select count(*)::int as count from review_rows where state_code = ${stateCode}`,
  sql`select count(*)::int as count from turnout_rows where state_code = ${stateCode}`,
  sql`
    select status, summary
    from import_runs
    where state_code = ${stateCode}
    order by started_at desc
    limit 3
  `,
]);

console.log(
  JSON.stringify(
    {
      stateCode,
      resultRows: resultRows[0].count,
      reviewRows: reviewRows[0].count,
      turnoutRows: turnoutRows[0].count,
      importRuns,
    },
    null,
    2,
  ),
);
