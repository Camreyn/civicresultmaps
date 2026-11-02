import { midtermEquipment, midtermSource } from "@/lib/midterm-equipment";
import { stateByCode } from "@/lib/seo-geography";
import { ElectionCycleNavigation } from "./election-cycle-navigation";
import { MidtermEquipmentTable } from "./midterm-equipment-table";
import styles from "./midterm-workspace.module.css";

export function MidtermWorkspace({ state = "NY", tab, fips }: { state?: string; tab?: string; fips?: string }) {
  const selected = stateByCode(state) ?? stateByCode("NY")!;
  const supported = selected.code === "NY";
  const activeTab = tab === "sources" || tab === "results" ? tab : "equipment";
  const href = (next: string) => `/?state=${selected.code}&year=2026&tab=${next}`;
  return (
    <main className={`app-shell ${styles.shell}`}>
      <ElectionCycleNavigation midterms state={selected.code} />
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>2026 midterms · November 3 general election</p>
          <h1>{selected.name} election workspace</h1>
          <p>A source-first start for the midterms. County equipment information is available for New York; election results are not loaded.</p>
        </div>
        <div className={styles.snapshot}><span className={styles.tag}>Equipment source snapshot</span><span>Checked <time dateTime="2026-11-02">November 2, 2026</time></span><a href={midtermSource("election-information").url}>NYSBOE election information ↗</a></div>
      </section>
      <nav aria-label="2026 workspace sections" className={styles.tabs}>
        <a aria-current={activeTab === "equipment" ? "page" : undefined} href={href("equipment")}>County equipment</a>
        <a aria-current={activeTab === "results" ? "page" : undefined} href={href("results")}>Results <span>Not loaded</span></a>
        <a aria-current={activeTab === "sources" ? "page" : undefined} href={href("sources")}>Sources & limits</a>
      </nav>
      {!supported ? (
        <section className={styles.panel}><h2>2026 coverage is starting with New York</h2><p>No 2026 equipment or result rows are loaded here for {selected.name}. We do not substitute 2024 records.</p><a className={styles.action} href="/?state=NY&year=2026&tab=equipment">Open New York county equipment →</a></section>
      ) : activeTab === "results" ? (
        <section className={styles.panel}><p className={styles.eyebrow}>Results not loaded</p><h2>Equipment information is not election results</h2><p>This workspace contains no 2026 vote totals, winners, turnout, or advisory indicators. Official result sources will need separate collection and validation. No 2024 presidential results are carried into this view.</p><a className={styles.action} href={href("equipment")}>Browse the sourced county equipment table →</a></section>
      ) : activeTab === "sources" ? (
        <section className={styles.panel}><h2>Sources & evidence boundaries</h2><p>Authority: {midtermEquipment.authority}. The pages are undated; November 2, 2026 is our observation date, not a publication or installation date.</p><ul className={styles.sources}>{midtermEquipment.sources.map((source) => <li key={source.id}><a href={source.url}>{source.title} ↗</a></li>)}</ul><h3>What this inventory does not establish</h3><ul className={styles.caveats}>{midtermEquipment.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul><p>Retained evidence is a reviewed county-list transcription, not original HTML. Direct downloads were challenged; the package records its capture method and a SHA-256 digest for reproducible normalization.</p><a className={styles.action} href="/api/midterms/equipment?state=NY&year=2026">Inspect the source-linked JSON package ↗</a></section>
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Election administration · county level</p><h2>County election equipment</h2></div><a className={styles.action} href="/api/midterms/equipment?state=NY&year=2026&format=csv" download>Download sourced CSV ↓</a></div>
          <div className={styles.notice}><strong>Official listings, not confirmed election-day deployment.</strong><p>NYSBOE’s undated pages identify system families. Exact county models, firmware, pollbooks, quantities, and polling-place uniformity are not established. Central count/audit listings are separate roles, not evidence that an audit occurred. <a href={href("sources")}>Read sources & limits →</a></p></div>
          <div className={styles.metrics}><div><strong>62 / 62</strong><span>counties with official family listings</span></div><div><strong>4</strong><span>listed system families</span></div><div><strong>24</strong><span>separate central count/audit listings</span></div></div>
          <MidtermEquipmentTable initialCounty={/^36\d{3}$/.test(fips ?? "") ? fips : ""} />
        </section>
      )}
    </main>
  );
}
