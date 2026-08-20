import type { Metadata } from "next";
import { ArrowLeft, Database, MapPinned, Ruler } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { CompareExplorer, type CompareInitialState } from "./compare-explorer";
import styles from "./compare.module.css";

export const metadata: Metadata = {
  title: "National County Swing & Flip Explorer",
  description:
    "Compare certified presidential results across 2016, 2020, and 2024 for every available U.S. county and county equivalent.",
  alternates: { canonical: "/compare" },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function initialState(params: Record<string, string | string[] | undefined>): CompareInitialState {
  return {
    fips: first(params.fips),
    direction: first(params.direction),
    from: first(params.from),
    order: first(params.order),
    page: first(params.page),
    pageSize: first(params.pageSize),
    query: first(params.q),
    sort: first(params.sort),
    state: first(params.state),
    to: first(params.to),
  };
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <span>
            <strong>Civic Result Maps</strong>
            <small>National comparison lab</small>
          </span>
        </a>
        <nav className={styles.topnav} aria-label="Primary navigation">
          <a href="/">
            <ArrowLeft aria-hidden size={15} />
            State workspace
          </a>
          <a href="/readiness">
            <Database aria-hidden size={15} />
            Data readiness
          </a>
          <a href="/district-compactness">
            <Ruler aria-hidden size={15} />
            District compactness
          </a>
          <span className={styles.domain}>civicresultmaps.org</span>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.eyebrow}>
          <MapPinned aria-hidden size={15} />
          County-level presidential comparisons
        </div>
        <h1>National Swing &amp; Flip Explorer</h1>
        <p>
          Follow the same five-digit Census county identifier across election years, inspect candidate totals and
          margins, and keep missing or non-comparable geography visible instead of silently filling it in.
        </p>
      </section>

      <CompareExplorer initialState={initialState(params)} />
    </main>
  );
}
