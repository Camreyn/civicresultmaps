import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { equipmentCatalogMetadata } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import { loadNationalYearDataset } from "@/lib/national-county-comparison-data";
import { getNationalSecurityIncidentReport } from "@/lib/security-incidents";
import { buildSecurityElectionOverlay } from "@/lib/security-result-overlay";
import { RouteTour } from "../route-tour";
import { SiteHeader } from "../site-header";
import { securityTourSteps } from "../tour-manifests";
import baseStyles from "../compare/compare.module.css";
import { SecurityExplorer } from "./security-explorer";
import styles from "./security.module.css";

export const dynamic = "force-static";

const securityTitle = "2024 Election Security Incident Explorer";
const securityDescription =
  "Explore 112 source-linked November 2024 election-period security records across 110 mapped counties, including at least 227 reported bomb threats, one official suspicious-package response, and 66 statewide-only threats.";
const securitySocialImage = "/api/social-card?view=security&year=2024&v=security-v2";
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
    images: [{ url: securitySocialImage, width: 1200, height: 630, alt: securitySocialImageAlt }],
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
  const electionOverlay = buildSecurityElectionOverlay(report.incidents, await loadNationalYearDataset(2024));
  const equipmentEnabled = isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady });

  return (
    <main className={baseStyles.shell}>
      <SiteHeader
        activePage="security"
        equipmentEnabled={equipmentEnabled}
        subtitle="Election security records"
        tourId="security"
      />
      <RouteTour steps={securityTourSteps} tourId="security" />

      <section className={baseStyles.hero} data-print-hide="true" data-tour="security-hero">
        <div className={baseStyles.eyebrow}>
          <ShieldAlert aria-hidden size={15} />
          Source-linked administration context
        </div>
        <h1>2024 Election Security Incident Explorer</h1>
        <p>
          Explore the Brennan Center&apos;s later tracker of at least 227 bomb threats reported from November 5 through
          November 9, 2024, plus an official Hamilton County suspicious-package response that is counted separately.
          The map shows 110 source-linked counties; 66 additional threats reported only at statewide grain remain in
          the totals without being assigned to a county.
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
