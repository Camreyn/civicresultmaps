import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { stateBySlug, countyBySlug, countyElectionPath, stateElectionPath, datasetPath } from "@/lib/seo-geography";
import { loadSeoResults, countyResultRows, resultsAreIndexable } from "@/lib/seo-data";
import { Landing, ResultTable, SourceNotes } from "@/app/seo/landing";
type Props = { params: Promise<{ stateSlug: string; countySlug: string }> };
export const dynamic = "force-dynamic";
async function data({ params }: Props) {
  const { stateSlug, countySlug } = await params;
  const state = stateBySlug(stateSlug); const county = state && countyBySlug(state.code, countySlug);
  if (!state || !county) notFound();
  const rows = countyResultRows(await loadSeoResults(state.code), county.jurisdictionTag);
  if (!rows.length) notFound(); return { state, county, rows };
}
export async function generateMetadata(props: Props) {
  const { state, county, rows } = await data(props);
  return pageMetadata({ title: `${county.displayName}, ${state.code} 2024 Presidential Election Results`, description: `Read 2024 presidential candidate votes for ${county.displayName}, ${state.name}, with source records and geography caveats.`, path: countyElectionPath(county), index: resultsAreIndexable(rows) });
}
export default async function CountyElectionPage(props: Props) {
  const { state, county, rows } = await data(props);
  return <Landing title={`${county.displayName}, ${state.code} 2024 Presidential Election Results`} description={`Normalized county-grain presidential vote records for ${county.displayName}. Candidate and source labels are retained from the published data.`}
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "Counties", path: "/counties" }, { name: state.name, path: `/counties/${state.slug}` }, { name: county.displayName, path: county.path }, { name: "2024 President", path: countyElectionPath(county) }]}>
    <p>{county.caveat}</p>
    <p><a href={stateElectionPath(state)}>All {state.name} 2024 presidential results</a> · <a href={datasetPath(state)}>State result dataset</a> · <a href={`/county/${county.fips}`}>Detailed multi-year profile</a></p>
    <ResultTable rows={rows} /><SourceNotes rows={rows} />
  </Landing>;
}
