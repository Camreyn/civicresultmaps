import { pageMetadata } from "@/lib/seo";
import { seoStates, stateElectionPath } from "@/lib/seo-geography";
import { loadSeoAvailability, indexableStateCodes } from "@/lib/seo-data";
import { Landing, LinkDirectory } from "@/app/seo/landing";
const title = "2024 U.S. presidential election results";
const description = "Explore normalized 2024 presidential election results by state, with candidate vote records, source provenance, county links, and downloadable datasets.";
export const metadata = pageMetadata({ title, description, path: "/elections/2024/president" });
export const dynamic = "force-dynamic";
export default async function ElectionPage() {
  const available = indexableStateCodes(await loadSeoAvailability());
  return <Landing title={title} description={description} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Elections", path: "/elections" }, { name: "2024 President", path: "/elections/2024/president" }]}>
    <p>The links below represent states whose normalized rows have loaded source records and usable source links. This does not imply certification, complete precinct coverage, or agreement between state and local reporting grains.</p>
    <LinkDirectory items={seoStates.filter((state) => available.has(state.code)).map((state) => ({ name: `${state.name} 2024 presidential results`, path: stateElectionPath(state) }))} />
    {!available.size ? <p>No results with complete source links are connected in this environment. <a href="/states">Browse the state directory</a>.</p> : null}
    <p><a href="/datasets">Browse result datasets</a> or <a href="/readiness">inspect coverage and source limitations</a>.</p>
  </Landing>;
}
