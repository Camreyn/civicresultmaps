import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { seoCounties, stateBySlug } from "@/lib/seo-geography";
import { Landing, LinkDirectory } from "@/app/seo/landing";
type Props = { params: Promise<{ stateSlug: string }> };
export async function generateMetadata({ params }: Props) {
  const state = stateBySlug((await params).stateSlug); if (!state) notFound();
  return pageMetadata({ title: `${state.name} counties and county equivalents`, description: `Browse canonical county geography and election-data links for ${state.name}. Geography availability does not imply result coverage.`, path: `/counties/${state.slug}` });
}
export default async function StateCountiesPage({ params }: Props) {
  const state = stateBySlug((await params).stateSlug); if (!state) notFound();
  return <Landing title={`${state.name} counties and county equivalents`} description="These are current canonical geography records. Historical boundaries and election reporting units can differ; consult each area's caveats."
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "Counties", path: "/counties" }, { name: state.name, path: `/counties/${state.slug}` }]}>
    <LinkDirectory items={seoCounties.filter((county) => county.state === state.code).map((county) => ({ name: county.displayName, path: county.path, detail: `FIPS ${county.fips}` }))} />
  </Landing>;
}
