"use client";

import { MapPinned, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

const stateRailStorageKey = "crm-state-rail-collapsed";

type StateRailProps = {
  children: ReactNode;
  loadedCount: number;
  selectedState: string;
};

export function StateRail({ children, loadedCount, selectedState }: StateRailProps) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(stateRailStorageKey) === "true");
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(stateRailStorageKey, String(next));
      return next;
    });
  };

  return (
    <>
      <button
        aria-controls={contentId}
        aria-expanded={mobileOpen}
        className="state-rail-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        type="button"
      >
        <PanelLeftOpen aria-hidden size={17} />
        <span>Choose a state</span>
        <strong>{selectedState}</strong>
      </button>

      {mobileOpen && (
        <button
          aria-label="Close state selector"
          className="state-rail-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      )}

      <aside
        aria-label="State coverage"
        className={`sidebar state-rail ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
        data-tour="state-sidebar"
      >
        <div className="sidebar-header">
          <div className="state-rail-heading">
            <p className="section-label">States</p>
            <span>{loadedCount} loaded</span>
          </div>
          <button
            aria-controls={contentId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand state selector" : "Collapse state selector"}
            className="state-rail-collapse-button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand states" : "Collapse states"}
            type="button"
          >
            {collapsed ? <PanelLeftOpen aria-hidden size={17} /> : <PanelLeftClose aria-hidden size={17} />}
          </button>
          <button
            aria-label="Close state selector"
            className="state-rail-mobile-close"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        <button
          aria-label={`Expand state selector. ${selectedState} is selected.`}
          className="state-rail-collapsed-summary"
          onClick={toggleCollapsed}
          type="button"
        >
          <MapPinned aria-hidden size={19} />
          <strong>{selectedState}</strong>
          <span>{loadedCount}</span>
        </button>

        <div className="state-rail-content" id={contentId}>
          {children}
        </div>
      </aside>
    </>
  );
}
