"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  Boxes,
  Braces,
  Database,
  GitCompareArrows,
  Map,
  Menu,
  Radar,
  ShieldAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import styles from "./site-header.module.css";

export type SiteMobileNavigationLink = {
  active: boolean;
  href: string;
  id: "workspace" | "equipment" | "security" | "compare" | "evidence" | "releases" | "developers" | "readiness";
  label: string;
};

type SiteMobileNavigationProps = {
  links: SiteMobileNavigationLink[];
};

const iconById: Record<SiteMobileNavigationLink["id"], LucideIcon> = {
  workspace: Map,
  equipment: Boxes,
  security: ShieldAlert,
  compare: GitCompareArrows,
  evidence: Radar,
  releases: Archive,
  developers: Braces,
  readiness: Database,
};

export function SiteMobileNavigation({ links }: SiteMobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigationId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className={styles.mobileNavigation} ref={containerRef}>
      <button
        aria-controls={navigationId}
        aria-expanded={open}
        aria-label={open ? "Close primary navigation" : "Open primary navigation"}
        className={styles.mobileMenuButton}
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
        <span>Menu</span>
      </button>
      {open ? (
        <nav aria-label="Mobile primary navigation" className={styles.mobileMenuPanel} id={navigationId}>
          {links.map(({ active, href, id, label }) => {
            const Icon = iconById[id];
            return (
              <a
                aria-current={active ? "page" : undefined}
                data-tour={id === "equipment" ? "equipment-nav-link" : id === "readiness" ? "readiness-link" : undefined}
                href={href}
                key={id}
                onClick={() => setOpen(false)}
              >
                <Icon aria-hidden size={17} />
                <span>{label}</span>
              </a>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
