import { notFound } from "next/navigation";
import { pageMetadata, publicSourceUrl } from "@/lib/seo";
import { stateBySlug, countyBySlug, countyElectionPath, stateElectionPath } from "@/lib/seo-geography";
import { loadSeoResults, countyResultRows } from "@/lib/seo-data";
import { Landing, LinkDirectory } from "@/app/seo/landing";
type Props = { params: Promise<{ stateSlug: string; countySlug: string }> };
export const dynamic = "force-dynamic";
async function geography({ params }: Props) {
  const { stateSlug, countySlug } = await params;
  const state = stateBySlug(stateSlug); const county = state && countyBySlug(state.code, countySlug);
  if (!state || !county) notFound(); return { state, county };
}
export async function generateMetadata(props: Props) {
  const { state, county } = await geography(props);
  return pageMetadata({ title: `${county.displayName}, ${state.code} election data and geography`, description: `Find ${county.displayName}, ${state.name} election-data links, canonical FIPS ${county.fips}, source context, and geography caveats.`, path: county.path });
}
export default async function CountyLandingPage(props: Props) {
  const { state, county } = await geography(props);
  const rows = await loadSeoResults(state.code);
  const available = countyResultRows(rows, county.jurisdictionTag).length > 0;
  const source = publicSourceUrl(county.source);
  return <Landing title={`${county.displayName}, ${state.code} election data`} description={`A geography guide to ${county.displayName}, ${state.name}, and the available source-linked election records.`}
    breadcrumbs={[{ name: "Home", path: "/" }, { name: "Counties", path: "/counties" }, { name: state.name, path: `/counties/${state.slug}` }, { name: county.displayName, path: county.path }]}>
    <h2>Geography and coverage</h2>
    <p>Canonical FIPS: <code>{county.fips}</code>. Registry tag: <code>{county.jurisdictionTag}</code>. Administrative level: {county.level.replaceAll("_", " ")}.</p>
    <p>{county.caveat || "Election reporting units and historical geography may differ from current Census county boundaries."}</p>
    <p>{source ? <a href={source}>Geography source</a> : county.source} · <a href={`/api/jurisdictions?state=${state.code}&fips=${county.fips}`}>Canonical registry record (JSON)</a></p>
    {!available ? <p>No explicitly tagged county-grain 2024 presidential results are currently available for this geography. Do not infer totals from town, district, or statewide rows.</p> : null}
    <LinkDirectory items={[
      ...(available ? [{ name: "2024 presidential election results", path: countyElectionPath(county) }] : []),
      { name: "Detailed multi-year county profile", path: `/county/${county.fips}` },
      { name: `${state.name} county directory`, path: `/counties/${state.slug}` },
      ...(rows.length ? [{ name: `${state.name} 2024 presidential results`, path: stateElectionPath(state) }] : []),
    ]} />
  </Landing>;
}
