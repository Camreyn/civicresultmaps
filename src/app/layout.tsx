import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SiteFooter } from "./site-footer";
import "./globals.css";

import "./workspace-layout-v2.css";
import "./workspace-layout-v3.css";
const siteUrl = "https://www.civicresultmaps.org";
const siteDescription =
  "Explore source-linked 2016, 2020, and 2024 U.S. county election results, national flips, permanent county profiles, data confidence, releases, and public APIs.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Civic Result Maps",
  title: {
    default: "Civic Result Maps | County Election Comparisons and Source Data",
    template: "%s | Civic Result Maps",
  },
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
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
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
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
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
