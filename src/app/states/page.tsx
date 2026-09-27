import { pageMetadata } from "@/lib/seo";
import { seoStates } from "@/lib/seo-geography";
import { Landing, LinkDirectory } from "@/app/seo/landing";

const title = "Election data by state";
const description = "Browse state election data, county and county-equivalent directories, normalized presidential results, and source documentation for the 50 states and District of Columbia.";
export const metadata = pageMetadata({ title, description, path: "/states" });
export default function StatesPage() {
  return <Landing title={title} description={description} breadcrumbs={[{ name: "Home", path: "/" }, { name: "States", path: "/states" }]}>
    <LinkDirectory items={seoStates.map((state) => ({ name: state.name, path: `/states/${state.slug}` }))} />
  </Landing>;
}
