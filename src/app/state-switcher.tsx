"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { StateSummary } from "@/lib/types";

type StateSwitcherProps = {
  selectedState: string;
  states: StateSummary[];
};

function stateStatus(state: StateSummary) {
  if (!state.capabilities.certifiedResults) {
    return { className: "status-waiting", label: "Waiting" };
  }

  if (!state.capabilities.map) {
    return { className: "status-gap", label: "No map" };
  }

  if (!state.capabilities.reviewGraphs) {
    return { className: "status-partial", label: "Results" };
  }

  return { className: "status-ready", label: "Review" };
}

export function StateSwitcher({ selectedState, states }: StateSwitcherProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStates = useMemo(
    () =>
      states.filter((state) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          state.code.toLowerCase().includes(normalizedQuery) ||
          state.name.toLowerCase().includes(normalizedQuery) ||
          state.authority.toLowerCase().includes(normalizedQuery)
        );
      }),
    [normalizedQuery, states],
  );

  return (
    <div className="state-switcher">
      <label className="state-search" htmlFor="state-search">
        <Search aria-hidden size={16} />
        <input
          autoComplete="off"
          id="state-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or pick a state"
          type="search"
          value={query}
        />
      </label>

      <div className="state-list" data-count={filteredStates.length}>
        {filteredStates.map((state) => (
          <a
            aria-pressed={state.code === selectedState}
            href={`/?state=${state.code}`}
            className="state-button"
            key={state.code}
          >
            <div className="state-button-head">
              <strong>
                {state.name} <span className="mono">{state.code}</span>
              </strong>
              <span className={`state-status ${stateStatus(state).className}`}>{stateStatus(state).label}</span>
            </div>
            <span>{state.authority}</span>
            <div className="state-capability-row" aria-label={`${state.name} capability status`}>
              <i className={state.capabilities.certifiedResults ? "cap-on" : "cap-off"} title="Certified results" />
              <i className={state.capabilities.map ? "cap-on" : "cap-off"} title="Map geometry" />
              <i className={state.capabilities.reviewGraphs ? "cap-on" : "cap-off"} title="Review indicators" />
              <i className={state.capabilities.sourcePlanner ? "cap-on" : "cap-off"} title="Source planner" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
