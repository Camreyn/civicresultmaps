import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { stateBySlug, stateElectionPath, datasetPath } from "@/lib/seo-geography";
import { loadSeoAvailability } from "@/lib/seo-data";
import { Landing, LinkDirectory } from "@/app/seo/landing";

type Props = { params: Promise<{ stateSlug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props) {
  const state = stateBySlug((await params).stateSlug); if (!state) notFound();
  return pageMetadata({ title: `${state.name} election data`, description: `Explore ${state.name} election result sources, county geography, and available 2024 presidential datasets.`, path: `/states/${state.slug}` });
}
export default async function StatePage({ params }: Props) {
  const state = stateBySlug((await params).stateSlug); if (!state) notFound();
  const available = (await loadSeoAvailability(state.code)).some((row) => row.state === state.code);
  return <Landing title={`${state.name} election data`} description={`Browse source-linked election records and geography for ${state.name}. Coverage differs by election and reporting grain.`}
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "States", path: "/states" }, { name: state.name, path: `/states/${state.slug}` }]}>
    <LinkDirectory items={[
      { name: `${state.name} counties and county equivalents`, path: `/counties/${state.slug}` },
      ...(available ? [{ name: "2024 presidential election results", path: stateElectionPath(state) }, { name: "2024 presidential results dataset", path: datasetPath(state) }] : []),
      { name: `${state.name} interactive explorer`, path: `/?state=${state.code}&year=2024` },
      { name: "2024 source inventory (JSON)", path: `/api/sources?state=${state.code}&year=2024` },
    ]} />
    {!available ? <p>No normalized 2024 presidential results are available from this environment. The geography directory is independent of result coverage.</p> : null}
    <p>See the <a href="/readiness">data readiness dashboard</a> for recorded source and coverage gaps.</p>
  </Landing>;
}
