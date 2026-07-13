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
    "Explore every county named in the published nationwide November 5, 2024 bomb-threat compilation, additional official county records, source limits, and exportable reports.",
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
          See all 19 counties named in the published nationwide Election Day compilation, plus an additional official
          Pima County record. Inspect source strength and export the complete mapped report without turning an unknown
          county count into zero.
        </p>
        <p className={styles.heroQualifier}>
          This layer is separate from election results and advisory indicators. It does not allege fraud,
          misconduct, altered votes, or an incorrect outcome.
        </p>
      </section>

      <SecurityExplorer report={report} />
    </main>
  );
}
