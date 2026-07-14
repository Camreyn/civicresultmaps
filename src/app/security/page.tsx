import type { Metadata } from "next";
import { ArrowLeft, GitCompareArrows, ShieldAlert } from "lucide-react";
import { getNationalSecurityIncidentReport } from "@/lib/security-incidents";
import { BrandMark } from "../brand-mark";
import baseStyles from "../compare/compare.module.css";
import { SecurityExplorer } from "./security-explorer";
import styles from "./security.module.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "2024 Election Security Incident Explorer",
  description:
    "Explore the later nationwide 227-threat public-source tracker for the November 2024 election period, mapped county records, statewide-unallocated counts, source limits, and exportable reports.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  const report = getNationalSecurityIncidentReport(2024);

  return (
    <main className={baseStyles.shell}>
      <header className={baseStyles.topbar} data-print-hide="true">
        <a className={baseStyles.brand} href="/">
          <BrandMark />
          <span>
            <strong>Civic Result Maps</strong>
            <small>Election security records</small>
          </span>
        </a>
        <nav className={baseStyles.topnav} aria-label="Primary navigation">
          <a href="/">
            <ArrowLeft aria-hidden size={15} />
            State workspace
          </a>
          <a href="/compare">
            <GitCompareArrows aria-hidden size={15} />
            Compare
          </a>
          <span className={baseStyles.domain}>civicresultmaps.org</span>
        </nav>
      </header>

      <section className={baseStyles.hero} data-print-hide="true">
        <div className={baseStyles.eyebrow}>
          <ShieldAlert aria-hidden size={15} />
          Source-linked administration context
        </div>
        <h1>2024 Election Security Incident Explorer</h1>
        <p>
          Explore the Brennan Center&apos;s later tracker of at least 227 threats reported from November 5 through
          November 9, 2024. The map shows 109 source-linked counties; 66 additional threats reported only at statewide
          grain remain in the totals without being assigned to a county.
        </p>
        <p className={styles.heroQualifier}>
          The tracker compiles public reports, may not be exhaustive, and is not an official FBI roster. This layer is
          separate from election results and advisory indicators and does not allege fraud, misconduct, altered votes,
          or an incorrect outcome.
        </p>
      </section>

      <SecurityExplorer report={report} />
    </main>
  );
}
