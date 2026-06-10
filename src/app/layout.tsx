import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://civicresultmaps.org"),
  title: "Civic Result Maps",
  description: "Database-backed election result maps, provenance, public APIs, and ETL coverage.",
  openGraph: {
    title: "Civic Result Maps",
    description: "Explore election results with source provenance and API-ready data.",
    url: "https://civicresultmaps.org",
    siteName: "Civic Result Maps",
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
        <Analytics />
      </body>
    </html>
  );
}
