import { pageMetadata } from "@/lib/seo";
import { seoStates } from "@/lib/seo-geography";
import { Landing, LinkDirectory } from "@/app/seo/landing";
const title = "Counties and county equivalents";
const description = "Browse U.S. county and county-equivalent geography by state, using the existing canonical Census FIPS registry. Result availability is recorded separately from geography.";
export const metadata = pageMetadata({ title, description, path: "/counties" });
export default function CountiesPage() {
  return <Landing title={title} description={description} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Counties", path: "/counties" }]}>
    <LinkDirectory items={seoStates.map((state) => ({ name: state.name, path: `/counties/${state.slug}` }))} />
  </Landing>;
}
