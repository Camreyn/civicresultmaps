import { ArrowRight } from "lucide-react";
import type { WorkspaceTabId } from "@/lib/workspace-layout";
import { workspaceNavigationHref, type WorkspaceMapMode } from "@/lib/workspace-navigation";

type GuidedDestination = {
  label: string;
  summary: string;
  tab: WorkspaceTabId;
};

const guidedDestinations: Partial<Record<WorkspaceTabId, GuidedDestination[]>> = {
  map: [
    { label: "Interpret advisory findings", summary: "Review readiness, flags, and caveats.", tab: "review" },
    { label: "Verify the sources", summary: "Search the official source catalog.", tab: "data" },
    { label: "Read the review guide", summary: "Understand what the evidence can and cannot show.", tab: "methodology" },
  ],
  review: [
    { label: "Return to the map", summary: "Put the selected state's patterns back in geographic context.", tab: "map" },
    { label: "Inspect source records", summary: "Check authorities, artifacts, parsers, and missing links.", tab: "data" },
    { label: "Read the methodology", summary: "See how each advisory signal is calculated.", tab: "methodology" },
  ],
  history: [
    { label: "Compare on the map", summary: "View the selected election year geographically.", tab: "map" },
    { label: "Check historical sources", summary: "Inspect the provenance behind the comparison rows.", tab: "data" },
  ],
  electronic: [
    { label: "Check source records", summary: "Review the evidence inventory and official links.", tab: "data" },
    { label: "Review responsibly", summary: "Read the evidence and interpretation guardrails.", tab: "methodology" },
  ],
  planner: [
    { label: "Inspect loaded sources", summary: "Compare planned work with the current source catalog.", tab: "data" },
    { label: "Export a review packet", summary: "Download the state data and provenance bundle.", tab: "exports" },
  ],
  data: [
    { label: "View the results map", summary: "Return to the state's geographic result explorer.", tab: "map" },
    { label: "Open the Review Center", summary: "Use these sources to evaluate advisory findings.", tab: "review" },
    { label: "Download the data", summary: "Export normalized rows and source manifests.", tab: "exports" },
  ],
  methodology: [
    { label: "Apply the guide", summary: "Use the Review Center with the guardrails in mind.", tab: "review" },
    { label: "Verify source context", summary: "Inspect the official source catalog.", tab: "data" },
  ],
  exports: [
    { label: "Inspect source records", summary: "Review provenance before using an export.", tab: "data" },
    { label: "Review advisory rows", summary: "Open the tools that explain the exported indicators.", tab: "review" },
  ],
};

export function WorkspaceGuidedLinks({ activeTab, fips, mode, state, visibleTabs, year }: {
  activeTab: WorkspaceTabId;
  fips?: string;
  mode?: WorkspaceMapMode;
  state: string;
  visibleTabs: WorkspaceTabId[];
  year: 2016 | 2020 | 2024;
}) {
  const visible = new Set(visibleTabs);
  const destinations = guidedDestinations[activeTab]?.filter((destination) => visible.has(destination.tab));
  if (!destinations?.length) return null;
  return (
    <nav aria-label="Continue exploring" className="workspace-guided-links">
      <span>Continue with this state</span>
      <div>
        {destinations.map((destination) => (
          <a
            href={workspaceNavigationHref({ fips, mode, state, tab: destination.tab, year })}
            key={destination.tab}
          >
            <span><strong>{destination.label}</strong><small>{destination.summary}</small></span>
            <ArrowRight aria-hidden size={15} />
          </a>
        ))}
      </div>
    </nav>
  );
}
