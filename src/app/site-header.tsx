import {
  Archive,
  Boxes,
  Braces,
  Database,
  GitCompareArrows,
  Map,
  Radar,
  ShieldAlert,
} from "lucide-react";

import { BrandMark } from "./brand-mark";
import { TourLaunchButton } from "./tour-launch-button";
import styles from "./site-header.module.css";

type SitePage = "workspace" | "equipment" | "security" | "compare" | "evidence" | "releases" | "developers" | "readiness";

export function SiteHeader({
  activePage,
  equipmentEnabled,
  live = false,
  subtitle,
  tourId,
}: {
  activePage: SitePage;
  equipmentEnabled: boolean;
  live?: boolean;
  subtitle: string;
  tourId?: string;
}) {
  const links = [
    { id: "workspace", href: "/", label: "Results map", icon: Map },
    ...(equipmentEnabled ? [{ id: "equipment", href: "/equipment", label: "U.S. Equipment", icon: Boxes }] : []),
    { id: "security", href: "/security", label: "Security", icon: ShieldAlert },
    { id: "compare", href: "/compare", label: "Compare", icon: GitCompareArrows },
    { id: "evidence", href: "/evidence", label: "Evidence", icon: Radar },
    { id: "releases", href: "/releases", label: "Releases", icon: Archive },
    { id: "developers", href: "/developers", label: "API", icon: Braces },
    { id: "readiness", href: "/readiness", label: "Readiness", icon: Database },
  ] as const;

  return (
    <header className={styles.header} data-print-hide="true" data-tour="site-header">
      <a className={styles.brand} href="/">
        <BrandMark />
        <span><strong>Civic Result Maps</strong><small>{subtitle}</small></span>
      </a>
      <div className={styles.navigation}>
        <nav aria-label="Primary navigation" className={styles.links}>
          {links.map(({ href, icon: Icon, id, label }) => (
            <a
              aria-label={label}
              aria-current={activePage === id ? "page" : undefined}
              data-tour={id === "equipment" ? "equipment-nav-link" : id === "readiness" ? "readiness-link" : undefined}
              href={href}
              key={id}
            >
              <Icon aria-hidden size={14} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.utility}>
          {tourId ? <TourLaunchButton tourId={tourId} /> : null}
          {live ? <span className={styles.live}>Database live</span> : null}
        </div>
      </div>
    </header>
  );
}
