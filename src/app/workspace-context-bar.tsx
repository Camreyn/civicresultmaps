"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { StateSummary } from "@/lib/types";
import type { WorkspaceTabId } from "@/lib/workspace-layout";
import {
  notifyWorkspaceContextChange,
  workspaceContextChangeEvent,
  workspaceNavigationContextFromSearchParams,
  workspaceNavigationHref,
  workspaceStateHref,
  type WorkspaceContextChangeDetail,
  type WorkspaceMapMode,
  type WorkspaceNavigationContext,
} from "@/lib/workspace-navigation";
import { supportedPresidentialYears, type SupportedPresidentialYear } from "@/lib/api-version";

type GeographyOption = {
  code: string;
  name: string;
};

type WorkspaceContextBarProps = {
  activeTab: WorkspaceTabId;
  countyLabel: string;
  electionYear: SupportedPresidentialYear;
  equipmentAvailable: boolean;
  geographies: GeographyOption[];
  initialFips?: string;
  initialMapMode?: WorkspaceMapMode;
  securityAvailable: boolean;
  selectedStateCode: string;
  selectedStateName: string;
  states: StateSummary[];
  voteMethodAvailable: boolean;
};

const yearOptions: SupportedPresidentialYear[] = [...supportedPresidentialYears].reverse();
const baseMapModeOptions: Array<{ label: string; value: WorkspaceMapMode }> = [
  { label: "Winner", value: "winner" },
  { label: "Margin", value: "margin" },
  { label: "Vote volume", value: "volume" },
];

export function WorkspaceContextBar({
  activeTab,
  countyLabel,
  electionYear,
  equipmentAvailable,
  geographies,
  initialFips,
  initialMapMode,
  securityAvailable,
  selectedStateCode,
  selectedStateName,
  states,
  voteMethodAvailable,
}: WorkspaceContextBarProps) {
  const validInitialFips = initialFips && geographies.some((geography) => geography.code === initialFips)
    ? initialFips
    : undefined;
  const [selectedFips, setSelectedFips] = useState(validInitialFips ?? "");
  const [selectedMapMode, setSelectedMapMode] = useState<WorkspaceMapMode>(initialMapMode ?? "winner");
  const fallbackContext: WorkspaceNavigationContext = {
    fips: validInitialFips,
    mode: initialMapMode,
    state: selectedStateCode,
    tab: activeTab,
    year: electionYear,
  };
  const mapModeOptions: Array<{ disabled: boolean; label: string; value: WorkspaceMapMode }> = [
    ...baseMapModeOptions.map((option) => ({
      ...option,
      disabled: false,
    })),
    {
      disabled: electionYear !== 2024 || !voteMethodAvailable,
      label: "Vote method",
      value: "method",
    },
    {
      disabled: electionYear !== 2024 || !equipmentAvailable,
      label: "Equipment",
      value: "equipment",
    },
    {
      disabled: electionYear !== 2024 || !securityAvailable,
      label: "Security records",
      value: "security",
    },
  ];

  useEffect(() => {
    const syncContext = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceContextChangeDetail>).detail;
      if (detail.fips !== undefined) {
        setSelectedFips(detail.fips ?? "");
      }
      if (detail.mode !== undefined) {
        setSelectedMapMode(detail.mode ?? "winner");
      }
    };

    window.addEventListener(workspaceContextChangeEvent, syncContext);
    return () => window.removeEventListener(workspaceContextChangeEvent, syncContext);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const urlFips = url.searchParams.get("fips");

    if (!urlFips || geographies.some((geography) => geography.code === urlFips)) {
      return;
    }

    url.searchParams.delete("fips");
    window.history.replaceState(null, "", url);
    setSelectedFips("");
    notifyWorkspaceContextChange({ fips: null });
  }, [geographies]);

  const currentContext = () => {
    const context = workspaceNavigationContextFromSearchParams(
      new URL(window.location.href).searchParams,
      fallbackContext,
    );

    return context.fips && !geographies.some((geography) => geography.code === context.fips)
      ? { ...context, fips: undefined }
      : context;
  };
  const navigate = (href: string) => window.location.assign(href);

  return (
    <section aria-label="Election workspace context" className="workspace-context-bar">
      <div className="workspace-context-summary">
        <SlidersHorizontal aria-hidden size={18} />
        <div>
          <span>Current context</span>
          <strong>{selectedStateName} · {electionYear} President</strong>
        </div>
      </div>

      <div className="workspace-context-controls">
        <label className="workspace-context-control is-wide">
          <span>State</span>
          <select
            aria-label="Workspace state"
            onChange={(event) => navigate(workspaceStateHref(currentContext(), event.target.value))}
            value={selectedStateCode}
          >
            {states.map((state) => (
              <option key={state.code} value={state.code}>{state.name}</option>
            ))}
          </select>
        </label>

        <label className="workspace-context-control">
          <span>Election</span>
          <select
            aria-label="Workspace election year"
            onChange={(event) => {
              const year = Number(event.target.value) as SupportedPresidentialYear;
              navigate(workspaceNavigationHref({
                ...currentContext(),
                fips: undefined,
                tab: "map",
                year,
              }));
            }}
            value={electionYear}
          >
            {yearOptions.map((year) => <option key={year} value={year}>{year} General</option>)}
          </select>
        </label>

        <div className="workspace-context-readonly">
          <span>Contest</span>
          <strong>President</strong>
        </div>

        <label className="workspace-context-control is-wide">
          <span>Geography</span>
          <select
            aria-label="Workspace geography"
            onChange={(event) => navigate(workspaceNavigationHref({
              ...currentContext(),
              fips: event.target.value || undefined,
              tab: "map",
            }))}
            value={selectedFips}
          >
            <option value="">All {countyLabel.toLowerCase()} results</option>
            {geographies.map((geography) => (
              <option key={geography.code} value={geography.code}>{geography.name}</option>
            ))}
          </select>
        </label>

        <label className="workspace-context-control">
          <span>Map layer</span>
          <select
            aria-label="Workspace map layer"
            onChange={(event) => navigate(workspaceNavigationHref({
              ...currentContext(),
              mode: event.target.value as WorkspaceMapMode,
              tab: "map",
            }))}
            value={selectedMapMode}
          >
            {mapModeOptions.map((option) => (
              <option disabled={option.disabled} key={option.value} value={option.value}>
                {option.label}{option.disabled ? " (not available)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
