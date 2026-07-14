import type { Metadata } from "next";
import { ArrowLeft, GitCompareArrows, ShieldAlert } from "lucide-react";
import { loadNationalYearDataset } from "@/lib/national-county-comparison-data";
import { getNationalSecurityIncidentReport } from "@/lib/security-incidents";
import { buildSecurityElectionOverlay } from "@/lib/security-result-overlay";
import { BrandMark } from "../brand-mark";
import baseStyles from "../compare/compare.module.css";
import { SecurityExplorer } from "./security-explorer";
import styles from "./security.module.css";

export const dynamic = "force-static";

const securityTitle = "2024 Election Security Incident Explorer";
const securityDescription =
  "Explore at least 227 source-linked November 2024 election-period bomb threats across 109 mapped counties, with 2024 presidential winner and margin overlays, 66 statewide-only threats, and source limits.";
const securitySocialImage = "/api/social-card?view=security&year=2024&v=security-v1";
const securitySocialImageAlt =
  "Civic Result Maps 2024 Election Security Incident Explorer with mapped county records and a presidential result overlay";

export const metadata: Metadata = {
  title: securityTitle,
  description: securityDescription,
  alternates: { canonical: "/security" },
  openGraph: {
    type: "website",
    title: securityTitle,
    description: securityDescription,
    url: "/security",
    siteName: "Civic Result Maps",
    images: [{
      url: securitySocialImage,
      width: 1200,
      height: 630,
      alt: securitySocialImageAlt,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: securityTitle,
    description: securityDescription,
    images: [{ url: securitySocialImage, alt: securitySocialImageAlt }],
  },
};

export default async function SecurityPage() {
  const report = getNationalSecurityIncidentReport(2024);
  const electionOverlay = buildSecurityElectionOverlay(
    report.incidents,
    await loadNationalYearDataset(2024),
  );

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
          The tracker compiles public reports, may not be exhaustive, and is not an official FBI roster. Incident records
          and election results remain separate datasets; the optional county-FIPS overlay is geographic context only and
          does not allege a relationship, fraud, misconduct, altered votes, or an incorrect outcome.
        </p>
      </section>

      <SecurityExplorer electionOverlay={electionOverlay} report={report} />
    </main>
  );
}
