import Link from "next/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>Civic Result Maps publishes source-linked public records and highlights patterns that may warrant further review.</span>
      <nav aria-label="Site policies">
        <Link href="/privacy">Privacy</Link>
        <Link href="/developers">API</Link>
        <a href="https://github.com/Camreyn/civicresultmaps" rel="noreferrer" target="_blank">Source code</a>
      </nav>
    </footer>
  );
}
