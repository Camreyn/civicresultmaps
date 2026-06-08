"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { StateSummary } from "@/lib/types";

type StateSwitcherProps = {
  selectedState: string;
  states: StateSummary[];
};

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
      <label className="state-select-label" htmlFor="state-select">
        Jump to state
      </label>
      <select
        className="state-select"
        id="state-select"
        onChange={(event) => {
          window.location.href = `/?state=${event.target.value}`;
        }}
        value={selectedState}
      >
        {states.map((state) => (
          <option key={state.code} value={state.code}>
            {state.name} ({state.code})
          </option>
        ))}
      </select>

      <label className="state-search" htmlFor="state-search">
        <Search aria-hidden size={16} />
        <input
          autoComplete="off"
          id="state-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search states"
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
            <strong>
              {state.name} <span className="mono">{state.code}</span>
            </strong>
            <span>{state.authority}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
