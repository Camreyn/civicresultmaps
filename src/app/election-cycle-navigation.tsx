import styles from "./midterm-workspace.module.css";

export function ElectionCycleNavigation({ midterms = false, state = "NY" }: { midterms?: boolean; state?: string }) {
  return (
    <nav aria-label="Election cycle" className={styles.cycleNav}>
      <span>Explore elections</span>
      <a aria-current={!midterms ? "page" : undefined} href={`/?state=${state}&year=2024&tab=map`}>Presidential results · 2012–2024</a>
      <a aria-current={midterms ? "page" : undefined} href="/?state=NY&year=2026&tab=equipment">2026 midterms <span className={styles.tag}>New York first</span></a>
    </nav>
  );
}
