import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { stateBySlug, stateElectionPath, datasetPath, countyByTag, countyElectionPath } from "@/lib/seo-geography";
import { loadSeoResults, resultsAreIndexable, availableCountyTags } from "@/lib/seo-data";
import { Landing, LinkDirectory, ResultTable, SourceNotes } from "@/app/seo/landing";
type Props = { params: Promise<{ stateSlug: string }> };
export const dynamic = "force-dynamic";
async function data(props: Props) {
  const state = stateBySlug((await props.params).stateSlug); if (!state) notFound();
  const rows = await loadSeoResults(state.code); if (!rows.length) notFound();
  return { state, rows };
}
export async function generateMetadata(props: Props) {
  const { state, rows } = await data(props);
  return pageMetadata({ title: `${state.name} 2024 Presidential Election Results`, description: `Read ${state.name} 2024 presidential candidate vote records by reporting area, with source links, county pages, and dataset downloads.`, path: stateElectionPath(state), index: resultsAreIndexable(rows) });
}
export default async function StateElectionPage(props: Props) {
  const { state, rows } = await data(props);
  return <Landing title={`${state.name} 2024 Presidential Election Results`} description={`Source-linked presidential candidate votes for ${state.name}. These are existing normalized records, not a new canvass or a recalculation of election outcomes.`}
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "States", path: "/states" }, { name: state.name, path: `/states/${state.slug}` }, { name: "2024 President", path: stateElectionPath(state) }]}>
    <p><a href={`/?state=${state.code}&year=2024&tab=map`}>Open the {state.name} interactive map</a> · <a href={datasetPath(state)}>Download and document this dataset</a></p>
    <h2>Reporting areas</h2>
    <p>Only explicitly tagged county-grain records receive county result links. Towns, statewide totals, and non-geographic rows remain separately labeled. Missing and unmatched areas are not zeroes.</p>
    <LinkDirectory items={availableCountyTags(rows).map((tag) => { const county = countyByTag(tag)!; return { name: county.displayName, path: countyElectionPath(county) }; })} />
    <ResultTable rows={rows} /><SourceNotes rows={rows} />
  </Landing>;
}
