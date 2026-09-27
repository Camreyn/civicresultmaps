import { pageMetadata } from "@/lib/seo";
import { Landing, LinkDirectory } from "@/app/seo/landing";
const title = "U.S. election data";
const description = "Browse source-linked election result collections by election, state, and reporting geography. Historical comparisons remain available in the interactive explorer.";
export const metadata = pageMetadata({ title, description, path: "/elections" });
export default function ElectionsPage() {
  return <Landing title={title} description={description} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Elections", path: "/elections" }]}>
    <LinkDirectory items={[{ name: "2024 presidential election results", path: "/elections/2024/president" }, { name: "Historical county comparisons", path: "/compare" }]} />
  </Landing>;
}
