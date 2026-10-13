import { BrandMark } from "./brand-mark";
import { SiteNavigation } from "./site-mobile-navigation.client";
import { visibleSiteNavigation } from "@/lib/site-navigation";
import styles from "./site-header.module.css";

// Public destinations only: no auth, database status or page-specific controls.
export function SiteHeader({ equipmentEnabled }: { equipmentEnabled: boolean }) {
  return (
    <header id="site-toolbar" className={styles.header} data-site-header="true" data-print-hide="true" data-tour="site-header">
      <a className={styles.brand} href="/" aria-label="Civic Result Maps home">
        <BrandMark /><strong>Civic Result Maps</strong>
      </a>
      <SiteNavigation links={visibleSiteNavigation(equipmentEnabled)} />
    </header>
  );
}
