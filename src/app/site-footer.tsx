import { siteNavigation } from "@/lib/site-navigation";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>Civic Result Maps publishes source-linked public records and highlights patterns that may warrant further review.</span>
      <nav aria-label="Site navigation and policies">
        {siteNavigation.filter(({ id }) => ["elections", "states", "counties", "datasets", "connections", "news", "privacy", "developers"].includes(id))
          .map(({ id, href, label }) => <a key={id} href={href}>{label}</a>)}
        <a href="https://github.com/Camreyn/civicresultmaps" rel="noreferrer" target="_blank">Source code</a>
      </nav>
    </footer>
  );
}
