import { pageMetadata } from "@/lib/seo";
import { seoStates, datasetPath } from "@/lib/seo-geography";
import { loadSeoAvailability, indexableStateCodes } from "@/lib/seo-data";
import { catalogJsonLd, datasetName } from "@/lib/seo-structured-data";
import { Landing, LinkDirectory } from "@/app/seo/landing";
const title = "Election result datasets";
const description = "Browse source-linked 2024 presidential election datasets with JSON downloads, reporting-grain labels, normalization details, and documented limitations.";
export const metadata = pageMetadata({ title, description, path: "/datasets" });
export const dynamic = "force-dynamic";
export default async function DatasetsPage() {
  const available = indexableStateCodes(await loadSeoAvailability());
  const states = seoStates.filter((state) => available.has(state.code));
  return <Landing title={title} description={description} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Datasets", path: "/datasets" }]} structuredData={catalogJsonLd(states)}>
    <p>These are normalized compilations, not newly certified totals. Follow the source links for the underlying records and their reuse terms. No uniform dataset license is asserted.</p>
    <LinkDirectory items={states.map((state) => ({ name: datasetName(state), path: datasetPath(state) }))} />
    {!states.length ? <p>No result datasets with complete source links are connected in this environment.</p> : null}
    <p><a href="/developers">API documentation</a> · <a href="/releases">Versioned releases and bulk downloads</a></p>
  </Landing>;
}
