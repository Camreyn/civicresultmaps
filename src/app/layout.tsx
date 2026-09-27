import type { Metadata } from "next";
import { homeTitle, homeDescription, siteOrigin, identityJsonLd, serializeJsonLd } from "@/lib/seo";
import { Analytics } from "@vercel/analytics/next";
import { SiteFooter } from "./site-footer";
import "./globals.css";

import "./workspace-layout-v2.css";
import "./workspace-layout-v3.css";
const siteUrl = siteOrigin;
const siteDescription = homeDescription;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Civic Result Maps",
  title: {
    default: homeTitle,
    template: "%s | Civic Result Maps",
  },
  description: siteDescription,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon/favicon.ico",
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    title: "Civic Result Maps",
    description: siteDescription,
    url: siteUrl,
    siteName: "Civic Result Maps",
    images: [{ url: "/icons/logo/crm-logo-full-lockup.svg", alt: "Civic Result Maps" }],
  },
  twitter: {
    card: "summary",
    title: "Civic Result Maps",
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(identityJsonLd) }} />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
