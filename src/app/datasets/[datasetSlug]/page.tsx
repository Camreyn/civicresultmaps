import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { stateByDatasetSlug, datasetPath, stateElectionPath } from "@/lib/seo-geography";
import { loadSeoResults, resultsAreIndexable, resultSources } from "@/lib/seo-data";
import { datasetJsonLd, datasetName, datasetDescription, resultDistributions } from "@/lib/seo-structured-data";
import { Landing, SourceNotes } from "@/app/seo/landing";
type Props = { params: Promise<{ datasetSlug: string }> };
export const dynamic = "force-dynamic";
async function data({ params }: Props) {
  const state = stateByDatasetSlug((await params).datasetSlug); if (!state) notFound();
  const rows = await loadSeoResults(state.code); if (!rows.length) notFound();
  return { state, rows };
}
export async function generateMetadata(props: Props) {
  const { state, rows } = await data(props);
  return pageMetadata({ title: datasetName(state), description: datasetDescription(state), path: datasetPath(state), index: resultsAreIndexable(rows) });
}
export default async function DatasetPage(props: Props) {
  const { state, rows } = await data(props);
  const levels = [...new Set(rows.map((row) => row.level))];
  return <Landing title={datasetName(state)} description={datasetDescription(state)}
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "Datasets", path: "/datasets" }, { name: state.name + " 2024 President", path: datasetPath(state) }]}
    structuredData={datasetJsonLd(state, levels, resultSources(rows).map((source) => source.sourceUrl ?? ""))}>
    <h2>Scope and reuse</h2>
    <p>Election year: 2024. Office: President. Area: {state.name}, United States. Available reporting grains: {levels.join(", ")}. The compilation uses the project's existing normalized result rows; it excludes advisory review, turnout, equipment, and historical rows.</p>
    <p>Rows in different grains may overlap. Do not sum counties, statewide totals, and other reporting units together. No uniform license is recorded for this compilation; consult each source's terms before reuse. Retrieval time is not a source update date.</p>
    <h2>Downloads and API access</h2>
    <ul>{resultDistributions(state, levels).map((distribution) => <li key={distribution.contentUrl}><a href={distribution.contentUrl}>{distribution.name} (JSON)</a></li>)}</ul>
    <p>Downloads are live API responses, not immutable snapshots. Preserve each row's <code>sourceId</code>, reporting <code>level</code>, and <code>jurisdictionTag</code>. Missing data is not zero.</p>
    <p><a href={stateElectionPath(state)}>Read the {state.name} results table</a> · <a href="/developers">API documentation</a> · <a href="/releases">Versioned bulk releases</a></p>
    <SourceNotes rows={rows} />
  </Landing>;
}
