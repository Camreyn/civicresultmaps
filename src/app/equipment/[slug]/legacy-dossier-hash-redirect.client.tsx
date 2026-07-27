"use client";

import { useEffect } from "react";

const legacySectionByHash: Record<string, string> = {
  "#equipment-explorer": "components",
  "#equipment-network-evidence": "network",
  "#equipment-version-evidence": "history",
  "#equipment-usage": "usage",
  "#equipment-source-manifest": "sources",
};

type LegacyDossierHashRedirectProps = {
  slug: string;
};

export function LegacyDossierHashRedirect({ slug }: LegacyDossierHashRedirectProps) {
  useEffect(() => {
    const section = legacySectionByHash[window.location.hash];
    if (!section) return;
    const destination = `/equipment/${slug}/${section}${window.location.search}${window.location.hash}`;
    window.location.replace(destination);
  }, [slug]);

  return null;
}
